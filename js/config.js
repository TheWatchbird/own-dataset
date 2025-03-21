/**
 * Configuration and constants for the drone view matching application
 */

// Cesium Ion token for accessing the Cesium platform and datasets
const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZGQ5OWViMi1kMzBjLTQyZjAtYTdhNC1jYzZiZWJlMDFjZWEiLCJpZCI6Mjc4NDA5LCJpYXQiOjE3NDAzNDc1MDd9.m8necNbdghgD5_QEIgAp988bm6OjekOVOLYMpC7P1xw';

// Ukraine bounds (approximate)
const UKRAINE_BOUNDS = {
    minLat: 44.386463, // South
    maxLat: 52.379581, // North
    minLon: 22.137059, // West
    maxLon: 40.227890  // East
};

// Drone camera parameters
const DRONE_PARAMS = {
    heightRange: [100, 300],    // Drone height range (m)
    distanceRange: [100, 400],  // Distance from target (m)
    pitchRange: [-0.6, -0.2],   // Looking down angle (radians, about -35 to -11 degrees)
    minAngleDiff: Math.PI / 6,  // Minimum angle difference between cameras (30 degrees)
    maxAngleDiff: Math.PI * 2/3 // Maximum angle difference (120 degrees)
};

// Match validation parameters
const MATCH_CRITERIA = {
    maxErrorDistance: 10,       // Maximum error allowed in matching (in pixels)
    visibilityThreshold: 10,    // Threshold for determining visibility (in meters)
    minMatchPoints: 1,          // Require exactly one reliable matching point
    marginPercent: 15           // Percentage of viewport to use as margin (prevents points at extreme edges)
};

// Export the constants
export { CESIUM_TOKEN, UKRAINE_BOUNDS, DRONE_PARAMS, MATCH_CRITERIA };