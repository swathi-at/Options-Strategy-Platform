require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const otpauth = require('otpauth');
const crypto = require('crypto');
const { calculateStrategy } = require('./strategyengine');

const app = express();
app.use(cors());
app.use(express.json());

// --- Fyers API Configuration ---
const FYERS_APP_ID = process.env.FYERS_CLIENT_ID; // e.g., XIMVLEN5IZ-100
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY;
const FYERS_TOTP_KEY = process.env.FYERS_TOTP_KEY;
const FYERS_PIN = process.env.FYERS_PIN;
const FYERS_FY_ID = process.env.FYERS_FY_ID;
const FYERS_REDIRECT_URI = 'https://www.google.com/'; // Placeholder
const FYERS_API_BASE_URL_V3 = 'https://api-t1.fyers.in/api/v3';
const FYERS_API_BASE_URL_V2 = 'https://api-t2.fyers.in/vagator/v2';

let fyersAccessToken = null; // Store the final access token globally

function getEncodedString(string) {
    // Ensure input is a string before encoding
    return Buffer.from(String(string)).toString('base64');
}

// --- Fyers Login Endpoint ---
app.post('/api/fyers/login', async (req, res) => {
    try {
        console.log("Starting Fyers automated login...");

        // Step 1: Send Login OTP Request
        console.log("Step 1: Sending Login OTP request...");
        const otpRes = await axios.post(`${FYERS_API_BASE_URL_V2}/send_login_otp_v2`,
            { fy_id: getEncodedString(FYERS_FY_ID), app_id: "2" },
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
        await new Promise(resolve => setTimeout(resolve, 1000));
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
        const session = axios.create();
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
            // Robust parsing using string splitting
            const paramsString = authCodeUrl.split('?')[1];
            if (!paramsString) throw new Error("No query string found in URL");
            const paramsArray = paramsString.split('&');
            for (const param of paramsArray) {
                const [key, value] = param.split('=');
                if (key === 'auth_code') { authCode = value; break; }
            }
             if (!authCode) throw new Error("Could not find 'auth_code' parameter after splitting.");
             console.log("Step 4 - Successfully extracted auth_code:", authCode);
        } catch (parseError) {
            console.error("Step 4 - Error during manual parsing:", parseError);
            throw new Error("Failed to extract auth_code from URL using manual parse: " + authCodeUrl);
        }
        console.log("Step 4 Successful. Auth Code:", authCode);

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
            fyersAccessToken = finalTokenRes.data.access_token;
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
        if (error.message.includes('send_login_otp')) errorMessage += ' (Step 1)';
        else if (error.message.includes('verify_otp')) errorMessage += ' (Step 2)';
        else if (error.message.includes('verify_pin')) errorMessage += ' (Step 3)';
        else if (error.message.includes('Auth Code URL')) errorMessage += ' (Step 4 - API Call)';
        else if (error.message.includes('extract auth_code')) errorMessage += ' (Step 4 - Parsing)';
        else if (error.message.includes('Final Fyers Access Token')) errorMessage += ' (Step 5)';
        res.status(500).json({
            success: false, error: errorMessage, details: error.response ? error.response.data : {}
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