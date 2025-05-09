/**
 * Scene generation and camera positioning logic for drone view matching
 */

import { GLOBAL_REGIONS, DRONE_PARAMS, MATCH_CRITERIA, VIEW_SETTINGS } from './config.js';
import { 
    calculateOrientationToTarget,
    isPointVisibleFromCamera, 
    projectPointToScreen,
    isPointInViewport
} from './utils.js';

/**
 * Config defaults (for reference, adjust in config.js)
 * GLOBAL_REGIONS = Array of regions with bounds:
 * { name: "Region Name", minLat: val, maxLat: val, minLon: val, maxLon: val }
 * 
 * DRONE_PARAMS = {
 *   heightRange: [50, 500], // meters above ground
 *   distanceRange: [100, 1000], // meters
 *   minAngleDiff: Math.PI / 6, // 30 degrees
 *   maxAngleDiff: Math.PI * 2, // 360 degrees
 *   fovRange: [55, 75] // Degrees for vertical FOV
 * }
 * MATCH_CRITERIA = { minMatchPoints: 1 }
 */

/**
 * Find the nearest building to given coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} - Location with lat and lon
 */
async function findNearestBuilding(lat, lon) {
    let radius = 1000; // Start with 1000m radius
    const maxRadius = 10000; // Limit expansion to 10km
    
    // List of Overpass API mirrors to try
    const apiMirrors = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass.osm.jp/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

    while (radius <= maxRadius) {
        const overpassQuery = `
            [out:json][timeout:10];
            (
                way(around:${radius}, ${lat}, ${lon})["building"];
            );
            out center;
        `;
        
        // Randomize the order of mirrors to distribute load
        const shuffledMirrors = [...apiMirrors].sort(() => Math.random() - 0.5);
        
        // Try each mirror until one works
        for (const apiUrl of shuffledMirrors) {
            const overpassUrl = `${apiUrl}?data=${encodeURIComponent(overpassQuery)}`;

            try {
                const response = await fetch(overpassUrl);
                if (!response.ok) {
                    console.warn(`Mirror ${apiUrl} returned status ${response.status}, trying next mirror...`);
                    continue;
                }
                
                const data = await response.json();

                if (data.elements.length > 0) {
                    const nearestBuilding = data.elements[0];
                    console.log(`Successfully used mirror: ${apiUrl}`);
                    return {
                        lat: nearestBuilding.center?.lat || lat,
                        lon: nearestBuilding.center?.lon || lon
                    };
                }
                
                // If we got a valid response with zero elements, no need to try other mirrors
                // But we successfully connected to this mirror, so break the loop
                console.log(`No buildings found within ${radius}m radius using ${apiUrl}`);
                break;
            } catch (error) {
                console.error(`Overpass API error with mirror ${apiUrl} (Radius ${radius}m):`, error);
            }
        }

        // Increase search radius for next attempt
        radius += 4000; // Increase by 2km per attempt
    }

    throw new Error("No buildings found after expanding search with all mirrors.");
}

/**
 * Generate a random point within one of the global regions
 * @returns {Promise<Object>} - Location with lat, lon, and ground height
 */
async function generateRandomLocation() {
    // Status element for user feedback
    let statusElement = document.getElementById('location-status');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'location-status';
        statusElement.style.position = 'absolute';
        statusElement.style.bottom = '10px';
        statusElement.style.left = '10px';
        statusElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
        statusElement.style.color = 'white';
        statusElement.style.padding = '5px 10px';
        statusElement.style.borderRadius = '5px';
        statusElement.style.zIndex = '1000';
        document.body.appendChild(statusElement);
    }

    while (true) {
        // Select a random region from the GLOBAL_REGIONS array
        const region = GLOBAL_REGIONS[Math.floor(Math.random() * GLOBAL_REGIONS.length)];
        
        // Generate random coordinates within the selected region
        const lat = region.minLat + Math.random() * (region.maxLat - region.minLat);
        const lon = region.minLon + Math.random() * (region.maxLon - region.minLon);

        statusElement.textContent = `Finding location in: ${region.name}`;
        console.log(`Trying location in region: ${region.name} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);

        try {
            statusElement.textContent = `Searching for buildings near ${lat.toFixed(4)}, ${lon.toFixed(4)} in ${region.name}...`;
            const buildingLocation = await findNearestBuilding(lat, lon);
            
            statusElement.textContent = `Found building in ${region.name}!`;
            
            // 50% chance to apply random shift
            if (Math.random() < 0.5) {
                statusElement.textContent = `Applying random shift in ${region.name}...`;
                // Add random shift within 200m
                // Convert 200m to approximate degrees (1 degree ≈ 111km at equator)
                const maxShiftDegrees = 200 / 111000; // 200m in degrees
                
                // Generate random angle for shift direction
                const shiftAngle = Math.random() * Math.PI * 2;
                // Generate random distance within 200m
                const shiftDistance = Math.random() * maxShiftDegrees;
                
                // Calculate shifted coordinates
                const shiftedLat = buildingLocation.lat + shiftDistance * Math.sin(shiftAngle);
                const shiftedLon = buildingLocation.lon + shiftDistance * Math.cos(shiftAngle) / Math.cos(buildingLocation.lat * Math.PI / 180);
                
                // Keep the original name format for metadata compatibility
                return {
                    name: `${shiftedLat.toFixed(6)},${shiftedLon.toFixed(6)}`,
                    lat: shiftedLat,
                    lon: shiftedLon,
                    height: 0,
                    // Add region info but don't modify the name property that might be used elsewhere
                    region: region.name
                };
            } else {
                // Return exact building location without shift
                return {
                    name: `${buildingLocation.lat.toFixed(6)},${buildingLocation.lon.toFixed(6)}`,
                    lat: buildingLocation.lat,
                    lon: buildingLocation.lon,
                    height: 0,
                    // Add region info but don't modify the name property
                    region: region.name
                };
            }
        } catch (error) {
            console.warn(`Retrying with a new random point in ${region.name}...`);
            statusElement.textContent = `No buildings found in ${region.name}, trying again...`;
        }
    }
}

/**
 * Places a virtual object and generates two camera positions looking at it
 * @param {Object} location - The location data with lat, lon, height
 * @returns {Object} - Camera positions and virtual object position
 */
function generateCameraPositions(location) {
    console.log("Setting up virtual object at location:", location);
    
    // Place a virtual object 2 meters above ground
    // Create a 50x50m square with 2m height with 9 measurement points
    // (4 corners, 4 midpoints on sides, and 1 center point)
    
    // Center point of the object
    const virtualObjectCenter = Cesium.Cartesian3.fromDegrees(
        location.lon,
        location.lat,
        location.height + 2 // 2m above ground for better visibility
    );
    
    // Calculate the size of the object (50 meters in length/width)
    // 1 degree of latitude is approximately 111km at the equator
    const metersToDegreesLat = 50 / 111000; // 50m in degrees latitude
    const metersToDegreesLon = 50 / (111000 * Math.cos(Cesium.Math.toRadians(location.lat))); // 50m in degrees longitude (adjusted for latitude)
    
    // Define the height of the object (2m)
    const objectHeight = 2;
    
    // Create an array to hold all the points of the virtual object
    const virtualObjectPoints = [];
    
    // 1. Add the center point
    virtualObjectPoints.push({
        position: virtualObjectCenter,
        type: 'center'
    });
    
    // 2. Add the 4 corner points (top surface)
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon - metersToDegreesLon/2, 
            location.lat - metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'corner_sw'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon + metersToDegreesLon/2, 
            location.lat - metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'corner_se'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon + metersToDegreesLon/2, 
            location.lat + metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'corner_ne'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon - metersToDegreesLon/2, 
            location.lat + metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'corner_nw'
    });
    
    // 3. Add the 4 midpoints on the sides (top surface)
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon, 
            location.lat - metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'mid_south'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon + metersToDegreesLon/2, 
            location.lat, 
            location.height + 2 + objectHeight
        ),
        type: 'mid_east'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon, 
            location.lat + metersToDegreesLat/2, 
            location.height + 2 + objectHeight
        ),
        type: 'mid_north'
    });
    
    virtualObjectPoints.push({
        position: Cesium.Cartesian3.fromDegrees(
            location.lon - metersToDegreesLon/2, 
            location.lat, 
            location.height + 2 + objectHeight
        ),
        type: 'mid_west'
    });

    // For backward compatibility, we'll use the center position as the main virtual object
    const virtualObject = virtualObjectCenter;
    
    console.log("Virtual object placed at:", {
        lon: location.lon,
        lat: location.lat,
        height: location.height + 2,
        sizeMeters: { width: 50, height: 2, length: 50 },
        pointCount: virtualObjectPoints.length
    });

    // Camera 1: Position from one angle - use more constrained parameters
    // Use higher elevation and shorter distance to ensure object is in field of view
    const camera1Height = 150 + Math.random() * 100; // 150-250m height
    const camera1Distance = 200 + Math.random() * 150; // 200-350m distance
    const camera1Angle = Math.random() * Math.PI * 2; // Any angle for first camera

    const camera1Position = Cesium.Cartesian3.fromDegrees(
        location.lon + (camera1Distance / 111000) * Math.cos(camera1Angle),
        location.lat + (camera1Distance / 111000) * Math.sin(camera1Angle),
        camera1Height
    );

    // Calculate exact orientation to look directly at the virtual object
    let camera1Direction = calculateOrientationToTarget(camera1Position, virtualObject);
    
    // Camera 2: Position from a substantially different angle
    // Make sure the angle difference is at least 45 degrees but not more than 120
    const angleDiff = Math.PI / 4 + Math.random() * Math.PI / 3; // 45-120 degrees
    const camera2Angle = (camera1Angle + angleDiff) % (2 * Math.PI);
    
    // Use similar height range but different distance for perspective variation
    const camera2Height = 150 + Math.random() * 100; // 150-250m height 
    const camera2Distance = 200 + Math.random() * 150; // 200-350m distance

    const camera2Position = Cesium.Cartesian3.fromDegrees(
        location.lon + (camera2Distance / 111000) * Math.cos(camera2Angle),
        location.lat + (camera2Distance / 111000) * Math.sin(camera2Angle),
        camera2Height
    );

    // Calculate exact orientation for second camera to look at the virtual object
    let camera2Direction = calculateOrientationToTarget(camera2Position, virtualObject);

    console.log("Setup complete:", {
        virtualObject: {
            lat: location.lat,
            lon: location.lon,
            height: location.height + 10
        },
        camera1: {
            height: Math.round(camera1Height),
            distance: Math.round(camera1Distance),
            angle: Math.round(camera1Angle * 180 / Math.PI),
            heading: Math.round(Cesium.Math.toDegrees(camera1Direction.heading)),
            pitch: Math.round(Cesium.Math.toDegrees(camera1Direction.pitch))
        },
        camera2: {
            height: Math.round(camera2Height),
            distance: Math.round(camera2Distance),
            angle: Math.round(camera2Angle * 180 / Math.PI),
            heading: Math.round(Cesium.Math.toDegrees(camera2Direction.heading)),
            pitch: Math.round(Cesium.Math.toDegrees(camera2Direction.pitch))
        },
        angleDiff: Math.round(angleDiff * 180 / Math.PI)
    });

    // Add FOV validation
    const fovRange = DRONE_PARAMS.fovRange || [55, 75]; // Fallback range
    const fov1 = Cesium.Math.toRadians(
        (fovRange[0] || 55) + 
        Math.random() * ((fovRange[1] || 75) - (fovRange[0] || 55))
    );
    
    const fov2 = Cesium.Math.toRadians(
        (fovRange[0] || 55) + 
        Math.random() * ((fovRange[1] || 75) - (fovRange[0] || 55))
    );

    return {
        virtualObject,
        virtualObjectPoints,
        camera1: {
            position: camera1Position,
            orientation: camera1Direction,
            fov: fov1
        },
        camera2: {
            position: camera2Position,
            orientation: camera2Direction,
            fov: fov2
        }
    };
}

/**
 * Project the virtual object onto both views
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Cesium.Cartesian3} virtualObject - The 3D position of the virtual object
 * @returns {Promise<Object>} - Projected coordinates and validation info
 */
async function findMatchingPoints(viewer1, viewer2, virtualObject) {
    console.log("Projecting virtual object to screen coordinates...");
    
    // Ensure scenes are rendered to get accurate coordinates
    viewer1.scene.render();
    viewer2.scene.render();

    // Get screen coordinates for the virtual object in both views
    const view1Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer1.scene, virtualObject);
    const view2Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer2.scene, virtualObject);
    
    // Calculate viewport dimensions
    const halfWidth = viewer1.canvas.width / 2;
    const fullHeight = viewer1.canvas.height;
    
    // Debug variables
    const startTime = Date.now();
    let isValid = false;
    let isForcedMatch = false;
    
    if (!view1Pos || !view2Pos) {
        console.error("Failed to project virtual object to screen coordinates");
        return {
            matchingPoints: [],
            isValid: false,
            debugInfo: {
                duration: Date.now() - startTime,
                totalPoints: 0,
                validPoints: 0,
                errorMsg: "Projection failed"
            }
        };
    }
    
    // Log the projected coordinates
    console.log("Projected coordinates:", {
        view1: { x: Math.round(view1Pos.x), y: Math.round(view1Pos.y) },
        view2: { x: Math.round(view2Pos.x), y: Math.round(view2Pos.y) }
    });
    
    // Adjust view2 position for the split-screen display
    const adjustedView2Pos = { 
        x: view2Pos.x + halfWidth, // Adjust for split-screen
        y: view2Pos.y
    };
    
    // Define safe margins (10% of viewport)
    const marginX = halfWidth * 0.1; 
    const marginY = fullHeight * 0.1;
    
    // Check if points are within safe viewing area
    const inSafeArea1 = view1Pos.x >= marginX && 
                       view1Pos.x <= halfWidth - marginX &&
                       view1Pos.y >= marginY && 
                       view1Pos.y <= fullHeight - marginY;
    
    const inSafeArea2 = view2Pos.x >= marginX && 
                       view2Pos.x <= halfWidth - marginX &&
                       view2Pos.y >= marginY && 
                       view2Pos.y <= fullHeight - marginY;
    
    // Check if points are at least in the visible area
    const inView1 = view1Pos.x >= 0 && 
                   view1Pos.x <= halfWidth &&
                   view1Pos.y >= 0 && 
                   view1Pos.y <= fullHeight;
    
    const inView2 = view2Pos.x >= 0 && 
                   view2Pos.x <= halfWidth &&
                   view2Pos.y >= 0 && 
                   view2Pos.y <= fullHeight;
    
    // Create the matching point object
    const matchingPoint = {
        point3D: virtualObject,
        view1Pos,
        view2Pos: adjustedView2Pos
    };
    
    if (inSafeArea1 && inSafeArea2) {
        // Ideal case: point is within safe areas in both views
        matchingPoint.isCorrect = true;
        isValid = true;
        console.log("✅ Virtual object visible in safe area of both views");
    } else if (inView1 && inView2) {
        // Acceptable case: point is visible but near edges
        matchingPoint.isCorrect = true;
        matchingPoint.isForcedMatch = true;
        isValid = true;
        isForcedMatch = true;
        console.log("⚠️ Virtual object visible in both views but near edges");
    } else {
        // Problematic case: point is off-screen in at least one view
        matchingPoint.isCorrect = false;
        matchingPoint.isForcedMatch = true;
        isForcedMatch = true;
        console.warn("❌ Virtual object not visible in at least one view");
    }
    
    // Return results with detailed debug info
    return {
        matchingPoints: [matchingPoint],
        isValid,
        debugInfo: {
            duration: Date.now() - startTime,
            totalPoints: 1,
            validPoints: isValid ? 1 : 0,
            isForcedMatch,
            inSafeArea1,
            inSafeArea2,
            inView1,
            inView2,
            finalView1Pos: { x: Math.round(view1Pos.x), y: Math.round(view1Pos.y) },
            finalView2Pos: { x: Math.round(view2Pos.x), y: Math.round(view2Pos.y) }
        }
    };
}

/**
 * CameraView class to encapsulate view-specific settings and rendering
 */
class CameraView {
    /**
     * Create a new camera view
     * @param {String} elementId - The HTML element ID for this view
     * @param {Object} viewSettings - View-specific settings
     * @param {Object} viewerSettings - Common viewer settings
     */
    constructor(elementId, viewSettings, viewerSettings) {
        // Store settings
        this.elementId = elementId;
        this.settings = viewSettings;
        
        // Clear container
        document.getElementById(elementId).innerHTML = '';
        
        // Create viewer
        this.viewer = new Cesium.Viewer(elementId, viewerSettings);
        
        // Apply view-specific settings
        this.applySettings();
    }
    
    /**
     * Apply view-specific settings from config
     */
    applySettings() {
        // Apply globe settings
        if (this.settings.globe) {
            Object.entries(this.settings.globe).forEach(([key, value]) => {
                this.viewer.scene.globe[key] = value;
            });
        }
        
        // Apply fog settings
        if (this.settings.fog) {
            Object.entries(this.settings.fog).forEach(([key, value]) => {
                this.viewer.scene.fog[key] = value;
            });
        }
        
        // Apply imagery adjustments if provided
        if (this.settings.imageryAdjustments) {
            const layers = this.viewer.imageryLayers;
            if (layers && layers.length > 0) {
                const baseLayer = layers.get(0);
                if (baseLayer) {
                    const { brightness, contrast, hue, saturation, gamma } = this.settings.imageryAdjustments;
                    baseLayer.brightness = brightness !== undefined ? brightness : 1.0;
                    baseLayer.contrast = contrast !== undefined ? contrast : 1.0;
                    baseLayer.hue = hue !== undefined ? hue : 0.0;
                    baseLayer.saturation = saturation !== undefined ? saturation : 1.0;
                    baseLayer.gamma = gamma !== undefined ? gamma : 1.0;
                }
            }
        }
    }
    
    /**
     * Properly destroy the viewer and clean up resources
     */
    destroy() {
        if (this.viewer) {
            try {
                this.viewer.destroy();
                this.viewer = null;
            } catch (e) {
                console.error("Error destroying viewer:", e);
            }
        }
    }
    
    /**
     * Set the camera position and orientation
     * @param {Cesium.Cartesian3} position - Camera position
     * @param {Object} orientation - Camera orientation
     */
    setCamera(position, orientation) {
        this.viewer.camera.setView({
            destination: position,
            orientation: orientation
        });
    }
    
    /**
     * Add an entity to the view
     * @param {Object} entityOptions - Cesium entity options
     * @returns {Cesium.Entity} The created entity
     */
    addEntity(entityOptions) {
        return this.viewer.entities.add(entityOptions);
    }
    
    /**
     * Project a 3D point to screen coordinates
     * @param {Cesium.Cartesian3} position - The 3D position
     * @returns {Object} Screen coordinates
     */
    projectPoint(position) {
        this.viewer.scene.render();
        return Cesium.SceneTransforms.wgs84ToWindowCoordinates(this.viewer.scene, position);
    }
    
    /**
     * Get camera position in cartographic coordinates
     * @returns {Cesium.Cartographic} Camera position
     */
    getCameraCartographic() {
        return Cesium.Cartographic.fromCartesian(this.viewer.camera.position);
    }
    
    /**
     * Get viewer canvas dimensions
     * @returns {Object} Width and height
     */
    getCanvasDimensions() {
        return {
            width: this.viewer.canvas.clientWidth,
            height: this.viewer.canvas.clientHeight
        };
    }
    
    /**
     * Force render the scene
     */
    render() {
        this.viewer.scene.render();
    }
    
    /**
     * Wait for the scene to fully load (tiles, imagery)
     * @param {Number} timeout - Optional timeout in milliseconds (default: 3000)
     * @returns {Promise} Promise that resolves when loaded or timeout is reached
     */
    waitForLoad(timeout = 3000) {
        return new Promise(resolve => {
            if (!this.viewer || !this.viewer.scene) {
                resolve(); // No viewer, resolve immediately
                return;
            }
            
            const scene = this.viewer.scene;
            const globe = scene.globe;
            
            // Force a higher detail level but balanced for performance
            if (globe) {
                globe.maximumScreenSpaceError = 2.0; // Higher value = faster loading but lower quality
                
                // Limit tile cache size to prevent memory leaks
                globe.tileCacheSize = 100; // Add a cache size limit to prevent excessive memory usage
            }

            // If scene is already loaded, resolve immediately
            if (globe.tilesLoaded) {
                resolve();
                return;
            }
            
            // Set a timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                if (!hasResolved) {
                    console.log("Scene load timeout reached - continuing anyway");
                    cleanup();
                    resolve();
                }
            }, timeout);
            
            // Track if we've resolved yet
            let hasResolved = false;
            let animationFrameId = null;
            let removeListener = null;
            
            // Cleanup function to prevent memory leaks
            const cleanup = () => {
                hasResolved = true;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                if (removeListener) {
                    removeListener();
                    removeListener = null;
                }
                clearTimeout(timeoutId);
            };
            
            // Use requestAnimationFrame to check tile loading status
            const checkTilesLoaded = () => {
                // If already resolved or viewer destroyed, clean up
                if (hasResolved || !this.viewer || !this.viewer.scene) {
                    cleanup();
                    resolve();
                    return;
                }
                
                // Check if tiles are loaded
                if (globe.tilesLoaded) {
                    cleanup();
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
                removeListener = globe.tileLoadProgressEvent.addEventListener(() => {
                    if (!hasResolved && globe.tilesLoaded) {
                        cleanup();
                        resolve();
                    }
                });
            }
            
            // Force an initial render to kick off tile loading
            scene.render();
        });
    }
    
    /**
     * Capture a screenshot of the current view
     * @param {Number} quality - JPEG quality (0-1)
     * @returns {String} Data URL of the screenshot
     */
    captureScreenshot(quality = 0.95) {
        this.render();
        return this.viewer.canvas.toDataURL('image/jpeg', quality);
    }
}

/**
 * Sets up camera views and positioning for both viewers
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Object} location - Location data with lat, lon, height (optional)
 * @returns {Promise<Object>} - Setup information including matching points
 */
async function setupCameraViews(viewer1, viewer2, location) {
    console.log("Setting up scene with virtual object approach...");
    
    if (!location) {
        location = await generateRandomLocation();
    }
    
    // Generate camera positions with a virtual object to track
    const sceneSetup = generateCameraPositions(location);
    
    // Create arrays to track all entities for later reference
    const entities1 = [];
    const entities2 = [];
    
    // Add a visible marker at the main virtual object position (center)
    const objectEntity = viewer1.entities.add({
        id: "virtualObject_center",
        position: sceneSetup.virtualObject,
        point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    entities1.push(objectEntity);
    
    // Also add to second viewer
    const objectEntity2 = viewer2.entities.add({
        id: "virtualObject_center",
        position: sceneSetup.virtualObject,
        point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    entities2.push(objectEntity2);
    
    // Add a small ground reference point
    const groundReference = viewer1.entities.add({
        position: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height),
        cylinder: {
            length: 2,
            topRadius: 2,
            bottomRadius: 2,
            material: Cesium.Color.YELLOW.withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.BLACK
        }
    });
    entities1.push(groundReference);
    
    const groundReference2 = viewer2.entities.add({
        position: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height),
        cylinder: {
            length: 2,
            topRadius: 2,
            bottomRadius: 2,
            material: Cesium.Color.YELLOW.withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.BLACK
        }
    });
    entities2.push(groundReference2);
    
    // Add all the virtual object points as entities with different colors
    // based on their type
    sceneSetup.virtualObjectPoints.forEach(pointObj => {
        if (pointObj.type === 'center') {
            // We already added the center point
            return;
        }
        
        // Pick color based on point type
        let color;
        if (pointObj.type.startsWith('corner')) {
            color = Cesium.Color.RED;
        } else if (pointObj.type.startsWith('mid')) {
            color = Cesium.Color.GREEN;
        } else {
            color = Cesium.Color.BLUE;
        }
        
        // Add to first viewer
        const entity1 = viewer1.entities.add({
            id: `virtualObject_${pointObj.type}`,
            position: pointObj.position,
            point: {
                pixelSize: 6,
                color: color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        entities1.push(entity1);
        
        // Add to second viewer
        const entity2 = viewer2.entities.add({
            id: `virtualObject_${pointObj.type}`,
            position: pointObj.position,
            point: {
                pixelSize: 6,
                color: color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        entities2.push(entity2);
    });
    
    // Calculate the distance between the two camera positions (for stats)
    const distance = Cesium.Cartesian3.distance(
        sceneSetup.camera1.position, 
        sceneSetup.camera2.position
    );
    
    // First, set up initial camera positions
    viewer1.camera.setView({
        destination: sceneSetup.camera1.position,
        orientation: sceneSetup.camera1.orientation
    });
    
    viewer2.camera.setView({
        destination: sceneSetup.camera2.position,
        orientation: sceneSetup.camera2.orientation
    });
    
    // Set FOV after positioning cameras
    viewer1.camera.frustum.fov = sceneSetup.camera1.fov;
    viewer2.camera.frustum.fov = sceneSetup.camera2.fov;
    
    // Make the virtual object visible but not centered
    // Use viewer.zoomTo with offset to ensure it's in the viewport but not in the center
    await Promise.all([
        new Promise(resolve => {
            // Use a heading/pitch/range option to maintain our desired viewing angle
            const heading = viewer1.camera.heading;
            const pitch = viewer1.camera.pitch;
            
            // First zoom to frame the object properly
            viewer1.zoomTo(objectEntity, new Cesium.HeadingPitchRange(
                heading,
                pitch,
                300.0 // Fixed distance for good visibility
            )).then(() => {
                // Then apply a random offset to avoid centering
                // Offset by -30% to +30% of the view dimensions
                const offsetX = (Math.random() * 0.6 - 0.3) * viewer1.canvas.width * 0.5;
                const offsetY = (Math.random() * 0.6 - 0.3) * viewer1.canvas.height * 0.5;
                
                // Move the camera but keep looking at the same spot
                const currentPos = viewer1.camera.position.clone();
                const right = viewer1.camera.right.clone();
                const up = viewer1.camera.up.clone();
                
                // Scale the right and up vectors by the offset amounts
                const rightScaled = Cesium.Cartesian3.multiplyByScalar(right, offsetX, new Cesium.Cartesian3());
                const upScaled = Cesium.Cartesian3.multiplyByScalar(up, offsetY, new Cesium.Cartesian3());
                
                // Calculate the new position by adding the offset vectors
                const newPos = Cesium.Cartesian3.add(currentPos, rightScaled, new Cesium.Cartesian3());
                Cesium.Cartesian3.add(newPos, upScaled, newPos);
                
                // Set the new position
                viewer1.camera.position = newPos;
                
                resolve();
            });
        }),
        new Promise(resolve => {
            const heading = viewer2.camera.heading;
            const pitch = viewer2.camera.pitch;
            
            // Similar process for viewer2
            viewer2.zoomTo(objectEntity2, new Cesium.HeadingPitchRange(
                heading,
                pitch,
                300.0
            )).then(() => {
                // Apply a different random offset to this view
                const offsetX = (Math.random() * 0.6 - 0.3) * viewer2.canvas.width * 0.5;
                const offsetY = (Math.random() * 0.6 - 0.3) * viewer2.canvas.height * 0.5;
                
                const currentPos = viewer2.camera.position.clone();
                const right = viewer2.camera.right.clone();
                const up = viewer2.camera.up.clone();
                
                const rightScaled = Cesium.Cartesian3.multiplyByScalar(right, offsetX, new Cesium.Cartesian3());
                const upScaled = Cesium.Cartesian3.multiplyByScalar(up, offsetY, new Cesium.Cartesian3());
                
                const newPos = Cesium.Cartesian3.add(currentPos, rightScaled, new Cesium.Cartesian3());
                Cesium.Cartesian3.add(newPos, upScaled, newPos);
                
                viewer2.camera.position = newPos;
                
                resolve();
            });
        })
    ]);
    
    // Render the scenes to update
    viewer1.scene.render();
    viewer2.scene.render();
    
    // Get precise 2D coordinates of our 3D virtual object in both views
    // This is the critical step to get accurate projection coordinates
    viewer1.scene.render();
    viewer2.scene.render();
    
    // Create matching points for all the virtual object points
    const matchingPoints = [];
    const view2Width = viewer2.canvas.clientWidth;
    
    // Project each of the 9 points to screen coordinates
    for (const pointObj of sceneSetup.virtualObjectPoints) {
        // Project the 3D position to 2D screen coordinates in both views
        const view1Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
            viewer1.scene, 
            pointObj.position
        );
        
        const view2Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
            viewer2.scene, 
            pointObj.position
        );
        
        // For the visualization overlay, adjust the second viewer's coordinates
        // to account for the split screen layout
        const adjustedView2Pos = view2Pos ? { 
            x: view2Pos.x + viewer1.canvas.clientWidth, // Add full width of first viewer
            y: view2Pos.y
        } : null;
        
        // Check if this point is visible in both views
        const isInView1 = view1Pos && isInViewport(view1Pos, viewer1.canvas.width/2, viewer1.canvas.height);
        const isInView2 = view2Pos && isInViewport(view2Pos, viewer2.canvas.width/2, viewer2.canvas.height);
        
        // Create the matching point data structure using the direct projections
        const matchingPoint = {
            point3D: pointObj.position,
            pointType: pointObj.type,
            view1Pos: view1Pos,
            view2Pos: adjustedView2Pos,
            isCorrect: true,
            // Note if either point is outside the standard viewport bounds
            isForcedMatch: !isInView1 || !isInView2
        };
        
        matchingPoints.push(matchingPoint);
    }
    
    // At least one point must be valid for the pairing to be valid
    const isValid = matchingPoints.some(point => 
        point.view1Pos && point.view2Pos && 
        !point.isForcedMatch);
    
    // Calculate how many points are visible in both views
    const visiblePoints = matchingPoints.filter(point => 
        point.view1Pos && point.view2Pos && !point.isForcedMatch).length;
    
    // Create debug info
    const debugInfo = {
        duration: 0,
        totalPoints: matchingPoints.length,
        validPoints: visiblePoints,
        visiblePointTypes: matchingPoints
            .filter(p => p.view1Pos && p.view2Pos && !p.isForcedMatch)
            .map(p => p.pointType)
    };
    
    // Helper function to check if a point is within viewport bounds
    function isInViewport(pos, width, height) {
        if (!pos) return false;
        const margin = Math.min(width, height) * 0.1; // 10% margin
        return pos.x >= margin && pos.x <= width - margin && 
               pos.y >= margin && pos.y <= height - margin;
    }
    
    // Validation complete

    // Calculate camera altitudes relative to ground for display
    const cart1 = Cesium.Cartographic.fromCartesian(viewer1.camera.position);
    const cart2 = Cesium.Cartographic.fromCartesian(viewer2.camera.position);
    const altitude1 = Math.round(cart1.height - location.height);
    const altitude2 = Math.round(cart2.height - location.height);
    
    // Calculate and log camera angles of view after zoomTo
    const view1Heading = Cesium.Math.toDegrees(viewer1.camera.heading);
    const view1Pitch = Cesium.Math.toDegrees(viewer1.camera.pitch);
    const view2Heading = Cesium.Math.toDegrees(viewer2.camera.heading);
    const view2Pitch = Cesium.Math.toDegrees(viewer2.camera.pitch);
    
    // Get geographic coordinates of the central virtual object point
    const objectCart = Cesium.Cartographic.fromCartesian(sceneSetup.virtualObject);
    const objectLat = Cesium.Math.toDegrees(objectCart.latitude);
    const objectLon = Cesium.Math.toDegrees(objectCart.longitude);
    const objectHeight = objectCart.height;
    
    console.log("Virtual object coordinates:", {
        lat: objectLat,
        lon: objectLon,
        height: objectHeight,
        totalPoints: matchingPoints.length,
        visiblePoints: visiblePoints
    });
    
    console.log("Camera setup after zoomTo:", {
        camera1: { 
            heading: Math.round(view1Heading), 
            pitch: Math.round(view1Pitch),
            height: altitude1
        },
        camera2: { 
            heading: Math.round(view2Heading), 
            pitch: Math.round(view2Pitch),
            height: altitude2
        },
        angleDiff: Math.round(Math.abs(view1Heading - view2Heading))
    });
    
    // Return complete setup information
    return {
        virtualObject: sceneSetup.virtualObject,
        virtualObjectPoints: sceneSetup.virtualObjectPoints,
        matchingPoints,
        isValid,
        entities: {
            view1: entities1,
            view2: entities2
        },
        stats: {
            location: location.name,
            region: location.region || "Unknown Region",
            altitude1,
            altitude2,
            distance: Math.round(distance),
            headingDiff: Math.round(Math.abs(view1Heading - view2Heading)),
            pitchDiff: Math.round(Math.abs(view1Pitch - view2Pitch)),
            objectCoords: {
                lat: Math.round(objectLat * 1000000) / 1000000,
                lon: Math.round(objectLon * 1000000) / 1000000,
                height: Math.round(objectHeight)
            },
            virtualObjectSize: {
                width: 50,
                length: 50,
                height: 2
            },
            pointCount: matchingPoints.length,
            visiblePoints: visiblePoints,
            debug: debugInfo,
            fov1: Cesium.Math.toDegrees(sceneSetup.camera1.fov).toFixed(1),
            fov2: Cesium.Math.toDegrees(sceneSetup.camera2.fov).toFixed(1)
        }
    };
}

export {
    generateRandomLocation,
    generateCameraPositions,
    findMatchingPoints,
    setupCameraViews,
    CameraView
};
