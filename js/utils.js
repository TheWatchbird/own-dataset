/**
 * Utility functions for the drone view matching application
 */

/**
 * Calculates orientation needed to look at a target point from a camera position
 * @param {Cesium.Cartesian3} cameraPosition - The camera position
 * @param {Cesium.Cartesian3} targetPoint - The target point to look at
 * @returns {Object} - The orientation as heading, pitch, roll
 */
function calculateOrientationToTarget(cameraPosition, targetPoint) {
    // Calculate direction vector from camera to target
    const direction = Cesium.Cartesian3.subtract(
        targetPoint, 
        cameraPosition, 
        new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(direction, direction);
    
    // Calculate transform matrix
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(cameraPosition);
    const inverseTransform = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    
    // Convert to local coordinates
    const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
        inverseTransform,
        direction,
        new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(localDirection, localDirection);
    
    // Convert to heading and pitch
    const heading = Math.atan2(localDirection.y, localDirection.x);
    const pitch = Math.asin(localDirection.z);
    
    return {
        heading: heading,
        pitch: pitch,
        roll: 0
    };
}

/**
 * Checks if a 3D point is visible from a camera position using ray casting
 * @param {Cesium.Scene} scene - The Cesium scene
 * @param {Cesium.Cartesian3} cameraPosition - The camera position
 * @param {Cesium.Cartesian3} point - The point to check visibility for
 * @returns {Boolean} - True if the point is visible, false otherwise
 */
function isPointVisibleFromCamera(scene, cameraPosition, point) {
    // Create ray from camera to point
    const direction = Cesium.Cartesian3.subtract(
        point, 
        cameraPosition, 
        new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(direction, direction);
    
    // Create ray
    const ray = new Cesium.Ray(cameraPosition, direction);
    
    // Check for intersection with terrain
    const result = scene.globe.pick(ray, scene);
    
    // If no intersection, point is not visible
    if (!result) return false;
    
    // Check if the intersection point is close to our target point (within threshold)
    const distance = Cesium.Cartesian3.distance(result, point);
    return distance < 10.0; // If less than 10 meters, consider it visible
}

/**
 * Creates a 3D point with an offset from a reference point
 * @param {Cesium.Cartesian3} referencePoint - The reference point
 * @param {Number} distance - Distance from reference in meters
 * @param {Number} angle - Angle in radians
 * @param {Number} heightOffset - Vertical offset in meters
 * @returns {Cesium.Cartesian3} - The new point
 */
function createOffsetPoint(referencePoint, distance, angle, heightOffset = 0) {
    const cartographic = Cesium.Cartographic.fromCartesian(referencePoint);
    
    // Convert to degrees and apply offset
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    
    // 111000 meters is roughly 1 degree at the equator
    return Cesium.Cartesian3.fromDegrees(
        longitude + (distance/111000) * Math.cos(angle),
        latitude + (distance/111000) * Math.sin(angle),
        cartographic.height + heightOffset
    );
}

/**
 * Generates a set of random 3D points near a reference point
 * @param {Cesium.Cartesian3} referencePoint - The central reference point
 * @param {Number} count - Number of points to generate
 * @param {Number} maxDistance - Maximum distance from reference in meters
 * @param {Number} maxHeight - Maximum height offset in meters
 * @returns {Array} - Array of Cartesian3 points
 */
function generateRandomPointsNear(referencePoint, count, maxDistance, maxHeight) {
    const points = [];
    
    for (let i = 0; i < count; i++) {
        const distance = Math.random() * maxDistance;
        const angle = Math.random() * Math.PI * 2;
        const heightOffset = (Math.random() * 2 - 1) * maxHeight;
        
        points.push(createOffsetPoint(referencePoint, distance, angle, heightOffset));
    }
    
    return points;
}

/**
 * Validates if a point is within the viewport bounds
 * @param {Object} point - The 2D point with x, y coordinates
 * @param {Number} width - Viewport width
 * @param {Number} height - Viewport height
 * @returns {Boolean} - True if the point is within bounds
 */
function isPointInViewport(point, width, height) {
    // Allow a margin outside the viewport (useful for points that are slightly off-screen)
    const margin = 50; // 50px margin
    
    return point && 
           isFinite(point.x) && isFinite(point.y) &&
           point.x >= -margin && point.x <= width + margin &&
           point.y >= -margin && point.y <= height + margin;
}

/**
 * Projects a 3D point to 2D screen coordinates
 * @param {Cesium.Scene} scene - The Cesium scene
 * @param {Cesium.Cartesian3} point3D - The 3D point to project
 * @returns {Object|null} - The 2D point or null if projection fails
 */
function projectPointToScreen(scene, point3D) {
    const point2D = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, point3D);
    
    if (!point2D || !isFinite(point2D.x) || !isFinite(point2D.y)) {
        return null;
    }
    
    return point2D;
}

/**
 * Calculates the quality of a match between two view points
 * @param {Array} matchingPoints - Array of matching points
 * @returns {Object} - Quality assessment
 */
function calculateMatchQuality(matchingPoints) {
    if (!matchingPoints || matchingPoints.length === 0) {
        return { quality: 'bad', reason: 'No matching points' };
    }
    
    // Count different types of points
    const validPoints = matchingPoints.filter(p => p.isCorrect);
    const forcedPoints = matchingPoints.filter(p => p.isForced);
    const invalidPoints = matchingPoints.filter(p => !p.isCorrect && !p.isForced);
    
    console.log("Match quality assessment:");
    console.log("- Valid points:", validPoints.length);
    console.log("- Forced points:", forcedPoints.length);
    console.log("- Invalid points:", invalidPoints.length);
    
    // Different quality levels
    if (validPoints.length >= 3) {
        return { 
            quality: 'good', 
            reason: `${validPoints.length} validated points - excellent match` 
        };
    } else if (validPoints.length > 0) {
        return { 
            quality: 'good', 
            reason: `${validPoints.length} validated point(s) - good match` 
        };
    } else if (forcedPoints.length > 0 && forcedPoints.length === matchingPoints.length) {
        return { 
            quality: 'bad', 
            reason: 'Only random forced points - no real matches' 
        };
    } else {
        return { 
            quality: 'bad', 
            reason: `No validated points, only approximations` 
        };
    }
}

// Export utility functions
export { 
    calculateOrientationToTarget,
    isPointVisibleFromCamera,
    createOffsetPoint,
    generateRandomPointsNear,
    isPointInViewport,
    projectPointToScreen,
    calculateMatchQuality
};