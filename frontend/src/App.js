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
  'short-call': { name: 'Short Call', fields: ['strike', 'premium', 'lots', 'lotSize'] }
};

/**
 * Formats a camelCase field name into a human-readable label.
 */
const formatLabel = (fieldName) => {
  if (fieldName === 'lotSize') return 'Lot Size';
  if (fieldName === 'stockPrice') return 'Stock Price';
  if (fieldName === 'premium') return 'Premium 1';
  if (fieldName === 'premium2') return 'Premium 2';
  return fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};

function App() {
  const [strategy, setStrategy] = useState('long-call');
  const [form, setForm] = useState({ lots: 1, lotSize: 50 }); // Set some defaults
  const [data, setData] = useState(null);

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value);
    // Reset form but keep defaults
    setForm({ lots: 1, lotSize: 50 });
    setData(null);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: Number(e.target.value) });
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        strategy: strategy,
        ...form,
      };
      const res = await axios.post('http://localhost:5000/calculate', payload);
      setData(res.data);
    } catch (error) {
      console.error("Error fetching calculation:", error);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Options Strategy Visualizer</h1>

      {/* CHANGED: Replaced the old form container with a new grid-based layout */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Strategy Parameters</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
          
          {/* Strategy Selector */}
          <div className="col-span-2 md:col-span-2 lg:col-span-2">
            <label htmlFor="strategy" className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
            <select
              id="strategy"
              name="strategy"
              value={strategy}
              onChange={handleStrategyChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            >
              {Object.keys(strategyConfigs).map(key => (
                <option key={key} value={key}>{strategyConfigs[key].name}</option>
              ))}
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
                className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="0"
              />
            </div>
          ))}
          
          {/* Calculate Button */}
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


      {/* Output and Chart */}
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