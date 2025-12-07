# Lot Size Selection Documentation

## Overview
The Options Strategy Platform implements an **automatic lot size selection system** that retrieves and applies the correct lot size for each trading symbol. This document explains the implementation, architecture, and usage.

---

## What is Lot Size?

**Lot Size** is the standardized quantity of shares/contracts that must be traded as a single unit on an exchange.

### Examples:
- **NIFTY 50**: 1 lot = 50 contracts
- **BANKNIFTY**: 1 lot = 40 contracts
- **FINNIFTY**: 1 lot = 40 contracts
- **MIDCPNIFTY**: 1 lot = 75 contracts
- **Individual Stocks**: Typically 1 lot = 1 share (variable)

---

## Architecture & Implementation

### 1. **Data Flow**

```
Server Startup
    ↓
fetchLiveLotSizes()
    ↓
Fetch Fyers Master CSV from API
    ↓
Parse & Extract Lot Sizes
    ↓
Store in DYNAMIC_LOT_SIZES Cache
    ↓
Ready for Lookup
```

### 2. **Key Components**

#### **A. DYNAMIC_LOT_SIZES Object**
**Location:** `backend/server.js` (Line 30)

```javascript
const DYNAMIC_LOT_SIZES = {};  // Populated by fetchLiveLotSizes()
```

This JavaScript object stores lot sizes fetched from Fyers:
```javascript
{
    'NIFTY': 50,
    'BANKNIFTY': 40,
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75,
    'SENSEX': 10,
    'RELIANCE': 1,
    'TCS': 1,
    ...
}
```

#### **B. SYMBOL_LOT_SIZES Object**
**Location:** `backend/server.js` (Lines 25-37)

```javascript
const SYMBOL_LOT_SIZES = {
    'NIFTY': 50,
    'BANKNIFTY': 40,
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75,
    'SENSEX': 10,
};
```

This is a **fallback cache** with hardcoded default lot sizes. Used if API fetch fails.

---

## Function Implementations

### 3. **fetchLiveLotSizes() - Primary Fetcher**

**File:** `backend/server.js`  
**Lines:** 65-107

#### Purpose:
Fetches live lot sizes from Fyers Master CSV file on server startup.

#### Function Code:
```javascript
// --- LIVE LOT SIZE FETCHER ---
async function fetchLiveLotSizes() {
    console.log("📥 Fetching Live Lot Sizes from Fyers Master...");
    try {
        const response = await axios({
            method: 'get',
            url: 'https://public.fyers.in/sym_details/NSE_FO.csv',  // Fyers API URL
            responseType: 'stream'
        });

        const rl = readline.createInterface({
            input: response.data,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            const cols = line.split(',');
            if (cols.length > 13) {
                const symbolCode = cols[9];   // Extract symbol from column 9
                const lotSize = parseInt(cols[3]);  // Extract lot size from column 3

                if (symbolCode && !isNaN(lotSize)) {
                    let rootSymbol = "";
                    
                    // Identify root symbol
                    if (symbolCode.includes('NIFTY')) rootSymbol = 'NIFTY';
                    else if (symbolCode.includes('BANKNIFTY')) rootSymbol = 'BANKNIFTY';
                    else if (symbolCode.includes('FINNIFTY')) rootSymbol = 'FINNIFTY';
                    else if (symbolCode.includes('MIDCPNIFTY')) rootSymbol = 'MIDCPNIFTY';
                    else {
                        const match = symbolCode.match(/NSE:([A-Z]+)/);
                        if (match) rootSymbol = match[1];
                    }
                    
                    // Store in cache
                    if (rootSymbol && lotSize > 0) {
                        DYNAMIC_LOT_SIZES[rootSymbol] = lotSize;
                    }
                }
            }
        }
        
        // Manual addition for SENSEX (not in CSV)
        DYNAMIC_LOT_SIZES['SENSEX'] = 10;
        
        console.log(`✅ Live Lot Sizes Loaded for ${Object.keys(DYNAMIC_LOT_SIZES).length} symbols.`);
    } catch (error) {
        console.error("❌ Failed to fetch Live Lot Sizes:", error.message);
    }
}
```

#### Process:
1. Fetches CSV from Fyers public API
2. Parses each line (CSV format)
3. Extracts symbol code (column 9) and lot size (column 3)
4. Identifies root symbol (NIFTY, BANKNIFTY, etc.)
5. Stores in `DYNAMIC_LOT_SIZES` cache
6. Adds SENSEX manually (not in Fyers CSV)

---

### 4. **getLotSizeForSymbol() - Lookup Function**

**File:** `backend/server.js`  
**Lines:** 109-124

#### Purpose:
Retrieves the lot size for a given symbol with fallback logic.

#### Function Code:
```javascript
function getLotSizeForSymbol(symbol) {
    if (!symbol) return 1;  // Default if no symbol
    
    let key = symbol.toUpperCase();
    
    // Normalize symbol format
    if (key.includes('NSE:') && key.includes('-EQ')) 
        key = key.split(':')[1].replace('-EQ', '');
    if (key.includes('SENSEX')) key = 'SENSEX';
    if (key.includes('NIFTY') && !key.includes('BANK') && !key.includes('FIN') && !key.includes('MID')) 
        key = 'NIFTY';
    if (key.includes('BANKNIFTY')) key = 'BANKNIFTY';
    if (key.includes('FINNIFTY')) key = 'FINNIFTY';
    if (key.includes('MIDCPNIFTY')) key = 'MIDCPNIFTY';

    // Lookup with fallback
    if (DYNAMIC_LOT_SIZES[key]) return DYNAMIC_LOT_SIZES[key];
    if (SYMBOL_LOT_SIZES[key]) return SYMBOL_LOT_SIZES[key];

    return 1;  // Default fallback
}
```

#### Logic Flow:
1. Normalize symbol name (remove prefixes like 'NSE:', '-EQ')
2. Identify index futures (NIFTY, BANKNIFTY, etc.)
3. **Primary Lookup:** Check `DYNAMIC_LOT_SIZES` (fetched from API)
4. **Fallback Lookup:** Check `SYMBOL_LOT_SIZES` (hardcoded)
5. **Final Fallback:** Return 1 (default for individual stocks)

---

## Integration Points

### 5. **Where Lot Size is Used**

#### **A. During Server Initialization**
**File:** `backend/server.js` (Line 194)

```javascript
// On server startup
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    fetchLiveLotSizes();  // ← Loads lot sizes on startup
});
```

#### **B. When Creating Strategy Config**
**File:** `backend/server.js` (Line 365)

```javascript
const config = {
    symbol: userFriendlyKey,
    spot: spotPrice,
    daysToExpiry: daysLeft,
    vix: effectiveVix,
    signal: signalData,
    optionChain: structuredChain,
    lotSize: getLotSizeForSymbol(userFriendlyKey),  // ← Automatic assignment
    userFriendlyKey: userFriendlyKey
};
```

#### **C. When Calculating P&L**
**File:** `backend/smart_strategy.js` (Lines 202-216)

```javascript
function estimatePnl(candidate, lotSize) {
    const netPerContract = candidate.legs.reduce((sum, leg) => {
        const mult = (leg.role === 'SELL') ? 1 : -1;
        return sum + mult * leg.price;
    }, 0);
    
    const net = netPerContract * lotSize;  // ← Lot size applied to P&L
    
    // ... max loss calculation using lotSize ...
}
```

#### **D. When Executing Trades**
**File:** `backend/server.js` (Lines 506-507)

```javascript
if (!params.lotSize) {
    params.lotSize = getLotSizeForSymbol(symbol);  // ← Auto-assign if missing
}
```

---

## Key Features

### 6. **Automatic Lot Size Selection**

| Feature | Implementation |
|---------|-----------------|
| **Fetching** | Called once on server startup via `fetchLiveLotSizes()` |
| **Caching** | Stored in `DYNAMIC_LOT_SIZES` object (in-memory cache) |
| **Lookup** | `getLotSizeForSymbol()` retrieves on-demand |
| **Fallback** | Uses hardcoded `SYMBOL_LOT_SIZES` if API fails |
| **Normalization** | Handles multiple symbol formats (NSE:, -EQ, etc.) |
| **Default** | Returns 1 if symbol not found |

### 7. **Why This Approach?**

#### **Pros:**
✅ **Performance:** Lot sizes cached once, not fetched repeatedly  
✅ **Reliability:** Fallback hardcoded values if API fails  
✅ **Scalability:** In-memory lookup is O(1) complexity  
✅ **Flexibility:** Supports multiple symbol formats  
✅ **Accuracy:** Uses live Fyers data + manual updates  

#### **Cons:**
❌ **Stale Data:** Lot sizes don't update during runtime (restart needed)  
❌ **Single Point:** API failure relies on fallback values  

---

## Comparison: Strike Price vs Lot Size Retrieval

### **Strike Price & Premium**
- **Retrieved:** On every API request (real-time)
- **Source:** Fyers option chain API
- **Frequency:** Changes every second
- **Method:** `fetchMarketDataForSelector()` → Live API call
- **Why:** Prices fluctuate constantly

**File:** `backend/server.js` (Lines 340-358)
```javascript
const chainRes = await fyers.getOptionChain({...});  // Real-time call
const opt.strike_price = ...;  // Live data
const opt.ltp = ...;  // Live premium
```

### **Lot Size**
- **Retrieved:** Once on server startup
- **Source:** Fyers Master CSV (static data)
- **Frequency:** Never changes (exchange regulation)
- **Method:** `fetchLiveLotSizes()` → Cached lookup
- **Why:** Lot size is fixed per symbol

**File:** `backend/server.js` (Lines 65-107)
```javascript
const DYNAMIC_LOT_SIZES = {};  // Cached once
DYNAMIC_LOT_SIZES[rootSymbol] = lotSize;  // Stored
return DYNAMIC_LOT_SIZES[key];  // Lookup
```

---

## Configuration & Customization

### 8. **Modifying Lot Sizes**

#### **Option 1: Update Hardcoded Defaults**
**File:** `backend/server.js` (Lines 25-37)

```javascript
const SYMBOL_LOT_SIZES = {
    'NIFTY': 50,           // ← Modify here
    'BANKNIFTY': 40,       // ← Modify here
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75,
    'SENSEX': 10,
};
```

#### **Option 2: Add Custom Symbol**
```javascript
// In getLotSizeForSymbol()
if (key === 'MYSTOCK') return 25;  // Add custom lot size
```

#### **Option 3: Override at Runtime**
```javascript
// Before calling strategy functions
config.lotSize = 100;  // Override automatic selection
```

---

## Testing & Verification

### 9. **How to Verify Lot Size Selection**

#### **1. Check Console Output**
```
Server running on port 5000
📥 Fetching Live Lot Sizes from Fyers Master...
✅ Live Lot Sizes Loaded for 150 symbols.
```

#### **2. Test API Endpoint**
```bash
curl http://localhost:5000/api/live-data-with-greeks/NIFTY

Response:
{
    "symbol": "NIFTY",
    "spot": 23500,
    "vix": 16.5,
    "lotSize": 50,  // ← Automatic lot size
    "options": [...]
}
```

#### **3. Verify in Strategy Creation**
```javascript
const strategy = createStrategy({
    symbol: 'BANKNIFTY',
    optionChain: data
});

// Lot size should be auto-assigned (40)
console.log(strategy.config.lotSize);  // Output: 40
```

---

## Troubleshooting

### 10. **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| Lot size returns 1 | Symbol not recognized | Add to `SYMBOL_LOT_SIZES` or fetch from API |
| API fetch fails | Fyers endpoint down | Falls back to `SYMBOL_LOT_SIZES` hardcoded values |
| Incorrect lot size | Wrong symbol format | Check symbol normalization in `getLotSizeForSymbol()` |
| Lot size not updating | Cached at startup | Restart server to refresh cache |

### 11. **Debug Mode**

Add logging to track lot size selection:

```javascript
function getLotSizeForSymbol(symbol) {
    if (!symbol) return 1;
    let key = symbol.toUpperCase();
    
    console.log(`[LOT SIZE] Looking up: ${symbol} → Normalized: ${key}`);
    
    if (DYNAMIC_LOT_SIZES[key]) {
        console.log(`[LOT SIZE] Found in DYNAMIC: ${DYNAMIC_LOT_SIZES[key]}`);
        return DYNAMIC_LOT_SIZES[key];
    }
    if (SYMBOL_LOT_SIZES[key]) {
        console.log(`[LOT SIZE] Found in FALLBACK: ${SYMBOL_LOT_SIZES[key]}`);
        return SYMBOL_LOT_SIZES[key];
    }
    
    console.log(`[LOT SIZE] Using default: 1`);
    return 1;
}
```

---

## Summary

The **automatic lot size selection system** provides:

✅ **Real-time fetching** from Fyers Master on startup  
✅ **Intelligent caching** for performance  
✅ **Fallback mechanism** for reliability  
✅ **Symbol normalization** for flexibility  
✅ **Integration** with strategy creation and P&L calculation  

**Key Files:**
- `backend/server.js` - Fetching and lookup functions
- `backend/smart_strategy.js` - P&L calculation with lot size

**Key Functions:**
- `fetchLiveLotSizes()` - Fetches and caches lot sizes
- `getLotSizeForSymbol()` - Retrieves lot size for any symbol

**Entry Point:** Server startup (Line 194) → `fetchLiveLotSizes()`

---

*Last Updated: December 6, 2025*  
*Options Strategy Platform - Lot Size Documentation*
