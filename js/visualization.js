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
 * Draw connecting lines between matching points
 * @param {Array} matchingPoints - Array of matching points
 */
function drawMatchingLines(matchingPoints) {
    console.log('Drawing matching lines...');
    
    if (!isInitialized) {
        console.log('Canvas not initialized, initializing now...');
        const result = initCanvas();
        if (!result) {
            console.error('Failed to initialize canvas');
            return;
        }
    }
    
    // Clear the canvas with semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw test rectangles in corners
    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.fillRect(0, 0, 50, 50);
    ctx.fillRect(canvas.width - 50, 0, 50, 50);
    ctx.fillRect(0, canvas.height - 50, 50, 50);
    ctx.fillRect(canvas.width - 50, canvas.height - 50, 50, 50);
    
    // Get the dimensions of each view
    const viewWidth = canvas.width / 2;
    const viewHeight = canvas.height;
    
    // Draw view separators
    ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, viewWidth, viewHeight);
    ctx.strokeRect(viewWidth, 0, viewWidth, viewHeight);
    
    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.moveTo(viewWidth, 0);
    ctx.lineTo(viewWidth, viewHeight);
    ctx.stroke();
    
    console.log('Drawing points:', matchingPoints);
    
    // Draw matching points
    matchingPoints.forEach((match, index) => {
        if (!match.view1Pos || !match.view2Pos) {
            console.log('Skipping invalid point:', match);
            return;
        }
        
        const x1 = Number(match.view1Pos.x);
        const y1 = Number(match.view1Pos.y);
        const x2 = Number(match.view2Pos.x);
        const y2 = Number(match.view2Pos.y);
        
        console.log(`Drawing point ${index}:`, { x1, y1, x2, y2 });
        
        // Draw connecting line
        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Draw points
        drawPointMarker(ctx, x1, y1, 'red', index);
        drawPointMarker(ctx, x2, y2, 'green', index);
    });
}

/**
 * Draw a point marker with highlight
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Number} x - X coordinate
 * @param {Number} y - Y coordinate
 * @param {String} color - Color of the marker
 * @param {Number} index - Point index
 */
function drawPointMarker(ctx, x, y, color, index) {
    const size = 25;  // Even larger size for better visibility
    
    // Save current context state
    ctx.save();
    
    // Draw outer glow
    ctx.beginPath();
    ctx.arc(x, y, size + 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color === 'red' ? '255,50,50' : '50,255,50'}, 0.3)`;
    ctx.fill();
    
    // Draw outer circle with thicker stroke
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;
    ctx.stroke();
    
    // Draw filled circle
    ctx.beginPath();
    ctx.arc(x, y, size - 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color === 'red' ? '255,50,50' : '50,255,50'}, 1.0)`; // Full opacity
    ctx.fill();
    
    // Draw point number with shadow for better visibility
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 6;
    ctx.fillText(index + 1, x, y);
    
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