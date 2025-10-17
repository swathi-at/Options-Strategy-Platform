const payoffFunctions = require('./payoffFunctions');

/**
 * A map that connects the strategy identifier string from the frontend
 * to the corresponding calculation function in the backend.
 * This makes the system modular and easy to extend.
 */
const strategyMap = {
    'long-call': payoffFunctions.longCallPayoff,
    'long-put': payoffFunctions.longPutPayoff,
    'short-call': payoffFunctions.shortCallPayoff,
    'short-put': payoffFunctions.shortPutPayoff,
    'bull-call-spread': payoffFunctions.bullCallSpreadPayoff,
    'bull-put-spread': payoffFunctions.bullPutSpreadPayoff,
    'bear-call-spread': payoffFunctions.bearCallSpreadPayoff,
    'bear-put-spread': payoffFunctions.bearPutSpreadPayoff,
    'protective-put': payoffFunctions.protectivePutPayoff,
    'protective-call': payoffFunctions.protectiveCallPayoff,
    'synthetic-long-stock': payoffFunctions.syntheticLongStockPayoff,
    'synthetic-short-stock': payoffFunctions.syntheticShortStockPayoff,
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
 * @param {string} strategyName - The identifier for the strategy (e.g., 'bull-call-spread').
 * @param {object} params - An object containing all necessary parameters for the calculation.
 * @returns {object} The calculated payoff data.
 * @throws {Error} If the strategyName is not found in the strategyMap.
 */
function calculateStrategy(strategyName, params) {
    const calculationFunction = strategyMap[strategyName];
    
    if (!calculationFunction) {
        throw new Error(`Strategy "${strategyName}" not found or is not implemented.`);
    }
    
    // For single-leg strategies that don't expect a single params object,
    // we can call them with destructured arguments. For others, we pass the whole object.
    // NOTE: This logic assumes your payoffFunctions are structured as we discussed.
    // A simpler alternative is to make ALL payoff functions accept a single 'params' object.
    
    const singleLegStrategies = ['long-call', 'long-put', 'short-call', 'short-put'];

    if (singleLegStrategies.includes(strategyName)) {
        return calculationFunction(params.strike, params.premium, params.lots, params.lotSize, params.spotPrices);
    } else {
        return calculationFunction(params);
    }
}

module.exports = { calculateStrategy };