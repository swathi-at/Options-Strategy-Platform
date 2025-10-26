import React from 'react';

// Dummy data expanded to include all strategies for a full-featured demo.
const dummyTrades = [
  // Bullish
  { id: 1, strategy: 'Long Call', entry: 100.00, current: 125.50, pnl: 1275.00, status: 'OPEN' },
  { id: 2, strategy: 'Bull Call Spread', entry: 50.00, current: 65.20, pnl: 760.00, status: 'OPEN' },
  { id: 3, strategy: 'Bull Put Spread', entry: 40.00, current: 30.10, pnl: 495.00, status: 'OPEN' },
  // Bearish
  { id: 4, strategy: 'Long Put', entry: 110.00, current: 95.80, pnl: -710.00, status: 'OPEN' },
  { id: 5, strategy: 'Bear Put Spread', entry: 40.00, current: 55.50, pnl: 775.00, status: 'CLOSED' },
  { id: 6, strategy: 'Bear Call Spread', entry: 50.00, current: 61.25, pnl: -562.50, status: 'OPEN' },
  // Neutral
  { id: 7, strategy: 'Long Straddle', entry: 245.00, current: 280.15, pnl: 1757.50, status: 'OPEN' },
  { id: 8, strategy: 'Short Straddle', entry: 245.00, current: 250.00, pnl: -250.00, status: 'OPEN' },
  { id: 9, strategy: 'Long Strangle', entry: 210.00, current: 190.40, pnl: -980.00, status: 'OPEN' },
  { id: 10, strategy: 'Short Strangle', entry: 210.00, current: 205.00, pnl: 250.00, status: 'CLOSED' },
  { id: 11, strategy: 'Iron Condor', entry: 30.00, current: 25.00, pnl: 250.00, status: 'OPEN' },
  { id: 12, strategy: 'Iron Butterfly', entry: 70.00, current: 85.00, pnl: -750.00, status: 'OPEN' },
  { id: 13, strategy: 'Call Butterfly', entry: 20.00, current: 15.00, pnl: -250.00, status: 'OPEN' },
  { id: 14, strategy: 'Calendar Spread', entry: 130.00, current: 135.00, pnl: 250.00, status: 'OPEN' },
  // Other
  { id: 15, strategy: 'Short Call', entry: 60.00, current: 45.00, pnl: 750.00, status: 'OPEN' },
  { id: 16, strategy: 'Short Put', entry: 75.00, current: 90.00, pnl: -750.00, status: 'OPEN' },
  { id: 17, strategy: 'Protective Put', entry: 23550.00, current: 23600.00, pnl: 2500.00, status: 'OPEN' },
  { id: 18, strategy: 'Covered Call', entry: 23450.00, current: 23500.00, pnl: 2500.00, status: 'OPEN' },
  // Synthetics
  { id: 19, strategy: 'Synthetic Long Stock', entry: 23505.00, current: 23600.00, pnl: 4750.00, status: 'OPEN' },
  { id: 20, strategy: 'Synthetic Short Stock', entry: 23505.00, current: 23400.00, pnl: 5250.00, status: 'CLOSED' },
];

const TradePanel = () => {
  return (
    <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl animate-fade-in">
      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b dark:border-gray-600 pb-2">
        Paper Trading Log
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Strategy</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Entry Price</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Price</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P&L</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {dummyTrades.map((trade) => (
              <tr key={trade.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{trade.strategy}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{trade.entry.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{trade.current.toFixed(2)}</td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {trade.pnl.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${trade.status === 'OPEN' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200'}`}>
                    {trade.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradePanel;