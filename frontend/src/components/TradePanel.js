import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000';

// Helper function to format P&L
const formatPnl = (pnl) => {
    const pnlNum = Number(pnl);
    if (isNaN(pnlNum)) return pnl;
    
    const color = pnlNum > 0 ? 'text-green-500' : (pnlNum < 0 ? 'text-red-500' : 'text-gray-500');
    return <span className={color}>{pnlNum.toFixed(2)}</span>;
};

// Helper function to format timestamps
const formatTimestamp = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

function TradePanel() {
    const [openTrades, setOpenTrades] = useState([]);
    const [closedTrades, setClosedTrades] = useState([]);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Function to fetch trades
    const fetchTrades = async () => {
        try {
            // We don't set loading to true here to avoid flashing on interval
            const res = await axios.get(`${BACKEND_URL}/api/paper-trades`);
            setOpenTrades(res.data.openTrades || []);
            setClosedTrades(res.data.closedTrades || []);
            setError(null);
        } catch (err) {
            setError('Failed to fetch paper trades. Is the backend running?');
            console.error(err);
        } finally {
            setIsLoading(false); // Only set loading false on first load
        }
    };

    // Fetch trades on component mount and then set up an interval
    useEffect(() => {
        fetchTrades(); // Initial fetch
        const intervalId = setInterval(fetchTrades, 5000); // Refresh every 5 seconds

        // Clear interval on component unmount
        return () => clearInterval(intervalId);
    }, []);

    if (isLoading) {
        return <div className="text-center p-4 dark:text-gray-300">Loading Trades...</div>;
    }

    if (error) {
        return <div className="text-center p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl animate-fade-in">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Paper Trade Panel</h2>
            
            {/* --- OPEN TRADES --- */}
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">Open Positions ({openTrades.length})</h3>
            <div className="overflow-x-auto mb-6">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Strategy</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Symbol</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Legs</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entry Time</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Current P&L</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {openTrades.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">No open paper trades.</td>
                            </tr>
                        ) : (
                            openTrades.map(trade => (
                                <tr key={trade.tradeId}>
                                    <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200 whitespace-nowrap">{trade.strategyType}</td>
                                    <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200 whitespace-nowrap">{trade.symbol}</td>
                                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {trade.legs.map((leg, i) => (
                                            <div key={i} className="whitespace-nowrap">{`${leg.action} ${leg.qty} @ ${leg.strike} ${leg.optionType}`}</div>
                                        ))}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTimestamp(trade.entryTimestamp)}</td>
                                    <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">{formatPnl(trade.currentNetPnl)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* --- CLOSED TRADES --- */}
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">Closed Positions ({closedTrades.length})</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Strategy</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Symbol</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Exit Time</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Reason</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Final P&L</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                         {closedTrades.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">No closed paper trades.</td>
                            </tr>
                        ) : (
                            closedTrades.map(trade => (
                                <tr key={trade.tradeId}>
                                    <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200 whitespace-nowrap">{trade.strategyType}</td>
                                    <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-200 whitespace-nowrap">{trade.symbol}</td>
                                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTimestamp(trade.exitTimestamp)}</td>
                                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{trade.exitReason}</td>
                                    <td className="px-4 py-4 text-sm font-medium whitespace-nowrap">{formatPnl(trade.currentNetPnl)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default TradePanel;