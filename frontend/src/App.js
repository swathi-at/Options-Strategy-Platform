import React, { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import TradePanel from "./components/TradePanel"; // <-- NEW: Import the TradePanel component

// --- (The rest of the initial setup code is the same) ---
const API_KEY = "AIzaSyDoT2XZg9xo-Cm4VX-Gc8NgYj3ieGDpP24";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

// --- [CHANGED BLOCK 1/2] ---
// Updated to include 4 premium fields for Condors/Butterflies
const strategyGroups = [
  {
    label: "Bullish Strategies",
    options: [
      { value: 'long-call', name: 'Long Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
      { value: 'bull-call-spread', name: 'Bull Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
      { value: 'bull-put-spread', name: 'Bull Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    ]
  },
  {
    label: "Bearish Strategies",
    options: [
      { value: 'long-put', name: 'Long Put', fields: ['strike', 'premium', 'lots', 'lotSize'] },
      { value: 'bear-put-spread', name: 'Bear Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
      { value: 'bear-call-spread', name: 'Bear Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    ]
  },
  {
    label: "Neutral Strategies",
    options: [
      { value: 'long-straddle', name: 'Long Straddle', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize'] },
      { value: 'short-straddle', name: 'Short Straddle', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize'] },
      { value: 'long-strangle', name: 'Long Strangle', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
      { value: 'short-strangle', name: 'Short Strangle', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
      
      // --- HERE ARE THE CHANGES ---
      { 
        value: 'iron-condor', 
        name: 'Iron Condor', 
        // Changed from 'netPremium' to 4x premiums
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'strike4', 'premium4', 'lots', 'lotSize'] 
      },
      { 
        value: 'iron-butterfly', 
        name: 'Iron Butterfly', 
        // Changed from 'netPremium' to 3x premiums
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize'] 
      },
      { 
        value: 'call-butterfly', 
        name: 'Call Butterfly', 
        // Changed from 'netPremium' to 3x premiums
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize'] 
      },
      // --- END OF CHANGES ---

      { value: 'calendar-spread', name: 'Calendar Spread', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize'] },
    ]
  },
  {
    label: "Other Strategies",
    options: [
      { value: 'short-call', name: 'Short Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
      { value: 'short-put', name: 'Short Put', fields: ['strike', 'premium', 'lots', 'lotSize'] },
      { value: 'protective-put', name: 'Protective Put', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
      { value: 'protective-call', name: 'Covered Call', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
      { value: 'synthetic-long-stock', name: 'Synthetic Long Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
      { value: 'synthetic-short-stock', name: 'Synthetic Short Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
    ]
  }
];
// --- [END CHANGED BLOCK 1/2] ---

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
    // Added labels for new premium fields
    const labels = { 
      lotSize: 'Lot Size', stockPrice: 'Stock Price', premium: 'Premium', 
      premium1: 'Premium 1', premium2: 'Premium 2', premium3: 'Premium 3', premium4: 'Premium 4',
      strike: 'Strike', strike1: 'Strike 1', strike2: 'Strike 2', strike3: 'Strike 3', strike4: 'Strike 4', 
      netPremium: 'Net Premium', 
    };
    return labels[fieldName] || fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};

// --- [CHANGED BLOCK 2/2] ---
// This function converts your flat 'form' state into the 
// 'legs' array and payload that the backend /api/paper-trade endpoint expects.
const translateFormToTrade = (strategy, form) => {
    // We'll get lots from the form, but default to 1 if not present
    const lots = form.lots || 1;
    let tradeLegs = [];
    
    // We'll hard-code NIFTY for now. 
    // TODO: Add a dropdown in the UI to select NIFTY/BANKNIFTY
    const symbol = "NIFTY"; 
    let strategyType = strategyConfigs[strategy].name;

    // We must manually define the legs for each strategy
    try {
        switch (strategy) {
            // --- 1-Leg Bullish/Bearish ---
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

            // --- 2-Leg Spreads ---
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

            // --- Neutral (Volatilty) Strategies ---
            case 'long-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'short-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'long-strangle': // Assumes strike1=Put, strike2=Call
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            case 'short-strangle': // Assumes strike1=Put, strike2=Call
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots });
                break;

            // --- NEW: 4-Leg Strategies ---
            case 'iron-condor': // 4 strikes, 4 legs
                // 1. BUY OTM Put (strike1)
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                // 2. SELL OTM Put (strike2)
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                // 3. SELL OTM Call (strike3)
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'SELL', qty: lots });
                // 4. BUY OTM Call (strike4)
                tradeLegs.push({ strike: form.strike4, optionType: 'CE', action: 'BUY', qty: lots });
                break;

            case 'iron-butterfly': // 3 strikes, 4 legs
                // 1. BUY OTM Put (strike1)
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                // 2. SELL ATM Put (strike2)
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                // 3. SELL ATM Call (strike2)
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots });
                // 4. BUY OTM Call (strike3)
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            
            case 'call-butterfly': // 3 strikes, 4 legs (all calls)
                // 1. BUY ITM Call (strike1)
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'BUY', qty: lots });
                // 2. SELL 2x ATM Call (strike2)
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: (lots * 2) });
                // 3. BUY OTM Call (strike3)
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'BUY', qty: lots });
                break;
            // --- END NEW 4-Leg ---

            // --- Other (Synthetic/Hedge) Strategies ---
            case 'protective-put': // Long Stock + Long Put. Paper trading the option leg.
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;
            case 'protective-call': // (Covered Call) Long Stock + Short Call. Paper trading the option leg.
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                break;
            case 'synthetic-long-stock': // Long Call + Short Put
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots });
                break;
            case 'synthetic-short-stock': // Short Call + Long Put
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots });
                break;

            // --- BLOCKED STRATEGIES ---
            case 'calendar-spread':
                throw new Error(`Strategy Error: The paper trader can't handle different expiry dates yet. This strategy is not supported for paper trading.`);

            default:
                // If the strategy isn't listed, we can't trade it.
                throw new Error(`Paper trading logic for "${strategyType}" is not implemented yet.`);
        }
    } catch (error) {
        console.error("Trade Translation Error:", error);
        alert(error.message); 
        return null;
    }

    if (tradeLegs.length === 0) return null;

    // This is the final JSON payload for the backend
    return {
        symbol: symbol,
        strategyType: strategyType,
        legs: tradeLegs,
        // TODO: Add inputs for T/SL in the UI and get them from the form
        targetPercent: 20, 
        slPercent: -10     
    };
};
// --- [END CHANGED BLOCK 2/2] ---


function App() {
  const [strategy, setStrategy] = useState('long-call');
  const [form, setForm] = useState({ lots: 1, lotSize: 50 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [theme, setTheme] = useState('light');

  // --- NEW: State to show/hide the trade panel ---
  const [showTradePanel, setShowTradePanel] = useState(false);

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

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value);
    setForm({ lots: 1, lotSize: 50 });
    setData(null);
    setError(null);
    setAnalysis("");
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value ? Number(e.target.value) : '' });
  };
  
  const handleReset = () => {
    const currentStrategy = strategy;
    setForm({ lots: 1, lotSize: 50 });
    setData(null);
    setError(null);
    setAnalysis("");
    setStrategy(''); 
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

  // This is the wired-up function
  const handleSimulateTrade = async () => {
    if (!data) return; // Don't do anything if there's no calculated strategy

    // 1. Translate the form into a backend-ready payload
    const tradePayload = translateFormToTrade(strategy, form);

    // 2. Check if the translation was successful
    if (!tradePayload) {
        // The translator function will have already alerted the user
        console.error("Trade payload is null, aborting.");
        return;
    }

    try {
        // 3. Send the payload to the backend
        // Make sure your backend server URL is correct!
        const res = await axios.post('http://localhost:5000/api/paper-trade', tradePayload);
        
        console.log("Paper trade submitted successfully:", res.data);
        
        // 4. Show the trade panel
        setShowTradePanel(true);
        
    } catch (err) {
        console.error("Failed to submit paper trade:", err);
        // Display the error from the backend to the user
        setError(err.response ? err.response.data.error : "Error submitting paper trade.");
    }
  };

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
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b dark:border-gray-600 pb-2">Strategy Parameters</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-2">
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
                className="mt-1 p-2 block w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="0"
              />
            </div>
          ))}
          
          <div className="col-span-2 md:col-span-4 lg:col-span-2 flex items-end space-x-2">
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
            {/* --- NEW: Container for the two action buttons --- */}
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
                <Line type="monotone" dataKey="payoff" stroke="#8884d8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* --- NEW: Conditionally render the TradePanel --- */}
      {showTradePanel && <TradePanel />}

    </div>
  );
}

export default App;