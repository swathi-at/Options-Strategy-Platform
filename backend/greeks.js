// greeks.js - Robust Black-Scholes Model

function normalcdf(X) {
    if (typeof X !== 'number' || isNaN(X)) return 0;
    // Standard Normal CDF (Hastings approximation)
    var T = 1 / (1 + 0.2316419 * Math.abs(X));
    var D = 0.39894228 * Math.exp(-X * X / 2);
    var Prob = D * T * (0.31938153 + T * (-0.356563782 + T * (1.781477937 + T * (-1.821255978 + T * 1.330274429))));
    if (X > 0) Prob = 1 - Prob;
    return Prob;
}

function pdf(x) {
    if (typeof x !== 'number' || isNaN(x)) return 0;
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function calculateGreeks(s, k, t, v, r, type) {
    // 1. Force Numbers
    s = parseFloat(s);
    k = parseFloat(k);
    t = parseFloat(t);
    v = parseFloat(v);

    // 2. Safety Defaults
    if (!s || !k) return { delta: 0, theta: 0, gamma: 0, vega: 0, iv: 0 };
    if (t <= 0.002) t = 0.002; // Minimum ~1 day to prevent 0/Infinity errors
    if (v <= 0) v = 0.15;      // Default vol if missing

    try {
        const d1 = (Math.log(s / k) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
        const d2 = d1 - v * Math.sqrt(t);

        let delta, theta;
        const gamma = pdf(d1) / (s * v * Math.sqrt(t));
        const vega = (s * pdf(d1) * Math.sqrt(t)) / 100;

        if (type === 'CE') {
            delta = normalcdf(d1);
            theta = (- (s * pdf(d1) * v) / (2 * Math.sqrt(t)) - r * k * Math.exp(-r * t) * normalcdf(d2)) / 365;
        } else {
            delta = normalcdf(d1) - 1;
            theta = (- (s * pdf(d1) * v) / (2 * Math.sqrt(t)) + r * k * Math.exp(-r * t) * normalcdf(-d2)) / 365;
        }

        return { 
            delta: isNaN(delta) ? 0 : delta, 
            theta: isNaN(theta) ? 0 : theta, 
            gamma: isNaN(gamma) ? 0 : gamma, 
            vega: isNaN(vega) ? 0 : vega, 
            iv: v * 100 
        };
    } catch (e) {
        return { delta: 0, theta: 0, gamma: 0, vega: 0, iv: 0 };
    }
}

function estimateGreeks(spot, strike, daysToExpiry, premium, type, vix) {
    // Ensure daysToExpiry is at least 1 for the visualizer to show data
    const days = (daysToExpiry && daysToExpiry > 0.5) ? daysToExpiry : 1; 
    const t = days / 365; 
    const r = 0.10; 
    const iv = (vix || 15) / 100;
    return calculateGreeks(spot, strike, t, iv, r, type);
}

module.exports = { calculateGreeks, estimateGreeks };