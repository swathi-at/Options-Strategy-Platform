const EventEmitter = require('events');
const logger = require('../utils/logger');

class BaseStrategy extends EventEmitter {
  constructor(name, config = {}) {
    super();
    this.name = name;
    this.config = {
      maxLossPercent: 2, // 2% of capital
      maxPositionSize: 10, // Max 10% of capital per trade
      ...config
    };
    this.state = {
      isActive: false,
      positions: [],
      pnl: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0
    };
  }

  /**
   * Initialize the strategy with required data
   * @param {Object} params - Strategy parameters
   */
  async initialize(params = {}) {
    this.params = params;
    logger.info(`Initializing ${this.name} strategy`);
  }

  /**
   * Start the strategy
   */
  async start() {
    if (this.state.isActive) {
      logger.warn(`${this.name} strategy is already running`);
      return;
    }
    this.state.isActive = true;
    logger.info(`Starting ${this.name} strategy`);
    this.emit('started', { timestamp: new Date() });
  }

  /**
   * Stop the strategy
   */
  async stop() {
    if (!this.state.isActive) {
      logger.warn(`${this.name} strategy is not running`);
      return;
    }
    this.state.isActive = false;
    logger.info(`Stopping ${this.name} strategy`);
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Execute the strategy
   * @param {Object} marketData - Current market data
   */
  async execute(marketData) {
    if (!this.state.isActive) {
      throw new Error('Strategy is not active');
    }
    
    try {
      const signal = await this.analyze(marketData);
      if (signal) {
        await this.executeSignal(signal, marketData);
      }
    } catch (error) {
      logger.error(`Error executing ${this.name} strategy: ${error.message}`, { error });
      this.emit('error', error);
    }
  }

  /**
   * Analyze market data and generate signals
   * @param {Object} marketData - Current market data
   * @returns {Object|null} - Trading signal or null if no signal
   */
  async analyze(marketData) {
    // To be implemented by specific strategies
    throw new Error('analyze method must be implemented by strategy');
  }

  /**
   * Execute trading signal
   * @param {Object} signal - Trading signal
   * @param {Object} marketData - Current market data
   */
  async executeSignal(signal, marketData) {
    // To be implemented by specific strategies
    throw new Error('executeSignal method must be implemented by strategy');
  }

  /**
   * Calculate position size based on risk parameters
   * @param {number} entryPrice - Entry price
   * @param {number} stopLoss - Stop loss price
   * @param {number} accountBalance - Current account balance
   * @returns {number} - Position size
   */
  calculatePositionSize(entryPrice, stopLoss, accountBalance) {
    const riskAmount = accountBalance * (this.config.maxLossPercent / 100);
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const positionSize = Math.floor(riskAmount / riskPerUnit);
    const maxPositionSize = Math.floor(accountBalance * (this.config.maxPositionSize / 100) / entryPrice);
    
    return Math.min(positionSize, maxPositionSize);
  }

  /**
   * Update strategy statistics
   * @param {Object} trade - Trade result
   */
  updateStatistics(trade) {
    this.state.totalTrades++;
    this.state.pnl += trade.pnl;
    
    if (trade.pnl > 0) {
      this.state.winningTrades++;
    } else if (trade.pnl < 0) {
      this.state.losingTrades++;
    }
    
    this.state.winRate = (this.state.winningTrades / this.state.totalTrades) * 100 || 0;
    
    this.emit('statisticsUpdated', {
      ...this.state,
      timestamp: new Date()
    });
  }

  /**
   * Get strategy state
   * @returns {Object} - Strategy state
   */
  getState() {
    return {
      ...this.state,
      name: this.name,
      config: this.config,
      params: this.params
    };
  }

  /**
   * Reset strategy state
   */
  reset() {
    this.state = {
      isActive: false,
      positions: [],
      pnl: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0
    };
    logger.info(`${this.name} strategy has been reset`);
  }
}

module.exports = BaseStrategy;
