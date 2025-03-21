/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN, VIEW_SETTINGS, VIEWER_SETTINGS1, VIEWER_SETTINGS2 } from './config.js';
import { setupCameraViews, generateRandomLocation, CameraView } from './sceneGenerator.js';
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
 * using the CameraView class for better encapsulation
 */
function createViewers() {
    // Create camera view instances for each view
    const cameraView1 = new CameraView('view1', VIEW_SETTINGS.view1, VIEWER_SETTINGS1);
    const cameraView2 = new CameraView('view2', VIEW_SETTINGS.view2, VIEWER_SETTINGS2);
    
    // Store the Cesium viewer instances for compatibility with existing code
    viewer1 = cameraView1.viewer;
    viewer2 = cameraView2.viewer;
    
    // Update view labels if needed
    const view1Label = document.getElementById('view1-label');
    const view2Label = document.getElementById('view2-label');
    if (view1Label) view1Label.textContent = VIEW_SETTINGS.view1.name;
    if (view2Label) view2Label.textContent = VIEW_SETTINGS.view2.name;
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
        currentLocation = await generateRandomLocation();
        
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
        
        // Track timing for ETA calculation
        const startTime = Date.now();
        let lastPairTime = startTime;
        let avgPairTime = 0;
        
        // Add ETA element next to progress
        const etaElement = document.createElement('span');
        etaElement.id = 'eta-display';
        etaElement.style.marginLeft = '10px';
        etaElement.textContent = 'Calculating...';
        progressElement.appendChild(etaElement);
        
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
            
            // Capture screenshots
            // First, completely hide all entities for clean screenshots
            const entities1 = viewer1.entities.values.slice();
            const entities2 = viewer2.entities.values.slice();
            
            // Hide all entities
            for (const entity of entities1) {
                entity.show = false;
            }
            for (const entity of entities2) {
                entity.show = false;
            }
            
            // Also hide any primitives that might be visible
            const primitiveCollections1 = viewer1.scene.primitives._primitives;
            const primitiveCollections2 = viewer2.scene.primitives._primitives;
            
            // Save original visibility state
            const originalPrimitiveVisibility1 = primitiveCollections1.map(p => p.show);
            const originalPrimitiveVisibility2 = primitiveCollections2.map(p => p.show);
            
            // Hide all primitive collections except essential ones (like terrain)
            for (let i = 0; i < primitiveCollections1.length; i++) {
                const p = primitiveCollections1[i];
                // Only hide visualization primitives, keep terrain and imagery
                if (!(p instanceof Cesium.Globe) && 
                    !(p instanceof Cesium.SkyBox) && 
                    !(p instanceof Cesium.SkyAtmosphere)) {
                    p.show = false;
                }
            }
            
            for (let i = 0; i < primitiveCollections2.length; i++) {
                const p = primitiveCollections2[i];
                if (!(p instanceof Cesium.Globe) && 
                    !(p instanceof Cesium.SkyBox) && 
                    !(p instanceof Cesium.SkyAtmosphere)) {
                    p.show = false;
                }
            }
            
            // Force multiple renders to ensure everything is hidden
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Additional render cycle to be absolutely sure
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Capture clean screenshots
            const cleanView1Image = viewer1.canvas.toDataURL('image/jpeg', 0.95);
            const cleanView2Image = viewer2.canvas.toDataURL('image/jpeg', 0.95);
            
            // Restore original visibility for entities
            for (const entity of entities1) {
                entity.show = true;
            }
            for (const entity of entities2) {
                entity.show = true;
            }
            
            // Restore primitive collections visibility
            for (let i = 0; i < primitiveCollections1.length; i++) {
                if (i < originalPrimitiveVisibility1.length) {
                    primitiveCollections1[i].show = originalPrimitiveVisibility1[i];
                }
            }
            
            for (let i = 0; i < primitiveCollections2.length; i++) {
                if (i < originalPrimitiveVisibility2.length) {
                    primitiveCollections2[i].show = originalPrimitiveVisibility2[i];
                }
            }
            
            // Force multiple renders to ensure everything is visible again
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Additional render cycle to be absolutely sure
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Capture debug views
            const debugView1 = viewer1.canvas.toDataURL('image/jpeg', 0.95);
            const debugView2 = viewer2.canvas.toDataURL('image/jpeg', 0.95);
            
            // Add current state to collection with all images
            await exportDataset(
                viewer1, 
                viewer2, 
                matchingPoints, 
                currentLocation.name, 
                true,
                cleanView1Image,
                cleanView2Image,
                debugView1,
                debugView2
            );
            
            // Calculate and update ETA
            const currentTime = Date.now();
            const thisIterationTime = currentTime - lastPairTime;
            lastPairTime = currentTime;
            
            // Update running average
            if (i === 0) {
                avgPairTime = thisIterationTime;
            } else {
                avgPairTime = (avgPairTime * i + thisIterationTime) / (i + 1);
            }
            
            // Calculate and display ETA
            const remainingPairs = count - (i + 1);
            const estimatedRemainingSeconds = Math.round(remainingPairs * avgPairTime / 1000);
            const etaMinutes = Math.floor(estimatedRemainingSeconds / 60);
            const etaSeconds = estimatedRemainingSeconds % 60;
            
            // Update ETA display
            etaElement.textContent = `ETA: ${etaMinutes}m ${etaSeconds}s`;
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
 * Wait for a Cesium scene to be fully loaded using proper event-based detection
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
        const globe = scene.globe;
        
        // Force a higher detail level for better imagery quality
        if (globe) {
            globe.maximumScreenSpaceError = 1.0; // Lower value = higher detail
        }

        // If scene is already loaded, resolve immediately
        if (globe.tilesLoaded) {
            scene.render();
            resolve();
            return;
        }
        
        // Track resolution state to prevent multiple resolves
        let hasResolved = false;
        
        // Add a post-render callback that checks if tiles are loaded
        // This avoids event recursion while still being event-based
        const removeCallback = scene.postRender.addEventListener(() => {
            // Skip if already resolved
            if (hasResolved) return;
            
            // Check the official Cesium property for tile loading status
            if (globe.tilesLoaded) {
                // Prevent multiple resolutions
                hasResolved = true;
                
                // Clean up the event listener
                removeCallback();
                
                // Resolve the promise
                resolve();
            }
        });
        
        // Safety timeout in case the event never fires (3 seconds)
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                
                // Clean up the event listener
                try {
                    removeCallback();
                } catch (e) {
                    // Ignore errors
                }
                
                // Force one more render and resolve
                scene.render();
                resolve();
            }
        }, 3000);
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