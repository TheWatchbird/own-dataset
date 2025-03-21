/**
 * Data export functionality for drone view matching
 */

// Store multiple datasets
let datasetCollection = [];

/**
 * Captures the current state and exports it as a dataset
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Array} matchingPoints - Array of matching points
 * @param {String} locationName - Name of the current location
 * @param {Boolean} addToCollection - Whether to add to collection rather than export directly
 * @returns {Promise} - Promise resolving when export is complete
 */
function exportDataset(viewer1, viewer2, matchingPoints, locationName, addToCollection = false) {
    return new Promise((resolve, reject) => {
        try {
            // Get camera positions and orientations
            const camera1 = viewer1.camera;
            const camera2 = viewer2.camera;
            
            // Create dataset with all necessary information
            const dataset = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    location: locationName,
                    pointCount: matchingPoints.length,
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
                    view1: {
                        x: point.view1Pos.x,
                        y: point.view1Pos.y
                    },
                    view2: {
                        // Get the original viewer2 coordinates (not the adjusted ones used for overlay)
                        // We need the raw coordinates relative to the second viewer
                        x: point.view2Pos.x - viewer1.canvas.clientWidth,
                        y: point.view2Pos.y
                    }
                }))
            };
            
            // Add images from both views (screenshots)
            try {
                // Force additional render cycles to ensure content is visible
                viewer1.scene.render();
                viewer2.scene.render();
                
                // Use a more reliable method to capture the canvas
                // Get the raw canvas elements
                const canvas1 = viewer1.canvas;
                const canvas2 = viewer2.canvas;
                
                // Create a new canvas for each view to ensure proper capture
                const captureCanvas1 = document.createElement('canvas');
                const captureCanvas2 = document.createElement('canvas');
                
                // Set the capture canvas size to match the viewer canvas
                captureCanvas1.width = canvas1.width;
                captureCanvas1.height = canvas1.height;
                captureCanvas2.width = canvas2.width;
                captureCanvas2.height = canvas2.height;
                
                // Get the 2D context for drawing
                const ctx1 = captureCanvas1.getContext('2d');
                const ctx2 = captureCanvas2.getContext('2d');
                
                // Draw the viewer canvas onto the capture canvas
                ctx1.drawImage(canvas1, 0, 0);
                ctx2.drawImage(canvas2, 0, 0);
                
                // Get the data URLs from the capture canvases
                const view1Image = captureCanvas1.toDataURL('image/jpeg', 0.95);  // Higher quality
                const view2Image = captureCanvas2.toDataURL('image/jpeg', 0.95);
                
                // Check if the images are valid (not empty/black)
                if (view1Image.length < 1000 || view2Image.length < 1000) {
                    throw new Error("Captured images appear to be empty or invalid");
                }
                
                dataset.metadata.images = {
                    view1: view1Image,
                    view2: view2Image
                };
                
                // Clean up
                captureCanvas1.remove();
                captureCanvas2.remove();
            } catch (err) {
                console.error("Error capturing view images:", err);
                // Add error info to the dataset
                dataset.metadata.imageError = err.message;
            }
            
            // If adding to collection, store and return
            if (addToCollection) {
                datasetCollection.push(dataset);
                resolve({ 
                    success: true, 
                    collectionSize: datasetCollection.length, 
                    dataset
                });
                return;
            }
            
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
                    
                    // Replace image paths with references to the image files
                    if (cleanDataset.metadata.images) {
                        cleanDataset.metadata.images = {
                            view1: `images/pair_${index + 1}_view1.jpg`,
                            view2: `images/pair_${index + 1}_view2.jpg`
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
                        // Extract base64 data (remove the data:image/jpeg;base64, prefix)
                        const view1Data = dataset.metadata.images.view1.split(',')[1];
                        const view2Data = dataset.metadata.images.view2.split(',')[1];
                        
                        // Add images to the zip
                        imagesFolder.file(`pair_${index + 1}_view1.jpg`, view1Data, {base64: true});
                        imagesFolder.file(`pair_${index + 1}_view2.jpg`, view2Data, {base64: true});
                        
                        // Add a combined side-by-side view for easy comparison
                        // (This will be generated when viewing the dataset)
                        const note = imagesFolder.file(`pair_${index + 1}_README.txt`, 
                            `Pair ${index + 1}\n` + 
                            `Location: ${dataset.metadata.location}\n` +
                            `Timestamp: ${dataset.metadata.timestamp}\n` +
                            `Distance between cameras: ${dataset.metadata.distance}m\n`
                        );
                    } catch (error) {
                        console.warn(`Error processing images for pair ${index + 1}:`, error);
                    }
                }
            });
            
            // Add a simple README file
            zip.file("README.txt", 
                `Drone View Matching Dataset\n` +
                `Generated: ${new Date().toISOString()}\n` +
                `Total Pairs: ${datasetCollection.length}\n\n` +
                `Contents:\n` +
                `- dataset.json: Contains all metadata and point correspondence information\n` +
                `- images/: Contains all view images as JPEG files\n` +
                `  - pair_N_view1.jpg: First perspective of pair N\n` +
                `  - pair_N_view2.jpg: Second perspective of pair N\n\n` +
                `Each pair contains a matching point visible in both views.`
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

// Export functions
export { 
    exportDataset, 
    exportDatasetCollection, 
    clearDatasetCollection, 
    getDatasetCollectionSize 
};