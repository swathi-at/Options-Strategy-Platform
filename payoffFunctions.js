
const getCallPayoff = (spot, strike, premium, lots, lotSize, direction) => {

    const intrinsicValue = Math.max(0, spot - strike);
    
    // P&L per share: (Intrinsic Value - Cost/Credit) * Multiplier * Direction
    // Direction is applied to both the intrinsic value and the initial cost/credit.
    if (direction === 1) { // Long Call (Debit)
        return (intrinsicValue - premium) * lots * lotSize;
    } else { // Short Call (Credit)
        return (premium - intrinsicValue) * lots * lotSize;
    }
};

/**
 * Calculates the P&L for a single Put option (Long or Short).
 * @param {number} spot - The price of the underlying asset at expiry.
 * @param {number} strike - The strike price of the option.
 * @param {number} premium - The premium amount.
 * @param {number} lots - The number of contracts.
 * @param {number} lotSize - The multiplier per contract.
 * @param {number} direction - 1 for Long Put (Buy), -1 for Short Put (Sell).
 * @returns {number} The P&L for all contracts in that leg.
 */
const getPutPayoff = (spot, strike, premium, lots, lotSize, direction) => {
    // Intrinsic Value (max(Strike - Spot, 0))
    const intrinsicValue = Math.max(0, strike - spot);
    
    // P&L per share: (Intrinsic Value - Cost/Credit) * Multiplier * Direction
    if (direction === 1) { // Long Put (Debit)
        return (intrinsicValue - premium) * lots * lotSize;
    } else { // Short Put (Credit)
        return (premium - intrinsicValue) * lots * lotSize;
    }
};

// ----------------------------------------------------------------------
// 2. EXISTING SINGLE-LEG STRATEGIES (Modified to use new helpers)
// ----------------------------------------------------------------------

function calculateLongCall(options) {
    const { strike, premium, lots = 1, lotSize = 1 } = options;
    if (strike <= 0 || premium < 0 || lotSize <= 0 || lots <= 0) {
        return { payoffCurve: [], maxLoss: 0, maxProfit: 0, breakeven: 0, error: "Invalid inputs." };
    }

    const spotRange = { min: strike * 0.85, max: strike * 1.15, step: (strike / 200) };
    const payoffCurve = [];

    for (let spot = spotRange.min; spot <= spotRange.max; spot += spotRange.step) {
        // Use the new helper for Long Call (direction 1)
        const pnl = getCallPayoff(spot, strike, premium, lots, lotSize, 1);
        
        payoffCurve.push({ 
            spot: parseFloat(spot.toFixed(2)), 
            pnl: parseFloat(pnl.toFixed(2)),
            leg1: parseFloat(pnl.toFixed(2)), // For chart consistency, the single leg is also leg1
            leg2: 0 // Placeholder for spread plotting
        });
    }

    const maxLoss = -premium * lots * lotSize;
    const breakeven = strike + premium;
    const maxProfit = "Unlimited";

    return { payoffCurve, maxLoss, maxProfit, breakeven };
}

function calculateLongPut(options) {
    const { strike, premium, lots = 1, lotSize = 1 } = options;
    if (strike <= 0 || premium < 0 || lotSize <= 0 || lots <= 0) {
        return { payoffCurve: [], maxLoss: 0, maxProfit: 0, breakeven: 0, error: "Invalid inputs." };
    }

    const spotRange = { min: strike * 0.85, max: strike * 1.15, step: (strike / 200) };
    const payoffCurve = [];

    for (let spot = spotRange.min; spot <= spotRange.max; spot += spotRange.step) {
        // Use the new helper for Long Put (direction 1)
        const pnl = getPutPayoff(spot, strike, premium, lots, lotSize, 1);

        payoffCurve.push({ 
            spot: parseFloat(spot.toFixed(2)), 
            pnl: parseFloat(pnl.toFixed(2)),
            leg1: parseFloat(pnl.toFixed(2)), // For chart consistency, the single leg is also leg1
            leg2: 0 // Placeholder for spread plotting
        });
    }

    const maxLoss = -premium * lots * lotSize;
    const breakeven = strike - premium;
    const maxProfit = (strike * lots * lotSize) + maxLoss;

    return { payoffCurve, maxLoss, maxProfit, breakeven };
}


// ----------------------------------------------------------------------
// 3. NEW SPREAD STRATEGIES CODE
// ----------------------------------------------------------------------

/**
 * Calculates the payoff for a Bull Call Spread.
 * Long Call (lower strike) + Short Call (higher strike)
 * @param {object} options The options parameters.
 * @returns {object} An object containing the payoff curve and key metrics.
 */
function calculateBullCallSpread(options) {
    // The frontend sends strike1/premium1 (Long Leg) and strike2/premium2 (Short Leg)
    const { strike1, premium1, strike2, premium2, lots = 1, lotSize = 1 } = options;

    // Determine Long/Short Leg and Net Debit/Credit
    const K_Long = Math.min(strike1, strike2);
    const K_Short = Math.max(strike1, strike2);
    const C_Long = (strike1 === K_Long) ? premium1 : premium2;
    const C_Short = (strike2 === K_Short) ? premium2 : premium1;
    const netDebit = C_Long - C_Short;
    const multiplier = lots * lotSize;

    // Use K_Long as the center for the spot range
    const spotRange = { min: K_Long * 0.85, max: K_Short * 1.15, step: ((K_Short - K_Long) / 50) || 5 };
    const payoffCurve = [];

    for (let spot = spotRange.min; spot <= spotRange.max; spot += spotRange.step) {
        // Leg 1: Long Call @ K_Long (direction 1)
        const leg1Pnl = getCallPayoff(spot, K_Long, C_Long, lots, lotSize, 1);
        
        // Leg 2: Short Call @ K_Short (direction -1)
        const leg2Pnl = getCallPayoff(spot, K_Short, C_Short, lots, lotSize, -1);
        
        const pnl = leg1Pnl + leg2Pnl;

        payoffCurve.push({ 
            spot: parseFloat(spot.toFixed(2)), 
            pnl: parseFloat(pnl.toFixed(2)),
            leg1: parseFloat(leg1Pnl.toFixed(2)),
            leg2: parseFloat(leg2Pnl.toFixed(2))
        });
    }

    const maxLoss = -netDebit * multiplier; // Max loss is the net debit paid
    const maxProfit = (K_Short - K_Long - netDebit) * multiplier;
    const breakeven = K_Long + netDebit;
    
    // If the calculation suggests max profit is infinite or max loss is unlimited, this is an error in formula logic.
    const safeMaxProfit = (typeof maxProfit === 'number') ? parseFloat(maxProfit.toFixed(2)) : maxProfit;
    const safeMaxLoss = (typeof maxLoss === 'number') ? parseFloat(maxLoss.toFixed(2)) : maxLoss;

    return { 
        payoffCurve, 
        maxLoss: safeMaxLoss, 
        maxProfit: safeMaxProfit, 
        breakeven: parseFloat(breakeven.toFixed(2)) 
    };
}


/**
 * Calculates the payoff for a Bull Put Spread.
 * Short Put (higher strike) + Long Put (lower strike)
 * @param {object} options The options parameters.
 * @returns {object} An object containing the payoff curve and key metrics.
 */
function calculateBullPutSpread(options) {
    // The frontend sends strike1/premium1 and strike2/premium2
    const { strike1, premium1, strike2, premium2, lots = 1, lotSize = 1 } = options;

    // Determine Short/Long Leg and Net Credit/Debit
    const K_Short = Math.max(strike1, strike2); // Short Put is at the higher strike
    const K_Long = Math.min(strike1, strike2);  // Long Put is at the lower strike
    const P_Short = (strike1 === K_Short) ? premium1 : premium2;
    const P_Long = (strike2 === K_Long) ? premium2 : premium1;
    const netCredit = P_Short - P_Long;
    const multiplier = lots * lotSize;

    // Use K_Short as the center for the spot range
    const spotRange = { min: K_Long * 0.85, max: K_Short * 1.15, step: ((K_Short - K_Long) / 50) || 5 };
    const payoffCurve = [];

    for (let spot = spotRange.min; spot <= spotRange.max; spot += spotRange.step) {
        // Leg 1: Short Put @ K_Short (direction -1)
        const leg1Pnl = getPutPayoff(spot, K_Short, P_Short, lots, lotSize, -1);
        
        // Leg 2: Long Put @ K_Long (direction 1)
        const leg2Pnl = getPutPayoff(spot, K_Long, P_Long, lots, lotSize, 1);
        
        const pnl = leg1Pnl + leg2Pnl;

        payoffCurve.push({ 
            spot: parseFloat(spot.toFixed(2)), 
            pnl: parseFloat(pnl.toFixed(2)),
            leg1: parseFloat(leg1Pnl.toFixed(2)),
            leg2: parseFloat(leg2Pnl.toFixed(2))
        });
    }

    const maxProfit = netCredit * multiplier; // Max profit is the net credit received
    const maxLoss = (K_Long - K_Short + netCredit) * multiplier; // Max Loss = (Spread Width - Net Credit)
    const breakeven = K_Short - netCredit;
    
    // Ensure metrics are rounded and safe
    const safeMaxProfit = (typeof maxProfit === 'number') ? parseFloat(maxProfit.toFixed(2)) : maxProfit;
    const safeMaxLoss = (typeof maxLoss === 'number') ? parseFloat(maxLoss.toFixed(2)) : maxLoss;

    return { 
        payoffCurve, 
        maxLoss: safeMaxLoss, 
        maxProfit: safeMaxProfit, 
        breakeven: parseFloat(breakeven.toFixed(2)) 
    };
}


module.exports = { 
    calculateLongCall,
    calculateLongPut,
    calculateBullCallSpread, 
    calculateBullPutSpread   
};