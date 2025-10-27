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

// --- Fyers API Configuration ---
const FYERS_APP_ID = process.env.FYERS_CLIENT_ID; // e.g., XIMVLEN5IZ-100
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_TOTP_KEY = process.env.FYERS_TOTP_KEY;
const FYERS_PIN = process.env.FYERS_PIN;
const FYERS_FY_ID = process.env.FYERS_FY_ID;
const FYERS_REDIRECT_URI = 'https://www.google.com/'; // Placeholder, ensure matches Fyers App config if needed by API
const FYERS_API_BASE_URL_V3 = 'https://api-t1.fyers.in/api/v3';
const FYERS_API_BASE_URL_V2 = 'https://api-t2.fyers.in/vagator/v2';

// Initialize Fyers Model globally
const fyers = new FyersAPI();

// Set App ID (required by the library for requests)
if (FYERS_APP_ID) {
    fyers.setAppId(FYERS_APP_ID);
    console.log("Fyers App ID set.");
} else {
    console.error("CRITICAL ERROR: FYERS_CLIENT_ID (App ID) not found in .env file!");
}

// Global variable to store the access token
let fyersAccessToken = null;

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
            { fy_id: getEncodedString(FYERS_FY_ID), app_id: "2" }, // Fixed app_id for this step
            { headers: { 'Content-Type': 'application/json' } }
        );
        const requestKeyOTP = otpRes.data?.request_key;
        if (!requestKeyOTP) throw new Error(`Step 1 Failed. Response: ${JSON.stringify(otpRes.data)}`);
        console.log("Step 1 Successful. OTP Request Key:", requestKeyOTP);

        // Step 2: Verify TOTP
        console.log("Step 2: Verifying TOTP...");
        let totp = new otpauth.TOTP({
            issuer: "Fyers", label: "Fyers", algorithm: "SHA1", digits: 6, period: 30, secret: FYERS_TOTP_KEY,
        });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        const otpCode = totp.generate();
        console.log("Generated TOTP:", otpCode);
        const verifyOtpRes = await axios.post(`${FYERS_API_BASE_URL_V2}/verify_otp`, {
            request_key: requestKeyOTP,
            otp: otpCode
        });
        console.log("Step 2 - Full response from /verify_otp:", JSON.stringify(verifyOtpRes.data, null, 2));
        const requestKeyPin = verifyOtpRes.data?.request_key;
        if (!requestKeyPin) throw new Error(`Step 2 Failed. Response: ${JSON.stringify(verifyOtpRes.data)}`);
        console.log("Step 2 Successful. PIN Request Key:", requestKeyPin);

        // Step 3: Verify PIN & Get Intermediate Token
        console.log("Step 3: Verifying PIN...");
        const session = axios.create(); // Use session for cookie handling if needed
        const verifyPinRes = await session.post(`${FYERS_API_BASE_URL_V2}/verify_pin_v2`, {
            request_key: requestKeyPin,
            identity_type: "pin",
            identifier: getEncodedString(FYERS_PIN)
        });
        const intermediateAccessToken = verifyPinRes.data?.data?.access_token;
        if (!intermediateAccessToken) throw new Error(`Step 3 Failed. Response: ${JSON.stringify(verifyPinRes.data)}`);
        console.log("Step 3 Successful. Intermediate Token obtained.");

        // Step 4: Get Auth Code using Intermediate Token
        console.log("Step 4: Getting Auth Code...");
        console.log("--- DEBUG: Using FYERS_FY_ID:", FYERS_FY_ID);
        // Ensure app_id format is correct (check Fyers docs if unsure about removing '-100')
        const appIdForToken = FYERS_APP_ID.endsWith('-100') ? FYERS_APP_ID.substring(0, FYERS_APP_ID.length - 4) : FYERS_APP_ID;
        console.log("--- DEBUG: Using appIdForToken:", appIdForToken);
        session.defaults.headers.common['Authorization'] = `Bearer ${intermediateAccessToken}`;
        const tokenPayload = {
             fyers_id: FYERS_FY_ID,
             app_id: appIdForToken,
             redirect_uri: FYERS_REDIRECT_URI,
             appType: "100", code_challenge: "", state: "None", scope: "", nonce: "", response_type: "code", create_cookie: true
        };
        const tokenRes = await session.post(`${FYERS_API_BASE_URL_V3}/token`, tokenPayload, {
            validateStatus: function (status) {
                return (status >= 200 && status < 300) || status === 308; // Accept 308 as success
            }
        });
        console.log("Step 4 - /token API call successful (Status: " + tokenRes.status + "). Full response data:", JSON.stringify(tokenRes.data, null, 2));
        const authCodeUrl = tokenRes.data?.Url;
        if (!authCodeUrl) throw new Error(`Failed to get Auth Code URL. Response: ${JSON.stringify(tokenRes.data)}`);
        console.log("Step 4 - Auth Code URL received:", authCodeUrl);

        let authCode = null;
        try {
            console.log("Step 4 - Starting manual parse...");
            const searchTerm = 'auth_code=';
            const startIndex = authCodeUrl.indexOf(searchTerm);
            console.log(`Step 4 - Index of '${searchTerm}':`, startIndex);

            if (startIndex === -1) {
                throw new Error(`'${searchTerm}' not found in URL.`);
            }
            const subStringAfterCode = authCodeUrl.substring(startIndex + searchTerm.length);
            console.log("Step 4 - Substring after auth_code=:", subStringAfterCode ? subStringAfterCode.substring(0, 10) + '...' : 'null'); // Log first 10 chars

            const endIndex = subStringAfterCode.indexOf('&');
            console.log("Step 4 - Index of next '&':", endIndex);

            if (endIndex === -1) {
                authCode = subStringAfterCode;
            } else {
                authCode = subStringAfterCode.substring(0, endIndex);
            }

            if (!authCode) {
                 console.error("Step 4 - PARSING CHECK FAILED! authCode value:", authCode); // Log the value that failed the check
                 throw new Error("Extracted auth_code is empty or null after parsing.");
            }
             console.log("Step 4 - Successfully extracted auth_code:", authCode ? authCode.substring(0, 10) + '...' : 'null');

        } catch (parseError) {
            console.error("Step 4 - Error during manual parsing:", parseError.message);
            console.error("Original URL:", authCodeUrl);
            throw new Error("Failed to extract auth_code from URL using manual parse: " + authCodeUrl);
        }
        console.log("Step 4 Successful. Auth Code:", authCode ? authCode.substring(0, 10) + '...' : 'null');

        // Step 5: Exchange Auth Code for Final Access Token
        console.log("Step 5: Exchanging Auth Code for Final Access Token...");
        // Calculate the required hash
        const hashCreator = crypto.createHash('sha256');
        const hashInput = `${FYERS_APP_ID}:${FYERS_SECRET_KEY}`; // Format: client_id:secret_key
        hashCreator.update(hashInput);
        const appIdHashValue = hashCreator.digest('hex');
        console.log("Calculated appIdHash:", appIdHashValue);
        // Use correct payload key 'appIdHash'
        const finalTokenPayload = {
            grant_type: 'authorization_code',
            code: authCode,
            appIdHash: appIdHashValue // Correct key name
        };
        console.log("Payload being sent to /validate-authcode:", JSON.stringify(finalTokenPayload, null, 2));
        console.log("URL being called:", `${FYERS_API_BASE_URL_V3}/validate-authcode`);
        const finalTokenRes = await axios.post(`${FYERS_API_BASE_URL_V3}/validate-authcode`, finalTokenPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (finalTokenRes.data && finalTokenRes.data.access_token) {
            fyersAccessToken = finalTokenRes.data.access_token; // Store token globally
            fyers.setAccessToken(fyersAccessToken); // Set token in the library instance
            console.log("SUCCESS! Final Fyers Access Token received:", fyersAccessToken);
            res.json({ success: true, message: "Fyers login successful!", accessToken: fyersAccessToken });
        } else {
            console.log("Fyers responded to final step (/validate-authcode), but no token found. Response:", JSON.stringify(finalTokenRes.data, null, 2));
            throw new Error('Failed to retrieve Final Fyers Access Token.');
        }

    } catch (error) {
         console.error("Fyers automated login error:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
         if (error.stack) { console.error("Stack Trace:", error.stack); }
        let errorMessage = 'Fyers automated login failed.';
        if (error.message.includes('Step 1 Failed')) errorMessage += ' (Step 1)';
        else if (error.message.includes('Step 2 Failed')) errorMessage += ' (Step 2)';
        else if (error.message.includes('Step 3 Failed')) errorMessage += ' (Step 3)';
        else if (error.message.includes('Auth Code URL')) errorMessage += ' (Step 4 - API Call)';
        else if (error.message.includes('extract auth_code')) errorMessage += ' (Step 4 - Parsing)';
        else if (error.message.includes('Final Fyers Access Token')) errorMessage += ' (Step 5)';
        res.status(500).json({
            success: false, error: errorMessage, details: error.response ? error.response.data : {}
        });
    }
});


// --- Fyers Historical Data Endpoint (Using Epoch Timestamps AND date_format 0 based on last error) ---
app.get('/api/historical-data', async (req, res) => {
    const { symbol, resolution, from, to } = req.query; // Dates expected as YYYY-MM-DD

    if (!symbol || !resolution || !from || !to) {
        return res.status(400).json({ error: 'Missing required query parameters: symbol, resolution, from (YYYY-MM-DD), to (YYYY-MM-DD). Ensure symbol is in Fyers format (e.g., NSE:RELIANCE-EQ)' });
    }
    // Basic date format validation
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
            date_format: "0", // <-- Set date_format to 0 as error suggested for epoch
            range_from: String(fromEpoch), // <-- Send epoch timestamp as string
            range_to: String(toEpoch),     // <-- Send epoch timestamp as string
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
                 // Should not happen if the check above works, but good practice
                 throw new Error("Access token is null, cannot proceed with historical data fetch.");
             }
        }

        // --- Use the library's getHistory method ---
        const historyResponse = await fyers.getHistory(historyPayload);
        console.log("Library getHistory response:", JSON.stringify(historyResponse, null, 2));

        // --- Check Library Response Structure ---
        if (!historyResponse || historyResponse.s !== 'ok' || !historyResponse.candles) {
             const fyersMessage = historyResponse?.message || 'Unknown error structure';
             // Specifically check for the previous date format error again
             if (fyersMessage?.includes("date timestamps (YYYY-MM-DD) needed")) {
                 console.error("Fyers API is giving conflicting date format requirements!");
             }
             throw new Error(`Failed to fetch valid historical data via library. Message: ${fyersMessage}. Raw Response: ${JSON.stringify(historyResponse)}`);
        }
        console.log(`Received ${historyResponse.candles.length} candles via library.`);

        // Format candles
        const formattedCandles = historyResponse.candles.map(c => ({
            timestamp: c[0], // Epoch timestamp
            date: new Date(c[0] * 1000).toISOString().split('T')[0], // Convert epoch to YYYY-MM-DD
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));

        res.json({
            symbol: symbol,
            resolution: resolution,
            candles: formattedCandles
        });

    } catch (error) {
        // Library might throw errors differently, check the error object
        const errorMessage = error?.message || "Unknown error";
        const errorDetails = error?.response?.data || error?.data || (error?.s ? error : {});

        console.error("Error fetching historical data via library:", errorMessage);
        console.error("Details:", JSON.stringify(errorDetails, null, 2));
         if (error.stack) { console.error("Stack Trace:", error.stack); }

        // More robust check for auth errors
        if (errorMessage.includes("token") || errorMessage.includes("unauthorized") || errorMessage.includes("authenticate") || errorDetails?.code === -117 || errorDetails?.code === -435) { // Added -435 "Token invalid"
             fyersAccessToken = null; // Clear potentially invalid token
             fyers.setAccessToken(null); // Clear token in library instance
             return res.status(401).json({ error: 'Fyers token expired or invalid. Please re-authenticate via /api/fyers/login' });
        }
        res.status(500).json({
            error: 'Failed to fetch historical data from Fyers.',
            details: errorDetails
        });
    }
});


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