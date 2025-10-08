// backend/server.js
const express = require('express');
const cors = require('cors');
const payoffFunctions = require('./payoffFunctions');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/calculate', (req, res) => {
    const { strategy, strike, strike1, strike2, stockPrice } = req.body;

    const referenceStrike = strike || strike2 || strike1 || stockPrice;

    if (!referenceStrike) {
        return res.status(400).json({ error: 'A valid strike or stock price is required.' });
    }
    
    const spotPrices = [];
    for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) {
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
        case 'long-strangle':
            result = payoffFunctions.longStranglePayoff({ ...req.body, spotPrices });
            break;
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

    // For breakeven points that have two values, format them for display
    if (Array.isArray(result.breakeven)) {
        result.breakeven = `${result.breakeven[0]} & ${result.breakeven[1]}`;
    }

    res.json(result);
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});