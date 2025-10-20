// backend/strategyengine.js

const payoffFunctions = require('./payoffFunctions');

/**
 * A map that connects the strategy identifier string from the frontend
 * to the corresponding calculation function in the backend.
 */
const strategyMap = {
    // Single Leg
    'long-call': payoffFunctions.longCallPayoff,
    'long-put': payoffFunctions.longPutPayoff,
    'short-call': payoffFunctions.shortCallPayoff,
    'short-put': payoffFunctions.shortPutPayoff,

    // Spreads (Directional)
    'bull-call-spread': payoffFunctions.bullCallSpreadPayoff,
    'bull-put-spread': payoffFunctions.bullPutSpreadPayoff,
    'bear-call-spread': payoffFunctions.bearCallSpreadPayoff,
    'bear-put-spread': payoffFunctions.bearPutSpreadPayoff,

    // Stock + Option
    'protective-put': payoffFunctions.protectivePutPayoff,
    'protective-call': payoffFunctions.protectiveCallPayoff,

    // Synthetics
    'synthetic-long-stock': payoffFunctions.syntheticLongStockPayoff,
    'synthetic-short-stock': payoffFunctions.syntheticShortStockPayoff,

    // Volatility & Neutral
    'long-straddle': payoffFunctions.longStraddlePayoff,
    'short-straddle': payoffFunctions.shortStraddlePayoff,
    'long-strangle': payoffFunctions.longStranglePayoff,
    'short-strangle': payoffFunctions.shortStranglePayoff,
    'iron-condor': payoffFunctions.ironCondorPayoff,
    'iron-butterfly': payoffFunctions.ironButterflyPayoff,
    'call-butterfly': payoffFunctions.callButterflyPayoff,
    'calendar-spread': payoffFunctions.calendarSpreadPayoff,
};

/**
 * Calculates the payoff for a given options strategy.
 */
function calculateStrategy(strategyName, params) {
    const calculationFunction = strategyMap[strategyName];

    if (!calculationFunction) {
        throw new Error(`Strategy "${strategyName}" not found or is not implemented.`);
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

module.exports = { calculateStrategy };