const { app, BrowserWindow, ipcMain } = require('electron');
const activeWin = require('active-win');
const path = require('path');

let win;
const productiveApps = [
  // Programming and Development
  'Visual Studio Code', 'IntelliJ IDEA', 'PyCharm', 'Eclipse', 'Atom', 'Sublime Text', 
  'GitHub Desktop', 'Sourcetree', 'Terminal', 'Command Prompt', 'PowerShell',
  
  // Operations and Project Management
  'Trello', 'Asana', 'Monday.com', 'Jira', 'ClickUp', 
  'Slack', 'Microsoft Teams', 'Zoom', 'Google Meet', 'Webex', 
  'Notion', 'Evernote', 'OneNote', 'Google Docs', 'Microsoft Word',
  
  // Sales and CRM
  'Salesforce', 'HubSpot', 'Zoho CRM', 'Pipedrive', 'Zendesk',
  
  // Analytics and Reporting
  'Google Analytics', 'Tableau', 'Power BI', 'Looker', 'Mixpanel',
  
  // Design and Creative Work
  'Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Canva', 'Sketch',
  
  // Spreadsheets and Data Management
  'Microsoft Excel', 'Google Sheets', 'Airtable'
];

// Track total time and productive time
let totalTimeSeconds = 0;
let productiveTimeSeconds = 0;
let lastUpdateTime = null;

// Function to calculate efficiency score
function calculateEfficiency() {
  return totalTimeSeconds > 0 ? (productiveTimeSeconds / totalTimeSeconds) * 100 : 0;
}

// Helper function to format time with hours, minutes, and seconds
function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Add tracking state
let isTracking = false;

// Listen for start/stop tracking commands from renderer
ipcMain.on('toggle-tracking', (event, shouldTrack) => {
  isTracking = shouldTrack;
  if (!shouldTrack) {
    // Pause the timestamp when stopping
    lastUpdateTime = null;
  }
});

// Add these handlers near the top with other IPC handlers
ipcMain.on('minimize-window', () => {
    if (win) {
        win.minimize();
    }
});

ipcMain.on('close-window', () => {
    if (win) {
        win.close();
    }
});

// Function to update time tracking
async function updateTimeTracking() {
  if (!isTracking) return;

  const activeWindow = await activeWin();
  const currentTime = Date.now();
  
  // Initialize lastUpdateTime if it's the first run
  if (!lastUpdateTime) {
    lastUpdateTime = currentTime;
    return;
  }

  // Calculate time elapsed since last update (in seconds)
  const elapsedSeconds = (currentTime - lastUpdateTime) / 1000;
  
  // Update total time
  totalTimeSeconds += elapsedSeconds;

  // Check if current app is productive
  const isProductive = productiveApps.some(app => 
    activeWindow?.owner?.name?.toLowerCase().includes(app.toLowerCase())
  );

  // Update productive time if current activity is productive
  if (isProductive) {
    productiveTimeSeconds += elapsedSeconds;
  }

  // Calculate and log current efficiency
  const efficiency = calculateEfficiency();

  // Send data to renderer
  if (win) {
    win.webContents.send('tracking-update', {
      currentApp: activeWindow?.owner?.name || 'Unknown',
      isProductive: isProductive,
      efficiency: efficiency.toFixed(2),
      totalTime: formatTime(totalTimeSeconds),
      productiveTime: formatTime(productiveTimeSeconds)
    });
  }

  // Update last update time
  lastUpdateTime = currentTime;
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    resizable: false,
    transparent: true,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false // Hide window until ready
  });

  win.once('ready-to-show', () => {
    win.show(); // Show window when ready
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  
  // Increase tracking frequency to 100ms (10 times per second)
  setInterval(updateTimeTracking, 100);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
