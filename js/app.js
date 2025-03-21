/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN } from './config.js';
import { setupCameraViews, generateRandomLocation } from './sceneGenerator.js';
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
 * Generate new drone views with a virtual object in both views
 */
async function generateNewViews() {
    try {
        console.clear();
        console.log("=== GENERATING NEW DRONE VIEWS WITH VIRTUAL OBJECT ===");
        
        // Clear previous matching points
        matchingPoints = [];
        
        // Show loading message
        showLoading('Generating drone views with virtual object...');
        
        // Generate a random location
        currentLocation = generateRandomLocation();
        
        console.log("Selected location:", currentLocation);
        
        // Create fresh viewers
        createViewers();
        
        // Generate scene with cameras and virtual object
        const result = await setupCameraViews(viewer1, viewer2, currentLocation);
        
        // Store matching points (projections of the virtual object)
        matchingPoints = result.matchingPoints;
        
        // Log the results
        console.log(`Virtual object projected to both views:`, matchingPoints);
        
        // Update stats and visualization
        updateStats(result.stats);
        
        // Draw matching lines with a slight delay to ensure canvas is ready
        setTimeout(() => {
            console.log('Drawing virtual object projections:', matchingPoints);
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
    
    // Update debug panel with detailed information
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        const validPoints = stats.debug.validPoints;
        const totalPoints = stats.debug.totalPoints;
        const finalView1Pos = stats.debug.finalView1Pos ? 
            `(${stats.debug.finalView1Pos.x}, ${stats.debug.finalView1Pos.y})` : 'Unknown';
        const finalView2Pos = stats.debug.finalView2Pos ? 
            `(${stats.debug.finalView2Pos.x}, ${stats.debug.finalView2Pos.y})` : 'Unknown';
        const forcedMatch = stats.debug.isForcedMatch ? 'Yes' : 'No';
        const inView1 = stats.debug.inView1 ? 'Yes' : 'No';
        const inView2 = stats.debug.inView2 ? 'Yes' : 'No';
        
        debugPanel.innerHTML = `
            <h4>Virtual Object:</h4>
            <div>Location: ${stats.objectCoords ? `${stats.objectCoords.lat}, ${stats.objectCoords.lon}` : 'Unknown'}</div>
            <div>Height: ${stats.objectCoords ? `${stats.objectCoords.height}m` : 'Unknown'}</div>
            <div>Visible in View 1: ${inView1}</div>
            <div>Visible in View 2: ${inView2}</div>
            <div>View 1 Position: ${finalView1Pos}</div>
            <div>View 2 Position: ${finalView2Pos}</div>
            <div>Edge Match: ${forcedMatch}</div>
            
            <h4>Camera Setup:</h4>
            <div>Drone 1 Height: ${stats.altitude1}m</div>
            <div>Drone 2 Height: ${stats.altitude2}m</div>
            <div>Distance: ${stats.distance}m</div>
            <div>Angle Difference: ${stats.headingDiff || '?'}°</div>
            <div>Pitch Difference: ${stats.pitchDiff || '?'}°</div>
            
            <h4>Performance:</h4>
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