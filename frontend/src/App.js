import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import TradePanel from "./components/TradePanel"; 

const API_KEY = "AIzaSyDoT2XZg9xo-Cm4VX-Gc8NgYj3ieGDpP24";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

// --- [NEW] Lot & Strike Size Configuration ---
const SYMBOL_LOT_SIZES = {
  'NIFTY': 25,
  'BANKNIFTY': 15
};

const SYMBOL_STRIKE_INCREMENT = {
  'NIFTY': 50,
  'BANKNIFTY': 100
};
// --- [END NEW] ---

const strategyGroups = [
  {
    label: "Bullish Strategies",
    options: [
      { value: 'long-call', name: 'Long Call', fields: ['strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'bull-call-spread', name: 'Bull Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'bull-put-spread', name: 'Bull Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
    ]
  },
  {
    label: "Bearish Strategies",
    options: [
      { value: 'long-put', name: 'Long Put', fields: ['strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'bear-put-spread', name: 'Bear Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'bear-call-spread', name: 'Bear Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
    ]
  },
  {
    label: "Neutral Strategies",
    options: [
      { value: 'long-straddle', name: 'Long Straddle', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'short-straddle', name: 'Short Straddle', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'long-strangle', name: 'Long Strangle', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'short-strangle', name: 'Short Strangle', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { 
        value: 'iron-condor', 
        name: 'Iron Condor', 
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'strike4', 'premium4', 'lots', 'lotSize', 'targetPercent', 'slPercent'] 
      },
      { 
        value: 'iron-butterfly', 
        name: 'Iron Butterfly', 
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'premium3', 'strike3', 'premium4', 'lots', 'lotSize', 'targetPercent', 'slPercent'] 
      },
      { 
        value: 'call-butterfly', 
        name: 'Call Butterfly', 
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize', 'targetPercent', 'slPercent'] 
      },
      { value: 'calendar-spread', name: 'Calendar Spread', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
    ]
  },
  {
    label: "Other Strategies",
    options: [
      { value: 'short-call', name: 'Short Call', fields: ['strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'short-put', name: 'Short Put', fields: ['strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'protective-put', name: 'Protective Put', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'protective-call', name: 'Covered Call', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'synthetic-long-stock', name: 'Synthetic Long Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
      { value: 'synthetic-short-stock', name: 'Synthetic Short Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
    ]
  }
];

const strategyConfigs = strategyGroups.flatMap(group => group.options).reduce((acc, option) => {
    acc[option.value] = { name: option.name, fields: option.fields };
    return acc;
}, {});

const formatLabel = (fieldName, strategy) => {
    if (strategy === 'calendar-spread') {
        if (fieldName === 'premium1') return 'Long-Term Premium';
        if (fieldName === 'premium2') return 'Short-Term Premium';
    }
    if (strategy === 'long-straddle' || strategy === 'short-straddle') {
        if (fieldName === 'premium1') return 'Call Premium';
        if (fieldName === 'premium2') return 'Put Premium';
    }
    if (strategy === 'synthetic-long-stock' || strategy === 'synthetic-short-stock') {
        if (fieldName === 'premium') return 'Call Premium';
        if (fieldName === 'premium2') return 'Put Premium';
    }
    if (strategy === 'iron-condor') {
        if (fieldName === 'strike1') return 'Buy Put Strike';
        if (fieldName === 'premium1') return 'Buy Put Premium';
        if (fieldName === 'strike2') return 'Sell Put Strike';
        if (fieldName === 'premium2') return 'Sell Put Premium';
        if (fieldName === 'strike3') return 'Sell Call Strike';
        if (fieldName === 'premium3') return 'Sell Call Premium';
        if (fieldName === 'strike4') return 'Buy Call Strike';
        if (fieldName === 'premium4') return 'Buy Call Premium';
    }
    if (strategy === 'iron-butterfly') {
        if (fieldName === 'strike1') return 'Buy Put Strike';
        if (fieldName === 'premium1') return 'Buy Put Premium';
        if (fieldName === 'strike2') return 'Sell ATM Strike';
        if (fieldName === 'premium2') return 'Sell Put Premium';
        if (fieldName === 'premium3') return 'Sell Call Premium';
        if (fieldName === 'strike3') return 'Buy Call Strike';
        if (fieldName === 'premium4') return 'Buy Call Premium';
    }

    const labels = { 
      lotSize: 'Lot Size', 
      stockPrice: 'Underlying Price', 
      premium: 'Premium', 
      premium1: 'Premium 1', premium2: 'Premium 2', premium3: 'Premium 3', premium4: 'Premium 4',
      strike: 'Strike', strike1: 'Strike 1', strike2: 'Strike 2', strike3: 'Strike 3', strike4: 'Strike 4', 
      netPremium: 'Net Premium',
      targetPercent: 'Target %',
      slPercent: 'Stop-Loss %'
    };
    return labels[fieldName] || fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};

const translateFormToTrade = (strategy, form, currentSymbol) => {
    const lots = form.lots || 1;
    let tradeLegs = [];
    const symbol = currentSymbol; 
    let strategyType = strategyConfigs[strategy].name;

    try {
        switch (strategy) {
            case 'long-call':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'long-put':
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'short-call':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                break;
            case 'short-put':
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'bull-call-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots });
                break;
            case 'bear-call-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'bull-put-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'bear-put-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'long-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'short-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'long-strangle': 
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'short-strangle': 
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots });
                break;
            case 'iron-condor': 
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike4, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'iron-butterfly': 
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'call-butterfly': 
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: (lots * 2) });
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'protective-put': 
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'protective-call': 
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                break;
            case 'synthetic-long-stock': 
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'synthetic-short-stock': 
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'calendar-spread':
                throw new Error(`Strategy Error: The paper trader can't handle different expiry dates yet. This strategy is not supported for paper trading.`);
            default:
                throw new Error(`Paper trading logic for "${strategyType}" is not implemented yet.`);
        }
    } catch (error) {
        console.error("Trade Translation Error:", error);
        alert(error.message); 
        return null;
    }

    if (tradeLegs.length === 0) return null;

    return {
        symbol: symbol.toUpperCase(),
        strategyType: strategyType,
        legs: tradeLegs,
        targetPercent: form.targetPercent || 20, 
        slPercent: form.slPercent || -10      
    };
};

// --- [NEW] Helper: Finds the At-the-Money (ATM) strike ---
const findAtmStrike = (spot, symbol) => {
    const increment = SYMBOL_STRIKE_INCREMENT[symbol] || 50;
    return Math.round(spot / increment) * increment;
};

// --- [NEW] Helper: Auto-fills STRIKE fields based on ATM price ---
const autoFillPrimaryStrikes = (currentForm, currentStrategy, atmStrike, symbol) => {
    const newForm = { ...currentForm };
    const increment = SYMBOL_STRIKE_INCREMENT[symbol] || 50;

    switch (currentStrategy) {
        // Strategies with one central strike
        case 'long-call':
        case 'long-put':
        case 'short-call':
        case 'short-put':
        case 'long-straddle':
        case 'short-straddle':
        case 'synthetic-long-stock':
        case 'synthetic-short-stock':
            newForm.strike = atmStrike;
            break;

        // Strategies with 2 strikes (default to a simple spread)
        case 'bull-call-spread':
            newForm.strike1 = atmStrike;
            newForm.strike2 = atmStrike + increment;
            break;
        case 'bear-call-spread':
            newForm.strike1 = atmStrike;
            newForm.strike2 = atmStrike + increment;
            break;
        case 'bull-put-spread':
            newForm.strike1 = atmStrike;
            newForm.strike2 = atmStrike - increment;
            break;
        case 'bear-put-spread':
            newForm.strike1 = atmStrike;
            newForm.strike2 = atmStrike - increment;
            break;
        case 'long-strangle':
        case 'short-strangle':
            newForm.strike1 = atmStrike - increment; // OTM Put
            newForm.strike2 = atmStrike + increment; // OTM Call
            break;
        
        // Strategies with 3+ strikes (default condor/butterfly)
        case 'call-butterfly':
            newForm.strike1 = atmStrike - increment;
            newForm.strike2 = atmStrike;
            newForm.strike3 = atmStrike + increment;
            break;
        case 'iron-butterfly':
            newForm.strike1 = atmStrike - increment; // Buy Put
            newForm.strike2 = atmStrike; // Sell ATM
            newForm.strike3 = atmStrike + increment; // Buy Call
            break;
        case 'iron-condor':
            newForm.strike1 = atmStrike - (2 * increment); // Buy Put
            newForm.strike2 = atmStrike - increment;     // Sell Put
            newForm.strike3 = atmStrike + increment;     // Sell Call
            newForm.strike4 = atmStrike + (2 * increment); // Buy Call
            break;
        
        // Strategies with stock price
        case 'protective-put':
        case 'protective-call':
            newForm.stockPrice = Math.round(atmStrike / 10) * 10; // Auto-fill stock price
            newForm.strike = atmStrike; // Auto-fill strike too
            break;

        default:
            // Do nothing for calendar or others
    }
    return newForm;
};
// --- [END NEW HELPERS] ---


function App() {

  const defaultFormState = {
    lots: 1, 
    lotSize: SYMBOL_LOT_SIZES['NIFTY'], // Default to NIFTY's lot size (25)
    targetPercent: 20, 
    slPercent: -10 
  };
  
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('long-call');
  const [form, setForm] = useState(defaultFormState); 

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [theme, setTheme] = useState('light');
  const [showTradePanel, setShowTradePanel] = useState(false);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveData, setLiveData] = useState(null); 
  const [liveDataLoading, setLiveDataLoading] = useState(false);
  const [liveDataError, setLiveDataError] = useState(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const findOptionPrice = useCallback((strike, optionType) => {
      if (!liveData || !strike || !liveData.options) return ''; 
      const option = liveData.options.find(o => o.strike === Number(strike));
      if (!option) return ''; 
      
      const price = (optionType === 'CE') ? option.CE_Ltp : option.PE_Ltp;
      return price !== null ? price : ''; 
  }, [liveData]); 

  const updateAllPremiums = useCallback((currentForm, currentStrategy, currentSymbolData) => {
      if (!currentSymbolData) return currentForm; 
      
      const newForm = { ...currentForm };

      const findPrice = (strike, type) => {
        if (!strike) return '';
        const opt = currentSymbolData.options.find(o => o.strike === Number(strike));
        if (!opt) return '';
        const price = (type === 'CE') ? opt.CE_Ltp : opt.PE_Ltp;
        return price !== null ? price : '';
      };

      switch (currentStrategy) {
          case 'long-call':
          case 'short-call':
          case 'protective-call':
              newForm.premium = findPrice(newForm.strike, 'CE');
              break;
          case 'long-put':
          case 'short-put':
          case 'protective-put':
              newForm.premium = findPrice(newForm.strike, 'PE');
              break;
          case 'bull-call-spread':
          case 'bear-call-spread':
              newForm.premium1 = findPrice(newForm.strike1, 'CE');
              newForm.premium2 = findPrice(newForm.strike2, 'CE');
              break;
          case 'bull-put-spread':
          case 'bear-put-spread':
              newForm.premium1 = findPrice(newForm.strike1, 'PE');
              newForm.premium2 = findPrice(newForm.strike2, 'PE');
              break;
          case 'long-straddle':
          case 'short-straddle':
              newForm.premium1 = findPrice(newForm.strike, 'CE'); // Call
              newForm.premium2 = findPrice(newForm.strike, 'PE'); // Put
              break;
          case 'long-strangle':
          case 'short-strangle':
              newForm.premium1 = findPrice(newForm.strike1, 'PE'); // Put
              newForm.premium2 = findPrice(newForm.strike2, 'CE'); // Call
              break;
          case 'call-butterfly':
              newForm.premium1 = findPrice(newForm.strike1, 'CE');
              newForm.premium2 = findPrice(newForm.strike2, 'CE');
              newForm.premium3 = findPrice(newForm.strike3, 'CE');
              break;
          case 'iron-condor':
              newForm.premium1 = findPrice(newForm.strike1, 'PE');
              newForm.premium2 = findPrice(newForm.strike2, 'PE');
              newForm.premium3 = findPrice(newForm.strike3, 'CE');
              newForm.premium4 = findPrice(newForm.strike4, 'CE');
              break;
          case 'iron-butterfly':
              newForm.premium1 = findPrice(newForm.strike1, 'PE'); // Buy Put
              newForm.premium2 = findPrice(newForm.strike2, 'PE'); // Sell Put
              newForm.premium3 = findPrice(newForm.strike2, 'CE'); // Sell Call
              newForm.premium4 = findPrice(newForm.strike3, 'CE'); // Buy Call
              break;
          case 'synthetic-long-stock':
          case 'synthetic-short-stock':
              newForm.premium = findPrice(newForm.strike, 'CE'); // Call
              newForm.premium2 = findPrice(newForm.strike, 'PE'); // Put
              break;
          default:
              break; 
      }
      return newForm;
  }, []); 

  const handleSymbolChange = (e) => {
      const newSymbol = e.target.value;
      setSymbol(newSymbol);

      const newLotSize = SYMBOL_LOT_SIZES[newSymbol]; 
      setForm({
          ...defaultFormState, 
          lotSize: newLotSize  
      });
      
      setData(null);
      setError(null);
      setAnalysis("");
      setIsLiveMode(false);
      setLiveData(null);
      setLiveDataError(null);
  };

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value);
    setForm(prevForm => ({
        ...defaultFormState,
        lotSize: prevForm.lotSize 
    })); 
    setData(null);
    setError(null);
    setAnalysis("");
    setIsLiveMode(false);
    setLiveData(null);
    setLiveDataError(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newForm = { ...form, [name]: value ? Number(value) : '' };

    if (isLiveMode && liveData && name.startsWith('strike')) {
        newForm = updateAllPremiums(newForm, strategy, liveData);
    }
    
    setForm(newForm);
  };
  
  const handleReset = () => {
    const currentStrategy = strategy;
    setForm(defaultFormState); 
    setData(null);
    setError(null);
    setAnalysis("");
    setStrategy(''); 
    setSymbol('NIFTY'); 
    setIsLiveMode(false);
    setLiveData(null);
    setLiveDataError(null);
    setTimeout(() => setStrategy(currentStrategy), 0);
  };

  const handleSubmit = async () => {
    setError(null);
    setAnalysis("");
    setIsLoading(true);
    try {
      const payload = { strategy, ...form };
      const res = await axios.post('http://localhost:5000/calculate', payload);
      setData(res.data);
    } catch (err) {
      setData(null); 
      setError(err.response ? err.response.data.error : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAnalysis = async () => {
      if (!data || !API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
          setAnalysis("Please add your Gemini API Key in the App.js file to use this feature.");
          return;
      }
      setIsAnalyzing(true);
      setAnalysis("");
      
      const strategyName = strategyConfigs[strategy].name;
      const prompt = `
        As a professional options trading analyst, provide a clear, concise analysis for the following options strategy. 
        Structure your response in three parts with markdown headings: 
        1. **Strategy Overview:** Briefly explain what this strategy is and its goal.
        2. **Market Outlook:** Describe the ideal market condition (e.g., bullish, bearish, neutral, high/low volatility) for this trade to be profitable.
        3. **Risk Profile:** Explain the risk involved, referencing the calculated max profit and loss.
        Here are the details of the trade:
        - Strategy Name: ${strategyName}
        - Parameters: ${JSON.stringify(form)}
        - Maximum Profit: ${data.maxProfit}
        - Maximum Loss: ${data.maxLoss}
        - Breakeven Point(s): ${data.breakeven}
        Provide the analysis in clean, easy-to-read paragraphs. Do not repeat the input parameters in your analysis.
      `;

      try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error?.message || "API request failed");
        }
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          setAnalysis(text);
        } else {
          setAnalysis("Could not retrieve analysis. The response from the AI was empty.");
        }
      } catch (error) {
          console.error("Gemini API Error:", error);
          setAnalysis(`An error occurred while fetching the analysis: ${error.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };
    
  const formatValue = (value) => {
      if (typeof value === 'number') {
          return value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });
      }
      return value;
  };

  const handleSimulateTrade = async () => {
    if (!data) return; 

    const tradePayload = translateFormToTrade(strategy, form, symbol); 

    if (!tradePayload) {
        console.error("Trade payload is null, aborting.");
        return;
    }

    try {
        const res = await axios.post('http://localhost:5000/api/paper-trade', tradePayload);
        
        console.log("Paper trade submitted successfully:", res.data);
        
        setShowTradePanel(true);
        
    } catch (err) {
        console.error("Failed to submit paper trade:", err);
        setError(err.response ? err.response.data.error : "Error submitting paper trade.");
    }
  };

  // --- [CHANGED] This function now includes the new automation ---
  const toggleLiveMode = async () => {
      if (isLiveMode) {
          // Turning OFF
          setIsLiveMode(false);
          setLiveData(null);
          setLiveDataError(null);
          setForm(prevForm => ({ ...prevForm, ...defaultFormState, lotSize: prevForm.lotSize })); // Reset T/SL, etc.
      } else {
          // Turning ON
          setLiveDataLoading(true);
          setLiveDataError(null);
          try {
              const res = await axios.get(`http://localhost:5000/api/live-data/${symbol}`);
              const liveApiData = res.data;
              setLiveData(liveApiData);
              setIsLiveMode(true);
              
              // --- THIS IS THE NEW AUTOMATION ---
              // 1. Find the At-the-Money (ATM) strike
              const atmStrike = findAtmStrike(liveApiData.spot, liveApiData.symbol);
              
              // 2. Auto-fill the STRIKE fields based on the strategy
              let newForm = autoFillPrimaryStrikes(form, strategy, atmStrike, liveApiData.symbol);
              
              // 3. Auto-fill the PREMIUM fields based on the new strikes
              newForm = updateAllPremiums(newForm, strategy, liveApiData);
              
              // 4. Set the new form state all at once
              setForm(newForm);
              // --- END NEW AUTOMATION ---

          } catch (err) {
              const errorMsg = err.response?.data?.error || 'Failed to fetch live data. Is the backend running?';
              if (err.response?.status === 401) {
                setLiveDataError('Live data failed. Please re-login to Fyers via the backend.');
              } else {
                setLiveDataError(errorMsg);
              }
              setIsLiveMode(false);
          } finally {
              setLiveDataLoading(false);
          }
      }
  };
  // --- [END CHANGED] ---

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans bg-gray-50 dark:bg-gray-900 min-h-screen">
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-center text-gray-800 dark:text-gray-100">Options Strategy Visualizer</h1>
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-2xl"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md mb-8">
        
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-600 pb-2">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Strategy Parameters</h2>
            <div className="flex items-center space-x-2">
                <label htmlFor="liveModeToggle" className={`text-sm font-medium ${
                    liveDataLoading ? 'text-yellow-600' : (isLiveMode ? 'text-green-600' : 'text-gray-700 dark:text-gray-300')
                }`}>
                    {liveDataLoading ? "Loading Live..." : (isLiveMode ? "Live Mode ON" : "Live Mode OFF")}
                </label>
                <button
                    id="liveModeToggle"
                    onClick={toggleLiveMode}
                    disabled={liveDataLoading}
                    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors disabled:opacity-50 ${
                        isLiveMode ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                >
                    <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                            isLiveMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>
        </div>
        {liveDataError && <p className="text-red-500 text-sm mb-4 -mt-2">{liveDataError}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
          
          <div className="col-span-2 md:col-span-1">
            <label htmlFor="symbol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Symbol</label>
            <select
              id="symbol" name="symbol" value={symbol} onChange={handleSymbolChange}
              disabled={isLiveMode} 
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:bg-gray-100 dark:disabled:bg-gray-800"
            >
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
            </select>
          </div>

          <div className="col-span-2 md:col-span-1">
            <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Strategy</label>
            <select
              id="strategy" name="strategy" value={strategy} onChange={handleStrategyChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            >
              {strategyGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(option => ( <option key={option.value} value={option.value}> {option.name} </option> ))}
                </optgroup>
              ))}
            </select>
          </div>

          {strategy && strategyConfigs[strategy]?.fields.map(field => (
            <div key={field} className="col-span-1">
              <label htmlFor={field} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{formatLabel(field, strategy)}</label>
              <input
                type="number" id={field} name={field} value={form[field] || ''} onChange={handleChange}
                disabled={(isLiveMode && field.startsWith('premium')) || field === 'lotSize'}
                className={`mt-1 p-2 block w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500
                  ${(isLiveMode && field.startsWith('premium')) || field === 'lotSize' ? 'bg-gray-100 dark:bg-gray-800' : ''}
                `}
                placeholder="0"
              />
            </div>
          ))}
          
          <div className="col-span-2 md:grid-cols-4 lg:col-span-2 flex items-end space-x-2">
            <button 
              onClick={handleSubmit} 
              disabled={isLoading}
              className={`w-full text-white px-4 py-2 rounded-md shadow-sm transition duration-150 ease-in-out font-semibold disabled:cursor-not-allowed 
              ${data 
                ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500 disabled:bg-green-400' 
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-400'
              }`}
            >
              {isLoading ? 'Calculating...' : (data ? 'Recalculate' : 'Calculate')}
            </button>
             <button 
              onClick={handleReset} 
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-gray-700 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 font-semibold"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-8 p-4 bg-red-100 text-red-700 border border-red-400 rounded-lg shadow-lg text-center">
          <p className="font-bold">Calculation Error</p>
          <p>{error}</p>
        </div>
      )}

      {data && (
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl animate-fade-in">
          
          <div className="flex justify-between items-center mb-6 border-b dark:border-gray-600 pb-2">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Calculation Results</h2>
            <div className="flex space-x-2">
                <button
                  onClick={handleSimulateTrade}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 transition duration-150 ease-in-out font-semibold"
                >
                  📈 Simulate Trade
                </button>
                <button 
                    onClick={handleAnalysis} 
                    disabled={isAnalyzing || isLoading}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-purple-700 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 font-semibold disabled:bg-purple-400 disabled:cursor-not-allowed"
                >
                    {isAnalyzing ? 'Analyzing...' : '✨ Analyze Strategy'}
                </button>
            </div>
          </div>
          
          {isLiveMode && liveData && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg flex justify-center items-center">
                <p className="text-lg font-semibold text-blue-800 dark:text-blue-300">
                  Live {liveData.symbol} Spot: {liveData.spot}
                </p>
            </div>
          )}

          {(isAnalyzing || analysis) && (
            <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-lg">
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-2">Gemini Strategy Analysis</h3>
                {isAnalyzing ? (
                    <p className="text-purple-700 dark:text-purple-400">Generating analysis, please wait...</p>
                ) : (
                    <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap prose" dangerouslySetInnerHTML={{ __html: analysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />') }} />
                )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-center">
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded">
              <p className="text-sm text-green-800 dark:text-green-300 font-semibold">Max Profit</p>
              <p className="text-xl text-green-900 dark:text-green-200 font-bold">{formatValue(data.maxProfit)}</p>
            </div>
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded">
              <p className="text-sm text-green-800 dark:text-green-300 font-semibold">Max Profit %</p>
              <p className="text-xl text-green-900 dark:text-green-200 font-bold">
                  {typeof data.maxProfitPercentage === 'number' ? `${data.maxProfitPercentage.toFixed(2)}%` : data.maxProfitPercentage}
              </p>
            </div>
            <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded">
              <p className="text-sm text-red-800 dark:text-red-300 font-semibold">Max Loss</p>
              <p className="text-xl text-red-900 dark:text-red-200 font-bold">{formatValue(data.maxLoss)}</p>
            </div>
            <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded">
              <p className="text-sm text-red-800 dark:text-red-300 font-semibold">Max Loss %</p>
              <p className="text-xl text-red-900 dark:text-red-200 font-bold">
                  {typeof data.maxLossPercentage === 'number' ? `${data.maxLossPercentage.toFixed(2)}%` : data.maxLossPercentage}
              </p>
            </div>
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold">Breakeven</p>
              <p className="text-xl text-yellow-900 dark:text-yellow-200 font-bold">{data.breakeven}</p>
            </div>
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold">Total Lots</p>
              <p className="text-xl text-blue-900 dark:text-blue-200 font-bold">{form.lots || 0}</p>
            </div>
          </div>
          
          <div className="w-full" style={{ height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.payoffCurve} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="spot" name="Spot Price" tick={{ fill: '#9ca3af' }} />
                <YAxis tickFormatter={(tick) => tick.toLocaleString()} tick={{ fill: '#9ca3af' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                    borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db' 
                  }}
                />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                {isLiveMode && liveData && (
                    <ReferenceLine x={liveData.spot} stroke="#007bff" strokeDasharray="3 3">
                        <label value={`Spot: ${liveData.spot}`} position="insideBottom" fill="#007bff" />
                    </ReferenceLine>
                )}
                <Line type="monotone" dataKey="payoff" stroke="#8884d8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showTradePanel && <TradePanel />}

    </div>
  );
}

export default App;