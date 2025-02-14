const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const dataStore = require('./dataStore');
const ProductivityAnalyzer = require('./productivityAnalyzer');
require('dotenv').config();
const fs = require('fs');

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

// Update saveTrackingData function
function saveTrackingData() {
    const data = {
        totalTimeSeconds,
        productiveTimeSeconds,
        isTracking,
        lastUpdateTime,
        lastResult: analyzer.lastResult, // Save last analysis result
        timestamp: Date.now()
    };
    dataStore.saveData(data);
    logger.debug('Saved tracking data', { metadata: data });
}

// Update loadTrackingData function
function loadTrackingData() {
    const data = dataStore.loadData();
    if (data && data.totalTimeSeconds !== undefined) {
        // Restore tracking data
        totalTimeSeconds = data.totalTimeSeconds;
        productiveTimeSeconds = data.productiveTimeSeconds;
        isTracking = data.isTracking;
        
        // Only set lastUpdateTime if tracking was active
        lastUpdateTime = isTracking ? Date.now() : null;

        const efficiency = Math.round(calculateEfficiency());
        
        logger.info('Restored tracking data', {
            metadata: {
                totalTime: formatTime(totalTimeSeconds),
                productiveTime: formatTime(productiveTimeSeconds),
                efficiency,
                isTracking
            }
        });

        if (win && !win.isDestroyed()) {
            win.webContents.send('restore-tracking-state', {
                isTracking,
                totalTime: formatTime(totalTimeSeconds),
                productiveTime: formatTime(productiveTimeSeconds),
                efficiency,
                currentApp: isTracking ? 'Resuming...' : 'Not tracking',
                isProductive: data.lastResult?.isProductive || false,
                category: data.lastResult?.category || 'Unknown',
                confidence: data.lastResult?.confidence || 1.0
            });
        }
    }
}

// Listen for start/stop tracking commands from renderer
ipcMain.on('toggle-tracking', (event, shouldTrack) => {
    isTracking = shouldTrack;
    lastUpdateTime = shouldTrack ? Date.now() : null;
    
    logger.info(`Tracking ${shouldTrack ? 'started' : 'stopped'}`);
    
    if (!shouldTrack) {
        saveTrackingData();
    }
    
    // Send immediate feedback to renderer
    if (win && !win.isDestroyed()) {
        win.webContents.send('tracking-update', {
            currentApp: shouldTrack ? 'Starting...' : 'Not tracking',
            isProductive: false,
            efficiency: Math.round(calculateEfficiency()),
            totalTime: formatTime(totalTimeSeconds),
            productiveTime: formatTime(productiveTimeSeconds)
        });
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

// Replace OpenAI initialization with Hugging Face
const analyzer = new ProductivityAnalyzer(productiveCategories, productiveAppsMap);

// Update updateTimeTracking function
async function updateTimeTracking() {
    if (!isTracking) return;

    try {
        const currentTime = Date.now();
        
        if (!lastUpdateTime) {
            lastUpdateTime = currentTime;
            return;
        }

        const elapsedSeconds = (currentTime - lastUpdateTime) / 1000;
        const activeWindow = await activeWin();
        
        // Quick update based on cached results or app name
        const quickResult = await analyzer.getQuickAnalysis(activeWindow);
        
        // Update total time and productive time based on quick analysis
        totalTimeSeconds += elapsedSeconds;
        if (quickResult.isProductive) {
            productiveTimeSeconds += elapsedSeconds;
        }

        const efficiency = Math.round(calculateEfficiency());

        // Send immediate UI update with consistent productivity state
        if (win && !win.isDestroyed()) {
            win.webContents.send('tracking-update', {
                currentApp: activeWindow?.owner?.name || 'Unknown',
                isProductive: quickResult.isProductive,
                efficiency: efficiency,
                totalTime: formatTime(totalTimeSeconds),
                productiveTime: formatTime(productiveTimeSeconds),
                category: quickResult.category,
                confidence: quickResult.confidence,
                isQuickResult: true
            });
        }

        lastUpdateTime = currentTime;

        // Perform full AI analysis in background and update if different
        analyzer.analyzeProductivityAsync(activeWindow).then(analysis => {
            if (analysis && win && !win.isDestroyed()) {
                // If AI analysis differs from quick analysis, adjust the productive time
                if (analysis.isProductive !== quickResult.isProductive) {
                    if (analysis.isProductive) {
                        productiveTimeSeconds += elapsedSeconds;
                    } else {
                        productiveTimeSeconds -= elapsedSeconds;
                    }
                    
                    // Send updated stats
                    win.webContents.send('tracking-update', {
                        currentApp: activeWindow?.owner?.name || 'Unknown',
                        isProductive: analysis.isProductive,
                        efficiency: Math.round(calculateEfficiency()),
                        totalTime: formatTime(totalTimeSeconds),
                        productiveTime: formatTime(productiveTimeSeconds),
                        category: analysis.category,
                        confidence: analysis.confidence,
                        isQuickResult: false
                    });
                }
            }
        });

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
                win.setSkipTaskbar(false);
                win.setAlwaysOnTop(true, 'floating'); // Add this line
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
        win.setSkipTaskbar(false);
        win.setAlwaysOnTop(true, 'floating'); // Add this line
    });
}

// Update createWindow function
function createWindow() {
    if (win !== null) return;

    win = new BrowserWindow({
        width: 900,
        height: 680,
        frame: false,
        resizable: false,
        show: false, // Don't show until ready
        alwaysOnTop: true, // Add this line to keep window on top
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            offscreen: false,
            webgl: false,
            enableWebGL: false
        }
    });

    // Set window to stay on top even after focus is lost
    win.setAlwaysOnTop(true, 'floating');

    // Optional: Add this to ensure it stays above full-screen applications
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load the app
    win.loadFile('index.html');

    // Only show window when ready
    win.once('ready-to-show', () => {
        win.show();
        loadTrackingData();
        // Ensure always on top after showing
        win.setAlwaysOnTop(true, 'floating');
    });

    // Handle window close
    win.on('closed', () => {
        win = null;
    });

    // Add focus handler to ensure always on top
    win.on('focus', () => {
        win.setAlwaysOnTop(true, 'floating');
    });
}

// Remove the separate app.on('ready') handler and combine everything in app.whenReady()
app.whenReady().then(async () => {
    try {
        // Setup cache directory first
        const userDataPath = app.getPath('userData');
        const cachePath = path.join(userDataPath, 'Cache');
        const gpuCachePath = path.join(userDataPath, 'GPUCache');

        // Ensure directories exist
        if (!fs.existsSync(cachePath)) {
            fs.mkdirSync(cachePath, { recursive: true, mode: 0o755 });
        }
        if (!fs.existsSync(gpuCachePath)) {
            fs.mkdirSync(gpuCachePath, { recursive: true, mode: 0o755 });
        }

        // Set application user data path
        app.setPath('userData', path.join(userDataPath, 'WorkTrackerAI'));

        // Clear cache before creating window
        const session = require('electron').session;
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({
            storages: ['cache', 'serviceworkers']
        });

        // Create window and start tracking
        createWindow();
        setInterval(updateTimeTracking, 1000);
        setupAutoSave();

        // Handle GPU process crashes
        app.on('gpu-process-crashed', (event, killed) => {
            logger.logError(new Error('GPU process crashed'), 'GPU Process');
        });

    } catch (error) {
        logger.logError(error, 'Application initialization failed');
    }
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
app.on('before-quit', async () => {
  app.isQuitting = true;
  saveTrackingData();
  await analyzer.cleanup();
});
