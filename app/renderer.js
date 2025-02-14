const { ipcRenderer } = require('electron');
const { remote } = require('electron');

// Track the current state
let isTracking = false;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const toggleButton = document.getElementById('trackingToggle');
    
    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        themeToggle.querySelector('.material-icons').textContent = 
            newTheme === 'dark' ? 'dark_mode' : 'light_mode';
    });

    // Set up toggle button click handler
    toggleButton.addEventListener('click', () => {
        isTracking = !isTracking;
        updateToggleButton();
        ipcRenderer.send('toggle-tracking', isTracking);
    });
    
    // Function to update button appearance
    function updateToggleButton() {
        const buttonIcon = toggleButton.querySelector('.material-icons');
        const buttonText = toggleButton.querySelector('.button-text');
        
        if (isTracking) {
            buttonIcon.textContent = 'stop';
            buttonText.textContent = 'Stop Tracking';
            toggleButton.classList.add('stopping');
        } else {
            buttonIcon.textContent = 'play_arrow';
            buttonText.textContent = 'Start Tracking';
            toggleButton.classList.remove('stopping');
        }
    }

    // Initialize display values
    document.getElementById('currentApp').textContent = 'Not tracking';
    document.getElementById('status').textContent = 'Status: Inactive';
    document.getElementById('efficiency').textContent = '0%';
    document.getElementById('totalTime').textContent = '0h 0m 0s';
    document.getElementById('productiveTime').textContent = '0h 0m 0s';

    // Add minimize animation listener
    ipcRenderer.on('minimize-start', () => {
        document.querySelector('.container').classList.add('minimizing');
    });

    // Simple window control buttons
    document.getElementById('minimizeBtn').addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    document.getElementById('closeBtn').addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    // Add this after your existing minimize button handler
    ipcRenderer.on('minimize-to-tray', () => {
        const notification = new Notification('Work Tracker AI', {
            body: 'Application is still running in the system tray'
        });
    });

    // Info modal functionality
    const modal = document.getElementById('infoModal');
    const infoBtn = document.getElementById('infoBtn');
    const closeModal = document.getElementById('closeModal');

    infoBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });

    closeModal.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });

    // Add after your DOMContentLoaded event listener
    document.getElementById('resetData').addEventListener('click', () => {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'confirm-modal';
        confirmModal.innerHTML = `
            <div class="confirm-modal-content">
                <h3>Reset All Data?</h3>
                <p>This will delete all tracking data. This action cannot be undone.</p>
                <div class="confirm-buttons">
                    <button class="confirm-button confirm-yes">Yes, Reset</button>
                    <button class="confirm-button confirm-no">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(confirmModal);
        
        // Show modal with animation
        setTimeout(() => confirmModal.classList.add('active'), 10);

        // Handle button clicks
        confirmModal.querySelector('.confirm-yes').addEventListener('click', () => {
            ipcRenderer.send('reset-data');
            confirmModal.classList.remove('active');
            setTimeout(() => confirmModal.remove(), 300);
        });

        confirmModal.querySelector('.confirm-no').addEventListener('click', () => {
            confirmModal.classList.remove('active');
            setTimeout(() => confirmModal.remove(), 300);
        });

        // Close on outside click
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                confirmModal.classList.remove('active');
                setTimeout(() => confirmModal.remove(), 300);
            }
        });
    });
});

// Simplify the tracking-update handler
ipcRenderer.on('tracking-update', (event, data) => {
    if (!isTracking) return;
    
    const efficiency = document.getElementById('efficiency');
    const efficiencyValue = parseFloat(data.efficiency);
    
    // Direct update without animations
    efficiency.classList.remove('low-efficiency', 'medium-efficiency', 'high-efficiency');
    if (efficiencyValue < 30) {
        efficiency.classList.add('low-efficiency');
    } else if (efficiencyValue < 70) {
        efficiency.classList.add('medium-efficiency');
    } else {
        efficiency.classList.add('high-efficiency');
    }
    
    efficiency.textContent = `${Math.round(efficiencyValue)}%`;

    // Update other elements
    document.getElementById('currentApp').textContent = data.currentApp;
    document.getElementById('status').textContent = 
        `Status: ${data.isProductive ? 'Productive' : 'Non-productive'}`;
    document.getElementById('status').className = 
        data.isProductive ? 'productive' : 'non-productive';
    document.getElementById('totalTime').textContent = data.totalTime;
    document.getElementById('productiveTime').textContent = data.productiveTime;
});

// Modify the restore-tracking-state handler
ipcRenderer.on('restore-tracking-state', (event, data) => {
    isTracking = data.isTracking;
    
    // Update button state
    const toggleButton = document.getElementById('trackingToggle');
    const buttonIcon = toggleButton.querySelector('.material-icons');
    const buttonText = toggleButton.querySelector('.button-text');
    
    if (isTracking) {
        buttonIcon.textContent = 'stop';
        buttonText.textContent = 'Stop Tracking';
        toggleButton.classList.add('stopping');
    }

    // Update efficiency display
    const efficiency = document.getElementById('efficiency');
    const efficiencyValue = data.efficiency;
    
    efficiency.classList.remove('low-efficiency', 'medium-efficiency', 'high-efficiency');
    if (efficiencyValue < 30) {
        efficiency.classList.add('low-efficiency');
    } else if (efficiencyValue < 70) {
        efficiency.classList.add('medium-efficiency');
    } else {
        efficiency.classList.add('high-efficiency');
    }
    
    efficiency.textContent = `${Math.round(efficiencyValue)}%`;

    // Update time displays
    document.getElementById('totalTime').textContent = data.totalTime;
    document.getElementById('productiveTime').textContent = data.productiveTime;
    // Show "Not tracking" or "Ready" instead of "Restoring..."
    document.getElementById('currentApp').textContent = isTracking ? 'Ready' : 'Not tracking';
    document.getElementById('status').textContent = 'Status: Ready';
    document.getElementById('status').className = ''; // Remove any status classes until first update
});
