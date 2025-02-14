const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const dataStore = require('./dataStore');

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

// Replace the existing productiveApps array with this categorized system

const productiveCategories = {
    development: {
        name: "Software Development",
        apps: [
            'Visual Studio Code', 'Visual Studio', 'IntelliJ IDEA', 'PyCharm', 'WebStorm',
            'PhpStorm', 'Android Studio', 'Xcode', 'Eclipse', 'Atom', 'Sublime Text',
            'Vim', 'Neovim', 'Emacs', 'NetBeans', 'CodeBlocks', 'Unity', 'Unreal Editor',
            'GitKraken', 'GitHub Desktop', 'Sourcetree', 'Fork', 'Terminal', 'iTerm',
            'Windows Terminal', 'Command Prompt', 'PowerShell', 'WSL', 'Docker Desktop',
            'Postman', 'Insomnia', 'DBeaver', 'MongoDB Compass', 'pgAdmin', 'MySQL Workbench'
        ]
    },
    design: {
        name: "Design & Creative",
        apps: [
            'Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 'Adobe InDesign',
            'Adobe Premiere Pro', 'Adobe After Effects', 'Adobe Lightroom', 'Sketch',
            'Canva', 'Blender', 'Maya', '3ds Max', 'ZBrush', 'Cinema 4D', 'Affinity Designer',
            'Affinity Photo', 'CorelDRAW', 'GIMP', 'Inkscape', 'Aseprite', 'Krita'
        ]
    },
    productivity: {
        name: "Productivity & Project Management",
        apps: [
            'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Teams',
            'Google Docs', 'Google Sheets', 'Google Slides', 'Google Meet', 'Slack',
            'Zoom', 'Skype', 'Discord', 'Notion', 'Evernote', 'OneNote', 'Trello',
            'Asana', 'Monday.com', 'Jira', 'Confluence', 'ClickUp', 'Todoist', 'Things',
            'Obsidian', 'Logseq', 'Miro', 'Figma FigJam', 'Linear', 'Height'
        ]
    },
    business: {
        name: "Business & Analytics",
        apps: [
            'Salesforce', 'HubSpot', 'Zoho CRM', 'Pipedrive', 'Zendesk', 'Intercom',
            'QuickBooks', 'Xero', 'SAP', 'Oracle', 'Tableau', 'Power BI', 'Looker',
            'Google Analytics', 'Mixpanel', 'Amplitude', 'Stripe Dashboard', 'Square',
            'NetSuite', 'Sage', 'Freshbooks', 'Wave', 'Klaviyo', 'Mailchimp'
        ]
    },
    marketing: {
        name: "Marketing & Content",
        apps: [
            'Ahrefs', 'SEMrush', 'Moz Pro', 'Google Ads', 'Facebook Ads Manager',
            'Twitter Ads', 'LinkedIn Campaign Manager', 'Buffer', 'Hootsuite',
            'Later', 'Sprout Social', 'Adobe Premiere Pro', 'Final Cut Pro',
            'DaVinci Resolve', 'OBS Studio', 'Streamlabs', 'Audacity', 'Adobe Audition',
            'WordPress', 'Webflow', 'Shopify', 'MailChimp', 'Constant Contact'
        ]
    },
    engineering: {
        name: "Engineering & CAD",
        apps: [
            'AutoCAD', 'SolidWorks', 'CATIA', 'Fusion 360', 'SketchUp', 'Revit',
            'ArchiCAD', 'Civil 3D', 'Inventor', 'Rhino', 'MATLAB', 'Simulink',
            'LabVIEW', 'Quartus Prime', 'Vivado', 'KiCad', 'Eagle', 'Altium Designer'
        ]
    },
    science: {
        name: "Science & Research",
        apps: [
            'RStudio', 'Jupyter Notebook', 'Jupyter Lab', 'SPSS', 'SAS', 'Stata',
            'Origin Pro', 'GraphPad Prism', 'ChemDraw', 'Gaussview', 'ImageJ',
            'Zotero', 'Mendeley', 'EndNote', 'LaTeX', 'Overleaf', 'Mathematica',
            'Maple', 'PyMOL', 'BLAST'
        ]
    },
    education: {
        name: "Education & Learning",
        apps: [
            'Moodle', 'Blackboard', 'Canvas', 'Google Classroom', 'Kahoot!',
            'Quizlet', 'Duolingo', 'Anki', 'Coursera', 'edX', 'Udemy',
            'Pluralsight', 'LinkedIn Learning', 'Skillshare', 'Brilliant'
        ]
    }
};

// Flatten the categories into a single array for efficient lookup
const productiveApps = Object.values(productiveCategories)
    .reduce((apps, category) => [...apps, ...category.apps], []);

// Optional: Create a lookup map for better performance (O(1) lookup)
const productiveAppsMap = new Map(
    productiveApps.map(app => [app.toLowerCase(), true])
);

// Track total time and productive time
let totalTimeSeconds = 0;
let productiveTimeSeconds = 0;
let lastUpdateTime = null;
let isTracking = false;

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

// Add function to save tracking data
function saveTrackingData() {
    const data = {
        totalTimeSeconds,
        productiveTimeSeconds,
        isTracking
    };
    dataStore.saveData(data);
}

// Modify loadTrackingData function
function loadTrackingData() {
    const data = dataStore.loadData();
    if (data) {
        totalTimeSeconds = data.totalTimeSeconds || 0;
        productiveTimeSeconds = data.productiveTimeSeconds || 0;
        isTracking = data.isTracking || false;
        
        // Send initial state to renderer
        if (win && !win.isDestroyed()) {
            // First send the tracking state
            win.webContents.send('restore-tracking-state', {
                isTracking: isTracking,
                totalTime: formatTime(totalTimeSeconds),
                productiveTime: formatTime(productiveTimeSeconds),
                efficiency: Math.round(calculateEfficiency())
            });
        }
    }
}

// Listen for start/stop tracking commands from renderer
ipcMain.on('toggle-tracking', (event, shouldTrack) => {
  isTracking = shouldTrack;
  if (!shouldTrack) {
    // Pause the timestamp when stopping
    lastUpdateTime = null;
  }
  saveTrackingData();
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

// Add with other ipcMain handlers
ipcMain.on('reset-data', () => {
    // Reset all tracking variables
    totalTimeSeconds = 0;
    productiveTimeSeconds = 0;
    lastUpdateTime = null;
    isTracking = false;

    // Save reset state
    saveTrackingData();

    // Update renderer with reset state
    if (win && !win.isDestroyed()) {
        win.webContents.send('restore-tracking-state', {
            isTracking: false,
            totalTime: '0h 0m 0s',
            productiveTime: '0h 0m 0s',
            efficiency: 0
        });
    }
});

// Modify the updateTimeTracking function for better performance
async function updateTimeTracking() {
  if (!isTracking) return;

  try {
    const activeWindow = await activeWin();
    const currentTime = Date.now();
    
    // Initialize lastUpdateTime if it's the first run
    if (!lastUpdateTime) {
      lastUpdateTime = currentTime;
      return;
    }

    const elapsedSeconds = (currentTime - lastUpdateTime) / 1000;
    
    // Remove the 0.5 second check
    totalTimeSeconds += elapsedSeconds;

    // Update the isProductive check in updateTimeTracking for better performance
    const isProductive = activeWindow?.owner?.name && 
        productiveAppsMap.has(activeWindow.owner.name.toLowerCase());

    if (isProductive) {
      productiveTimeSeconds += elapsedSeconds;
    }

    const efficiency = calculateEfficiency();

    // Batch updates to renderer
    if (win && !win.isDestroyed()) {
      win.webContents.send('tracking-update', {
        currentApp: activeWindow?.owner?.name || 'Unknown',
        isProductive: isProductive,
        efficiency: Math.round(efficiency),
        totalTime: formatTime(totalTimeSeconds),
        productiveTime: formatTime(productiveTimeSeconds)
      });
    }

    // Update last update time
    lastUpdateTime = currentTime;

  } catch (error) {
    logger.logError(error, 'Error in updateTimeTracking');
  }
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
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: false,
      webgl: false,
      enableWebGL: false,
      spellcheck: false,
      backgroundThrottling: false,
      partition: 'persist:main',
      webSecurity: true
    },
    show: false,
    backgroundColor: '#ffffff',
    skipTaskbar: false
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

  win.on('minimize', () => {
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(false);
  });

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
    win.setAlwaysOnTop(true);
    win.setSkipTaskbar(false);
  });

  win.on('blur', () => {
    if (!win.isMinimized() && !win.isDestroyed() && win.isVisible()) {
      win.moveTop();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    loadTrackingData(); // Load saved data when window is ready
  });

  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });
}

// Modify the app.on('ready') handler
app.on('ready', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const cachePath = path.join(userDataPath, 'Cache');
    const gpuCachePath = path.join(userDataPath, 'GPUCache');

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

// Modify the interval timing
app.whenReady().then(() => {
  // Update every 50ms instead of 100ms
  setInterval(updateTimeTracking, 50);
  setupAutoSave();
});

// Add auto-save interval
function setupAutoSave() {
    setInterval(() => {
        saveTrackingData();
    }, 30000); // Save every 30 seconds
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Add save on quit
app.on('before-quit', () => {
  app.isQuitting = true;
  saveTrackingData();
});
