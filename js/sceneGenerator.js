/**
 * Scene generation and camera positioning logic for drone view matching
 */

import { CAMERA_CONFIG, MATCH_CRITERIA } from './config.js';
import { 
    calculateOrientationToTarget,
    isPointVisibleFromCamera, 
    generateRandomPointsNear,
    projectPointToScreen,
    isPointInViewport
} from './utils.js';

/**
 * Generates optimized camera positions that can see common points
 * @param {Object} location - The location data with lat, lon, height
 * @returns {Object} - Camera positions and orientation
 */
function generateCameraPositions(location) {
    console.log("Generating camera positions for location:", location);
    
    // Define a common target point that both cameras will look at
    const targetPoint = Cesium.Cartesian3.fromDegrees(
        location.lon,
        location.lat,
        location.height
    );
    
    // Use very similar heights and a small angle difference for testing
    const camera1Height = location.height + 200; // 200 meters above ground
    const camera2Height = location.height + 190; // Just 10m lower
    const radius = 100; // Closer to target (100m instead of 200m)
    
    // Use a much smaller angle between cameras (15 degrees)
    const camera1Angle = Math.PI / 4; // 45 degrees
    const camera2Angle = camera1Angle + Math.PI / 12; // Just 15 degrees offset
    
    console.log("Camera angles:", 
        camera1Angle * 180 / Math.PI, 
        camera2Angle * 180 / Math.PI, 
        "degrees");
    
    // Calculate camera positions with smaller offset
    const camera1Position = Cesium.Cartesian3.fromDegrees(
        location.lon + (radius/111000) * Math.cos(camera1Angle),
        location.lat + (radius/111000) * Math.sin(camera1Angle),
        camera1Height
    );
    
    const camera2Position = Cesium.Cartesian3.fromDegrees(
        location.lon + (radius/111000) * Math.cos(camera2Angle),
        location.lat + (radius/111000) * Math.sin(camera2Angle),
        camera2Height
    );
    
    // Calculate orientations to look at target
    const camera1Direction = calculateOrientationToTarget(camera1Position, targetPoint);
    const camera2Direction = calculateOrientationToTarget(camera2Position, targetPoint);
    
    // Add a slight pitch adjustment to make views more similar
    camera1Direction.pitch -= 0.05;
    camera2Direction.pitch -= 0.05;
    
    return {
        targetPoint,
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
 * Find and validate matching points between two camera views
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Cesium.Cartesian3} targetPoint - The target point both cameras look at
 * @returns {Promise<Object>} - Matching points and validation info
 */
async function findMatchingPoints(viewer1, viewer2, targetPoint) {
    // Force initial render of both scenes
    viewer1.scene.render();
    viewer2.scene.render();
    
    const matchingPoints = [];
    let debugInfo = { 
        validPoints: 0,
        startTime: Date.now()
    };
    
    // Function to add a matching point - simplified to just handle projection
    function addMatchingPoint(point3D) {
        // Project point to both views
        const view1Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
            viewer1.scene, point3D
        );
        
        const view2Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
            viewer2.scene, point3D
        );
        
        console.log('Projecting point:', {
            point3D,
            view1Pos,
            view2Pos,
            viewerSize: {
                width1: viewer1.canvas.width,
                height1: viewer1.canvas.height,
                width2: viewer2.canvas.width,
                height2: viewer2.canvas.height
            }
        });
        
        // Only add if both projections succeeded and are within the viewport
        if (view1Pos && view2Pos) {
            // Check if points are within the viewport
            const margin = 50;
            const inView1 = view1Pos.x >= margin && 
                          view1Pos.x <= viewer1.canvas.width - margin &&
                          view1Pos.y >= margin && 
                          view1Pos.y <= viewer1.canvas.height - margin;
                          
            const inView2 = view2Pos.x >= margin && 
                          view2Pos.x <= viewer2.canvas.width - margin &&
                          view2Pos.y >= margin && 
                          view2Pos.y <= viewer2.canvas.height - margin;
            
            if (!inView1 || !inView2) {
                console.log('Point outside viewport:', { inView1, inView2 });
                return false;
            }
            
            // Adjust view2Pos for split screen display
            const adjustedView2Pos = { 
                x: view2Pos.x + viewer1.canvas.width,
                y: view2Pos.y
            };
            
            // Add to matching points
            matchingPoints.push({
                point3D,
                view1Pos,
                view2Pos: adjustedView2Pos,
                isCorrect: true  // If we can project it, it's valid
            });
            
            debugInfo.validPoints++;
            return true;
        }
        
        console.log('Projection failed for point');
        return false;
    }
    
    // Add the target point first
    addMatchingPoint(targetPoint);
    
    // Generate a simple pattern of points around the target
    const cartographic = Cesium.Cartographic.fromCartesian(targetPoint);
    const centerLon = Cesium.Math.toDegrees(cartographic.longitude);
    const centerLat = Cesium.Math.toDegrees(cartographic.latitude);
    const centerHeight = cartographic.height;
    
    // Create a tighter pattern of points (closer to center)
    const spacing = 0.0002; // About 20m at equator
    const patternPoints = [
        // Points in a small cross pattern
        Cesium.Cartesian3.fromDegrees(centerLon + spacing, centerLat, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon - spacing, centerLat, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon, centerLat + spacing, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon, centerLat - spacing, centerHeight + 2),
        // Points at 45-degree angles but closer
        Cesium.Cartesian3.fromDegrees(centerLon + spacing * 0.7, centerLat + spacing * 0.7, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon - spacing * 0.7, centerLat + spacing * 0.7, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon + spacing * 0.7, centerLat - spacing * 0.7, centerHeight + 2),
        Cesium.Cartesian3.fromDegrees(centerLon - spacing * 0.7, centerLat - spacing * 0.7, centerHeight + 2)
    ];
    
    // Add all pattern points
    patternPoints.forEach(point => addMatchingPoint(point));
    
    // Return results
    return {
        matchingPoints,
        isValid: debugInfo.validPoints >= MATCH_CRITERIA.minMatchPoints,
        debugInfo: {
            ...debugInfo,
            duration: Date.now() - debugInfo.startTime,
            totalPoints: matchingPoints.length,
            validPoints: debugInfo.validPoints
        }
    };
}

/**
 * Sets up camera views and positioning for both viewers
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Object} location - Location data with lat, lon, height
 * @returns {Promise<Object>} - Setup information including matching points
 */
async function setupCameraViews(viewer1, viewer2, location) {
    // Generate optimized camera positions
    const cameraSetup = generateCameraPositions(location);
    
    // Set up the viewers with calculated positions and orientations
    viewer1.camera.setView({
        destination: cameraSetup.camera1.position,
        orientation: cameraSetup.camera1.orientation
    });
    
    viewer2.camera.setView({
        destination: cameraSetup.camera2.position,
        orientation: cameraSetup.camera2.orientation
    });
    
    // Calculate camera distance
    const distance = Cesium.Cartesian3.distance(
        cameraSetup.camera1.position, 
        cameraSetup.camera2.position
    );
    
    // Set up matching points
    const { matchingPoints, isValid, debugInfo } = await findMatchingPoints(
        viewer1, viewer2, cameraSetup.targetPoint
    );
    
    // Calculate proper altitudes using cartographic conversion
    const cart1 = Cesium.Cartographic.fromCartesian(cameraSetup.camera1.position);
    const cart2 = Cesium.Cartographic.fromCartesian(cameraSetup.camera2.position);
    const altitude1 = Math.round(cart1.height - location.height);
    const altitude2 = Math.round(cart2.height - location.height);
    
    return {
        targetPoint: cameraSetup.targetPoint,
        matchingPoints,
        isValid,
        stats: {
            location: location.name,
            altitude1,
            altitude2,
            distance: Math.round(distance),
            debug: debugInfo
        }
    };
}

// Export functions
export {
    generateCameraPositions,
    findMatchingPoints,
    setupCameraViews
};