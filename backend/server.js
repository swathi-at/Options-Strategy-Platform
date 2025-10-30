require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const otpauth = require('otpauth');
const crypto = require('crypto');
const { calculateStrategy } = require('./strategyengine');
const FyersAPI = require("fyers-api-v3").fyersModel; // <-- Import Fyers Library

const app = express();
app.use(cors());
app.use(express.json());

const liveDataCache = {}; // Our 'pantry' to store live data
// --- Make sure CACHE_DURATION_MS is also defined nearby ---
const CACHE_DURATION_MS = 20 * 1000;

// --- Fyers API Configuration ---
const FYERS_APP_ID = process.env.FYERS_CLIENT_ID; // e.g., XIMVLEN5IZ-100
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_TOTP_KEY = process.env.FYERS_TOTP_KEY;
const FYERS_PIN = process.env.FYERS_PIN;
const FYERS_FY_ID = process.env.FYERS_FY_ID;
const FYERS_REDIRECT_URI = process.env.FYERS_REDIRECT_URI || 'https://www.google.com/'; // Use env variable or default
const FYERS_API_BASE_URL_V3 = 'https://api-t1.fyers.in/api/v3';
const FYERS_API_DATA_URL_V3 = 'https://api-t1.fyers.in/data';
const FYERS_API_BASE_URL_V2 = 'https://api-t2.fyers.in/vagator/v2';

// Initialize Fyers Model globally
const fyers = new FyersAPI();

// Set App ID
if (FYERS_APP_ID) {
    fyers.setAppId(FYERS_APP_ID);
    console.log("Fyers App ID set.");
} else {
    console.error("CRITICAL ERROR: FYERS_CLIENT_ID (App ID) not found in .env file!");
}

let fyersAccessToken = null; // Store the final access token globally
function getEncodedString(string) {
    // Ensure input is a string before encoding
    return Buffer.from(String(string)).toString('base64');
}

// --- Fyers Login Endpoint (Working) ---
app.post('/api/fyers/login', async (req, res) => {
    try {
        console.log("Starting Fyers automated login...");

        // Step 1: Send Login OTP Request
        console.log("Step 1: Sending Login OTP request...");
        const otpUrl = `${FYERS_API_BASE_URL_V2}/send_login_otp_v2`;
        console.log("--- DEBUG: Calling Step 1 URL:", otpUrl);
        const otpRes = await axios.post(otpUrl,
            { fy_id: getEncodedString(FYERS_FY_ID), app_id: "2" },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const requestKeyOTP = otpRes.data?.request_key;
        if (!requestKeyOTP) throw new Error(`Step 1 Failed. Response: ${JSON.stringify(otpRes.data)}`);
        console.log("Step 1 Successful.");

        // Step 2: Verify TOTP
        console.log("Step 2: Verifying TOTP...");
        let totp = new otpauth.TOTP({ issuer: "Fyers", label: "Fyers", algorithm: "SHA1", digits: 6, period: 30, secret: FYERS_TOTP_KEY });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const otpCode = totp.generate();
        console.log("Generated TOTP:", otpCode);
        const verifyOtpRes = await axios.post(`${FYERS_API_BASE_URL_V2}/verify_otp`, { request_key: requestKeyOTP, otp: otpCode }, { timeout: 10000 });
        console.log("Step 2 - Full response from /verify_otp:", JSON.stringify(verifyOtpRes.data, null, 2));
        const requestKeyPin = verifyOtpRes.data?.request_key;
        if (!requestKeyPin) throw new Error(`Step 2 Failed. Response: ${JSON.stringify(verifyOtpRes.data)}`);
        console.log("Step 2 Successful.");

        // Step 3: Verify PIN & Get Intermediate Token
        console.log("Step 3: Verifying PIN...");
        const session = axios.create({ timeout: 10000 });
        const verifyPinRes = await session.post(`${FYERS_API_BASE_URL_V2}/verify_pin_v2`, { request_key: requestKeyPin, identity_type: "pin", identifier: getEncodedString(FYERS_PIN) });
        const intermediateAccessToken = verifyPinRes.data?.data?.access_token;
        if (!intermediateAccessToken) throw new Error(`Step 3 Failed. Response: ${JSON.stringify(verifyPinRes.data)}`);
        console.log("Step 3 Successful.");

        // Step 4: Get Auth Code using Intermediate Token
        console.log("Step 4: Getting Auth Code...");
        const appIdForToken = FYERS_APP_ID.endsWith('-100') ? FYERS_APP_ID.substring(0, FYERS_APP_ID.length - 4) : FYERS_APP_ID;
        session.defaults.headers.common['Authorization'] = `Bearer ${intermediateAccessToken}`;
        const tokenPayload = { fyers_id: FYERS_FY_ID, app_id: appIdForToken, redirect_uri: FYERS_REDIRECT_URI, appType: "100", code_challenge: "", state: "None", scope: "", nonce: "", response_type: "code", create_cookie: true };
        const tokenRes = await session.post(`${FYERS_API_BASE_URL_V3}/token`, tokenPayload, {
            validateStatus: function (status) { return (status >= 200 && status < 300) || status === 308; }
        });
        const authCodeUrl = tokenRes.data?.Url;
        if (!authCodeUrl) throw new Error(`Step 4 Failed API Call. Response: ${JSON.stringify(tokenRes.data)}`);
        let authCode = null;
        try { // Robust parsing
            const paramsString = authCodeUrl.split('?')[1]; if (!paramsString) throw new Error("No query string found");
            const paramsArray = paramsString.split('&');
            for (const param of paramsArray) { const [key, value] = param.split('='); if (key === 'auth_code') { authCode = value; break; } }
            if (!authCode) throw new Error("auth_code param not found");
        } catch (parseError) { throw new Error("Step 4 Failed Parsing: " + parseError.message); }
        console.log("Step 4 Successful.");

        // Step 5: Exchange Auth Code for Final Access Token
        console.log("Step 5: Exchanging Auth Code for Final Access Token...");
        const hashCreator = crypto.createHash('sha256');
        const hashInput = `${FYERS_APP_ID}:${FYERS_SECRET_KEY}`;
        hashCreator.update(hashInput);
        const appIdHashValue = hashCreator.digest('hex');
        const finalTokenPayload = { grant_type: 'authorization_code', code: authCode, appIdHash: appIdHashValue }; // Correct key
        const finalTokenRes = await axios.post(`${FYERS_API_BASE_URL_V3}/validate-authcode`, finalTokenPayload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

        if (finalTokenRes.data && finalTokenRes.data.access_token) {
            fyersAccessToken = finalTokenRes.data.access_token;
            fyers.setAccessToken(fyersAccessToken); // <-- Set token in the library instance
            console.log("SUCCESS! Final Fyers Access Token received:", fyersAccessToken ? fyersAccessToken.substring(0, 10) + '...' : 'None');
            res.json({ success: true, message: "Fyers login successful!", accessToken: fyersAccessToken });
        } else {
             throw new Error(`Step 5 Failed. Response: ${JSON.stringify(finalTokenRes.data)}`);
        }

    } catch (error) {
         console.error("Fyers automated login error:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
         if (error.stack) { console.error("Stack Trace:", error.stack); }
        let errorMessage = 'Fyers automated login failed.';
        // ... (Error message details) ...
        res.status(500).json({ success: false, error: errorMessage, details: error.response ? error.response.data : {} });
    }
});


// --- Fyers Historical Data Endpoint (Using Library with Epoch & date_format: 0) ---
app.get('/api/historical-data', async (req, res) => {
    const { symbol, resolution, from, to } = req.query; // Dates expected as YYYY-MM-DD

    if (!symbol || !resolution || !from || !to) {
        return res.status(400).json({ error: 'Missing required query parameters: symbol, resolution, from (YYYY-MM-DD), to (YYYY-MM-DD). Ensure symbol is in Fyers format (e.g., NSE:RELIANCE-EQ)' });
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
         return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
    }
    if (new Date(from) > new Date(to)) {
        return res.status(400).json({ error: "'from' date cannot be after 'to' date." });
    }

    if (!fyersAccessToken) {
        return res.status(401).json({ error: 'Not authenticated with Fyers. Please login first via /api/fyers/login' });
    }

    try {
        // --- Convert YYYY-MM-DD to Epoch Timestamp (Seconds) ---
        const fromDate = new Date(from);
        const toDate = new Date(to);
        fromDate.setHours(0, 0, 0, 0); // Start of day LOCAL TIME
        toDate.setHours(23, 59, 59, 999); // End of day LOCAL TIME
        const fromEpoch = Math.floor(fromDate.getTime() / 1000);
        const toEpoch = Math.floor(toDate.getTime() / 1000);
        // --- End Conversion ---

        // --- PAYLOAD ACCORDING TO LAST ERROR MESSAGE ---
        const historyPayload = {
            symbol: symbol,
            resolution: resolution,
            date_format: "0", // <-- Set date_format to 0
            range_from: String(fromEpoch), // <-- Send epoch timestamp as string
            range_to: String(toEpoch),     // <-- Send epoch timestamp as string
            cont_flag: "1"
        };
        // --- END PAYLOAD ---

        console.log(`Fetching historical data using library for: ${symbol} (${resolution}) from ${fromEpoch} to ${toEpoch} (date_format=0)`);
        console.log("Payload for getHistory:", JSON.stringify(historyPayload, null, 2));

        // Ensure the token is set in the fyers library instance
        if (!fyers.access_token) { // Check internal property
             console.log("Re-setting access token in fyers library instance...");
             if(fyersAccessToken) {
                 fyers.setAccessToken(fyersAccessToken);
             } else {
                 throw new Error("Access token is null, cannot proceed.");
             }
        }

        // --- Use the library's getHistory method ---
        const historyResponse = await fyers.getHistory(historyPayload);
        console.log("Library getHistory response:", JSON.stringify(historyResponse, null, 2));

        // --- Check Library Response Structure ---
        if (!historyResponse || historyResponse.s !== 'ok' || !historyResponse.candles) {
             const fyersMessage = historyResponse?.message || 'Unknown error structure';
             throw new Error(`Failed to fetch valid historical data via library. Message: ${fyersMessage}. Raw Response: ${JSON.stringify(historyResponse)}`);
        }
        console.log(`Received ${historyResponse.candles.length} candles via library.`);

        // Format candles
        const formattedCandles = historyResponse.candles.map(c => ({
            timestamp: c[0], date: new Date(c[0] * 1000).toISOString().split('T')[0],
            open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
        }));

        res.json({
            symbol: symbol,
            resolution: resolution,
            candles: formattedCandles
        });

    } catch (error) {
        const errorMessage = error?.message || "Unknown error";
        const errorDetails = error?.response?.data || error?.data || (error?.s ? error : {});
        console.error("Error fetching historical data via library:", errorMessage);
        console.error("Details:", JSON.stringify(errorDetails, null, 2));
         if (error.stack) { console.error("Stack Trace:", error.stack); }
        if (errorMessage.includes("token") || errorMessage.includes("unauthorized") || errorMessage.includes("authenticate") || errorDetails?.code === -117 || errorDetails?.code === -435) {
             fyersAccessToken = null; fyers.setAccessToken(null);
             return res.status(401).json({ error: 'Fyers token expired or invalid...' });
        }
        res.status(500).json({ error: 'Failed to fetch historical data...', details: errorDetails });
    }
});
// --- Fyers Live Data Endpoint (Spot + Option Chain) [CORRECTED CACHING] ---
app.get('/api/live-data/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const currentTime = Date.now();

    // --- 1. NORMALIZE SYMBOL FIRST ---
    let underlyingSymbolFyers = ''; // Symbol for Fyers API
    let userFriendlySymbol = '';    // Normalized key for cache & response

    if (symbol.toUpperCase().includes('NIFTY50') || symbol.toUpperCase() === 'NIFTY') {
        underlyingSymbolFyers = 'NSE:NIFTY50-INDEX';
        userFriendlySymbol = 'NIFTY';
    } else if (symbol.toUpperCase().includes('BANKNIFTY') || symbol.toUpperCase() === 'BANK') {
        underlyingSymbolFyers = 'NSE:NIFTYBANK-INDEX';
        userFriendlySymbol = 'BANKNIFTY';
    } else if (symbol.includes('-EQ')) {
        underlyingSymbolFyers = symbol.toUpperCase(); // e.g., NSE:RELIANCE-EQ
        userFriendlySymbol = symbol.split(':')[1].split('-')[0]; // e.g., RELIANCE
    } else {
        // Fallback for unrecognized formats. This might fail at the API level if not correct.
        // Or return an error immediately:
        return res.status(400).json({ error: `Symbol format ${symbol} not recognized. Use NIFTY, BANKNIFTY, or Fyers format (e.g., NSE:RELIANCE-EQ).` });
    }
    // --- End Symbol Logic ---


    // --- 2. Check Cache *USING NORMALIZED KEY* ---
    if (liveDataCache[userFriendlySymbol] && (currentTime - liveDataCache[userFriendlySymbol].timestamp < CACHE_DURATION_MS)) {
        console.log(`Cache HIT for symbol: ${userFriendlySymbol}`);
        return res.json(liveDataCache[userFriendlySymbol].data); // Serve from cache
    }
    console.log(`Cache MISS for symbol: ${userFriendlySymbol}. Fetching live data...`);
    // --- End Cache Check ---


    // --- 3. Check Authentication ---
    if (!fyersAccessToken) {
        return res.status(401).json({ error: 'Not authenticated with Fyers. Please login first via /api/fyers/login' });
    }

    // --- 4. Check Fyers Data URL Config ---
    const baseUrlDataV3 = String(FYERS_API_DATA_URL_V3 || '').trim();
    if (!baseUrlDataV3 || !baseUrlDataV3.startsWith('http')) {
        console.error("CRITICAL ERROR: FYERS_API_DATA_URL_V3 env variable is missing or invalid!");
        return res.status(500).json({ error: "Server configuration error." });
    }

    try {
        // --- 5. Fetch Live Data (Spot Price using axios) ---
        const quotesApiHeaders = {
            'Authorization': `${FYERS_APP_ID}:${fyersAccessToken}`, // Correct format for /quotes GET
            'Content-Type': 'application/json'
        };
        console.log(`Fetching quotes for: ${underlyingSymbolFyers}`);
        const quotesUrl = `${baseUrlDataV3}/quotes`; // Correct URL: .../data/quotes
        const quotesResponse = await axios.get(quotesUrl, {
            params: { symbols: underlyingSymbolFyers },
            headers: quotesApiHeaders,
            timeout: 10000
        });

        const spotPrice = quotesResponse.data?.d?.[0]?.v?.lp;
        if (spotPrice === undefined || spotPrice === null) {
            throw new Error(`Could not extract spot price (LTP) from quotes response. Raw: ${JSON.stringify(quotesResponse.data)}`);
        }
        console.log(`Received Spot Price: ${spotPrice}`);

        // --- 6. Fetch Live Data (Option Chain using Fyers Library) ---
        console.log(`Fetching option chain via library for: ${underlyingSymbolFyers}`);
        const optionChainPayload = {
            symbol: underlyingSymbolFyers,
            strikecount: 50,
            timestamp: "" // Empty string for nearest expiry
        };
        console.log("Payload for fyers.getOptionChain:", JSON.stringify(optionChainPayload, null, 2));

        // Ensure token is set in the library instance
        if (!fyers.access_token || fyers.access_token !== fyersAccessToken) {
            console.log("Re-setting access token in fyers library instance...");
            if (!fyersAccessToken) {
                throw new Error("Cannot fetch options, Fyers access token is missing.");
            }
            fyers.setAccessToken(fyersAccessToken);
        }

        const optionChainResponse = await fyers.getOptionChain(optionChainPayload);
        // console.log("Full option chain response received from library."); // Optional: too verbose

        if (!optionChainResponse || optionChainResponse.s !== 'ok' || !optionChainResponse.data || !optionChainResponse.data.optionsChain) {
            console.error("Invalid structure received from fyers.getOptionChain:", JSON.stringify(optionChainResponse, null, 2));
            throw new Error(`Failed to fetch valid option chain via library. Status: ${optionChainResponse?.s}, Message: ${optionChainResponse?.message}`);
        }

        // --- 7. Parse and Format Data (Including OI and Volume) ---
        const fyersOptionsData = optionChainResponse.data.optionsChain;
        const expiryDateStr = optionChainResponse.data.expiryData?.[0]?.date; // e.g., "04-11-2025"
        let expiryDateForOutput = "YYYY-MM-DD";
        if (expiryDateStr) {
            try { // Convert DD-MM-YYYY to YYYY-MM-DD
                const parts = expiryDateStr.split('-');
                expiryDateForOutput = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } catch (e) { console.error("Could not parse expiry date:", expiryDateStr); }
        }

        const strikeMap = new Map();
        for (const option of fyersOptionsData) {
            if (option.strike_price === -1) continue; // Skip dummy spot price entry
            const strike = option.strike_price;

            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, {
                    strike: strike,
                    CE_Ltp: null, CE_Oi: null, CE_Volume: null,
                    PE_Ltp: null, PE_Oi: null, PE_Volume: null
                });
            }
            const entry = strikeMap.get(strike);

            if (option.option_type === "CE") {
                entry.CE_Ltp = option.ltp;
                entry.CE_Oi = option.oi;
                entry.CE_Volume = option.volume;
            } else if (option.option_type === "PE") {
                entry.PE_Ltp = option.ltp;
                entry.PE_Oi = option.oi;
                entry.PE_Volume = option.volume;
            }
        }
        const sortedOptionsData = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

        const responseData = {
            symbol: userFriendlySymbol, // Use NIFTY, RELIANCE etc.
            spot: spotPrice,
            options: sortedOptionsData, // Includes OI and Volume
            expiry: expiryDateForOutput,
        };

        // --- 8. Store in Cache *USING NORMALIZED KEY* ---
        liveDataCache[userFriendlySymbol] = {
            timestamp: currentTime,
            data: responseData
        };
        console.log(`Cached fresh data (with OI/Vol) for symbol: ${userFriendlySymbol}`);
        // --- End Cache Store ---

        res.json(responseData); // Send the fresh data

    } catch (error) {
        // --- Standard Error Handling ---
        const errorMessage = error?.message || "Unknown error";
        const errorDetails = error?.response?.data || error?.data || (error?.s ? error : {});
        console.error(`Error fetching live data for ${userFriendlySymbol}:`, errorMessage);
        console.error("Details:", JSON.stringify(errorDetails, null, 2));
        if (error.stack) { console.error("Stack Trace:", error.stack); }

        const statusCode = error.response?.status;
        const errorCode = errorDetails?.code;

        if (statusCode === 401 || statusCode === 429 || errorCode === -117 || errorCode === -435 || errorCode === -15 || errorMessage.includes('token')) {
            fyersAccessToken = null;
            fyers.setAccessToken(null);
            delete liveDataCache[userFriendlySymbol]; // Clear cache on auth error
            return res.status(401).json({ error: 'Fyers token expired or invalid. Please login again.', details: errorDetails });
        }

        if (statusCode === 400 || errorCode === -50 || errorCode === -300) {
            delete liveDataCache[userFriendlySymbol]; // Clear cache if the input was bad
            return res.status(400).json({ error: 'Failed to fetch live data (Bad Request - check symbol format?).', details: errorDetails });
        }

        res.status(500).json({ error: 'Failed to fetch live data due to an internal server error.', details: { message: errorMessage } });
    }
});

// --- Paper Trading Module ---

// 1. Our in-memory "database" for virtual trades 
const paperTrades = []; 
// We already imported 'crypto', so we can use it for unique IDs

/**
 * HELPER FUNCTION: findCurrentPrice
 * A simple function to get the current LTP of a specific strike
 * from our live data cache. This is the core of the P&L sim[cite: 92].
 */
function findCurrentPrice(symbol, strike, optionType) {
    // --- TEMPORARY DEBUGGING LINE ---
    // Return a random price between 100 and 101
    return 100 + Math.random(); 

    // --- The rest of your function is now skipped ---
    try {
        const normalizedSymbol = symbol.toUpperCase();
        // ... (rest of the function)
        const cachedData = liveDataCache[normalizedSymbol];
        
        if (!cachedData || !cachedData.data) {
            console.warn(`[Paper Sim] No cached data for ${normalizedSymbol} to find price.`);
            return null;
        }

        const option = cachedData.data.options.find(o => o.strike === strike);
        if (!option) {
            console.warn(`[Paper Sim] Strike ${strike} not found in cache for ${normalizedSymbol}`);
            return null;
        }

        const price = (optionType === 'CE') ? option.CE_Ltp : option.PE_Ltp;
        if (price === null || price === undefined) {
             console.warn(`[Paper Sim] Price for ${normalizedSymbol} ${strike} ${optionType} is null.`);
             return null;
        }
        return price;

    } catch (err) {
        console.error("[Paper Sim] Error in findCurrentPrice:", err.message);
        return null;
    }
}


/**
 * 2. ENDPOINT: POST /api/paper-trade 
 * Creates a new virtual trade and adds it to our paperTrades array
 */
app.post('/api/paper-trade', (req, res) => {
    try {
        // Get trade details from frontend
        const {
            symbol, 
            strategyType, 
            legs, // Array: [{ strike: 19800, optionType: 'CE', action: 'BUY', qty: 1 }, ...]
            targetPercent, // e.g., 20 (for +20%)
            slPercent      // e.g., -10 (for -10%)
        } = req.body;

        if (!symbol || !legs || !Array.isArray(legs) || legs.length === 0) {
            return res.status(400).json({ error: "Invalid trade request. Symbol and legs array are required." });
        }

        let totalEntryCost = 0;
        const processedLegs = [];

        // Verify prices and build trade legs
        for (const leg of legs) {
            const entryPrice = findCurrentPrice(symbol, leg.strike, leg.optionType);

            if (entryPrice === null) {
                // This is a critical failure. We can't place a trade without a live price.
                throw new Error(`Could not find live entry price for ${symbol} ${leg.strike} ${leg.optionType}. Try again in a few seconds.`);
            }

            // Calculate cost: BUYing adds to cost (debit), SELLing subtracts (credit)
            const legCost = entryPrice * (leg.action.toUpperCase() === 'BUY' ? 1 : -1);
            totalEntryCost += (legCost * leg.qty); 

            processedLegs.push({
                ...leg,
                entryPrice: entryPrice,
                currentPrice: entryPrice, // Starts at entry price
                pnl: 0 // Starts at 0
            });
        }
        
        // --- Calculate P&L Targets ---
        // This is tricky. If totalEntryCost is negative (a credit), 
        // the T/SL logic inverts.
        let targetPnl, slPnl;
        
        if (totalEntryCost > 0) { // Net Debit (e.g., Long Call)
            // Target is a positive P&L
            targetPnl = totalEntryCost * (targetPercent / 100);
            // SL is a negative P&L (losing some of the debit)
            slPnl = totalEntryCost * (slPercent / 100); 
        } else { // Net Credit (e.g., Short Put)
            // Target is a positive P&L (keeping more of the credit)
            targetPnl = Math.abs(totalEntryCost) * (targetPercent / 100); 
            // SL is a negative P&L (losing more than the credit)
            slPnl = Math.abs(totalEntryCost) * (Math.abs(slPercent) / 100) * -1;
        }

        // Create the final trade object
        const newTrade = {
            tradeId: crypto.randomUUID(),
            symbol: symbol.toUpperCase(),
            strategyType: strategyType,
            status: "OPEN", // Per plan, will change to "CLOSED" [cite: 93]
            entryTimestamp: new Date().toISOString(),
            legs: processedLegs,
            
            // P&L and Targets
            netEntryCost: totalEntryCost, // This is the net debit/credit
            targetPnl: targetPnl, 
            slPnl: slPnl, 
            
            // Exit fields
            currentNetPnl: 0,
            exitTimestamp: null,
            exitReason: null
        };

        // Store the virtual trade in memory
        paperTrades.push(newTrade);
        console.log(`[Paper Sim] New Trade OPENED: ${newTrade.tradeId} (${newTrade.strategyType})`);

        // Return trade summary to frontend [cite: 94]
        res.status(201).json(newTrade); 

    } catch (error) {
        console.error("[Paper Sim] Failed to place trade:", error.message);
        res.status(500).json({ error: "Failed to place paper trade.", details: error.message });
    }
});


/**
 * 3. ENDPOINT: GET /api/paper-trades
 * A new endpoint to let the frontend see all our open and closed trades.
 * This is needed for the "Trade panel UI + results view" [cite: 136]
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
 * 4. BACKGROUND SIMULATION LOOP [cite: 92]
 * This loop checks all "OPEN" trades and updates their P&L,
 * closing them if T/SL is hit[cite: 93].
 */
const PNL_SIMULATION_INTERVAL_MS = 5000; // Check P&L every 5 seconds

setInterval(() => {
    const openTrades = paperTrades.filter(t => t.status === 'OPEN');
    if (openTrades.length === 0) return; // No trades to check

    // console.log(`[Paper Sim] Simulating P&L for ${openTrades.length} open trades...`);

    for (const trade of openTrades) {
        try {
            let currentNetPnl = 0;
            let canUpdate = true;

            // Update P&L for each leg
            for (const leg of trade.legs) {
                const currentPrice = findCurrentPrice(trade.symbol, leg.strike, leg.optionType);
                
                if (currentPrice === null) {
                    // Can't get a price, probably cache expired and not refetched
                    canUpdate = false; 
                    break; // Stop processing this trade if data is missing
                }
                
                leg.currentPrice = currentPrice;
                
                // P&L calculation: (Current Price - Entry Price) * Action
                // Action is +1 for BUY, -1 for SELL
                const actionMultiplier = (leg.action.toUpperCase() === 'BUY' ? 1 : -1);
                leg.pnl = (leg.currentPrice - leg.entryPrice) * actionMultiplier * leg.qty;

                currentNetPnl += leg.pnl;
            }

            if (canUpdate) {
                // This is the simulated P&L change [cite: 92]
                trade.currentNetPnl = currentNetPnl;
                
                // --- Check for Target/SL Hit --- [cite: 93]
                let closeReason = null;
                
                if (trade.targetPnl && currentNetPnl >= trade.targetPnl) {
                    closeReason = "TARGET_HIT";
                } else if (trade.slPnl && currentNetPnl <= trade.slPnl) {
                    closeReason = "SL_HIT";
                }
                
                if (closeReason) {
                    trade.status = "CLOSED"; // Mark as "CLOSED" [cite: 93]
                    trade.exitTimestamp = new Date().toISOString();
                    trade.exitReason = closeReason;
                    console.log(`[Paper Sim] Trade CLOSED: ${trade.tradeId} (${closeReason}) P&L: ${trade.currentNetPnl.toFixed(2)}`);
                }
            }
        } catch (err) {
            console.error(`[Paper Sim] Error simulating PNL for trade ${trade.tradeId}:`, err.message);
        }
    }
}, PNL_SIMULATION_INTERVAL_MS);

console.log("Paper trading module initialized. P&L simulation loop running.");
// --- End Paper Trading Module ---
// --- Your Existing Options Calculation Route ---
app.post('/calculate', (req, res) => {
    try {
        const { strategy, strike, strike1, strike2, strike3, stockPrice } = req.body;
        const referenceStrike = strike || strike2 || strike1 || strike3 || stockPrice;

        if (!referenceStrike) {
            return res.status(400).json({ error: 'A valid strike or stock price is required.' });
        }

        const spotPrices = [];
        for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) {
            spotPrices.push(Math.round(s));
        }

        const params = { ...req.body, spotPrices };
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
