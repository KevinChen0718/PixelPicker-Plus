// Variable definition
let isEyeDropperActive = false;
let colorInfoPanel = null;
let magnifierCircle = null;
let isConnected = true;

// Check environment
console.log('PixelPicker Plus content script loaded');

// Check extension connection status
function checkConnection() {
  try {
    // Use ping message to check connection
    chrome.runtime.sendMessage({action: 'ping'}, function(response) {
      if (chrome.runtime.lastError) {
        console.log('Connection to extension has been disconnected');
        isConnected = false;
      } else {
        isConnected = true;
        console.log('Connection to extension is normal');
      }
    });
  } catch (e) {
    // If error occurs, connection is broken
    console.log('Failed to check connection to extension:', e);
    isConnected = false;
  }
}

// Initial connection check
checkConnection();

// Check connection periodically
setInterval(checkConnection, 5000);

// Listen for messages from extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Check if content script has been loaded
  if (request.action === 'ping') {
    sendResponse({success: true, status: 'content script alive'});
    return true;
  }
  
  if (request.action === 'checkContentScriptReady') {
    console.log('Content script is ready');
    sendResponse({ success: true, ready: true });
    return true;
  }
  
  if (request.action === 'startEyeDropper') {
    console.log('Received request to start eyedropper tool');
    startCustomEyeDropper();
    sendResponse({ success: true });
    return true;
  }
});

// Start custom eyedropper tool
function startCustomEyeDropper() {
  if (isEyeDropperActive) return;
  
  console.log('Starting eyedropper tool');
  isEyeDropperActive = true;
  
  // Remove old panels (if they exist)
  if (colorInfoPanel && colorInfoPanel.parentNode) {
    colorInfoPanel.parentNode.removeChild(colorInfoPanel);
    colorInfoPanel = null;
  }
  
  if (magnifierCircle && magnifierCircle.parentNode) {
    magnifierCircle.parentNode.removeChild(magnifierCircle);
    magnifierCircle = null;
  }
  
  // Create an integrated color picker tool container
  const eyedropperContainer = document.createElement('div');
  colorInfoPanel = eyedropperContainer; // Reuse existing variable
  
  eyedropperContainer.style.position = 'fixed';
  eyedropperContainer.style.zIndex = '10000000';
  eyedropperContainer.style.pointerEvents = 'none';
  eyedropperContainer.style.transition = 'transform 0.1s ease';
  eyedropperContainer.style.willChange = 'transform';
  eyedropperContainer.style.transformOrigin = 'center center';
  
  // Create magnifier circle
  const circle = document.createElement('div');
  magnifierCircle = circle; // Reuse existing variable
  
  circle.style.width = '80px';
  circle.style.height = '80px';
  circle.style.borderRadius = '50%';
  circle.style.border = '3px solid #fff';
  circle.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
  circle.style.backgroundColor = 'transparent';
  circle.style.position = 'relative';
  circle.style.overflow = 'hidden';
  
  // Create crosshair
  const crosshair = document.createElement('div');
  crosshair.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
      background-color: rgba(255, 255, 255, 0.7);
      transform: translateY(-50%);
    "></div>
    <div style="
      position: absolute;
      left: 50%;
      top: 0;
      height: 100%;
      width: 1px;
      background-color: rgba(255, 255, 255, 0.7);
      transform: translateX(-50%);
    "></div>
  `;
  
  // Combine elements
  circle.appendChild(crosshair);
  eyedropperContainer.appendChild(circle);
  
  // Add to document
  document.body.appendChild(eyedropperContainer);
  
  // Set initial position
  const initialX = window.innerWidth / 2;
  const initialY = window.innerHeight / 2;
  
  // Set cursor style
  document.body.style.cursor = 'none'; // Hide original cursor
  
  // Initial tool display
  eyedropperContainer.style.transform = `translate(${initialX - 40}px, ${initialY - 40}px)`;
  
  // Listen for mouse movement
  document.addEventListener('mousemove', handleMouseMove);
  
  // Listen for click events
  document.addEventListener('click', handleClick);
  
  // Listen for ESC key to cancel
  document.addEventListener('keydown', handleKeyDown);
  
  // Trigger color detection once to immediately display content
  setTimeout(() => {
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: initialX,
      clientY: initialY
    });
    handleMouseMove(mouseEvent);
  }, 100);
}

// Process mouse movement
function handleMouseMove(e) {
  if (!isEyeDropperActive || !colorInfoPanel || !magnifierCircle) return;
  
  try {
    // Ensure valid event object and position information
    if (!e || typeof e.clientX === 'undefined' || typeof e.clientY === 'undefined') {
      console.error('Invalid mouse event or position information');
      return;
    }
    
    // Update eyedropper tool position - Use transform instead of left/top for better performance
    colorInfoPanel.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 40}px)`;
    
    // Use document.elementFromPoint to get element below mouse
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;
    
    // Try to get actual color of pixel
    let r = 0, g = 0, b = 0;
    let colorFound = false;
    
    // Try method 1: Get color from image
    if (element.tagName.toLowerCase() === 'img' && !colorFound) {
      try {
        const canvas = document.createElement('canvas');
        const rect = element.getBoundingClientRect();
        
        // Calculate coordinates relative to image
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Ensure coordinates are within image range
        if (x >= 0 && y >= 0 && x < rect.width && y < rect.height) {
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          try {
            // Draw pixel at corresponding position of image
            ctx.drawImage(element, x, y, 1, 1, 0, 0, 1, 1);
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            r = pixel[0];
            g = pixel[1];
            b = pixel[2];
            colorFound = true;
          } catch (canvasErr) {
            console.error('Failed to draw canvas operation (possibly cross-domain restriction):', canvasErr);
          }
        }
      } catch (imgErr) {
        console.error('Failed to get color from image:', imgErr);
      }
    }
    
    // Try method 2: Get color from computed style
    if (!colorFound) {
      try {
        const computedStyle = window.getComputedStyle(element);
        
        // Try to get different color attributes of element
        const colors = [
          computedStyle.backgroundColor,
          computedStyle.color,
          computedStyle.borderColor,
          computedStyle.outlineColor
        ];
        
        // Choose first valid color
        for (let color of colors) {
          if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
            const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
            if (rgbMatch) {
              r = parseInt(rgbMatch[1], 10);
              g = parseInt(rgbMatch[2], 10);
              b = parseInt(rgbMatch[3], 10);
              colorFound = true;
              break;
            }
          }
        }
      } catch (styleErr) {
        console.error('Failed to get color from computed style:', styleErr);
      }
    }
    
    // Try method 3: Get color from parent element
    if (!colorFound && element.parentElement) {
      try {
        const parentStyle = window.getComputedStyle(element.parentElement);
        const bgColor = parentStyle.backgroundColor;
        
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
          if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
            colorFound = true;
          }
        }
      } catch (parentErr) {
        console.error('Failed to get color from parent element:', parentErr);
      }
    }
    
    // Update magnifier circle background color
    if (magnifierCircle) {
      magnifierCircle.style.backgroundColor = colorFound ? `rgb(${r}, ${g}, ${b})` : 'rgba(150, 150, 150, 0.3)';
    }
    
  } catch (error) {
    console.error('Error processing mouse movement:', error);
  }
}

// Process click events
function handleClick(e) {
  if (!isEyeDropperActive) return;
  
  // Immediately prevent event bubbling and default behavior
  e.preventDefault();
  e.stopPropagation();
  
  console.log('Eyedropper click event');
  
  // Capture click position to prevent stopEyeDropper event object from being modified
  const clientX = e.clientX;
  const clientY = e.clientY;
  
  try {
    // Use logic from handleMouseMove to get color below mouse
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
      stopEyeDropper();
      return;
    }
    
    // Try to get actual color of pixel
    let r, g, b;
    let colorFound = false;
    
    // Try method 1: Get color from image
    if (element.tagName.toLowerCase() === 'img' && !colorFound) {
      try {
        const canvas = document.createElement('canvas');
        const rect = element.getBoundingClientRect();
        
        // Calculate coordinates relative to image
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Ensure coordinates are within image range
        if (x >= 0 && y >= 0 && x < rect.width && y < rect.height) {
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          try {
            // Draw pixel at corresponding position of image
            ctx.drawImage(element, x, y, 1, 1, 0, 0, 1, 1);
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            r = pixel[0];
            g = pixel[1];
            b = pixel[2];
            colorFound = true;
          } catch (canvasErr) {
            console.error('Failed to draw canvas operation (possibly cross-domain restriction):', canvasErr);
          }
        }
      } catch (imgErr) {
        console.error('Failed to get color from image:', imgErr);
      }
    }
    
    // Try method 2: Get color from computed style
    if (!colorFound) {
      try {
        const computedStyle = window.getComputedStyle(element);
        
        // Try to get different color attributes of element
        const colors = [
          computedStyle.backgroundColor,
          computedStyle.color,
          computedStyle.borderColor,
          computedStyle.outlineColor
        ];
        
        // Choose first valid color
        for (let color of colors) {
          if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
            const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
            if (rgbMatch) {
              r = parseInt(rgbMatch[1], 10);
              g = parseInt(rgbMatch[2], 10);
              b = parseInt(rgbMatch[3], 10);
              colorFound = true;
              break;
            }
          }
        }
      } catch (styleErr) {
        console.error('Failed to get color from computed style:', styleErr);
      }
    }
    
    // Try method 3: Get color from parent element
    if (!colorFound && element.parentElement) {
      try {
        const parentStyle = window.getComputedStyle(element.parentElement);
        const bgColor = parentStyle.backgroundColor;
        
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
          if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
            colorFound = true;
          }
        }
      } catch (parentErr) {
        console.error('Failed to get color from parent element:', parentErr);
      }
    }
    
    if (colorFound) {
      // Convert to hex
      const hexColor = rgbToHex(r, g, b);
      
      console.log('Selected color:', hexColor, 'RGB:', r, g, b);
      
      // Safely send message
      sendColorMessage(hexColor, r, g, b);
    } else {
      console.error('Failed to get color');
      alert('Failed to get color at this location, please try another location.');
    }
  } catch (error) {
    console.error('Failed to select color:', error);
  } finally {
    // Stop eyedropper tool
    stopEyeDropper();
  }
}

// Process keyboard events
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    stopEyeDropper();
  }
}

// Stop eyedropper tool
function stopEyeDropper() {
  isEyeDropperActive = false;
  
  // Restore cursor
  document.body.style.cursor = '';
  
  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('click', handleClick);
  document.removeEventListener('keydown', handleKeyDown);
  
  // Remove integrated color picker tool container
  if (colorInfoPanel && colorInfoPanel.parentNode) {
    colorInfoPanel.parentNode.removeChild(colorInfoPanel);
    colorInfoPanel = null;
    magnifierCircle = null; // Already included in container
  }
  
  console.log('Eyedropper tool stopped');
}

// RGB to HEX
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// Safely send color message
function sendColorMessage(hexColor, r, g, b) {
  try {
    if (!isConnected) {
      console.error('Failed to send color, extension connection is broken');
      return;
    }
    
    // Try normal message sending
    chrome.runtime.sendMessage({
      action: 'colorSelected',
      color: hexColor,
      rgb: { r, g, b }
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Failed to send color message:', chrome.runtime.lastError);
        // Try using local storage as backup
        try {
          chrome.storage.local.set({ 
            currentColor: hexColor,
            lastRgb: { r, g, b },
            timestamp: Date.now()
          });
          console.log('Color saved to local storage');
        } catch (e) {
          console.error('Failed to save color to local storage:', e);
        }
      } else {
        console.log('Sent color selection message successfully, response:', response);
      }
    });
  } catch (error) {
    console.error('Failed to try send color message:', error);
  }
} 