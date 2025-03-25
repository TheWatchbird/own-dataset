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
 * Checks if a 3D point is visible from a camera position using view frustum checks
 * @param {Cesium.Cartesian3} point - The point to check visibility for
 * @param {Cesium.Cartesian3} cameraPosition - The camera position
 * @param {Cesium.Cartesian3} cameraDirection - The camera's view direction
 * @param {Cesium.Cartesian3} cameraUp - The camera's up vector
 * @returns {Boolean} - True if the point is visible, false otherwise
 */
function isPointVisibleFromCamera(point, cameraPosition, cameraDirection, cameraUp) {
    // Calculate vector from camera to point
    const toPoint = Cesium.Cartesian3.subtract(
        point, 
        cameraPosition, 
        new Cesium.Cartesian3()
    );
    
    // Normalize the vector
    Cesium.Cartesian3.normalize(toPoint, toPoint);
    
    // Calculate dot product with camera direction
    const dotProduct = Cesium.Cartesian3.dot(toPoint, cameraDirection);
    
    // Point is behind camera if dot product is negative or very close to 0
    if (dotProduct < 0.1) return false; // Allow slightly behind camera
    
    // Calculate right vector (cross product of up and direction)
    const right = Cesium.Cartesian3.cross(cameraDirection, cameraUp, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(right, right);
    
    // Calculate horizontal angle (should be within ±75 degrees)
    const horizontalDot = Cesium.Cartesian3.dot(toPoint, right);
    if (Math.abs(horizontalDot) > 0.966) return false; // cos(75°) ≈ 0.966
    
    // Calculate vertical angle using camera direction
    const verticalDot = Cesium.Cartesian3.dot(toPoint, cameraDirection);
    const verticalAngle = Math.acos(verticalDot);
    
    // Check if vertical angle is within reasonable range (about ±60 degrees)
    if (verticalAngle > Math.PI/3) return false;
    
    return true;
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

/**
 * Detects if an image (specifically the left view) is blurry using multiple detection techniques
 * @param {String} imageDataUrl - The image data URL to check
 * @returns {Promise<boolean>} - Promise resolving to true if image is clear, false if blurry
 */
function detectBlurryImage(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            // Create canvas for analysis
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Get appropriate dimensions
            const MAX_WIDTH = 400; // Slightly larger for better accuracy
            const scale = Math.min(1, MAX_WIDTH / img.width);
            const width = Math.floor(img.width * scale);
            const height = Math.floor(img.height * scale);
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get image data - analyze left side where blurriness tends to occur
            const leftPartWidth = Math.floor(width * 0.35); // Left 35% of image
            const imageData = ctx.getImageData(0, 0, leftPartWidth, height);
            const data = imageData.data;
            
            // First convert entire region to grayscale for analysis
            const grayscaleBuffer = new Uint8Array(leftPartWidth * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < leftPartWidth; x++) {
                    const idx = (y * leftPartWidth + x) * 4;
                    // Standard grayscale conversion weights
                    grayscaleBuffer[y * leftPartWidth + x] = 
                        Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
                }
            }
            
            // METHOD 1: Variance-based detection (statistical approach)
            let variance = calculateVariance(grayscaleBuffer, leftPartWidth, height);
            
            // METHOD 2: Edge-based detection using Laplacian filter
            let edgeScore = detectEdges(grayscaleBuffer, leftPartWidth, height);
            
            // METHOD 3: Block-based detection - analyze different regions
            // Divide the left region into 4 blocks and calculate the best score
            const blockScores = analyzeImageBlocks(grayscaleBuffer, leftPartWidth, height, 2, 2);
            
            // Determine if image is blurry using all methods
            const varianceThreshold = 150; // Higher variance = more detail
            const edgeThreshold = 10;      // Higher edge score = more detail
            const blockThreshold = 18;     // Higher block score = more detail
            
            const isBlurryByVariance = variance < varianceThreshold;
            const isBlurryByEdges = edgeScore < edgeThreshold;
            const isBlurryByBlocks = blockScores.maxScore < blockThreshold;
            
            // Combined decision - an image is blurry if at least 2 methods say so
            const blurCount = (isBlurryByVariance ? 1 : 0) + 
                             (isBlurryByEdges ? 1 : 0) + 
                             (isBlurryByBlocks ? 1 : 0);
            const isBlurry = blurCount >= 2;
            
            // Log the results
            console.log(`Blur detection results:
- Variance: ${variance.toFixed(2)} (threshold: ${varianceThreshold}, blurry: ${isBlurryByVariance})
- Edge Score: ${edgeScore.toFixed(2)} (threshold: ${edgeThreshold}, blurry: ${isBlurryByEdges}) 
- Block Score: ${blockScores.maxScore.toFixed(2)} (threshold: ${blockThreshold}, blurry: ${isBlurryByBlocks})
- FINAL RESULT: ${isBlurry ? 'BLURRY (SKIPPING)' : 'CLEAR (KEEPING)'}`);
            
            // Return true if image is clear, false if blurry
            resolve(!isBlurry);
        };
        
        img.onerror = function() {
            console.error("Error loading image for blur detection");
            resolve(true); // Default to accepting image on error
        };
        
        img.src = imageDataUrl;
    });
    
    // Helper function to calculate variance (measure of detail)
    function calculateVariance(grayscale, width, height) {
        let sum = 0;
        let squareSum = 0;
        let count = width * height;
        
        // Calculate mean and mean of squares
        for (let i = 0; i < count; i++) {
            sum += grayscale[i];
            squareSum += grayscale[i] * grayscale[i];
        }
        
        const mean = sum / count;
        const variance = (squareSum / count) - (mean * mean);
        return variance;
    }
    
    // Helper function to detect edges using a Laplacian filter
    function detectEdges(grayscale, width, height) {
        let edgeSum = 0;
        let count = 0;
        
        // Skip the border pixels
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const center = grayscale[y * width + x];
                
                // 3x3 Laplacian kernel (approximation)
                const top = grayscale[(y - 1) * width + x];
                const bottom = grayscale[(y + 1) * width + x];
                const left = grayscale[y * width + (x - 1)];
                const right = grayscale[y * width + (x + 1)];
                
                // Calculate edge response using a Laplacian approximation 
                // (center pixel * 4 - surrounding pixels)
                const laplacian = Math.abs(4 * center - top - bottom - left - right);
                
                edgeSum += laplacian;
                count++;
            }
        }
        
        return edgeSum / count;
    }
    
    // Helper function to analyze image blocks
    function analyzeImageBlocks(grayscale, width, height, blocksX, blocksY) {
        let scores = [];
        const blockWidth = Math.floor(width / blocksX);
        const blockHeight = Math.floor(height / blocksY);
        
        for (let blockY = 0; blockY < blocksY; blockY++) {
            for (let blockX = 0; blockX < blocksX; blockX++) {
                let blockSum = 0;
                let blockCount = 0;
                
                const startX = blockX * blockWidth;
                const startY = blockY * blockHeight;
                const endX = startX + blockWidth;
                const endY = startY + blockHeight;
                
                // Skip the border pixels within each block to avoid edge effects
                for (let y = Math.max(1, startY); y < Math.min(endY, height - 1); y++) {
                    for (let x = Math.max(1, startX); x < Math.min(endX, width - 1); x++) {
                        const center = grayscale[y * width + x];
                        
                        // Simple edge detection within block
                        const top = grayscale[(y - 1) * width + x];
                        const bottom = grayscale[(y + 1) * width + x];
                        const left = grayscale[y * width + (x - 1)];
                        const right = grayscale[y * width + (x + 1)];
                        
                        // Calculate edge strength
                        const edgeStrength = 
                            Math.abs(center - top) + 
                            Math.abs(center - bottom) + 
                            Math.abs(center - left) + 
                            Math.abs(center - right);
                        
                        blockSum += edgeStrength;
                        blockCount++;
                    }
                }
                
                const blockScore = blockCount > 0 ? blockSum / blockCount : 0;
                scores.push({
                    x: blockX,
                    y: blockY,
                    score: blockScore
                });
            }
        }
        
        // Sort blocks by score
        scores.sort((a, b) => b.score - a.score);
        
        return {
            blocks: scores,
            maxScore: scores.length > 0 ? scores[0].score : 0,
            avgScore: scores.reduce((sum, block) => sum + block.score, 0) / scores.length
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
    calculateMatchQuality,
    detectBlurryImage
};