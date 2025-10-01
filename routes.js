const express = require('express');
const router = express.Router();
const payoffFns = require('./payoffFunctions');

router.post('/strategies', (req, res) => {
  const { strategy, options } = req.body;

  let result;

  switch (strategy) {
    case 'Long Call':
      result = payoffFns.calculateLongCall(options);
      break;

    case 'Long Put': // <-- ADD THIS NEW CASE
      result = payoffFns.calculateLongPut(options);
      break;

    case 'Bull Call Spread':
      result = payoffFns.calculateBullCallSpread(options);
      break;

    case 'Bull Put Spread':
      result = payoffFns.calculateBullPutSpread(options);
      break;

    default:
      return res.status(400).json({ error: 'Strategy not implemented' });
  }

  return res.json(result);
});

module.exports = router;