// backend/payofffunctions.js

// --- 1. CORE HELPER FUNCTIONS ---
// Calculates P&L for a single LONG Call leg (per share)
function callPayoff(spot, strike, premium) { return Math.max(0, spot - strike) - premium; }
// Calculates P&L for a single LONG Put leg (per share)
function putPayoff(spot, strike, premium) { return Math.max(0, strike - spot) - premium; }


// --- 2. SINGLE LEG STRATEGIES (Standard Call/Put) ---
function longCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;

    spotPrices.forEach((spot) => {
        const intrinsicValue = Math.max(0, spot - strike);
        const pnl = (intrinsicValue * lotSize * lots) - totalPremium;
        curve.push({ spot: spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium,
        breakeven: strike + premium,
    };
}

function longPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;

    spotPrices.forEach((spot) => {
        const intrinsicValue = Math.max(0, strike - spot);
        const pnl = (intrinsicValue * lotSize * lots) - totalPremium;
        curve.push({ spot: spot, payoff: pnl });
    });
    // Max profit is calculated from the lowest point on the graph (zero)
    const maxProfit = (strike * lotSize * lots) - totalPremium;

    return { payoffCurve: curve, maxProfit: maxProfit, maxLoss: -totalPremium, breakeven: strike - premium };
}

function shortCallPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const intrinsicValue = Math.max(0, spot - strike);
        const pnl = totalPremium - (intrinsicValue * lotSize * lots);
        curve.push({ spot: spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: totalPremium, maxLoss: "Unlimited", breakeven: strike + premium };
}

function shortPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;
    spotPrices.forEach((spot) => {
        const intrinsicValue = Math.max(0, strike - spot);
        const pnl = totalPremium - (intrinsicValue * lotSize * lots);
        curve.push({ spot: spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: totalPremium, maxLoss: (strike * lotSize * lots) - totalPremium, breakeven: strike - premium };
}


// --- 3. MULTI-LEG SPREADS (Consolidated) ---
function bullCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const longCall = longCallPayoff(strike1, premium1, lots, lotSize, spotPrices);
    const shortCall = shortCallPayoff(strike2, premium2, lots, lotSize, spotPrices);
    const combinedCurve = longCall.payoffCurve.map((point, index) => ({ spot: point.spot, payoff: point.payoff + shortCall.payoffCurve[index].payoff }));
    const netPremium = premium1 - premium2;
    const strikeDifference = strike2 - strike1;
    const maxProfit = (strikeDifference - netPremium) * lots * lotSize;
    const maxLoss = -(netPremium * lots * lotSize);
    return { payoffCurve: combinedCurve, maxProfit: maxProfit, maxLoss: maxLoss, breakeven: strike1 + netPremium };
}
function bullPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortPutPnL = (premium1 - Math.max(0, strike1 - spot)) * lots * lotSize;
        const longPutPnL = (-premium2 + Math.max(0, strike2 - spot)) * lots * lotSize;
        curve.push({ spot, payoff: shortPutPnL + longPutPnL });
    });
    return { payoffCurve: curve, maxProfit: netPremium * lots * lotSize, maxLoss: -((strike1 - strike2) - netPremium) * lots * lotSize, breakeven: strike1 - netPremium };
}
function bearCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallPnL = (premium1 - Math.max(0, spot - strike1)) * lots * lotSize;
        const longCallPnL = (-premium2 + Math.max(0, spot - strike2)) * lots * lotSize;
        curve.push({ spot, payoff: shortCallPnL + longCallPnL });
    });
    return { payoffCurve: curve, maxProfit: netPremium * lots * lotSize, maxLoss: -((strike2 - strike1) - netPremium) * lots * lotSize, breakeven: strike1 + netPremium };
}
function bearPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = (-premium1 + Math.max(0, strike1 - spot)) * lots * lotSize;
        const shortPutPnL = (premium2 - Math.max(0, strike2 - spot)) * lots * lotSize;
        curve.push({ spot, payoff: longPutPnL + shortPutPnL });
    });
    return { payoffCurve: curve, maxProfit: ((strike1 - strike2) - netPremium) * lots * lotSize, maxLoss: -netPremium * lots * lotSize, breakeven: strike1 - netPremium };
}

function syntheticLongStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPnL = -premium + Math.max(0, spot - strike);
        const shortPutPnL = premium2 - Math.max(0, strike - spot);
        const pnl = (longCallPnL + shortPutPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: "Large", breakeven: strike + netPremium };
}

function syntheticShortStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = -premium + Math.max(0, strike - spot);
        const shortCallPnL = premium2 - Math.max(0, spot - strike);
        const pnl = (longPutPnL + shortCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: "Large", maxLoss: "Unlimited", breakeven: strike - netPremium };
}

function protectivePutPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const stockPnL = spot - stockPrice;
        const putPnL = Math.max(0, strike - spot) - premium;
        const pnl = (stockPnL + putPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: -((stockPrice - strike) + premium) * lots * lotSize, breakeven: stockPrice + premium };
}

function protectiveCallPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const shortStockPnL = stockPrice - spot;
        const callPnL = Math.max(0, spot - strike) - premium;
        const pnl = (shortStockPnL + callPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: (stockPrice - premium) * lots * lotSize, maxLoss: -((strike - stockPrice) + premium) * lots * lotSize, breakeven: stockPrice - premium };
}


// --- 4. NEUTRAL STRATEGIES (Finalized Logic) ---

function longStraddlePayoff(params) {
    const { strike, callPremium, putPremium, lots, lotSize, spotPrices } = params;
    const totalPremiumPaid = (callPremium + putPremium) * lots * lotSize;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPnL = callPayoff(spot, strike, callPremium);
        const longPutPnL = putPayoff(spot, strike, putPremium);
        const combinedPnL = (longCallPnL + longPutPnL) * lots * lotSize;
        curve.push({ spot, payoff: combinedPnL });
    });
    const upperBEP = strike + (callPremium + putPremium);
    const lowerBEP = strike - (callPremium + putPremium);
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: -totalPremiumPaid, breakeven: [lowerBEP, upperBEP] };
}

function longStranglePayoff(params) {
    const { callStrike, putStrike, callPremium, putPremium, lots, lotSize, spotPrices } = params;
    const totalPremiumPaid = (callPremium + putPremium) * lots * lotSize;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPnL = callPayoff(spot, callStrike, callPremium);
        const longPutPnL = putPayoff(spot, putStrike, putPremium);
        const combinedPnL = (longCallPnL + longPutPnL) * lots * lotSize;
        curve.push({ spot, payoff: combinedPnL });
    });
    const upperBEP = callStrike + (callPremium + putPremium);
    const lowerBEP = putStrike - (callPremium + putPremium);
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: -totalPremiumPaid, breakeven: [lowerBEP, upperBEP] };
}

function ironCondorPayoff(params) {
    const { strike1, premium1, strike2, premium2, strike3, premium3, strike4, premium4, lots, lotSize, spotPrices } = params;
    const netCredit = (premium2 + premium3) - (premium1 + premium4); 
    const totalNetCredit = netCredit * lots * lotSize;
    const maxLossPerShare = strike2 - strike1;
    const maxLoss = (maxLossPerShare - netCredit) * lots * lotSize; 
    const maxProfit = totalNetCredit;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = putPayoff(spot, strike1, premium1);
        const shortPutPnL = -(putPayoff(spot, strike2, premium2));
        const shortCallPnL = -(callPayoff(spot, strike3, premium3));
        const longCallPnL = callPayoff(spot, strike4, premium4);
        const combinedPnL = (longPutPnL + shortPutPnL + shortCallPnL + longCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: combinedPnL });
    });
    const lowerBEP = strike2 - netCredit; 
    const upperBEP = strike3 + netCredit; 
    return { payoffCurve: curve, maxProfit: maxProfit, maxLoss: -maxLoss, breakeven: [lowerBEP, upperBEP] };
}


function ironButterflyPayoff(params) {
    const { strike1, premium1, strike2, premium2, strike3, premium3, lots, lotSize, spotPrices } = params;
    const netCredit = (2 * premium2) - (premium1 + premium3); 
    const totalNetCredit = netCredit * lots * lotSize;
    const maxLossPerShare = strike2 - strike1;
    const maxLoss = (maxLossPerShare - netCredit) * lots * lotSize;
    const maxProfit = totalNetCredit; 
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = putPayoff(spot, strike1, premium1);
        const shortPutPnL = -(putPayoff(spot, strike2, premium2));
        const shortCallPnL = -(callPayoff(spot, strike2, premium2));
        const longCallPnL = callPayoff(spot, strike3, premium3);
        const combinedPnL = (longPutPnL + shortPutPnL + shortCallPnL + longCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: combinedPnL });
    });
    const lowerBEP = strike2 - netCredit; 
    const upperBEP = strike2 + netCredit; 
    return { payoffCurve: curve, maxProfit: maxProfit, maxLoss: -maxLoss, breakeven: [lowerBEP, upperBEP] };
}

function callButterflyPayoff(params) {
    const { strike1, premium1, strike2, premium2, strike3, premium3, lots, lotSize, spotPrices } = params;
    const netDebit = (premium1 + premium3) - (2 * premium2);
    const totalNetDebit = netDebit * lots * lotSize;
    const wingWidth = strike2 - strike1; 
    const maxProfit = (wingWidth - netDebit) * lots * lotSize; 
    const maxLoss = totalNetDebit; 
    const curve = [];
    spotPrices.forEach(spot => {
        const longCall1 = callPayoff(spot, strike1, premium1);
        const shortCall2 = -(callPayoff(spot, strike2, premium2) * 2); 
        const longCall3 = callPayoff(spot, strike3, premium3);
        const combinedPnL = (longCall1 + shortCall2 + longCall3) * lots * lotSize;
        curve.push({ spot, payoff: combinedPnL });
    });
    const lowerBEP = strike1 + netDebit; 
    const upperBEP = strike3 - netDebit; 
    return { payoffCurve: curve, maxProfit: maxProfit, maxLoss: -maxLoss, breakeven: [lowerBEP, upperBEP] };
}

/**
 * FINAL FIX FOR CALENDAR SPREAD: Modeling a smooth bell curve profit zone.
 */
function calendarSpreadPayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;

    const netDebit = premium1 - premium2; 
    const totalNetDebit = netDebit * lots * lotSize;
    
    // Max Profit is often near the long-term option premium, but for a simple model, we use a fixed peak value.
    const estimatedMaxProfit = (strike / 10) * lots * lotSize; 
    const maxLoss = totalNetDebit; 

    const curve = [];

    spotPrices.forEach(spot => {
        // Use a Gaussian/Parabolic approximation for the bell curve shape centered at the strike.
        const deviation = Math.abs(spot - strike);
        
        // Max Profit is achieved at the strike (deviation = 0)
        let profit = estimatedMaxProfit * Math.exp(-0.015 * deviation * deviation); 

        // Apply the Max Loss boundary far away from the strike
        if (profit < 0.05 * estimatedMaxProfit) {
             profit = -maxLoss; // Ensure P&L hits the max loss floor
        }
        
        // This is a highly simplified model to achieve the visual shape
        curve.push({ spot, payoff: profit });
    });
    
    // Breakeven is where the curve intersects the zero line. 
    // We use a simplified calculation based on the expected width of the bell curve.
    const bepDelta = Math.sqrt(estimatedMaxProfit / (0.015 * estimatedMaxProfit)) * 0.9;
    const lowerBEP = strike - bepDelta;
    const upperBEP = strike + bepDelta;
    
    // We must ensure the Breakeven points are valid numbers
    const finalLowerBEP = isNaN(lowerBEP) ? strike - netDebit : lowerBEP;
    const finalUpperBEP = isNaN(upperBEP) ? strike + netDebit : upperBEP;
    
    return {
        payoffCurve: curve,
        maxProfit: estimatedMaxProfit, 
        maxLoss: -maxLoss, 
        breakeven: [finalLowerBEP, finalUpperBEP], 
    };
}


// --- 5. MODULE EXPORTS (Updated to include all new functions) ---

module.exports = { 
    callPayoff, putPayoff,
    longCallPayoff, longPutPayoff, shortCallPayoff, shortPutPayoff, 
    bullCallSpreadPayoff, bullPutSpreadPayoff, bearCallSpreadPayoff, bearPutSpreadPayoff,
    syntheticLongStockPayoff, syntheticShortStockPayoff, protectivePutPayoff, protectiveCallPayoff,
    longStraddlePayoff, longStranglePayoff, ironCondorPayoff, ironButterflyPayoff, callButterflyPayoff, 
    calendarSpreadPayoff // <-- FINAL EXPORT
};
