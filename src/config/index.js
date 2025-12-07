require('dotenv').config();

module.exports = {
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  
  // Fyers API Credentials
  FYERS_CLIENT_ID: process.env.FYERS_CLIENT_ID || '',
  FYERS_SECRET_KEY: process.env.FYERS_SECRET_KEY || '',
  FYERS_REDIRECT_URI: process.env.FYERS_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  
  // Trading Parameters
  DEFAULT_LOT_SIZE: parseInt(process.env.DEFAULT_LOT_SIZE) || 50,
  MAX_RISK_PER_TRADE: parseFloat(process.env.MAX_RISK_PER_TRADE) || 1, // 1% of capital
  
  // Database
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/options-strategy-platform',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  
  // Risk Management
  MAX_DRAWDOWN_PERCENT: parseFloat(process.env.MAX_DRAWDOWN_PERCENT) || 5,
  DAILY_LOSS_LIMIT: parseFloat(process.env.DAILY_LOSS_LIMIT) || 2,
  
  // Strategy Defaults
  DEFAULT_STRATEGY: process.env.DEFAULT_STRATEGY || 'iron-condor',
  DEFAULT_EXPIRY_DAYS: parseInt(process.env.DEFAULT_EXPIRY_DAYS) || 7,
  
  // Notifications
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
};
