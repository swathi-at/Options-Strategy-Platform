const express = require('express');
const cors = require('cors');
const payoffFunctions = require('./payoffFunctions');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/calculate', (req, res) => {
    // Note: The referenceStrike logic handles finding a central price for graph generation,
    // prioritizing single strike (strike), then a spread strike (strike2/strike1), then stockPrice.
    const { strategy, strike, strike1, strike2, stockPrice } = req.body;

    const referenceStrike = strike || strike2 || strike1 || stockPrice;

    if (!referenceStrike) {
        return res.status(400).json({ error: 'A valid strike or stock price is required.' });
    }
    
    // Generate spot prices for the payoff curve (15% below to 15% above the reference price)
    const spotPrices = [];
    for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) {
        // Ensure integer spots for cleaner graph labels, you might use s += 0.5 for finer resolution
        spotPrices.push(Math.round(s)); 
    }

    let result;
    switch (strategy) {
        case 'long-call':
            result = payoffFunctions.longCallPayoff(req.body.strike, req.body.premium, req.body.lots, req.body.lotSize, spotPrices);
            break;
        case 'long-put':
            result = payoffFunctions.longPutPayoff(req.body.strike, req.body.premium, req.body.lots, req.body.lotSize, spotPrices);
            break;
        case 'short-call':
            result = payoffFunctions.shortCallPayoff(req.body.strike, req.body.premium, req.body.lots, req.body.lotSize, spotPrices);
            break;
        case 'short-put':
            result = payoffFunctions.shortPutPayoff(req.body.strike, req.body.premium, req.body.lots, req.body.lotSize, spotPrices);
            break;
        case 'bull-call-spread':
            result = payoffFunctions.bullCallSpreadPayoff({ ...req.body, spotPrices });
            break;
        case 'bull-put-spread':
            result = payoffFunctions.bullPutSpreadPayoff({ ...req.body, spotPrices });
            break;
        case 'bear-call-spread':
            result = payoffFunctions.bearCallSpreadPayoff({ ...req.body, spotPrices });
            break;
        case 'bear-put-spread':
            result = payoffFunctions.bearPutSpreadPayoff({ ...req.body, spotPrices });
            break;
        case 'synthetic-long-stock':
            result = payoffFunctions.syntheticLongStockPayoff({ ...req.body, spotPrices });
            break;
        case 'synthetic-short-stock':
            result = payoffFunctions.syntheticShortStockPayoff({ ...req.body, spotPrices });
            break;
        case 'protective-put':
            result = payoffFunctions.protectivePutPayoff({ ...req.body, spotPrices });
            break;
        case 'protective-call':
            result = payoffFunctions.protectiveCallPayoff({ ...req.body, spotPrices });
            break;
        case 'long-straddle':
            result = payoffFunctions.longStraddlePayoff({ ...req.body, spotPrices });
            break;
        // --- NEW STRATEGIES ADDED ---
        case 'short-straddle': // FIX: Added the missing case
            result = payoffFunctions.shortStraddlePayoff({ ...req.body, spotPrices });
            break;
        case 'long-strangle':
            result = payoffFunctions.longStranglePayoff({ ...req.body, spotPrices });
            break;
        case 'short-strangle': // FIX: Added the missing case
            result = payoffFunctions.shortStranglePayoff({ ...req.body, spotPrices });
            break;
        // --- END NEW STRATEGIES ---
        case 'iron-condor':
            result = payoffFunctions.ironCondorPayoff({ ...req.body, spotPrices });
            break;
        case 'iron-butterfly':
            result = payoffFunctions.ironButterflyPayoff({ ...req.body, spotPrices });
            break;
        case 'call-butterfly':
            result = payoffFunctions.callButterflyPayoff({ ...req.body, spotPrices });
            break;
        case 'calendar-spread':
            result = payoffFunctions.calendarSpreadPayoff({ ...req.body, spotPrices });
            break;
        default:
            return res.status(400).json({ error: 'Invalid strategy specified' });
    }

    // For breakeven points that have two values (which are returned as an array), 
    // format them into a single string for cleaner frontend display (e.g., "103 & 97")
    if (Array.isArray(result.breakeven)) {
        // Ensure values are rounded to 2 decimal places before joining, if they aren't already
        const formattedBreakeven = result.breakeven.map(be => 
            (typeof be === 'number') ? be.toFixed(2) : be
        );
        result.breakeven = `${formattedBreakeven[0]} & ${formattedBreakeven[1]}`;
    }

    res.json(result);
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
