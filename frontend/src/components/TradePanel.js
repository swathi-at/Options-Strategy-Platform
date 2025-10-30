import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// -----------------------------------------------------------------
// A HELPER HOOK FOR POLLING
// We need this to cleanly call our fetch function every 5 seconds
// without causing memory leaks.
// -----------------------------------------------------------------
function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}
// -----------------------------------------------------------------


const TradePanel = () => {
  // This state will hold our arrays of open and closed trades
  const [trades, setTrades] = useState({ openTrades: [], closedTrades: [] });
  const [error, setError] = useState(null);

  // This is the function that talks to your backend
  const fetchTrades = async () => {
    try {
      // Make sure this URL matches your running backend
      const res = await axios.get('http://localhost:5000/api/paper-trades');
      setTrades(res.data);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error("Failed to fetch paper trades:", err);
      setError('Could not fetch trade data. Is the server running?');
    }
  };

  // 1. Fetch trades ONCE when the component first mounts
  useEffect(() => {
    fetchTrades();
  }, []); // The empty array [] means "run this only once"

  // 2. Poll for new data every 5 seconds (to match your backend simulator)
  // This is what makes the P&L update live
  useInterval(fetchTrades, 5000);

  // Helper to format P&L
  const formatPnl = (pnl) => {
    const value = pnl.toFixed(2);
    const color = pnl > 0 ? 'text-green-600 dark:text-green-500' : pnl < 0 ? 'text-red-600 dark:text-red-500' : 'text-gray-700 dark:text-gray-300';
    return <span className={`font-bold ${color}`}>{value}</span>;
  };

  return (
    <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl animate-fade-in border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b dark:border-gray-600 pb-2">
        Virtual Trade Panel
      </h2>
      
      {error && <div className="text-red-500 text-center p-4">{error}</div>}

      {/* --- OPEN TRADES TABLE --- */}
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Open Positions</h3>
      <div className="overflow-x-auto mb-6">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Strategy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entry Net</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Current P&L</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {trades.openTrades.length > 0 ? (
              trades.openTrades.map(trade => (
                <tr key={trade.tradeId}>
                  <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200">{trade.strategyType}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{trade.symbol}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{trade.netEntryCost.toFixed(2)}</td>
                  <td className="px-4 py-4 text-sm">{formatPnl(trade.currentNetPnl)}</td>
                  <td className="px-4 py-4 text-sm font-medium text-yellow-600 dark:text-yellow-500">{trade.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">No open virtual trades.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- CLOSED TRADES TABLE --- */}
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Closed Positions</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Strategy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Final P&L</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Exit Reason</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {trades.closedTrades.length > 0 ? (
              trades.closedTrades.map(trade => (
                <tr key={trade.tradeId}>
                  <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200">{trade.strategyType}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{trade.symbol}</td>
                  <td className="px-4 py-4 text-sm">{formatPnl(trade.currentNetPnl)}</td>
                  <td className="px-4 py-4 text-sm font-medium text-blue-600 dark:text-blue-500">{trade.exitReason}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">No closed virtual trades.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default TradePanel;