// --- 1. CORE HELPER FUNCTIONS ---
function callPayoff(spot, strike, premium) {
    return Math.max(0, spot - strike) - premium;
}

function putPayoff(spot, strike, premium) {
    return Math.max(0, strike - spot) - premium;
}


// --- 2. SINGLE LEG STRATEGIES ---
// These functions take 5 simple arguments
function longCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const effectiveLotSize = lotSize || 1; // Add default
    const totalPremium = premium * lots * effectiveLotSize;
    spotPrices.forEach((spot) => {
        const pnl = (Math.max(0, spot - strike) * lots * effectiveLotSize) - totalPremium;
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
    const effectiveLotSize = lotSize || 1;
    const totalPremium = premium * lots * effectiveLotSize;
    spotPrices.forEach((spot) => {
        const pnl = (Math.max(0, strike - spot) * lots * effectiveLotSize) - totalPremium;
        curve.push({ spot: spot, payoff: pnl });
    });
    const maxProfit = (strike * lots * effectiveLotSize) - totalPremium;
    return {
        payoffCurve: curve,
        maxProfit: maxProfit,
        maxLoss: -totalPremium,
        breakeven: strike - premium,
        maxProfitPercentage: (totalPremium > 0) ? (maxProfit / totalPremium) * 100 : "N/A",
        maxLossPercentage: -100,
    };
}

function shortCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const effectiveLotSize = lotSize || 1;
    const totalPremium = premium * lots * effectiveLotSize;
    spotPrices.forEach((spot) => {
        const pnl = totalPremium - (Math.max(0, spot - strike) * lots * effectiveLotSize);
        curve.push({ spot: spot, payoff: pnl });
    });
    return {
        payoffCurve: curve,
        maxProfit: totalPremium,
        maxLoss: "Unlimited",
        breakeven: strike + premium,
        maxProfitPercentage: "N/A",
        maxLossPercentage: "Unlimited",
    };
}

function shortPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const effectiveLotSize = lotSize || 1;
    const totalPremium = premium * lots * effectiveLotSize;
    spotPrices.forEach((spot) => {
        const pnl = totalPremium - (Math.max(0, strike - spot) * lots * effectiveLotSize);
        curve.push({ spot: spot, payoff: pnl });
    });
    const risk = (strike * lots * effectiveLotSize) - totalPremium;
    return {
        payoffCurve: curve,
        maxProfit: totalPremium,
        maxLoss: -risk,
        breakeven: strike - premium,
        maxProfitPercentage: (risk > 0) ? (totalPremium / risk) * 100 : "N/A",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}


// --- 3. SPREAD STRATEGIES ---
// These functions take the entire 'params' object
function bullCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallValue = Math.max(0, spot - strike1);
        const shortCallValue = -Math.max(0, spot - strike2);
        const pnl = (longCallValue + shortCallValue - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = ((strike2 - strike1) - netPremium) * lots * lotSize;
    const maxLoss = -netPremium * lots * lotSize;
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

function bullPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium1 - premium2; // Credit received
    const curve = [];
    spotPrices.forEach(spot => {
        const shortPutValue = -Math.max(0, strike1 - spot);
        const longPutValue = Math.max(0, strike2 - spot);
        const pnl = (shortPutValue + longPutValue + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike1 - strike2) - netPremium) * lots * lotSize;
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

function bearCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium1 - premium2; // Credit received
    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallValue = -Math.max(0, spot - strike1);
        const longCallValue = Math.max(0, spot - strike2);
        const pnl = (shortCallValue + longCallValue + netPremium) * lots * lotSize;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutValue = Math.max(0, strike1 - spot);
        const shortPutValue = -Math.max(0, strike2 - spot);
        const pnl = (longPutValue + shortPutValue - netPremium) * lots * lotSize;
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


// --- 4. STOCK + OPTION STRATEGIES ---
function protectivePutPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize = 1, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const stockPnl = (spot - stockPrice);
        const putPnl = Math.max(0, strike - spot) - premium;
        const totalPnl = (stockPnl + putPnl) * lots * lotSize;
        curve.push({ spot, payoff: totalPnl });
    });
    const maxLoss = (strike - stockPrice - premium) * lots * lotSize;
    const initialInvestment = stockPrice * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: maxLoss,
        breakeven: stockPrice + premium,
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: (initialInvestment > 0) ? (maxLoss / initialInvestment) * 100 : "N/A",
    };
}

function protectiveCallPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize = 1, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const stockPnl = (spot - stockPrice);
        const shortCallPnl = premium - Math.max(0, spot - strike);
        const totalPnl = (stockPnl + shortCallPnl) * lots * lotSize;
        curve.push({ spot, payoff: totalPnl });
    });
    const maxProfit = (strike - stockPrice + premium) * lots * lotSize;
    const initialInvestment = stockPrice * lots * lotSize;
    const maxLoss = (premium - stockPrice) * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: maxProfit,
        maxLoss: maxLoss,
        breakeven: stockPrice - premium,
        maxProfitPercentage: (initialInvestment > 0) ? (maxProfit / initialInvestment) * 100 : "N/A",
        maxLossPercentage: (initialInvestment > 0) ? (maxLoss / initialInvestment) * 100 : "N/A",
    };
}


// --- 5. SYNTHETIC STRATEGIES ---
function syntheticLongStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPayoff = Math.max(0, spot - strike) - premium;
        const shortPutPayoff = premium2 - Math.max(0, strike - spot);
        const pnl = (longCallPayoff + shortPutPayoff) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxLoss = -(strike + netPremium) * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: maxLoss,
        breakeven: strike + netPremium,
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: "N/A",
    };
}

function syntheticShortStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallPayoff = premium - Math.max(0, spot - strike);
        const longPutPayoff = Math.max(0, strike - spot) - premium2;
        const pnl = (shortCallPayoff + longPutPayoff) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = (strike - netPremium) * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: maxProfit,
        maxLoss: "Unlimited",
        breakeven: strike + netPremium,
        maxProfitPercentage: "N/A",
        maxLossPercentage: "Unlimited",
    };
}


// --- 6. NEUTRAL & VOLATILITY STRATEGIES ---
function longStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize = 1, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const callPnl = Math.max(0, spot - strike) - premium1;
        const putPnl = Math.max(0, strike - spot) - premium2;
        const pnl = (callPnl + putPnl) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const risk = totalPremium * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -risk,
        breakeven: [strike - totalPremium, strike + totalPremium],
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: -100,
    };
}

function shortStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize = 1, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallPnl = premium1 - Math.max(0, spot - strike);
        const shortPutPnl = premium2 - Math.max(0, strike - spot);
        const pnl = (shortCallPnl + shortPutPnl) * lots * lotSize;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const putPnl = Math.max(0, strike1 - spot) - premium1;
        const callPnl = Math.max(0, spot - strike2) - premium2;
        const pnl = (putPnl + callPnl) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const risk = totalPremium * lots * lotSize;
    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -risk,
        breakeven: [strike1 - totalPremium, strike2 + totalPremium],
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: -100,
    };
}

function shortStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize = 1, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortPutPnl = premium1 - Math.max(0, strike1 - spot);
        const shortCallPnl = premium2 - Math.max(0, spot - strike2);
        const pnl = (shortPutPnl + shortCallPnl) * lots * lotSize;
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
    const {
        strike1, premium1,
        strike2, premium2,
        strike3, premium3,
        strike4, premium4,
        lots, lotSize = 1, spotPrices
    } = params;
    const netPremium = (premium2 + premium3) - (premium1 + premium4); // Credit
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const intrinsicValue = -Math.max(0, strike2 - spot) + Math.max(0, strike1 - spot) - Math.max(0, spot - strike3) + Math.max(0, spot - strike4);
        const pnl = (intrinsicValue + netPremium) * lots * lotSize;
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
    const {
        strike1, premium1,
        strike2, premium2, premium3,
        strike3, premium4,
        lots, lotSize = 1, spotPrices
    } = params;
    const netPremium = (premium2 + premium3) - (premium1 + premium4); // Credit
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPut_s1 = Math.max(0, strike1 - spot);
        const shortPut_s2 = -Math.max(0, strike2 - spot);
        const shortCall_s2 = -Math.max(0, spot - strike2);
        const longCall_s3 = Math.max(0, spot - strike3);
        const intrinsicValue = longPut_s1 + shortPut_s2 + shortCall_s2 + longCall_s3;
        const pnl = (intrinsicValue + netPremium) * lots * lotSize;
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
    const {
        strike1, premium1,
        strike2, premium2,
        strike3, premium3,
        lots, lotSize = 1, spotPrices
    } = params;
    const netPremium = premium1 + premium3 - (2 * premium2); // Debit
    const maxLoss = -netPremium * lots * lotSize;
    const maxProfit = ((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCall1 = Math.max(0, spot - strike1);
        const shortCalls = -2 * Math.max(0, spot - strike2);
        const longCall3 = Math.max(0, spot - strike3);
        const pnl = (longCall1 + shortCalls + longCall3 - netPremium) * lots * lotSize;
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

function calendarSpreadPayoff(params) {
    const { strike, premium1, premium2, lots, lotSize = 1, spotPrices } = params;
    const netPremium = premium1 - premium2; // Debit
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        // This is a rough simulation of time decay profit
        const estimatedMaxProfit = risk * 1.5; // Guess: Max profit is 150% of risk
        const distanceFromStrike = Math.abs(spot - strike);
        const decayFactor = Math.pow(distanceFromStrike, 2) / Math.pow(strike * 0.1, 2);
        let pnl = estimatedMaxProfit - (decayFactor * estimatedMaxProfit);
        pnl = Math.max(pnl, maxLoss); // Cap loss at max loss
        curve.push({ spot, payoff: pnl });
    });
    const calculatedMaxProfit = Math.max(...curve.map(p => p.payoff));
    return {
        payoffCurve: curve,
        maxProfit: calculatedMaxProfit > 0 ? calculatedMaxProfit.toFixed(2) : "Variable",
        maxLoss: maxLoss,
        breakeven: "Variable (depends on IV & time)",
        maxProfitPercentage: "Variable",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}


// --- 7. MAIN EXPORT FUNCTION ---

// This maps strategy names to their calculation functions
const strategyMap = {
    // Single Leg
    'long-call': longCallPayoff,
    'long-put': longPutPayoff,
    'short-call': shortCallPayoff,
    'short-put': shortPutPayoff,

    // Spreads (Directional)
    'bull-call-spread': bullCallSpreadPayoff,
    'bull-put-spread': bullPutSpreadPayoff,
    'bear-call-spread': bearCallSpreadPayoff,
    'bear-put-spread': bearPutSpreadPayoff,

    // Stock + Option
    'protective-put': protectivePutPayoff,
    'protective-call': protectiveCallPayoff,

    // Synthetics
    'synthetic-long-stock': syntheticLongStockPayoff,
    'synthetic-short-stock': syntheticShortStockPayoff,

    // Volatility & Neutral
    'long-straddle': longStraddlePayoff,
    'short-straddle': shortStraddlePayoff,
    'long-strangle': longStranglePayoff,
    'short-strangle': shortStranglePayoff,
    'iron-condor': ironCondorPayoff,
    'iron-butterfly': ironButterflyPayoff,
    'call-butterfly': callButterflyPayoff,
    'calendar-spread': calendarSpreadPayoff,
};

/**
 * Calculates the payoff for a given options strategy.
 */
function calculateStrategy(strategyName, params) {
    const calculationFunction = strategyMap[strategyName];

    if (!calculationFunction) {
        throw new Error(`Strategy "${strategyName}" not found or is not implemented.`);
    }
    
    // Add default lotSize/lots if not present
    if (!params.lotSize) {
        params.lotSize = 1; 
    }
    if (!params.lots) {
        params.lots = 1;
    }

    const singleLegStrategies = ['long-call', 'long-put', 'short-call', 'short-put'];

    if (singleLegStrategies.includes(strategyName)) {
        // Call single-leg functions with individual arguments
        return calculationFunction(params.strike, params.premium, params.lots, params.lotSize, params.spotPrices);
    } else {
        // Call multi-leg functions with the entire params object
        return calculationFunction(params);
    }
}

module.exports = {
    calculateStrategy
};