/**
 * Dataset Cleaner Tool
 * A simple tool for visualizing dataset image pairs and deleting bad ones
 */

// Main state object for the application
const state = {
    folderHandle: null,        // File System Access API directory handle
    datasetPairs: [],          // Array of all dataset pairs
    deletedPairs: new Set(),   // Set of deleted pair indices
    currentIndex: -1,          // Currently selected pair index
    loadingComplete: false,    // Flag to track if dataset loading is complete
};

// DOM elements
const elements = {
    selectFolder: document.getElementById('select-folder'),
    exportDeletedList: document.getElementById('export-deleted-list'),
    resetDeleted: document.getElementById('reset-deleted'),
    permanentlyDeleteBtn: document.getElementById('permanently-delete'),
    status: document.getElementById('status'),
    totalCount: document.getElementById('total-count'),
    deletedCount: document.getElementById('deleted-count'),
    remainingCount: document.getElementById('remaining-count'),
    currentIndexDisplay: document.getElementById('current-index'),
    datasetList: document.getElementById('dataset-list'),
    datasetDetails: document.getElementById('dataset-details'),
    view1Image: document.getElementById('view1-image'),
    view2Image: document.getElementById('view2-image'),
    view1Container: document.getElementById('view1-container'),
    view2Container: document.getElementById('view2-container'),
    deletePair: document.getElementById('delete-pair'),
    restorePair: document.getElementById('restore-pair'),
    viewDebug: document.getElementById('view-debug'),
    prevPair: document.getElementById('prev-pair'),
    nextPair: document.getElementById('next-pair'),
    metadata: document.getElementById('metadata'),
    listLoader: document.getElementById('list-loader'),
    progressBar: document.getElementById('progress-bar'),
    progressContainer: document.getElementById('progress-container'),
    progressText: document.getElementById('progress-text'),
    imageModal: document.getElementById('image-modal'),
    modalImage: document.getElementById('modal-image'),
    modalClose: document.getElementById('modal-close'),
    overlay: document.getElementById('overlay'),
    confirmDialog: document.getElementById('confirm-dialog'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmOk: document.getElementById('confirm-ok'),
};

/**
 * Initialize the application
 */
function init() {
    // Check if File System Access API is supported
    if (!('showDirectoryPicker' in window)) {
        updateStatus('Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.', 'error');
        elements.selectFolder.disabled = true;
        return;
    }

    // Set up event listeners
    setupEventListeners();

    // Check for previously stored deleted pairs in localStorage
    loadDeletedPairsFromStorage();
}

/**
 * Set up event listeners for all interactive elements
 */
function setupEventListeners() {
    // Main controls
    elements.selectFolder.addEventListener('click', handleSelectFolder);
    elements.exportDeletedList.addEventListener('click', exportDeletedList);
    elements.resetDeleted.addEventListener('click', resetDeletedPairs);
    elements.permanentlyDeleteBtn.addEventListener('click', permanentlyDeleteFiles);

    // Navigation and actions
    elements.deletePair.addEventListener('click', handleDeletePair);
    elements.restorePair.addEventListener('click', handleRestorePair);
    elements.viewDebug.addEventListener('click', handleViewDebug);
    elements.prevPair.addEventListener('click', () => navigatePair(-1));
    elements.nextPair.addEventListener('click', () => navigatePair(1));

    // Image zoom functionality
    elements.view1Image.addEventListener('click', () => toggleZoom(elements.view1Container));
    elements.view2Image.addEventListener('click', () => toggleZoom(elements.view2Container));

    // Modal functionality
    elements.modalClose.addEventListener('click', closeModal);
    elements.imageModal.addEventListener('click', event => {
        if (event.target === elements.imageModal) {
            closeModal();
        }
    });

    // Confirmation dialog
    elements.confirmCancel.addEventListener('click', closeConfirmDialog);
}

/**
 * Handle folder selection via the File System Access API
 */
async function handleSelectFolder() {
    try {
        // Reset current state
        state.datasetPairs = [];
        state.currentIndex = -1;
        elements.datasetList.innerHTML = '';
        elements.metadata.textContent = '';
        elements.view1Image.src = '';
        elements.view2Image.src = '';
        
        // Show loader
        elements.listLoader.style.display = 'block';
        updateStatus('Selecting folder...', 'info');

        // Request directory access
        state.folderHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });

        updateStatus(`Loading dataset from: ${state.folderHandle.name}`, 'info');
        
        // Scan the directory for dataset pairs
        await scanDirectory();
        
        // Update UI and stats
        updateStats();
        
        // Enable export and reset buttons if we have data
        if (state.datasetPairs.length > 0) {
            elements.exportDeletedList.disabled = false;
            elements.resetDeleted.disabled = false;
            
            // Select the first non-deleted pair
            selectFirstAvailablePair();
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        elements.listLoader.style.display = 'none';
    }
}

/**
 * Scan the selected directory for dataset pairs
 */
async function scanDirectory() {
    try {
        state.loadingComplete = false;
        
        // Get all subdirectories in the main folder
        const pairFolders = [];
        for await (const entry of state.folderHandle.values()) {
            if (entry.kind === 'directory' && entry.name.startsWith('pair_')) {
                pairFolders.push(entry);
            }
        }
        
        // Sort folders by their index number (pair_X_...)
        pairFolders.sort((a, b) => {
            const indexA = parseInt(a.name.split('_')[1]) || 0;
            const indexB = parseInt(b.name.split('_')[1]) || 0;
            return indexA - indexB;
        });
        
        updateStatus(`Found ${pairFolders.length} potential dataset pairs. Loading...`, 'info');
        
        // Process each folder to extract information
        for (const folder of pairFolders) {
            try {
                const pairData = await loadPairData(folder);
                state.datasetPairs.push(pairData);
                
                // Update the UI with this pair
                addPairToList(pairData, state.datasetPairs.length - 1);
                
                // Update status periodically
                if (state.datasetPairs.length % 10 === 0) {
                    updateStatus(`Loaded ${state.datasetPairs.length} of ${pairFolders.length} pairs...`, 'info');
                }
            } catch (error) {
                console.warn(`Error loading pair ${folder.name}:`, error);
                // Continue with the next pair
            }
        }
        
        state.loadingComplete = true;
        elements.listLoader.style.display = 'none';
        
        if (state.datasetPairs.length === 0) {
            updateStatus('No valid dataset pairs found in the selected folder.', 'error');
        } else {
            updateStatus(`Successfully loaded ${state.datasetPairs.length} dataset pairs.`, 'success');
        }
    } catch (error) {
        console.error('Error scanning directory:', error);
        updateStatus(`Error scanning directory: ${error.message}`, 'error');
        elements.listLoader.style.display = 'none';
    }
}

/**
 * Load a single pair's data from its folder
 * @param {FileSystemDirectoryHandle} folderHandle - Directory handle for the pair
 * @returns {Object} Pair data object
 */
async function loadPairData(folderHandle) {
    // Initialize pair data object
    const pairData = {
        name: folderHandle.name,
        folder: folderHandle,
        metadata: null,
        view1Url: null,
        view2Url: null,
        debugUrl: null,
    };
    
    // Read metadata.json
    try {
        const metadataFile = await folderHandle.getFileHandle('metadata.json');
        const metadataContents = await metadataFile.getFile();
        const metadataText = await metadataContents.text();
        pairData.metadata = JSON.parse(metadataText);
    } catch (error) {
        console.warn(`No metadata.json found in ${folderHandle.name}:`, error);
        // Create minimal metadata
        pairData.metadata = {
            metadata: {
                index: parseInt(folderHandle.name.split('_')[1]) || 0,
                location: folderHandle.name.split('_')[2] || 'Unknown',
            }
        };
    }
    
    // Get image file handles
    try {
        const view1File = await folderHandle.getFileHandle('view1.jpg');
        const view2File = await folderHandle.getFileHandle('view2.jpg');
        
        // Create object URLs for the images
        pairData.view1Url = URL.createObjectURL(await view1File.getFile());
        pairData.view2Url = URL.createObjectURL(await view2File.getFile());
        
        // Try to get debug image if available
        try {
            const debugFile = await folderHandle.getFileHandle('debug.jpg');
            pairData.debugUrl = URL.createObjectURL(await debugFile.getFile());
        } catch (e) {
            // Debug image is optional
            console.info(`No debug image found in ${folderHandle.name}`);
        }
    } catch (error) {
        throw new Error(`Required image files not found in ${folderHandle.name}: ${error.message}`);
    }
    
    return pairData;
}

/**
 * Add a pair to the dataset list UI
 * @param {Object} pairData - Pair data object
 * @param {Number} index - Index in the datasetPairs array
 */
function addPairToList(pairData, index) {
    const isDeleted = state.deletedPairs.has(index);
    
    const item = document.createElement('div');
    item.className = `dataset-item${isDeleted ? ' deleted' : ''}`;
    item.dataset.index = index;
    
    // Extract pair number
    const pairNumber = pairData.metadata.metadata?.index || parseInt(pairData.name.split('_')[1]) || index + 1;
    
    // Format GPS if available
    let locationStr = 'Unknown';
    if (pairData.metadata.metadata?.location) {
        locationStr = pairData.metadata.metadata.location;
    }
    
    item.innerHTML = `
        <span>Pair ${pairNumber} <small>${locationStr}</small></span>
        <span>${isDeleted ? '🗑️' : ''}</span>
    `;
    
    item.addEventListener('click', () => selectPair(index));
    elements.datasetList.appendChild(item);
}

/**
 * Select a pair and display its details
 * @param {Number} index - Index of the pair to select
 */
function selectPair(index) {
    if (index < 0 || index >= state.datasetPairs.length) {
        return;
    }
    
    // Update current index
    state.currentIndex = index;
    elements.currentIndexDisplay.textContent = index + 1;
    
    // Update list selection
    const items = elements.datasetList.querySelectorAll('.dataset-item');
    items.forEach(item => item.classList.remove('selected'));
    
    const selectedItem = elements.datasetList.querySelector(`.dataset-item[data-index="${index}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Get the selected pair data
    const pairData = state.datasetPairs[index];
    
    // Display images
    elements.view1Image.src = pairData.view1Url;
    elements.view2Image.src = pairData.view2Url;
    
    // Reset zoom
    elements.view1Container.classList.remove('zoomed');
    elements.view2Container.classList.remove('zoomed');
    elements.view1Image.style.transform = '';
    elements.view2Image.style.transform = '';
    
    // Display metadata
    elements.metadata.textContent = JSON.stringify(pairData.metadata, null, 2);
    
    // Update buttons based on deleted status
    const isDeleted = state.deletedPairs.has(index);
    elements.deletePair.disabled = isDeleted;
    elements.restorePair.disabled = !isDeleted;
    elements.viewDebug.disabled = !pairData.debugUrl;
    
    // Enable navigation buttons
    elements.prevPair.disabled = false;
    elements.nextPair.disabled = false;
}

/**
 * Toggle zoom on an image
 * @param {HTMLElement} container - Container element for the image
 */
function toggleZoom(container) {
    container.classList.toggle('zoomed');
    const img = container.querySelector('img');
    
    if (container.classList.contains('zoomed')) {
        // Apply zoom transform
        img.style.transform = 'scale(1.5)';
        
        // Make image draggable when zoomed
        let isDragging = false;
        let startX, startY, startTranslateX = 0, startTranslateY = 0;
        
        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const transform = img.style.transform;
            const translateMatch = transform.match(/translate\((-?\d+)px, (-?\d+)px\)/);
            
            if (translateMatch) {
                startTranslateX = parseInt(translateMatch[1]);
                startTranslateY = parseInt(translateMatch[2]);
            }
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        const onMouseMove = (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                img.style.transform = `scale(1.5) translate(${startTranslateX + deltaX}px, ${startTranslateY + deltaY}px)`;
            }
        };
        
        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        img.addEventListener('mousedown', onMouseDown);
        
        // Store the event listener so we can remove it later
        img._mouseDownHandler = onMouseDown;
    } else {
        // Remove zoom and reset position
        img.style.transform = '';
        
        // Remove dragging event listeners
        if (img._mouseDownHandler) {
            img.removeEventListener('mousedown', img._mouseDownHandler);
            img._mouseDownHandler = null;
        }
    }
}

/**
 * Open the debug image in a modal
 */
function handleViewDebug() {
    if (state.currentIndex === -1) return;
    
    const pairData = state.datasetPairs[state.currentIndex];
    if (!pairData.debugUrl) return;
    
    elements.modalImage.src = pairData.debugUrl;
    elements.imageModal.classList.add('show');
}

/**
 * Close the image modal
 */
function closeModal() {
    elements.imageModal.classList.remove('show');
}

/**
 * Mark the current pair as deleted
 */
function handleDeletePair() {
    if (state.currentIndex === -1) return;
    
    showConfirmDialog(
        'Are you sure you want to delete this pair?', 
        () => {
            state.deletedPairs.add(state.currentIndex);
            
            // Update UI
            const item = elements.datasetList.querySelector(`.dataset-item[data-index="${state.currentIndex}"]`);
            if (item) {
                item.classList.add('deleted');
                item.querySelector('span:last-child').textContent = '🗑️';
            }
            
            // Update buttons
            elements.deletePair.disabled = true;
            elements.restorePair.disabled = false;
            
            // Update stats
            updateStats();
            
            // Save to localStorage
            saveDeletedPairsToStorage();
            
            // Auto-navigate to next available pair
            navigateToNextAvailable(1);
        }
    );
}

/**
 * Restore a deleted pair
 */
function handleRestorePair() {
    if (state.currentIndex === -1) return;
    
    state.deletedPairs.delete(state.currentIndex);
    
    // Update UI
    const item = elements.datasetList.querySelector(`.dataset-item[data-index="${state.currentIndex}"]`);
    if (item) {
        item.classList.remove('deleted');
        item.querySelector('span:last-child').textContent = '';
    }
    
    // Update buttons
    elements.deletePair.disabled = false;
    elements.restorePair.disabled = true;
    
    // Update stats
    updateStats();
    
    // Save to localStorage
    saveDeletedPairsToStorage();
}

/**
 * Navigate to previous or next pair
 * @param {Number} direction - Direction to navigate (-1 for previous, 1 for next)
 */
function navigatePair(direction) {
    const newIndex = state.currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < state.datasetPairs.length) {
        selectPair(newIndex);
    }
}

/**
 * Navigate to the next available (non-deleted) pair
 * @param {Number} direction - Direction to navigate (-1 for previous, 1 for next)
 */
function navigateToNextAvailable(direction) {
    let newIndex = state.currentIndex;
    
    while (true) {
        newIndex += direction;
        
        // Check bounds
        if (newIndex < 0 || newIndex >= state.datasetPairs.length) {
            // Wrap around if we've reached the end
            if (direction > 0) {
                newIndex = 0;
            } else {
                newIndex = state.datasetPairs.length - 1;
            }
            
            // If we're back at the starting point, stop searching
            if (newIndex === state.currentIndex) {
                break;
            }
        }
        
        // If we find a non-deleted pair or return to the current index, select it
        if (!state.deletedPairs.has(newIndex) || newIndex === state.currentIndex) {
            selectPair(newIndex);
            break;
        }
        
        // If we've checked all pairs and they're all deleted, stay on the current one
        if (newIndex === state.currentIndex) {
            break;
        }
    }
}

/**
 * Update the status message
 * @param {String} message - Status message to display
 * @param {String} type - Message type (info, success, error)
 */
function updateStatus(message, type = 'info') {
    elements.status.textContent = message;
    
    // Reset classes
    elements.status.className = '';
    
    // Add type-specific class
    elements.status.classList.add(type);
}

/**
 * Update statistics display
 */
function updateStats() {
    const total = state.datasetPairs.length;
    const deleted = state.deletedPairs.size;
    const remaining = total - deleted;
    
    elements.totalCount.textContent = total;
    elements.deletedCount.textContent = deleted;
    elements.remainingCount.textContent = remaining;
    
    if (state.currentIndex >= 0) {
        elements.currentIndexDisplay.textContent = state.currentIndex + 1;
    } else {
        elements.currentIndexDisplay.textContent = '-';
    }
    
    // Update permanent delete button status based on whether there are deleted pairs
    if (elements.permanentlyDeleteBtn) {
        elements.permanentlyDeleteBtn.disabled = deleted === 0 || !state.folderHandle;
    }
}

/**
 * Select the first available (non-deleted) pair
 */
function selectFirstAvailablePair() {
    for (let i = 0; i < state.datasetPairs.length; i++) {
        if (!state.deletedPairs.has(i)) {
            selectPair(i);
            return;
        }
    }
    
    // If all pairs are deleted, select the first one anyway
    if (state.datasetPairs.length > 0) {
        selectPair(0);
    }
}

/**
 * Export the list of deleted pairs
 */
function exportDeletedList() {
    if (state.deletedPairs.size === 0) {
        updateStatus('No pairs have been marked for deletion.', 'info');
        return;
    }
    
    // Create a list of deleted folders
    const deletedFolders = [...state.deletedPairs].map(index => {
        const pair = state.datasetPairs[index];
        return pair.name;
    });
    
    // Create JSON content
    const exportData = {
        timestamp: new Date().toISOString(),
        totalPairs: state.datasetPairs.length,
        deletedCount: state.deletedPairs.size,
        deletedFolders: deletedFolders,
        deletedIndices: [...state.deletedPairs].sort((a, b) => a - b),
    };
    
    // Create blob and download
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `deleted_pairs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateStatus(`Exported list of ${state.deletedPairs.size} deleted pairs.`, 'success');
}

/**
 * Permanently delete the marked folders from the file system
 */
async function permanentlyDeleteFiles() {
    if (state.deletedPairs.size === 0) {
        updateStatus('No pairs have been marked for deletion.', 'info');
        return;
    }
    
    if (!state.folderHandle) {
        updateStatus('No directory access. Please select a dataset folder first.', 'error');
        return;
    }
    
    showConfirmDialog(
        `Are you sure you want to PERMANENTLY DELETE ${state.deletedPairs.size} pairs from your file system? This cannot be undone!`,
        async () => {
            try {
                // Show progress UI
                showProgressBar(0, state.deletedPairs.size);
                updateStatus('Deleting files...', 'info');
                
                // Get sorted list of deleted indices
                const deletedIndices = [...state.deletedPairs].sort((a, b) => a - b);
                
                // Track successfully deleted folders
                const deletedSuccessfully = [];
                
                // Process each deleted pair
                for (let i = 0; i < deletedIndices.length; i++) {
                    const index = deletedIndices[i];
                    const pair = state.datasetPairs[index];
                    
                    try {
                        // Update progress
                        updateProgressBar(i, deletedIndices.length, `Deleting ${pair.name} (${i+1}/${deletedIndices.length})`);
                        
                        // Get folder handle
                        const folderHandle = pair.folder;
                        
                        // Delete folder contents first
                        for await (const entry of folderHandle.values()) {
                            try {
                                await folderHandle.removeEntry(entry.name);
                            } catch (fileError) {
                                console.warn(`Could not delete file ${entry.name} in ${pair.name}:`, fileError);
                            }
                        }
                        
                        // Delete the folder itself
                        await state.folderHandle.removeEntry(pair.name, { recursive: true });
                        
                        // Clean up object URLs to free memory
                        if (pair.view1Url) URL.revokeObjectURL(pair.view1Url);
                        if (pair.view2Url) URL.revokeObjectURL(pair.view2Url);
                        if (pair.debugUrl) URL.revokeObjectURL(pair.debugUrl);
                        
                        // Mark as successfully deleted
                        deletedSuccessfully.push(index);
                    } catch (error) {
                        console.error(`Error deleting folder ${pair.name}:`, error);
                    }
                }
                
                // Hide progress bar
                hideProgressBar();
                
                // Remove successfully deleted pairs from the list
                removeDeletedPairsFromUI(deletedSuccessfully);
                
                // Update status
                if (deletedSuccessfully.length === deletedIndices.length) {
                    updateStatus(`Successfully deleted ${deletedSuccessfully.length} pairs.`, 'success');
                } else {
                    updateStatus(`Deleted ${deletedSuccessfully.length} out of ${deletedIndices.length} pairs. Some pairs could not be deleted.`, 'warning');
                }
                
                // Clear deleted pairs set and update localStorage
                state.deletedPairs.clear();
                saveDeletedPairsToStorage();
                
                // Update stats
                updateStats();
                
                // If we have remaining pairs, select one
                if (state.datasetPairs.length > 0) {
                    selectFirstAvailablePair();
                } else {
                    // Reset UI if all pairs were deleted
                    elements.view1Image.src = '';
                    elements.view2Image.src = '';
                    elements.metadata.textContent = '';
                    state.currentIndex = -1;
                    elements.currentIndexDisplay.textContent = '-';
                }
            } catch (error) {
                hideProgressBar();
                console.error('Error during file deletion:', error);
                updateStatus(`Error deleting files: ${error.message}`, 'error');
            }
        }
    );
}

/**
 * Reset the deleted pairs list
 */
function resetDeletedPairs() {
    if (state.deletedPairs.size === 0) {
        updateStatus('No pairs are currently marked for deletion.', 'info');
        return;
    }
    
    showConfirmDialog(
        `Are you sure you want to reset the deleted status for all ${state.deletedPairs.size} pairs?`,
        () => {
            // Get all deleted items before clearing
            const deletedIndices = [...state.deletedPairs];
            
            // Clear the set
            state.deletedPairs.clear();
            
            // Update UI for all previously deleted items
            deletedIndices.forEach(index => {
                const item = elements.datasetList.querySelector(`.dataset-item[data-index="${index}"]`);
                if (item) {
                    item.classList.remove('deleted');
                    item.querySelector('span:last-child').textContent = '';
                }
            });
            
            // Update current pair's buttons if it was deleted
            if (state.currentIndex !== -1) {
                elements.deletePair.disabled = false;
                elements.restorePair.disabled = true;
            }
            
            // Update stats
            updateStats();
            
            // Save to localStorage
            saveDeletedPairsToStorage();
            
            updateStatus(`Reset deleted status for ${deletedIndices.length} pairs.`, 'success');
        }
    );
}

/**
 * Show confirmation dialog
 * @param {String} message - Message to display
 * @param {Function} onConfirm - Function to call when confirmed
 */
function showConfirmDialog(message, onConfirm) {
    elements.confirmMessage.textContent = message;
    elements.overlay.style.display = 'block';
    elements.confirmDialog.style.display = 'block';
    
    // Remove any existing confirm handler
    elements.confirmOk.removeEventListener('click', elements.confirmOk._confirmHandler);
    
    // Set up new confirm handler
    elements.confirmOk._confirmHandler = () => {
        onConfirm();
        closeConfirmDialog();
    };
    
    elements.confirmOk.addEventListener('click', elements.confirmOk._confirmHandler);
}

/**
 * Close the confirmation dialog
 */
function closeConfirmDialog() {
    elements.overlay.style.display = 'none';
    elements.confirmDialog.style.display = 'none';
}

/**
 * Save deleted pairs to localStorage
 */
function saveDeletedPairsToStorage() {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            folderName: state.folderHandle ? state.folderHandle.name : null,
            deletedIndices: [...state.deletedPairs]
        };
        
        localStorage.setItem('datasetCleanerDeletedPairs', JSON.stringify(data));
    } catch (error) {
        console.warn('Error saving deleted pairs to localStorage:', error);
    }
}

/**
 * Load deleted pairs from localStorage
 */
function loadDeletedPairsFromStorage() {
    try {
        const savedData = localStorage.getItem('datasetCleanerDeletedPairs');
        if (savedData) {
            const data = JSON.parse(savedData);
            state.deletedPairs = new Set(data.deletedIndices);
            
            // Enable reset button if we have deleted pairs
            if (state.deletedPairs.size > 0) {
                elements.resetDeleted.disabled = false;
            }
            
            console.info(`Loaded ${state.deletedPairs.size} deleted pairs from previous session`);
        }
    } catch (error) {
        console.warn('Error loading deleted pairs from localStorage:', error);
    }
}

/**
 * Show progress bar
 * @param {Number} current - Current progress value
 * @param {Number} total - Total items to process
 */
function showProgressBar(current, total) {
    if (!elements.progressContainer) return;
    
    elements.progressContainer.style.display = 'block';
    updateProgressBar(current, total);
}

/**
 * Update progress bar
 * @param {Number} current - Current progress value
 * @param {Number} total - Total items to process
 * @param {String} message - Optional message to display
 */
function updateProgressBar(current, total, message = null) {
    if (!elements.progressBar || !elements.progressContainer) return;
    
    const percent = Math.round((current / total) * 100);
    elements.progressBar.style.width = `${percent}%`;
    
    if (elements.progressText && message) {
        elements.progressText.textContent = message;
    }
}

/**
 * Hide progress bar
 */
function hideProgressBar() {
    if (!elements.progressContainer) return;
    
    elements.progressContainer.style.display = 'none';
}

/**
 * Remove deleted pairs from the UI and state
 * @param {Array} deletedIndices - Array of indices that were successfully deleted
 */
function removeDeletedPairsFromUI(deletedIndices) {
    if (!deletedIndices || deletedIndices.length === 0) return;
    
    // Sort indices in descending order to remove from highest to lowest
    // This prevents index shifting issues when removing multiple items
    const sortedIndices = [...deletedIndices].sort((a, b) => b - a);
    
    // Remove from datasetPairs array
    for (const index of sortedIndices) {
        // Revoke object URLs
        const pair = state.datasetPairs[index];
        if (pair) {
            // Remove list item from UI
            const item = elements.datasetList.querySelector(`.dataset-item[data-index="${index}"]`);
            if (item) item.remove();
            
            // Remove from array
            state.datasetPairs.splice(index, 1);
        }
    }
    
    // Update indices in data-index attributes for all remaining items
    const items = elements.datasetList.querySelectorAll('.dataset-item');
    items.forEach((item, newIndex) => {
        item.dataset.index = newIndex;
    });
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);