/**
 * Drone View Matching Points - Main application
 */

import { CESIUM_TOKEN, VIEW_SETTINGS, VIEWER_SETTINGS1, VIEWER_SETTINGS2 } from './config.js';
import { 
    setupCameraViews, 
    generateRandomLocation, 
    CameraView,
    startBackgroundLocationGenerator,
    getLocationQueueSize,
    clearLocationQueue
} from './sceneGenerator.js';
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

/**
 * Initialize the application
 */
function initApp() {
    // Initialize Cesium with the token
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
    
    // Create viewers
    createViewers();
    
    // Start background location generation immediately
    startBackgroundLocationGenerator();
    
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
    document.getElementById('generate-btn').addEventListener('click', async () => {
        try {
            // First make sure we're ready for a complete refresh
            showLoading('Preparing new location...');
            
            // Force destroy any existing viewers
            if (viewer1) {
                try {
                    viewer1.destroy();
                    viewer1 = null;
                } catch (e) {
                    console.warn("Error destroying viewer1:", e);
                }
            }
            if (viewer2) {
                try {
                    viewer2.destroy();
                    viewer2 = null;
                } catch (e) {
                    console.warn("Error destroying viewer2:", e);
                }
            }
            
            // Reset all state
            cleanupCanvas();
            matchingPoints = [];
            currentLocation = null;
            
            // Make sure the background generator is running
            startBackgroundLocationGenerator();
            
            // IMPORTANT: Wait a moment to ensure DOM is cleared before rebuilding
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Generate new views with clean state
            await generateNewViews();
        } catch (error) {
            console.error("Error generating views:", error);
            showError(error.message);
            hideLoading();
        }
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
        
        // Generate a random location - force a new one from the queue if available
        console.log(`Getting new location. Queue size: ${getLocationQueueSize()}`);
        
        // Add a timeout to ensure we don't get stuck waiting for a location
        currentLocation = await Promise.race([
            generateRandomLocation(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Location generation timed out")), 5000))
        ]);
        
        console.log(`Using location: ${JSON.stringify(currentLocation)}`);
        
        // Create fresh viewers
        createViewers();
        
        // Make sure we force the scene to fully rebuild with the new location
        // Add some debug output to track the process
        console.log("Setting up new scene with location:", JSON.stringify(currentLocation));
        showLoading(`Setting up scene with location in ${currentLocation.region}...`);
        
        // Generate scene with cameras and virtual object - also add timeout 
        const result = await Promise.race([
            setupCameraViews(viewer1, viewer2, currentLocation),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Scene setup timed out")), 15000))
        ]);
        
        console.log("Scene setup complete:", result?.stats?.region || "unknown region");
        
        // Store matching points (projections of the virtual object)
        matchingPoints = result.matchingPoints;
        
        // Reset location status display to confirm this is a new location
        const statusElement = document.getElementById('location-status');
        if (statusElement) {
            statusElement.textContent = `Using location: ${currentLocation.region} (${currentLocation.lat.toFixed(4)}, ${currentLocation.lon.toFixed(4)})`;
        }
        
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
    // Force viewer reset to make sure we get a fresh scene
    if (viewer1) {
        try {
            viewer1.destroy();
            viewer1 = null;
        } catch (e) {
            console.warn("Error destroying viewer1:", e);
        }
    }
    if (viewer2) {
        try {
            viewer2.destroy();
            viewer2 = null;
        } catch (e) {
            console.warn("Error destroying viewer2:", e);
        }
    }
    
    // Clear state
    cleanupCanvas();
    matchingPoints = [];
    currentLocation = null;
    
    // Generate new views
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
        
        // Track timing for ETA calculation and phase timing
        const startTime = Date.now();
        let lastPairTime = startTime;
        let avgPairTime = 0;
        
        // For detailed phase timing
        let phaseStartTime = 0;
        
        // Add ETA element next to progress
        const etaElement = document.createElement('span');
        etaElement.id = 'eta-display';
        etaElement.style.marginLeft = '10px';
        etaElement.textContent = 'Calculating...';
        progressElement.appendChild(etaElement);
        
        // Ensure location queue is started
        showLoading('Ensuring location queue is populated...');
        startBackgroundLocationGenerator(); // Will check internally if already running
        // Wait a bit for at least one location to be generated
        await new Promise(resolve => setTimeout(resolve, 1000));
        hideLoading();
        
        // Generate each pair and save directly to disk
        for (let i = 0; i < count; i++) {
            // Update progress
            progressCountElement.textContent = i;
            
            // Reset Cesium viewers more frequently to prevent memory issues
            if (i > 0 && i % 10 === 0) {
                // Destroy and recreate viewers with proper cleanup
                if (viewer1) {
                    // First properly unsubscribe from all events
                    try {
                        // Clear event listeners
                        viewer1.camera.moveEnd._listeners = [];
                        viewer1.camera.changed._listeners = [];
                        
                        // Remove all entities
                        viewer1.entities.removeAll();
                        
                        // Remove primitives
                        for (let i = viewer1.scene.primitives.length - 1; i >= 0; i--) {
                            try {
                                viewer1.scene.primitives.remove(viewer1.scene.primitives.get(i));
                            } catch (e) {
                                console.warn("Error removing primitive:", e);
                            }
                        }
                        
                        // Now destroy the viewer
                        viewer1.destroy();
                    } catch (e) {
                        console.warn("Error during viewer1 cleanup:", e);
                    }
                    viewer1 = null;
                }
                
                if (viewer2) {
                    try {
                        // Clear event listeners
                        viewer2.camera.moveEnd._listeners = [];
                        viewer2.camera.changed._listeners = [];
                        
                        // Remove all entities
                        viewer2.entities.removeAll();
                        
                        // Remove primitives
                        for (let i = viewer2.scene.primitives.length - 1; i >= 0; i--) {
                            try {
                                viewer2.scene.primitives.remove(viewer2.scene.primitives.get(i));
                            } catch (e) {
                                console.warn("Error removing primitive:", e);
                            }
                        }
                        
                        // Now destroy the viewer
                        viewer2.destroy();
                    } catch (e) {
                        console.warn("Error during viewer2 cleanup:", e);
                    }
                    viewer2 = null;
                }
                
                // Clean up visualization canvas
                cleanupCanvas();
                
                // Clear any other potential references
                matchingPoints = [];
                
                // Force garbage collection with a longer pause
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Recreate viewers
                createViewers();
            }
            
            // Start timing this phase 
            phaseStartTime = Date.now();
            
            // First generate the next view location - this gives time for rendering
            // Also handle errors and retry with a new location if needed
            try {
                await generateNewViews();
                console.log(`Location generation took: ${Math.round((Date.now() - phaseStartTime)/1000)}s`);
            } catch (error) {
                console.warn(`Issue with scene generation: ${error.message}. Trying a new location.`);
                
                // Force complete recreation of viewers and scene
                if (viewer1) {
                    try { viewer1.destroy(); } catch (e) { console.warn("Error destroying viewer:", e); }
                    viewer1 = null;
                }
                if (viewer2) {
                    try { viewer2.destroy(); } catch (e) { console.warn("Error destroying viewer:", e); }
                    viewer2 = null;
                }
                
                // Reset all state
                cleanupCanvas();
                matchingPoints = [];
                currentLocation = null;
                
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Try again
                createViewers();
                await generateNewViews();
            }
            
            // Start timing scene loading phase
            phaseStartTime = Date.now();
            
            // Wait for both scenes to be fully loaded and rendered before capturing
            showLoading('Waiting for scenes to load completely...');
            
            // Create a promise that resolves when both viewers are ready
            await Promise.all([
                waitForSceneToLoad(viewer1),
                waitForSceneToLoad(viewer2)
            ]);
            
            console.log(`Scene loading took: ${Math.round((Date.now() - phaseStartTime)/1000)}s`);
            
            // Additional render cycles to ensure everything is displayed
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Calculate how much more time we should give for loading
            // For dataset generation, we can be more patient 
            // For interactive use, we should be faster
            const isDatasetGeneration = i !== undefined; // If in loop, it's dataset generation
            
            // Set error threshold based on whether we're in dataset generation
            generateNewViews.skipProblemScenes = isDatasetGeneration; // Will be used later to decide if we should skip
            
            // Force medium detail level imagery for screenshots (balanced approach)
            viewer1.scene.globe.maximumScreenSpaceError = 1.2; // Balanced detail level
            viewer2.scene.globe.maximumScreenSpaceError = 1.2;
            
            // Force imagery to load at highest available resolution
            viewer1.scene.globe.preloadSiblings = true;
            viewer2.scene.globe.preloadSiblings = true;
            
            // Start timing image quality phase
            phaseStartTime = Date.now();
            
            // Check if we need to skip this scene due to texture issues
            let hasImageryIssues = false;
            
            try {
                // Try to check if textures are available
                viewer1.scene.render();
                viewer2.scene.render();
                
                // Add a check for WebGL errors in console - this is heuristic
                // We'll still continue but at least we know there was an issue
                console.log("Checking image quality...");
                
                // More extensive quality enhancement with better texture loading
                showLoading('Waiting for image tiles to load...');
                
                // Longer wait for imagery tiles to load properly
                await new Promise(resolve => {
                    // Set up a longer timeout for texture loading
                    const timeoutId = setTimeout(() => {
                        console.log("Image quality timeout reached, continuing anyway");
                        resolve();
                    }, 3000); // 3 seconds to load textures
                    
                    // Track frames with consistent tile loading
                    let stableFrames = 0;
                    const requiredStableFrames = 10;  // Need more stable frames
                    
                    const checkImagery = () => {
                        if (viewer1 && viewer1.scene && viewer2 && viewer2.scene) {
                            viewer1.scene.render();
                            viewer2.scene.render();
                            
                            // Check if ready
                            if (viewer1.scene.globe.tilesLoaded && viewer2.scene.globe.tilesLoaded) {
                                stableFrames++;
                                showLoading(`Loading image tiles (${stableFrames}/${requiredStableFrames})`);
                                
                                if (stableFrames >= requiredStableFrames) {
                                    clearTimeout(timeoutId);
                                    resolve();
                                    return;
                                }
                            } else {
                                stableFrames = 0; // Reset if not loaded
                            }
                            
                            requestAnimationFrame(checkImagery);
                        } else {
                            // Viewers were destroyed, resolve immediately
                            clearTimeout(timeoutId);
                            resolve();
                        }
                    };
                    
                    requestAnimationFrame(checkImagery);
                });
            } catch (e) {
                console.warn("Image enhancement error:", e);
                hasImageryIssues = true;
            }
            
            // If we have serious texture issues, we might want to skip this scene
            if (hasImageryIssues) {
                console.warn("Scene has texture issues, but continuing anyway");
                
                // For dataset generation, let caller know if there were issues
                if (this.skipProblemScenes) {
                    throw new Error("Skipping scene due to texture loading issues");
                }
            }
            
            console.log(`Image quality enhancement took: ${Math.round((Date.now() - phaseStartTime)/1000)}s`);
            
            hideLoading();
            
            // Capture screenshots
            showLoading('Capturing screenshots...');
            phaseStartTime = Date.now();
            
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
            
            // Force one render cycle to ensure everything is hidden
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
            
            // Force one render to ensure everything is visible again
            viewer1.scene.render();
            viewer2.scene.render();
            
            // Capture debug views
            const debugView1 = viewer1.canvas.toDataURL('image/jpeg', 0.95);
            const debugView2 = viewer2.canvas.toDataURL('image/jpeg', 0.95);
            
            // Log capture time
            console.log(`Screenshot capture took: ${Math.round((Date.now() - phaseStartTime)/1000)}s`);
            
            // Save the current pair directly to the selected directory
            showLoading(`Saving pair ${i+1}/${count} to disk...`);
            phaseStartTime = Date.now();
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
                
                console.log(`Successfully exported pair ${i+1}/${count}`);
                console.log(`Export to disk took: ${Math.round((Date.now() - phaseStartTime)/1000)}s`);
            } catch (error) {
                console.error("Error saving pair:", error);
                showError(`Error saving pair ${i+1}: ${error.message}`);
                // Continue with next pair despite error
            }
            hideLoading();
            
            // Calculate and update ETA with performance tracking
            const currentTime = Date.now();
            const thisIterationTime = currentTime - lastPairTime;
            
            // Log the performance data for debugging
            console.log(`Iteration ${i+1} timing: ${Math.round(thisIterationTime/1000)}s total time`);
            
            // Update timing trackers
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
            
            // Update ETA and time per iteration display
            const avgTimePerIterationSec = Math.round(avgPairTime / 1000);
            const thisIterationSec = Math.round(thisIterationTime / 1000);
            etaElement.textContent = `ETA: ${etaMinutes}m ${etaSeconds}s (Last: ${thisIterationSec}s, Avg: ${avgTimePerIterationSec}s)`;
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
 * Wait for a Cesium scene to be minimally loaded - with a timeout and proper cleanup
 * @param {Cesium.Viewer} viewer - The Cesium viewer to check
 * @returns {Promise} - Promise that resolves when the scene is loaded or timeout occurs
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
            globe.maximumScreenSpaceError = 1.5; // Higher value for faster loading but lower quality
        }

        // If scene is already loaded, resolve immediately
        if (globe.tilesLoaded) {
            resolve();
            return;
        }
        
        // Set a maximum timeout for loading (3 seconds)
        // This prevents hanging on slow internet connections
        const timeoutId = setTimeout(() => {
            // Clean up resources
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            if (eventRemover) {
                eventRemover();
            }
            console.log("Scene load timeout reached - continuing anyway");
            resolve();
        }, 3000);
        
        // Track if we've resolved yet
        let hasResolved = false;
        let animationFrameId = null;
        let eventRemover = null;
        
        // Function to clean up and resolve
        const cleanupAndResolve = () => {
            if (hasResolved) return;
            
            hasResolved = true;
            
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            if (eventRemover) {
                eventRemover();
                eventRemover = null;
            }
            
            resolve();
        };
        
        // Use requestAnimationFrame to check tile loading status
        const checkTilesLoaded = () => {
            // If already resolved or viewer destroyed, clean up and stop
            if (hasResolved || !viewer || !viewer.scene || !viewer.scene.globe) {
                cleanupAndResolve();
                return;
            }
            
            // Check if tiles are loaded
            if (globe.tilesLoaded) {
                cleanupAndResolve();
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
                    cleanupAndResolve();
                }
            });
            eventRemover = removeListener;
        }
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