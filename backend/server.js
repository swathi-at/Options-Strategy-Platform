// In your backend/server.js

const express = require('express');
const cors = require('cors');
// --- NEW: Import the engine ---
const { calculateStrategy } = require('./strategyengine'); 

const app = express();
app.use(cors());
app.use(express.json());

app.post('/calculate', (req, res) => {
    try {
        const { strategy, strike, strike1, strike2, strike3, stockPrice } = req.body;
        const referenceStrike = strike || strike2 || strike1 || strike3 || stockPrice;

        if (!referenceStrike) {
            return res.status(400).json({ error: 'A valid strike or stock price is required.' });
        }

        const spotPrices = [];
        for (let s = referenceStrike * 0.85; s <= referenceStrike * 1.15; s += 1) {
            spotPrices.push(Math.round(s));
        }

        const params = { ...req.body, spotPrices };

        // --- NEW: Use the engine to perform the calculation ---
        const result = calculateStrategy(strategy, params);
        
        // Format breakeven points for display
        if (Array.isArray(result.breakeven)) {
            const formattedBreakeven = result.breakeven.map(be =>
                (typeof be === 'number') ? be.toFixed(2) : be
            );
            result.breakeven = `${formattedBreakeven[0]} & ${formattedBreakeven[1]}`;
        } else if (typeof result.breakeven === 'number') {
            result.breakeven = result.breakeven.toFixed(2);
        }

        res.json(result);

    } catch (error) {
        console.error("Error in /calculate route:", error);
        res.status(400).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
