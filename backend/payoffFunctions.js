// backend/payoffFunctions.js

// --- 1. CORE HELPER FUNCTIONS ---
function callPayoff(spot, strike, premium) { return Math.max(0, spot - strike) - premium; }
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
    // Max loss occurs when spot price is 0 (for a single contract, this is Strike - Premium)
    const maxLossValue = (strike * lots * lotSize) - totalPremium; 
    return { payoffCurve: curve, maxProfit: totalPremium, maxLoss: -maxLossValue, breakeven: strike - premium };
}


// --- 3. MULTI-LEG SPREADS (Consolidated) ---
function bullCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        // Long Call 1 - Long Call 2 (Debit Spread)
        const pnl = (callPayoff(spot, strike1, premium1) - callPayoff(spot, strike2, premium2)) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: ((strike2 - strike1) - netPremium) * lots * lotSize, maxLoss: -netPremium * lots * lotSize, breakeven: strike1 + netPremium };
}

function bullPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        // Short Put 1 + Long Put 2 (Credit Spread)
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
        // Short Call 1 + Long Call 2 (Credit Spread)
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
        // Long Put 1 - Short Put 2 (Debit Spread)
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


// --- 4. NEUTRAL STRATEGIES ---

function longStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        const callPayoffVal = Math.max(0, spot - strike) - premium1;
        const putPayoffVal = Math.max(0, strike - spot) - premium2;
        const pnl = (callPayoffVal + putPayoffVal) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: -totalPremium * lots * lotSize, breakeven: [strike - totalPremium, strike + totalPremium] };
}

/**
 * NEW STRATEGY: Short Straddle
 * Sells 1 ATM Call (Strike, Premium1) & Sells 1 ATM Put (Strike, Premium2)
 */
function shortStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const totalCredit = totalPremium * lots * lotSize;

    const curve = [];
    spotPrices.forEach(spot => {
        // P&L = Premium Received - Intrinsic Value of exercised options
        const shortCallIntrinsicLoss = Math.max(0, spot - strike);
        const shortPutIntrinsicLoss = Math.max(0, strike - spot);
        
        const pnlPerShare = totalPremium - shortCallIntrinsicLoss - shortPutIntrinsicLoss;
        const pnl = pnlPerShare * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    // Breakeven Points: Strike +/- Total Premium
    const upperBEP = strike + totalPremium;
    const lowerBEP = strike - totalPremium;

    return { 
        payoffCurve: curve, 
        maxProfit: totalCredit, 
        maxLoss: "Unlimited", 
        breakeven: [lowerBEP, upperBEP] 
    };
}


function longStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        // Note: Strike2 is higher (Call), Strike1 is lower (Put)
        const callPayoffVal = Math.max(0, spot - strike2) - premium2;
        const putPayoffVal = Math.max(0, strike1 - spot) - premium1;
        const pnl = (callPayoffVal + putPayoffVal) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    return { payoffCurve: curve, maxProfit: "Unlimited", maxLoss: -totalPremium * lots * lotSize, breakeven: [strike1 - totalPremium, strike2 + totalPremium] };
}

/**
 * NEW STRATEGY: Short Strangle
 * Sells 1 OTM Call (Strike2, Premium2) & Sells 1 OTM Put (Strike1, Premium1)
 */
function shortStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;
    const totalCredit = totalPremium * lots * lotSize;

    const curve = [];
    spotPrices.forEach(spot => {
        // P&L = Premium Received - Intrinsic Value of exercised options
        // Strike2 is the Call Strike, Strike1 is the Put Strike
        const shortCallIntrinsicLoss = Math.max(0, spot - strike2);
        const shortPutIntrinsicLoss = Math.max(0, strike1 - spot);
        
        const pnlPerShare = totalPremium - shortCallIntrinsicLoss - shortPutIntrinsicLoss;
        const pnl = pnlPerShare * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    // Breakeven Points: Put Strike - Total Premium (Lower), Call Strike + Total Premium (Upper)
    const lowerBEP = strike1 - totalPremium;
    const upperBEP = strike2 + totalPremium;
    
    return { 
        payoffCurve: curve, 
        maxProfit: totalCredit, 
        maxLoss: "Unlimited", 
        breakeven: [lowerBEP, upperBEP] 
    };
}


function ironCondorPayoff(params) {
    const { strike1, strike2, strike3, strike4, netPremium, lots, lotSize, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        // This P&L calculation relies on a pre-calculated netPremium, which is fine for the demo.
        // It's P&L = (Option Payoffs) + Net Credit
        const longPut = Math.max(0, strike1 - spot); // assuming long put is lowest strike
        const shortPut = -Math.max(0, strike2 - spot);
        const shortCall = -Math.max(0, spot - strike3);
        const longCall = Math.max(0, spot - strike4); // assuming long call is highest strike
        
        // Note: The strike order here (strike1 < strike2 < strike3 < strike4) is inverted 
        // compared to the standard visualizer convention (S1, S2, S3, S4 are often S4, S3, S2, S1 for Call Spread / Put Spread notation).
        // Sticking to the code's current strike logic:
        // strike1 (Long Put) < strike2 (Short Put) < strike3 (Short Call) < strike4 (Long Call)
        const pnl = (longPut + shortPut + shortCall + longCall + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const spreadWidth = strike2 - strike1;
    return { payoffCurve: curve, maxProfit: netPremium * lots * lotSize, maxLoss: -(spreadWidth - netPremium) * lots * lotSize, breakeven: [strike2 - netPremium, strike3 + netPremium] };
}

function ironButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const longPut = Math.max(0, strike1 - spot);
        const shortPut = -Math.max(0, strike2 - spot);
        const shortCall = -Math.max(0, spot - strike2);
        const longCall = Math.max(0, spot - strike3);
        const pnl = (longPut + shortPut + shortCall + longCall + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const spreadWidth = strike3 - strike2;
    return { payoffCurve: curve, maxProfit: netPremium * lots * lotSize, maxLoss: -(spreadWidth - netPremium) * lots * lotSize, breakeven: [strike2 - netPremium, strike2 + netPremium] };
}

function callButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;
    const curve = [];
    spotPrices.forEach(spot => {
        const longCall1 = Math.max(0, spot - strike1);
        const shortCall2 = -2 * Math.max(0, spot - strike2);
        const longCall3 = Math.max(0, spot - strike3);
        const pnl = (longCall1 + shortCall2 + longCall3 - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const spreadWidth = strike2 - strike1;
    return { payoffCurve: curve, maxProfit: (spreadWidth - netPremium) * lots * lotSize, maxLoss: -netPremium * lots * lotSize, breakeven: [strike1 + netPremium, strike3 - netPremium] };
}

function calendarSpreadPayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    
    // Calendar spread: Buy longer-term option (premium1), Sell shorter-term option (premium2)
    const netDebit = premium1 - premium2;
    const totalNetDebit = netDebit * lots * lotSize;
    
    const curve = [];
    
    spotPrices.forEach(spot => {
        // --- Simplistic estimation for P&L at short option expiration ---
        const longOptionTimeValue = premium1 * 0.4; // 40% of original premium as time value (simplistic)
        const longOptionTotalValue = Math.max(0, spot - strike) + longOptionTimeValue;
        
        // P&L calculation: (Value of Long Option + Premium of Short Option) - Premium of Long Option
        const totalPnL = (longOptionTotalValue + premium2 - premium1) * lots * lotSize;
        
        curve.push({ spot, payoff: totalPnL });
    });
    
    const maxLoss = -totalNetDebit;
    const maxProfit = (premium2 + (premium1 * 0.4) - premium1) * lots * lotSize;
    
    // Breakeven points: Strike +/- a value related to the net debit (approximation)
    const breakevenValue = totalNetDebit / (lots * lotSize);
    const breakevenLower = strike - breakevenValue;
    const breakevenUpper = strike + breakevenValue;
    
    return { 
        payoffCurve: curve, 
        maxProfit: Math.max(0, maxProfit), 
        maxLoss: maxLoss, 
        breakeven: [breakevenLower.toFixed(2), breakevenUpper.toFixed(2)] 
    };
}


// --- 5. MODULE EXPORTS ---
module.exports = { 
    callPayoff, putPayoff,
    longCallPayoff, longPutPayoff, shortCallPayoff, shortPutPayoff, 
    bullCallSpreadPayoff, bullPutSpreadPayoff, bearCallSpreadPayoff, bearPutSpreadPayoff,
    syntheticLongStockPayoff, syntheticShortStockPayoff, protectivePutPayoff, protectiveCallPayoff,
    longStraddlePayoff, shortStraddlePayoff, // ADDED
    longStranglePayoff, shortStranglePayoff, // ADDED
    ironCondorPayoff, ironButterflyPayoff, callButterflyPayoff, 
    calendarSpreadPayoff
};