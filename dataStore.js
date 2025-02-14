const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class DataStore {
    constructor() {
        this.path = path.join(app.getPath('userData'), 'trackingData.json');
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.path, JSON.stringify(data), 'utf-8');
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.path)) {
                const data = fs.readFileSync(this.path, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
        return null;
    }
}

module.exports = new DataStore();