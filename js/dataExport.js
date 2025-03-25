/**
 * Data export functionality for drone view matching
 */

// Store multiple datasets
let datasetCollection = [];

// File System Access API handle to the selected directory
let directoryHandle = null;

/**
 * Checks if the File System Access API is supported by the browser
 * @returns {Boolean} - True if supported, false otherwise
 */
function isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window;
}

/**
 * Requests directory access from the user
 * @returns {Promise<FileSystemDirectoryHandle>} - Promise resolving to directory handle
 */
async function requestDirectoryAccess() {
    try {
        // Check support first
        if (!isFileSystemAccessSupported()) {
            throw new Error("File System Access API not supported by your browser. Please use Chrome, Edge or another Chromium-based browser.");
        }
        
        // Request the user to select a directory
        directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });
        
        return directoryHandle;
    } catch (error) {
        console.error("Directory access error:", error);
        throw error;
    }
}

/**
 * Checks if we have directory access and requests it if needed
 * @returns {Promise<Boolean>} - Promise resolving to true if we have access
 */
async function ensureDirectoryAccess() {
    // If we already have a directory handle, verify we still have permission
    if (directoryHandle) {
        try {
            // Check if permission is still granted
            const options = { mode: 'readwrite' };
            const permissionStatus = await directoryHandle.requestPermission(options);
            
            if (permissionStatus === 'granted') {
                return true;
            }
            // If permission was revoked, try to request access again
            directoryHandle = null;
        } catch (error) {
            console.warn("Permission verification failed:", error);
            directoryHandle = null;
        }
    }
    
    // Request directory access
    try {
        await requestDirectoryAccess();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Save file directly to the selected directory using File System Access API
 * @param {String} filename - Name of the file to save
 * @param {Blob|String} content - Content to save (Blob or String)
 * @param {String} subfolderName - Optional subfolder name
 * @returns {Promise} - Promise resolving when the file is saved
 */
async function saveFileToDirectory(filename, content, subfolderName = null) {
    if (!directoryHandle) {
        throw new Error("No directory access. Please select a directory first.");
    }
    
    try {
        let targetDirHandle = directoryHandle;
        
        // Create subfolder if needed
        if (subfolderName) {
            try {
                targetDirHandle = await directoryHandle.getDirectoryHandle(subfolderName, { create: true });
            } catch (error) {
                console.error(`Error creating subfolder ${subfolderName}:`, error);
                // Fall back to root directory
                targetDirHandle = directoryHandle;
            }
        }
        
        // Get a file handle
        const fileHandle = await targetDirHandle.getFileHandle(filename, { create: true });
        
        // Create a writable stream
        const writable = await fileHandle.createWritable();
        
        // Convert content to proper format if it's not a Blob
        let writeContent = content;
        
        if (typeof content === 'string') {
            if (content.startsWith('data:')) {
                // Handle data URLs (like from canvas.toDataURL)
                try {
                    // Extract the content type and base64 data
                    const matches = content.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matches || matches.length !== 3) {
                        throw new Error('Invalid data URL format');
                    }
                    
                    const contentType = matches[1];
                    const base64Data = matches[2];
                    
                    // Decode base64
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    
                    // Convert to byte array
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Create blob with correct MIME type
                    writeContent = new Blob([bytes.buffer], { type: contentType });
                } catch (error) {
                    console.error('Error converting data URL to blob:', error);
                    // Fallback to plain text if conversion fails
                    writeContent = new Blob([content], { type: 'text/plain' });
                }
            } else {
                // Plain text content
                writeContent = new Blob([content], { type: 'text/plain' });
            }
        }
        
        // Write the content and close the stream
        await writable.write(writeContent);
        await writable.close();
        
        return { success: true, path: `${subfolderName ? subfolderName + '/' : ''}${filename}` };
    } catch (error) {
        console.error("Error saving file:", error);
        throw error;
    }
}

/**
 * Captures the current state and exports it as a dataset
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Array} matchingPoints - Array of matching points
 * @param {String} locationName - Name of the current location
 * @param {Boolean} addToCollection - Whether to add to collection rather than export directly
 * @param {String} cleanView1Image - Clean screenshot of view1 without entities
 * @param {String} cleanView2Image - Clean screenshot of view2 without entities
 * @param {String} debugView1 - Debug screenshot of view1 with entities
 * @param {String} debugView2 - Debug screenshot of view2 with entities
 * @param {Number} pairIndex - Optional index for the pair when using File System Access API
 * @returns {Promise} - Promise resolving when export is complete
 */
function exportDataset(
    viewer1, 
    viewer2, 
    matchingPoints, 
    locationName, 
    addToCollection = false,
    cleanView1Image = null,
    cleanView2Image = null,
    debugView1 = null,
    debugView2 = null,
    pairIndex = null
) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get camera positions and orientations
            const camera1 = viewer1.camera;
            const camera2 = viewer2.camera;
            
            // Get viewport dimensions for percentage calculations
            const view1Width = viewer1.canvas.clientWidth;
            const view1Height = viewer1.canvas.clientHeight;
            const view2Width = viewer2.canvas.clientWidth;
            const view2Height = viewer2.canvas.clientHeight;
            
            // Create dataset with all necessary information
            const dataset = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    location: locationName,
                    pointCount: matchingPoints.length,
                    viewportDimensions: {
                        view1: { width: view1Width, height: view1Height },
                        view2: { width: view2Width, height: view2Height }
                    },
                    cameras: {
                        camera1: {
                            position: {
                                x: camera1.position.x,
                                y: camera1.position.y,
                                z: camera1.position.z
                            },
                            heading: camera1.heading,
                            pitch: camera1.pitch,
                            roll: camera1.roll
                        },
                        camera2: {
                            position: {
                                x: camera2.position.x,
                                y: camera2.position.y,
                                z: camera2.position.z
                            },
                            heading: camera2.heading,
                            pitch: camera2.pitch,
                            roll: camera2.roll
                        }
                    },
                    distance: parseFloat(document.getElementById('camera-distance').textContent)
                },
                matchingPoints: matchingPoints.map(point => ({
                    point3D: {
                        x: point.point3D.x,
                        y: point.point3D.y, 
                        z: point.point3D.z
                    },
                    pointType: point.pointType || 'center', // Include point type (corner, mid, center)
                    view1: {
                        // Convert to relative coordinates (0-1)
                        x: point.view1Pos.x / view1Width,
                        y: point.view1Pos.y / view1Height
                    },
                    view2: {
                        // Convert to relative coordinates (0-1)
                        // Get the original viewer2 coordinates (not the adjusted ones used for overlay)
                        x: (point.view2Pos.x - viewer1.canvas.clientWidth) / view2Width,
                        y: point.view2Pos.y / view2Height
                    },
                    isCorrect: point.isCorrect,
                    isForcedMatch: point.isForcedMatch
                })),
                virtualObjectInfo: matchingPoints.length > 1 ? {
                    type: "rectangle",
                    dimensions: {
                        width: 50, // Width in meters
                        length: 50, // Length in meters
                        height: 2   // Height in meters
                    },
                    pointCount: matchingPoints.length,
                    pointTypes: matchingPoints.map(point => point.pointType || "unknown")
                } : undefined
            };
            
            // Add the provided images - either externally provided or captured now
            try {
                // If external images are provided, use them
                if (cleanView1Image && cleanView2Image && debugView1 && debugView2) {
                    // Create a combined debug image
                    const debugCombined = await createCombinedImage(debugView1, debugView2);
                    
                    // Store only clean images and combined debug image
                    dataset.metadata.images = {
                        view1_clean: cleanView1Image,
                        view2_clean: cleanView2Image,
                        combined_debug: debugCombined
                    };
                } else {
                    // Fallback to standard screenshot capture if not provided
                    // We need to capture both clean and debug versions
                    
                    // First, completely hide all entities for clean screenshots
                    const entities1 = viewer1.entities.values.slice();
                    const entities2 = viewer2.entities.values.slice();
                    
                    // Hide all entities
                    for (const entity of entities1) {
                        entity.show = false;
                    }
                    for (const entity of entities2) {
                        entity.show = false;
                    }
                    
                    // Also hide any primitives that might be visible
                    const primitiveCollections1 = viewer1.scene.primitives._primitives;
                    const primitiveCollections2 = viewer2.scene.primitives._primitives;
                    
                    // Save original visibility state
                    const originalPrimitiveVisibility1 = primitiveCollections1.map(p => p.show);
                    const originalPrimitiveVisibility2 = primitiveCollections2.map(p => p.show);
                    
                    // Hide all primitive collections except essential ones (like terrain)
                    for (let i = 0; i < primitiveCollections1.length; i++) {
                        const p = primitiveCollections1[i];
                        // Only hide visualization primitives, keep terrain and imagery
                        if (!(p instanceof Cesium.Globe) && 
                            !(p instanceof Cesium.SkyBox) && 
                            !(p instanceof Cesium.SkyAtmosphere)) {
                            p.show = false;
                        }
                    }
                    
                    for (let i = 0; i < primitiveCollections2.length; i++) {
                        const p = primitiveCollections2[i];
                        if (!(p instanceof Cesium.Globe) && 
                            !(p instanceof Cesium.SkyBox) && 
                            !(p instanceof Cesium.SkyAtmosphere)) {
                            p.show = false;
                        }
                    }
                    
                    // Force multiple renders to ensure everything is hidden
                    viewer1.scene.render();
                    viewer2.scene.render();
                    
                    // Additional render cycle to be absolutely sure
                    viewer1.scene.render();
                    viewer2.scene.render();
                    
                    // Capture clean screenshots
                    const cleanView1Image = viewer1.canvas.toDataURL('image/jpeg', 0.95);
                    const cleanView2Image = viewer2.canvas.toDataURL('image/jpeg', 0.95);
                    
                    // Restore original visibility for entities
                    for (const entity of entities1) {
                        entity.show = true;
                    }
                    for (const entity of entities2) {
                        entity.show = true;
                    }
                    
                    // Restore primitive collections visibility
                    for (let i = 0; i < primitiveCollections1.length; i++) {
                        if (i < originalPrimitiveVisibility1.length) {
                            primitiveCollections1[i].show = originalPrimitiveVisibility1[i];
                        }
                    }
                    
                    for (let i = 0; i < primitiveCollections2.length; i++) {
                        if (i < originalPrimitiveVisibility2.length) {
                            primitiveCollections2[i].show = originalPrimitiveVisibility2[i];
                        }
                    }
                    
                    // Force multiple renders to ensure everything is visible again
                    viewer1.scene.render();
                    viewer2.scene.render();
                    
                    // Additional render cycle to be absolutely sure
                    viewer1.scene.render();
                    viewer2.scene.render();
                    
                    // Capture debug views
                    const debugView1 = viewer1.canvas.toDataURL('image/jpeg', 0.95);
                    const debugView2 = viewer2.canvas.toDataURL('image/jpeg', 0.95);
                    
                    // Create combined debug image
                    const debugCombined = await createCombinedImage(debugView1, debugView2);
                    
                    // Check if the images are valid
                    if (cleanView1Image.length < 1000 || cleanView2Image.length < 1000) {
                        throw new Error("Captured images appear to be empty or invalid");
                    }
                    
                    // Store only clean images and combined debug image
                    dataset.metadata.images = {
                        view1_clean: cleanView1Image,
                        view2_clean: cleanView2Image,
                        combined_debug: debugCombined
                    };
                }
            } catch (err) {
                console.error("Error processing images:", err);
                // Add error info to the dataset
                dataset.metadata.imageError = err.message;
            }
            
            // If adding to collection, store and return
            if (addToCollection && directoryHandle === null) {
                datasetCollection.push(dataset);
                resolve({ 
                    success: true, 
                    collectionSize: datasetCollection.length, 
                    dataset
                });
                return;
            }
            
            // If we have direct file system access and a pair index, save directly to the directory
            if (directoryHandle !== null && dataset.metadata.images) {
                try {
                    // Format the pair number and location for folder name
                    const locationStr = locationName.replace(/[^0-9.,]/g, '');
                    const pairNum = pairIndex !== null ? pairIndex + 1 : new Date().getTime();
                    const folderName = `pair_${pairNum}_${locationStr}`;
                    
                    // Save images
                    if (dataset.metadata.images.view1_clean) {
                        await saveFileToDirectory('view1.jpg', dataset.metadata.images.view1_clean, folderName);
                        await saveFileToDirectory('view2.jpg', dataset.metadata.images.view2_clean, folderName);
                        await saveFileToDirectory('debug.jpg', dataset.metadata.images.combined_debug, folderName);
                    }
                    
                    // Create a clean version of the dataset without the image data URLs
                    const cleanDataset = JSON.parse(JSON.stringify(dataset));
                    if (cleanDataset.metadata.images) {
                        cleanDataset.metadata.images = {
                            view1: 'view1.jpg',
                            view2: 'view2.jpg',
                            debug: 'debug.jpg'
                        };
                    }
                    
                    // Save metadata
                    const pairData = {
                        metadata: {
                            index: pairNum,
                            location: dataset.metadata.location,
                            timestamp: dataset.metadata.timestamp,
                            distance: dataset.metadata.distance,
                            cameras: dataset.metadata.cameras,
                            virtualObjectInfo: dataset.virtualObjectInfo
                        },
                        matchingPoints: dataset.matchingPoints
                    };
                    
                    await saveFileToDirectory('metadata.json', 
                        JSON.stringify(pairData, null, 2), 
                        folderName
                    );
                    
                    // Save README
                    await saveFileToDirectory('README.txt', 
                        `Pair ${pairNum}\n` + 
                        `GPS Coordinates: ${dataset.metadata.location}\n` +
                        `Timestamp: ${dataset.metadata.timestamp}\n` +
                        `Distance between cameras: ${dataset.metadata.distance}m\n` +
                        `Files:\n` +
                        `- view1.jpg: Clean image from first view (no markers or entities)\n` +
                        `- view2.jpg: Clean image from second view (no markers or entities)\n` +
                        `- debug.jpg: Combined side-by-side debug view with markers\n` +
                        `- metadata.json: Point correspondence and camera data\n`, 
                        folderName
                    );
                    
                    resolve({ 
                        success: true, 
                        path: folderName,
                        savedDirectly: true
                    });
                    return;
                } catch (error) {
                    console.error("Error saving to directory:", error);
                    // Fall back to collection if directory save fails
                    if (addToCollection) {
                        datasetCollection.push(dataset);
                        resolve({ 
                            success: true, 
                            collectionSize: datasetCollection.length, 
                            dataset,
                            directSaveError: error.message
                        });
                        return;
                    }
                }
            }
            
            // Default behavior - triggered download (when not using File System API)
            if (directoryHandle === null) {
                // Create and trigger download
                const dataStr = "data:text/json;charset=utf-8," + 
                    encodeURIComponent(JSON.stringify(dataset, null, 2));
                
                const filename = `drone_matching_${locationName.replace(/\s+/g, '_')}_${new Date().getTime()}.json`;
                
                const downloadLink = document.createElement('a');
                downloadLink.setAttribute("href", dataStr);
                downloadLink.setAttribute("download", filename);
                document.body.appendChild(downloadLink);
                downloadLink.click();
                downloadLink.remove();
                
                resolve({ success: true, filename });
            } else {
                // If we have directory access but got here, it means there was an error
                reject(new Error("Failed to save dataset directly to directory"));
            }
            
        } catch (error) {
            console.error("Export error:", error);
            reject(error);
        }
    });
}

/**
 * Exports the entire collection as a zip archive with images and JSON
 * @returns {Promise} - Promise resolving when export is complete
 */
function exportDatasetCollection() {
    return new Promise((resolve, reject) => {
        try {
            if (datasetCollection.length === 0) {
                throw new Error("No datasets in collection to export");
            }
            
            // Create a clean version of the collection without image data for the JSON file
            const cleanedCollection = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    count: datasetCollection.length,
                    description: "Drone view matching dataset collection"
                },
                datasets: datasetCollection.map((dataset, index) => {
                    // Create a deep copy without the images
                    const cleanDataset = JSON.parse(JSON.stringify(dataset));
                    
                    // Replace image paths with references to the image files in the new folder structure
                    if (cleanDataset.metadata.images) {
                        const locationStr = dataset.metadata.location.replace(/[^0-9.,]/g, '');
                        cleanDataset.metadata.images = {
                            view1: `images/pair_${index + 1}_${locationStr}/view1.jpg`,
                            view2: `images/pair_${index + 1}_${locationStr}/view2.jpg`,
                            debug: `images/pair_${index + 1}_${locationStr}/debug.jpg`
                        };
                    }
                    
                    return cleanDataset;
                })
            };
            
            // Create a new JSZip instance
            const zip = new JSZip();
            
            // Add the JSON metadata file
            zip.file("dataset.json", JSON.stringify(cleanedCollection, null, 2));
            
            // Create images folder
            const imagesFolder = zip.folder("images");
            
            // Add images for each dataset
            datasetCollection.forEach((dataset, index) => {
                if (dataset.metadata.images) {
                    try {
                        // Create directories for each pair with GPS coordinates in the name
                    const locationStr = dataset.metadata.location.replace(/[^0-9.,]/g, '');
                    const pairFolder = imagesFolder.folder(`pair_${index + 1}_${locationStr}`);
                    
                    // Add different image types based on what's available
                    if (dataset.metadata.images.view1_clean) {
                        // New format with clean images + combined debug
                        const clean1Data = dataset.metadata.images.view1_clean.split(',')[1];
                        const clean2Data = dataset.metadata.images.view2_clean.split(',')[1];
                        const combinedDebugData = dataset.metadata.images.combined_debug.split(',')[1];
                        
                        // Add clean images and combined debug image to the pair folder
                        pairFolder.file(`view1.jpg`, clean1Data, {base64: true});
                        pairFolder.file(`view2.jpg`, clean2Data, {base64: true});
                        pairFolder.file(`debug.jpg`, combinedDebugData, {base64: true});
                    } else {
                        // Legacy format with just view1/view2
                        const view1Data = dataset.metadata.images.view1.split(',')[1];
                        const view2Data = dataset.metadata.images.view2.split(',')[1];
                        
                        // Add basic images
                        pairFolder.file(`view1.jpg`, view1Data, {base64: true});
                        pairFolder.file(`view2.jpg`, view2Data, {base64: true});
                    }
                        
                        // Add a JSON file with pair metadata and points
                        const pairData = {
                            metadata: {
                                index: index + 1,
                                location: dataset.metadata.location,
                                timestamp: dataset.metadata.timestamp,
                                distance: dataset.metadata.distance,
                                cameras: dataset.metadata.cameras,
                                virtualObjectInfo: dataset.virtualObjectInfo
                            },
                            matchingPoints: dataset.matchingPoints
                        };
                        
                        pairFolder.file(`metadata.json`, JSON.stringify(pairData, null, 2));
                        
                        // Add a simple text README with GPS coordinates
                        pairFolder.file(`README.txt`, 
                            `Pair ${index + 1}\n` + 
                            `GPS Coordinates: ${dataset.metadata.location}\n` +
                            `Timestamp: ${dataset.metadata.timestamp}\n` +
                            `Distance between cameras: ${dataset.metadata.distance}m\n` +
                            `Files:\n` +
                            `- view1.jpg: Clean image from first view (no markers or entities)\n` +
                            `- view2.jpg: Clean image from second view (no markers or entities)\n` +
                            `- debug.jpg: Combined side-by-side debug view with markers\n` +
                            `- metadata.json: Point correspondence and camera data\n`
                        );
                    } catch (error) {
                        console.warn(`Error processing images for pair ${index + 1}:`, error);
                    }
                }
            });
            
            // Add a detailed README file
            zip.file("README.txt", 
                `Drone View Matching Dataset\n` +
                `Generated: ${new Date().toISOString()}\n` +
                `Total Pairs: ${datasetCollection.length}\n\n` +
                `Contents:\n` +
                `- dataset.json: Contains all metadata and point correspondence information\n` +
                `- images/: Contains folders for each image pair\n` +
                `  - pair_N_[coordinates]: Folder for each pair with its GPS coordinates\n` +
                `    - view1.jpg: Clean image from first camera perspective\n` +
                `    - view2.jpg: Clean image from second camera perspective\n` +
                `    - debug.jpg: Combined debug view with visible markers\n` +
                `    - metadata.json: Camera positions and point correspondence data\n\n` +
                `Each pair contains a 3D point projected onto both views, with clean images\n` +
                `having no visible markers, and the debug image showing the matched point.\n\n` +
                `Dataset Structure:\n` +
                `- Points are placed at real geographic coordinates in Ukraine\n` +
                `- Camera positions simulate drone flights at different altitudes and angles\n` +
                `- Camera distance ranges from 100-400m\n` +
                `- Images are captured with different viewing angles of 30-120 degrees apart\n`
            );
            
            // Generate the zip file
            zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            }).then(function(content) {
                // Save the zip file
                const timestamp = new Date().getTime();
                const filename = `drone_dataset_collection_${datasetCollection.length}_pairs_${timestamp}.zip`;
                
                // Use FileSaver.js to save the blob
                saveAs(content, filename);
                
                // Reset collection after download
                datasetCollection = [];
                
                resolve({ success: true, filename, count: cleanedCollection.metadata.count });
            }).catch(error => {
                reject(error);
            });
            
        } catch (error) {
            console.error("Collection export error:", error);
            reject(error);
        }
    });
}

/**
 * Clears the current dataset collection
 */
function clearDatasetCollection() {
    datasetCollection = [];
}

/**
 * Gets the current dataset collection size
 * @returns {Number} - Number of datasets in collection
 */
function getDatasetCollectionSize() {
    return datasetCollection.length;
}

/**
 * Create a single combined image from two images for debug view
 * @param {String} image1 - First image data URL
 * @param {String} image2 - Second image data URL
 * @returns {Promise<String>} - Promise resolving to the combined image data URL
 */
function createCombinedImage(image1, image2) {
    return new Promise((resolve, reject) => {
        // Create two image elements to load the data URLs
        const img1 = new Image();
        const img2 = new Image();
        
        // Count loaded images
        let loadedCount = 0;
        
        // Function to handle image loading
        function handleImageLoad() {
            loadedCount++;
            
            // Once both images are loaded, combine them
            if (loadedCount === 2) {
                // Create a canvas for the combined image
                const canvas = document.createElement('canvas');
                
                // Use the sum of the widths and the max height
                canvas.width = img1.width + img2.width;
                canvas.height = Math.max(img1.height, img2.height);
                
                // Get the context for drawing
                const ctx = canvas.getContext('2d');
                
                // Fill with black background
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw the images side by side
                ctx.drawImage(img1, 0, 0);
                ctx.drawImage(img2, img1.width, 0);
                
                // Add a dividing line
                ctx.beginPath();
                ctx.moveTo(img1.width, 0);
                ctx.lineTo(img1.width, canvas.height);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Add labels
                ctx.font = '20px Arial';
                ctx.fillStyle = 'white';
                ctx.fillText('View 1', 10, 30);
                ctx.fillText('View 2', img1.width + 10, 30);
                
                // Get the data URL and resolve the promise
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            }
        }
        
        // Set up error handling
        function handleError() {
            reject(new Error('Failed to load images for combining'));
        }
        
        // Set up event handlers
        img1.onload = handleImageLoad;
        img1.onerror = handleError;
        img2.onload = handleImageLoad;
        img2.onerror = handleError;
        
        // Set the sources to start loading
        img1.src = image1;
        img2.src = image2;
    });
}

// Export functions
export { 
    exportDataset, 
    exportDatasetCollection, 
    clearDatasetCollection, 
    getDatasetCollectionSize,
    createCombinedImage,
    requestDirectoryAccess,
    ensureDirectoryAccess,
    isFileSystemAccessSupported
};