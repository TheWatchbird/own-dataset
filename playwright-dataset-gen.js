const { chromium } = require('playwright');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const path = require('path');
const fs = require('fs').promises;

/**
 * Dataset Generator Script
 * 
 * Usage: node playwright-dataset-gen.js [INSTANCES] [OUTPUT_DIR] [OPTIONS]
 * 
 * Arguments:
 *   INSTANCES     - Number of parallel browser instances (default: 75% of available CPU cores)
 *   OUTPUT_DIR    - Directory to save the dataset (default: /home/ubuntu/dataset-output)
 * 
 * Options:
 *   --headless    - Run browsers in headless mode (default: non-headless)
 *   --no-headless - Explicitly run browsers in non-headless mode (default behavior)
 *   --restart=N   - Set restart interval to N minutes (default: 10 minutes)
 * 
 * Example:
 *   node playwright-dataset-gen.js 4 ./my-dataset --headless --restart=15
 */

// Set NVIDIA environment variables
process.env.NVIDIA_VISIBLE_DEVICES = 'all';
process.env.CUDA_VISIBLE_DEVICES = '0';

// Parse command line arguments
const args = process.argv.slice(2);

// Parse restart interval if provided
const restartArgPattern = /--restart=(\d+)/;
let restartMinutes = 10; // Default 10 minutes
for (const arg of args) {
  const match = arg.match(restartArgPattern);
  if (match && match[1]) {
    restartMinutes = parseInt(match[1]);
    break;
  }
}

const CONFIG = {
  url: 'https://own-dataset.vercel.app/',
  instances: parseInt(args[0]) || Math.max(Math.floor(numCPUs * 0.75), 1),
  headless: args.includes('--headless') ? true : (args.includes('--no-headless') ? false : false), // Default to non-headless
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds
  outputDir: args[1] || '/home/ubuntu/dataset-output',
  maxRetryDelay: 30000, // 30 seconds
  progressTimeout: 300000, // 5 minutes
  datasetCount: 1000000, // Set to 1 million pairs
  restartInterval: restartMinutes * 60 * 1000 // Convert minutes to milliseconds
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function writeFile(page, filePath, data) {
  await page.evaluate(async ([path, content]) => {
    window.lastFileOperation = { path, content };
  }, [filePath, data]);
  
  // Handle the file writing in Node.js context
  const buffer = Buffer.from(await page.evaluate(() => {
    const { path, content } = window.lastFileOperation;
    if (content instanceof Blob) {
      return content.arrayBuffer();
    }
    return content;
  }));
  
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function runBrowser(workerId) {
  let retryCount = 0;
  let context;

  while (retryCount < CONFIG.retryAttempts) {
    try {
      // Launch with proper permissions and flags
      context = await chromium.launchPersistentContext('', {
        headless: CONFIG.headless,
        args: [
          '--no-sandbox',
          '--enable-experimental-web-platform-features',
          `--allow-file-access-from-files`,
          `--allow-file-access`,
          // GPU Acceleration flags
          '--enable-gpu',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
          '--disable-gpu-driver-bug-workarounds',
          '--enable-gpu-rasterization',
          '--enable-zero-copy',
          '--enable-accelerated-video-decode',
          '--enable-native-gpu-memory-buffers',
          '--enable-hardware-overlays',
          '--enable-features=Vulkan',
          '--use-vulkan',
          '--enable-features=VaapiVideoDecoder',
          '--force-gpu-rasterization',
          // Headless mode configuration
          ...(CONFIG.headless ? ['--headless=new'] : []),
          '--disable-dev-shm-usage',
          '--use-gl=angle',
          '--use-angle=default',
          '--window-size=1920,1080',
          '--start-maximized',
          '--hide-scrollbars',
        ],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        permissions: ['clipboard-read', 'clipboard-write']
      });
      
      // Set environment variables for GPU
      process.env.LIBGL_ALWAYS_SOFTWARE = '0'; // Prevent software rendering
      process.env.LIBGL_DEBUG = 'verbose'; // Debug OpenGL
      process.env.ANGLE_DEFAULT_PLATFORM = 'vulkan'; // Use Vulkan backend for ANGLE
      
      const page = await context.newPage();

      // More detailed GPU check
      const gpuInfo = await page.evaluate(() => {
        function getWebGLInfo(type) {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext(type, {
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
            antialias: false,
            alpha: false,
          });
          
          if (!gl) return { error: `${type} not supported` };
          
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          return {
            vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            extensions: gl.getSupportedExtensions(),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
            angleInfo: window.navigator.userAgent.match(/ANGLE \((.*?)\)/)?.[1] || 'Not available'
          };
        }
        
        return {
          webgl1: getWebGLInfo('webgl'),
          webgl2: getWebGLInfo('webgl2'),
          gpu: {
            vendor: navigator.vendor,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            platform: navigator.platform,
            userAgent: navigator.userAgent
          }
        };
      });
      console.log(`Worker ${workerId} Detailed GPU Info:`, JSON.stringify(gpuInfo, null, 2));

      // Check if WebGL is actually working
      const isWebGLWorking = await page.evaluate(() => {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl2');
          if (!gl) return false;
          
          // Try to render something
          canvas.width = canvas.height = 1;
          gl.clearColor(1, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          const pixels = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          
          return pixels[0] === 255; // Should be red (255, 0, 0, 255)
        } catch (e) {
          console.error('WebGL test failed:', e);
          return false;
        }
      });
      console.log(`Worker ${workerId} WebGL Working:`, isWebGLWorking);

      // Single console handler
      page.on('console', msg => {
        const text = msg.text();
        if (!text.includes('Automatic fallback to software WebGL')) {
          console.log(`Worker ${workerId} Browser Log:`, text);
        }
      });

      // Set up permission handling
      context.grantPermissions(['clipboard-read', 'clipboard-write']);
      
      // Auto-accept all permission dialogs
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      // Enable WebGL in the page
      await page.addInitScript(() => {
        // Force high-performance GPU
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', { 
          powerPreference: 'high-performance',
          desynchronized: true,
          preserveDrawingBuffer: false,
          antialias: false // Disable antialiasing for performance
        });
        if (gl) {
          // Clean up
          gl.getExtension('WEBGL_lose_context')?.loseContext();
          canvas.remove();
        }
      });

      console.log(`Worker ${workerId}: Navigating to ${CONFIG.url}`);
      await page.goto(CONFIG.url);

      // Wait for initial page load with longer timeout
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
        page.waitForSelector('#generate-dataset-btn', { timeout: 60000 })
      ]);

      // Ensure output directory exists
      await fs.mkdir(CONFIG.outputDir, { recursive: true });

      // Inject the directory path
      await page.evaluate((dirPath) => {
        window.__outputDir = dirPath;
      }, CONFIG.outputDir);

      // Handle file saving
      await page.exposeFunction('saveFile', async (filePath, data) => {
        try {
          const fileName = path.basename(filePath);
          const fileExt = path.extname(filePath).toLowerCase();
          const dirPath = path.dirname(filePath);
          await ensureDir(dirPath);
          
          console.log(`Worker ${workerId}: Saving file ${filePath}`);
          console.log(`Worker ${workerId}: File type: ${fileExt}`);
          
          let buffer;
          if (Array.isArray(data) && data.length > 0) {
            if (fileExt === '.jpg' || fileExt === '.jpeg' || fileExt === '.png') {
              // For images, keep binary handling
              const totalLength = data.reduce((sum, chunk) => sum + (Array.isArray(chunk) ? chunk.length : 0), 0);
              buffer = Buffer.alloc(totalLength);
              let offset = 0;
              
              for (const chunk of data) {
                if (Array.isArray(chunk)) {
                  const uint8Array = new Uint8Array(chunk);
                  buffer.set(uint8Array, offset);
                  offset += uint8Array.length;
                }
              }
              console.log(`Worker ${workerId}: Created image buffer of ${buffer.length} bytes`);
            } else {
              // For text files, join chunks and create string buffer
              const text = data.join('');
              buffer = Buffer.from(text);
              console.log(`Worker ${workerId}: Created text buffer of ${buffer.length} bytes`);
            }
          } else {
            buffer = Buffer.from(data || '');
          }
          
          await fs.writeFile(filePath, buffer);
          console.log(`Worker ${workerId}: Successfully saved file ${filePath} (${buffer.length} bytes)`);
          
          // Verify file was written correctly
          const stats = await fs.stat(filePath);
          console.log(`Worker ${workerId}: Verified file size: ${stats.size} bytes`);
        } catch (error) {
          console.error(`Worker ${workerId}: Error in saveFile function: ${error.message}`);
          console.error(error.stack);
        }
      });

      // Override the showDirectoryPicker to use our directory
      await page.evaluate(() => {
        // Keep track of current directory path and pending file operations
        window.__currentDir = window.__outputDir;
        window.__pendingWrites = new Map();
        window.__currentFileData = new Map();
        
        window.showDirectoryPicker = async () => {
          return {
            kind: 'directory',
            name: window.__outputDir,
            async *entries() {},
            async getDirectoryHandle(name, { create } = {}) {
              // Update current directory context when a subdirectory is created
              window.__currentDir = `${window.__outputDir}/${name}`;
              console.log(`Creating directory: ${window.__currentDir}`);
              return this;
            },
            async getFileHandle(name, { create } = {}) {
              // Use the current directory context for file paths
              const filePath = `${window.__currentDir}/${name}`;
              console.log(`Creating file: ${filePath}`);
              
              // Clear any existing data for this file
              window.__currentFileData.delete(filePath);
              
              return {
                kind: 'file',
                name,
                filePath,
                async createWritable() {
                  return {
                    async write(data) {
                      // Keep a direct reference to the raw data
                      if (!window.__currentFileData.has(filePath)) {
                        window.__currentFileData.set(filePath, []);
                      }
                      
                      const chunks = window.__currentFileData.get(filePath);
                      const fileExt = filePath.toLowerCase().split('.').pop();
                      
                      console.log(`Writing to ${filePath}, data type: ${typeof data}, constructor: ${data?.constructor?.name}`);
                      
                      if (data instanceof Blob) {
                        console.log(`Processing Blob (${data.size} bytes) for ${filePath}`);
                        if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
                          // For images, keep binary handling
                          const arrayBuffer = await data.arrayBuffer();
                          const uint8Array = new Uint8Array(arrayBuffer);
                          chunks.push(Array.from(uint8Array));
                          console.log(`Processed Blob into array of ${uint8Array.length} bytes`);
                        } else {
                          // For text files, convert Blob to text
                          const text = await data.text();
                          chunks.push(text);
                          console.log(`Processed Blob as text of length ${text.length}`);
                        }
                      } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                        if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
                          // For images, keep binary handling
                          const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
                          chunks.push(Array.from(uint8Array));
                          console.log(`Processed binary data into array of ${uint8Array.length} bytes`);
                        } else {
                          // For text files, convert to string
                          const text = new TextDecoder().decode(data);
                          chunks.push(text);
                          console.log(`Processed binary data as text of length ${text.length}`);
                        }
                      } else if (typeof data === 'string') {
                        chunks.push(data);
                        console.log(`Added string data of length ${data.length}`);
                      } else {
                        console.log(`Added ${typeof data} to ${filePath}`);
                        chunks.push(String(data));
                      }
                    },
                    async close() {
                      console.log(`Closing file: ${filePath}`);
                      const fileData = window.__currentFileData.get(filePath) || [];
                      console.log(`Preparing to save ${filePath} with ${fileData.length} chunks`);
                      
                      // Send the raw data chunks to avoid any conversion issues
                      window.dispatchEvent(new CustomEvent('saveFile', { 
                        detail: { 
                          name: filePath,
                          data: fileData
                        }
                      }));
                    }
                  };
                }
              };
            }
          };
        };
      });

      // Modify the page to better capture file saving events
      await page.evaluate(() => {
        // Listen for saveFile events from the FileSystemWritableFileStream mock
        window.addEventListener('saveFile', async (e) => {
          const { name, data } = e.detail;
          
          console.log(`Save event triggered for: ${name}`);
          console.log(`Data type: ${Array.isArray(data) ? 'Array' : typeof data}`);
          console.log(`Data length: ${data?.length || 0}`);
          
          if (Array.isArray(data) && data.length > 0) {
            // If we have an array of chunks, describe the first chunk
            const firstChunk = data[0];
            console.log(`First chunk type: ${typeof firstChunk}`);
            console.log(`First chunk constructor: ${firstChunk?.constructor?.name || 'unknown'}`);
            console.log(`First chunk is TypedArray: ${ArrayBuffer.isView(firstChunk)}`);
            
            if (firstChunk instanceof Uint8Array) {
              console.log(`First chunk length: ${firstChunk.length} bytes`);
            }
          }
          
          try {
            // Send the file data to the Node.js context
            await window.saveFile(name, data);
            console.log(`Successfully passed data for ${name} to Node.js context`);
          } catch (error) {
            console.error(`Error passing data to Node.js: ${error.message}`);
          }
        });
      });

      // Add event listener to capture saveFile events correctly
      await page.addScriptTag({
        content: `
          // Ensure the original event listener is properly registered
          const originalAddEventListener = window.addEventListener;
          window.addEventListener = function(type, listener, options) {
            if (type === 'saveFile') {
              console.log('Registering saveFile event listener');
            }
            return originalAddEventListener.call(this, type, listener, options);
          };
        `
      });

      // Setup restart timer function
      async function setupRestartTimer(page) {
        console.log(`Worker ${workerId}: Setting up restart timer for ${CONFIG.restartInterval/1000/60} minutes`);
        return setTimeout(async () => {
          console.log(`Worker ${workerId}: Restarting generation after ${CONFIG.restartInterval/1000/60} minutes`);
          try {
            // Reload the page
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Wait for the page to load
            await Promise.all([
              page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
              page.waitForSelector('#generate-dataset-btn', { timeout: 60000 })
            ]);
            
            // Re-inject the directory path
            await page.evaluate((dirPath) => {
              window.__outputDir = dirPath;
            }, CONFIG.outputDir);
            
            // Reapply the showDirectoryPicker override
            await page.evaluate(() => {
              // Keep track of current directory path and pending file operations
              window.__currentDir = window.__outputDir;
              window.__pendingWrites = new Map();
              window.__currentFileData = new Map();
              
              window.showDirectoryPicker = async () => {
                return {
                  kind: 'directory',
                  name: window.__outputDir,
                  async *entries() {},
                  async getDirectoryHandle(name, { create } = {}) {
                    // Update current directory context when a subdirectory is created
                    window.__currentDir = `${window.__outputDir}/${name}`;
                    console.log(`Creating directory: ${window.__currentDir}`);
                    return this;
                  },
                  async getFileHandle(name, { create } = {}) {
                    // Use the current directory context for file paths
                    const filePath = `${window.__currentDir}/${name}`;
                    console.log(`Creating file: ${filePath}`);
                    
                    // Clear any existing data for this file
                    window.__currentFileData.delete(filePath);
                    
                    return {
                      kind: 'file',
                      name,
                      filePath,
                      async createWritable() {
                        return {
                          async write(data) {
                            // Keep a direct reference to the raw data
                            if (!window.__currentFileData.has(filePath)) {
                              window.__currentFileData.set(filePath, []);
                            }
                            
                            const chunks = window.__currentFileData.get(filePath);
                            const fileExt = filePath.toLowerCase().split('.').pop();
                            
                            console.log(`Writing to ${filePath}, data type: ${typeof data}, constructor: ${data?.constructor?.name}`);
                            
                            if (data instanceof Blob) {
                              console.log(`Processing Blob (${data.size} bytes) for ${filePath}`);
                              if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
                                // For images, keep binary handling
                                const arrayBuffer = await data.arrayBuffer();
                                const uint8Array = new Uint8Array(arrayBuffer);
                                chunks.push(Array.from(uint8Array));
                                console.log(`Processed Blob into array of ${uint8Array.length} bytes`);
                              } else {
                                // For text files, convert Blob to text
                                const text = await data.text();
                                chunks.push(text);
                                console.log(`Processed Blob as text of length ${text.length}`);
                              }
                            } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                              if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
                                // For images, keep binary handling
                                const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
                                chunks.push(Array.from(uint8Array));
                                console.log(`Processed binary data into array of ${uint8Array.length} bytes`);
                              } else {
                                // For text files, convert to string
                                const text = new TextDecoder().decode(data);
                                chunks.push(text);
                                console.log(`Processed binary data as text of length ${text.length}`);
                              }
                            } else if (typeof data === 'string') {
                              chunks.push(data);
                              console.log(`Added string data of length ${data.length}`);
                            } else {
                              console.log(`Added ${typeof data} to ${filePath}`);
                              chunks.push(String(data));
                            }
                          },
                          async close() {
                            console.log(`Closing file: ${filePath}`);
                            const fileData = window.__currentFileData.get(filePath) || [];
                            console.log(`Preparing to save ${filePath} with ${fileData.length} chunks`);
                            
                            // Send the raw data chunks to avoid any conversion issues
                            window.dispatchEvent(new CustomEvent('saveFile', { 
                              detail: { 
                                name: filePath,
                                data: fileData
                              }
                            }));
                          }
                        };
                      }
                    };
                  }
                };
              };
            });
            
            // Reapply the saveFile event handler
            await page.evaluate(() => {
              // Listen for saveFile events from the FileSystemWritableFileStream mock
              window.addEventListener('saveFile', async (e) => {
                const { name, data } = e.detail;
                
                console.log(`Save event triggered for: ${name}`);
                console.log(`Data type: ${Array.isArray(data) ? 'Array' : typeof data}`);
                console.log(`Data length: ${data?.length || 0}`);
                
                try {
                  // Send the file data to the Node.js context
                  await window.saveFile(name, data);
                  console.log(`Successfully passed data for ${name} to Node.js context`);
                } catch (error) {
                  console.error(`Error passing data to Node.js: ${error.message}`);
                }
              });
            });
            
            // Set dataset count and start generation again
            await page.evaluate((count) => {
              document.getElementById('dataset-count').value = count;
            }, CONFIG.datasetCount);
            
            await page.getByText('Generate Dataset').click();
            console.log(`Worker ${workerId}: Generation restarted successfully`);
            
            // Setup next restart
            setupRestartTimer(page);
          } catch (error) {
            console.error(`Worker ${workerId}: Error during restart: ${error.message}`);
            // Try to recover by attempting restart again after a delay
            setTimeout(() => setupRestartTimer(page), 30000);
          }
        }, CONFIG.restartInterval);
      }

      console.log(`Worker ${workerId}: Starting generation`);
      await page.evaluate((count) => {
        document.getElementById('dataset-count').value = count;
      }, CONFIG.datasetCount);
      await page.getByText('Generate Dataset').click();

      // Wait for the dataset count input to be present and get its value
      const totalCount = await page.$eval('#dataset-count', el => parseInt(el.value, 10));
      console.log(`Worker ${workerId}: Generating ${totalCount} dataset pairs`);

      // Add progress tracking
      await page.evaluate(() => {
        window.datasetProgress = {
          count: 0,
          total: parseInt(document.getElementById('dataset-count').value, 10)
        };
        
        // Create progress elements if they don't exist
        if (!document.getElementById('dataset-progress')) {
          const progressSpan = document.createElement('span');
          progressSpan.id = 'dataset-progress';
          progressSpan.style.display = 'inline-block';
          progressSpan.innerHTML = `Progress: <span id="dataset-progress-count">0</span>/<span id="dataset-progress-total">${window.datasetProgress.total}</span>`;
          document.querySelector('.dataset-controls').appendChild(progressSpan);
        }
      });

      // Set up the automatic restart timer
      const restartTimer = await setupRestartTimer(page);

      // Let it run indefinitely - can be stopped manually
      console.log(`Worker ${workerId}: Generation started - running indefinitely until stopped...`);
      
      // Keep the script running
      await new Promise(() => {}); // Never resolves, keeps running until process is killed

      // These lines will never be reached due to infinite promise above
      clearTimeout(restartTimer);
      console.log(`Worker ${workerId}: Generation completed successfully`);
      await context.close();
      return true;

    } catch (error) {
      console.error(`Worker ${workerId} Error (Attempt ${retryCount + 1}/${CONFIG.retryAttempts}):`, error.message);
      
      if (context) {
        await context.close().catch(console.error);
      }

      retryCount++;
      if (retryCount < CONFIG.retryAttempts) {
        const delay = Math.min(CONFIG.retryDelay * Math.pow(2, retryCount), 60000);
        console.log(`Worker ${workerId}: Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Worker ${workerId}: Failed after ${CONFIG.retryAttempts} attempts`);
}

if (cluster.isMaster) {
  console.log(`
=== Dataset Generator ===
Available CPU cores: ${numCPUs}
Running instances: ${CONFIG.instances}
Headless mode: ${CONFIG.headless}
Output directory: ${CONFIG.outputDir}
Restart interval: ${CONFIG.restartInterval/1000/60} minutes
=====================
`);

  let completedWorkers = 0;
  let failedWorkers = 0;
  const workerMap = new Map(); // Track worker IDs

  // Fork workers
  for (let i = 0; i < CONFIG.instances; i++) {
    const workerId = i + 1;
    const worker = cluster.fork({ WORKER_ID: workerId });
    workerMap.set(worker.id, workerId);
  }

  // Handle worker events
  cluster.on('exit', (worker, code, signal) => {
    if (code !== 0) {
      failedWorkers++;
      const workerId = workerMap.get(worker.id);
      console.error(`Worker ${workerId} (PID: ${worker.process.pid}) died with code ${code}. Signal: ${signal}`);
      
      // Restart failed workers
      if (failedWorkers < CONFIG.instances * CONFIG.retryAttempts) {
        console.log(`Restarting worker ${workerId}...`);
        const newWorker = cluster.fork({ WORKER_ID: workerId });
        workerMap.set(newWorker.id, workerId);
      }
    }
  });

  cluster.on('message', (worker, message) => {
    if (message.status === 'completed') {
      completedWorkers++;
      console.log(`
Progress: ${completedWorkers}/${CONFIG.instances} completed
Failed: ${failedWorkers} workers
`);

      if (completedWorkers + failedWorkers === CONFIG.instances) {
        console.log(`
=== Final Results ===
Total completed: ${completedWorkers}
Total failed: ${failedWorkers}
=================
`);
        process.exit(failedWorkers > 0 ? 1 : 0);
      }
    }
  });

} else {
  const workerId = process.env.WORKER_ID;
  console.log(`Worker ${workerId} (PID: ${process.pid}) started`);
  
  runBrowser(workerId)
    .then(() => {
      process.send({ status: 'completed' });
      process.exit(0);
    })
    .catch((error) => {
      console.error(`Worker ${workerId} failed:`, error);
      process.exit(1);
    });
}
