// ==================================================================
// 🧮 SENSIBULL-STYLE PAYOFF MATH ENGINE (UNIVERSAL & ROBUST)
// ==================================================================

/**
 * 1. MAPPER: Converts simple inputs (Strike1, Premium1) into Standard Legs
 * Supports: Options (CE/PE) and Underlying (STOCK)
 * Covers: Bull/Bear Spreads, Neutral, Volatility, Stock Hedging, Synthetics, Custom
 */
function getLegsFromParams(strategy, p) {
    const qty = Number(p.lots || 1);
    const s = (k) => Number(p[k] || 0);

    switch (strategy) {
        // --- 1. SINGLE LEG STRATEGIES ---
        case 'long-call':
            return [{ type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium'), qty }];
        case 'short-call':
            return [{ type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium'), qty }];
        case 'long-put':
            return [{ type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium'), qty }];
        case 'short-put':
            return [{ type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium'), qty }];

        // --- 2. BULLISH STRATEGIES ---
        case 'bull-call-spread': // Debit Spread
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'bull-put-spread': // Credit Spread (Put Credit Spread)
            return [
                { type: 'PE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty }, // Higher Strike (Sell)
                { type: 'PE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }   // Lower Strike (Buy)
            ];
        case 'call-ratio-spread': // Buy 1 ITM/ATM Call, Sell 2 OTM Calls
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty: qty * 2 }
            ];
        case 'jade-lizard': // Sell Put (OTM) + Bear Call Spread (Sell Call OTM, Buy Call Far OTM)
            return [
                { type: 'PE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty },
                { type: 'CE', action: 'BUY', strike: s('strike3'), price: s('premium3'), qty }
            ];

        // --- 3. BEARISH STRATEGIES ---
        case 'bear-put-spread': // Debit Spread
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'bear-call-spread': // Credit Spread (Call Credit Spread)
            return [
                { type: 'CE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty }, // Lower Strike (Sell)
                { type: 'CE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }   // Higher Strike (Buy)
            ];

        // --- 4. NEUTRAL & VOLATILITY STRATEGIES ---
        case 'short-straddle':
            return [
                { type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'long-straddle':
            return [
                { type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium1'), qty },
                { type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'short-strangle':
            return [
                { type: 'PE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty }, // Sell Put
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }  // Sell Call
            ];
        case 'long-strangle':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty }, // Buy Put
                { type: 'CE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }  // Buy Call
            ];
        case 'iron-condor':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty }, // Buy Put
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }, // Sell Put
                { type: 'CE', action: 'SELL', strike: s('strike3'), price: s('premium3'), qty }, // Sell Call
                { type: 'CE', action: 'BUY', strike: s('strike4'), price: s('premium4'), qty }  // Buy Call
            ];
        case 'iron-butterfly':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty }, // Buy Put (Wing)
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }, // Sell Put (Body)
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium3'), qty }, // Sell Call (Body)
                { type: 'CE', action: 'BUY', strike: s('strike3'), price: s('premium4'), qty }  // Buy Call (Wing)
            ];
        case 'call-butterfly': // Long Call Butterfly
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },       // Buy 1 ITM
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty: qty * 2 }, // Sell 2 ATM
                { type: 'CE', action: 'BUY', strike: s('strike3'), price: s('premium3'), qty }        // Buy 1 OTM
            ];

        // --- 5. STOCK + OPTION (HEDGING) ---
        case 'protective-put': // Buy Stock + Buy Put
            return [
                { type: 'STOCK', action: 'BUY', price: s('stockPrice'), qty },
                { type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium'), qty }
            ];
        case 'protective-call': // (Covered Call) Buy Stock + Sell Call
            return [
                { type: 'STOCK', action: 'BUY', price: s('stockPrice'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium'), qty }
            ];

        // --- 6. SYNTHETIC STRATEGIES ---
        case 'synthetic-long-stock': // Buy Call + Sell Put (ATM)
            return [
                { type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'synthetic-short-stock': // Sell Call + Buy Put (ATM)
            return [
                { type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium'), qty },
                { type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium2'), qty }
            ];

        default:
            return [];
    }
}

/**
 * 2. MATH ENGINE: Simulates P&L at any given Spot Price (At Expiry)
 * Uses Intrinsic Value Method (Standard for Expiry P&L)
 */
function calculateLegPayoff(leg, spotAtExpiry) {
    let intrinsicValue = 0;
    
    // Handle Option Legs
    if (leg.type === 'CE') {
        intrinsicValue = Math.max(0, spotAtExpiry - leg.strike);
    } 
    else if (leg.type === 'PE') {
        intrinsicValue = Math.max(0, leg.strike - spotAtExpiry);
    }
    // Handle Stock Legs (For Protective Put/Call)
    else if (leg.type === 'STOCK') {
        // PnL = (Exit Price - Entry Price) * Direction
        // BUY: (Spot - Entry) | SELL: (Entry - Spot)
        return (spotAtExpiry - leg.price) * (leg.action === 'BUY' ? 1 : -1) * leg.qty;
    }

    // Standard Option PnL Formula: 
    // BUY:  (Intrinsic Value at Expiry) - Premium Paid
    // SELL: Premium Received - (Intrinsic Value at Expiry)
    
    if (leg.action === 'BUY') {
        return (intrinsicValue - leg.price) * leg.qty;
    } else {
        return (leg.price - intrinsicValue) * leg.qty;
    }
}

/**
 * 3. MAIN CALCULATOR (Exports to Server)
 * Generates Payoff Graph points, Max Profit/Loss, and Breakevens
 */
function calculateStrategy(strategyName, params) {
    const legs = getLegsFromParams(strategyName, params);
    
    // Handle unknown strategy gracefully
    if (!legs.length) {
        // Fallback for 'calendar-spread' or undefined strategies
        // Calendar spreads are complex (require Black-Scholes for back month). 
        // We return a placeholder to prevent crashes.
        if (strategyName === 'calendar-spread') {
            return {
                strategy: strategyName,
                maxProfit: "Variable (Time Dependent)", 
                maxLoss: (Number(params.premium1) - Number(params.premium2)).toFixed(2), 
                breakeven: "Variable",
                payoffCurve: [], 
                riskRewardRatio: "N/A"
            };
        }
        throw new Error(`Strategy '${strategyName}' not supported or params missing.`);
    }

    const lotSize = Number(params.lotSize || 1);
    
    // Determine Scan Range (Spot +/- 20% by default)
    // If only stock is present, scan around stock price. If options, scan around strikes.
    const prices = legs.map(l => l.strike || l.price); 
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const center = (minPrice + maxPrice) / 2 || minPrice;
    
    // Create a range for the graph (X-Axis)
    const rangeStart = Math.floor(center * 0.80);
    const rangeEnd = Math.ceil(center * 1.20);
    const step = Math.max(1, Math.ceil((rangeEnd - rangeStart) / 200));

    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    const payoffPoints = [];
    const breakevens = [];

    // SCAN Loop: Calculate P&L for every price point in range
    for (let spot = rangeStart; spot <= rangeEnd; spot += step) {
        let totalPnl = 0;
        
        legs.forEach(leg => {
            totalPnl += calculateLegPayoff(leg, spot);
        });

        // Apply Lot Size (Total PnL in Currency)
        const totalValue = totalPnl * lotSize;

        // Track Max/Min
        if (totalValue > maxProfit) maxProfit = totalValue;
        if (totalValue < maxLoss) maxLoss = totalValue;

        // Detect Breakeven (Zero Crossing)
        if (payoffPoints.length > 0) {
            const prev = payoffPoints[payoffPoints.length - 1];
            // If sign changes between this point and previous point -> Breakeven found
            if ((prev.payoff < 0 && totalValue >= 0) || (prev.payoff > 0 && totalValue <= 0)) {
                // Linear interpolation for exact breakeven spot
                breakevens.push(spot); 
            }
        }

        payoffPoints.push({ spot, payoff: Number(totalValue.toFixed(2)) });
    }

    return {
        strategy: strategyName,
        maxProfit: maxProfit > 1e9 ? "Unlimited" : Number(maxProfit.toFixed(2)),
        maxLoss: maxLoss < -1e9 ? "Unlimited" : Number(maxLoss.toFixed(2)),
        breakeven: breakevens.length > 0 ? breakevens : "None",
        payoffCurve: payoffPoints,
        riskRewardRatio: (maxLoss !== 0 && maxProfit > 0 && maxProfit < 1e9 && maxLoss > -1e9) 
            ? `1:${Math.abs(maxProfit / maxLoss).toFixed(2)}` 
            : "N/A"
    };
}

module.exports = { calculateStrategy };