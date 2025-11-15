// --- 1. IMPORTS & SETUP ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const otpauth = require('otpauth');
const crypto = require('crypto');
const { fyersModel, fyersDataSocket } = require("fyers-api-v3");
const { calculateStrategy } = require('./strategyengine');
const { SYMBOL_LOT_SIZES } = require('./constants');

// --- [NEW] Import WebSocket Server Library ---
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// --- 2. GLOBAL CONFIGURATION & STATE ---
const liveDataCache = {}; 
const CACHE_DURATION_MS = 20 * 1000; 

// --- Fyers API Configuration ---
const FYERS_APP_ID = process.env.FYERS_CLIENT_ID;
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_TOTP_KEY = process.env.FYERS_TOTP_KEY;
const FYERS_PIN = process.env.FYERS_PIN;
const FYERS_FY_ID = process.env.FYERS_FY_ID;
const FYERS_REDIRECT_URI = process.env.FYERS_REDIRECT_URI || 'https://www.google.com/';
const FYERS_API_BASE_URL_V2 = 'https://api-t2.fyers.in/vagator/v2';
const FYERS_API_DATA_URL_V3 = 'https://api-t1.fyers.in/data';

// --- Bot State ---
let fyersAccessToken = null;
let fyersAppId = null; 
let isAlgoRunning = false;
let livePositions = []; 
let candleHistory = [];
let currentCandle = null;
let algoState = {
    symbol: "NSE:IDEA-EQ", 
    interval: 3,           
    qty: 1,                
    stopLossPoints: 0.25,  
    targetPoints: 0.50,    
    isInTrade: false,      
};

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

// ==================================================================
// 3. UI DASHBOARD WEBSOCKET (NEW)
// ==================================================================

// Create a WebSocket server on port 8080
const wss = new WebSocketServer({ port: 8080 });
let uiClients = new Set(); // To store all connected UI clients

wss.on('connection', (ws) => {
    console.log('✅ UI Dashboard Connected');
    uiClients.add(ws);
    
    // Send a welcome message
    ws.send(JSON.stringify({ type: 'STATUS', message: 'Connected to Bot Server.' }));

    ws.on('close', () => {
        console.log('UI Dashboard Disconnected');
        uiClients.delete(ws);
    });
});

/**
 * Broadcasts a message to all connected UI clients.
 * This is our "dashboard feed".
 * @param {object} data - The data to send (will be stringified)
 */
function broadcast(data) {
    const message = JSON.stringify(data);
    uiClients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
            client.send(message);
        }
    });
}

console.log('UI Dashboard WebSocket Server started on port 8080.');

// ==================================================================
// 4. AUTHENTICATION (Login Route)
// ==================================================================
app.post('/api/fyers/login', async (req, res) => {
    try {
        console.log("Starting Fyers automated login...");
        
        // Step 1: Send OTP Request
        console.log("Step 1: Sending Login OTP request...");
        const otpUrl = `${FYERS_API_BASE_URL_V2}/send_login_otp_v2`;
        const otpRes = await axios.post(otpUrl, { fy_id: getEncodedString(FYERS_FY_ID), app_id: "2" }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        const requestKeyOTP = otpRes.data?.request_key;
        if (!requestKeyOTP) throw new Error(`Step 1 Failed: ${JSON.stringify(otpRes.data)}`);
        console.log("Step 1 Successful.");

        // Step 2: Verify TOTP
        console.log("Step 2: Verifying TOTP...");
        let totp = new otpauth.TOTP({ issuer: "Fyers", label: "Fyers", algorithm: "SHA1", digits: 6, period: 30, secret: FYERS_TOTP_KEY });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const otpCode = totp.generate();
        const verifyOtpRes = await axios.post(`${FYERS_API_BASE_URL_V2}/verify_otp`, { request_key: requestKeyOTP, otp: otpCode }, { timeout: 10000 });
        const requestKeyPin = verifyOtpRes.data?.request_key;
        if (!requestKeyPin) throw new Error(`Step 2 Failed: ${JSON.stringify(verifyOtpRes.data)}`);
        console.log("Step 2 Successful.");

        // Step 3: Verify PIN
        console.log("Step 3: Verifying PIN...");
        const session = axios.create({ timeout: 10000 });
        const verifyPinRes = await session.post(`${FYERS_API_BASE_URL_V2}/verify_pin_v2`, { request_key: requestKeyPin, identity_type: "pin", identifier: getEncodedString(FYERS_PIN) });
        const intermediateAccessToken = verifyPinRes.data?.data?.access_token;
        if (!intermediateAccessToken) throw new Error(`Step 3 Failed: ${JSON.stringify(verifyPinRes.data)}`);
        console.log("Step 3 Successful.");

        // Step 4: Get Auth Code
        console.log("Step 4: Getting Auth Code...");
        const appIdForToken = FYERS_APP_ID.endsWith('-100') ? FYERS_APP_ID.substring(0, FYERS_APP_ID.length - 4) : FYERS_APP_ID;
        session.defaults.headers.common['Authorization'] = `Bearer ${intermediateAccessToken}`;
        const tokenPayload = { fyers_id: FYERS_FY_ID, app_id: appIdForToken, redirect_uri: FYERS_REDIRECT_URI, appType: "100", code_challenge: "", state: "None", scope: "", nonce: "", response_type: "code", create_cookie: true };
        const tokenRes = await session.post(`https://api-t1.fyers.in/api/v3/token`, tokenPayload, {
            validateStatus: function (status) { return (status >= 200 && status < 300) || status === 308; }
        });
        const authCodeUrl = tokenRes.data?.Url;
        if (!authCodeUrl) throw new Error(`Step 4 Failed API: ${JSON.stringify(tokenRes.data)}`);
        let authCode = null;
        try {
            const paramsString = authCodeUrl.split('?')[1]; if (!paramsString) throw new Error("No query string");
            const paramsArray = paramsString.split('&');
            for (const param of paramsArray) { const [key, value] = param.split('='); if (key === 'auth_code') { authCode = value; break; } }
            if (!authCode) throw new Error("auth_code not found");
        } catch (parseError) { throw new Error("Step 4 Failed Parsing: " + parseError.message); }
        console.log("Step 4 Successful.");

        // Step 5: Get Final Access Token
        console.log("Step 5: Exchanging Auth Code for Final Access Token...");
        const hashCreator = crypto.createHash('sha256');
        hashCreator.update(`${FYERS_APP_ID}:${FYERS_SECRET_KEY}`);
        const appIdHashValue = hashCreator.digest('hex');
        const finalTokenRes = await axios.post(`https://api-t1.fyers.in/api/v3/validate-authcode`,
            { grant_type: 'authorization_code', code: authCode, appIdHash: appIdHashValue },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );

        if (finalTokenRes.data?.access_token) {
            // Set global state
            fyersAccessToken = finalTokenRes.data.access_token;
            fyersAppId = FYERS_APP_ID; 
            
            fyersLoginInstance.setAccessToken(fyersAccessToken);
            console.log("✅ LOGIN SUCCESS! Access Token Received.");
            
            // --- START THE ALGO ---
            startAlgoSystem(); // This starts the WebSocket Brain & Manager
            
            res.json({ success: true, message: "Login Successful. Algo Started.", accessToken: fyersAccessToken });
        } else {
            throw new Error(`Step 5 Failed: No access token`);
        }

    } catch (error) {
        console.error("Login Error:", error.message);
        res.status(500).json({ success: false, error: "Login Failed", details: error.message });
    }
});


// ==================================================================
// 5. ALGORITHMIC TRADING ENGINE (Brain & Manager) - MODIFIED
// ==================================================================

/**
 * Main function to start both the Brain (WebSocket) and Manager (P&L Loop)
 */
function startAlgoSystem() {
    if (isAlgoRunning) {
        console.log("Algo system is already running. Skipping new start.");
        return;
    }
    if (!fyersAccessToken || !fyersAppId) {
        console.error("Algo Bot cannot start. Missing token or app ID.");
        return;
    }

    isAlgoRunning = true; 
    startWebSocketBrain();
    startAlgoManager();
}

// --- PART A: The Brain (WebSocket) ---
function startWebSocketBrain() {
    console.log(`💡 ALGO BRAIN: Initializing WebSocket for ${algoState.symbol}...`);
    broadcast({ type: 'STATUS', message: `💡 ALGO BRAIN: Initializing WebSocket for ${algoState.symbol}...` });
    
    const socketAuth = `${fyersAppId}:${fyersAccessToken}`;
    const skt = fyersDataSocket.getInstance(socketAuth, "."); 

    skt.on("connect", () => {
        console.log("✅ Brain: WebSocket Connected. Subscribing...");
        broadcast({ type: 'STATUS', message: `✅ Brain: WebSocket Connected. Subscribing...` });
        skt.subscribe([algoState.symbol]);
        skt.mode(skt.FullMode); 
    });

    skt.on("message", (msg) => {
        if (msg.symbol === algoState.symbol && msg.ltp && msg.exch_feed_time) {
            processTick(msg.ltp, msg.exch_feed_time);
        }
    });

    skt.on("error", (err) => {
        console.log("Brain Socket Error:", err);
        broadcast({ type: 'ERROR', message: `Brain Socket Error: ${err}` });
    });
    skt.on("close", () => {
        console.log("Brain Socket Closed. Will attempt reconnect.");
        broadcast({ type: 'STATUS', message: 'Brain Socket Closed. Reconnecting...' });
    });

    skt.connect();
    skt.autoreconnect(); 
}

/**
 * Processes a live tick and builds a candle.
 */
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
    } else {
        const logMsg = `🕯️  Brain: ${algoState.interval}-min Candle Closed @ ${currentCandle.close}`;
        console.log(logMsg);
        broadcast({ type: 'CANDLE', message: logMsg, candle: currentCandle });
        
        candleHistory.push(currentCandle);
        if (candleHistory.length > 100) candleHistory.shift();
        
        runSignalLogic(); 
        currentCandle = { time: candleTime, open: ltp, high: ltp, low: ltp, close: ltp };
    }
}

/**
 * The strategy logic (SMA Crossover) that runs when a candle closes.
 */
async function runSignalLogic() {
    if (algoState.isInTrade || candleHistory.length < 25) {
        const msg = `Brain: Skipping signal check. ${algoState.isInTrade ? "Already in trade." : "Not enough candle data."}`;
        broadcast({ type: 'STATUS', message: msg });
        return; 
    }

    const closes = candleHistory.map(c => c.close);
    const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const sma25 = closes.slice(-25).reduce((a, b) => a + b, 0) / 25;
    const prevCloses = closes.slice(0, -1);
    const prevSma7 = prevCloses.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const prevSma25 = prevCloses.slice(-26, -1).reduce((a, b) => a + b, 0) / 25;

    const statusMsg = `Brain: SMA7: ${sma7.toFixed(2)} | SMA25: ${sma25.toFixed(2)}`;
    console.log(statusMsg);
    broadcast({ type: 'STATUS', message: statusMsg });

    if (sma7 > sma25 && prevSma7 < prevSma25) {
        console.log("🚀 BUY SIGNAL TRIGGERED!");
        broadcast({ type: 'SIGNAL', message: `🚀 BUY SIGNAL TRIGGERED! (SMA7: ${sma7.toFixed(2)}, SMA25: ${sma25.toFixed(2)})` });
        
        algoState.isInTrade = true;
        
        try {
            const order = await placeLiveOrder(algoState.symbol, algoState.qty, 1); // 1 = Buy
            await monitorOrderFill(order.id); 
        } catch (e) {
            console.error("Trade Entry Failed:", e.message);
            broadcast({ type: 'ERROR', message: `Trade Entry Failed: ${e.message}` });
            algoState.isInTrade = false; 
        }
    }
}

/**
 * Waits for an order to be FILLED before adding it to the Manager.
 */
async function monitorOrderFill(orderId) {
    console.log(`Brain: Polling for fill status of order ${orderId}...`);
    broadcast({ type: 'STATUS', message: `Brain: Polling for fill status of order ${orderId}...` });

    const fyers = new fyersModel();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);

    for (let i = 0; i < 10; i++) { 
        await new Promise(r => setTimeout(r, 2000));
        
        const book = await fyers.get_orders();
        const myOrder = book.orders?.find(o => o.id === orderId);
        
        if (myOrder) {
            if (myOrder.status === 2) { // 2 = Filled
                const trade = {
                    symbol: algoState.symbol,
                    qty: algoState.qty,
                    buyPrice: myOrder.tradedPrice,
                    stopLoss: myOrder.tradedPrice - algoState.stopLossPoints,
                    target: myOrder.tradedPrice + algoState.targetPoints
                };
                livePositions.push(trade);
                const msg = `✅ TRADE ACTIVE: Bought @ ${myOrder.tradedPrice}. SL: ${trade.stopLoss}, Tgt: ${trade.target}`;
                console.log(msg);
                broadcast({ type: 'TRADE_OPEN', message: msg, trade: trade });
                return;
            }
            if (myOrder.status === 5) { // 5 = Rejected
                broadcast({ type: 'ERROR', message: `Order ${orderId} was REJECTED.` });
                throw new Error(`Order ${orderId} was REJECTED by broker.`);
            }
        }
    }
    console.log(`Brain: Order ${orderId} not filled in time.`);
    broadcast({ type: 'ERROR', message: `Order ${orderId} not filled in time.` });
    algoState.isInTrade = false;
}

// --- PART B: The Manager (P&L Loop) ---
function startAlgoManager() {
    console.log("💼 ALGO MANAGER: Started. Checking P&L every 3 seconds.");
    setInterval(async () => {
        if (!fyersAccessToken || livePositions.length === 0) return;

        try {
            const pos = livePositions[0]; 
            
            const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, {
                params: { symbols: pos.symbol },
                headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` }
            });
            const ltp = quotesRes.data.d?.[0]?.v?.lp;
            if (!ltp) return; 

            const pnl = (ltp - pos.buyPrice) * pos.qty;
            const pnlMsg = `Manager P&L: ${pnl.toFixed(2)} (LTP: ${ltp}, Target: ${pos.target}, SL: ${pos.stopLoss})`;
            // console.log(pnlMsg); // Too noisy for console, but good for UI
            broadcast({ type: 'PNL_UPDATE', message: pnlMsg, pnl: pnl, ltp: ltp, trade: pos });

            if (ltp >= pos.target || ltp <= pos.stopLoss) {
                const reason = ltp >= pos.target ? "TARGET HIT" : "STOP LOSS HIT";
                console.log(`🚨 ${reason}! Closing Trade...`);
                broadcast({ type: 'TRADE_CLOSE', message: `🚨 ${reason}! Closing Trade...` });
                
                await placeLiveOrder(pos.symbol, pos.qty, -1); // -1 = Sell
                
                livePositions = []; 
                algoState.isInTrade = false; 
                console.log("✅ Trade Closed. Bot is ready for new signals.");
                broadcast({ type: 'STATUS', message: "✅ Trade Closed. Bot is ready for new signals." });
            }
        } catch (e) {
            console.error("Manager Error:", e.message);
            broadcast({ type: 'ERROR', message: `Manager Error: ${e.message}` });
        }
    }, 3000); // Check every 3 seconds
}

// ==================================================================
// 6. API HELPER FUNCTIONS
// ==================================================================

/**
 * Universal function to place a live order.
 */
async function placeLiveOrder(symbol, qty, side, isAMO = false) {
    const fyers = new fyersModel();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);

    let payload = {
        symbol: symbol,
        qty: qty,
        type: 2, // 2 = Market Order
        side: side, 
        productType: "INTRADAY", // MIS
        validity: "DAY",
        offlineOrder: false
    };

    if (isAMO) {
        console.log("Detected AMO request. Fetching LTP for limit price...");
        const quotes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, {
            params: { symbols: symbol },
            headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` }
        });
        const ltp = quotes.data.d?.[0]?.v?.lp || 10; 
        
        payload.type = 1; // 1 = Limit Order
        payload.limitPrice = side === 1 ? ltp + 0.5 : ltp - 0.5;
        payload.productType = "CNC"; 
        payload.offlineOrder = true; 
    }

    console.log(`Placing Order: ${side === 1 ? 'BUY' : 'SELL'} ${qty} ${symbol} (AMO: ${isAMO})`);
    const res = await fyers.place_order(payload);
    
    if (res.s !== 'ok') {
        throw new Error(`Order Failed: ${res.message}`);
    }
    
    console.log("Fyers Order Response:", res);
    return res; 
}

// ==================================================================
// 7. API ROUTES FOR FRONTEND
// ==================================================================

/**
 * Route: /api/live-data/:symbol
 */
app.get('/api/live-data/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const currentTime = Date.now();

    // --- 1. DYNAMIC SYMBOL NORMALIZATION (FIXED) ---
    let inputSymbol = symbol.toUpperCase();
    let underlyingSymbolFyers = '';
    let userFriendlyKey = ''; 

    if (inputSymbol === 'NIFTY') {
        underlyingSymbolFyers = 'NSE:NIFTY50-INDEX';
        userFriendlyKey = 'NIFTY';
    } else if (inputSymbol === 'BANKNIFTY') {
        underlyingSymbolFyers = 'NSE:NIFTYBANK-INDEX';
        userFriendlyKey = 'BANKNIFTY';
    } else if (inputSymbol === 'FINNIFTY') {
        underlyingSymbolFyers = 'NSE:FINNIFTY-INDEX';
        userFriendlyKey = 'FINNIFTY';
    } else if (inputSymbol === 'MIDCPNIFTY') {
        underlyingSymbolFyers = 'NSE:MIDCPNIFTY-INDEX';
        userFriendlyKey = 'MIDCPNIFTY';
    } else if (inputSymbol.includes(':')) {
        underlyingSymbolFyers = inputSymbol;
        userFriendlyKey = inputSymbol.split(':')[1].replace('-INDEX', '');
    } else {
        return res.status(400).json({ 
            error: `Unrecognized short symbol '${symbol}'. Use a full symbol like 'NSE:SYMBOL-INDEX'.` 
        });
    }
    
    console.log(`Live Data Request: Normalized ${symbol} -> ${underlyingSymbolFyers}`);
    // --- End Dynamic Symbol Logic ---

    // 2. Cache Check
    if (liveDataCache[userFriendlyKey] && (currentTime - liveDataCache[userFriendlyKey].timestamp < CACHE_DURATION_MS)) {
        return res.json(liveDataCache[userFriendlyKey].data);
    }
    if (!fyersAccessToken) return res.status(401).json({ error: 'Not authenticated.' });

    try {
        // 3. Fetch Spot Price
        const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, {
            params: { symbols: underlyingSymbolFyers },
            headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` }
        });

        const fyersError = quotesRes.data?.d?.[0]?.v?.errmsg;
        if (fyersError) {
             throw new Error(fyersError);
        }

        const spotPrice = quotesRes.data?.d?.[0]?.v?.lp;
        if (spotPrice === undefined || spotPrice === null) {
            throw new Error(`Could not extract spot price for ${underlyingSymbolFyers}.`);
        }

        // 4. Fetch Option Chain (Only if it's a "Tradable" index)
        let optionsData = [];
        let expiryDateForOutput = "N/A";

        if (Object.keys(SYMBOL_LOT_SIZES).includes(userFriendlyKey)) {
            const fyers = new fyersModel();
            fyers.setAppId(fyersAppId);
            fyers.setAccessToken(fyersAccessToken);
            const optionChainResponse = await fyers.getOptionChain({ symbol: underlyingSymbolFyers, strikecount: 50, timestamp: "" });
            
            if (optionChainResponse.data?.optionsChain) {
                const fyersOptionsData = optionChainResponse.data.optionsChain;
                const expiryDateStr = optionChainResponse.data.expiryData?.[0]?.date || "YYYY-MM-DD";
                try { const parts = expiryDateStr.split('-'); expiryDateForOutput = `${parts[2]}-${parts[1]}-${parts[0]}`; } catch (e) { }

                const strikeMap = new Map();
                fyersOptionsData.forEach(option => {
                    if (option.strike_price === -1) return;
                    if (!strikeMap.has(option.strike_price)) {
                        strikeMap.set(option.strike_price, { strike: option.strike_price, CE_Ltp: null, PE_Ltp: null, CE_Oi: null, PE_Oi: null });
                    }
                    const entry = strikeMap.get(option.strike_price);
                    if (option.option_type === "CE") { entry.CE_Ltp = option.ltp; entry.CE_Oi = option.oi; }
                    else if (option.option_type === "PE") { entry.PE_Ltp = option.ltp; entry.PE_Oi = option.oi; }
                });
                optionsData = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
            }
        }

        // 5. Format & Cache Data
        const responseData = {
            symbol: userFriendlyKey, // The "key" e.g., NIFTY, NIFTYAUTO
            fyersSymbol: underlyingSymbolFyers,
            spot: spotPrice,
            options: optionsData,
            expiry: expiryDateForOutput,
        };
        liveDataCache[userFriendlyKey] = { timestamp: currentTime, data: responseData };
        res.json(responseData);

    } catch (error) {
        console.error(`Live Data Error for ${symbol}:`, error.message);
        res.status(500).json({ error: "Failed to fetch live data", details: error.message, symbol: underlyingSymbolFyers });
    }
});

/**
 * Route: /api/historical-data
 */
app.get('/api/historical-data', async (req, res) => {
    const { symbol, resolution, from, to } = req.query; 

    if (!symbol || !resolution || !from || !to) {
        return res.status(400).json({ error: 'Missing required query parameters.' });
    }
    if (!fyersAccessToken) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const fromEpoch = Math.floor(fromDate.getTime() / 1000);
        const toEpoch = Math.floor(toDate.getTime() / 1000);

        const historyPayload = {
            symbol: symbol,
            resolution: resolution,
            date_format: "0", 
            range_from: String(fromEpoch),
            range_to: String(toEpoch),
            cont_flag: "1"
        };
        
        const fyers = new fyersModel();
        fyers.setAppId(fyersAppId);
        fyers.setAccessToken(fyersAccessToken);
        const historyResponse = await fyers.getHistory(historyPayload);

        if (historyResponse.s !== 'ok' || !historyResponse.candles) {
            throw new Error(`Failed to fetch historical data: ${historyResponse.message}`);
        }
        
        const formattedCandles = historyResponse.candles.map(c => ({
            timestamp: c[0], date: new Date(c[0] * 1000).toISOString(),
            open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
        }));

        res.json({
            symbol: symbol,
            resolution: resolution,
            candles: formattedCandles
        });

    } catch (error) {
        console.error("Historical Data Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch historical data', details: error.message });
    }
});

/**
 * Route: /calculate (Payoff)
 */
app.post('/calculate', (req, res) => {
    try {
        const { strategy, strike, strike1, strike2, strike3, stockPrice, symbol } = req.body;
        const referenceStrike = strike || strike2 || strike1 || strike3 || stockPrice;
        if (!referenceStrike) {
            return res.status(400).json({ error: 'A valid strike or stock price is required.' });
        }
        const spotPrices = [];
        for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) {
            spotPrices.push(Math.round(s));
        }
        
        const params = { ...req.body, spotPrices };
        
        if (!params.lotSize) {
             const configKey = Object.keys(SYMBOL_LOT_SIZES).find(key => key === symbol?.toUpperCase());
             params.lotSize = configKey ? SYMBOL_LOT_SIZES[configKey] : 1;
        }

        const result = calculateStrategy(strategy, params);
        
        if (Array.isArray(result.breakeven)) {
            const formattedBreakeven = result.breakeven.map(be =>
                (typeof be === 'number') ? be.toFixed(2) : be
            );
            result.breakeven = `${formattedBreakeven[0]} & ${formattedBreakeven[1]}`;
        } else if (typeof result.breakeven === 'number') {
            result.breakeven = result.breakeven.toFixed(2);
        }

        res.json(result);
    } catch (error) {
        console.error("Error in /calculate route:", error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * Route: /api/execute-signal (Manual Test)
 */
app.post('/api/execute-signal', async (req, res) => {
    const signal = req.body;
    console.log("MANUAL SIGNAL RECEIVED:", JSON.stringify(signal, null, 2));

    if (!fyersAccessToken) {
        return res.status(401).json({ error: 'Not Authenticated.' });
    }
    
    const TEST_SYMBOL = "NSE:IDEA-EQ";
    const TEST_QTY = 1;
    const side = signal.direction === "UP" ? 1 : -1;

    try {
        const orderResponse = await placeLiveOrder(
            TEST_SYMBOL, 
            TEST_QTY, 
            side, 
            true // true = isAMO (for weekend testing)
        );
        res.json({ success: true, message: "Manual AMO Test Order Placed.", details: orderResponse });
    } catch (error) {
        console.error("Manual Signal Error:", error.message);
        res.status(500).json({ error: "Manual Trade Failed", details: error.message });
    }
});

// ==================================================================
// 8. PAPER TRADING MODULE
// ==================================================================
const paperTrades = [];

/**
 * Helper: Find current price from cache for paper trading
 */
function findCurrentPrice(symbol, strike, optionType) {
    try {
        const normalizedSymbol = symbol.toUpperCase();
        const cachedData = liveDataCache[normalizedSymbol];
        if (!cachedData || !cachedData.data) return null;
        const option = cachedData.data.options.find(o => o.strike === strike);
        if (!option) return null;
        const price = (optionType === 'CE') ? option.CE_Ltp : option.PE_Ltp;
        return (price !== null && price !== undefined) ? price : null;
    } catch (err) {
        return null;
    }
}

/**
 * Route: /api/paper-trade (POST)
 */
app.post('/api/paper-trade', (req, res) => {
    try {
        const { symbol, strategyType, legs, targetPercent, slPercent } = req.body;
        if (!symbol || !legs || !Array.isArray(legs) || legs.length === 0) {
            return res.status(400).json({ error: "Invalid trade request." });
        }
        let totalEntryCost = 0;
        const processedLegs = [];
        for (const leg of legs) {
            const entryPrice = findCurrentPrice(symbol, leg.strike, leg.optionType);
            if (entryPrice === null) {
                throw new Error(`Could not find live price for ${symbol} ${leg.strike} ${leg.optionType}.`);
            }
            const legCost = entryPrice * (leg.action.toUpperCase() === 'BUY' ? 1 : -1);
            totalEntryCost += (legCost * leg.qty); 
            processedLegs.push({ ...leg, entryPrice, currentPrice: entryPrice, pnl: 0 });
        }
        let targetPnl, slPnl;
        if (totalEntryCost > 0) { // Net Debit
            targetPnl = totalEntryCost * (targetPercent / 100);
            slPnl = totalEntryCost * (slPercent / 100); 
        } else { // Net Credit
            targetPnl = Math.abs(totalEntryCost) * (targetPercent / 100); 
            slPnl = Math.abs(totalEntryCost) * (Math.abs(slPercent) / 100) * -1;
        }
        const newTrade = {
            tradeId: crypto.randomUUID(),
            symbol: symbol.toUpperCase(),
            strategyType, status: "OPEN",
            entryTimestamp: new Date().toISOString(),
            legs: processedLegs,
            netEntryCost: totalEntryCost, 
            targetPnl, slPnl, currentNetPnl: 0,
            exitTimestamp: null, exitReason: null
        };
        paperTrades.push(newTrade);
        console.log(`[Paper Sim] New Trade OPENED: ${newTrade.tradeId}`);
        res.status(201).json(newTrade); 
    } catch (error) {
        console.error("[Paper Sim] Failed to place trade:", error.message);
        res.status(500).json({ error: "Failed to place paper trade.", details: error.message });
    }
});

/**
 * Route: /api/paper-trades (GET)
 */
app.get('/api/paper-trades', (req, res) => {
    try {
        res.json({
            openTrades: paperTrades.filter(t => t.status === 'OPEN'),
            closedTrades: paperTrades.filter(t => t.status !== 'OPEN')
        });
    } catch (error) {
        console.error("[Paper Sim] Failed to get trades:", error.message);
        res.status(500).json({ error: "Failed to retrieve paper trades." });
    }
});

/**
 * Paper Trade P&L Simulation Loop
 */
setInterval(() => {
    const openTrades = paperTrades.filter(t => t.status === 'OPEN');
    if (openTrades.length === 0) return;
    for (const trade of openTrades) {
        try {
            let currentNetPnl = 0;
            let canUpdate = true;
            for (const leg of trade.legs) {
                const currentPrice = findCurrentPrice(trade.symbol, leg.strike, leg.optionType);
                if (currentPrice === null) {
                    canUpdate = false; 
                    break; 
                }
                leg.currentPrice = currentPrice;
                const actionMultiplier = (leg.action.toUpperCase() === 'BUY' ? 1 : -1);
                leg.pnl = (leg.currentPrice - leg.entryPrice) * actionMultiplier * leg.qty;
                currentNetPnl += leg.pnl;
            }
            if (canUpdate) {
                trade.currentNetPnl = currentNetPnl;
                let closeReason = null;
                if (trade.targetPnl && currentNetPnl >= trade.targetPnl) closeReason = "TARGET_HIT";
                else if (trade.slPnl && currentNetPnl <= trade.slPnl) closeReason = "SL_HIT";
                if (closeReason) {
                    trade.status = "CLOSED";
                    trade.exitTimestamp = new Date().toISOString();
                    trade.exitReason = closeReason;
                    console.log(`[Paper Sim] Trade CLOSED: ${trade.tradeId} (${closeReason})`);
                }
            }
        } catch (err) {
            console.error(`[Paper Sim] Error simulating PNL for trade ${trade.tradeId}:`, err.message);
        }
    }
}, 5000); // Check P&L every 5 seconds

console.log("Paper trading module initialized.");


// ==================================================================
// 9. START SERVER
// ==================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});