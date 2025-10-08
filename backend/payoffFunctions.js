// backend/payoffFunctions.js

// --- 1. CORE HELPER FUNCTIONS ---
function callPayoff(spot, strike, premium) { return Math.max(0, spot - strike) - premium; }
function putPayoff(spot, strike, premium) { return Math.max(0, strike - spot) - premium; }


// --- 2. SINGLE LEG STRATEGIES (Standard Call/Put) ---
function longCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const pnl = (Math.max(0, spot - strike) * lots * lotSize) - totalPremium;
        curve.push({ spot: spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium,
        breakeven: strike + premium,
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: -100,
    };
}

function longPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const pnl = (Math.max(0, strike - spot) * lots * lotSize) - totalPremium;
        curve.push({ spot: spot, payoff: pnl });
    });
    const maxProfit = (strike * lots * lotSize) - totalPremium;
    const risk = totalPremium;
    return {
        payoffCurve: curve,
        maxProfit: maxProfit,
        maxLoss: -totalPremium,
        breakeven: strike - premium,
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: -100,
    };
}

function shortCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const pnl = totalPremium - (Math.max(0, spot - strike) * lots * lotSize);
        curve.push({ spot: spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: totalPremium,
        maxLoss: "Unlimited",
        breakeven: strike + premium,
        maxProfitPercentage: "N/A", // ROI is on margin, which is complex
        maxLossPercentage: "Unlimited",
    };
}

function shortPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const pnl = totalPremium - (Math.max(0, strike - spot) * lots * lotSize);
        curve.push({ spot: spot, payoff: pnl });
    });
    const risk = (strike * lots * lotSize) - totalPremium; // Max loss is the risk
    return {
        payoffCurve: curve,
        maxProfit: totalPremium,
        maxLoss: -risk,
        breakeven: strike - premium,
        maxProfitPercentage: (risk > 0) ? (totalPremium / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}


// --- 3. MULTI-LEG SPREADS (Consolidated) ---
function bullCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPnL = callPayoff(spot, strike1, premium1);
        const shortCallPnL = -(callPayoff(spot, strike2, premium2));
        const pnl = (longCallPnL + shortCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = ((strike2 - strike1) - netPremium) * lots * lotSize;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss; // Risk is the net debit paid
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: strike1 + netPremium,
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

function bullPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortPutPnL = -(putPayoff(spot, strike1, premium1));
        const longPutPnL = putPayoff(spot, strike2, premium2);
        const pnl = (shortPutPnL + longPutPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike1 - strike2) - netPremium) * lots * lotSize;
    const risk = -maxLoss; // Risk is the max potential loss (margin)
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: strike1 - netPremium,
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

function bearCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallPnL = -(callPayoff(spot, strike1, premium1));
        const longCallPnL = callPayoff(spot, strike2, premium2);
        const pnl = (shortCallPnL + longCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: strike1 + netPremium,
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

function bearPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (putPayoff(spot, strike1, premium1) - putPayoff(spot, strike2, premium2)) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = ((strike1 - strike2) - netPremium) * lots * lotSize;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss;
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: strike1 - netPremium,
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

// ... (Other functions like synthetics and protectives omitted for brevity)
function syntheticLongStockPayoff(params) { /* ... same as before ... */ }
function syntheticShortStockPayoff(params) { /* ... same as before ... */ }
function protectivePutPayoff(params) { /* ... same as before ... */ }
function protectiveCallPayoff(params) { /* ... same as before ... */ }


// --- 4. NEUTRAL STRATEGIES ---

function longStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (callPayoff(spot, strike, premium1) + putPayoff(spot, strike, premium2)) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium * lots * lotSize,
        breakeven: [strike - totalPremium, strike + totalPremium],
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: -100,
    };
}

function shortStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (-(callPayoff(spot, strike, premium1)) - (putPayoff(spot, strike, premium2))) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: totalPremium * lots * lotSize,
        maxLoss: "Unlimited",
        breakeven: [strike - totalPremium, strike + totalPremium],
        maxProfitPercentage: "N/A",
        maxLossPercentage: "Unlimited",
    };
}

function longStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (putPayoff(spot, strike1, premium1) + callPayoff(spot, strike2, premium2)) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium * lots * lotSize,
        breakeven: [strike1 - totalPremium, strike2 + totalPremium],
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: -100,
    };
}

function shortStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (-(putPayoff(spot, strike1, premium1)) - (callPayoff(spot, strike2, premium2))) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: totalPremium * lots * lotSize,
        maxLoss: "Unlimited",
        breakeven: [strike1 - totalPremium, strike2 + totalPremium],
        maxProfitPercentage: "N/A",
        maxLossPercentage: "Unlimited",
    };
}

function ironCondorPayoff(params) {
    const { strike1, strike2, strike3, strike4, netPremium, lots, lotSize, spotPrices } = params;
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (putPayoff(spot, strike1, 0) - putPayoff(spot, strike2, 0) - callPayoff(spot, strike3, 0) + callPayoff(spot, strike4, 0) + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: [strike2 - netPremium, strike3 + netPremium],
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

function ironButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike3 - strike2) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (putPayoff(spot, strike1, 0) - putPayoff(spot, strike2, 0) - callPayoff(spot, strike2, 0) + callPayoff(spot, strike3, 0) + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: [strike2 - netPremium, strike2 + netPremium],
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

function callButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;
    const maxLoss = -netPremium * lots * lotSize;
    const maxProfit = ((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const pnl = (callPayoff(spot, strike1, 0) - (2 * callPayoff(spot, strike2, 0)) + callPayoff(spot, strike3, 0) - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { 
        payoffCurve: curve, 
        maxProfit, 
        maxLoss, 
        breakeven: [strike1 + netPremium, strike3 - netPremium],
        maxProfitPercentage: (risk > 0) ? (maxProfit / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}

// ... (keep the calendarSpreadPayoff function as is)
function calendarSpreadPayoff(params) { /* ... same as before ... */ }


// --- 5. MODULE EXPORTS ---
module.exports = { 
    callPayoff, putPayoff,
    longCallPayoff, longPutPayoff, shortCallPayoff, shortPutPayoff, 
    bullCallSpreadPayoff, bullPutSpreadPayoff, bearCallSpreadPayoff, bearPutSpreadPayoff,
    syntheticLongStockPayoff, syntheticShortStockPayoff, protectivePutPayoff, protectiveCallPayoff,
    longStraddlePayoff, shortStraddlePayoff, longStranglePayoff, shortStranglePayoff,
    ironCondorPayoff, ironButterflyPayoff, callButterflyPayoff, 
    calendarSpreadPayoff
};