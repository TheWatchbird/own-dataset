/**
 * Visualization and rendering functions for the drone view matching
 */

// Canvas and context references
let canvas, ctx;
let isInitialized = false;

/**
 * Initializes the visualization canvas
 * @returns {Object} - The canvas and context
 */
function initCanvas() {
    console.log('Initializing canvas...');
    
    // Remove any existing canvas
    const existingCanvas = document.getElementById('overlay-canvas');
    if (existingCanvas) {
        existingCanvas.remove();
    }
    
    // Create new canvas
    canvas = document.createElement('canvas');
    canvas.id = 'overlay-canvas';
    
    // Get the visualization container
    const container = document.querySelector('.visualization-container');
    if (!container) {
        console.error('Visualization container not found');
        return null;
    }
    
    // Add canvas to container
    container.appendChild(canvas);
    
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get canvas context');
        return null;
    }
    
    // Set up resize handler
    window.addEventListener('resize', resizeCanvas);
    
    // Initial resize
    resizeCanvas();
    
    isInitialized = true;
    
    return { canvas, ctx };
}

/**
 * Resize canvas to match window dimensions
 */
function resizeCanvas() {
    if (!canvas) return;
    
    // Get the actual dimensions of the view container
    const container = document.querySelector('.view-container');
    if (!container) {
        console.error('View container not found');
        return;
    }
    
    const rect = container.getBoundingClientRect();
    
    // Set canvas dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Set canvas to window dimensions
    
    // Canvas is now resized
}

/**
 * Draw markers for virtual object projections
 * @param {Array} matchingPoints - Array of matching points
 */
function drawMatchingLines(matchingPoints) {
    if (!isInitialized) {
        const result = initCanvas();
        if (!result) {
            console.error('Failed to initialize canvas');
            return;
        }
    }
    
    // Clear the canvas with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get the dimensions of each view
    const viewWidth = canvas.width / 2;
    const viewHeight = canvas.height;
    
    // Draw center line only
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.moveTo(viewWidth, 0);
    ctx.lineTo(viewWidth, viewHeight);
    ctx.stroke();
    
    if (!matchingPoints || matchingPoints.length === 0) {
        // Show a warning if no points to draw
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.fillText('Virtual object not projected correctly!', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Draw point markers without connecting lines
    matchingPoints.forEach((match, index) => {
        if (!match.view1Pos || !match.view2Pos) {
            return;
        }
        
        const x1 = Number(match.view1Pos.x);
        const y1 = Number(match.view1Pos.y);
        const x2 = Number(match.view2Pos.x);
        const y2 = Number(match.view2Pos.y);
        
        // Draw the point markers
        
        // Draw the virtual object marker in each view
        const pointColor1 = 'red';
        const pointColor2 = 'green';
        drawVirtualObjectMarker(ctx, x1, y1, pointColor1, index, match.isForcedMatch);
        drawVirtualObjectMarker(ctx, x2, y2, pointColor2, index, match.isForcedMatch);
        
        // Add coordinates only if requested through debugPanel
        if (document.getElementById('debug-panel') && 
            window.getComputedStyle(document.getElementById('debug-panel')).display !== 'none') {
            ctx.font = '12px monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(`(${Math.round(x1)},${Math.round(y1)})`, x1 + 30, y1 - 10);
            ctx.fillText(`(${Math.round(x2-viewWidth)},${Math.round(y2)})`, x2 + 30, y2 - 10);
        }
    });
}

// This function is no longer used - we don't draw connecting arrows
// But keeping a stub in case we need to restore it
function drawArrow(ctx, x1, y1, x2, y2) {
    // This function is intentionally disabled
}

/**
 * Draw a virtual object projection marker
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Number} x - X coordinate
 * @param {Number} y - Y coordinate
 * @param {String} color - Color of the marker
 * @param {Number} index - Point index
 * @param {Boolean} isForcedMatch - Whether this is a forced match (outside optimal margins)
 */
function drawVirtualObjectMarker(ctx, x, y, color, index, isForcedMatch = false) {
    const size = 20;  // Marker size
    
    // Save current context state
    ctx.save();
    
    // Color variations based on view and position
    let rgbColor = color === 'red' ? '255,50,50' : '50,255,50';
    let strokeColor = 'white';
    
    if (isForcedMatch) {
        strokeColor = 'yellow';
    }
    
    // Draw outer circle with translucent fill
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgbColor}, 0.4)`;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw center point (precise location)
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw view label
    ctx.font = '12px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 3;
    ctx.fillText(color === 'red' ? '1' : '2', x, y);
    
    // Restore context state
    ctx.restore();
}

/**
 * Display loading message on canvas
 * @param {String} message - The message to display
 */
function showLoading(message) {
    if (!ctx || !canvas) initCanvas();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '20px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(message, canvas.width / 2 - 150, canvas.height / 2);
}

/**
 * Display error or success message on canvas
 * @param {String} message - The message to display
 * @param {String} type - Message type: 'error' (default) or 'success'
 */
function showError(message, type = 'error') {
    if (!ctx || !canvas) initCanvas();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    
    // Choose color based on message type
    if (type === 'success') {
        ctx.fillStyle = 'lightgreen';
        message = 'Success: ' + message;
    } else {
        ctx.fillStyle = 'red';
        message = 'Error: ' + message;
    }
    
    ctx.fillText(message, 20, canvas.height / 2);
    
    // Also show as browser alert for better visibility
    if (type === 'success') {
        // Create a fixed notification that auto-hides
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.padding = '10px 20px';
        notification.style.backgroundColor = type === 'success' ? 'rgba(0, 128, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '1000';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s';
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }
}

/**
 * Hide loading message by clearing the canvas
 */
function hideLoading() {
    if (!ctx || !canvas) initCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Export visualization functions
export {
    initCanvas,
    drawMatchingLines,
    showLoading,
    showError,
    hideLoading
};