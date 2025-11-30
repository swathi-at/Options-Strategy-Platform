tt# Options Strategy Payoff API

This backend server provides a single endpoint to calculate the payoff curve, max profit/loss, and breakeven points for various options trading strategies.

---

### API Endpoint

A single, unified route handles all strategy calculations.

- **URL:** `/calculate`
- **Method:** `POST`
- **Success Response:** `200 OK`
- **Error Response:** `400 Bad Request`

---

### Request & Output Structure

#### **Request Body**

The API expects a JSON object with the strategy name and its specific parameters.

- `strategy`: (string) The unique identifier for the strategy (e.g., "bull-call-spread").
- `...params`: (number) The required parameters for that strategy (e.g., `strike`, `premium`, `lots`, `lotSize`).

#### **Output Structure**

The API returns a JSON object containing the calculated results.

```json
{
  "payoffCurve": [ { "spot": 23400, "payoff": -2500 }, ... ],
  "maxProfit": 2500,
  "maxLoss": -2500,
  "breakeven": "23550.00",
  "maxProfitPercentage": 100.00,
  "maxLossPercentage": -100.00
}

trategy Input Formats
Below are the required JSON input parameters for each supported strategy. The lots and lotSize parameters are required for all strategies.

Single-Leg Strategies
Long Call: {"strategy": "long-call", "strike": 23600, "premium": 100, ...}

Long Put: {"strategy": "long-put", "strike": 23400, "premium": 110, ...}

Short Call: {"strategy": "short-call", "strike": 23700, "premium": 60, ...}

Short Put: {"strategy": "short-put", "strike": 23300, "premium": 75, ...}

Spread Strategies
Bull Call Spread: {"strategy": "bull-call-spread", "strike1": 23500, "premium1": 150, "strike2": 23600, "premium2": 100, ...}

Bull Put Spread: {"strategy": "bull-put-spread", "strike1": 23500, "premium1": 150, "strike2": 23400, "premium2": 110, ...}

Bear Call Spread: {"strategy": "bear-call-spread", "strike1": 23500, "premium1": 150, "strike2": 23600, "premium2": 100, ...}

Bear Put Spread: {"strategy": "bear-put-spread", "strike1": 23500, "premium1": 150, "strike2": 23400, "premium2": 110, ...}

Stock + Option Strategies
Protective Put: {"strategy": "protective-put", "stockPrice": 23550, "strike": 23400, "premium": 110, ...}

Covered Call: {"strategy": "protective-call", "stockPrice": 23450, "strike": 23600, "premium": 100, ...}

Volatility & Neutral Strategies
Long Straddle: {"strategy": "long-straddle", "strike": 23500, "premium1": 150, "premium2": 145, ...}

Short Straddle: {"strategy": "short-straddle", "strike": 23500, "premium1": 150, "premium2": 145, ...}

Long Strangle: {"strategy": "long-strangle", "strike1": 23400, "premium1": 110, "strike2": 23600, "premium2": 100, ...}

Short Strangle: {"strategy": "short-strangle", "strike1": 23400, "premium1": 110, "strike2": 23600, "premium2": 100, ...}

Iron Condor: {"strategy": "iron-condor", "strike1": 23300, "strike2": 23400, "strike3": 23600, "strike4": 23700, "netPremium": 30, ...}

Iron Butterfly: {"strategy": "iron-butterfly", "strike1": 23400, "strike2": 23500, "strike3": 23600, "netPremium": 70, ...}

Call Butterfly: {"strategy": "call-butterfly", "strike1": 23400, "strike2": 23500, "strike3": 23600, "netPremium": 20, ...}

Calendar Spread: {"strategy": "calendar-spread", "strike": 23500, "premium1": 280, "premium2": 150, ...}