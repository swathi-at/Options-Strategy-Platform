import React, { useState } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// CHANGED: Added 'lots' and 'lotSize' to the fields array for each strategy.
const strategyConfigs = {
  'long-call': { name: 'Long Call', fields: ['strike', 'premium', 'lots', 'lotSize'] },
  'long-put': { name: 'Long Put', fields: ['strike', 'premium', 'lots', 'lotSize'] },
  'bull-call-spread': { name: 'Bull Call Spread', fields: ['strike1', 'premium1', 'strike2', 'premium2', 'lots', 'lotSize'] }
};

const formatLabel = (fieldName) => {
  if (fieldName === 'lotSize') return 'Lot Size'; // Handle camelCase
  return fieldName.replace(/(\d+)/, ' $1').replace(/^\w/, c => c.toUpperCase());
};


function App() {
  const [strategy, setStrategy] = useState('long-call');
  const [form, setForm] = useState({});
  const [data, setData] = useState(null);

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value);
    setForm({});
    setData(null);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: Number(e.target.value) });
  };

  const handleSubmit = async () => {
    try {
      // CHANGED: Removed hardcoded lots and lotSize. They are now in the 'form' object.
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
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">Options Strategy Visualizer</h1>

      <div className="flex flex-wrap items-end justify-center gap-4 mb-6 p-4 bg-gray-100 rounded-lg shadow-md">
        
        <div>
          <label htmlFor="strategy" className="block text-sm font-medium text-gray-700">Strategy</label>
          <select
            id="strategy"
            name="strategy"
            value={strategy}
            onChange={handleStrategyChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {Object.keys(strategyConfigs).map(key => (
              <option key={key} value={key}>{strategyConfigs[key].name}</option>
            ))}
          </select>
        </div>

        {strategyConfigs[strategy].fields.map(field => (
          <div key={field}>
            <label htmlFor={field} className="block text-sm font-medium text-gray-700">{formatLabel(field)}</label>
            <input
              type="number"
              id={field}
              name={field}
              value={form[field] || ''}
              onChange={handleChange}
              className="mt-1 p-2 border rounded-md w-32"
            />
          </div>
        ))}
        
        <button onClick={handleSubmit} className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition">
          Calculate
        </button>
      </div>

      {/* Output and Chart */}
      {data && (
        <div className="mt-8 p-6 bg-white rounded-lg shadow-md">
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
              <p className="text-sm text-blue-800 font-semibold">Lot Size</p>
              <p className="text-xl text-blue-900 font-bold">{form.lotSize}</p>
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