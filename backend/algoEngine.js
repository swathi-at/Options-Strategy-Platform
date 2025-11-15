const { fyersDataSocket } = require("fyers-api-v3");
const axios = require('axios');
const crypto = require('crypto');

// --- Global Bot State ---
let fyersAccessToken = null;
let fyersAppId = null;
const FYERS_API_DATA_URL_V3 = 'https://api-t1.fyers.in/data';

let livePositions = []; // Stores our one active trade
let algoState = {
    symbol: "NSE:IDEA-EQ", // The stock we are trading (safe test)
    interval: 3,           // 3-minute candles
    qty: 1,                // Trade quantity
    stopLossPoints: 0.25,  // 25 paise stop loss
    targetPoints: 0.50,    // 50 paise target
    isInTrade: false,      // Are we currently holding a position?
};

// Stores the candles as they are built
let candleHistory = [];
let currentCandle = null;

// --- 1. The "Manager": P&L and Exit Loop ---

/**
 * This loop runs every 5 seconds to check the P&L of our live trade.
 */
function startAlgoManager() {
    console.log(`💼 ALGO MANAGER: Initialized. Watching for live positions. Checking every 5s.`);
    
    setInterval(async () => {
        if (!fyersAccessToken || livePositions.length === 0) {
            return;
        }

        try {
            const position = livePositions[0]; // We only manage one trade
            
            // 1. Get Live Price (LTP)
            const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, {
                params: { symbols: position.symbol },
                headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` }
            });
            const ltp = quotesRes.data.d?.[0]?.v?.lp;
            if (!ltp) return; // Skip if LTP not found

            const pnl = (ltp - position.buyPrice) * position.qty;
            console.log(`Manager: P&L: ${pnl.toFixed(2)} (LTP: ${ltp}, Target: ${position.target}, SL: ${position.stopLoss})`);
            
            // 2. Check for Exit
            let exitReason = null;
            if (ltp >= position.target) {
                exitReason = "TARGET HIT";
            } else if (ltp <= position.stopLoss) {
                exitReason = "STOP LOSS HIT";
            }

            if (exitReason) {
                console.log(`💼 MANAGER: ${exitReason}! Placing SELL order...`);
                
                // 3. Place SELL Order
                await placeLiveOrder(position.symbol, position.qty, -1); // -1 = SELL
                
                // 4. Clear Position
                livePositions = []; // Clear the array
                algoState.isInTrade = false; // Allow brain to look for new trades
                console.log("Manager: Trade closed. Ready for new signal.");
            }

        } catch (error) {
            console.error("Algo Manager Error:", error.message);
        }
    }, 5000); // Check P&L every 5 seconds
}


// --- 2. The "Brain": WebSocket Candle Builder & Signal Generator ---

/**
 * Rounds a timestamp to the nearest interval (e.g., 5-min, 3-min).
 */
function roundTimeToInterval(unixTimestamp, intervalMinutes) {
    const date = new Date(unixTimestamp * 1000); // Convert epoch to JS Date
    const minutes = date.getMinutes();
    const newMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;
    date.setMinutes(newMinutes, 0, 0); // Reset seconds and milliseconds
    return Math.floor(date.getTime() / 1000); // Convert back to epoch
}

/**
 * This is the SMA Crossover logic.
 * It's called every time a new candle closes.
 */
async function runSignalLogic() {
    if (algoState.isInTrade || candleHistory.length < 25) {
        // Don't trade if already in a position or not enough data
        return; 
    }

    // 1. Calculate SMAs
    const sma7 = candleHistory.slice(-7).reduce((acc, c) => acc + c.close, 0) / 7;
    const sma25 = candleHistory.slice(-25).reduce((acc, c) => acc + c.close, 0) / 25;
    
    // Get previous candle's SMAs
    const prevSma7 = candleHistory.slice(-8, -1).reduce((acc, c) => acc + c.close, 0) / 7;
    const prevSma25 = candleHistory.slice(-26, -1).reduce((acc, c) => acc + c.close, 0) / 25;

    console.log(`Brain: Checking Signal... SMA7: ${sma7.toFixed(2)}, SMA25: ${sma25.toFixed(2)}`);

    // 2. Check for Crossover
    if (sma7 > sma25 && prevSma7 < prevSma25) {
        console.log(`💡 BRAIN: BUY SIGNAL DETECTED! (SMA7: ${sma7.toFixed(2)}, SMA25: ${sma25.toFixed(2)})`);
        algoState.isInTrade = true; // Mark as "in trade"
        
        try {
            // 3. Place BUY Order
            const orderRes = await placeLiveOrder(algoState.symbol, algoState.qty, 1);
            
            // 4. Add to Manager
            console.log(`Brain: Polling for order fill status (ID: ${orderRes.id})...`);
            for (let i = 0; i < 5; i++) { // Poll 5 times (15 sec)
                await new Promise(r => setTimeout(r, 3000));
                const status = await checkOrderStatus(orderRes.id);
                
                if (status === 'FILLED') {
                    const orderDetails = (await fyers.get_orders()).orders.find(o => o.id === orderRes.id);
                    const buyPrice = orderDetails.tradedPrice;
                    
                    livePositions.push({
                        symbol: algoState.symbol,
                        qty: algoState.qty,
                        buyPrice: buyPrice,
                        orderId: orderRes.id,
                        stopLoss: buyPrice - algoState.stopLossPoints,
                        target: buyPrice + algoState.targetPoints
                    });
                    console.log(`MANAGER: Added to portfolio. Buy Price: ${buyPrice}, SL: ${livePositions[0].stopLoss}, Tgt: ${livePositions[0].target}`);
                    return; // Exit loop
                }
                if (status === 'REJECTED') { 
                    throw new Error(`BUY Order ${orderRes.id} was REJECTED.`);
                }
                console.log(`Brain: Order status is ${status}. Retrying...`);
            }
        } catch (error) {
            console.error("Algo Brain Error:", error.message);
            algoState.isInTrade = false; // Reset on error
        }
    }
}

/**
 * This is the `updateOHLC` function from your lead's code.
 * It's called on every single tick.
 */
function onTick(ltp, time) {
    const roundedTime = roundTimeToInterval(time, algoState.interval);

    if (!currentCandle) {
        // First tick
        currentCandle = {
            time: roundedTime,
            open: ltp,
            high: ltp,
            low: ltp,
            close: ltp,
        };
        return;
    }

    if (roundedTime === currentCandle.time) {
        // This tick is part of the *same* candle
        currentCandle.high = Math.max(currentCandle.high, ltp);
        currentCandle.low = Math.min(currentCandle.low, ltp);
        currentCandle.close = ltp;
    } else {
        // This tick is for a *NEW* candle. The previous one is now closed.
        console.log(`Brain: New ${algoState.interval}-min Candle Closed. Price: ${currentCandle.close}`);
        
        // 1. Save the "closed" candle
        candleHistory.push(currentCandle);

        // 2. Run our trading logic on the completed data
        runSignalLogic(); 

        // 3. Start the new candle
        currentCandle = {
            time: roundedTime,
            open: ltp,
            high: ltp,
            low: ltp,
            close: ltp,
        };
    }
}

/**
 * Main function to start the WebSocket "Brain"
 */
function startWebSocketBrain() {
    console.log(`💡 ALGO BRAIN: Initializing WebSocket...`);
    
    // We use the fyersDataSocket from the library
    const fyersSocket = fyersDataSocket.getInstance(fyersAppId + ':' + fyersAccessToken);

    fyersSocket.on("connect", () => {
        console.log("Brain: WebSocket Connected. Subscribing to " + algoState.symbol);
        fyersSocket.subscribe([algoState.symbol]);
        fyersSocket.mode(fyersSocket.FullMode);
    });

    fyersSocket.on("message", (message) => {
        // This is the main "onMessage" logic
        if (message.symbol === algoState.symbol && message.ltp) {
            onTick(message.ltp, message.exch_feed_time);
        }
    });

    fyersSocket.on("error", (message) => {
        console.error("Brain: WebSocket Error:", message);
    });

    fyersSocket.on("close", () => {
        console.log("Brain: WebSocket Disconnected. Will try to reconnect.");
    });

    // Start the connection
    fyersSocket.connect();
    fyersSocket.autoreconnect();
}


// --- 3. Helper Functions (Moved from server.js) ---

/**
 * Universal function to place a live order (Buy or Sell)
 */
async function placeLiveOrder(symbol, qty, side, isAMO = false) {
    if (!fyersAccessToken) throw new Error("Cannot place order, Fyers token is missing.");
    
    // We need a local fyers model instance to place orders
    const fyers = new FyersAPI();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);

    let orderPayload = {
        symbol: symbol,
        qty: qty,
        type: 2, // 2 = Market Order (for fast execution)
        side: side, // 1 = Buy, -1 = Sell
        productType: "INTRADAY", // MIS
        validity: "DAY",
        offlineOrder: false
    };

    if (isAMO) {
        console.log("Detected AMO request...");
        const quotesRes = await axios.get(`${FYERS_API_DATA_URL_V3}/quotes`, {
            params: { symbols: symbol },
            headers: { 'Authorization': `${fyersAppId}:${fyersAccessToken}` }
        });
        const ltp = quotesRes.data.d?.[0]?.v?.lp;
        if (!ltp) throw new Error("Could not get LTP for AMO limit price.");

        orderPayload.type = 1; // 1 = Limit Order
        orderPayload.limitPrice = (side === 1) ? (ltp + 0.5) : (ltp - 0.5);
        orderPayload.productType = "CNC"; // AMO must be CNC
        orderPayload.offlineOrder = true;
    }

    console.log(`PLACING ORDER: ${side === 1 ? 'BUY' : 'SELL'} ${qty} ${symbol} (AMO: ${isAMO})`);
    const placeOrderRes = await fyers.place_order(orderPayload);
    console.log("Fyers Order Response:", placeOrderRes);

    if (placeOrderRes.s !== 'ok') {
        throw new Error(`Order Failed: ${placeOrderRes.message}`);
    }
    return placeOrderRes;
}

/**
 * Helper: Gets the current order status from Fyers
 */
async function checkOrderStatus(orderId) {
    if (!fyersAccessToken) return "UNKNOWN";
    
    const fyers = new FyersAPI();
    fyers.setAppId(fyersAppId);
    fyers.setAccessToken(fyersAccessToken);

    try {
        const orderBookRes = await fyers.get_orders();
        const myOrder = orderBookRes.orders?.find(o => o.id === orderId);
        if (!myOrder) return "UNKNOWN";
        const statusMap = { 1: 'CANCELLED', 2: 'FILLED', 4: 'TRANSIT', 5: 'REJECTED', 6: 'PENDING' };
        return statusMap[myOrder.status] || myOrder.status;
    } catch (e) {
        console.error("Error checking order status:", e.message);
        return "UNKNOWN";
    }
}


// --- 4. Main Export ---

/**
 * This is the main function called by server.js after a successful login.
 */
function startAlgoBot(token, appId) {
    if (!token || !appId) {
        console.error("Algo Bot cannot start. Missing token or app ID.");
        return;
    }
    fyersAccessToken = token;
    fyersAppId = appId;
    
    // Start the two loops
    startAlgoManager();
    startWebSocketBrain();
}

module.exports = {
    startAlgoBot,
    placeLiveOrder, // Export for manual AMO test
    checkOrderStatus
};