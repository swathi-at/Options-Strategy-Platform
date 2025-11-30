import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import TradePanel from "./components/TradePanel"; 
import SYMBOL_LIST, { SYMBOL_LOT_SIZES, SYMBOL_STRIKE_INCREMENT } from './constants'; 
import AlgoDashboard from "./components/AlgoDashboard";

// --- CONFIG ---
// WARNING: Do not commit this key to a public repository
const API_KEY = "YOUR_GEMINI_KEY"; // Replace with your actual Gemini Key
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
const BACKEND_URL = 'http://localhost:5000';

// --- STRATEGY DEFINITIONS (Existing Config) ---
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
            { value: 'iron-condor', name: 'Iron Condor', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'strike4', 'premium4', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
            { value: 'iron-butterfly', name: 'Iron Butterfly', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'premium3', 'strike3', 'premium4', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
            { value: 'call-butterfly', name: 'Call Butterfly', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize', 'targetPercent', 'slPercent'] },
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

// --- HELPER FUNCTIONS ---
const formatLabel = (fieldName, strategy) => {
    if (strategy === 'calendar-spread') {
        if (fieldName === 'premium1') return 'Long-Term Premium';
        if (fieldName === 'premium2') return 'Short-Term Premium';
    }
    const labels = {
        lotSize: 'Lot Size', stockPrice: 'Underlying Price', premium: 'Premium',
        premium1: 'Premium 1', premium2: 'Premium 2', premium3: 'Premium 3', premium4: 'Premium 4',
        strike: 'Strike', strike1: 'Strike 1', strike2: 'Strike 2', strike3: 'Strike 3', strike4: 'Strike 4',
        targetPercent: 'Target %', slPercent: 'Stop-Loss %'
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
            case 'long-call': tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots }); break;
            case 'long-put': tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots }); break;
            case 'short-call': tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots }); break;
            case 'short-put': tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots }); break;
            case 'bull-call-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'SELL', qty: lots }); break;
            case 'bull-put-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'BUY', qty: lots }); break;
            case 'bear-call-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'CE', action: 'BUY', qty: lots }); break;
            case 'bear-put-spread':
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots }); break;
            case 'long-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'BUY', qty: lots }); break;
            case 'short-straddle':
                tradeLegs.push({ strike: form.strike, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike, optionType: 'PE', action: 'SELL', qty: lots }); break;
            case 'iron-condor':
                tradeLegs.push({ strike: form.strike1, optionType: 'PE', action: 'BUY', qty: lots });
                tradeLegs.push({ strike: form.strike2, optionType: 'PE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike3, optionType: 'CE', action: 'SELL', qty: lots });
                tradeLegs.push({ strike: form.strike4, optionType: 'CE', action: 'BUY', qty: lots }); break;
            default: return null;
        }
    } catch (error) {
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

const findAtmStrike = (spot, symbolKey) => {
    const configKey = Object.keys(SYMBOL_STRIKE_INCREMENT).find(key => key === symbolKey.toUpperCase());
    const increment = configKey ? SYMBOL_STRIKE_INCREMENT[configKey] : 50; 
    return Math.round(spot / increment) * increment;
};

const autoFillPrimaryStrikes = (currentForm, currentStrategy, atmStrike, symbolKey) => {
    const newForm = { ...currentForm };
    const configKey = Object.keys(SYMBOL_STRIKE_INCREMENT).find(key => key === symbolKey.toUpperCase());
    const increment = configKey ? SYMBOL_STRIKE_INCREMENT[configKey] : 50;

    switch (currentStrategy) {
        // --- Single Leg / Central Strike Strategies ---
        case 'long-call': 
        case 'long-put': 
        case 'short-call': 
        case 'short-put': 
        case 'long-straddle': 
        case 'short-straddle':
        case 'synthetic-long-stock':  // [ADDED]
        case 'synthetic-short-stock': // [ADDED]
        case 'calendar-spread':       // [ADDED]
            newForm.strike = atmStrike; 
            break;

        // --- 2-Strike Spreads ---
        case 'bull-call-spread': 
        case 'bear-call-spread':
            newForm.strike1 = atmStrike; 
            newForm.strike2 = atmStrike + increment; 
            break;
        case 'bull-put-spread': 
        case 'bear-put-spread':
            newForm.strike1 = atmStrike; 
            newForm.strike2 = atmStrike - increment; 
            break;
        case 'long-strangle':
        case 'short-strangle':
            newForm.strike1 = atmStrike - increment; // OTM Put
            newForm.strike2 = atmStrike + increment; // OTM Call
            break;

        // --- 3-Strike Strategies ---
        case 'call-butterfly':
        case 'iron-butterfly':
            newForm.strike1 = atmStrike - increment;
            newForm.strike2 = atmStrike;
            newForm.strike3 = atmStrike + increment;
            break;

        // --- 4-Strike Strategies ---
        case 'iron-condor':
            newForm.strike1 = atmStrike - (2 * increment);
            newForm.strike2 = atmStrike - increment;
            newForm.strike3 = atmStrike + increment;
            newForm.strike4 = atmStrike + (2 * increment); 
            break;
            
        // --- Stock Price Dependent ---
        case 'protective-put':
        case 'protective-call':
            newForm.stockPrice = atmStrike; // Approx spot
            newForm.strike = atmStrike;
            break;

        default: 
            break;
    }
    return newForm;
};

// --- MAIN COMPONENT ---
function App() {

    const defaultFormState = {
        lots: 1,
        lotSize: SYMBOL_LOT_SIZES['NIFTY'], 
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

    // --- NEW STATES FOR GREEKS & DEPLOYMENT ---
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [liveData, setLiveData] = useState(null);
    const [liveDataLoading, setLiveDataLoading] = useState(false);
    const [liveDataError, setLiveDataError] = useState(null);
    const [decisionResult, setDecisionResult] = useState(null); 
    const [signalStrength, setSignalStrength] = useState({ direction: 'BULL', strength: 'MODERATE' }); 

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);
    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    // --- Premium Auto-filler (Updated for Greeks structure) ---
    const updateAllPremiums = useCallback((currentForm, currentStrategy, currentSymbolData) => {
        if (!currentSymbolData || !currentSymbolData.options || currentSymbolData.options.length === 0) {
            return currentForm;
        }
        
        const newForm = { ...currentForm };
        const findPrice = (strike, type) => {
            if (!strike) return '';
            const opt = currentSymbolData.options.find(o => o.strike === Number(strike));
            if (!opt) return '';
            return (type === 'CE') ? opt.CE_Ltp : opt.PE_Ltp;
        };

        // --- MAP STRATEGIES TO PREMIUMS ---
        
        // Single Leg & Simple
        if (['long-call', 'short-call', 'protective-call'].includes(currentStrategy)) {
            newForm.premium = findPrice(newForm.strike, 'CE');
        } 
        else if (['long-put', 'short-put', 'protective-put'].includes(currentStrategy)) {
            newForm.premium = findPrice(newForm.strike, 'PE');
        }
        // Spreads (Call)
        else if (['bull-call-spread', 'bear-call-spread'].includes(currentStrategy)) {
            newForm.premium1 = findPrice(newForm.strike1, 'CE'); 
            newForm.premium2 = findPrice(newForm.strike2, 'CE');
        } 
        // Spreads (Put)
        else if (['bull-put-spread', 'bear-put-spread'].includes(currentStrategy)) {
            newForm.premium1 = findPrice(newForm.strike1, 'PE'); 
            newForm.premium2 = findPrice(newForm.strike2, 'PE');
        } 
        // Straddles (1 Strike, Both Types)
        else if (['long-straddle', 'short-straddle'].includes(currentStrategy)) {
            newForm.premium1 = findPrice(newForm.strike, 'CE'); 
            newForm.premium2 = findPrice(newForm.strike, 'PE');
        } 
        // Strangles (2 Strikes: Put lower, Call higher)
        else if (['long-strangle', 'short-strangle'].includes(currentStrategy)) {
            newForm.premium1 = findPrice(newForm.strike1, 'PE'); 
            newForm.premium2 = findPrice(newForm.strike2, 'CE');
        }
        // Synthetics (1 Strike, Both Types)
        else if (['synthetic-long-stock', 'synthetic-short-stock'].includes(currentStrategy)) {
            newForm.premium = findPrice(newForm.strike, 'CE'); 
            newForm.premium2 = findPrice(newForm.strike, 'PE');
        }
        // Butterflies
        else if (currentStrategy === 'call-butterfly') {
            newForm.premium1 = findPrice(newForm.strike1, 'CE');
            newForm.premium2 = findPrice(newForm.strike2, 'CE');
            newForm.premium3 = findPrice(newForm.strike3, 'CE');
        }
        else if (currentStrategy === 'iron-butterfly') {
            newForm.premium1 = findPrice(newForm.strike1, 'PE'); // Wing
            newForm.premium2 = findPrice(newForm.strike2, 'PE'); // Body
            newForm.premium3 = findPrice(newForm.strike2, 'CE'); // Body
            newForm.premium4 = findPrice(newForm.strike3, 'CE'); // Wing
        }
        // Iron Condor
        else if (currentStrategy === 'iron-condor') {
            newForm.premium1 = findPrice(newForm.strike1, 'PE'); 
            newForm.premium2 = findPrice(newForm.strike2, 'PE');
            newForm.premium3 = findPrice(newForm.strike3, 'CE'); 
            newForm.premium4 = findPrice(newForm.strike4, 'CE');
        }
        // Calendar Spread (Limitation: Can only fetch same expiry price currently)
        else if (currentStrategy === 'calendar-spread') {
            newForm.premium1 = findPrice(newForm.strike, 'CE'); 
            newForm.premium2 = findPrice(newForm.strike, 'CE');
        }

        return newForm;
    }, []);

    // --- LIVE DATA HANDLER (FETCH WITH GREEKS) ---
    const fetchLiveData = async () => {
        setLiveDataLoading(true);
        setLiveDataError(null);
        try {
            // New Endpoint with Greeks
            const res = await axios.get(`${BACKEND_URL}/api/live-data-with-greeks/${symbol}`);
            const liveApiData = res.data;
            setLiveData(liveApiData);

            // Automation for Manual Builder
            const symbolKey = liveApiData.symbol; 
            const atmStrike = findAtmStrike(liveApiData.spot, symbolKey);
            let newForm = autoFillPrimaryStrikes(form, strategy, atmStrike, symbolKey);
            if (liveApiData.options && liveApiData.options.length > 0) {
                newForm = updateAllPremiums(newForm, strategy, liveApiData);
            }
            setForm(newForm);

        } catch (err) {
            setLiveDataError('Failed to fetch live Greeks data.');
            setIsLiveMode(false);
        } finally {
            setLiveDataLoading(false);
        }
    };

    const toggleLiveMode = () => {
        if (!isLiveMode) {
            setIsLiveMode(true);
            fetchLiveData(); // Initial fetch
            // Set interval for polling would happen here in a real app
        } else {
            setIsLiveMode(false);
            setLiveData(null);
        }
    };

    // --- AUTO DEPLOY (DECISION ENGINE) ---
    const handleAutoDeploy = async () => {
        if (!liveData) {
            alert("Please start Live Greeks mode first to fetch market data.");
            return;
        }
        try {
            const payload = { symbol: symbol, signal: signalStrength };
            const res = await axios.post(`${BACKEND_URL}/api/decide-and-build-order`, payload);
            setDecisionResult(res.data);
            
            if (res.data.decision === 'PLACE') {
                // Optional: Auto-populate manual form with decision
                // alert(`Engine Selected: ${res.data.strategy}`);
            } 
        } catch (e) {
            console.error(e);
            alert("Deployment failed check console.");
        }
    };

    // --- EVENT HANDLERS ---
    const handleSymbolChange = (e) => {
        const newSymbol = e.target.value;
        setSymbol(newSymbol);
        const configKey = Object.keys(SYMBOL_LOT_SIZES).find(key => key === newSymbol.toUpperCase());
        setForm({ ...defaultFormState, lotSize: configKey ? SYMBOL_LOT_SIZES[configKey] : 1 });
        setData(null); setError(null); setAnalysis("");
        setIsLiveMode(false); setLiveData(null); setDecisionResult(null);
    };

   const handleStrategyChange = (e) => {
        const newStrategy = e.target.value;
        setStrategy(newStrategy);
        setData(null); 
        setError(null); 
        setAnalysis("");

        // --- NEW LOGIC: Auto-fill if Live Mode is already ON ---
        if (isLiveMode && liveData) {
            // 1. Find the Config Key (e.g., NIFTY)
            const symbolKey = liveData.symbol || Object.keys(SYMBOL_LOT_SIZES).find(key => key === symbol.toUpperCase());
            
            // 2. Find ATM based on current cached Spot Price
            const atmStrike = findAtmStrike(liveData.spot, symbolKey);

            // 3. Calculate new Strikes for the NEW strategy
            let newForm = autoFillPrimaryStrikes(defaultFormState, newStrategy, atmStrike, symbolKey);

            // 4. Fill Premiums for those new strikes
            if (liveData.options && liveData.options.length > 0) {
                newForm = updateAllPremiums(newForm, newStrategy, liveData);
            }

            // 5. Preserve Lot Size and Risk Settings from previous state
            newForm.lotSize = form.lotSize;
            newForm.targetPercent = form.targetPercent;
            newForm.slPercent = form.slPercent;

            setForm(newForm);
        } else {
            // If NOT Live, just reset to defaults
            setForm(prevForm => ({ 
                ...defaultFormState, 
                lotSize: prevForm.lotSize 
            }));
        }
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
        const currentSymbol = symbol;
        const currentStrategy = strategy;
        setForm(defaultFormState);
        setData(null); setError(null); setAnalysis(""); setStrategy(''); setSymbol('NIFTY'); 
        setIsLiveMode(false); setLiveData(null); setDecisionResult(null);
        setTimeout(() => {
            setSymbol(currentSymbol);
            setStrategy(currentStrategy);
            const configKey = Object.keys(SYMBOL_LOT_SIZES).find(key => key === currentSymbol.toUpperCase());
            setForm(prev => ({ ...defaultFormState, lotSize: configKey ? SYMBOL_LOT_SIZES[configKey] : 1 }));
        }, 0);
    };

    const handleSubmit = async () => {
        setError(null); setAnalysis(""); setIsLoading(true);
        try {
            const payload = { strategy, ...form, symbol: symbol };
            if (!payload.lotSize) payload.lotSize = 1;
            const res = await axios.post(`${BACKEND_URL}/calculate`, payload);
            setData(res.data);
        } catch (err) {
            setData(null);
            setError(err.response ? err.response.data.error : "An error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalysis = async () => {
        if (!data || !API_KEY || API_KEY.includes("YOUR_GEMINI_KEY")) {
            setAnalysis("Please add your Gemini API Key in the App.js file.");
            return;
        }
        setIsAnalyzing(true); setAnalysis("");
        const strategyName = strategyConfigs[strategy].name;
        const prompt = `Analyze this options strategy: ${strategyName}. Params: ${JSON.stringify(form)}. Max Profit: ${data.maxProfit}, Max Loss: ${data.maxLoss}.`;
        try {
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            setAnalysis(result.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis.");
        } catch (error) {
            setAnalysis(`Error: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSimulateTrade = async () => {
        if (!data) return;
        const symbolKey = liveData?.symbol || Object.keys(SYMBOL_LOT_SIZES).find(key => key === symbol.toUpperCase()) || symbol;
        const tradePayload = translateFormToTrade(strategy, form, symbolKey);
        if (!tradePayload) return;
        try {
            await axios.post(`${BACKEND_URL}/api/paper-trade`, tradePayload);
            setShowTradePanel(true);
        } catch (err) {
            setError(err.response ? err.response.data.error : "Error submitting paper trade.");
        }
    };

    const formatValue = (value) => (typeof value === 'number') ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;

    // --- UI RENDER: Greeks Table ---
    const renderGreeksTable = () => {
        if (!liveData || !liveData.options) return null;
        const atmIndex = liveData.options.reduce((closestIdx, opt, idx, arr) => 
            Math.abs(opt.strike - liveData.spot) < Math.abs(arr[closestIdx].strike - liveData.spot) ? idx : closestIdx
        , 0);
       const subset = liveData.options.slice(Math.max(0, atmIndex - 10), Math.min(liveData.options.length, atmIndex + 11));

        return (
            <div className="mt-4 overflow-x-auto bg-white dark:bg-gray-800 p-4 rounded shadow">
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-2">Live Greeks Chain (Spot: {liveData.spot}, VIX: {liveData.vix})</h3>
                <table className="min-w-full text-xs text-center border dark:border-gray-600">
                    <thead className="bg-gray-200 dark:bg-gray-700">
                        <tr>
                            <th className="p-2">CE Delta</th><th className="p-2">CE Gamma</th><th className="p-2">CE Theta</th>
                            <th className="p-2 bg-yellow-100 dark:bg-yellow-900 font-bold">Strike</th>
                            <th className="p-2">PE Delta</th><th className="p-2">PE Gamma</th><th className="p-2">PE Theta</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subset.map(row => (
                            <tr key={row.strike} className={row.strike === liveData.options[atmIndex].strike ? "bg-blue-50 dark:bg-blue-900/30 font-bold" : "border-b dark:border-gray-700"}>
                                <td className="p-2 text-green-600">{row.CE_Greeks?.delta?.toFixed(2)}</td>
                                <td className="p-2">{row.CE_Greeks?.gamma?.toFixed(4)}</td>
                                <td className="p-2 text-red-500">{row.CE_Greeks?.theta?.toFixed(1)}</td>
                                <td className="p-2 font-bold">{row.strike}</td>
                                <td className="p-2 text-red-600">{row.PE_Greeks?.delta?.toFixed(2)}</td>
                                <td className="p-2">{row.PE_Greeks?.gamma?.toFixed(4)}</td>
                                <td className="p-2 text-red-500">{row.PE_Greeks?.theta?.toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const currentConfigKey = Object.keys(SYMBOL_LOT_SIZES).find(key => key === symbol.toUpperCase());

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans bg-gray-50 dark:bg-gray-900 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Algo Strategy Visualizer</h1>
                <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-2xl">{theme === 'light' ? '🌙' : '☀️'}</button>
            </div>

            <AlgoDashboard />

            {/* --- NEW DEPLOYMENT PANEL --- */}
            <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg mb-8 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-indigo-800 dark:text-indigo-300">Strategy Auto-Deployer</h2>
                        <p className="text-sm text-indigo-600 dark:text-indigo-400">Days To Expiry: {liveData?.daysToExpiry !== undefined ? liveData.daysToExpiry : 'N/A'}</p>
                    </div>
                    <div className="flex gap-3 mt-2 md:mt-0">
                         <select className="p-2 rounded border dark:bg-gray-700 dark:border-gray-600" onChange={(e) => setSignalStrength({...signalStrength, direction: e.target.value})}>
                            <option value="BULL">Signal: BULL</option>
                            <option value="BEAR">Signal: BEAR</option>
                            <option value="NEUTRAL">Signal: NEUTRAL</option>
                        </select>
                        <button onClick={toggleLiveMode} className={`px-4 py-2 rounded text-white font-medium ${isLiveMode ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                            {isLiveMode ? 'Stop Live Data' : 'Start Live Greeks'}
                        </button>
                        <button onClick={handleAutoDeploy} disabled={!isLiveMode} className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            🤖 Run Decision Engine
                        </button>
                    </div>
                </div>

                {decisionResult && (
                    <div className="p-4 bg-white dark:bg-gray-800 rounded border border-l-4 border-indigo-500 shadow-sm animate-fade-in">
                        <div className="flex justify-between items-center">
                            <span className={`font-bold px-2 py-1 rounded text-sm ${decisionResult.decision === 'PLACE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {decisionResult.decision}
                            </span>
                            <span className="text-sm text-gray-500">Score: {decisionResult.score || 0}</span>
                        </div>
                        {decisionResult.strategy && <p className="mt-2 text-lg font-semibold text-gray-800 dark:text-gray-100">Strategy: {decisionResult.strategy}</p>}
                        {decisionResult.meta && <p className="text-sm text-gray-600 dark:text-gray-400">{decisionResult.meta.description}</p>}
                        {decisionResult.decision === 'SKIP' && <p className="text-sm text-red-500 mt-1">Reason: {decisionResult.reason}</p>}
                    </div>
                )}
            </div>

            {/* --- GREEKS TABLE --- */}
            {isLiveMode && renderGreeksTable()}
            {liveDataError && <p className="text-red-500 text-sm mt-2">{liveDataError}</p>}


            {/* --- MANUAL BUILDER (Existing) --- */}
            <div className="mt-8 p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md mb-8">
                <div className="flex justify-between items-center mb-4 border-b dark:border-gray-600 pb-2">
                    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Manual Strategy Builder</h2>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">Live Mode: {isLiveMode ? 'ON' : 'OFF'}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Symbol</label>
                        <select value={symbol} onChange={handleSymbolChange} disabled={isLiveMode} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white">
                            {Object.entries(SYMBOL_LIST).map(([g, s]) => ( <optgroup key={g} label={g}>{s.map(x => <option key={x.symbol} value={x.symbol}>{x.name}</option>)}</optgroup> ))}
                        </select>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Strategy</label>
                        <select value={strategy} onChange={handleStrategyChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white">
                            {strategyGroups.map(group => ( <optgroup key={group.label} label={group.label}>{group.options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}</optgroup> ))}
                        </select>
                    </div>
                    
                    {strategy && strategyConfigs[strategy]?.fields.map(field => {
                        if (field === 'lotSize' && !currentConfigKey) return null;
                        if (!currentConfigKey && (field.startsWith('premium') || field.startsWith('strike') || field === 'stockPrice')) return null;
                        return (
                            <div key={field} className="col-span-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{formatLabel(field, strategy)}</label>
                                <input type="number" name={field} value={form[field] || ''} onChange={handleChange} 
                                    disabled={(isLiveMode && field.startsWith('premium'))}
                                    className={`w-full p-2 border rounded dark:bg-gray-700 dark:text-white ${isLiveMode && field.startsWith('premium') ? 'bg-gray-100' : ''}`} placeholder="0" />
                            </div>
                        )
                    })}

                    <div className="col-span-2 flex space-x-2">
                        <button onClick={handleSubmit} disabled={isLoading} className={`w-full px-4 py-2 rounded text-white font-semibold ${data ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {isLoading ? '...' : (data ? 'Recalculate' : 'Calculate')}
                        </button>
                        <button onClick={handleReset} className="w-full bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">Reset</button>
                    </div>
                </div>
            </div>

            {error && <div className="p-4 bg-red-100 text-red-700 border border-red-400 rounded-lg text-center mb-8">{error}</div>}

            {data && (
                <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl mb-8">
                    <div className="flex justify-between items-center mb-6 border-b pb-2">
                        <h2 className="text-xl font-semibold dark:text-gray-200">Results</h2>
                        <div className="flex space-x-2">
                            {currentConfigKey && <button onClick={handleSimulateTrade} className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">📈 Simulate Trade</button>}
                            <button onClick={handleAnalysis} disabled={isAnalyzing} className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">{isAnalyzing ? '...' : '✨ Analyze'}</button>
                        </div>
                    </div>
                    
                    {analysis && <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: analysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
                        <div className="p-3 bg-green-100 rounded"><p className="text-sm font-semibold text-green-800">Max Profit</p><p className="text-xl font-bold text-green-900">{formatValue(data.maxProfit)}</p></div>
                        <div className="p-3 bg-red-100 rounded"><p className="text-sm font-semibold text-red-800">Max Loss</p><p className="text-xl font-bold text-red-900">{formatValue(data.maxLoss)}</p></div>
                        <div className="p-3 bg-yellow-100 rounded"><p className="text-sm font-semibold text-yellow-800">Breakeven</p><p className="text-xl font-bold text-yellow-900">{data.breakeven}</p></div>
                        <div className="p-3 bg-blue-100 rounded"><p className="text-sm font-semibold text-blue-800">Total Lots</p><p className="text-xl font-bold text-blue-900">{form.lots || 0}</p></div>
                    </div>

                    {data.payoffCurve && (
                        <div className="h-96 w-full">
                            <ResponsiveContainer>
                                <LineChart data={data.payoffCurve}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="spot" tick={{ fill: '#888' }} />
                                    <YAxis tick={{ fill: '#888' }} />
                                    <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#fff' }} />
                                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                                    {isLiveMode && liveData && <ReferenceLine x={liveData.spot} stroke="#007bff" label="Spot" />}
                                    <Line type="monotone" dataKey="payoff" stroke="#8884d8" dot={false} strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {showTradePanel && <TradePanel />}
        </div>
    );
}

export default App;