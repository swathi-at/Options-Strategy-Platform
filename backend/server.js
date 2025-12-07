// ==================================================================
// 1. IMPORTS & SETUP
// ==================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const otpauth = require('otpauth');
const crypto = require('crypto');
const fs = require('fs'); 
const path = require('path'); 
const readline = require('readline'); // NEW: Required for CSV parsing
const { fyersModel, fyersDataSocket } = require("fyers-api-v3");
const { calculateStrategy } = require('./strategyengine'); 
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// ==================================================================
// 2. GLOBAL CONFIGURATION & STATE
// ==================================================================
const liveDataCache = {}; 
const CACHE_DURATION_MS = 20 * 1000; 
const LOG_FILE_PATH = path.join(__dirname, 'trade_logs.csv');

const FYERS_APP_ID = process.env.FYERS_CLIENT_ID;
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_TOTP_KEY = process.env.FYERS_TOTP_KEY;
const FYERS_PIN = process.env.FYERS_PIN;
const FYERS_FY_ID = process.env.FYERS_FY_ID;
const FYERS_REDIRECT_URI = process.env.FYERS_REDIRECT_URI || 'https://www.google.com/';
const FYERS_API_BASE_URL_V2 = 'https://api-t2.fyers.in/vagator/v2';
const FYERS_API_DATA_URL_V3 = 'https://api-t1.fyers.in/data';

// Global Storage for Lot Sizes
const DYNAMIC_LOT_SIZES = {};

// Default Fallbacks (Just in case CSV fetch fails)
const FALLBACK_LOT_SIZES = {
    'NIFTY': 75,
    'BANKNIFTY': 15,     
    'FINNIFTY': 25,
    'MIDCPNIFTY': 50,
    'SENSEX': 10
};

let fyersAccessToken = null;
let fyersAppId = null; 
let isAlgoRunning = false;
let livePositions = []; 
let candleHistory = [];
let currentCandle = null;
let algoState = { symbol: "NSE:NIFTY50-INDEX", interval: 1, qty: 1, isInTrade: false };

let fyersSocket = null; 

const fyersLoginInstance = new fyersModel();
if (FYERS_APP_ID) {
    fyersLoginInstance.setAppId(FYERS_APP_ID);
    console.log("Fyers App ID set.");
} else {
    console.error("CRITICAL ERROR: FYERS_CLIENT_ID not found in .env file!");
}

function getEncodedString(string) {
    return Buffer.from(String(string)).toString('base64');
}

function logTradeToCSV(tradeData) {
    const headers = "Date,StartTime,EndTime,Instrument,Signal,Strategy,SpotPrice,Strike,EntryPrice,ExitPrice,PnL,Reason\n";
    if (!fs.existsSync(LOG_FILE_PATH)) {
        fs.writeFileSync(LOG_FILE_PATH, headers);
    }
    const row = `${new Date().toLocaleDateString()},${tradeData.startTime},${tradeData.endTime},${tradeData.instrument},${tradeData.signal},${tradeData.strategy},${tradeData.spot},${tradeData.strike},${tradeData.buyPrice.toFixed(2)},${tradeData.exitPrice.toFixed(2)},${tradeData.pnl.toFixed(2)},${tradeData.reason}\n`;
    fs.appendFileSync(LOG_FILE_PATH, row);
    console.log("📝 Trade Logged to CSV:", row.trim());
}

// ==================================================================
// 3. LOT SIZE HELPERS (NEW SECTION)
// ==================================================================

// --- LIVE LOT SIZE FETCHER ---
async function fetchLiveLotSizes() {
    console.log("📥 Fetching Live Lot Sizes from Fyers Master CSV...");
    try {
        const response = await axios({
            method: 'get',
            url: 'https://public.fyers.in/sym_details/NSE_FO.csv',
            responseType: 'stream'
        });

        const rl = readline.createInterface({
            input: response.data,
            crlfDelay: Infinity
        });

        let count = 0;
        for await (const line of rl) {
            const cols = line.split(',');
            // CSV Structure usually: ..., LotSize(col 3), ..., Symbol(col 9), ...
            // Adjust indices based on actual CSV format check if needed. 
            // Based on standard Fyers CSV: Column 3 is LotSize, Column 13 is Symbol details, or Column 9 is Symbol.
            // Let's stick to your provided logic which worked for you:
            if (cols.length > 9) {
                const symbolCode = cols[9]; // Symbol
                const lotSize = parseInt(cols[3]); // Lot Size

                if (symbolCode && !isNaN(lotSize)) {
                    let rootSymbol = "";
                    if (symbolCode.includes('NIFTY') && !symbolCode.includes('BANK') && !symbolCode.includes('FIN') && !symbolCode.includes('MID')) rootSymbol = 'NIFTY';
                    else if (symbolCode.includes('BANKNIFTY')) rootSymbol = 'BANKNIFTY';
                    else if (symbolCode.includes('FINNIFTY')) rootSymbol = 'FINNIFTY';
                    else if (symbolCode.includes('MIDCPNIFTY')) rootSymbol = 'MIDCPNIFTY';
                    else {
                        // Extract Stock Name for equities e.g., "NSE:SBIN-EQ" or "NSE:SBIN24OCT..."
                        const match = symbolCode.match(/NSE:([A-Z]+)/);
                        if (match) rootSymbol = match[1];
                    }

                    if (rootSymbol && lotSize > 0) {
                        // Only set if not already set or overwrite (usually all expiries have same lot size)
                        if (!DYNAMIC_LOT_SIZES[rootSymbol]) {
                            DYNAMIC_LOT_SIZES[rootSymbol] = lotSize;
                            count++;
                        }
                    }
                }
            }
        }
        DYNAMIC_LOT_SIZES['SENSEX'] = 10; 
        DYNAMIC_LOT_SIZES['BANKEX'] = 15;
        console.log(`✅ Live Lot Sizes Loaded for ${Object.keys(DYNAMIC_LOT_SIZES).length} symbols.`);
        // console.log("Sample:", DYNAMIC_LOT_SIZES['NIFTY'], DYNAMIC_LOT_SIZES['BANKNIFTY'], DYNAMIC_LOT_SIZES['SBIN']);
    } catch (error) {
        console.error("❌ Failed to fetch Live Lot Sizes:", error.message);
    }
}

function getLotSizeForSymbol(symbol) {
    if (!symbol) return 1;
    let key = symbol.toUpperCase();
    
    // Clean up symbol to get the "Root" name (e.g., NSE:SBIN-EQ -> SBIN)
    if (key.includes('NSE:') && key.includes('-EQ')) key = key.split(':')[1].replace('-EQ', '');
    else if (key.includes('NSE:')) key = key.replace('NSE:', '').split('-')[0];
    
    if (key.includes('SENSEX')) key = 'SENSEX';
    if (key === 'NIFTY 50' || (key.includes('NIFTY') && !key.includes('BANK') && !key.includes('FIN') && !key.includes('MID'))) key = 'NIFTY';
    if (key.includes('BANKNIFTY')) key = 'BANKNIFTY';
    if (key.includes('FINNIFTY')) key = 'FINNIFTY';
    if (key.includes('MIDCPNIFTY')) key = 'MIDCPNIFTY';

    // 1. Try Dynamic Map
    if (DYNAMIC_LOT_SIZES[key]) return DYNAMIC_LOT_SIZES[key];
    
    // 2. Try Hardcoded Fallback
    if (FALLBACK_LOT_SIZES[key]) return FALLBACK_LOT_SIZES[key];

    return 1; // Default
}

// CALL THIS ON SERVER START
fetchLiveLotSizes();

// ==================================================================
// 4. UI DASHBOARD WEBSOCKET
// ==================================================================
const wss = new WebSocketServer({ port: 8080 });
let uiClients = new Set(); 

wss.on('connection', (ws) => {
    console.log('✅ UI Dashboard Connected');
    uiClients.add(ws);
    if(candleHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'HISTORY', data: candleHistory }));
    }
    ws.send(JSON.stringify({ type: 'STATUS', message: 'Connected to Bot Server.' }));
    ws.on('close', () => { uiClients.delete(ws); });
});

function broadcast(data) {
    const message = JSON.stringify(data);
    uiClients.forEach(client => { if (client.readyState === 1) client.send(message); });
}

console.log('UI Dashboard WebSocket Server started on port 8080.');

// ==================================================================
// 5. LOGIC: GREEKS CALCULATOR
// ==================================================================
function normalcdf(X) {
    if (typeof X !== 'number' || isNaN(X)) return 0;
    var T = 1 / (1 + 0.2316419 * Math.abs(X));
    var D = 0.39894228 * Math.exp(-X * X / 2);
    var Prob = D * T * (0.31938153 + T * (-0.356563782 + T * (1.781477937 + T * (-1.821255978 + T * 1.330274429))));
    if (X > 0) Prob = 1 - Prob;
    return Prob;
}

function pdf(x) {
    if (typeof x !== 'number' || isNaN(x)) return 0;
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function calculateGreeks(s, k, t, v, r, type) {
    s = parseFloat(s); k = parseFloat(k); t = parseFloat(t); v = parseFloat(v);
    if (!s || !k) return { delta: 0, theta: 0, gamma: 0, vega: 0, iv: 0 };
    if (t <= 0.002) t = 0.002; 
    if (v <= 0) v = 0.15;

    try {
        const d1 = (Math.log(s / k) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
        const d2 = d1 - v * Math.sqrt(t);
        let delta, theta;
        const gamma = pdf(d1) / (s * v * Math.sqrt(t));
        const vega = (s * pdf(d1) * Math.sqrt(t)) / 100;

        if (type === 'CE') {
            delta = normalcdf(d1);
            theta = (- (s * pdf(d1) * v) / (2 * Math.sqrt(t)) - r * k * Math.exp(-r * t) * normalcdf(d2)) / 365;
        } else {
            delta = normalcdf(d1) - 1;
            theta = (- (s * pdf(d1) * v) / (2 * Math.sqrt(t)) + r * k * Math.exp(-r * t) * normalcdf(-d2)) / 365;
        }
        return { 
            delta: isNaN(delta) ? 0 : delta, theta: isNaN(theta) ? 0 : theta, 
            gamma: isNaN(gamma) ? 0 : gamma, vega: isNaN(vega) ? 0 : vega, iv: v * 100 
        };
    } catch (e) { return { delta: 0, theta: 0, gamma: 0, vega: 0, iv: 0 }; }
}

function estimateGreeks(spot, strike, daysToExpiry, premium, type, vix) {
    const days = (daysToExpiry && daysToExpiry > 0.5) ? daysToExpiry : 1; 
    const t = days / 365; const r = 0.10; const iv = (vix || 15) / 100;
    return calculateGreeks(spot, strike, t, iv, r, type);
}

// ==================================================================
// 6. LOGIC: STRATEGY DEPLOYER
// ==================================================================
function detectATMStrike(strikes, spot) {
    return strikes.reduce((prev, curr) => Math.abs(curr - spot) < Math.abs(prev - spot) ? curr : prev);
}

function chooseStrikeByDelta(chain, side, targetDelta, atmIndex) {
    const start = Math.max(0, atmIndex - 6);
    const end = Math.min(chain.length - 1, atmIndex + 6);
    let best = null; let bestDiff = Infinity;

    for (let i = start; i <= end; i++) {
        const s = chain[i];
        const g = (side === 'CE') ? s.CE_Greeks : s.PE_Greeks;
        if (!g || typeof g.delta === 'undefined') continue;
        const diff = Math.abs(Math.abs(g.delta) - Math.abs(targetDelta));
        if (diff < bestDiff) {
            bestDiff = diff; 
            best = { 
                strike: s.strike, 
                greeks: g, 
                price: (side === 'CE' ? s.CE_Ltp : s.PE_Ltp),
                symbol: (side === 'CE' ? s.CE_Symbol : s.PE_Symbol)
            };
        }
    }
    return best; 
}

function buildCandidate(chain, atmIndex, stratName) {
    const candidate = { name: stratName, legs: [], meta: {} };
    if (stratName === 'Bull Call Spread') {
        const buy = chooseStrikeByDelta(chain, 'CE', 0.5, atmIndex);
        const sell = chooseStrikeByDelta(chain, 'CE', 0.25, atmIndex);
        if (!buy || !sell) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: buy.strike, price: buy.price, greeks: buy.greeks, symbol: buy.symbol });
        candidate.legs.push({ role: 'SELL', optionType: 'CE', strike: sell.strike, price: sell.price, greeks: sell.greeks, symbol: sell.symbol });
        candidate.meta.description = `Buy ${buy.strike} CE, Sell ${sell.strike} CE`;
        return candidate;
    }
    if (stratName === 'Bear Put Spread') {
        const buy = chooseStrikeByDelta(chain, 'PE', 0.5, atmIndex); 
        const sell = chooseStrikeByDelta(chain, 'PE', 0.25, atmIndex); 
        if (!buy || !sell) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: buy.strike, price: buy.price, greeks: buy.greeks, symbol: buy.symbol });
        candidate.legs.push({ role: 'SELL', optionType: 'PE', strike: sell.strike, price: sell.price, greeks: sell.greeks, symbol: sell.symbol });
        candidate.meta.description = `Buy ${buy.strike} PE, Sell ${sell.strike} PE`;
        return candidate;
    }
    if (stratName === 'Iron Condor') {
        const sellCall = chooseStrikeByDelta(chain, 'CE', 0.16, atmIndex);
        const sellPut = chooseStrikeByDelta(chain, 'PE', 0.16, atmIndex);
        if (!sellCall || !sellPut) return null;
        const buyCallIdx = Math.min(chain.length - 1, (chain.findIndex(x => x.strike === sellCall.strike) + 2));
        const buyPutIdx = Math.max(0, (chain.findIndex(x => x.strike === sellPut.strike) - 2));
        const buyCall = chain[buyCallIdx];
        const buyPut = chain[buyPutIdx];
        if (!buyCall || !buyPut) return null;
        candidate.legs.push({ role: 'SELL', optionType: 'CE', strike: sellCall.strike, price: sellCall.price, greeks: sellCall.greeks, symbol: sellCall.symbol });
        candidate.legs.push({ role: 'SELL', optionType: 'PE', strike: sellPut.strike, price: sellPut.price, greeks: sellPut.greeks, symbol: sellPut.symbol });
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: buyCall.strike, price: buyCall.CE_Ltp, greeks: buyCall.CE_Greeks, symbol: buyCall.CE_Symbol });
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: buyPut.strike, price: buyPut.PE_Ltp, greeks: buyPut.PE_Greeks, symbol: buyPut.PE_Symbol });
        candidate.meta.description = `Iron Condor: Short ${sellCall.strike} CE / ${sellPut.strike} PE`;
        return candidate;
    }
    if (stratName === 'Long Straddle') {
        const atm = chain[atmIndex];
        if (!atm) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: atm.strike, price: atm.CE_Ltp, greeks: atm.CE_Greeks, symbol: atm.CE_Symbol });
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: atm.strike, price: atm.PE_Ltp, greeks: atm.PE_Greeks, symbol: atm.PE_Symbol });
        candidate.meta.description = `Long Straddle @ ${atm.strike}`;
        return candidate;
    }
    return null;
}

function decideStrategy(signal, spot, daysToExpiry, optionChain, vix, config = {}) {
    let candidatesToTry = [];
    const VIX_HIGH = 18; 
    
    if (daysToExpiry >= 4) {
        if (signal.direction === 'BULL') candidatesToTry = ['Bull Call Spread'];
        else if (signal.direction === 'BEAR') candidatesToTry = ['Bear Put Spread'];
        else {
            if (vix > VIX_HIGH) candidatesToTry = ['Long Straddle']; 
            else candidatesToTry = ['Iron Condor'];
        }
    } else {
        if (signal.direction === 'BULL') candidatesToTry = ['Bull Call Spread'];
        else if (signal.direction === 'BEAR') candidatesToTry = ['Bear Put Spread'];
        else candidatesToTry = ['Iron Condor'];
    }

    const strikesList = optionChain.map(c => c.strike);
    const atm = detectATMStrike(strikesList, spot);
    const atmIndex = strikesList.indexOf(atm);
    if (atmIndex === -1) return { decision: 'SKIP', reason: 'ATM Strike not found' };

    const built = [];
    for (const sname of candidatesToTry) {
        const candidate = buildCandidate(optionChain, atmIndex, sname);
        if (!candidate) continue;
        let score = 50; 
        if (sname.includes('Spread')) score += 20; 
        if (sname.includes('Condor') && vix < 15) score += 30; 
        candidate.score = score;
        built.push(candidate);
    }
    built.sort((a,b) => b.score - a.score);
    const chosen = built.length ? built[0] : null;
    if (chosen) return { decision: 'PLACE', strategy: chosen.name, legs: chosen.legs, meta: chosen.meta, score: chosen.score };
    return { decision: 'SKIP', reason: `No valid candidates found for ${signal.direction}` };
}

// ==================================================================
// 7. AUTH ROUTES
// ==================================================================
app.post('/api/fyers/login', async (req, res) => {
    try {
        console.log("Starting Login...");
        const otpUrl = `${FYERS_API_BASE_URL_V2}/send_login_otp_v2`;
        const otpRes = await axios.post(otpUrl, { fy_id: getEncodedString(FYERS_FY_ID), app_id: "2" }, { headers: { 'Content-Type': 'application/json' } });
        const requestKeyOTP = otpRes.data?.request_key;
        if (!requestKeyOTP) throw new Error("Step 1 Failed");

        let totp = new otpauth.TOTP({ issuer: "Fyers", label: "Fyers", algorithm: "SHA1", digits: 6, period: 30, secret: FYERS_TOTP_KEY });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const verifyOtpRes = await axios.post(`${FYERS_API_BASE_URL_V2}/verify_otp`, { request_key: requestKeyOTP, otp: totp.generate() });
        const requestKeyPin = verifyOtpRes.data?.request_key;
        if (!requestKeyPin) throw new Error("Step 2 Failed");

        const session = axios.create();
        const verifyPinRes = await session.post(`${FYERS_API_BASE_URL_V2}/verify_pin_v2`, { request_key: requestKeyPin, identity_type: "pin", identifier: getEncodedString(FYERS_PIN) });
        const intermediateAccessToken = verifyPinRes.data?.data?.access_token;
        if (!intermediateAccessToken) throw new Error("Step 3 Failed");

        const appIdForToken = FYERS_APP_ID.endsWith('-100') ? FYERS_APP_ID.substring(0, FYERS_APP_ID.length - 4) : FYERS_APP_ID;
        session.defaults.headers.common['Authorization'] = `Bearer ${intermediateAccessToken}`;
        const tokenRes = await session.post(`https://api-t1.fyers.in/api/v3/token`, { fyers_id: FYERS_FY_ID, app_id: appIdForToken, redirect_uri: FYERS_REDIRECT_URI, appType: "100", code_challenge: "", state: "None", scope: "", nonce: "", response_type: "code", create_cookie: true }, { validateStatus: s => s < 400 });
        const authCodeUrl = tokenRes.data?.Url;
        if (!authCodeUrl) throw new Error("Step 4 Failed");
        const authCode = authCodeUrl.split('auth_code=')[1]?.split('&')[0];

        const hashCreator = crypto.createHash('sha256');
        hashCreator.update(`${FYERS_APP_ID}:${FYERS_SECRET_KEY}`);
        const finalTokenRes = await axios.post(`https://api-t1.fyers.in/api/v3/validate-authcode`, { grant_type: 'authorization_code', code: authCode, appIdHash: hashCreator.digest('hex') }, { headers: { 'Content-Type': 'application/json' } });

        if (finalTokenRes.data?.access_token) {
            fyersAccessToken = finalTokenRes.data.access_token;
            fyersAppId = FYERS_APP_ID;
            fyersLoginInstance.setAccessToken(fyersAccessToken);
            console.log("✅ LOGIN SUCCESS!");
            startAlgoSystem();
            res.json({ success: true, message: "Login Successful.", accessToken: fyersAccessToken });
        } else { throw new Error("Step 5 Failed"); }
    } catch (error) {
        console.error("Login Error:", error.message);
        res.status(500).json({ success: false, error: "Login Failed", details: error.message });
    }
});

// ==================================================================
// 8. ALGO & DATA HELPERS
// ==================================================================
function startAlgoSystem() {
    if (isAlgoRunning) return;
    if (!fyersAccessToken) return;
    isAlgoRunning = true; 
    startWebSocketBrain();
    startAlgoManager();
}

function startWebSocketBrain() {
    console.log(`💡 ALGO BRAIN: Initializing WebSocket...`);
    fyersSocket = fyersDataSocket.getInstance(`${fyersAppId}:${fyersAccessToken}`, "."); 
    fyersSocket.on("connect", () => {
        console.log("✅ Brain Connected");
        fyersSocket.subscribe([algoState.symbol]);
        fyersSocket.mode(fyersSocket.FullMode); 
    });
    fyersSocket.on("message", (msg) => {
        if (msg.symbol === algoState.symbol && msg.ltp) processTick(msg.ltp, msg.exch_feed_time);
    });
    fyersSocket.connect();
    fyersSocket.autoreconnect(); 
}

function processTick(ltp, time) {
    const date = new Date(time * 1000);
    const minutes = Math.floor(date.getMinutes() / algoState.interval) * algoState.interval;
    date.setMinutes(minutes, 0, 0); 
    const candleTime = Math.floor(date.getTime() / 1000);
    
    if (!currentCandle) {
        currentCandle = { time: candleTime, open: ltp, high: ltp, low: ltp, close: ltp };
    } else if (candleTime === currentCandle.time) {
        currentCandle.high = Math.max(currentCandle.high, ltp);
        currentCandle.low = Math.min(currentCandle.low, ltp);
        currentCandle.close = ltp;
        broadcast({ type: 'TICK', candle: currentCandle });
    } else {
        broadcast({ type: 'CANDLE', message: `Candle Closed @ ${currentCandle.close}`, candle: currentCandle });
        candleHistory.push(currentCandle);
        if (candleHistory.length > 100) candleHistory.shift();
        runSignalLogic(); 
        currentCandle = { time: candleTime, open: ltp, high: ltp, low: ltp, close: ltp };
    }
}

async function runSignalLogic() {
    if (algoState.isInTrade || candleHistory.length < 25) return;
    const closes = candleHistory.map(c => c.close);
    const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const sma25 = closes.slice(-25).reduce((a, b) => a + b, 0) / 25;
    const prevCloses = closes.slice(0, -1);
    const prevSma7 = prevCloses.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const prevSma25 = prevCloses.slice(-26, -1).reduce((a, b) => a + b, 0) / 25;
    broadcast({ type: 'STATUS', message: `SMA7: ${sma7.toFixed(2)} | SMA25: ${sma25.toFixed(2)}` });
}

function startAlgoManager() {
    setInterval(async () => {
        if (!fyersAccessToken || livePositions.length === 0) return;
        try {
            const pos = livePositions[0]; 
            const quoteSymbol = pos.instrument || pos.symbol; 
            
            const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, { params: { symbols: quoteSymbol }, headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` } });
            const ltp = quotesRes.data.d?.[0]?.v?.lp;
            if (!ltp) return; 
            
            const pnl = (ltp - pos.buyPrice) * pos.qty;
            const pnlPercent = ((ltp - pos.buyPrice) / pos.buyPrice) * 100;
            
            broadcast({ type: 'PNL_UPDATE', pnl: pnl, ltp: ltp, trade: pos, pnlPercent: pnlPercent });
            
            let exitReason = null;
            if (ltp >= (pos.buyPrice * 1.10)) {
                exitReason = "TARGET (10%)";
            } else if (ltp <= (pos.buyPrice * 0.80)) {
                exitReason = "STOP LOSS (20%)";
            }

            if (exitReason) {
                console.log(`[SIMULATION] Trade Closed: ${exitReason}`);
                
                const tradeRecord = {
                    ...pos,
                    endTime: new Date().toLocaleTimeString(),
                    exitPrice: ltp,
                    pnl: pnl,
                    reason: exitReason
                };
                logTradeToCSV(tradeRecord);
                
                livePositions = []; algoState.isInTrade = false; 
                broadcast({ type: 'TRADE_CLOSE', message: `Trade Closed: ${exitReason}` });
            }
        } catch (e) { console.error("Manager Error", e.message); }
    }, 2000); 
}

async function placeLiveOrder(symbol, qty, side, isAMO = false) {
    const fyers = new fyersModel();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);
    let payload = { symbol, qty, type: 2, side, productType: "INTRADAY", validity: "DAY" };
    if (isAMO) { payload.type = 1; payload.limitPrice = 100; payload.productType = "CNC"; payload.offlineOrder = true; }
    console.log(`🚀 PLACING ORDER: ${side===1?'BUY':'SELL'} ${qty} ${symbol}`);
    return await fyers.place_order(payload);
}

// Replaced fetchStockLotSize with the generic getLotSizeForSymbol
async function fetchMarketDataWithGreeks(symbol) {
    let inputSymbol = symbol.toUpperCase();
    let underlyingSymbolFyers = '';
    let userFriendlyKey = '';
    let isIndex = false;

    if (inputSymbol === 'NIFTY') { underlyingSymbolFyers = 'NSE:NIFTY50-INDEX'; userFriendlyKey = 'NIFTY'; isIndex = true; }
    else if (inputSymbol === 'BANKNIFTY') { underlyingSymbolFyers = 'NSE:NIFTYBANK-INDEX'; userFriendlyKey = 'BANKNIFTY'; isIndex = true; }
    else if (inputSymbol === 'FINNIFTY') { underlyingSymbolFyers = 'NSE:FINNIFTY-INDEX'; userFriendlyKey = 'FINNIFTY'; isIndex = true; }
    else if (inputSymbol === 'MIDCPNIFTY') { underlyingSymbolFyers = 'NSE:MIDCPNIFTY-INDEX'; userFriendlyKey = 'MIDCPNIFTY'; isIndex = true; }
    else if (inputSymbol === 'SENSEX' || inputSymbol.includes('SENSEX')) { underlyingSymbolFyers = 'BSE:SENSEX-INDEX'; userFriendlyKey = 'SENSEX'; isIndex = true; }
    else if (inputSymbol.includes('NSE:') && inputSymbol.includes('-EQ')) {
        underlyingSymbolFyers = inputSymbol; 
        userFriendlyKey = inputSymbol.split(':')[1].replace('-EQ', '');
        isIndex = false; 
    }
    else { underlyingSymbolFyers = inputSymbol; userFriendlyKey = inputSymbol; isIndex = false; } 

    // --- GET LOT SIZE FROM DYNAMIC MAP ---
    let lotSize = getLotSizeForSymbol(userFriendlyKey || underlyingSymbolFyers);
    // -------------------------------------

    if (fyersSocket && algoState.symbol !== underlyingSymbolFyers) {
        console.log(`🔄 Switching Feed: ${algoState.symbol} -> ${underlyingSymbolFyers}`);
        fyersSocket.unsubscribe([algoState.symbol]);
        fyersSocket.subscribe([underlyingSymbolFyers]);
        algoState.symbol = underlyingSymbolFyers;
        candleHistory = [];
        currentCandle = null;
        broadcast({ type: 'HISTORY', data: [] });
    }

    const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, { 
        params: { symbols: `${underlyingSymbolFyers},NSE:INDIAVIX-INDEX` }, 
        headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` } 
    });
    
    const spotData = quotesRes.data.d.find(q => q.n === underlyingSymbolFyers);
    const vixData = quotesRes.data.d.find(q => q.n === 'NSE:INDIAVIX-INDEX');
    
    const spotPrice = spotData?.v?.lp || 0;
    const indiaVix = vixData?.v?.lp || 14.5; 

    let effectiveVix = indiaVix;
    if (['NSE:ADANIENT-EQ', 'NSE:ADANIGREEN-EQ', 'NSE:TATAMOTORS-EQ'].includes(underlyingSymbolFyers)) {
            effectiveVix = 22.5; 
    }

    const fyers = new fyersModel();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);
    
    if (!isIndex) {
        return {
            symbol: userFriendlyKey,
            fyersSymbol: underlyingSymbolFyers,
            spot: spotPrice,
            vix: effectiveVix, 
            daysToExpiry: 0, 
            options: [],
            lotSize: lotSize 
        };
    }

    // --- INDEX LOGIC ---
    let chainRes;
    try {
        chainRes = await fyers.getOptionChain({ symbol: underlyingSymbolFyers, strikecount: 30, timestamp: "" });
    } catch (error) {
        console.error("Option Chain API Request Error:", error.message);
    }
    
    let daysToExpiry = 7; 
    const strikeMap = new Map();
    
    try {
        if (!chainRes || !chainRes.data || !chainRes.data.optionsChain) {
            console.error("❌ Option chain failed or was empty.");
        } else {
            // Days to Expiry Calculation
            const expiryEpoch = chainRes.data.expiryData?.[0]?.date;
            if (expiryEpoch) {
                const diffTime = (new Date(expiryEpoch * 1000).getTime()) - (new Date().getTime());
                daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (daysToExpiry <= 0) daysToExpiry = 0.001; 
            }

            // Option Chain Greeks Population
            chainRes.data.optionsChain.forEach(opt => {
                if (!strikeMap.has(opt.strike_price)) {
                    strikeMap.set(opt.strike_price, { strike: opt.strike_price, CE_Ltp: 0, PE_Ltp: 0, CE_Greeks: {}, PE_Greeks: {} });
                }
                const item = strikeMap.get(opt.strike_price);
                if (opt.option_type === 'CE') {
                    item.CE_Ltp = opt.ltp;
                    item.CE_Symbol = opt.symbol; 
                    item.CE_Greeks = estimateGreeks(spotPrice, opt.strike_price, daysToExpiry, opt.ltp, 'CE', effectiveVix);
                } else if (opt.option_type === 'PE') {
                    item.PE_Ltp = opt.ltp;
                    item.PE_Symbol = opt.symbol; 
                    item.PE_Greeks = estimateGreeks(spotPrice, opt.strike_price, daysToExpiry, opt.ltp, 'PE', effectiveVix);
                }
            });
        }

    } catch (e) { 
        console.error("Option Chain Processing Error:", e.message);
    }

    return {
        symbol: userFriendlyKey,
        fyersSymbol: underlyingSymbolFyers,
        spot: spotPrice,
        vix: effectiveVix, 
        daysToExpiry: daysToExpiry,
        options: Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike),
        lotSize: lotSize 
    };
}

// ==================================================================
// 9. API ROUTES
// ==================================================================
app.get('/api/live-data/:symbol', async (req, res) => {
    try {
        const data = await fetchMarketDataWithGreeks(req.params.symbol);
        liveDataCache[data.symbol] = { timestamp: Date.now(), data: data };
        res.json(data);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/live-data-with-greeks/:symbol', async (req, res) => {
    if (!fyersAccessToken) return res.status(401).json({ error: 'Not authenticated.' });
    try {
        const data = await fetchMarketDataWithGreeks(req.params.symbol);
        liveDataCache[data.symbol] = { timestamp: Date.now(), data: data }; 
        res.json(data);
    } catch (error) { res.status(500).json({ error: "Failed to fetch data", details: error.message }); }
});

app.post('/api/decide-and-build-order', async (req, res) => {
    if (!fyersAccessToken) return res.status(401).json({ error: 'Not authenticated.' });
    try {
        const { signal, symbol } = req.body;
        const marketData = await fetchMarketDataWithGreeks(symbol);
        const decision = decideStrategy(signal, marketData.spot, marketData.daysToExpiry, marketData.options, marketData.vix);
        decision.signal = signal.direction; 
        decision.spot = marketData.spot; 
        res.json(decision);
    } catch (error) { res.status(500).json({ error: "Engine Failed", details: error.message }); }
});

app.post('/api/execute-trade', async (req, res) => {
    if (!fyersAccessToken) return res.status(401).json({ error: 'Not authenticated.' });
    
    try {
        const { strategy, decisionData } = req.body;
        
        if (!decisionData || !decisionData.legs || decisionData.legs.length === 0) {
            return res.status(400).json({ error: "Invalid trade data" });
        }

        const leg = decisionData.legs[0]; 
        
        let actualSymbol = leg.symbol;
        if (!actualSymbol) {
             const marketData = await fetchMarketDataWithGreeks(algoState.symbol);
             const opt = marketData.options.find(o => o.strike === leg.strike);
             actualSymbol = leg.optionType === 'CE' ? opt.CE_Symbol : opt.PE_Symbol;
        }

        // --- SIMULATION MODE START ---
        console.log(`[SIMULATION] Virtual Order Placed: BUY 1 ${actualSymbol} @ ~${leg.price}`);
        
        const entryPrice = leg.price || 100; 
        
        const newPosition = {
            instrument: actualSymbol,
            buyPrice: entryPrice,
            qty: 1, 
            stopLossPrice: entryPrice * 0.80, 
            targetPrice: entryPrice * 1.10,
            startTime: new Date().toLocaleTimeString(),
            signal: decisionData.signal || 'MANUAL',
            strategy: strategy,
            spot: decisionData.spot, 
            strike: leg.strike        
        };

        livePositions = [newPosition]; 
        algoState.isInTrade = true;

        res.json({ success: true, message: "Simulation Auto-Trade Executed", position: newPosition });
        // --- SIMULATION MODE END ---

    } catch (error) {
        res.status(500).json({ error: "Execution Failed", details: error.message });
    }
});

app.post('/calculate', async (req, res) => {
    try {
        const { strategy, strike, strike1, strike2, stockPrice, symbol, lotSize } = req.body;
        
        const s = Number(strike) || 0;
        const s1 = Number(strike1) || 0;
        const s2 = Number(strike2) || 0;
        const sp = Number(stockPrice) || 0;
        const referenceStrike = s || s1 || s2 || sp;
        
        if (!referenceStrike) return res.status(400).json({ error: 'Valid strike required.' });

        const spotPrices = [];
        for (let i = referenceStrike * 0.85; i <= referenceStrike * 1.15; i += referenceStrike * 0.01) {
            spotPrices.push(Math.round(i));
        }
        
        const params = { ...req.body, spotPrices };
        
        // --- DYNAMIC LOT SIZE LOGIC (VIA CSV OR FALLBACK) ---
        if (symbol && (!lotSize || Number(lotSize) === 1)) {
            // Check global map first (Populated by CSV)
            const liveSize = getLotSizeForSymbol(symbol);
            if (liveSize && liveSize > 1) {
                params.lotSize = liveSize;
                console.log(`✅ Using Global/CSV Lot Size for ${symbol}: ${liveSize}`);
            } else {
                console.log(`⚠️ No CSV data. Checking fallback...`);
                // Check fallback map
                if (FALLBACK_LOT_SIZES[symbol] || FALLBACK_LOT_SIZES[symbol.replace('NSE:', '')]) {
                     params.lotSize = FALLBACK_LOT_SIZES[symbol] || FALLBACK_LOT_SIZES[symbol.replace('NSE:', '')];
                     console.log(`✅ Applied Fallback from Route: ${params.lotSize}`);
                } else {
                     params.lotSize = 1;
                }
            }
        } else if (!params.lotSize) {
             params.lotSize = 1; 
        }
        // --- END DYNAMIC LOT SIZE LOGIC ---

        const result = calculateStrategy(strategy, params);
        
        if (Array.isArray(result.breakeven)) {
            result.breakeven = result.breakeven.map(n => n.toFixed(2)).join(' & ');
        } else if (typeof result.breakeven === 'number') {
            result.breakeven = result.breakeven.toFixed(2);
        }
        
        result.usedLotSize = params.lotSize; 
        
        res.json(result);

    } catch (error) { 
        console.error("Calculation Error:", error.message);
        res.status(400).json({ error: error.message }); 
    }
});

const paperTrades = [];
function findCurrentPrice(symbol, strike, optionType) {
    try {
        let key = symbol.toUpperCase().includes(':') ? symbol.split(':')[1].replace('-INDEX', '') : symbol.toUpperCase();
        if (key === 'NIFTY 50') key = 'NIFTY';
        const cached = liveDataCache[key];
        if (!cached || !cached.data) return null;
        const opt = cached.data.options.find(o => o.strike === Number(strike));
        return opt ? (optionType === 'CE' ? opt.CE_Ltp : opt.PE_Ltp) : null;
    } catch (err) { return null; }
}

app.post('/api/paper-trade', (req, res) => {
    try {
        const { symbol, strategyType, legs } = req.body;
        let totalCost = 0;
        const procLegs = [];
        for (const leg of legs) {
            const price = findCurrentPrice(symbol, leg.strike, leg.optionType);
            const finalPrice = (price !== null) ? price : leg.price;
            if (!finalPrice) throw new Error(`Price not found for ${leg.strike} ${leg.optionType}`);
            procLegs.push({ ...leg, entryPrice: finalPrice, currentPrice: finalPrice, pnl: 0 });
            totalCost += (finalPrice * (leg.action === 'BUY' ? 1 : -1) * leg.qty);
        }
        const trade = { tradeId: crypto.randomUUID(), symbol, strategyType, status: "OPEN", legs: procLegs, netEntryCost: totalCost, currentNetPnl: 0 };
        paperTrades.push(trade);
        res.status(201).json(trade);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/paper-trades', (req, res) => {
    res.json({ openTrades: paperTrades.filter(t => t.status === 'OPEN'), closedTrades: paperTrades.filter(t => t.status !== 'OPEN') });
});

setInterval(() => {
    paperTrades.filter(t => t.status === 'OPEN').forEach(trade => {
        let netPnl = 0;
        trade.legs.forEach(leg => {
            const price = findCurrentPrice(trade.symbol, leg.strike, leg.optionType);
            if (price) {
                leg.currentPrice = price;
                leg.pnl = (price - leg.entryPrice) * (leg.action === 'BUY' ? 1 : -1) * leg.qty;
                netPnl += leg.pnl;
            }
        });
        trade.currentNetPnl = netPnl;
    });
}, 2000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });