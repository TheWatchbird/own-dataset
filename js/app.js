/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN, VIEW_SETTINGS, VIEWER_SETTINGS1, VIEWER_SETTINGS2 } from './config.js';
import { setupCameraViews, generateRandomLocation, CameraView } from './sceneGenerator.js';
import { drawMatchingLines, showLoading, showError, hideLoading, cleanupCanvas } from './visualization.js';
import { 
    exportDataset, 
    exportDatasetCollection, 
    clearDatasetCollection, 
    getDatasetCollectionSize,
    requestDirectoryAccess,
    ensureDirectoryAccess,
    isFileSystemAccessSupported
} from './dataExport.js';

// Global state
let viewer1, viewer2;
let matchingPoints = [];
let currentLocation;
let locationQueue = []; // Queue to store preloaded locations
let isPreloadingLocations = false; // Flag to track background preloading

/**
 * Start background location preloading
 * @param {Number} targetSize - Target queue size to maintain
 */
function startBackgroundLocationPreloading(targetSize = 20) {
    if (isPreloadingLocations) return; // Already running
    
    isPreloadingLocations = true;
    console.log("Starting background location preloading");
    
    // Background process to keep queue filled
    async function fillQueue() {
        // If queue is already full enough, wait and check again later
        if (locationQueue.length >= targetSize) {
            setTimeout(fillQueue, 1000);
            return;
        }
        
        try {
            // Generate a new location
            const location = await generateRandomLocation();
            locationQueue.push(location);
            
            console.log(`Added location to queue. Queue size: ${locationQueue.length}/${targetSize}`);
            
            // Continue filling queue until target is reached
            if (isPreloadingLocations) {
                // Use setTimeout to avoid blocking
                setTimeout(fillQueue, 100);
            }
        } catch (error) {
            console.warn("Error generating location for queue:", error);
            // Try again after a delay
            setTimeout(fillQueue, 2000);
        }
    }
    
    // Start the background process
    setTimeout(fillQueue, 0);
}

/**
 * Get next location from queue or generate a new one if queue is empty
 * @returns {Promise<Object>} - Location object
 */
async function getNextLocation() {
    if (locationQueue.length > 0) {
        console.log(`Using location from queue. Remaining: ${locationQueue.length-1}`);
        return locationQueue.shift();
    } else {
        console.log("Queue empty, generating new location on demand");
        return generateRandomLocation();
    }
}

/**
 * Initialize the application
 */
function initApp() {
    // Initialize Cesium with the token
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
    
    // Create viewers
    createViewers();
    
    // Start background location preloading
    startBackgroundLocationPreloading(20);
    
    // Check if File System Access API is supported
    const selectDirectoryBtn = document.getElementById('select-directory-btn');
    const generateDatasetBtn = document.getElementById('generate-dataset-btn');
    
    if (!isFileSystemAccessSupported()) {
        // Disable buttons and show warning
        if (selectDirectoryBtn) {
            selectDirectoryBtn.disabled = true;
            selectDirectoryBtn.title = "Your browser doesn't support the File System Access API";
            selectDirectoryBtn.textContent = "API Not Supported";
            selectDirectoryBtn.style.background = "#aaa";
        }
        
        // Add warning to the dataset button
        if (generateDatasetBtn) {
            generateDatasetBtn.title = "Large datasets may crash due to memory limitations";
        }
        
        // Show warning
        console.warn("File System Access API not supported by this browser. Large datasets may crash the browser.");
    }
    
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
    
    // Add directory selection button event listener if it exists
    document.getElementById('select-directory-btn')?.addEventListener('click', async () => {
        try {
            showLoading('Requesting directory access...');
            await requestDirectoryAccess();
            hideLoading();
            showError('Directory access granted!', 'success');
        } catch (error) {
            hideLoading();
            showError('Directory access denied: ' + error.message);
        }
    });
    
    // Generate initial views after a short delay
    setTimeout(generateNewViews, 1000);
}

/**
 * Create Cesium viewers with appropriate settings and different imagery providers
 * using the CameraView class for better encapsulation
 */
function createViewers() {
    // Destroy existing viewers if they exist
    if (viewer1) {
        try {
            viewer1.destroy();
        } catch (e) {
            console.error("Error destroying viewer1:", e);
        }
        viewer1 = null;
    }
    
    if (viewer2) {
        try {
            viewer2.destroy();
        } catch (e) {
            console.error("Error destroying viewer2:", e);
        }
        viewer2 = null;
    }
    
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
        // Clean up previous canvas if any
        cleanupCanvas();
        
        // Clear previous matching points
        matchingPoints = [];
        
        // Show loading message
        showLoading('Generating drone views with virtual object...');
        
        // Get location from queue or generate a new one
        currentLocation = await getNextLocation();
        
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
        
        // Request directory access permission before starting
        showLoading('Requesting directory access...');
        const hasAccess = await ensureDirectoryAccess();
        if (!hasAccess) {
            showError("Directory access is required to save dataset. Please grant permission.");
            hideLoading();
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
        
        // Generate each pair and save directly to disk
        for (let i = 0; i < count; i++) {
            // Update progress
            progressCountElement.textContent = i;
            
            // Reset Cesium viewers periodically to prevent memory issues
            if (i > 0 && i % 50 === 0) {
                // Destroy and recreate viewers
                if (viewer1) {
                    viewer1.destroy();
                    viewer1 = null;
                }
                if (viewer2) {
                    viewer2.destroy();
                    viewer2 = null;
                }
                
                // Clean up visualization canvas
                cleanupCanvas();
                
                // Clear any other potential references
                matchingPoints = [];
                
                // Allow time for garbage collection
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Recreate viewers
                createViewers();
            }
            
            // First generate the next view location - this gives time for rendering
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
            
            // Optimized image quality enhancement with a timeout
            await new Promise(resolve => {
                // Show feedback about what's happening
                showLoading('Enhancing image quality...');
                
                // Set higher quality imagery with slightly reduced demands
                viewer1.scene.globe.maximumScreenSpaceError = 0.8; // Good balance between quality and speed
                viewer2.scene.globe.maximumScreenSpaceError = 0.8;
                
                // Force imagery to load at highest available resolution
                viewer1.scene.globe.preloadSiblings = true;
                viewer2.scene.globe.preloadSiblings = true;
                
                // Initial render to trigger loading
                viewer1.scene.render();
                viewer2.scene.render();
                
                // Set a maximum timeout to prevent hanging
                const timeoutId = setTimeout(() => {
                    console.log("Image quality enhancement timeout reached, continuing anyway");
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                    }
                    resolve();
                }, 3000); // 3 second max wait
                
                // Counter to track number of frames where tilesLoaded is true
                // We want to make sure tiles stay loaded for multiple frames
                let stableFrameCount = 0;
                const requiredStableFrames = 5; // Reduced from 10 to 5
                
                // To avoid recursion, we'll use requestAnimationFrame instead of directly calling render
                let animationFrameId = null;
                
                // Function to check tiles loaded status
                const checkTilesLoaded = () => {
                    if (viewer1.scene.globe.tilesLoaded && viewer2.scene.globe.tilesLoaded) {
                        stableFrameCount++;
                        showLoading(`Enhancing image quality (${stableFrameCount}/${requiredStableFrames})`);
                        
                        if (stableFrameCount >= requiredStableFrames) {
                            // Resolve the promise
                            clearTimeout(timeoutId);
                            resolve();
                            return;
                        }
                    } else {
                        // Reset counter if tiles aren't loaded
                        stableFrameCount = 0;
                    }
                    
                    // Continue checking in the next frame
                    animationFrameId = requestAnimationFrame(checkTilesLoaded);
                };
                
                // Start the checking process
                animationFrameId = requestAnimationFrame(checkTilesLoaded);
            });
            
            hideLoading();
            
            // Capture screenshots
            showLoading('Capturing screenshots...');
            
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
            
            // Save the current pair directly to the selected directory
            showLoading(`Saving pair ${i+1}/${count} to disk...`);
            try {
                await exportDataset(
                    viewer1, 
                    viewer2, 
                    matchingPoints, 
                    currentLocation.name, 
                    false, // Not adding to collection anymore
                    cleanView1Image,
                    cleanView2Image,
                    debugView1,
                    debugView2,
                    i // Pass the index for folder naming
                );
            } catch (error) {
                console.error("Error saving pair:", error);
                showError(`Error saving pair ${i+1}: ${error.message}`);
                // Continue with next pair despite error
            }
            hideLoading();
            
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
            
            // Increase the target queue size if it's running low
            if (locationQueue.length < 5 && i < count - 1) {
                // Increase queue target size without blocking
                startBackgroundLocationPreloading(20);
            }
        }
        
        // All done - no need to export the collection, as we've saved each pair individually
        
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
            resolve();
            return;
        }
        
        // Track if we've resolved yet
        let hasResolved = false;
        let animationFrameId = null;
        
        // Use requestAnimationFrame to check tile loading status
        // This avoids potential recursion issues with scene.render()
        const checkTilesLoaded = () => {
            // If already resolved, stop checking
            if (hasResolved) return;
            
            // Check if tiles are loaded
            if (globe.tilesLoaded) {
                hasResolved = true;
                cancelAnimationFrame(animationFrameId);
                resolve();
                return;
            }
            
            // Continue checking in next animation frame
            animationFrameId = requestAnimationFrame(checkTilesLoaded);
        };
        
        // Start the checking process
        animationFrameId = requestAnimationFrame(checkTilesLoaded);
        
        // Also listen to the tileLoadProgressEvent as a backup
        if (globe.tileLoadProgressEvent) {
            const removeListener = globe.tileLoadProgressEvent.addEventListener(() => {
                if (!hasResolved && globe.tilesLoaded) {
                    hasResolved = true;
                    cancelAnimationFrame(animationFrameId);
                    removeListener();
                    resolve();
                }
            });
        }
    });
}

// Export public functions
export { 
    initApp, 
    generateNewViews, 
    handleExport, 
    generateDataset,
    startBackgroundLocationPreloading
};

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        initApp();
    } catch (error) {
        console.error("Error initializing app:", error);
        showError("Failed to initialize application: " + error.message);
    }
});