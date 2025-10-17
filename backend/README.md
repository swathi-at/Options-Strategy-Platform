# Options Strategy Payoff Engine

This backend server provides a single API endpoint to calculate the payoff curve and key metrics for various options trading strategies.

## API Endpoint

`POST /calculate`

### Request Body

-   `strategy` (string, required): The identifier for the strategy (e.g., 'bull-call-spread').
-   `...inputParams` (object, required): A flat object containing all necessary parameters for the chosen strategy.

**Example Request (Bull Call Spread):**

```json
{
    "strategy": "bull-call-spread",
    "strike1": 100,
    "premium1": 3,
    "strike2": 105,
    "premium2": 1,
    "lots": 1,
    "lotSize": 100
}
```

### Success Response (200 OK)

-   Returns a JSON object with the calculated results.

**Example Response:**

```json
{
    "payoffCurve": [
        { "spot": 85, "payoff": -200 },
        { "spot": 86, "payoff": -200 },
        ...
    ],
    "maxProfit": 300,
    "maxLoss": -200,
    "breakeven": "102.00",
    "maxProfitPercentage": 150,
    "maxLossPercentage": -100
}
```