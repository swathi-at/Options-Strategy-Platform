// --- 1. CORE HELPER FUNCTIONS ---
function callPayoff(spot, strike, premium) {
    return Math.max(0, spot - strike) - premium;
}

function putPayoff(spot, strike, premium) {
    return Math.max(0, strike - spot) - premium;
}


// --- 2. SINGLE LEG STRATEGIES ---
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
        maxProfitPercentage: "N/A", 
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
    const risk = (strike * lots * lotSize) - totalPremium; 
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
function bullCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
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
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
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
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
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
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    // premium = call premium, premium2 = put premium
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
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    // premium = call premium, premium2 = put premium
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
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
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
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
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
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        // Long put at strike1, long call at strike2
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
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
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

// --- [FIXED: This block calculates netPremium] ---
function ironCondorPayoff(params) {
    // Legs: Long Put (s1, p1), Short Put (s2, p2), Short Call (s3, p3), Long Call (s4, p4)
    // where s1 < s2 < s3 < s4
    const { 
        strike1, premium1, 
        strike2, premium2, 
        strike3, premium3, 
        strike4, premium4, 
        lots, lotSize, spotPrices 
    } = params;

    // Calculate netPremium (credit) from the individual premiums
    const netPremium = (premium2 + premium3) - (premium1 + premium4);

    const maxProfit = netPremium * lots * lotSize;
    // Assumes put spread width is the basis for risk, which is common
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize; 
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const intrinsicValue = -Math.max(0, strike2-spot) + Math.max(0, strike1-spot) - Math.max(0, spot-strike3) + Math.max(0, spot-strike4);
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

// --- [FIXED: This block calculates netPremium] ---
function ironButterflyPayoff(params) {
    // Legs: Long Put (s1, p1), Short Put (s2, p2), Short Call (s2, p3), Long Call (s3, p4)
    // where s1 < s2 < s3
    const { 
        strike1, premium1, 
        strike2, premium2, premium3, // s2 has two premiums: p2 (put) and p3 (call)
        strike3, premium4, // s3 has one premium: p4 (call)
        lots, lotSize, spotPrices 
    } = params;

    // Calculate netPremium (credit) from the individual premiums
    const netPremium = (premium2 + premium3) - (premium1 + premium4);

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

// --- [FIXED: This block calculates netPremium] ---
function callButterflyPayoff(params) {
    // Legs: Long Call (s1, p1), 2 Short Calls (s2, p2), Long Call (s3, p3)
    // This is a debit strategy.
    const { 
        strike1, premium1, 
        strike2, premium2, 
        strike3, premium3, 
        lots, lotSize, spotPrices 
    } = params;

    // Calculate netPremium (debit) from the individual premiums
    // We assume premium2 is for *one* short call, so multiply by 2
    const netPremium = premium1 + premium3 - (2 * premium2);

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
// --- [END OF ALL FIXES] ---


function calendarSpreadPayoff(params) {
    
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;

    const netPremium = premium1 - premium2;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];

    spotPrices.forEach(spot => {
        
        const estimatedMaxProfit = risk * 2; 
        const distanceFromStrike = Math.abs(spot - strike);
        
       
        const decayFactor = Math.pow(distanceFromStrike, 2) / Math.pow(strike * 0.15, 2);
        
        let pnl = estimatedMaxProfit - (decayFactor * estimatedMaxProfit);
        
        pnl = Math.max(pnl, -risk);

        curve.push({ spot, payoff: pnl });
    });

    const calculatedMaxProfit = Math.max(...curve.map(p => p.payoff));

    return {
        payoffCurve: curve,
        maxProfit: calculatedMaxProfit > 0 ? calculatedMaxProfit : "Variable",
        maxLoss: maxLoss,
        breakeven: "Variable",
        maxProfitPercentage: "Variable",
        maxLossPercentage: (risk > 0) ? -100 : "N/A",
    };
}


// --- 7. MODULE EXPORTS ---
module.exports = {
    longCallPayoff, longPutPayoff, shortCallPayoff, shortPutPayoff,
    bullCallSpreadPayoff, bullPutSpreadPayoff, bearCallSpreadPayoff, bearPutSpreadPayoff,
    protectivePutPayoff, protectiveCallPayoff,
    syntheticLongStockPayoff, syntheticShortStockPayoff,
    longStraddlePayoff, shortStraddlePayoff, longStranglePayoff, shortStranglePayoff,
    ironCondorPayoff, ironButterflyPayoff, callButterflyPayoff,
    calendarSpreadPayoff
};