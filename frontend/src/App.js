import React, { useState } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// NEW: Data is now structured in groups for the dropdown menu
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
      { value: 'long-strangle', name: 'Long Strangle', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] },
      { value: 'iron-condor', name: 'Iron Condor', fields: ['strike1', 'strike2', 'strike3', 'strike4', 'netPremium', 'lots', 'lotSize'] },
      { value: 'iron-butterfly', name: 'Iron Butterfly', fields: ['strike1', 'strike2', 'strike3', 'netPremium', 'lots', 'lotSize'] },
      { value: 'call-butterfly', name: 'Call Butterfly', fields: ['strike1', 'strike2', 'strike3', 'netPremium', 'lots', 'lotSize'] },
      { value: 'calendar-spread', name: 'Calendar Spread', fields: ['strike', 'premium1', 'premium2', 'lots', 'lotSize'] },
    ]
  },
  {
    label: "Other Strategies",
    options: [
      { value: 'short-call', name: 'Short Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
      { value: 'protective-put', name: 'Protective Put', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
      { value: 'protective-call', name: 'Protective Call', fields: ['stockPrice', 'strike', 'premium', 'lots', 'lotSize'] },
      { value: 'synthetic-long-stock', name: 'Synthetic Long Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
      { value: 'synthetic-short-stock', name: 'Synthetic Short Stock', fields: ['strike', 'premium', 'premium2', 'lots', 'lotSize'] },
    ]
  }
];

// This creates a flat map for easy lookup, so the rest of the code doesn't need to change
const strategyConfigs = strategyGroups.flatMap(group => group.options).reduce((acc, option) => {
    acc[option.value] = { name: option.name, fields: option.fields };
    return acc;
}, {});

const formatLabel = (fieldName) => {
    const labels = {
        lotSize: 'Lot Size',
        stockPrice: 'Stock Price',
        premium: 'Premium',
        premium1: 'Premium 1 (Call/Put)',
        premium2: 'Premium 2 (Call/Put)',
        strike1: 'Strike 1',
        strike2: 'Strike 2',
        strike3: 'Strike 3',
        strike4: 'Strike 4',
        netPremium: 'Net Premium',
    };
    return labels[fieldName] || fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};

function App() {
  const [strategy, setStrategy] = useState('long-call');
  const [form, setForm] = useState({ lots: 1, lotSize: 50 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value);
    setForm({ lots: 1, lotSize: 50 });
    setData(null);
    setError(null);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: Number(e.target.value) });
  };

  const handleSubmit = async () => {
    setData(null);
    setError(null);
    try {
      const payload = { strategy, ...form };
      const res = await axios.post('http://localhost:5000/calculate', payload);
      setData(res.data);
    } catch (err) {
      setError(err.response ? err.response.data.error : "An error occurred.");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Options Strategy Visualizer</h1>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Strategy Parameters</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-2">
            <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
            {/* UPDATED: The select element now uses optgroup for categorization */}
            <select
              id="strategy" name="strategy" value={strategy} onChange={handleStrategyChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            >
              {strategyGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {strategyConfigs[strategy].fields.map(field => (
            <div key={field} className="col-span-1">
              <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">{formatLabel(field)}</label>
              <input
                type="number" id={field} name={field} value={form[field] || ''} onChange={handleChange}
                className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="0"
              />
            </div>
          ))}
          
          <div className="col-span-2 md:col-span-4 lg:col-span-2 flex items-end">
            <button 
              onClick={handleSubmit} 
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 font-semibold"
            >
              Calculate
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
        <div className="mt-8 p-6 bg-white rounded-lg shadow-xl animate-fade-in">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
             <div className="p-4 bg-green-100 rounded">
               <p className="text-sm text-green-800 font-semibold">Max Profit</p>
               <p className="text-xl text-green-900 font-bold">{data.maxProfit}</p>
             </div>
             <div className="p-4 bg-red-100 rounded">
               <p className="text-sm text-red-800 font-semibold">Max Loss</p>
               <p className="text-xl text-red-900 font-bold">{data.maxLoss}</p>
             </div>
             <div className="p-4 bg-yellow-100 rounded">
               <p className="text-sm text-yellow-800 font-semibold">Breakeven</p>
               <p className="text-xl text-yellow-900 font-bold">{data.breakeven}</p>
             </div>
             <div className="p-4 bg-blue-100 rounded">
               <p className="text-sm text-blue-800 font-semibold">Total Lots</p>
               <p className="text-xl text-blue-900 font-bold">{form.lots || 0}</p>
             </div>
           </div>
          
           <div className="flex justify-center">
             <LineChart width={600} height={300} data={data.payoffCurve}>
               <CartesianGrid strokeDasharray="3 3" />
               <XAxis dataKey="spot" name="Spot Price" />
               <YAxis />
               <Tooltip />
               <Line type="monotone" dataKey="payoff" stroke="#8884d8" strokeWidth={2} dot={false} />
             </LineChart>
           </div>
         </div>
      )}
    </div>
  );
}

export default App;