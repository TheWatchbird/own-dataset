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

// View-specific settings for visual differentiation
const VIEW_SETTINGS = {
    view1: {
        name: "Drone View 1",
        globe: {
            nightFadeOutDistance: 40000,
            nightFadeInDistance: 10000,
            atmosphereLightIntensity: 2.0,
            atmosphereHueShift: 0.0,
            atmosphereSaturationShift: 0.2,
            enableLighting: true
        },
        fog: {
            density: 0.0001,
            minimumBrightness: 0.2
        },
        imageryAdjustments: {
            brightness: 1.0,
            contrast: 1.0,
            hue: 0.0,
            saturation: 1.0,
            gamma: 1.0
        }
    },
    view2: {
        name: "Drone View 2",
        globe: {
            nightFadeOutDistance: 1.0,
            nightFadeInDistance: 1.0,
            atmosphereLightIntensity: 5.0,
            atmosphereHueShift: 0.15,
            atmosphereSaturationShift: 0.8,
            enableLighting: true
        },
        fog: {
            density: 0.0005,
            minimumBrightness: 0.01
        },
        imageryAdjustments: {
            brightness: 1.1,
            contrast: 1.2,
            hue: 0.0,
            saturation: 1.3,
            gamma: 0.8
        }
    }
};

// Common Cesium viewer settings
const VIEWER_SETTINGS1 = {
    infoBox: false,
    selectionIndicator: false,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    homeButton: false,
    fullscreenButton: false
};
const VIEWER_SETTINGS2 = {
    imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        enablePickFeatures: false
    }),
    infoBox: false,
    selectionIndicator: false,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    geocoder: false,
    homeButton: false,
    fullscreenButton: false
}
// Export the constants
export { 
    CESIUM_TOKEN, 
    UKRAINE_BOUNDS, 
    DRONE_PARAMS, 
    MATCH_CRITERIA, 
    VIEW_SETTINGS,
    VIEWER_SETTINGS1,
    VIEWER_SETTINGS2,
};