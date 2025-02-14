// filepath: src/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Clear logs on startup
function clearLogs() {
    const logFiles = ['error.log', 'combined.log', 'activity.log', 'exceptions.log'];
    logFiles.forEach(file => {
        const logPath = path.join(logDir, file);
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, ''); // Clear file contents
        }
    });
}

clearLogs(); // Clear logs when logger is initialized

// Custom log format
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0 && metadata.metadata) {
    msg += ` ${JSON.stringify(metadata.metadata, null, 2)}`;
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
  level: 'debug', // Set to debug to capture more information
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
  exitOnError: false,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
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

// Enhanced error logging
logger.logError = (error, context = '') => {
    const errorInfo = {
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        type: error.name,
        code: error.code
    };
    
    logger.error('Error occurred', { 
        metadata: errorInfo
    });
};

// Add debug logging for OCR
logger.logOCR = (stage, details) => {
    logger.debug('OCR Operation', {
        metadata: {
            stage,
            ...details,
            timestamp: new Date().toISOString()
        }
    });
};

// Add productivity analysis logging
logger.logAnalysis = (details) => {
    logger.info('Productivity Analysis', {
        metadata: {
            ...details,
            timestamp: new Date().toISOString()
        }
    });
};

// Add API request logging
logger.logAPIRequest = (endpoint, details) => {
    logger.debug('API Request', {
        metadata: {
            endpoint,
            ...details,
            timestamp: new Date().toISOString()
        }
    });
};

module.exports = logger;