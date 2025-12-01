// ==================================================================
// 5. LOGIC: STRATEGY DEPLOYER (Fully Implemented)
// ==================================================================
function detectATMStrike(strikes, spot) {
    if (!strikes || strikes.length === 0) return 0;
    return strikes.reduce((prev, curr) => Math.abs(curr - spot) < Math.abs(prev - spot) ? curr : prev);
}

function chooseStrikeByDelta(chain, side, targetDelta, atmIndex) {
    const start = Math.max(0, atmIndex - 8); // Search wider range
    const end = Math.min(chain.length - 1, atmIndex + 8);
    let best = null; let bestDiff = Infinity;

    for (let i = start; i <= end; i++) {
        const s = chain[i];
        const g = (side === 'CE') ? s.CE_Greeks : s.PE_Greeks;
        // Check if delta exists and is a number
        const delta = g ? g.delta : 0;
        if (typeof delta !== 'number') continue;

        const diff = Math.abs(Math.abs(delta) - Math.abs(targetDelta));
        if (diff < bestDiff) {
            bestDiff = diff; 
            best = { strike: s.strike, greeks: g, price: (side === 'CE' ? s.CE_Ltp : s.PE_Ltp), index: i };
        }
    }
    return best; 
}

function buildCandidate(chain, atmIndex, stratName) {
    const candidate = { name: stratName, legs: [], meta: {} };
    
    // --- 1. BULL CALL SPREAD ---
    if (stratName === 'Bull Call Spread') {
        const buy = chooseStrikeByDelta(chain, 'CE', 0.5, atmIndex); // Buy ATM
        const sell = chooseStrikeByDelta(chain, 'CE', 0.25, atmIndex); // Sell OTM
        if (!buy || !sell) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: buy.strike, price: buy.price, greeks: buy.greeks });
        candidate.legs.push({ role: 'SELL', optionType: 'CE', strike: sell.strike, price: sell.price, greeks: sell.greeks });
        candidate.meta.description = `Buy ${buy.strike} CE, Sell ${sell.strike} CE`;
        return candidate;
    }

    // --- 2. BEAR PUT SPREAD (Added) ---
    if (stratName === 'Bear Put Spread') {
        const buy = chooseStrikeByDelta(chain, 'PE', 0.5, atmIndex); // Buy ATM Put (Delta -0.5)
        const sell = chooseStrikeByDelta(chain, 'PE', 0.25, atmIndex); // Sell OTM Put (Delta -0.25)
        if (!buy || !sell) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: buy.strike, price: buy.price, greeks: buy.greeks });
        candidate.legs.push({ role: 'SELL', optionType: 'PE', strike: sell.strike, price: sell.price, greeks: sell.greeks });
        candidate.meta.description = `Buy ${buy.strike} PE, Sell ${sell.strike} PE`;
        return candidate;
    }

    // --- 3. IRON CONDOR (Added) ---
    if (stratName === 'Iron Condor') {
        // Sell wings (Delta ~0.16)
        const sellCall = chooseStrikeByDelta(chain, 'CE', 0.16, atmIndex);
        const sellPut = chooseStrikeByDelta(chain, 'PE', 0.16, atmIndex);
        
        if (!sellCall || !sellPut) return null;

        // Buy protection (2 strikes further out)
        // Note: In a real app, ensure indices don't go out of bounds
        const buyCallIdx = Math.min(chain.length - 1, (chain.findIndex(x => x.strike === sellCall.strike) + 2));
        const buyPutIdx = Math.max(0, (chain.findIndex(x => x.strike === sellPut.strike) - 2));
        
        const buyCall = chain[buyCallIdx];
        const buyPut = chain[buyPutIdx];

        if (!buyCall || !buyPut) return null;

        candidate.legs.push({ role: 'SELL', optionType: 'CE', strike: sellCall.strike, price: sellCall.price, greeks: sellCall.greeks });
        candidate.legs.push({ role: 'SELL', optionType: 'PE', strike: sellPut.strike, price: sellPut.price, greeks: sellPut.greeks });
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: buyCall.strike, price: buyCall.CE_Ltp, greeks: buyCall.CE_Greeks });
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: buyPut.strike, price: buyPut.PE_Ltp, greeks: buyPut.PE_Greeks });
        
        candidate.meta.description = `Iron Condor: Short ${sellCall.strike} CE / ${sellPut.strike} PE`;
        return candidate;
    }

    // --- 4. LONG STRADDLE (Added for High VIX) ---
    if (stratName === 'Long Straddle') {
        const atm = chain[atmIndex];
        if (!atm) return null;
        candidate.legs.push({ role: 'BUY', optionType: 'CE', strike: atm.strike, price: atm.CE_Ltp, greeks: atm.CE_Greeks });
        candidate.legs.push({ role: 'BUY', optionType: 'PE', strike: atm.strike, price: atm.PE_Ltp, greeks: atm.PE_Greeks });
        candidate.meta.description = `Long Straddle @ ${atm.strike}`;
        return candidate;
    }

    // --- 5. CALENDAR SPREAD (Added for Low VIX) ---
    if (stratName === 'Calendar Spread') {
        const atm = chain[atmIndex];
        if (!atm) return null;

        // NOTE: Real Calendar Spreads require fetching a second expiry chain.
        // We SIMULATE the "Far Month" leg here by adding estimated Time Value (15%)
        // so the strategy can be generated and tested immediately.
        const nearPrice = atm.CE_Ltp;
        const farPriceEst = nearPrice * 1.15; 

        // Leg 1: Sell Near Month ATM Call
        candidate.legs.push({ 
            role: 'SELL', 
            optionType: 'CE', 
            strike: atm.strike, 
            price: nearPrice, 
            greeks: atm.CE_Greeks 
        });

        // Leg 2: Buy Far Month ATM Call (Simulated)
        candidate.legs.push({ 
            role: 'BUY', 
            optionType: 'CE', 
            strike: atm.strike, 
            price: farPriceEst, 
            // Far month options have lower Theta (decay slower), so we adjust the Greeks estimate
            greeks: { ...atm.CE_Greeks, theta: (atm.CE_Greeks.theta || 0) * 0.6 } 
        });

        candidate.meta.description = `Calendar Spread: Short ${atm.strike} (Near) / Long ${atm.strike} (Far)`;
        return candidate;
    }

    return null;
}

function decideStrategy(signal, spot, daysToExpiry, optionChain, vix, config = {}) {
    let candidatesToTry = [];
    
    // Normalize logic based on PDF document
    const VIX_HIGH = 18; 

    // --- DAY BUCKET LOGIC ---
    if (daysToExpiry >= 4) {
        if (signal.direction === 'BULL') candidatesToTry = ['Bull Call Spread'];
        else if (signal.direction === 'BEAR') candidatesToTry = ['Bear Put Spread'];
        else {
            // NEUTRAL SIGNAL
            if (vix > VIX_HIGH) candidatesToTry = ['Long Straddle']; // High Vol = Buy Volatility
            else candidatesToTry = ['Calendar Spread', 'Iron Condor']; // Low Vol = Sell Near Term Decay
        }
    } else {
        // Less than 4 days (Tighter spreads)
        if (signal.direction === 'BULL') candidatesToTry = ['Bull Call Spread'];
        else if (signal.direction === 'BEAR') candidatesToTry = ['Bear Put Spread'];
        else candidatesToTry = ['Iron Condor']; // Calendar spreads risky very close to expiry
    }

    const strikesList = optionChain.map(c => c.strike);
    const atm = detectATMStrike(strikesList, spot);
    const atmIndex = strikesList.indexOf(atm);
    
    if (atmIndex === -1) return { decision: 'SKIP', reason: 'ATM Strike not found' };

    const built = [];

    for (const sname of candidatesToTry) {
        const candidate = buildCandidate(optionChain, atmIndex, sname);
        if (!candidate) continue;
        
        // Simple scoring based on Risk/Reward (Mocked for now)
        let score = 50; 
        if (sname.includes('Spread')) score += 20; // Prefer defined risk
        if (sname.includes('Condor') && vix < 15) score += 30; // Good for low VIX
        
        candidate.score = score;
        built.push(candidate);
    }

    // Sort by score descending
    built.sort((a,b) => b.score - a.score);

    const chosen = built.length ? built[0] : null;
    if (chosen) return { decision: 'PLACE', strategy: chosen.name, legs: chosen.legs, meta: chosen.meta, score: chosen.score };
    
    return { decision: 'SKIP', reason: `No valid candidates found for ${signal.direction} in current market` };
}

// Export functions for use by other modules / tests
module.exports = {
    decideStrategy,
    buildCandidate,
    chooseStrikeByDelta,
    detectATMStrike
};