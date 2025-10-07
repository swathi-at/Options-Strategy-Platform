import React, { useState } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// Configuration for all strategies with their required fields.
const strategyConfigs = {
    // Bullish Strategies
    'long-call': { name: 'Long Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
    'bull-call-spread': { name: 'Bull Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    'bull-put-spread': { name: 'Bull Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    'synthetic-long-stock': { name: 'Synthetic Long Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
    'protective-put': { name: 'Protective Put', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
    // Bearish Strategies
    'long-put': { name: 'Long Put', fields: ['strike', 'premium', 'lots', 'lotSize'] },
    'bear-put-spread': { name: 'Bear Put Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    'bear-call-spread': { name: 'Bear Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
    'synthetic-short-stock': { name: 'Synthetic Short Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
    'protective-call': { name: 'Protective Call', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
    // Other
    'short-call': { name: 'Short Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
    
    // NEUTRAL STRATEGIES
    'long-straddle': { 
        name: 'Long Straddle', 
        fields: ['strike', 'callPremium', 'putPremium', 'lots', 'lotSize'] 
    },
    'long-strangle': { 
        name: 'Long Strangle', 
        fields: ['putStrike', 'putPremium', 'callStrike', 'callPremium', 'lots', 'lotSize'] 
    },
    'iron-condor': {
        name: 'Iron Condor',
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'strike4', 'premium4', 'lots', 'lotSize'] 
    },
    'iron-butterfly': {
        name: 'Iron Butterfly',
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize']
    },
    'call-butterfly-spread': {
        name: 'Call Butterfly Spread',
        fields: ['strike1', 'premium1', 'strike2', 'premium2', 'strike3', 'premium3', 'lots', 'lotSize']
    },
    'calendar-spread': {
        name: 'Calendar Spread',
        fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize']
    }
};

/**
 * Formats a camelCase field name into a human-readable label.
 */
const formatLabel = (fieldName) => {
    if (fieldName === 'lotSize') return 'Lot Size';
    if (fieldName === 'stockPrice') return 'Stock Price';
    
    // Handle premiums and strikes for multi-leg strategies
    if (fieldName.startsWith('premium')) {
        return `Premium ${fieldName.replace('premium', '') || '1'}`;
    }
    if (fieldName.startsWith('strike')) {
        return `Strike ${fieldName.replace('strike', '') || '1'}`;
    }
    if (fieldName === 'callPremium') return 'Call Premium';
    if (fieldName === 'putPremium') return 'Put Premium';
    if (fieldName === 'callStrike') return 'Call Strike (Higher)';
    if (fieldName === 'putStrike') return 'Put Strike (Lower)';

    // Custom labels for complex spreads
    if (fieldName === 'strike1') return 'Strike 1 (Lowest)';
    if (fieldName === 'strike2') return 'Strike 2 (Middle)';
    if (fieldName === 'strike3') return 'Strike 3 (Highest)';
    if (fieldName === 'strike4') return 'Strike 4 (Outer)';

    // Calendar Spread specific labels
    if (fieldName === 'premium1') return 'Long Option Premium';
    if (fieldName === 'premium2') return 'Short Option Premium';
    
    // Generic formatting for others
    return fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};

function App() {
    const [strategy, setStrategy] = useState('long-call');
    const [form, setForm] = useState({ 
        lots: 1, 
        lotSize: 50, 
        strike: 100, 
        premium: 5,
        putStrike: 90, 
        callStrike: 110, 
        putPremium: 2,   
        callPremium: 2,  
        // Defaults for Condor/Butterfly 
        strike1: 90, premium1: 1, 
        strike2: 95, premium2: 3, 
        strike3: 105, premium3: 3, 
        strike4: 110, premium4: 1, 
    }); 
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleStrategyChange = (e) => {
        setStrategy(e.target.value);
        setForm(prev => ({ 
            ...prev, 
            lots: prev.lots || 1, 
            lotSize: prev.lotSize || 50 
        }));
        setData(null);
    };

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: Number(e.target.value) });
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                strategy: strategy,
                ...form, 
            };
            
            const BACKEND_URL = 'http://localhost:5000/calculate'; 
            
            // Check if one of the strike fields required by the backend's spot price generator is present
            if (!form.strike && !form.strike1 && !form.strike2 && !form.stockPrice && !form.putStrike) {
                console.error("Missing required strike/price for spot range generation.");
                alert("Please fill in a required Strike or Stock Price value.");
                setLoading(false);
                return;
            }

            const res = await axios.post(BACKEND_URL, payload);
            
            let resultData = res.data;
            
            // FIX: Overrides theoretical max profit with the actual max profit shown on the graph 
            if (strategy === 'long-put' || strategy === 'long-call') {
                 if (resultData.payoffCurve && resultData.payoffCurve.length > 0) {
                     const actualMaxProfit = resultData.payoffCurve.reduce((max, point) => Math.max(max, point.payoff), -Infinity);
                     
                     if (isFinite(actualMaxProfit) && resultData.maxProfit === 'Unlimited') {
                         resultData = { ...resultData, maxProfit: actualMaxProfit };
                     }
                 }
            }

            setData(resultData);
            
        } catch (error) {
            console.error("Error fetching calculation:", error);
            alert("Error calculating. Check console and ensure backend is running!");
        } finally {
            setLoading(false);
        }
    };

    const formatBreakeven = (breakeven) => {
        if (Array.isArray(breakeven)) {
            const [lower, upper] = breakeven.map(b => b.toFixed(2));
            return `Lower: ${lower}, Upper: ${upper}`;
        }
        if (typeof breakeven === 'number') {
            return breakeven.toFixed(2);
        }
        return breakeven; 
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
            <script src="https://cdn.tailwindcss.com"></script>
            <h1 className="text-3xl font-extrabold mb-6 text-center text-gray-900 border-b-4 border-blue-600 pb-2">
                Options Strategy Payoff Visualizer
            </h1>

            {/* Strategy Parameters Input Card */}
            <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-2xl mb-8">
                <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Strategy Parameters</h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
                    
                    {/* Strategy Selector */}
                    <div className="col-span-2 md:col-span-2 lg:col-span-2">
                        <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 mb-1">Select Strategy</label>
                        <select
                            id="strategy"
                            name="strategy"
                            value={strategy}
                            onChange={handleStrategyChange}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg shadow-md transition duration-150 ease-in-out"
                        >
                            {/* Group strategies (optional, but good for UX) */}
                            <optgroup label="Neutral Strategies">
                                <option value="long-straddle">{strategyConfigs['long-straddle'].name}</option>
                                <option value="long-strangle">{strategyConfigs['long-strangle'].name}</option>
                                <option value="iron-condor">{strategyConfigs['iron-condor'].name}</option> 
                                <option value="iron-butterfly">{strategyConfigs['iron-butterfly'].name}</option>
                                <option value="call-butterfly-spread">{strategyConfigs['call-butterfly-spread'].name}</option>
                                <option value="calendar-spread">{strategyConfigs['calendar-spread'].name}</option>
                            </optgroup>
                            <optgroup label="Bullish Strategies">
                                {Object.keys(strategyConfigs).filter(key => ['long-call', 'bull-call-spread', 'bull-put-spread', 'synthetic-long-stock', 'protective-put'].includes(key)).map(key => (
                                    <option key={key} value={key}>{strategyConfigs[key].name}</option>
                                ))}
                            </optgroup>
                             <optgroup label="Bearish Strategies">
                                {Object.keys(strategyConfigs).filter(key => ['long-put', 'bear-put-spread', 'bear-call-spread', 'synthetic-short-stock', 'protective-call', 'short-call'].includes(key)).map(key => (
                                    <option key={key} value={key}>{strategyConfigs[key].name}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    {/* Dynamic Input Fields */}
                    {strategyConfigs[strategy].fields.map(field => (
                        <div key={field} className="col-span-1">
                            <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">{formatLabel(field)}</label>
                            <input
                                type="number"
                                id={field}
                                name={field}
                                value={form[field] || ''}
                                onChange={handleChange}
                                className="mt-1 p-2 block w-full border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                                placeholder="0"
                            />
                        </div>
                    ))}
                    
                    {/* Calculate Button */}
                    <div className="col-span-2 md:col-span-4 lg:col-span-2 flex items-end">
                        <button 
                            onClick={handleSubmit} 
                            disabled={loading}
                            className={`w-full px-4 py-2 rounded-lg shadow-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                loading 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                            } transition duration-150 ease-in-out`}
                        >
                            {loading ? 'Calculating...' : 'Calculate Payoff'}
                        </button>
                    </div>
                </div>
            </div>


            {/* Output and Chart */}
            {data && (
                <div className="mt-8 p-6 bg-white rounded-xl shadow-2xl animate-fade-in">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Results</h2>
                    
                    {/* Metrics Display */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-center">
                        <div className="p-4 bg-green-100 rounded-lg shadow-inner">
                            <p className="text-sm text-green-800 font-bold">Max Profit</p>
                            <p className="text-2xl text-green-900 font-extrabold">{data.maxProfit.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-red-100 rounded-lg shadow-inner">
                            <p className="text-sm text-red-800 font-bold">Max Loss</p>
                            <p className="text-2xl text-red-900 font-extrabold">{data.maxLoss.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-yellow-100 rounded-lg shadow-inner col-span-2">
                            <p className="text-sm text-yellow-800 font-bold">Breakeven Point(s)</p>
                            <p className="text-2xl text-yellow-900 font-extrabold">{formatBreakeven(data.breakeven)}</p>
                        </div>
                    </div>
                    
                    {/* Payoff Chart */}
                    <div className="flex justify-center w-full">
                        {/* Added margin to give axis labels more room */}
                        <LineChart width={900} height={400} data={data.payoffCurve} className="shadow-lg p-2 rounded-lg bg-gray-50"
                           margin={{ top: 5, right: 30, left: 20, bottom: 40 }} 
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                            <XAxis 
                                dataKey="spot" 
                                name="Spot Price" 
                                label={{ value: 'Spot Price at Expiry', position: 'bottom', offset: 0 }}
                                type="number"
                                domain={['auto', 'auto']}
                                // --- FIX: Reliable straight display settings ---
                                tick={{ angle: 0, textAnchor: 'middle', fontSize: 12 }} // NO ROTATION (straight up)
                                interval="preserveStartEnd" 
                                tickFormatter={(tick) => tick.toFixed(0)}
                                height={60} 
                                tickCount={10} 
                                // --- END OF FIX ---
                            />
                            <YAxis 
                                label={{ value: 'Profit / Loss', angle: -90, position: 'left' }} 
                                tickFormatter={(tick) => tick.toLocaleString()}
                            />
                            <Tooltip 
                                formatter={(value) => [`P/L: ${value.toFixed(2)}`, `Spot Price: ${data.payoffCurve.find(d => d.payoff === value)?.spot || 'N/A'}`]}
                            />
                            {/* Zero Line */}
                            <Line dataKey="payoff" stroke="#4F46E5" strokeWidth={3} dot={false} name="P/L" />
                            <Line dataKey="zeroLine" stroke="#000000" strokeWidth={1} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </div>
                </div>
            )}
            
            <style>
                {`
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                `}
            </style>
        </div>
    );
}

export default App;
