/**
 * Data export functionality for drone view matching
 */

/**
 * Captures the current state and exports it as a dataset
 * @param {Cesium.Viewer} viewer1 - First Cesium viewer
 * @param {Cesium.Viewer} viewer2 - Second Cesium viewer
 * @param {Array} matchingPoints - Array of matching points
 * @param {String} locationName - Name of the current location
 * @returns {Promise} - Promise resolving when export is complete
 */
function exportDataset(viewer1, viewer2, matchingPoints, locationName) {
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
                const view1Image = viewer1.canvas.toDataURL('image/jpeg', 0.8);
                const view2Image = viewer2.canvas.toDataURL('image/jpeg', 0.8);
                
                dataset.metadata.images = {
                    view1: view1Image,
                    view2: view2Image
                };
            } catch (err) {
                console.error("Error capturing view images:", err);
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

// Export functions
export { exportDataset };