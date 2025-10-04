// backend/server.js

const express = require('express');
const cors = require('cors');
// UPDATED: Import all the new functions
const payoffFunctions = require('./payoffFunctions');

const app = express();

app.use(cors());
app.use(express.json());

app.post('/calculate', (req, res) => {
    // UPDATED: Destructure all possible parameters from the request body
    const { strategy, strike, strike1, stockPrice } = req.body;

    // UPDATED: Create a more robust reference strike for the spot price range.
    const referenceStrike = strike || strike1 || stockPrice;

    if (!referenceStrike) {
        return res.status(400).json({ error: 'A valid strike or stock price is required.' });
    }
    
    const spotPrices = [];
    // Generate a range of spot prices from 15% below to 15% above the reference price
    for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) { // Increased granularity
        spotPrices.push(Math.round(s));
    }

    let result;
    // UPDATED: Added all new strategies to the switch statement
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
        // NEW: Cases for all added strategies
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
        default:
            return res.status(400).json({ error: 'Invalid strategy specified' });
    }

    res.json(result);
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});