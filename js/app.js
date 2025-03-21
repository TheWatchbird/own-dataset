/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN } from './config.js';
import { setupCameraViews, generateRandomLocation } from './sceneGenerator.js';
import { drawMatchingLines, showLoading, showError, hideLoading } from './visualization.js';
import { 
    exportDataset, 
    exportDatasetCollection, 
    clearDatasetCollection, 
    getDatasetCollectionSize 
} from './dataExport.js';

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
    
    // Add dataset generation event listener
    document.getElementById('generate-dataset-btn')?.addEventListener('click', generateDataset);
    
    // Generate initial views after a short delay
    setTimeout(generateNewViews, 1000);
}

/**
 * Create Cesium viewers with appropriate settings and different imagery providers
 */
function createViewers() {
    // Remove old viewers' DOM elements if they exist
    document.getElementById('view1').innerHTML = '';
    document.getElementById('view2').innerHTML = '';
    
    // Create first viewer with default settings
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
    
    // Create second viewer with default settings
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
    
    // Simple visual differentiation between viewers
    
    // For the first viewer, use standard settings
    // Add a subtle shadow to viewer1 (original satellite view)
    viewer1.scene.globe.nightFadeOutDistance = 40000;
    viewer1.scene.globe.nightFadeInDistance = 10000;
    
    // For the second viewer, create a visually distinctive style
    // Apply a colored filter effect to the second viewer
    viewer2.scene.globe.nightFadeOutDistance = 1.0; // Stronger effect
    viewer2.scene.globe.nightFadeInDistance = 1.0;
    
    // Different coloring for the second view
    viewer2.scene.globe.atmosphereLightIntensity = 5.0;
    viewer2.scene.globe.atmosphereHueShift = 0.15; // Slightly blue shift
    viewer2.scene.globe.atmosphereSaturationShift = 0.8; // More intense colors
    
    // Set different fog density
    viewer1.scene.fog.density = 0.0001;
    viewer2.scene.fog.density = 0.0005;
    viewer2.scene.fog.minimumBrightness = 0.01;
}

/**
 * Generate new drone views with a virtual object in both views
 */
async function generateNewViews() {
    try {
        // Generate new views
        
        // Clear previous matching points
        matchingPoints = [];
        
        // Show loading message
        showLoading('Generating drone views with virtual object...');
        
        // Generate a random location
        currentLocation = generateRandomLocation();
        
        // Location selected
        
        // Create fresh viewers
        createViewers();
        
        // Generate scene with cameras and virtual object
        const result = await setupCameraViews(viewer1, viewer2, currentLocation);
        
        // Store matching points (projections of the virtual object)
        matchingPoints = result.matchingPoints;
        
        // Log the results
        // Virtual object projected to both views
        
        // Update stats and visualization
        updateStats(result.stats);
        
        // Draw matching lines with a slight delay to ensure canvas is ready
        setTimeout(() => {
            // Draw the virtual object projections
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
    
    // Update location with actual coordinates
    const locationEl = document.getElementById('location-name');
    if (locationEl && stats.objectCoords) {
        locationEl.textContent = `${stats.objectCoords.lat.toFixed(5)}, ${stats.objectCoords.lon.toFixed(5)}`;
    } else if (locationEl) {
        locationEl.textContent = 'Unknown';
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
    
    // Update debug panel with compact information
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        const finalView1Pos = stats.debug.finalView1Pos ? 
            `(${stats.debug.finalView1Pos.x}, ${stats.debug.finalView1Pos.y})` : 'Unknown';
        const finalView2Pos = stats.debug.finalView2Pos ? 
            `(${stats.debug.finalView2Pos.x}, ${stats.debug.finalView2Pos.y})` : 'Unknown';
        
        debugPanel.innerHTML = `
            <div>Object: ${stats.objectCoords ? `${stats.objectCoords.lat.toFixed(6)}, ${stats.objectCoords.lon.toFixed(6)}` : 'Unknown'} (${stats.objectCoords ? `${stats.objectCoords.height}m` : 'Unknown'})</div>
            <div>View 1 Position: ${finalView1Pos}</div>
            <div>View 2 Position: ${finalView2Pos}</div>
            <div>Angle Difference: ${stats.headingDiff || '?'}°</div>
        `;
    }
}

/**
 * Generate a dataset with multiple view pairs
 */
async function generateDataset() {
    try {
        // Get desired count from input
        const count = parseInt(document.getElementById('dataset-count').value, 10);
        if (isNaN(count) || count < 1) {
            showError("Please enter a valid number of pairs (minimum 1)");
            return;
        }
        
        // Clear any previous collection
        clearDatasetCollection();
        
        // Show progress
        const progressElement = document.getElementById('dataset-progress');
        const progressCountElement = document.getElementById('dataset-progress-count');
        const progressTotalElement = document.getElementById('dataset-progress-total');
        
        progressElement.style.display = 'inline-block';
        progressTotalElement.textContent = count;
        progressCountElement.textContent = '0';
        
        // Disable generate button during process
        const generateButton = document.getElementById('generate-dataset-btn');
        generateButton.disabled = true;
        generateButton.textContent = 'Generating...';
        
        // Generate each pair and add to collection
        for (let i = 0; i < count; i++) {
            // Update progress
            progressCountElement.textContent = i;
            
            // Generate new views
            await generateNewViews();
            
            // Wait for both scenes to be fully loaded and rendered before capturing
            showLoading('Waiting for scenes to load completely...');
            
            // Create a promise that resolves when both viewers are ready
            await Promise.all([
                waitForSceneToLoad(viewer1),
                waitForSceneToLoad(viewer2)
            ]);
            
            // Additional render cycles to ensure everything is displayed
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Force higher detail level imagery for better screenshots
            viewer1.scene.globe.maximumScreenSpaceError = 0.5; // Very high detail (lower value = more detail)
            viewer2.scene.globe.maximumScreenSpaceError = 0.5;
            
            // Force imagery to load at highest available resolution
            viewer1.scene.globe.preloadSiblings = true;
            viewer2.scene.globe.preloadSiblings = true;
            
            // Make sure the rendering has actually completed with high-quality imagery
            await new Promise(resolve => {
                // Show feedback about what's happening
                showLoading('Enhancing image quality...');
                
                // Multiple renders with a shorter pause between them
                const totalRenders = 3; // Reduced from 5 to 3
                let renderCount = 0;
                
                function performRender() {
                    if (renderCount >= totalRenders) {
                        // Wait a moment to ensure GPU has completed all work
                        setTimeout(resolve, 500); // Reduced from 1000ms to 500ms
                        return;
                    }
                    
                    // Force renders
                    viewer1.scene.render();
                    viewer2.scene.render();
                    renderCount++;
                    
                    // Update loading message with progress
                    showLoading(`Enhancing image quality (${renderCount}/${totalRenders})`);
                    
                    // Wait before next render - shorter pause
                    setTimeout(performRender, 400); // Reduced from 800ms to 400ms
                }
                
                // Start the render sequence
                performRender();
            });
            
            hideLoading();
            
            // Add current state to collection
            await exportDataset(viewer1, viewer2, matchingPoints, currentLocation.name, true);
            
            // Additional delay between pairs
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // All done - export collection
        const result = await exportDatasetCollection();
        
        // Reset UI
        progressElement.style.display = 'none';
        generateButton.disabled = false;
        generateButton.textContent = 'Dataset Generated!';
        
        // Reset button text after delay
        setTimeout(() => {
            generateButton.textContent = 'Generate Dataset';
        }, 3000);
        
    } catch (error) {
        showError("Dataset generation error: " + error.message);
        console.error("Dataset generation error:", error);
        
        // Reset UI on error
        document.getElementById('dataset-progress').style.display = 'none';
        document.getElementById('generate-dataset-btn').disabled = false;
        document.getElementById('generate-dataset-btn').textContent = 'Generate Dataset';
    }
}

/**
 * Wait for a Cesium scene to be fully loaded using a simpler approach
 * @param {Cesium.Viewer} viewer - The Cesium viewer to check
 * @returns {Promise} - Promise that resolves when the scene is loaded
 */
function waitForSceneToLoad(viewer) {
    return new Promise(resolve => {
        if (!viewer || !viewer.scene) {
            resolve(); // No viewer, resolve immediately
            return;
        }
        
        const scene = viewer.scene;
        
        // Force a higher detail level for better imagery quality
        if (scene.globe) {
            scene.globe.maximumScreenSpaceError = 1.0; // Lower value = higher detail
        }
        
        // Initial render to kick off loading
        scene.render();
        
        // Track the state to prevent multiple resolves
        let hasResolved = false;
        
        // Simple timeout-based approach to allow imagery to load
        // This avoids potential stack overflow issues with event listeners
        function waitForLoading() {
            // Render to progress loading
            scene.render();
            
            // Check if we're done
            if (hasResolved) {
                return;
            }
            
            // Set a flag so we can check it in our timeout handler
            hasResolved = true;
            
            // Short timeout to allow additional imagery to load
            setTimeout(() => {
                // Simple final render sequence
                scene.render();
                scene.render();
                resolve();
            }, 1500);
        }
        
        // Start waiting
        waitForLoading();
    });
}

// Export public functions
export { initApp, generateNewViews, handleExport, generateDataset };

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        initApp();
    } catch (error) {
        console.error("Error initializing app:", error);
        showError("Failed to initialize application: " + error.message);
    }
});