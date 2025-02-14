const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

// Add cache control switches
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-cache');

// Hide the console in production
if (app.isPackaged) {
  const win32 = process.platform === 'win32';
  if (win32) {
    process.stdout.write = () => {};
    process.stderr.write = () => {};
  }
}

const activeWin = require('active-win');
const logger = require('./logger');

app.disableHardwareAcceleration();

let win = null; // Ensure win is initialized as null
let tray = null; // Add tray variable at the top with other globals
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

// Add/modify these IPC handlers
ipcMain.on('minimize-window', () => {
  if (win) {
    win.hide();
    win.setSkipTaskbar(true);
    if (!tray) {
      createTray();
    }
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
      efficiency: Math.round(efficiency), // Changed from efficiency.toFixed(2)
      totalTime: formatTime(totalTimeSeconds),
      productiveTime: formatTime(productiveTimeSeconds)
    });
  }

  // Log activity
  logger.logActivity(
    activeWindow?.owner?.name || 'Unknown',
    isProductive
  );

  // Log efficiency
  logger.logEfficiency(
    Math.round(efficiency), // Changed from efficiency.toFixed(2)
    formatTime(totalTimeSeconds),
    formatTime(productiveTimeSeconds)
  );

  // Update last update time
  lastUpdateTime = currentTime;
}

// Add this function to create tray
function createTray() {
  if (tray) return;

  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        win.show();
        win.setSkipTaskbar(true);
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Work Tracker AI');
  tray.setContextMenu(contextMenu);

  // Double click on tray icon shows window
  tray.on('double-click', () => {
    win.show();
    win.setSkipTaskbar(true);
  });
}

// Modify createWindow function
function createWindow() {
  if (win !== null) return;

  win = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    resizable: false,
    transparent: true,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: false,
      webgl: false,
      enableWebGL: false,
      spellcheck: false,
      backgroundThrottling: false,
      // Add these cache settings
      partition: 'persist:main',
      webSecurity: true
    },
    show: false,
    backgroundColor: '#ffffff',
    skipTaskbar: false // Ensure it shows in taskbar
  });

  // Add session handling
  const ses = win.webContents.session;
  ses.clearCache().then(() => {
    logger.info('Window cache cleared');
  }).catch((err) => {
    logger.logError(err, 'Window cache clearing failed');
  });

  // Add error handling
  win.webContents.on('crashed', (event) => {
    logger.logError(new Error('Window crashed'), 'Renderer Process');
    app.relaunch();
    app.exit(0);
  });

  // Add this event handler for minimize
  win.on('minimize', () => {
    win.setSkipTaskbar(false);
  });

  // Add these window event handlers
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
      win.setSkipTaskbar(true);
      if (!tray) {
        createTray();
      }
    }
    return false;
  });

  win.on('show', () => {
    win.setSkipTaskbar(false);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });
}

// Modify the app.on('ready') handler
app.on('ready', async () => {
  try {
    // Clear cache before creating window
    const userDataPath = app.getPath('userData');
    const cachePath = path.join(userDataPath, 'Cache');
    const gpuCachePath = path.join(userDataPath, 'GPUCache');

    // Clear session cache
    const session = require('electron').session;
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ['cache', 'serviceworkers']
    });

    createWindow();
  } catch (error) {
    logger.logError(error, 'Cache clearing failed');
  }
});

app.whenReady().then(() => {
  // Increase tracking frequency to 100ms (10 times per second)
  setInterval(updateTimeTracking, 100);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Add this before app.quit
app.on('before-quit', () => {
  app.isQuitting = true;
});
