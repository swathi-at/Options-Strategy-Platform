import React, { useState, useEffect } from 'react';

// This is the WebSocket port we defined in server.js
const WS_URL = 'ws://localhost:8080';

function AlgoDashboard() {
    const [messages, setMessages] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('Connecting...');

    useEffect(() => {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('UI Dashboard connected to ws://localhost:8080');
            setConnectionStatus('Connected');
            setMessages(prev => [{
                type: 'CONNECT',
                message: 'Dashboard connected to bot server.'
            }, ...prev]);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Add the new message to the top of the list
                setMessages(prev => [data, ...prev]);
            } catch (error) {
                console.error("Failed to parse WebSocket message:", event.data);
            }
        };

        ws.onclose = () => {
            console.log('UI Dashboard disconnected.');
            setConnectionStatus('Disconnected');
        };

        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            setConnectionStatus('Error');
        };

        // Cleanup function to close the connection when the component unmounts
        return () => {
            ws.close();
        };
    }, []); // Empty array ensures this runs only once on mount

    // Helper to get color based on message type
    const getMessageColor = (type) => {
        switch(type) {
            case 'SIGNAL':
            case 'TRADE_OPEN':
                return 'text-green-400';
            case 'TRADE_CLOSE':
                return 'text-blue-400';
            case 'ERROR':
                return 'text-red-400';
            case 'PNL_UPDATE':
                return 'text-gray-400';
            case 'CANDLE':
                return 'text-yellow-400';
            default:
                return 'text-gray-300';
        }
    };

    return (
        <div className="mt-8 p-6 bg-gray-900 border border-gray-700 rounded-lg shadow-xl animate-fade-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-100">Algo Bot Live Feed</h2>
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                        connectionStatus === 'Connected' ? 'bg-green-500' :
                        connectionStatus === 'Connecting...' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-sm text-gray-400">{connectionStatus}</span>
                </div>
            </div>
            
            <div className="font-mono text-sm bg-black rounded-md p-4 h-64 overflow-y-auto">
                {messages.length === 0 && (
                    <p className="text-gray-500">Waiting for bot messages... (Try logging in via /api/fyers/login)</p>
                )}
                {messages.map((msg, index) => (
                    <p key={index} className={`whitespace-pre-wrap ${getMessageColor(msg.type)}`}>
                        <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {msg.message}
                    </p>
                ))}
            </div>
        </div>
    );
}

export default AlgoDashboard;