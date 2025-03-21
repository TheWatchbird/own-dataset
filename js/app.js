/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN, LOCATIONS } from './config.js';
import { setupCameraViews } from './sceneGenerator.js';
import { drawMatchingLines, showLoading, showError, hideLoading } from './visualization.js';
import { exportDataset } from './dataExport.js';

// Global state
let viewer1, viewer2;
let matchingPoints = [];
let currentLocation;

/**
 * Initialize the application
 */
function initApp() {
    // Initialize Cesium with the token
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
    
    // Create viewers
    createViewers();
    
    // Set up event listeners
    document.getElementById('generate-btn').addEventListener('click', () => {
        generateNewViews().catch(error => {
            console.error("Error generating views:", error);
            showError(error.message);
            hideLoading();
        });
    });
    document.getElementById('retry-btn')?.addEventListener('click', retryGeneration);
    document.getElementById('export-btn').addEventListener('click', handleExport);
    document.getElementById('debug-toggle')?.addEventListener('click', toggleDebugPanel);
    
    // Generate initial views after a short delay
    setTimeout(generateNewViews, 1000);
}

/**
 * Create Cesium viewers with appropriate settings
 */
function createViewers() {
    // Remove old viewers' DOM elements if they exist
    document.getElementById('view1').innerHTML = '';
    document.getElementById('view2').innerHTML = '';
    
    // Create new viewers with clean state
    viewer1 = new Cesium.Viewer('view1', {
        infoBox: false,
        selectionIndicator: false,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        geocoder: false,
        homeButton: false,
        fullscreenButton: false
    });
    
    viewer2 = new Cesium.Viewer('view2', {
        infoBox: false,
        selectionIndicator: false,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        geocoder: false,
        homeButton: false,
        fullscreenButton: false
    });
}

/**
 * Generate new drone views with guaranteed point matching
 */
async function generateNewViews() {
    try {
        console.clear();
        console.log("=== GENERATING NEW DRONE VIEWS ===");
        
        // Clear previous matching points
        matchingPoints = [];
        
        // Show loading message
        showLoading('Generating drone views...');
        
        // Pick a random location
        const randomLocationIndex = Math.floor(Math.random() * LOCATIONS.length);
        currentLocation = LOCATIONS[randomLocationIndex];
        
        console.log("Selected location:", currentLocation);
        
        // Create fresh viewers
        createViewers();
        
        // Generate matching views
        const result = await setupCameraViews(viewer1, viewer2, currentLocation);
        
        // Store matching points
        matchingPoints = result.matchingPoints;
        
        // Log the results
        console.log(`Generated ${matchingPoints.length} matching points:`, matchingPoints);
        
        // Update stats and visualization
        updateStats(result.stats);
        
        // Draw matching lines with a slight delay to ensure canvas is ready
        setTimeout(() => {
            console.log('Drawing matching lines with points:', matchingPoints);
            drawMatchingLines(matchingPoints);
        }, 100);
        
        // Hide loading message
        hideLoading();
        
    } catch (error) {
        console.error("Error in generateNewViews:", error);
        showError(error.message);
        hideLoading();
    }
}

/**
 * Retry generation with the same location
 */
function retryGeneration() {
    // Implementation is simplified since our approach should always work
    generateNewViews();
}

/**
 * Handle export button click
 */
function handleExport() {
    if (!viewer1 || !viewer2 || !matchingPoints.length) {
        showError("No data to export");
        return;
    }
    
    // Export dataset
    exportDataset(viewer1, viewer2, matchingPoints, currentLocation.name)
        .then(() => {
            // Provide visual feedback
            const exportBtn = document.getElementById('export-btn');
            const originalText = exportBtn.textContent;
            exportBtn.textContent = "Dataset Exported!";
            setTimeout(() => {
                exportBtn.textContent = originalText;
            }, 2000);
        })
        .catch(error => {
            console.error("Export failed:", error);
            showError("Export failed: " + error.message);
        });
}

/**
 * Toggle debug panel visibility
 */
function toggleDebugPanel() {
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        const currentDisplay = window.getComputedStyle(debugPanel).display;
        debugPanel.style.display = currentDisplay === 'none' ? 'block' : 'none';
    }
}

/**
 * Update stats display
 */
function updateStats(stats) {
    if (!stats) return;
    
    // Update location
    const locationEl = document.getElementById('location-name');
    if (locationEl) {
        locationEl.textContent = stats.location || 'Unknown';
    }
    
    // Update altitudes
    const altitudeEl = document.getElementById('drone-altitude');
    if (altitudeEl) {
        const alt1 = typeof stats.altitude1 === 'number' ? stats.altitude1 : '?';
        const alt2 = typeof stats.altitude2 === 'number' ? stats.altitude2 : '?';
        altitudeEl.textContent = `${alt1}/${alt2}`;
    }
    
    // Update distance
    const distanceEl = document.getElementById('camera-distance');
    if (distanceEl) {
        distanceEl.textContent = typeof stats.distance === 'number' ? stats.distance : '?';
    }
    
    // Update debug panel
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        const validPoints = stats.debug.validPoints;
        const totalPoints = stats.debug.totalPoints;
        
        debugPanel.innerHTML = `
            <h4>Debug Info:</h4>
            <div>Matching Points: ${totalPoints}</div>
            <div>Valid Points: ${validPoints}</div>
            <div>Drone 1 Height: ${stats.altitude1}m</div>
            <div>Drone 2 Height: ${stats.altitude2}m</div>
            <div>Distance: ${stats.distance}m</div>
            <div>Valid Match: ${validPoints >= 5 ? 'Yes' : 'No'}</div>
            <div>Processing Time: ${stats.debug.duration}ms</div>
        `;
    }
}

// Export public functions
export { initApp, generateNewViews, handleExport };

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        initApp();
    } catch (error) {
        console.error("Error initializing app:", error);
        showError("Failed to initialize application: " + error.message);
    }
});