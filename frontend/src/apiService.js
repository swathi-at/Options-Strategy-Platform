import axios from 'axios';

// NOTE: Ensure your backend server is actually running on http://localhost:3001
const apiClient = axios.create({
    // Changed baseURL to match the /calculate endpoint structure
    // Since your backend endpoint is /calculate, we set the base to the root of the API
    baseURL: 'http://localhost:3000', 
    headers: {
        'Content-Type': 'application/json',
    },
});

// Original function for generic strategy calculation
export const calculateStrategy = (data) => {
    // This function sends the data to the POST /calculate endpoint
    return apiClient.post('/calculate', data);
};


/**
 * NEW FUNCTION: Calculates the Payoff for a Long Strangle strategy.
 * Uses the existing calculateStrategy function but structures the data 
 * with the required 'long-strangle' strategy flag.
 */
export const calculateLongStrangle = async (params) => {
    // The backend uses a single /calculate endpoint and determines the 
    // function to call based on the 'strategy' field.
    const requestData = {
        strategy: 'long-strangle', // CRITICAL: This matches the case in server.js
        ...params // Contains: callStrike, putStrike, callPremium, putPremium, lots, lotSize, etc.
    };
    
    // Use the existing generic calculation function
    const response = await calculateStrategy(requestData);
    
    // Return the data part of the response for easy use in App.js
    return response.data; 
};