/**
 * Configuration and constants for the drone view matching application
 */

// Cesium Ion token for accessing the Cesium platform and datasets
const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZGQ5OWViMi1kMzBjLTQyZjAtYTdhNC1jYzZiZWJlMDFjZWEiLCJpZCI6Mjc4NDA5LCJpYXQiOjE3NDAzNDc1MDd9.m8necNbdghgD5_QEIgAp988bm6OjekOVOLYMpC7P1xw';

// Global regions with diverse populated areas and good satellite imagery
const GLOBAL_REGIONS = [
    /*
    // North America
    { name: "Western US", minLat: 33.0, maxLat: 42.0, minLon: -124.0, maxLon: -115.0 }, // California, Oregon, Nevada
    { name: "Eastern US", minLat: 35.0, maxLat: 43.0, minLon: -82.0, maxLon: -70.0 }, // Eastern Seaboard
    { name: "Central US", minLat: 38.0, maxLat: 45.0, minLon: -98.0, maxLon: -87.0 }, // Great Plains and Midwest
    */
    
    // Europe
    { name: "Western Europe", minLat: 43.0, maxLat: 52.0, minLon: -5.0, maxLon: 10.0 }, // France, Germany, Spain
    { name: "UK and Ireland", minLat: 50.0, maxLat: 59.0, minLon: -10.0, maxLon: 2.0 },
    { name: "Mediterranean", minLat: 35.0, maxLat: 45.0, minLon: 9.0, maxLon: 25.0 }, // Italy, Greece
    { name: "Eastern Europe", minLat: 45.0, maxLat: 55.0, minLon: 15.0, maxLon: 30.0 }, // Poland, Romania, Hungary, etc.
    { name: "Ukraine", minLat: 44.0, maxLat: 52.0, minLon: 22.0, maxLon: 40.0 },
    
    // Russia (Larger Regions)
    { name: "European Russia", minLat: 50.0, maxLat: 60.0, minLon: 30.0, maxLon: 60.0 }, // Western Russia including Moscow
    { name: "Southern Russia", minLat: 43.0, maxLat: 50.0, minLon: 35.0, maxLon: 60.0 }, // Black Sea to Volga
    { name: "Ural Region", minLat: 53.0, maxLat: 58.0, minLon: 55.0, maxLon: 65.0 }, // Yekaterinburg area
    { name: "Siberian Russia", minLat: 53.0, maxLat: 60.0, minLon: 75.0, maxLon: 90.0 }, // Novosibirsk, Omsk
    { name: "Far East Russia", minLat: 42.0, maxLat: 50.0, minLon: 130.0, maxLon: 140.0 }, // Vladivostok, Khabarovsk
    
    /*
    // Asia
    { name: "Japan", minLat: 32.0, maxLat: 41.0, minLon: 130.0, maxLon: 142.0 },
    { name: "Southeast Asia", minLat: -6.0, maxLat: 6.0, minLon: 95.0, maxLon: 110.0 }, // Indonesia, Malaysia
    { name: "India", minLat: 8.0, maxLat: 28.0, minLon: 70.0, maxLon: 87.0 },
    
    // Middle East
    { name: "Middle East", minLat: 24.0, maxLat: 33.0, minLon: 35.0, maxLon: 55.0 }, // Israel, UAE, etc.
    
    // Australia and Oceania
    { name: "Eastern Australia", minLat: -38.0, maxLat: -28.0, minLon: 145.0, maxLon: 153.0 },
    { name: "New Zealand", minLat: -47.0, maxLat: -34.0, minLon: 166.0, maxLon: 178.0 },
    
    // Africa
    { name: "South Africa", minLat: -34.0, maxLat: -25.0, minLon: 16.0, maxLon: 32.0 },
    { name: "East Africa", minLat: -5.0, maxLat: 5.0, minLon: 32.0, maxLon: 42.0 }, // Kenya, Tanzania
    
    // South America
    { name: "Brazil", minLat: -25.0, maxLat: -10.0, minLon: -55.0, maxLon: -40.0 },
    { name: "Argentina", minLat: -40.0, maxLat: -30.0, minLon: -70.0, maxLon: -55.0 },
    */
    
    // China 
    { name: "Eastern China", minLat: 25.0, maxLat: 40.0, minLon: 110.0, maxLon: 125.0 }
];

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
            nightFadeOutDistance: Math.random() * 50000 + 10000,  // Random between 10000-60000
            nightFadeInDistance: Math.random() * 20000 + 5000,   // Random between 5000-25000
            atmosphereLightIntensity: Math.random() * 4.0 + 1.0,  // Random between 1.0-5.0
            atmosphereHueShift: Math.random() * 0.3 - 0.15,      // Random between -0.15 to 0.15
            atmosphereSaturationShift: Math.random() * 0.8 + 0.2, // Random between 0.2-1.0
            enableLighting: true
        },
        fog: {
            density: Math.random() * 0.0002 + 0.0001,           // Random between 0.0001-0.0003 (reduced range)
            minimumBrightness: Math.random() * 0.1 + 0.15       // Random between 0.15-0.25 (increased minimum)
        },
        imageryAdjustments: {
            brightness: Math.random() * 0.2 + 0.9,              // Random between 0.9-1.1 (narrower range)
            contrast: Math.random() * 0.2 + 1.0,                // Random between 1.0-1.2 (narrower range)
            hue: Math.random() * 0.1 - 0.05,                    // Random between -0.05 to 0.05 (reduced range)
            saturation: Math.random() * 0.3 + 1.0,              // Random between 1.0-1.3 (reduced range)
            gamma: Math.random() * 0.1 + 0.95                   // Random between 0.95-1.05 (centered around 1.0)
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
    GLOBAL_REGIONS, 
    DRONE_PARAMS, 
    MATCH_CRITERIA, 
    VIEW_SETTINGS,
    VIEWER_SETTINGS1,
    VIEWER_SETTINGS2,
};
