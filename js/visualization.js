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
    
    // Draw initial test rectangle
    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.fillRect(0, 0, 100, 100);
    
    console.log('Canvas initialized successfully');
    isInitialized = true;
    
    // Remove the debug message if it exists
    const debugMsg = document.getElementById('debug-message');
    if (debugMsg) {
        debugMsg.remove();
    }
    
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
    
    console.log('Canvas resized:', {
        windowDimensions: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        canvasDimensions: {
            width: canvas.width,
            height: canvas.height
        }
    });
    
    // Draw test rectangle after resize
    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.fillRect(0, 0, 100, 100);
}

/**
 * Draw markers for virtual object projections
 * @param {Array} matchingPoints - Array of matching points
 */
function drawMatchingLines(matchingPoints) {
    console.log('Drawing virtual object projections...');
    
    if (!isInitialized) {
        console.log('Canvas not initialized, initializing now...');
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
    
    console.log('Drawing object projections:', matchingPoints);
    
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
            console.log('Skipping invalid point:', match);
            return;
        }
        
        const x1 = Number(match.view1Pos.x);
        const y1 = Number(match.view1Pos.y);
        const x2 = Number(match.view2Pos.x);
        const y2 = Number(match.view2Pos.y);
        
        console.log(`Drawing virtual object projection ${index}:`, { x1, y1, x2, y2 });
        
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

/**
 * Draw an arrow between two points to indicate correspondence
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Number} x1 - Start X coordinate
 * @param {Number} y1 - Start Y coordinate 
 * @param {Number} x2 - End X coordinate
 * @param {Number} y2 - End Y coordinate
 */
function drawArrow(ctx, x1, y1, x2, y2) {
    // Calculate midpoint of the line
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Calculate arrow angle and length
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 12;
    const arrowWidth = 8;
    
    // Draw arrow at midpoint
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    
    // Draw arrowhead
    ctx.beginPath();
    ctx.fillStyle = 'white';
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowLength, -arrowWidth / 2);
    ctx.lineTo(-arrowLength, arrowWidth / 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
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
    const size = 20;  // Smaller size for less intrusion
    
    // Save current context state
    ctx.save();
    
    // Color variations based on view and position
    let rgbColor;
    let strokeColor;
    
    if (isForcedMatch) {
        // Matches near edges use yellow warning indicator
        rgbColor = color === 'red' ? '255,180,50' : '200,255,50';
        strokeColor = 'yellow';
    } else {
        // Regular matches in optimal position use standard red/green
        rgbColor = color === 'red' ? '255,50,50' : '50,255,50';
        strokeColor = 'white';
    }
    
    // Draw crosshair (simpler)
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    if (isForcedMatch) {
        ctx.setLineDash([3, 3]);
    }
    
    // Horizontal and vertical crosshair lines
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    ctx.setLineDash([]);
    
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
    
    // Draw minimal view label
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
 * Display error message on canvas
 * @param {String} message - The error message
 */
function showError(message) {
    if (!ctx || !canvas) initCanvas();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    ctx.fillStyle = 'red';
    ctx.fillText('Error: ' + message, 20, canvas.height / 2);
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