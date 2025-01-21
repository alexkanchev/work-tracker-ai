const { app, BrowserWindow } = require('electron');
const activeWin = require('active-win'); // For tracking the active window
const path = require('path');

let win;

// Example list of productive apps (you can expand this based on your needs)
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

let workStartTime = null;
let workDuration = 0; // Tracks total productive time in seconds
let nonProductiveDuration = 0; // Tracks non-productive time

// Function to calculate efficiency score
function calculateEfficiency() {
  const totalTime = workDuration + nonProductiveDuration;
  const efficiency = totalTime > 0 ? (workDuration / totalTime) * 100 : 0;
  return efficiency;
}

// Function to save the time data (for example, to a simple log or database)
function saveWorkTime() {
  const efficiency = calculateEfficiency();
  console.log(`Efficiency: ${efficiency.toFixed(2)}%`);
  // Here you can save the efficiency score to a database or a file for further analysis
}

// Create the window
function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  // Track the active window every second
  setInterval(async () => {
    const activeWindow = await activeWin();
    const isProductive = productiveApps.some((app) =>
      activeWindow.owner.name.includes(app)
    );

    // If the window is productive, start or continue the work timer
    if (isProductive) {
      if (!workStartTime) {
        workStartTime = Date.now(); // Start tracking work time
      } else {
        workDuration = Math.floor((Date.now() - workStartTime) / 1000); // Update work duration
      }
      nonProductiveDuration = 0; // Reset non-productive duration
    } else {
      // If it's non-productive, start or continue the non-productive timer
      if (workStartTime) {
        nonProductiveDuration = Math.floor((Date.now() - workStartTime) / 1000); // Update non-productive duration
        workStartTime = null; // Reset work start time when switching to non-productive
      }
    }

    // Log the details of the currently active window and status
    const status = isProductive ? 'productive' : 'non-productive';
    console.log(`Currently working on ${activeWindow.owner.name} (${status})`);

    // Periodically save the work time and efficiency score
    saveWorkTime();
  }, 1000); // Check every second
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
