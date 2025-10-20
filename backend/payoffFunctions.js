// backend/payoffFunctions.js

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
    const totalPremium = premium * lots * lotSize; // This is the risk
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
    const totalPremium = premium * lots * lotSize; // This is the risk
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
        maxProfitPercentage: "N/A", // Based on margin, cannot be calculated here
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
    const risk = (strike * lots * lotSize) - totalPremium; // Max risk (margin)
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
    // For a bull call spread, you buy a call (premium1) and sell a call (premium2).
    // strike1 < strike2. This is a debit spread.
    const netPremium = premium1 - premium2;
    const curve = [];
    spotPrices.forEach(spot => {
        // P&L is (Long Call P&L) + (Short Call P&L).
        // Using the core helpers: callPayoff(long) - callPayoff(short) is incorrect because the premiums get double-counted.
        // We calculate the final value from intrinsic values and the single net premium paid.
        const longCallValue = Math.max(0, spot - strike1);
        const shortCallValue = -Math.max(0, spot - strike2);
        const pnl = (longCallValue + shortCallValue - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = ((strike2 - strike1) - netPremium) * lots * lotSize;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss; // Risk is the debit paid
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
    // For a bull put spread, you sell a put (premium1) and buy a put (premium2).
    // strike1 > strike2. This is a credit spread.
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
    const risk = -maxLoss; // Risk is the margin required
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
    // For a bear call spread, you sell a call (premium1) and buy a call (premium2).
    // strike1 < strike2. This is a credit spread.
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
    const risk = -maxLoss; // Risk is the margin required
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
    // For a bear put spread, you buy a put (premium1) and sell a put (premium2).
    // strike1 > strike2. This is a debit spread.
    const netPremium = premium1 - premium2; // Debit paid
    const curve = [];
    spotPrices.forEach(spot => {
        const longPutValue = Math.max(0, strike1 - spot);
        const shortPutValue = -Math.max(0, strike2 - spot);
        const pnl = (longPutValue + shortPutValue - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    const maxProfit = ((strike1 - strike2) - netPremium) * lots * lotSize;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss; // Risk is the debit paid
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

function protectiveCallPayoff(params) { // This is more commonly known as a Covered Call
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
    // Max loss occurs if the stock goes to 0. Loss = premium_received - cost_of_stock
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
// FIXED: Implemented the full calculation logic.
function syntheticLongStockPayoff(params) {
    // Synthetic Long Stock = Long Call + Short Put (at the same strike)
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    // premium = call premium, premium2 = put premium
    const netPremium = premium - premium2; // Net cost (debit or credit) to enter the position
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
        breakeven: strike + netPremium, // Breakeven is the strike adjusted by the net cost
        maxProfitPercentage: "Unlimited",
        maxLossPercentage: "N/A", // Cannot be calculated without a defined capital at risk
    };
}

// FIXED: Implemented the full calculation logic.
function syntheticShortStockPayoff(params) {
    // Synthetic Short Stock = Short Call + Long Put (at the same strike)
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    // premium = call premium, premium2 = put premium
    const netPremium = premium - premium2; // Net credit or debit
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
        maxProfitPercentage: "N/A", // Cannot be calculated without margin information
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

function ironCondorPayoff(params) {
    // An Iron Condor is a combination of a bull put spread and a bear call spread.
    // It is a credit strategy.
    // Legs: Long Put (s1), Short Put (s2), Short Call (s3), Long Call (s4)
    // where s1 < s2 < s3 < s4
    const { strike1, strike2, strike3, strike4, netPremium, lots, lotSize, spotPrices } = params;
    const maxProfit = netPremium * lots * lotSize;
    // Max loss is the width of one of the spreads minus the net premium received.
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        const bullPutSpreadValue = Math.max(0, strike2 - spot) - Math.max(0, strike1 - spot);
        const bearCallSpreadValue = Math.max(0, spot - strike3) - Math.max(0, spot - strike4);
        // We combine the intrinsic values of the spreads.
        // The total value at expiration is the sum of the short positions minus the long positions.
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

// NO CHANGE NEEDED, LOGIC IS CORRECT. Added comments for clarity.
function ironButterflyPayoff(params) {
    // An Iron Butterfly is like an Iron Condor where the short strikes are the same.
    // It is a credit strategy.
    // Legs: Long Put (s1), Short Put (s2), Short Call (s2), Long Call (s3)
    // where s1 < s2 < s3
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;
    const maxProfit = netPremium * lots * lotSize;
    const maxLoss = -((strike2 - strike1) - netPremium) * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];
    spotPrices.forEach(spot => {
        // P&L = (intrinsic value of all 4 legs) + net premium received
        // Using the payoff functions with zero premium calculates the intrinsic value of each leg.
        const longPut_s1 = putPayoff(spot, strike1, 0);   // +max(0, s1 - spot)
        const shortPut_s2 = -putPayoff(spot, strike2, 0); // -max(0, s2 - spot)
        const shortCall_s2 = -callPayoff(spot, strike2, 0); // -max(0, spot - s2)
        const longCall_s3 = callPayoff(spot, strike3, 0); // +max(0, spot - s3)
        const pnl = (longPut_s1 + shortPut_s2 + shortCall_s2 + longCall_s3 + netPremium) * lots * lotSize;
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
    // Long Call Butterfly is a debit strategy.
    // Legs: Long Call (s1), 2 Short Calls (s2), Long Call (s3)
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

// FIXED: This function now correctly calculates and uses the netPremium.
function calendarSpreadPayoff(params) {
    // A calendar spread's payoff at the expiration of the short-term option is complex.
    // It depends on the remaining time value and implied volatility of the long-term option,
    // which cannot be calculated without a pricing model (like Black-Scholes) and more inputs
    // (e.g., volatility, interest rates, days to expiration for both options).
    //
    // THEREFORE, this function provides a *CONCEPTUAL and SIMPLIFIED* representation.
    // It creates a parabolic curve to show the general shape of the P&L but is not financially precise.
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;

    // A calendar spread is a debit spread.
    // premium1 = long-term premium (bought), premium2 = short-term premium (sold)
    const netPremium = premium1 - premium2;
    const maxLoss = -netPremium * lots * lotSize;
    const risk = -maxLoss;
    const curve = [];

    spotPrices.forEach(spot => {
        // This is an arbitrary formula to create the characteristic "tent" shape.
        // It assumes max profit is roughly 2x the risk, peaking at the strike price.
        const estimatedMaxProfit = risk * 2; // A more conservative estimate
        const distanceFromStrike = Math.abs(spot - strike);
        
        // Decay factor increases exponentially as the spot moves away from the strike.
        // The denominator (strike * 0.15) controls the width of the profit tent. A smaller value makes it narrower.
        const decayFactor = Math.pow(distanceFromStrike, 2) / Math.pow(strike * 0.15, 2);
        
        let pnl = estimatedMaxProfit - (decayFactor * estimatedMaxProfit);
        // Ensure P&L doesn't go below the defined max loss.
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