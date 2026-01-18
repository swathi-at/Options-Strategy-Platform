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
const readline = require('readline'); 
const { fyersModel, fyersDataSocket } = require("fyers-api-v3");
const { calculateStrategy } = require('./strategyCalculator'); 
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
// ⚠️ SIMULATION CONTROL ⚠️
// Set to 'PAPER' to test with Live Data but Fake Money.
// Set to 'LIVE' to send real orders to Fyers.
const TRADE_MODE = 'PAPER';

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

// Default Fallbacks
const FALLBACK_LOT_SIZES = {
    'NIFTY': 75,
    'BANKNIFTY': 15,      
    'FINNIFTY': 25,
    'MIDCPNIFTY': 50,
    'SENSEX': 10
};

let fyersAccessToken = process.env.FYERS_TOKEN || null;
let fyersAppId = process.env.FYERS_CLIENT_ID; // Ensure App ID is also ready
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
    
    // Create file if it doesn't exist
    if (!fs.existsSync(LOG_FILE_PATH)) {
        fs.writeFileSync(LOG_FILE_PATH, headers);
    }

    // ✅ FIX: Use safety checks (|| 'N/A') to prevent 'undefined'
    const row = `${new Date().toLocaleDateString()},` +
                `${tradeData.startTime || new Date().toLocaleTimeString()},` + // Fallback to current time if missing
                `${tradeData.endTime || new Date().toLocaleTimeString()},` +
                `${tradeData.instrument},` +
                `${tradeData.signal || 'N/A'},` +      // Signal (Bull/Bear)
                `${tradeData.strategy},` +
                `${tradeData.spot || 0},` +            // Spot Price
                `${tradeData.strike},` +
                `${Number(tradeData.buyPrice).toFixed(2)},` +
                `${Number(tradeData.exitPrice).toFixed(2)},` +
                `${Number(tradeData.pnl).toFixed(2)},` +
                `${tradeData.reason || 'Auto-Exit'}\n`;

    fs.appendFileSync(LOG_FILE_PATH, row);
    console.log("📝 Trade Logged to CSV:", row.trim());
}

// ==================================================================
// 3. LOT SIZE HELPERS
// ==================================================================
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
            if (cols.length > 9) {
                const symbolCode = cols[9]; 
                const lotSize = parseInt(cols[3]); 

                if (symbolCode && !isNaN(lotSize)) {
                    let rootSymbol = "";
                    if (symbolCode.includes('NIFTY') && !symbolCode.includes('BANK') && !symbolCode.includes('FIN') && !symbolCode.includes('MID')) rootSymbol = 'NIFTY';
                    else if (symbolCode.includes('BANKNIFTY')) rootSymbol = 'BANKNIFTY';
                    else if (symbolCode.includes('FINNIFTY')) rootSymbol = 'FINNIFTY';
                    else if (symbolCode.includes('MIDCPNIFTY')) rootSymbol = 'MIDCPNIFTY';
                    else {
                        const match = symbolCode.match(/NSE:([A-Z]+)/);
                        if (match) rootSymbol = match[1];
                    }

                    if (rootSymbol && lotSize > 0) {
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
    } catch (error) {
        console.error("❌ Failed to fetch Live Lot Sizes:", error.message);
    }
}

function getLotSizeForSymbol(symbol) {
    if (!symbol) return 1;
    let key = symbol.toUpperCase();
    if (key.includes('NSE:') && key.includes('-EQ')) key = key.split(':')[1].replace('-EQ', '');
    else if (key.includes('NSE:')) key = key.replace('NSE:', '').split('-')[0];
    
    if (key.includes('SENSEX')) key = 'SENSEX';
    if (key === 'NIFTY 50' || (key.includes('NIFTY') && !key.includes('BANK') && !key.includes('FIN') && !key.includes('MID'))) key = 'NIFTY';
    if (key.includes('BANKNIFTY')) key = 'BANKNIFTY';
    if (key.includes('FINNIFTY')) key = 'FINNIFTY';
    if (key.includes('MIDCPNIFTY')) key = 'MIDCPNIFTY';

    if (DYNAMIC_LOT_SIZES[key]) return DYNAMIC_LOT_SIZES[key];
    if (FALLBACK_LOT_SIZES[key]) return FALLBACK_LOT_SIZES[key];

    return 1; 
}
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
// 6. LOGIC: STRATEGY ENGINE (STRICT SENSIBULL MATCHING)
// ==================================================================

// --- 1. CONFIGURATION: SENSIBULL DEFAULTS ---
function getSensibullConfig(symbol) {
    const s = symbol.toUpperCase();

    // 🔴 BANKNIFTY / NIFTY BANK
    if (s.includes('BANKNIFTY') || s.includes('NIFTYBANK') || s.includes('NIFTY BANK')) {
        return { width: 500, interval: 100 }; 
    } 
    // 🔴 FINNIFTY / NIFTY FINANCIAL
    else if (s.includes('FINNIFTY') || s.includes('FINANCIAL') || s.includes('FIN SERVICE')) {
        // Finnifty strikes are 50 points apart
        return { width: 200, interval: 50 };
    } 
    // 🔴 MIDCAP NIFTY
    else if (s.includes('MIDCP') || s.includes('MIDCAP') || s.includes('MID CP')) {
        // Midcap Select strikes are 25 points apart
        return { width: 100, interval: 25 };
    } 
    // 🔴 SENSEX
    else if (s.includes('SENSEX')) {
        return { width: 400, interval: 100 };
    }
    // 🔴 RELIANCE
    else if (s.includes('RELIANCE')) {
        return { width: 20, interval: 10 };
    }

    else if (s.includes('HDFCBANK') || s.includes('HDFC BANK')) {
        return { width: 10, interval: 5 };
    }
    else if (s.includes('ICICIBANK')) {
        return { width: 20, interval: 10 };
    }
     else if (s.includes('SBIN')) {
        return { width: 10, interval: 10 };
    }
    else if (s.includes('INFY')) {
        return { width: 40, interval: 100 };
    }
     else if (s.includes('TCS')) {
        return { width: 20, interval: 10 };
    }
    else if (s.includes('BHARATIARTL')) {
        return { width: 20, interval: 10 };
    }
    // DEFAULT (NIFTY 50 & OTHERS)
    return { width: 200, interval: 50 };
}

// --- 2. HELPERS ---
function getStrikeByPrice(chain, priceTarget, type) {
    let best = chain[0];
    let minDiff = Infinity;
    for (const node of chain) {
        const item = type === 'CE' ? node.CE : node.PE;
        if (item && item.ltp) {
            const d = Math.abs(item.ltp - priceTarget);
            if (d < minDiff) { minDiff = d; best = node; }
        }
    }
    return best;
}

function getStrikeByExactStrike(chain, targetStrike) {
    // 🎯 Finds the exact strike (e.g., 25650). 
    // If not found, finds the closest one to prevent crashes.
    const exact = chain.find(c => c.strike === targetStrike);
    if (exact) return exact;

    let best = chain[0];
    let minDiff = Infinity;
    for (const node of chain) {
        const d = Math.abs(node.strike - targetStrike);
        if (d < minDiff) { minDiff = d; best = node; }
    }
    return best;
}

// ==================================================================
// 🏗️ STRATEGY BUILDERS (COMPLETE SENSIBULL SUITE)
// ==================================================================

// --- 1. SINGLE LEGS ---

function buildLongCall(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return { name: "Long Call", legs: [{ action: "BUY", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 }] };
}

function buildShortCall(chain, atmStrike, config) {
    // Sensibull Default: Sell OTM Call (1 Width away)
    const node = getStrikeByExactStrike(chain, atmStrike + config.width);
    return { name: "Short Call", legs: [{ action: "SELL", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 }] };
}

function buildLongPut(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return { name: "Long Put", legs: [{ action: "BUY", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }] };
}

function buildShortPut(chain, atmStrike, config) {
    // Sensibull Default: Sell OTM Put (1 Width away)
    const node = getStrikeByExactStrike(chain, atmStrike - config.width);
    return { name: "Short Put", legs: [{ action: "SELL", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }] };
}

// --- 2. VERTICAL SPREADS (DIRECTIONAL) ---

function buildBullCallSpread(chain, atmStrike, config) {
    const buyNode = getStrikeByExactStrike(chain, atmStrike);
    const sellNode = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Bull Call Spread",
        legs: [
            { action: "BUY", type: "CE", strike: buyNode.strike, price: buyNode.CE.ltp, greeks: buyNode.CE, qty: 1 },
            { action: "SELL", type: "CE", strike: sellNode.strike, price: sellNode.CE.ltp, greeks: sellNode.CE, qty: 1 }
        ]
    };
}

function buildBullPutSpread(chain, atmStrike, config) {
    const sellNode = getStrikeByExactStrike(chain, atmStrike);
    const buyNode = getStrikeByExactStrike(chain, atmStrike - config.width);
    return {
        name: "Bull Put Spread",
        legs: [
            { action: "SELL", type: "PE", strike: sellNode.strike, price: sellNode.PE.ltp, greeks: sellNode.PE, qty: 1 },
            { action: "BUY", type: "PE", strike: buyNode.strike, price: buyNode.PE.ltp, greeks: buyNode.PE, qty: 1 }
        ]
    };
}

function buildBearCallSpread(chain, atmStrike, config) {
    const sellNode = getStrikeByExactStrike(chain, atmStrike);
    const buyNode = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Bear Call Spread",
        legs: [
            { action: "SELL", type: "CE", strike: sellNode.strike, price: sellNode.CE.ltp, greeks: sellNode.CE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyNode.strike, price: buyNode.CE.ltp, greeks: buyNode.CE, qty: 1 }
        ]
    };
}

function buildBearPutSpread(chain, atmStrike, config) {
    const buyNode = getStrikeByExactStrike(chain, atmStrike);
    const sellNode = getStrikeByExactStrike(chain, atmStrike - config.width);
    return {
        name: "Bear Put Spread",
        legs: [
            { action: "BUY", type: "PE", strike: buyNode.strike, price: buyNode.PE.ltp, greeks: buyNode.PE, qty: 1 },
            { action: "SELL", type: "PE", strike: sellNode.strike, price: sellNode.PE.ltp, greeks: sellNode.PE, qty: 1 }
        ]
    };
}

// --- 3. RATIO SPREADS ---

function buildCallRatioBackSpread(chain, atmStrike, config) {
    const sellNode = getStrikeByExactStrike(chain, atmStrike);
    const buyNode = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Call Ratio Back Spread",
        legs: [
            { action: "SELL", type: "CE", strike: sellNode.strike, price: sellNode.CE.ltp, greeks: sellNode.CE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyNode.strike, price: buyNode.CE.ltp, greeks: buyNode.CE, qty: 2 }
        ]
    };
}

function buildPutRatioBackSpread(chain, atmStrike, config) {
    const sellNode = getStrikeByExactStrike(chain, atmStrike);
    const buyNode = getStrikeByExactStrike(chain, atmStrike - config.width);
    return {
        name: "Put Ratio Back Spread",
        legs: [
            { action: "SELL", type: "PE", strike: sellNode.strike, price: sellNode.PE.ltp, greeks: sellNode.PE, qty: 1 },
            { action: "BUY", type: "PE", strike: buyNode.strike, price: buyNode.PE.ltp, greeks: buyNode.PE, qty: 2 }
        ]
    };
}

// --- 4. NEUTRAL & VOLATILITY ---

function buildShortStraddle(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return {
        name: "Short Straddle",
        legs: [
            { action: "SELL", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 },
            { action: "SELL", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }
        ]
    };
}

function buildLongStraddle(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return {
        name: "Long Straddle",
        legs: [
            { action: "BUY", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 },
            { action: "BUY", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }
        ]
    };
}

function buildShortStrangle(chain, atmStrike, config) {
    const sellPut = getStrikeByExactStrike(chain, atmStrike - config.width);
    const sellCall = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Short Strangle",
        legs: [
            { action: "SELL", type: "PE", strike: sellPut.strike, price: sellPut.PE.ltp, greeks: sellPut.PE, qty: 1 },
            { action: "SELL", type: "CE", strike: sellCall.strike, price: sellCall.CE.ltp, greeks: sellCall.CE, qty: 1 }
        ]
    };
}

function buildLongStrangle(chain, atmStrike, config) {
    const buyPut = getStrikeByExactStrike(chain, atmStrike - config.width);
    const buyCall = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Long Strangle",
        legs: [
            { action: "BUY", type: "PE", strike: buyPut.strike, price: buyPut.PE.ltp, greeks: buyPut.PE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyCall.strike, price: buyCall.CE.ltp, greeks: buyCall.CE, qty: 1 }
        ]
    };
}

function buildIronCondor(chain, atmStrike, config) {
    const sellPut = getStrikeByExactStrike(chain, atmStrike - config.width);
    const buyPut  = getStrikeByExactStrike(chain, atmStrike - (config.width * 2));
    const sellCall = getStrikeByExactStrike(chain, atmStrike + config.width);
    const buyCall  = getStrikeByExactStrike(chain, atmStrike + (config.width * 2));
    return {
        name: "Iron Condor",
        legs: [
            { action: "SELL", type: "PE", strike: sellPut.strike, price: sellPut.PE.ltp, greeks: sellPut.PE, qty: 1 },
            { action: "BUY", type: "PE", strike: buyPut.strike, price: buyPut.PE.ltp, greeks: buyPut.PE, qty: 1 },
            { action: "SELL", type: "CE", strike: sellCall.strike, price: sellCall.CE.ltp, greeks: sellCall.CE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyCall.strike, price: buyCall.CE.ltp, greeks: buyCall.CE, qty: 1 }
        ]
    };
}

function buildIronButterfly(chain, atmStrike, config) {
    const atmNode = getStrikeByExactStrike(chain, atmStrike);
    const buyPut  = getStrikeByExactStrike(chain, atmStrike - config.width);
    const buyCall = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Iron Butterfly",
        legs: [
            { action: "BUY", type: "PE", strike: buyPut.strike, price: buyPut.PE.ltp, greeks: buyPut.PE, qty: 1 },
            { action: "SELL", type: "PE", strike: atmNode.strike, price: atmNode.PE.ltp, greeks: atmNode.PE, qty: 1 },
            { action: "SELL", type: "CE", strike: atmNode.strike, price: atmNode.CE.ltp, greeks: atmNode.CE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyCall.strike, price: buyCall.CE.ltp, greeks: buyCall.CE, qty: 1 }
        ]
    };
}

function buildCallButterfly(chain, atmStrike, config) {
    // Buy 1 ITM (-2 Width), Sell 2 ATM, Buy 1 OTM (+2 Width)
    const atmNode = getStrikeByExactStrike(chain, atmStrike);
    const lowerNode = getStrikeByExactStrike(chain, atmStrike - (config.width * 2));
    const upperNode = getStrikeByExactStrike(chain, atmStrike + (config.width * 2));
    return {
        name: "Call Butterfly",
        legs: [
            { action: "BUY", type: "CE", strike: lowerNode.strike, price: lowerNode.CE.ltp, greeks: lowerNode.CE, qty: 1 },
            { action: "SELL", type: "CE", strike: atmNode.strike, price: atmNode.CE.ltp, greeks: atmNode.CE, qty: 2 },
            { action: "BUY", type: "CE", strike: upperNode.strike, price: upperNode.CE.ltp, greeks: upperNode.CE, qty: 1 }
        ]
    };
}

function buildJadeLizard(chain, atmStrike, config) {
    const sellPut = getStrikeByExactStrike(chain, atmStrike - config.width);
    const sellCall = getStrikeByExactStrike(chain, atmStrike + config.width);
    const buyCall = getStrikeByExactStrike(chain, atmStrike + (config.width * 2));
    return {
        name: "Jade Lizard",
        legs: [
            { action: "SELL", type: "PE", strike: sellPut.strike, price: sellPut.PE.ltp, greeks: sellPut.PE, qty: 1 },
            { action: "SELL", type: "CE", strike: sellCall.strike, price: sellCall.CE.ltp, greeks: sellCall.CE, qty: 1 },
            { action: "BUY", type: "CE", strike: buyCall.strike, price: buyCall.CE.ltp, greeks: buyCall.CE, qty: 1 }
        ]
    };
}

// --- 5. SYNTHETICS & HEDGING ---

function buildSyntheticLong(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return {
        name: "Synthetic Long",
        legs: [
            { action: "BUY", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 },
            { action: "SELL", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }
        ]
    };
}

function buildSyntheticShort(chain, atmStrike) {
    const node = getStrikeByExactStrike(chain, atmStrike);
    return {
        name: "Synthetic Short",
        legs: [
            { action: "SELL", type: "CE", strike: node.strike, price: node.CE.ltp, greeks: node.CE, qty: 1 },
            { action: "BUY", type: "PE", strike: node.strike, price: node.PE.ltp, greeks: node.PE, qty: 1 }
        ]
    };
}

function buildProtectivePut(chain, spot, atmStrike) {
    const putNode = getStrikeByExactStrike(chain, atmStrike);
    return {
        name: "Protective Put",
        legs: [
            { action: "BUY", type: "STOCK", price: spot, qty: 1 }, 
            { action: "BUY", type: "PE", strike: putNode.strike, price: putNode.PE.ltp, greeks: putNode.PE, qty: 1 }
        ]
    };
}

function buildCoveredCall(chain, spot, atmStrike, config) {
    // Buy Stock + Sell OTM Call
    const callNode = getStrikeByExactStrike(chain, atmStrike + config.width);
    return {
        name: "Covered Call",
        legs: [
            { action: "BUY", type: "STOCK", price: spot, qty: 1 },
            { action: "SELL", type: "CE", strike: callNode.strike, price: callNode.CE.ltp, greeks: callNode.CE, qty: 1 }
        ]
    };
}
// ==================================================================
// 🧠 TEAM LEAD'S ROBUST STRIKE SELECTION ENGINE (CLEAN VERSION)
// ==================================================================

// 1. Detect Strike Interval (e.g., 50 for NIFTY, 100 for BANKNIFTY)
function detectIntervalFromChain(chain) {
    const strikes = chain.map(c => c.strike).sort((a,b)=>a-b);
    const diffs = [];
    for (let i = 1; i < strikes.length; i++) {
        const d = Math.abs(strikes[i] - strikes[i-1]);
        if (d > 0) diffs.push(d);
    }
    return diffs.length ? Math.min(...diffs) : 50;
}

// 2. Round Target to Nearest Grid Step
function roundToNearestStrike(target, interval) {
    return Math.round(target / interval) * interval;
}

// 3. Helper: Choose Strike by Delta (Fallback)
function chooseByDelta(chain, side, targetDelta, atmIndex) {
    let best = null;
    let minDiff = Infinity;
    
    // Search reasonable window around ATM
    const start = Math.max(0, atmIndex - 15);
    const end = Math.min(chain.length - 1, atmIndex + 15);

    for(let i=start; i<=end; i++) {
        const node = chain[i];
        const leg = side === 'CE' ? node.CE : node.PE;
        if (leg && leg.delta) {
            const diff = Math.abs(Math.abs(leg.delta) - targetDelta);
            if (diff < minDiff) {
                minDiff = diff;
                best = node;
            }
        }
    }
    return best;
}

// 4. Advanced Strike Chooser (Prefers Liquidity & OI)
function chooseStrikeWithPreferences(chain, roundedTarget, side='PE', atmIndex=null, windowSteps=12) {
    const strikes = chain.map(c => c.strike);
    let nearestIndex = strikes.findIndex(s => s === roundedTarget);
    
    if (nearestIndex === -1) {
        let minD = Infinity;
        for (let i = 0; i < strikes.length; i++) {
            const d = Math.abs(strikes[i] - roundedTarget);
            if (d < minD) { minD = d; nearestIndex = i; }
        }
    }

    const start = Math.max(0, nearestIndex - windowSteps);
    const end = Math.min(chain.length - 1, nearestIndex + windowSteps);
    const cand = [];

    for (let i = start; i <= end; i++) {
        const node = chain[i];
        const leg = (side === 'CE') ? node.CE : node.PE;
        
        if (!leg || typeof leg.ltp === 'undefined' || leg.ltp <= 0) continue;

        // Score = OI + (Bonus for being near optimal Delta 0.15)
        const oi = Math.abs(leg.oi || 0); 
        const deltaAbs = Math.abs(leg.delta || 0);
        const score = oi + (1 - Math.abs(deltaAbs - 0.15)) * 100; 
        cand.push({ node, idx: i, score });
    }

    if (cand.length === 0) return null;

    cand.sort((a,b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Math.abs(a.node.strike - roundedTarget) - Math.abs(b.node.strike - roundedTarget);
    });

    return cand[0].node;
}

// 5. THE CORE LOGIC (Team Lead's Implementation)
function improvedStrikeSelection(chain, spot, dte) {
    const interval = detectIntervalFromChain(chain);
    
    // Find ATM
    let atmNode = chain[0];
    let minDiff = Infinity;
    chain.forEach(c => {
        const d = Math.abs(c.strike - spot);
        if(d < minDiff) { minDiff = d; atmNode = c; }
    });
    const atmIndex = chain.findIndex(x => x.strike === atmNode.strike);

    const atmIV = (atmNode && (atmNode.CE?.iv || atmNode.PE?.iv)) ? (atmNode.CE?.iv || atmNode.PE?.iv) : 15;
    
    const t = (dte < 1 ? 1 : dte) / 365;
    const em = spot * (atmIV / 100) * Math.sqrt(t);

    const lowerRaw = spot - em;
    const upperRaw = spot + em;
    const lowerRounded = roundToNearestStrike(lowerRaw, interval);
    const upperRounded = roundToNearestStrike(upperRaw, interval);

    console.log(`🎯 TARGETS: Lower ${lowerRounded} | Upper ${upperRounded} (Interval: ${interval})`);

    let sellPut = chooseStrikeWithPreferences(chain, lowerRounded, 'PE', atmIndex);
    let sellCall = chooseStrikeWithPreferences(chain, upperRounded, 'CE', atmIndex);

    if (!sellPut) sellPut = chooseByDelta(chain, 'PE', 0.16, atmIndex) || chain[Math.max(0, atmIndex - 2)];
    if (!sellCall) sellCall = chooseByDelta(chain, 'CE', 0.16, atmIndex) || chain[Math.min(chain.length - 1, atmIndex + 2)];

    if (sellPut.strike >= sellCall.strike) {
        const fallbackLower = chain[Math.max(0, atmIndex - 4)] || chain[0];
        const fallbackUpper = chain[Math.min(chain.length - 1, atmIndex + 4)] || chain[chain.length-1];
        if (fallbackLower.strike < fallbackUpper.strike) {
            sellPut = fallbackLower;
            sellCall = fallbackUpper;
        }
    }

    const sellPutIndex = chain.findIndex(x => x.strike === sellPut.strike);
    const sellCallIndex = chain.findIndex(x => x.strike === sellCall.strike);
    const buyPut = chain[Math.max(0, sellPutIndex - 2)] || chain[sellPutIndex];
    const buyCall = chain[Math.min(chain.length - 1, sellCallIndex + 2)] || chain[sellCallIndex];

    return { atmNode, atmIndex, interval, sellPut, buyPut, sellCall, buyCall, expectedMove: Math.round(em) };
}

// 6. MAIN SELECTOR WRAPPER
// ==================================================================
// 6. MAIN SELECTOR WRAPPER (UPDATED: RETURNS MULTIPLE OPTIONS)
// ==================================================================
function sensibullSelector(chain, spot, dte, signal="NEUTRAL") {
    // 1. Validation
    if (!spot || !chain || chain.length < 5) {
        return { error: "Insufficient market data to build strategies." };
    }
    
    // 2. Get Symbol Specific Config
    const symbol = chain[0].CE?.symbol || chain[0].PE?.symbol || "NIFTY";
    const config = getSensibullConfig(symbol);

    // 3. Round ATM
    const atmStrike = Math.round(spot / config.interval) * config.interval;
    
    // 4. Build ALL Strategies
    const strategies = [];
    
    // --- A. BULLISH ---
    strategies.push(buildBullCallSpread(chain, atmStrike, config));
    strategies.push(buildBullPutSpread(chain, atmStrike, config));
    strategies.push(buildCallRatioBackSpread(chain, atmStrike, config));
    strategies.push(buildLongCall(chain, atmStrike));
    
    // --- B. BEARISH ---
    strategies.push(buildBearPutSpread(chain, atmStrike, config));
    strategies.push(buildBearCallSpread(chain, atmStrike, config));
    strategies.push(buildPutRatioBackSpread(chain, atmStrike, config));
    strategies.push(buildLongPut(chain, atmStrike));
    
    // --- C. NEUTRAL ---
    strategies.push(buildIronCondor(chain, atmStrike, config));
    strategies.push(buildIronButterfly(chain, atmStrike, config));
    strategies.push(buildShortStraddle(chain, atmStrike));
    strategies.push(buildShortStrangle(chain, atmStrike, config));

    // 5. INTELLIGENT FILTERING
    // Instead of picking 1, we filter by the view (Signal)
    let recommendedStrategies = [];

    if (signal === "BULL") {
        // Return all Bullish strategies
        recommendedStrategies = strategies.filter(s => 
            s.name.includes("Bull") || s.name === "Long Call" || s.name.includes("Call Ratio")
        );
    } else if (signal === "BEAR") {
        // Return all Bearish strategies
        recommendedStrategies = strategies.filter(s => 
            s.name.includes("Bear") || s.name === "Long Put" || s.name.includes("Put Ratio")
        );
    } else { 
        // NEUTRAL
        recommendedStrategies = strategies.filter(s => 
            s.name.includes("Iron") || s.name.includes("Straddle") || s.name.includes("Strangle")
        );
    }

    // 6. Return Data Bundle
    return {
        spot,
        atmStrike,
        daysToExpiry: dte,
        configUsed: config,       
        marketCondition: signal,
        // Send back ALL recommended options, not just one "chosenStrategy"
        recommendedStrategies: recommendedStrategies, 
        allStrategies: strategies 
    };
}

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
    if (livePositions.length >= 5|| candleHistory.length < 25) return;
    const closes = candleHistory.map(c => c.close);
    const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const sma25 = closes.slice(-25).reduce((a, b) => a + b, 0) / 25;
    const prevCloses = closes.slice(0, -1);
    const prevSma7 = prevCloses.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const prevSma25 = prevCloses.slice(-26, -1).reduce((a, b) => a + b, 0) / 25;
    broadcast({ type: 'STATUS', message: `SMA7: ${sma7.toFixed(2)} | SMA25: ${sma25.toFixed(2)}` });
}

// ==================================================================
// UPDATED ALGO MANAGER (MULTI-TRADE SUPPORT)
// ==================================================================
function startAlgoManager() {
    setInterval(async () => {
        if (!fyersAccessToken || livePositions.length === 0) return;

        // LOOP through ALL positions (backwards to safely remove items)
        for (let i = livePositions.length - 1; i >= 0; i--) {
            try {
                const pos = livePositions[i];
                const quoteSymbol = pos.instrument || pos.symbol;

                // 1. Fetch Live Price
                const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, { 
                    params: { symbols: quoteSymbol }, 
                    headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` } 
                });

                const ltp = quotesRes.data.d?.[0]?.v?.lp;
                if (!ltp) continue;

                // 2. Calculate P&L for THIS specific trade
                const pnl = (ltp - pos.buyPrice) * pos.qty; // Note: Logic differs for SELL vs BUY orders
                // Adjust PNL logic based on BUY/SELL
                const multiplier = (pos.action === 'BUY') ? 1 : -1;
                const realPnl = (ltp - pos.buyPrice) * pos.qty * multiplier;

                const pnlPercent = ((ltp - pos.buyPrice) / pos.buyPrice) * 100 * multiplier;
                
                // 3. Broadcast Update
                broadcast({ 
                    type: 'PNL_UPDATE', 
                    tradeId: pos.orderId, // Unique ID is crucial now
                    symbol: pos.instrument || pos.symbol, // <--- ADDED
                    strategy: pos.strategy,
                    pnl: realPnl, 
                    pnlPercent: pnlPercent,
                    ltp: ltp 
                });

                // 4. Check Exit Conditions
                let exitReason = null;
                // Example: Target 10% / Stoploss 20%
                if (realPnl >= (pos.buyPrice * pos.qty * 0.10)) {
                    exitReason = "TARGET (10%)";
                } else if (realPnl <= -(pos.buyPrice * pos.qty * 0.20)) {
                    exitReason = "STOP LOSS (20%)";
                }

                // 5. Close Trade
                if (exitReason) {
                    console.log(`[${pos.instrument}] Trade Closed: ${exitReason}`);
                    
                    const tradeRecord = {
                        ...pos,
                        endTime: new Date().toLocaleTimeString(),
                        exitPrice: ltp,
                        pnl: realPnl,
                        reason: exitReason
                    };
                    logTradeToCSV(tradeRecord);

                    // REMOVE ONLY THIS TRADE from the array
                    livePositions.splice(i, 1); 
                    
                    broadcast({ type: 'TRADE_CLOSE', message: `Trade ${pos.instrument} Closed: ${exitReason}` });
                }

            } catch (e) {
                console.error(`Manager Error (Trade ${i}):`, e.message);
            }
        }
        
        // Update global state
        algoState.isInTrade = livePositions.length > 0;

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
// ==================================================================
// 4. FETCH OPTION CHAIN (DEEP SCAN & DIAGNOSTICS)
// ==================================================================
async function fetchMarketDataWithGreeks(symbol) {
    let inputSymbol = symbol.toUpperCase();
    let underlyingSymbolFyers = '';
    let userFriendlyKey = '';

    // 1. DYNAMIC SYMBOL MAPPING
    const indexMap = {
        'NIFTY': 'NSE:NIFTY50-INDEX',
        'BANKNIFTY': 'NSE:NIFTYBANK-INDEX',
        'FINNIFTY': 'NSE:FINNIFTY-INDEX',
        'MIDCPNIFTY': 'NSE:MIDCPNIFTY-INDEX',
        'SENSEX': 'BSE:SENSEX-INDEX',
        'BANKEX': 'BSE:BANKEX-INDEX'
    };

    if (indexMap[inputSymbol]) {
        underlyingSymbolFyers = indexMap[inputSymbol];
        userFriendlyKey = inputSymbol;
    } 
    else if (inputSymbol.includes(':')) {
        underlyingSymbolFyers = inputSymbol;
        userFriendlyKey = inputSymbol.split(':')[1].replace(/-EQ|-INDEX/g, '');
    } 
    else {
        underlyingSymbolFyers = `NSE:${inputSymbol}-EQ`;
        userFriendlyKey = inputSymbol;
    }

    let lotSize = getLotSizeForSymbol(userFriendlyKey || underlyingSymbolFyers);
    let spotPrice = 0;
    let effectiveVix = 14.5;

    // 2. FETCH QUOTES
    try {
        const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, { 
            params: { symbols: `${underlyingSymbolFyers},NSE:INDIAVIX-INDEX` }, 
            headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` } 
        });
        
        const spotNode = quotesRes.data.d ? quotesRes.data.d.find(q => q.n === underlyingSymbolFyers) : null;
        const vixNode = quotesRes.data.d ? quotesRes.data.d.find(q => q.n === 'NSE:INDIAVIX-INDEX') : null;

        spotPrice = spotNode?.v?.lp || 0;
        effectiveVix = vixNode?.v?.lp || 14.5;
        if (['ADANIENT', 'ADANIGREEN'].includes(userFriendlyKey)) effectiveVix = 25.0;
    } catch (e) { console.log(`⚠️ Quote fetch failed, using defaults.`); }

    // 3. ROBUST EXPIRY FETCHING
    const fyers = new fyersModel();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);

    let chainRes;
    let daysToExpiry = 0;
    let nearestExpiry = null; 
    let optionsList = [];

    try {
        // [FIX 1] Increase strikecount to 20 to find "hidden" weeklies
        const metaRes = await fyers.getOptionChain({ 
            symbol: underlyingSymbolFyers, 
            strikecount: 20, 
            timestamp: "" 
        });

        if (metaRes.data && metaRes.data.expiryData) {
            const rawExpiries = metaRes.data.expiryData;

            // Permissive Filter (Includes Yesterday)
            const cutoffTime = new Date();
            cutoffTime.setHours(0, 0, 0, 0);
            cutoffTime.setDate(cutoffTime.getDate() - 1); 

            const validExpiries = rawExpiries.filter(e => {
                const unixTime = Number(e.expiry); 
                if (isNaN(unixTime)) return false; 
                const expiryDate = new Date(unixTime * 1000);
                return expiryDate.getTime() >= cutoffTime.getTime();
            });

            validExpiries.sort((a, b) => Number(a.expiry) - Number(b.expiry));

            if (validExpiries.length > 0) {
                nearestExpiry = validExpiries[0];
                console.log(`✅ [${userFriendlyKey}] Selected Expiry: ${nearestExpiry.date} (Ts: ${nearestExpiry.expiry})`);
                
                // [FIX 2] DIAGNOSTIC CHECK
                const isIndex = ['NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY'].includes(userFriendlyKey);
                const tempDte = (new Date(Number(nearestExpiry.expiry)*1000) - new Date()) / (1000*3600*24);
                
                if (isIndex && tempDte > 7) {
                    console.warn(`⚠️ [${userFriendlyKey}] Warning: Weekly missing? Closest found is ${tempDte.toFixed(1)} days away.`);
                    
                    // 🔍 PRINT WHAT THE API ACTUALLY SENT
                    console.log(`🔍 RAW API RESPONSE for ${userFriendlyKey}:`);
                    rawExpiries.slice(0, 5).forEach(e => {
                         const d = new Date(Number(e.expiry)*1000);
                         console.log(`   - Date: ${e.date} | TS: ${e.expiry} | Valid? ${d.getTime() >= cutoffTime.getTime()}`);
                    });
                }
            } else {
                console.warn(`⚠️ [${userFriendlyKey}] Filter removed all dates. Fallback to raw[0].`);
                nearestExpiry = rawExpiries[0];
            }

            if (nearestExpiry && nearestExpiry.expiry) {
                const unixTime = Number(nearestExpiry.expiry);
                if (!isNaN(unixTime)) {
                    const expiryDateObj = new Date(unixTime * 1000);
                    const now = new Date();
                    const diffTime = expiryDateObj.getTime() - now.getTime();
                    daysToExpiry = Math.max(0, diffTime / (1000 * 60 * 60 * 24));
                    console.log(`📅 DTE: ${daysToExpiry.toFixed(4)} days`);

                    chainRes = await fyers.getOptionChain({ 
                        symbol: underlyingSymbolFyers, 
                        strikecount: 100, 
                        timestamp: unixTime 
                    });
                }
            }
        }
    } catch (error) { console.error(`❌ Chain Fetch Error (${userFriendlyKey}):`, error.message); }

    // 4. PROCESS CHAIN (Standard)
    const strikeMap = new Map();
    if (chainRes?.data?.optionsChain) {
        if (!spotPrice) spotPrice = chainRes.data.optionsChain[Math.floor(chainRes.data.optionsChain.length/2)].strike_price;
        chainRes.data.optionsChain.forEach(opt => {
            if (!strikeMap.has(opt.strike_price)) strikeMap.set(opt.strike_price, { strike: opt.strike_price, CE: {}, PE: {} });
            const item = strikeMap.get(opt.strike_price);
            const greeks = estimateGreeks(spotPrice, opt.strike_price, daysToExpiry, opt.ltp, opt.option_type, effectiveVix);
            if (opt.option_type === 'CE') item.CE = { ltp: opt.ltp, symbol: opt.symbol, oi: opt.oi, ...greeks };
            else item.PE = { ltp: opt.ltp, symbol: opt.symbol, oi: opt.oi, ...greeks };
        });
        optionsList = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
    }

    return {
        symbol: userFriendlyKey,
        fyersSymbol: underlyingSymbolFyers,
        spot: spotPrice,
        vix: effectiveVix,
        daysToExpiry: daysToExpiry, 
        expiryDate: (nearestExpiry) ? nearestExpiry.date : "N/A", 
        options: optionsList,
        lotSize: lotSize,
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
        
        // --- USING TEAM LEAD'S SENSIBULL SELECTOR ---
        const decision = sensibullSelector(marketData.options, marketData.spot, marketData.daysToExpiry, signal.direction);
        
        if (decision.error) {
            return res.status(400).json({ decision: 'SKIP', reason: decision.error });
        }

        decision.decision = 'PLACE';
        decision.signal = signal.direction; 
        
        if (decision.chosenStrategy) {
            decision.strategy = decision.chosenStrategy.name;
            decision.legs = decision.chosenStrategy.legs;
        }

        res.json(decision);
    } catch (error) { res.status(500).json({ error: "Engine Failed", details: error.message }); }
});

// ==================================================================
// 🚀 TRADE EXECUTION ROUTE (LIVE + PAPER SUPPORT)
// ==================================================================
app.post('/api/execute-trade', async (req, res) => {
    // 1. Auth Check
    if (!fyersAccessToken) return res.status(401).json({ error: 'Not authenticated.' });
    
    try {
        const { strategy, decisionData } = req.body;
        
        // 2. Validate Data
        if (!decisionData || !decisionData.legs || decisionData.legs.length === 0) {
            return res.status(400).json({ error: "Invalid trade data: No legs found." });
        }

        console.log(`\n🚀 Executing Strategy: ${strategy} (${decisionData.legs.length} Legs)`);
        console.log(`📊 Execution Mode: ${TRADE_MODE}`); // Defined at top of file

        const executedLegs = [];
        const errors = [];

        // OPTIMIZATION: Fetch Market Data ONCE if needed for symbol resolution
        // (Instead of fetching inside the loop 4 times)
        let fallbackMarketData = null;
        const needsFallback = decisionData.legs.some(l => !l.symbol && !l.greeks?.symbol);
        
        if (needsFallback) {
            console.log("🔍 Some symbols missing. Fetching live option chain for resolution...");
            fallbackMarketData = await fetchMarketDataWithGreeks(algoState.symbol);
        }

        // 3. LOOP THROUGH LEGS
        for (const leg of decisionData.legs) {
            try {
                // --- A. Resolve Symbol ---
                let actualSymbol = leg.symbol || leg.greeks?.symbol; 

                // Fallback Logic
                if (!actualSymbol && fallbackMarketData) {
                    const opt = fallbackMarketData.options.find(o => o.strike === Number(leg.strike));
                    if (opt) {
                        const type = leg.type || leg.optionType;
                        actualSymbol = (type === 'CE') ? opt.CE?.symbol : opt.PE?.symbol;
                    }
                }

                if (!actualSymbol) throw new Error(`Could not resolve symbol for Strike ${leg.strike}`);

                // --- B. Calculate Quantity ---
                // leg.qty is usually 'Lots' from the strategy engine.
                // We multiply by Lot Size (e.g. 1 lot * 75 = 75 qty)
                const quantity = (leg.qty || 1) * (algoState.lotSize || 1); 
                const entryPrice = leg.price || leg.greeks?.ltp || 0;

                console.log(`👉 [${leg.action}] ${quantity}x ${actualSymbol} @ ₹${entryPrice}`);

                // --- C. EXECUTE BASED ON MODE ---
                let orderId = `SIM-${Date.now()}-${Math.floor(Math.random()*1000)}`; // Default ID

                if (TRADE_MODE === 'LIVE') {
                    // 🔴 LIVE EXECUTION (Real Money)
                    const fyers = new fyersModel();
                    fyers.setAppId(fyersAppId);
                    fyers.setAccessToken(fyersAccessToken);

                    const orderReq = {
                        symbol: actualSymbol,
                        qty: quantity,
                        type: 2, // Market Order
                        side: leg.action === 'BUY' ? 1 : -1,
                        productType: "MARGIN", // Intraday/Margin
                        limitPrice: 0,
                        stopPrice: 0,
                        validity: "DAY",
                        disclosedQty: 0,
                        offlineOrder: false,
                    };

                    const response = await fyers.place_order(orderReq);
                    if (response.s !== 'ok') throw new Error(response.message || "Order Failed");
                    
                    orderId = response.id;
                    console.log(`✅ LIVE ORDER PLACED. ID: ${orderId}`);
                
                } else {
                    // 🟢 PAPER EXECUTION
                    console.log(`✅ SIMULATION SUCCESS. ID: ${orderId}`);
                }

                // --- D. RECORD POSITION (For P&L Tracking) ---
                const newPosition = {
                    orderId: orderId,
                    instrument: actualSymbol,
                    buyPrice: entryPrice,
                    qty: quantity,
                    action: leg.action,
                    strategy: strategy,
                    strike: leg.strike,
                    type: leg.type || leg.optionType,
                    timestamp: new Date(),
                    pnl: 0 // Will be updated by P&L monitor
                };

                executedLegs.push(newPosition);

            } catch (legError) {
                console.error(`❌ Leg Failed (${leg.strike}):`, legError.message);
                errors.push({ strike: leg.strike, error: legError.message });
            }
        }

        // 4. Update Global Portfolio
        if (executedLegs.length > 0) {
            livePositions = [...livePositions, ...executedLegs];
            algoState.isInTrade = true;

            res.json({ 
                success: true, 
                message: `Executed ${executedLegs.length} legs (${TRADE_MODE}).`, 
                positions: executedLegs,
                errors: errors.length > 0 ? errors : null
            });
        } else {
            res.status(500).json({ error: "All legs failed.", details: errors });
        }

    } catch (error) {
        console.error("Critical Execution Error:", error.message);
        res.status(500).json({ error: "Execution Failed", details: error.message });
    }
});

app.post('/api/python-calculation', async (req, res) => {
    try {
        const payload = req.body;
        console.log("🚀 Sending data to Flask Engine...");

        // CALL FLASK (Port 5001)
        const pythonRes = await axios.post('http://127.0.0.1:5001/calculate-strategy', payload);

        // Return Python's answer to Frontend
        res.json(pythonRes.data);

    } catch (error) {
        console.error("❌ Flask Connection Failed:", error.message);
        res.status(500).json({ error: "Python Engine unavailable" });
    }
});

app.post('/calculate', async (req, res) => {
    try {
        const { strategy, strike, strike1, strike2, stockPrice, symbol, lotSize } = req.body;
        
        // 1. Prepare Parameters
        const params = { ...req.body };

        // 2. --- DYNAMIC LOT SIZE LOGIC ---
        // If frontend didn't provide a valid lot size, look it up on the backend
        if (symbol && (!lotSize || Number(lotSize) === 1)) {
            const liveSize = getLotSizeForSymbol(symbol);
            
            if (liveSize && liveSize > 1) {
                params.lotSize = liveSize;
                console.log(`✅ Using Global/CSV Lot Size for ${symbol}: ${liveSize}`);
            } else {
                // Fallback Logic
                const cleanSymbol = symbol.replace('NSE:', '').replace('BSE:', '');
                if (FALLBACK_LOT_SIZES[symbol] || FALLBACK_LOT_SIZES[cleanSymbol]) {
                    params.lotSize = FALLBACK_LOT_SIZES[symbol] || FALLBACK_LOT_SIZES[cleanSymbol];
                    console.log(`✅ Applied Fallback Lot Size: ${params.lotSize}`);
                } else {
                    params.lotSize = 1;
                }
            }
        } else if (!params.lotSize) {
             params.lotSize = 1; 
        }
        // ---------------------------------

        // 3. Call the New Calculator Engine
        // Note: We don't need to generate spotPrices[] anymore; the engine does it.
        const result = calculateStrategy(strategy, params);
        
        // 4. Format Output for Frontend
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
        // 1. Normalize the incoming symbol to match your Cache Keys
        let key = symbol.toUpperCase();
        
        // Remove "NSE:", "-INDEX", etc. to match how you store it in 'liveDataCache'
        if (key.includes('NSE:')) key = key.replace('NSE:', '');
        if (key.includes('-INDEX')) key = key.replace('-INDEX', '');
        if (key.includes('NIFTY 50')) key = 'NIFTY'; // <--- FIX FOR YOUR DROPDOWN

        // 🔍 DEBUG LOG: See what we are looking for
        // console.log(`🔍 LOOKUP: Key [${key}] | Strike [${strike}] | Type [${optionType}]`);

        const cached = liveDataCache[key];
        
        if (!cached || !cached.data) {
            console.log(`❌ CACHE MISS for [${key}]. Available Keys:`, Object.keys(liveDataCache));
            return 0.05; // Default error value
        }

        // 2. Find the Option
        const opt = cached.data.options.find(o => o.strike === Number(strike));
        
        if (!opt) {
            console.log(`❌ STRIKE MISS: [${strike}] not found in [${key}] chain.`);
            return 0.05;
        }

        // 3. Return Price
        const price = (optionType === 'CE') ? opt.CE.ltp : opt.PE.ltp;
        return price || 0.05;

    } catch (err) { 
        console.error("Lookup Error:", err.message);
        return 0.05; 
    }
}
app.post('/api/paper-trade', (req, res) => {
    try {
        const { symbol, strategyType, legs } = req.body;
        let totalCost = 0;
        const procLegs = [];
        for (const leg of legs) {
            const price = findCurrentPrice(symbol, leg.strike, leg.type || leg.optionType); // Handle both formats
            const finalPrice = (price !== null) ? price : leg.price;
            if (!finalPrice) throw new Error(`Price not found for ${leg.strike} ${leg.type}`);
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
            const price = findCurrentPrice(trade.symbol, leg.strike, leg.type || leg.optionType);
            if (price) {
                leg.currentPrice = price;
                leg.pnl = (price - leg.entryPrice) * (leg.action === 'BUY' ? 1 : -1) * leg.qty;
                netPnl += leg.pnl;
            }
        });
        trade.currentNetPnl = netPnl;
    });
}, 2000);

if (fyersAccessToken) {
    console.log("🚀 Manual Token Detected in .env");
    console.log("🔄 Auto-starting Algo System...");
    startAlgoSystem();
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
