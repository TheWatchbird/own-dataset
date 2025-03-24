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
 *   maxAngleDiff: Math.PI * 2 // 360 degrees
 * }
 * MATCH_CRITERIA = { minMatchPoints: 1 }
 */

/**
 * Find the nearest building to given coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} - Location with lat and lon
 */
// Cache for Overpass API results to avoid rate limiting
const buildingCache = {};
// Set a maximum size for the cache to prevent memory leaks
const MAX_CACHE_SIZE = 1000;
// Track cache keys by age for LRU cache management
const cacheAccessTimes = new Map();

// Rotating endpoints for Overpass API to distribute load
const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",             // Main instance - 10k queries/day limit
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter", // VK Maps - no limits
    "https://overpass.private.coffee/api/interpreter",     // Private.coffee - no rate limit
    "https://overpass.openstreetmap.ru/api/interpreter",   // Russian instance
    "https://overpass.osm.jp/api/interpreter"              // Japan instance
    // Not using Swiss instance as it only covers Switzerland
];
let currentEndpointIndex = 0;
// Track endpoint health and response times
const endpointHealth = OVERPASS_ENDPOINTS.map(endpoint => ({
    url: endpoint,
    failCount: 0,
    lastResponseTime: 0,
    isHealthy: true
}));

// Get the next endpoint in rotation, preferring healthy endpoints with better response times
function getNextOverpassEndpoint() {
    // First check if we have any healthy endpoints
    const healthyEndpoints = endpointHealth.filter(e => e.isHealthy);
    
    if (healthyEndpoints.length === 0) {
        // If all endpoints are unhealthy, reset them and try again
        console.warn("All endpoints marked unhealthy, resetting health status");
        endpointHealth.forEach(e => {
            e.isHealthy = true;
            e.failCount = 0;
        });
        // Just use simple rotation in this case
        const endpoint = OVERPASS_ENDPOINTS[currentEndpointIndex];
        currentEndpointIndex = (currentEndpointIndex + 1) % OVERPASS_ENDPOINTS.length;
        return endpoint;
    }
    
    // Prefer endpoints with faster response times
    healthyEndpoints.sort((a, b) => {
        // If one has no response time data yet, prefer the one with data
        if (a.lastResponseTime === 0) return 1;
        if (b.lastResponseTime === 0) return -1;
        // Otherwise prefer faster endpoints
        return a.lastResponseTime - b.lastResponseTime;
    });
    
    // Select one of the top 3 healthy endpoints randomly to distribute load
    const topCount = Math.min(3, healthyEndpoints.length);
    const selectedIndex = Math.floor(Math.random() * topCount);
    return healthyEndpoints[selectedIndex].url;
}

async function findNearestBuilding(lat, lon) {
    // Round coordinates to reduce cache variations (0.01 degree is roughly 1km)
    const cacheKey = `${Math.round(lat * 10) / 10},${Math.round(lon * 10) / 10}`;
    
    // Enforce LRU cache size limits
    function manageCacheSize() {
        if (Object.keys(buildingCache).length > MAX_CACHE_SIZE) {
            // Get sorted access times
            const sortedEntries = [...cacheAccessTimes.entries()]
                .sort((a, b) => a[1] - b[1]);
                
            // Remove 20% of the oldest entries (not just one) for better batching
            const removeCount = Math.ceil(MAX_CACHE_SIZE * 0.2);
            for (let i = 0; i < removeCount && i < sortedEntries.length; i++) {
                const keyToRemove = sortedEntries[i][0];
                delete buildingCache[keyToRemove];
                cacheAccessTimes.delete(keyToRemove);
            }
            
            console.log(`Cache cleanup: removed ${removeCount} oldest entries, new size: ${Object.keys(buildingCache).length}`);
        }
    }
    
    // Check cache first
    if (buildingCache[cacheKey]) {
        console.log(`Using cached building location for ${cacheKey}`);
        // Update access time for this key
        cacheAccessTimes.set(cacheKey, Date.now());
        return buildingCache[cacheKey];
    }
    
    // Preemptively check if cache needs management
    if (Object.keys(buildingCache).length >= MAX_CACHE_SIZE) {
        manageCacheSize();
    }
    
    // Set a single, large search radius - we don't retry with larger radius
    const radius = 7500; // 7.5km radius, good balance for single search

    // Add a mandatory wait before API call to ensure rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Make a single API request with a fixed radius
    const overpassQuery = `
        [out:json][timeout:25];
        (
            way(around:${radius}, ${lat}, ${lon})["building"];
        );
        out center 1;
    `;
    
    // Get the next endpoint based on health and performance
    const endpoint = getNextOverpassEndpoint();
    const endpointName = endpoint.split('/')[2]; // Extract domain for cleaner logging
    console.log(`Using Overpass endpoint: ${endpointName}`);
    
    const overpassUrl = `${endpoint}?data=${encodeURIComponent(overpassQuery)}`;
    
    // Find the endpoint health object
    const endpointIndex = OVERPASS_ENDPOINTS.findIndex(url => url === endpoint);
    const endpointStats = endpointHealth[endpointIndex];
    const requestStartTime = Date.now();

    try {
        // Use timeout to avoid hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(overpassUrl, {
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));
        
        // Update endpoint response time
        const responseTime = Date.now() - requestStartTime;
        if (endpointStats) {
            endpointStats.lastResponseTime = responseTime;
            console.log(`Endpoint ${endpointName} response time: ${responseTime}ms`);
        }
        
        // Handle various API errors
        if (response.status === 429) {
            // Mark this endpoint as unhealthy due to rate limiting
            if (endpointStats) {
                endpointStats.failCount++;
                if (endpointStats.failCount >= 3) {
                    endpointStats.isHealthy = false;
                    console.warn(`Marking endpoint ${endpointName} as unhealthy due to rate limiting`);
                }
            }
            
            console.warn(`Overpass API endpoint ${endpoint} rate limited. Trying next endpoint.`);
            
            // Instead of failing, try a different endpoint immediately
            // Get another endpoint (different from the one we just used)
            const nextEndpoint = getNextOverpassEndpoint();
            if (nextEndpoint !== endpoint) {
                // If we have multiple endpoints, try again with the next one
                console.log(`Retrying with alternate endpoint: ${nextEndpoint.split('/')[2]}`);
                const altUrl = `${nextEndpoint}?data=${encodeURIComponent(overpassQuery)}`;
                
                // Use timeout for alternate request too
                const altController = new AbortController();
                const altTimeoutId = setTimeout(() => altController.abort(), 10000);
                const altStartTime = Date.now();
                
                try {
                    const altResponse = await fetch(altUrl, {
                        signal: altController.signal
                    }).finally(() => clearTimeout(altTimeoutId));
                    
                    // Update alternate endpoint stats
                    const altIndex = OVERPASS_ENDPOINTS.findIndex(url => url === nextEndpoint);
                    if (altIndex >= 0 && endpointHealth[altIndex]) {
                        endpointHealth[altIndex].lastResponseTime = Date.now() - altStartTime;
                    }
                    
                    if (altResponse.ok) {
                        const altData = await altResponse.json();
                        if (altData.elements && altData.elements.length > 0) {
                            const nearestBuilding = altData.elements[0];
                            const result = {
                                lat: nearestBuilding.center?.lat || lat,
                                lon: nearestBuilding.center?.lon || lon
                            };
                            
                            // Cache the result with timestamp
                            buildingCache[cacheKey] = result;
                            cacheAccessTimes.set(cacheKey, Date.now());
                            
                            return result;
                        } else {
                            console.warn(`No buildings found with alternate endpoint either`);
                        }
                    } else {
                        // Mark alternate endpoint as potentially unhealthy too
                        const altEndpointStats = endpointHealth[altIndex];
                        if (altEndpointStats) {
                            altEndpointStats.failCount++;
                            if (altEndpointStats.failCount >= 3) {
                                altEndpointStats.isHealthy = false;
                                console.warn(`Marking alternate endpoint as unhealthy too`);
                            }
                        }
                        
                        console.warn(`Alternate endpoint ${nextEndpoint.split('/')[2]} also failed with status ${altResponse.status}`);
                    }
                } catch (altError) {
                    console.error(`Error with alternate endpoint: ${altError.message}`);
                    // Mark alternate endpoint as potentially unhealthy too
                    const altIndex = OVERPASS_ENDPOINTS.findIndex(url => url === nextEndpoint);
                    if (altIndex >= 0 && endpointHealth[altIndex]) {
                        endpointHealth[altIndex].failCount++;
                    }
                }
            }
            
            // If we get here, all endpoints failed or we only had one
            throw new Error("All API endpoints rate limited - try different coordinates");
        }
        
        if (!response.ok) {
            // Update endpoint health on error
            if (endpointStats) {
                endpointStats.failCount++;
                if (endpointStats.failCount >= 3) {
                    endpointStats.isHealthy = false;
                    console.warn(`Marking endpoint ${endpointName} as unhealthy due to errors`);
                }
            }
            
            console.warn(`HTTP error from endpoint ${endpoint}! Status: ${response.status}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // Reset fail count on success
        if (endpointStats) {
            endpointStats.failCount = 0;
        }
        
        const data = await response.json();

        if (data.elements.length > 0) {
            const nearestBuilding = data.elements[0];
            const result = {
                lat: nearestBuilding.center?.lat || lat,
                lon: nearestBuilding.center?.lon || lon
            };
            
            // Cache the result with timestamp
            buildingCache[cacheKey] = result;
            cacheAccessTimes.set(cacheKey, Date.now());
            
            return result;
        }
        
        // If no building found with this radius, tell caller to try new coordinates
        throw new Error("No buildings found in this area");
    } catch (error) {
        console.error(`Overpass API error: ${error.message}`);
        throw error; // Propagate the error to caller
    }
}

// Location queue to store pre-generated locations
const locationQueue = [];
const MAX_QUEUE_SIZE = 300;  // Reduced to 300 for better memory management
let locationGeneratorRunning = false;
let pendingApiRequest = false; // Flag to ensure we don't send parallel API requests
let generatorPaused = false;   // Flag to allow pausing generation when not needed
let consecutiveErrors = 0;     // Track consecutive API errors to adjust retry delays
const MAX_CONSECUTIVE_ERRORS = 5; // Threshold to trigger longer backoff

/**
 * Background location generator that keeps the queue filled
 */
function startBackgroundLocationGenerator() {
    if (locationGeneratorRunning) return;
    
    locationGeneratorRunning = true;
    generatorPaused = false;
    
    console.log("Starting background location generator");
    
    // Function to add one location to the queue
    async function addLocationToQueue() {
        // If generator is paused, check again later
        if (generatorPaused) {
            setTimeout(addLocationToQueue, 5000); // Check every 5 seconds when paused
            return;
        }
        
        // Don't exceed queue size limit - use dynamic pause behavior
        if (locationQueue.length >= MAX_QUEUE_SIZE) {
            console.log(`Queue full (${locationQueue.length} locations). Pausing generator for 30 seconds.`);
            generatorPaused = true;
            setTimeout(() => {
                generatorPaused = false;
                console.log("Resuming location generation after pause.");
                addLocationToQueue();
            }, 30000); // Pause for 30 seconds when queue is full
            return;
        }
        
        // If queue is over 80% full, slow down the generation rate
        const slowdownThreshold = MAX_QUEUE_SIZE * 0.8;
        const delayMultiplier = locationQueue.length > slowdownThreshold ? 3 : 1;
        
        // Only allow one API request at a time to avoid rate limiting
        if (pendingApiRequest) {
            setTimeout(addLocationToQueue, 500 * delayMultiplier); // Check again soon, with potential slowdown
            return;
        }
        
        try {
            pendingApiRequest = true; // Mark that we're making an API request
            
            // Use weighted region selection to favor regions with higher success rates
            // For now, just use random selection - in future we could track success rates per region
            const region = GLOBAL_REGIONS[Math.floor(Math.random() * GLOBAL_REGIONS.length)];
            
            // Generate random coordinates within the selected region
            const lat = region.minLat + Math.random() * (region.maxLat - region.minLat);
            const lon = region.minLon + Math.random() * (region.maxLon - region.minLon);
            
            console.log(`[Background] Trying location in region: ${region.name} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
            
            // Track start time for performance monitoring
            const apiStartTime = Date.now();
            
            try {
                // Find nearest building - this has the API call
                const buildingLocation = await findNearestBuilding(lat, lon);
                
                // Track API call duration for performance monitoring
                const apiDuration = Date.now() - apiStartTime;
                console.log(`[Background] Found building in ${region.name} (API call took ${apiDuration}ms)`);
                
                // Reset consecutive error counter on success
                consecutiveErrors = 0;
                
                // 50% chance to apply random shift
                let finalLocation;
                if (Math.random() < 0.5) {
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
                    
                    finalLocation = {
                        name: `${shiftedLat.toFixed(6)},${shiftedLon.toFixed(6)}`,
                        lat: shiftedLat,
                        lon: shiftedLon,
                        height: 0,
                        region: region.name,
                        generatedAt: Date.now() // Add timestamp for age tracking
                    };
                } else {
                    // Return exact building location without shift
                    finalLocation = {
                        name: `${buildingLocation.lat.toFixed(6)},${buildingLocation.lon.toFixed(6)}`,
                        lat: buildingLocation.lat,
                        lon: buildingLocation.lon,
                        height: 0,
                        region: region.name,
                        generatedAt: Date.now() // Add timestamp for age tracking
                    };
                }
                
                // Add to queue
                locationQueue.push(finalLocation);
                console.log(`[Background] Added location to queue. Queue size: ${locationQueue.length}/${MAX_QUEUE_SIZE}`);
                
                // Success - continue with delay based on queue fullness
                pendingApiRequest = false;
                
                // Adapt delay based on how full the queue is
                const queueRatio = locationQueue.length / MAX_QUEUE_SIZE;
                const baseDelay = 2000; // 2 seconds base delay
                const adaptiveDelay = Math.floor(baseDelay + baseDelay * 5 * queueRatio); // Up to 7x slower when queue is full
                
                setTimeout(addLocationToQueue, adaptiveDelay); 
            } catch (error) {
                // This is just a location error, try a different coordinate in the same region
                console.warn(`[Background] No building found, trying new coordinates: ${error.message}`);
                pendingApiRequest = false;
                
                // Increment the consecutive error counter
                consecutiveErrors++;
                
                // Exponential backoff for repeated errors
                const errorDelay = Math.min(
                    consecutiveErrors > MAX_CONSECUTIVE_ERRORS ? 10000 : 500 * Math.pow(1.5, consecutiveErrors),
                    30000 // Cap at 30 seconds
                );
                
                console.log(`[Background] Error backoff: ${Math.round(errorDelay)}ms after ${consecutiveErrors} consecutive errors`);
                setTimeout(addLocationToQueue, errorDelay);
            }
        } catch (outerError) {
            // This is a more serious error with the overall process
            console.warn(`[Background] Error in queue process: ${outerError.message}`);
            pendingApiRequest = false; // Reset flag even on error
            
            // Increment error counter and use longer delay
            consecutiveErrors++;
            const outerErrorDelay = Math.min(3000 * Math.pow(1.5, consecutiveErrors), 60000); // Capped at 1 minute
            
            setTimeout(addLocationToQueue, outerErrorDelay);
        }
    }
    
    // Start the background process
    addLocationToQueue();
    
    // Also start a periodic cleanup process to remove old entries if needed
    setInterval(() => {
        // Clean up any locations older than 30 minutes to ensure freshness
        const now = Date.now();
        const maxAgeMs = 30 * 60 * 1000; // 30 minutes
        
        // Find old locations to remove
        const initialLength = locationQueue.length;
        
        // Filter out old locations
        const freshLocations = locationQueue.filter(loc => 
            !loc.generatedAt || now - loc.generatedAt < maxAgeMs
        );
        
        // Only update if we found stale locations
        if (freshLocations.length < initialLength) {
            // Replace array with fresh locations
            locationQueue.length = 0;
            freshLocations.forEach(loc => locationQueue.push(loc));
            
            console.log(`[Background] Cleaned up ${initialLength - freshLocations.length} stale locations. Queue now has ${locationQueue.length} locations.`);
        }
    }, 5 * 60 * 1000); // Run every 5 minutes
}

/**
 * Generate a random point within one of the global regions
 * @returns {Promise<Object>} - Location with lat, lon, and ground height
 */
async function generateRandomLocation() {
    // Start background generator if not already running
    if (!locationGeneratorRunning) {
        startBackgroundLocationGenerator();
    }
    
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

    // Check if we have locations in the queue
    if (locationQueue.length > 0) {
        // Get a location from the queue
        // Use a more sophisticated selection strategy: 
        // Sometimes pick randomly from queue to add diversity, rather than always FIFO
        let location;
        
        if (locationQueue.length > 10 && Math.random() < 0.2) {
            // 20% chance to pick a random location when queue has plenty of options
            const randomIndex = Math.floor(Math.random() * locationQueue.length);
            location = locationQueue.splice(randomIndex, 1)[0];
            statusElement.textContent = `Using random pre-generated location (${locationQueue.length} more in queue)`;
        } else {
            // Standard FIFO behavior
            location = locationQueue.shift();
            statusElement.textContent = `Using pre-generated location (${locationQueue.length} more in queue)`;
        }
        
        console.log(`Selected location from queue: region=${location.region}`);
        
        // If location is too old (more than 2 hours), generate a fresh one instead
        if (location.generatedAt && Date.now() - location.generatedAt > 2 * 60 * 60 * 1000) {
            console.log(`Location was generated ${Math.round((Date.now() - location.generatedAt)/60000)} minutes ago, getting a fresh one`);
            // Let it fall through to synchronous generation
        } else {
            return location;
        }
    }
    
    // If queue is empty or location was too old, generate a location synchronously
    statusElement.textContent = "Queue empty or stale, generating fresh location...";
    
    // Log warning about empty queue - this should ideally never happen
    if (locationQueue.length === 0) {
        console.warn("Location queue is empty! Background generator may not be working properly.");
    }
    
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
        retryCount++;
        
        // Select a random region from the GLOBAL_REGIONS array
        const region = GLOBAL_REGIONS[Math.floor(Math.random() * GLOBAL_REGIONS.length)];
        
        // Generate random coordinates within the selected region
        const lat = region.minLat + Math.random() * (region.maxLat - region.minLat);
        const lon = region.minLon + Math.random() * (region.maxLon - region.minLon);

        statusElement.textContent = `Finding location in: ${region.name} (attempt ${retryCount}/${maxRetries})`;
        console.log(`Trying location in region: ${region.name} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);

        try {
            statusElement.textContent = `Searching for buildings near ${lat.toFixed(4)}, ${lon.toFixed(4)} in ${region.name}...`;
            
            // Use a tighter timeout for synchronous generation to avoid UI blocking
            const buildingLocationPromise = findNearestBuilding(lat, lon);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Building search timed out")), 5000)
            );
            
            // Race the building search against a timeout
            const buildingLocation = await Promise.race([buildingLocationPromise, timeoutPromise]);
            
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
                    region: region.name,
                    generatedAt: Date.now()
                };
            } else {
                // Return exact building location without shift
                return {
                    name: `${buildingLocation.lat.toFixed(6)},${buildingLocation.lon.toFixed(6)}`,
                    lat: buildingLocation.lat,
                    lon: buildingLocation.lon,
                    height: 0,
                    // Add region info but don't modify the name property
                    region: region.name,
                    generatedAt: Date.now()
                };
            }
        } catch (error) {
            console.warn(`Retry ${retryCount}/${maxRetries} failed: ${error.message}`);
            statusElement.textContent = `No buildings found in ${region.name}, trying again...`;
        }
    }
    
    // If we've exhausted all retries and still don't have a location,
    // throw an error that the caller can handle
    throw new Error(`Failed to generate location after ${maxRetries} attempts`);
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
                // First, clear event listeners which can cause memory leaks
                if (this.viewer.camera && this.viewer.camera.moveEnd && this.viewer.camera.moveEnd._listeners) {
                    this.viewer.camera.moveEnd._listeners = [];
                }
                if (this.viewer.camera && this.viewer.camera.changed && this.viewer.camera.changed._listeners) {
                    this.viewer.camera.changed._listeners = [];
                }
                
                // Remove all entities
                if (this.viewer.entities) {
                    this.viewer.entities.removeAll();
                }
                
                // Remove primitives from the scene
                if (this.viewer.scene && this.viewer.scene.primitives) {
                    const primitives = this.viewer.scene.primitives;
                    for (let i = primitives.length - 1; i >= 0; i--) {
                        try {
                            primitives.remove(primitives.get(i));
                        } catch (e) {
                            console.warn("Error removing primitive:", e);
                        }
                    }
                }
                
                // Clear any data sources
                if (this.viewer.dataSources) {
                    this.viewer.dataSources.removeAll();
                }
                
                // Clear any imageryLayer event listeners
                if (this.viewer.imageryLayers) {
                    const layers = this.viewer.imageryLayers;
                    for (let i = layers.length - 1; i >= 0; i--) {
                        try {
                            const layer = layers.get(i);
                            if (layer.imageryProvider && layer.imageryProvider.errorEvent) {
                                layer.imageryProvider.errorEvent.removeEventListener();
                            }
                        } catch (e) {
                            console.warn("Error cleaning up imagery layer:", e);
                        }
                    }
                }
                
                // Finally destroy the viewer
                this.viewer.destroy();
                this.viewer = null;
                
                // Suggest a garbage collection after a short delay
                setTimeout(() => {
                    console.log("Viewer destroyed and resources cleaned up");
                    // Can't directly call GC in JavaScript, but this helps hint that it's a good time
                    if (window.gc) window.gc();
                }, 100);
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
     * @param {Number} timeout - Optional timeout in milliseconds (default: 5000)
     * @param {Number} qualityLevel - Optional quality level (default: 1.5, lower = higher quality)
     * @returns {Promise} Promise that resolves when loaded or timeout is reached
     */
    waitForLoad(timeout = 5000, qualityLevel = 1.5) {
        return new Promise(resolve => {
            if (!this.viewer || !this.viewer.scene) {
                resolve(); // No viewer, resolve immediately
                return;
            }
            
            const scene = this.viewer.scene;
            const globe = scene.globe;
            
            // Force a specific detail level based on the qualityLevel parameter
            if (globe) {
                globe.maximumScreenSpaceError = qualityLevel;
            }

            // Set a maximum wait time to avoid hanging
            const timeoutId = setTimeout(() => {
                if (!hasResolved) {
                    console.log("Scene load timeout reached, continuing anyway");
                    hasResolved = true;
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                    }
                    if (removeListener) {
                        removeListener();
                    }
                    resolve();
                }
            }, timeout);

            // If scene is already loaded, resolve immediately
            if (globe.tilesLoaded) {
                clearTimeout(timeoutId);
                resolve();
                return;
            }
            
            // Track if we've resolved yet
            let hasResolved = false;
            let animationFrameId = null;
            let removeListener = null;
            let framesWithTilesLoaded = 0;  // Count frames where tiles are loaded
            const requiredStableFrames = 3;  // Require multiple stable frames to ensure loading is really done
            
            // Use requestAnimationFrame to check tile loading status
            const checkTilesLoaded = () => {
                // If already resolved, stop checking
                if (hasResolved) return;
                
                // Check if tiles are loaded
                if (globe.tilesLoaded) {
                    framesWithTilesLoaded++;
                    
                    // Require multiple consecutive frames with tiles loaded
                    // This prevents flickering between loaded/not loaded states
                    if (framesWithTilesLoaded >= requiredStableFrames) {
                        hasResolved = true;
                        clearTimeout(timeoutId);
                        if (removeListener) {
                            removeListener();
                        }
                        resolve();
                        return;
                    }
                } else {
                    // Reset counter if tiles aren't loaded in this frame
                    framesWithTilesLoaded = 0;
                }
                
                // Continue checking in next animation frame
                animationFrameId = requestAnimationFrame(checkTilesLoaded);
            };
            
            // Start the checking process
            animationFrameId = requestAnimationFrame(checkTilesLoaded);
            
            // Also listen to the tileLoadProgressEvent as a backup
            if (globe.tileLoadProgressEvent) {
                removeListener = globe.tileLoadProgressEvent.addEventListener(() => {
                    // Just trigger a check - don't resolve directly,
                    // since we want to make sure tiles stay loaded for multiple frames
                    if (!hasResolved) {
                        // Force a check on the next frame
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                        }
                        animationFrameId = requestAnimationFrame(checkTilesLoaded);
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
    
    // Get precise 2D coordinates of our 3D virtual object in both views
    // This is the critical step to get accurate projection coordinates
    viewer1.scene.render();
    viewer2.scene.render();
    
    // Project the 3D position to 2D screen coordinates in both views
    const view1Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
        viewer1.scene, 
        sceneSetup.virtualObject
    );
    
    const view2Pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
        viewer2.scene, 
        sceneSetup.virtualObject
    );
    
    // Project 3D points to 2D coordinates
    
    // Get the correct width of the second viewer's viewport
    const view2Width = viewer2.canvas.clientWidth;
    
    // For the visualization overlay, we need to adjust the second viewer's coordinates
    // to account for the split screen layout where the second view is positioned
    // to the right of the first view
    const adjustedView2Pos = view2Pos ? { 
        x: view2Pos.x + viewer1.canvas.clientWidth, // Add full width of first viewer
        y: view2Pos.y
    } : null;
    
    // Adjust view2 coordinates for overlay visualization
    
    // Create the matching point data structure using the direct projections
    const matchingPoint = {
        point3D: sceneSetup.virtualObject,
        view1Pos: view1Pos,
        view2Pos: adjustedView2Pos,
        isCorrect: true,
        // Note if either point is outside the standard viewport bounds
        isForcedMatch: !view1Pos || !view2Pos || 
            !isInViewport(view1Pos, viewer1.canvas.width/2, viewer1.canvas.height) ||
            !isInViewport(view2Pos, viewer2.canvas.width/2, viewer2.canvas.height)
    };
    
    const matchingPoints = [matchingPoint];
    const isValid = view1Pos && view2Pos;
    
    // Create debug info
    const debugInfo = {
        duration: 0,
        totalPoints: matchingPoints.length,
        validPoints: isValid ? 1 : 0,
        inView1: view1Pos ? true : false,
        inView2: view2Pos ? true : false,
        finalView1Pos: view1Pos ? { x: Math.round(view1Pos.x), y: Math.round(view1Pos.y) } : null,
        finalView2Pos: view2Pos ? { x: Math.round(view2Pos.x), y: Math.round(view2Pos.y) } : null
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
            region: location.region || "Unknown Region", // Add region info to stats
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

// Function to get the current queue size - safer than exporting the raw queue
function getLocationQueueSize() {
    return locationQueue.length;
}

// Function to clear the queue
function clearLocationQueue() {
    locationQueue.length = 0;
}

// Function to pause the location generator
function pauseLocationGenerator() {
    generatorPaused = true;
    console.log("Location generator paused");
}

// Function to resume the location generator
function resumeLocationGenerator() {
    generatorPaused = false;
    console.log("Location generator resumed");
}

// Function to get endpoint health status
function getEndpointHealthStatus() {
    return endpointHealth.map(endpoint => ({
        url: endpoint.url.split('/')[2], // Extract domain for cleaner display
        isHealthy: endpoint.isHealthy,
        failCount: endpoint.failCount,
        lastResponseTime: endpoint.lastResponseTime 
    }));
}

// Function to manually reset endpoint health
function resetEndpointHealth() {
    endpointHealth.forEach(endpoint => {
        endpoint.isHealthy = true;
        endpoint.failCount = 0;
    });
    console.log("Endpoint health status reset");
    return true;
}

// Function to get cache stats
function getCacheStats() {
    return {
        size: Object.keys(buildingCache).length,
        maxSize: MAX_CACHE_SIZE,
        oldestEntry: cacheAccessTimes.size > 0 ? 
            Math.min(...cacheAccessTimes.values()) : null,
        newestEntry: cacheAccessTimes.size > 0 ?
            Math.max(...cacheAccessTimes.values()) : null
    };
}

export {
    generateRandomLocation,
    generateCameraPositions,
    findMatchingPoints,
    setupCameraViews,
    CameraView,
    startBackgroundLocationGenerator,
    getLocationQueueSize,
    clearLocationQueue,
    pauseLocationGenerator,
    resumeLocationGenerator,
    getEndpointHealthStatus,
    resetEndpointHealth,
    getCacheStats
};
