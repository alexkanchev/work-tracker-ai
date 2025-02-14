const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('./logger');

class DataStore {
    constructor() {
        // Use more specific path for the application
        const userDataPath = app.getPath('userData');
        const appDataPath = path.join(userDataPath, 'WorkTrackerAI');
        
        // Ensure directory exists
        if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath, { recursive: true });
        }
        
        this.path = path.join(appDataPath, 'trackingData.json');
        logger.debug('DataStore initialized', { 
            metadata: { 
                path: this.path,
                exists: fs.existsSync(this.path)
            } 
        });
    }

    saveData(data) {
        try {
            // Add timestamp and version to saved data
            const saveData = {
                ...data,
                savedAt: Date.now(),
                version: '1.1.0'
            };

            fs.writeFileSync(this.path, JSON.stringify(saveData, null, 2), 'utf-8');
            logger.debug('Data saved successfully', { 
                metadata: { 
                    timestamp: new Date().toISOString(),
                    dataSize: JSON.stringify(saveData).length
                } 
            });
        } catch (error) {
            logger.logError(error, 'Failed to save data');
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.path)) {
                const fileContent = fs.readFileSync(this.path, 'utf-8');
                const parsedData = JSON.parse(fileContent);

                // Validate data structure
                if (!this.isValidData(parsedData)) {
                    logger.error('Invalid data structure found', {
                        metadata: { path: this.path }
                    });
                    return null;
                }

                logger.debug('Data loaded successfully', { 
                    metadata: { 
                        timestamp: new Date().toISOString(),
                        dataFound: true,
                        totalTime: parsedData.totalTimeSeconds,
                        productiveTime: parsedData.productiveTimeSeconds,
                        isTracking: parsedData.isTracking
                    } 
                });
                return parsedData;
            }
            
            logger.debug('No saved data found', { 
                metadata: { 
                    timestamp: new Date().toISOString(),
                    dataFound: false
                } 
            });
        } catch (error) {
            logger.logError(error, 'Failed to load data');
        }
        return null;
    }

    isValidData(data) {
        // Check if data has required fields
        return (
            data &&
            typeof data.totalTimeSeconds === 'number' &&
            typeof data.productiveTimeSeconds === 'number' &&
            typeof data.isTracking === 'boolean'
        );
    }

    clearData() {
        try {
            if (fs.existsSync(this.path)) {
                fs.unlinkSync(this.path);
                logger.debug('Data cleared successfully');
            }
        } catch (error) {
            logger.logError(error, 'Failed to clear data');
        }
    }
}

module.exports = new DataStore();