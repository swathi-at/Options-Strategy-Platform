// --- Fyers API Symbol -> User-Friendly Key ---
export const SYMBOL_CONFIG_KEY_MAP = {
    // Indices (Weekly Expiry)
    'NSE:NIFTY50-INDEX': 'NIFTY',
    'NSE:NIFTYBANK-INDEX': 'BANKNIFTY',
    'NSE:FINNIFTY-INDEX': 'FINNIFTY',
    'NSE:MIDCPNIFTY-INDEX': 'MIDCPNIFTY',
    'BSE:SENSEX-INDEX': 'SENSEX', 
};

// --- List of All Symbols for Frontend Dropdown ---
export const SYMBOL_LIST = {
    "Tradable Indices": [
        { name: "NIFTY 50 (Weekly - Tue/Thu)", symbol: "NIFTY" },
        { name: "NIFTY BANK (Weekly - Wed)", symbol: "BANKNIFTY" },
        { name: "SENSEX (BSE - Weekly Fri)", symbol: "BSE:SENSEX-INDEX" },
        { name: "NIFTY FIN SERVICE (Weekly - Tue)", symbol: "FINNIFTY" },
    ],
    "Nifty 50 Stocks (Monthly Expiry)": [
        { name: "Reliance Industries", symbol: "NSE:RELIANCE-EQ" },
        { name: "HDFC Bank", symbol: "NSE:HDFCBANK-EQ" },
        { name: "ICICI Bank", symbol: "NSE:ICICIBANK-EQ" },
        { name: "State Bank of India", symbol: "NSE:SBIN-EQ" },
        { name: "Infosys", symbol: "NSE:INFY-EQ" },
        { name: "TCS", symbol: "NSE:TCS-EQ" },
        { name: "Bharti Airtel", symbol: "NSE:BHARTIARTL-EQ" },
        { name: "LIC India", symbol: "NSE:LICI-EQ" },
        { name: "Hindustan Unilever", symbol: "NSE:HINDUNILVR-EQ" },
        { name: "Bajaj Finance", symbol: "NSE:BAJFINANCE-EQ" },
        { name: "Larsen & Toubro", symbol: "NSE:LT-EQ" },
        { name: "ITC", symbol: "NSE:ITC-EQ" },
        { name: "Maruti Suzuki", symbol: "NSE:MARUTI-EQ" },
        { name: "Kotak Mahindra Bank", symbol: "NSE:KOTAKBANK-EQ" },
        { name: "Mahindra & Mahindra", symbol: "NSE:M&M-EQ" },
        { name: "HCL Technologies", symbol: "NSE:HCLTECH-EQ" },
        { name: "Sun Pharma", symbol: "NSE:SUNPHARMA-EQ" },
        { name: "Axis Bank", symbol: "NSE:AXISBANK-EQ" },
        { name: "Titan Company", symbol: "NSE:TITAN-EQ" },
        { name: "UltraTech Cement", symbol: "NSE:ULTRACEMCO-EQ" },
        { name: "Bajaj Finserv", symbol: "NSE:BAJAJFINSV-EQ" },
        { name: "Adani Ports", symbol: "NSE:ADANIPORTS-EQ" },
        { name: "NTPC", symbol: "NSE:NTPC-EQ" },
        { name: "Adani Enterprises", symbol: "NSE:ADANIENT-EQ" },
        { name: "ONGC", symbol: "NSE:ONGC-EQ" },
        { name: "Apollo Hospitals", symbol: "NSE:APOLLOHOSP-EQ" },
        { name: "Grasim Industries", symbol: "NSE:GRASIM-EQ" },
        { name: "Wipro", symbol: "NSE:WIPRO-EQ" },
        { name: "Asian Paints", symbol: "NSE:ASIANPAINT-EQ" },
        { name: "Dr. Reddy's Labs", symbol: "NSE:DRREDDY-EQ" },
        { name: "Pidilite Industries", symbol: "NSE:PIDILITIND-EQ" },
        { name: "IndusInd Bank", symbol: "NSE:INDUSINDBK-EQ" },
        { name: "Power Grid Corp", symbol: "NSE:POWERGRID-EQ" },
        { name: "Coal India", symbol: "NSE:COALINDIA-EQ" },
        { name: "JSW Steel", symbol: "NSE:JSWSTEEL-EQ" },
        { name: "Tech Mahindra", symbol: "NSE:TECHM-EQ" },
        { name: "Tata Steel", symbol: "NSE:TATASTEEL-EQ" },
        { name: "Indian Oil Corp", symbol: "NSE:IOC-EQ" },
        { name: "BPCL", symbol: "NSE:BPCL-EQ" },
        { name: "GAIL", symbol: "NSE:GAIL-EQ" },
        { name: "Hindalco", symbol: "NSE:HINDALCO-EQ" },
        { name: "Cipla", symbol: "NSE:CIPLA-EQ" },
        { name: "UPL", symbol: "NSE:UPL-EQ" },
        { name: "Divi's Labs", symbol: "NSE:DIVISLAB-EQ" },
        { name: "Hindustan Zinc", symbol: "NSE:HINDZINC-EQ" },
        { name: "Tata Motors", symbol: "NSE:TATAMOTORS-EQ" },
        { name: "Eicher Motors", symbol: "NSE:EICHERMOT-EQ" },
        { name: "Adani Green Energy", symbol: "NSE:ADANIGREEN-EQ" },
        { name: "HDFC Life", symbol: "NSE:HDFCLIFE-EQ" },
        { name: "Britannia", symbol: "NSE:BRITANNIA-EQ" }
    ]
};

// --- Config for Tradable Symbols ---
export const SYMBOL_LOT_SIZES = {
    'NIFTY': 25,
    'BANKNIFTY': 15,
    'FINNIFTY': 40,
    'MIDCPNIFTY': 75,
    'SENSEX': 10,
};

export const SYMBOL_STRIKE_INCREMENT = {
    'NIFTY': 50,
    'BANKNIFTY': 100,
    'FINNIFTY': 50,
    'MIDCPNIFTY': 25,
    'SENSEX': 100,
};

export default SYMBOL_LIST;