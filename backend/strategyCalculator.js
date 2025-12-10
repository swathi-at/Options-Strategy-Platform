// ==================================================================
// 🧮 SENSIBULL-STYLE PAYOFF MATH ENGINE (UNIVERSAL & ROBUST)
// ==================================================================

/**
 * 1. MAPPER: Converts simple inputs (Strike1, Premium1) into Standard Legs
 * Supports: Options (CE/PE) and Underlying (STOCK)
 */
function getLegsFromParams(strategy, p) {
    const qty = Number(p.lots || 1);
    const s = (k) => Number(p[k] || 0);

    switch (strategy) {
        // --- SINGLE LEG STRATEGIES ---
        case 'long-call':
            return [{ type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium'), qty }];
        case 'short-call':
            return [{ type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium'), qty }];
        case 'long-put':
            return [{ type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium'), qty }];
        case 'short-put':
            return [{ type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium'), qty }];

        // --- BULLISH SPREADS ---
        case 'bull-call-spread':
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'bull-put-spread': 
            return [
                { type: 'PE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'PE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'call-ratio-spread': 
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty: qty * 2 }
            ];

        // --- BEARISH SPREADS ---
        case 'bear-put-spread':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'bear-call-spread': 
            return [
                { type: 'CE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }
            ];

        // --- NEUTRAL STRATEGIES ---
        case 'short-straddle':
            return [
                { type: 'CE', action: 'SELL', strike: s('strike'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'short-strangle':
            return [
                { type: 'PE', action: 'SELL', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'long-straddle':
            return [
                { type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium1'), qty },
                { type: 'PE', action: 'BUY', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'long-strangle':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'BUY', strike: s('strike2'), price: s('premium2'), qty }
            ];
        case 'iron-condor':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike3'), price: s('premium3'), qty },
                { type: 'CE', action: 'BUY', strike: s('strike4'), price: s('premium4'), qty }
            ];
        case 'iron-butterfly':
            return [
                { type: 'PE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium3'), qty },
                { type: 'CE', action: 'BUY', strike: s('strike3'), price: s('premium4'), qty }
            ];
        case 'call-butterfly':
            return [
                { type: 'CE', action: 'BUY', strike: s('strike1'), price: s('premium1'), qty },
                { type: 'CE', action: 'SELL', strike: s('strike2'), price: s('premium2'), qty: qty * 2 },
                { type: 'CE', action: 'BUY', strike: s('strike3'), price: s('premium3'), qty }
            ];

        // --- STOCK + OPTION STRATEGIES ---
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

        // --- SYNTHETIC STRATEGIES ---
        case 'synthetic-long-stock': // Buy Call + Sell Put
            return [
                { type: 'CE', action: 'BUY', strike: s('strike'), price: s('premium'), qty },
                { type: 'PE', action: 'SELL', strike: s('strike'), price: s('premium2'), qty }
            ];
        case 'synthetic-short-stock': // Sell Call + Buy Put
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
        // For stock: PnL = (Exit - Entry)
        // We structure it same as options: (Price - Intrinsic) * Sign is inverted logic
        // Easier: Direct PnL calculation for Stock
        return (spotAtExpiry - leg.price) * (leg.action === 'BUY' ? 1 : -1) * leg.qty;
    }

    // Standard Option PnL Formula: (Entry Price - Exit Value)
    // For Buy:  (0 - Premium) + Intrinsic -> Value is Intrinsic
    // PnL = (Value at Expiry - Cost)
    
    // BUY:  PnL = Intrinsic - Premium
    // SELL: PnL = Premium - Intrinsic
    
    if (leg.action === 'BUY') {
        return (intrinsicValue - leg.price) * leg.qty;
    } else {
        return (leg.price - intrinsicValue) * leg.qty;
    }
}

/**
 * 3. MAIN CALCULATOR (Exports to Server)
 */
function calculateStrategy(strategyName, params) {
    const legs = getLegsFromParams(strategyName, params);
    
    // Handle unknown strategy gracefully
    if (!legs.length) {
        // Fallback for 'calendar-spread' which is hard to model perfectly in simple engine
        if (strategyName === 'calendar-spread') {
            return {
                strategy: strategyName,
                maxProfit: "Variable", maxLoss: params.premium1 - params.premium2, breakeven: "Variable",
                payoffCurve: [], riskRewardRatio: "N/A"
            };
        }
        throw new Error(`Strategy '${strategyName}' not supported or params missing.`);
    }

    const lotSize = Number(params.lotSize || 1);
    
    // Determine Scan Range (Spot +/- 20%)
    // Handle case where there are no strikes (only stock), use stock price
    const prices = legs.map(l => l.strike || l.price); 
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const center = (minPrice + maxPrice) / 2 || minPrice;
    
    const rangeStart = Math.floor(center * 0.85);
    const rangeEnd = Math.ceil(center * 1.15);
    const step = Math.ceil((rangeEnd - rangeStart) / 200);

    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    const payoffPoints = [];
    const breakevens = [];

    // SCAN Loop
    for (let spot = rangeStart; spot <= rangeEnd; spot += step) {
        let totalPnl = 0;
        
        legs.forEach(leg => {
            totalPnl += calculateLegPayoff(leg, spot);
        });

        // Apply Lot Size
        const totalValue = totalPnl * lotSize;

        // Track Max/Min
        if (totalValue > maxProfit) maxProfit = totalValue;
        if (totalValue < maxLoss) maxLoss = totalValue;

        // Detect Breakeven (Zero Crossing)
        if (payoffPoints.length > 0) {
            const prev = payoffPoints[payoffPoints.length - 1];
            if ((prev.payoff < 0 && totalValue >= 0) || (prev.payoff > 0 && totalValue <= 0)) {
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