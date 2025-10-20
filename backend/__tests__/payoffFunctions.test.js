// backend/__tests__/payoffFunctions.test.js

const payoffFunctions = require('../payoffFunctions');

const lots = 1;
const lotSize = 50;

describe('Single-Leg Strategies', () => {
    const spotPrices = [90, 100, 110];

    test('longCallPayoff calculates correctly', () => {
        const result = payoffFunctions.longCallPayoff(23600, 100, lots, lotSize, spotPrices);
        expect(result.maxLoss).toBe(-5000);
        expect(result.breakeven).toBe(23700);
        expect(result.maxProfit).toBe("Unlimited");
    });

    test('longPutPayoff calculates correctly', () => {
        const result = payoffFunctions.longPutPayoff(23400, 110, lots, lotSize, spotPrices);
        expect(result.maxLoss).toBe(-5500);
        expect(result.maxProfit).toBe(1164500);
        expect(result.breakeven).toBe(23290);
    });

    test('shortCallPayoff calculates correctly', () => {
        const result = payoffFunctions.shortCallPayoff(23700, 60, lots, lotSize, spotPrices);
        expect(result.maxProfit).toBe(3000);
        expect(result.breakeven).toBe(23760);
        expect(result.maxLoss).toBe("Unlimited");
    });

    test('shortPutPayoff calculates correctly', () => {
        const result = payoffFunctions.shortPutPayoff(23300, 75, lots, lotSize, spotPrices);
        expect(result.maxProfit).toBe(3750);
        expect(result.maxLoss).toBe(-1161250);
        expect(result.breakeven).toBe(23225);
    });
});

describe('Spread Strategies', () => {
    const spotPrices = [23400, 23500, 23600, 23700];

    test('bullCallSpreadPayoff calculates correctly', () => {
        const params = { strike1: 23500, premium1: 150, strike2: 23600, premium2: 100, lots, lotSize, spotPrices };
        const result = payoffFunctions.bullCallSpreadPayoff(params);
        expect(result.maxProfit).toBe(2500);
        expect(result.maxLoss).toBe(-2500);
        expect(result.breakeven).toBe(23550);
    });

    test('bullPutSpreadPayoff calculates correctly', () => {
        const params = { strike1: 23500, premium1: 150, strike2: 23400, premium2: 110, lots, lotSize, spotPrices };
        const result = payoffFunctions.bullPutSpreadPayoff(params);
        expect(result.maxProfit).toBe(2000);
        expect(result.maxLoss).toBe(-3000);
        expect(result.breakeven).toBe(23460);
    });

    test('bearCallSpreadPayoff calculates correctly', () => {
        const params = { strike1: 23500, premium1: 150, strike2: 23600, premium2: 100, lots, lotSize, spotPrices };
        const result = payoffFunctions.bearCallSpreadPayoff(params);
        expect(result.maxProfit).toBe(2500);
        expect(result.maxLoss).toBe(-2500);
        expect(result.breakeven).toBe(23550);
    });

    test('bearPutSpreadPayoff calculates correctly', () => {
        const params = { strike1: 23500, premium1: 150, strike2: 23400, premium2: 110, lots, lotSize, spotPrices };
        const result = payoffFunctions.bearPutSpreadPayoff(params);
        expect(result.maxProfit).toBe(3000);
        expect(result.maxLoss).toBe(-2000);
        expect(result.breakeven).toBe(23460);
    });
});

describe('Stock + Option Strategies', () => {
    const spotPrices = [23400, 23500, 23600, 23700];

    test('protectivePutPayoff calculates correctly', () => {
        const params = { stockPrice: 23550, strike: 23400, premium: 110, lots, lotSize, spotPrices };
        const result = payoffFunctions.protectivePutPayoff(params);
        expect(result.maxProfit).toBe("Unlimited");
        expect(result.maxLoss).toBe(-13000);
        expect(result.breakeven).toBe(23660);
    });

    test('protectiveCallPayoff (Covered Call) calculates correctly', () => {
        const params = { stockPrice: 23450, strike: 23600, premium: 100, lots, lotSize, spotPrices };
        const result = payoffFunctions.protectiveCallPayoff(params);
        expect(result.maxProfit).toBe(12500);
        expect(result.maxLoss).toBe(-1167500);
        expect(result.breakeven).toBe(23350);
    });
});

describe('Synthetic Strategies', () => {
    const spotPrices = [23400, 23500, 23600, 23700];

    test('syntheticLongStockPayoff calculates correctly', () => {
        const params = { strike: 23500, premium: 150, premium2: 145, lots, lotSize, spotPrices };
        const result = payoffFunctions.syntheticLongStockPayoff(params);
        expect(result.maxProfit).toBe("Unlimited");
        expect(result.maxLoss).toBe(-1175250);
        expect(result.breakeven).toBe(23505);
    });

    test('syntheticShortStockPayoff calculates correctly', () => {
        const params = { strike: 23500, premium: 150, premium2: 145, lots, lotSize, spotPrices };
        const result = payoffFunctions.syntheticShortStockPayoff(params);
        expect(result.maxProfit).toBe(1174750);
        expect(result.maxLoss).toBe("Unlimited");
        expect(result.breakeven).toBe(23505);
    });
});

describe('Volatility & Neutral Strategies', () => {
    const spotPrices = [23400, 23500, 23600, 23700];

    test('longStraddlePayoff calculates correctly', () => {
        const params = { strike: 23500, premium1: 150, premium2: 145, lots, lotSize, spotPrices };
        const result = payoffFunctions.longStraddlePayoff(params);
        expect(result.maxLoss).toBe(-14750);
        expect(result.breakeven).toEqual([23205, 23795]);
    });

    test('shortStraddlePayoff calculates correctly', () => {
        const params = { strike: 23500, premium1: 150, premium2: 145, lots, lotSize, spotPrices };
        const result = payoffFunctions.shortStraddlePayoff(params);
        expect(result.maxProfit).toBe(14750);
        expect(result.breakeven).toEqual([23205, 23795]);
    });

    test('longStranglePayoff calculates correctly', () => {
        const params = { strike1: 23400, premium1: 110, strike2: 23600, premium2: 100, lots, lotSize, spotPrices };
        const result = payoffFunctions.longStranglePayoff(params);
        expect(result.maxLoss).toBe(-10500);
        expect(result.breakeven).toEqual([23190, 23810]);
    });

    test('shortStranglePayoff calculates correctly', () => {
        const params = { strike1: 23400, premium1: 110, strike2: 23600, premium2: 100, lots, lotSize, spotPrices };
        const result = payoffFunctions.shortStranglePayoff(params);
        expect(result.maxProfit).toBe(10500);
        expect(result.breakeven).toEqual([23190, 23810]);
    });

    test('ironCondorPayoff calculates correctly', () => {
        const params = { strike1: 23300, strike2: 23400, strike3: 23600, strike4: 23700, netPremium: 30, lots, lotSize, spotPrices };
        const result = payoffFunctions.ironCondorPayoff(params);
        expect(result.maxProfit).toBe(1500);
        expect(result.maxLoss).toBe(-3500);
        expect(result.breakeven).toEqual([23370, 23630]);
    });

    test('ironButterflyPayoff calculates correctly', () => {
        const params = { strike1: 23400, strike2: 23500, strike3: 23600, netPremium: 70, lots, lotSize, spotPrices };
        const result = payoffFunctions.ironButterflyPayoff(params);
        expect(result.maxProfit).toBe(3500);
        expect(result.maxLoss).toBe(-1500);
        expect(result.breakeven).toEqual([23430, 23570]);
    });

    test('callButterflyPayoff calculates correctly', () => {
        const params = { strike1: 23400, strike2: 23500, strike3: 23600, netPremium: 20, lots, lotSize, spotPrices };
        const result = payoffFunctions.callButterflyPayoff(params);
        expect(result.maxProfit).toBe(4000);
        expect(result.maxLoss).toBe(-1000);
        expect(result.breakeven).toEqual([23420, 23580]);
    });

    test('calendarSpreadPayoff calculates correctly', () => {
        const params = { strike: 23500, premium1: 280, premium2: 150, lots, lotSize, spotPrices };
        const result = payoffFunctions.calendarSpreadPayoff(params);
        expect(result.maxLoss).toBe(-6500);
        expect(result.maxProfit).toBeDefined(); // Since it's variable, we just check that it exists
        expect(result.breakeven).toBe("Variable");
    });
});