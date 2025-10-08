// backend/payoffFunctions.js

function longCallPayoff(strike, premium, lots, lotSize, spotPrices) {
  const curve = [];
  const totalPremium = premium * lots * lotSize;

  spotPrices.forEach((spot) => {
    const intrinsicValue = Math.max(0, spot - strike);
    const pnl = (intrinsicValue * lotSize * lots) - totalPremium;
    curve.push({ spot: spot, payoff: pnl });
  });

  return {
    payoffCurve: curve,
    maxProfit: "Unlimited",
    maxLoss: -totalPremium,
    breakeven: strike + premium,
  };
}

function longPutPayoff(strike, premium, lots, lotSize, spotPrices) {
  const curve = [];
  const totalPremium = premium * lots * lotSize;

  spotPrices.forEach((spot) => {
    const intrinsicValue = Math.max(0, strike - spot);
    const pnl = (intrinsicValue * lotSize * lots) - totalPremium;
    curve.push({ spot: spot, payoff: pnl });
  });

  return {
    payoffCurve: curve,
    maxProfit: (strike * lotSize * lots) - totalPremium,
    maxLoss: -totalPremium,
    breakeven: strike - premium,
  };
}

function shortCallPayoff(strike, premium, lots, lotSize, spotPrices) {
  const curve = [];
  const totalPremium = premium * lots * lotSize;

  spotPrices.forEach((spot) => {
    const intrinsicValue = Math.max(0, spot - strike);
    const pnl = totalPremium - (intrinsicValue * lotSize * lots);
    curve.push({ spot: spot, payoff: pnl });
  });

  return {
    payoffCurve: curve,
    maxProfit: totalPremium,
    maxLoss: "Unlimited",
    breakeven: strike + premium,
  };
}

function shortPutPayoff(strike, premium, lots, lotSize, spotPrices) {
    const curve = [];
    const totalPremium = premium * lots * lotSize;

    spotPrices.forEach((spot) => {
        const intrinsicValue = Math.max(0, strike - spot);
        const pnl = totalPremium - (intrinsicValue * lotSize * lots);
        curve.push({ spot: spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: totalPremium,
        maxLoss: (strike * lotSize * lots) - totalPremium,
        breakeven: strike - premium,
    };
}


function bullCallSpreadPayoff(params) {
  const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
  
  const longCall = longCallPayoff(strike1, premium1, lots, lotSize, spotPrices);
  const shortCall = shortCallPayoff(strike2, premium2, lots, lotSize, spotPrices);
  
  const combinedCurve = longCall.payoffCurve.map((point, index) => ({
    spot: point.spot,
    payoff: point.payoff + shortCall.payoffCurve[index].payoff,
  }));

  const netPremium = premium1 - premium2;
  const strikeDifference = strike2 - strike1;
  const maxProfit = (strikeDifference - netPremium) * lots * lotSize;
  const maxLoss = -(netPremium * lots * lotSize);
  
  return {
    payoffCurve: combinedCurve,
    maxProfit: maxProfit,
    maxLoss: maxLoss,
    breakeven: strike1 + netPremium,
  };
}

function bullPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const shortPutPnL = (premium1 - Math.max(0, strike1 - spot)) * lots * lotSize;
        const longPutPnL = (-premium2 + Math.max(0, strike2 - spot)) * lots * lotSize;
        curve.push({ spot, payoff: shortPutPnL + longPutPnL });
    });

    return {
        payoffCurve: curve,
        maxProfit: netPremium * lots * lotSize,
        maxLoss: -((strike1 - strike2) - netPremium) * lots * lotSize,
        breakeven: strike1 - netPremium,
    };
}

function bearCallSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const shortCallPnL = (premium1 - Math.max(0, spot - strike1)) * lots * lotSize;
        const longCallPnL = (-premium2 + Math.max(0, spot - strike2)) * lots * lotSize;
        curve.push({ spot, payoff: shortCallPnL + longCallPnL });
    });

    return {
        payoffCurve: curve,
        maxProfit: netPremium * lots * lotSize,
        maxLoss: -((strike2 - strike1) - netPremium) * lots * lotSize,
        breakeven: strike1 + netPremium,
    };
}

function bearPutSpreadPayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium1 - premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = (-premium1 + Math.max(0, strike1 - spot)) * lots * lotSize;
        const shortPutPnL = (premium2 - Math.max(0, strike2 - spot)) * lots * lotSize;
        curve.push({ spot, payoff: longPutPnL + shortPutPnL });
    });

    return {
        payoffCurve: curve,
        maxProfit: ((strike1 - strike2) - netPremium) * lots * lotSize,
        maxLoss: -netPremium * lots * lotSize,
        breakeven: strike1 - netPremium,
    };
}

function syntheticLongStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium - premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const longCallPnL = -premium + Math.max(0, spot - strike);
        const shortPutPnL = premium2 - Math.max(0, strike - spot);
        const pnl = (longCallPnL + shortPutPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: "Large",
        breakeven: strike + netPremium,
    };
}

function syntheticShortStockPayoff(params) {
    const { strike, premium, premium2, lots, lotSize, spotPrices } = params;
    const netPremium = premium - premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const longPutPnL = -premium + Math.max(0, strike - spot);
        const shortCallPnL = premium2 - Math.max(0, spot - strike);
        const pnl = (longPutPnL + shortCallPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Large",
        maxLoss: "Unlimited",
        breakeven: strike - netPremium,
    };
}

function protectivePutPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
    
    const curve = [];
    spotPrices.forEach(spot => {
        const stockPnL = spot - stockPrice;
        const putPnL = Math.max(0, strike - spot) - premium;
        const pnl = (stockPnL + putPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -((stockPrice - strike) + premium) * lots * lotSize,
        breakeven: stockPrice + premium,
    };
}

function protectiveCallPayoff(params) {
    const { stockPrice, strike, premium, lots, lotSize, spotPrices } = params;
    
    const curve = [];
    spotPrices.forEach(spot => {
        const shortStockPnL = stockPrice - spot;
        const callPnL = Math.max(0, spot - strike) - premium;
        const pnl = (shortStockPnL + callPnL) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: (stockPrice - premium) * lots * lotSize,
        maxLoss: -((strike - stockPrice) + premium) * lots * lotSize,
        breakeven: stockPrice - premium,
    };
}

function longStraddlePayoff(params) {
    const { strike, premium1, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const callPayoff = Math.max(0, spot - strike) - premium1;
        const putPayoff = Math.max(0, strike - spot) - premium2;
        const pnl = (callPayoff + putPayoff) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium * lots * lotSize,
        breakeven: [strike - totalPremium, strike + totalPremium],
    };
}

function longStranglePayoff(params) {
    const { strike1, premium1, strike2, premium2, lots, lotSize, spotPrices } = params;
    const totalPremium = premium1 + premium2;

    const curve = [];
    spotPrices.forEach(spot => {
        const callPayoff = Math.max(0, spot - strike2) - premium2;
        const putPayoff = Math.max(0, strike1 - spot) - premium1;
        const pnl = (callPayoff + putPayoff) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    return {
        payoffCurve: curve,
        maxProfit: "Unlimited",
        maxLoss: -totalPremium * lots * lotSize,
        breakeven: [strike1 - totalPremium, strike2 + totalPremium],
    };
}

function ironCondorPayoff(params) {
    const { strike1, strike2, strike3, strike4, netPremium, lots, lotSize, spotPrices } = params;
    
    const curve = [];
    spotPrices.forEach(spot => {
        const longPut = Math.max(0, strike1 - spot);
        const shortPut = -Math.max(0, strike2 - spot);
        const shortCall = -Math.max(0, spot - strike3);
        const longCall = Math.max(0, spot - strike4);
        const pnl = (longPut + shortPut + shortCall + longCall + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    const spreadWidth = strike2 - strike1;
    
    return {
        payoffCurve: curve,
        maxProfit: netPremium * lots * lotSize,
        maxLoss: -(spreadWidth - netPremium) * lots * lotSize,
        breakeven: [strike2 - netPremium, strike3 + netPremium],
    };
}

function ironButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;

    const curve = [];
    spotPrices.forEach(spot => {
        const longPut = Math.max(0, strike1 - spot);
        const shortPut = -Math.max(0, strike2 - spot);
        const shortCall = -Math.max(0, spot - strike2);
        const longCall = Math.max(0, spot - strike3);
        const pnl = (longPut + shortPut + shortCall + longCall + netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });

    const spreadWidth = strike3 - strike2;

    return {
        payoffCurve: curve,
        maxProfit: netPremium * lots * lotSize,
        maxLoss: -(spreadWidth - netPremium) * lots * lotSize,
        breakeven: [strike2 - netPremium, strike2 + netPremium],
    };
}

function callButterflyPayoff(params) {
    const { strike1, strike2, strike3, netPremium, lots, lotSize, spotPrices } = params;

    const curve = [];
    spotPrices.forEach(spot => {
        const longCall1 = Math.max(0, spot - strike1);
        const shortCall2 = -2 * Math.max(0, spot - strike2);
        const longCall3 = Math.max(0, spot - strike3);
        const pnl = (longCall1 + shortCall2 + longCall3 - netPremium) * lots * lotSize;
        curve.push({ spot, payoff: pnl });
    });
    
    const spreadWidth = strike2 - strike1;

    return {
        payoffCurve: curve,
        maxProfit: (spreadWidth - netPremium) * lots * lotSize,
        maxLoss: -netPremium * lots * lotSize,
        breakeven: [strike1 + netPremium, strike3 - netPremium],
    };
}

module.exports = { 
    longCallPayoff, 
    longPutPayoff, 
    shortCallPayoff,
    shortPutPayoff, 
    bullCallSpreadPayoff,
    bullPutSpreadPayoff,
    bearCallSpreadPayoff,
    bearPutSpreadPayoff,
    syntheticLongStockPayoff,
    syntheticShortStockPayoff,
    protectivePutPayoff,
    protectiveCallPayoff,
    longStraddlePayoff,
    longStranglePayoff,
    ironCondorPayoff,
    ironButterflyPayoff,
    callButterflyPayoff,
};