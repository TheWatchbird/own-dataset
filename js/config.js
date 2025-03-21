/**
 * Configuration and constants for the drone view matching application
 */

// Cesium Ion token for accessing the Cesium platform and datasets
const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZGQ5OWViMi1kMzBjLTQyZjAtYTdhNC1jYzZiZWJlMDFjZWEiLCJpZCI6Mjc4NDA5LCJpYXQiOjE3NDAzNDc1MDd9.m8necNbdghgD5_QEIgAp988bm6OjekOVOLYMpC7P1xw';

// Sample locations in Ukraine for drone perspectives
const LOCATIONS = [
    { name: "Kyiv", lon: 30.5234, lat: 50.4501, height: 50 },
    { name: "Lviv", lon: 24.0232, lat: 49.8397, height: 40 },
    { name: "Odessa", lon: 30.7233, lat: 46.4825, height: 30 },
    { name: "Kharkiv", lon: 36.2304, lat: 49.9935, height: 45 },
    { name: "Dnipro", lon: 35.0462, lat: 48.4647, height: 35 },
    { name: "Zaporizhzhia", lon: 35.1394, lat: 47.8388, height: 25 },
    { name: "Vinnytsia", lon: 28.4682, lat: 49.2328, height: 38 },
    { name: "Chernihiv", lon: 31.2893, lat: 51.4982, height: 42 }
];

// Camera positioning parameters
const CAMERA_CONFIG = {
    heightRange: [50, 150],     // Drone height range above ground (in meters)
    distanceRange: [100, 300],  // Distance from target range (in meters)
    angleDiffRange: [30, 90],   // Angular difference between cameras (in degrees)
    maxTries: 20                // Max attempts to find valid points before giving up
};

// Match validation parameters
const MATCH_CRITERIA = {
    minMatchPoints: 3,          // Minimum number of required matching points
    maxErrorDistance: 10,       // Maximum error allowed in matching (in pixels)
    visibilityThreshold: 10     // Threshold for determining visibility (in meters)
};

// Export the constants
export { CESIUM_TOKEN, LOCATIONS, CAMERA_CONFIG, MATCH_CRITERIA };