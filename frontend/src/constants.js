// --- List of All Symbols for Frontend Dropdown ---
// Note: Only the top 4 are "tradable" with options.
// The rest are for data analysis (Spot Price).
const SYMBOL_LIST = {
    "Tradable Indices": [
        { name: "NIFTY 50", symbol: "NIFTY" },
        { name: "NIFTY BANK", symbol: "BANKNIFTY" },
        { name: "NIFTY FIN SERVICE", symbol: "FINNIFTY" },
        { name: "NIFTY MIDCAP SELECT", symbol: "MIDCPNIFTY" }
    ],
    "Sectoral Indices (NSE)": [
        { name: "NIFTY AUTO", symbol: "NSE:NIFTYAUTO-INDEX" },
        { name: "NIFTY IT", symbol: "NSE:NIFTYIT-INDEX" },
        { name: "NIFTY FMCG", symbol: "NSE:NIFTYFMCG-INDEX" },
        { name: "NIFTY METAL", symbol: "NSE:NIFTYMETAL-INDEX" },
        { name: "NIFTY PHARMA", symbol: "NSE:NIFTYPHARMA-INDEX" },
        { name: "NIFTY REALTY", symbol: "NSE:NIFTYREALTY-INDEX" },
        { name: "NIFTY CONSUMER DURABLES", symbol: "NSE:NIFTYCONSUMERDURABLES-INDEX" },
        { name: "NIFTY HEALTHCARE", symbol: "NSE:NIFTYHEALTHCARE-INDEX" },
        { name: "NIFTY MEDIA", symbol: "NSE:NIFTYMEDIA-INDEX" },
        { name: "NIFTY PRIVATE BANK", symbol: "NSE:NIFTYPRIVATEBANK-INDEX" },
        { name: "NIFTY PSU BANK", symbol: "NSE:NIFTYPSUBANK-INDEX" },
        { name: "NIFTY OIL & GAS", symbol: "NSE:NIFTYOIL&GAS-INDEX" },
    ],
    "Broad Market Indices (NSE)": [
        { name: "NIFTY NEXT 50", symbol: "NSE:NIFTYNEXT50-INDEX" },
        { name: "NIFTY 100", symbol: "NSE:NIFTY100-INDEX" },
        { name: "NIFTY 500", symbol: "NSE:NIFTY500-INDEX" }
    ],
    "Broad Market Indices (BSE)": [
        { name: "S&P BSE SENSEX", symbol: "BSE:SENSEX-INDEX" }
    ]
    // ... You can add all other groups and symbols from your lead's list here
};

// --- Config for Tradable Symbols ---
export const SYMBOL_LOT_SIZES = {
    'NIFTY': 25,
    'BANKNIFTY': 15,
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75
};

export const SYMBOL_STRIKE_INCREMENT = {
    'NIFTY': 50,
    'BANKNIFTY': 100,
    'FINNIFTY': 50,
    'MIDCPNIFTY': 25
};

// --- Use export default for React ---
export default SYMBOL_LIST;