/**
 * Scene generation and camera positioning logic for drone view matching
 */

import { UKRAINE_BOUNDS, DRONE_PARAMS, MATCH_CRITERIA } from './config.js';
import { 
    calculateOrientationToTarget,
    isPointVisibleFromCamera, 
    projectPointToScreen,
    isPointInViewport
} from './utils.js';

/**
 * Config defaults (for reference, adjust in config.js)
 * UKRAINE_BOUNDS = { minLat: 44.0, maxLat: 52.5, minLon: 22.0, maxLon: 41.0 }
 * DRONE_PARAMS = {
 *   heightRange: [50, 500], // meters above ground
 *   distanceRange: [100, 1000], // meters
 *   minAngleDiff: Math.PI / 6, // 30 degrees
 *   maxAngleDiff: Math.PI * 2 // 360 degrees
 * }
 * MATCH_CRITERIA = { minMatchPoints: 1 }
 */

/**
 * Generate a random point within Ukraine's bounds
 * @returns {Object} - Location with lat, lon, and ground height
 */
function generateRandomLocation() {
    const lat = UKRAINE_BOUNDS.minLat + Math.random() * (UKRAINE_BOUNDS.maxLat - UKRAINE_BOUNDS.minLat);
    const lon = UKRAINE_BOUNDS.minLon + Math.random() * (UKRAINE_BOUNDS.maxLon - UKRAINE_BOUNDS.minLon);
    const height = 0; // Ground level
    
    return {
        name: "Random Location",
        lat,
        lon,
        height
    };
}

/**
 * Places a virtual object and generates two camera positions looking at it
 * @param {Object} location - The location data with lat, lon, height
 * @returns {Object} - Camera positions and virtual object position
 */
function generateCameraPositions(location) {
    console.log("Setting up virtual object at location:", location);
    
    // Place a virtual object 10 meters above ground for better visibility
    const virtualObject = Cesium.Cartesian3.fromDegrees(
        location.lon,
        location.lat,
        location.height + 10 // 10m above ground for better visibility
    );

    console.log("Virtual object placed at:", {
        lon: location.lon,
        lat: location.lat,
        height: location.height + 10
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

    return {
        virtualObject,
        camera1: {
            position: camera1Position,
            orientation: camera1Direction
        },
        camera2: {
            position: camera2Position,
            orientation: camera2Direction
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
 * Sets up camera views and positioning for both viewers
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Object} location - Location data with lat, lon, height (optional)
 * @returns {Promise<Object>} - Setup information including matching points
 */
async function setupCameraViews(viewer1, viewer2, location) {
    console.log("Setting up scene with virtual object approach...");
    
    if (!location) {
        location = generateRandomLocation();
    }
    
    // Generate camera positions with a virtual object to track
    const sceneSetup = generateCameraPositions(location);
    
    // Add a visible marker at the virtual object position
    const objectEntity = viewer1.entities.add({
        id: "virtualObject",
        position: sceneSetup.virtualObject,
        point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    
    // Also add to second viewer
    const objectEntity2 = viewer2.entities.add({
        id: "virtualObject",
        position: sceneSetup.virtualObject,
        point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    
    // Add a small ground reference point
    const groundReference = viewer1.entities.add({
        position: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height),
        cylinder: {
            length: 10,
            topRadius: 2,
            bottomRadius: 2,
            material: Cesium.Color.YELLOW.withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.BLACK
        }
    });
    
    const groundReference2 = viewer2.entities.add({
        position: Cesium.Cartesian3.fromDegrees(location.lon, location.lat, location.height),
        cylinder: {
            length: 10,
            topRadius: 2,
            bottomRadius: 2,
            material: Cesium.Color.YELLOW.withAlpha(0.5),
            outline: true,
            outlineColor: Cesium.Color.BLACK
        }
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
    
    // Get the projected coordinates
    const result = await findMatchingPoints(viewer1, viewer2, sceneSetup.virtualObject);
    const matchingPoints = result.matchingPoints;
    const isValid = result.isValid;
    const debugInfo = result.debugInfo;
    
    if (!isValid) {
        console.warn("⚠️ Object projection validation issue");
    } else {
        console.log("✅ Object successfully projected to both views");
    }

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
    
    // Get geographic coordinates of the virtual object
    const objectCart = Cesium.Cartographic.fromCartesian(sceneSetup.virtualObject);
    const objectLat = Cesium.Math.toDegrees(objectCart.latitude);
    const objectLon = Cesium.Math.toDegrees(objectCart.longitude);
    const objectHeight = objectCart.height;
    
    console.log("Virtual object coordinates:", {
        lat: objectLat,
        lon: objectLon,
        height: objectHeight
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
        matchingPoints,
        isValid,
        entities: {
            view1: [objectEntity, groundReference],
            view2: [objectEntity2, groundReference2]
        },
        stats: {
            location: location.name,
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
            debug: debugInfo
        }
    };
}

export {
    generateRandomLocation,
    generateCameraPositions,
    findMatchingPoints,
    setupCameraViews
};