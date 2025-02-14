// filepath: src/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Custom log format
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Custom format for WorkTracker specific logging
const workTrackerFormat = winston.format.printf(({ timestamp, level, message, appName, duration }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (appName) log += ` | App: ${appName}`;
    if (duration) log += ` | Duration: ${duration}ms`;
    return log;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.metadata(),
    customFormat
  ),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // Error logs
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // All logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Activity logging
    new winston.transports.File({
      filename: path.join(logDir, 'activity.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
  // Don't exit on uncaught errors
  exitOnError: false
});

// Add exception handling
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
);

// Helper methods
logger.startTimer = () => {
  return {
    start: process.hrtime(),
    end: (note) => {
      const elapsed = process.hrtime(start);
      const duration = (elapsed[0] * 1000) + (elapsed[1] / 1000000);
      logger.info(`${note || 'Operation'} took ${duration.toFixed(3)}ms`);
    }
  };
};

// Helper methods specific to WorkTracker
logger.logActivity = (appName, isProductive) => {
    logger.info('App activity tracked', { 
        appName, 
        isProductive,
        timestamp: new Date().toISOString()
    });
};

logger.logEfficiency = (efficiency, totalTime, productiveTime) => {
    logger.info('Efficiency stats updated', {
        efficiency: `${efficiency}%`,
        totalTime,
        productiveTime
    });
};

logger.logError = (error, context = '') => {
    logger.error(`Error occurred ${context}`, {
        error: error.message,
        stack: error.stack
    });
};

module.exports = logger;