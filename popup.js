document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const colorPicker = document.getElementById('colorPicker');
  const colorPreview = document.getElementById('colorPreview');
  const hexColor = document.getElementById('hexColor');
  const rgbColor = document.getElementById('rgbColor');
  const hslColor = document.getElementById('hslColor');
  const copyHex = document.getElementById('copyHex');
  const copyRgb = document.getElementById('copyRgb');
  const copyHsl = document.getElementById('copyHsl');
  const saveColor = document.getElementById('saveColor');
  const clearColors = document.getElementById('clearColors');
  const savedColorsList = document.getElementById('savedColorsList');
  const colorCountDisplay = document.querySelector('.color-count');
  const eyedropperBtn = document.getElementById('eyedropper');
  
  // Check extension connection status
  let popupConnected = true;
  
  // Initialize color values
  updateColorInfo(colorPicker.value);
  colorPreview.style.backgroundColor = colorPicker.value;
  
  // Load saved colors
  loadSavedColors();
  
  // Load last selected color (if available)
  loadLastSelectedColor();
  
  // Check connection with background page
  function checkBackgroundConnection() {
    try {
      chrome.runtime.sendMessage({action: 'ping'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Background page connection failed:', chrome.runtime.lastError);
          popupConnected = false;
        } else {
          console.log('Background page connection successful');
          popupConnected = true;
        }
      });
    } catch (e) {
      console.error('Error checking background page connection:', e);
      popupConnected = false;
    }
  }
  
  // Initial connection check
  checkBackgroundConnection();
  
  // Listen for messages from background page (if popup is still open)
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateSelectedColor' && request.color) {
      // Update color display
      colorPicker.value = request.color;
      colorPreview.style.backgroundColor = request.color;
      updateColorInfo(request.color);
      
      // Reply with success
      sendResponse({ success: true });
      return true;
    }
  });
  
  // Handle eyedropper click event
  eyedropperBtn.addEventListener('click', function() {
    // Save the active eyedropper status
    try {
      chrome.storage.local.set({ pickerActive: true }, function() {
        if (chrome.runtime.lastError) {
          console.error('Failed to save eyedropper status:', chrome.runtime.lastError);
        }
      });
    } catch (e) {
      console.error('Error saving eyedropper status:', e);
    }
    
    // Try to check content script readiness
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        const currentTab = tabs[0];
        
        // Make sure we're not on browser internal pages
        if (currentTab.url.startsWith('chrome://') || 
            currentTab.url.startsWith('chrome-extension://') || 
            currentTab.url.startsWith('about:')) {
          alert("The eyedropper tool cannot work on browser internal pages. Please use it on regular websites.");
          return;
        }

        // For regular pages, use native EyeDropper API directly instead of trying to inject script
        if (typeof EyeDropper === 'function') {
          // Prefer native API, more reliable
          console.log("Attempting to use native eyedropper API");
          useNativeEyeDropper();
          return;
        }
        
        // If no native API is available, try to check content script status
        try {
          console.log("Checking content script status");
          chrome.tabs.sendMessage(currentTab.id, {action: 'checkContentScriptReady'}, function(response) {
            // Check for errors
            if (chrome.runtime.lastError) {
              console.log("Content script not ready, attempting to inject script");
              injectContentScript(currentTab.id);
            } else if (response && response.ready) {
              // Content script is ready, start eyedropper directly
              console.log("Content script is ready, starting eyedropper");
              startEyeDropper(currentTab.id);
            } else {
              console.log("Content script response is incorrect, trying to inject again");
              injectContentScript(currentTab.id);
            }
          });
        } catch (e) {
          console.error('Error checking content script:', e);
          console.log("Attempting to inject content script");
          injectContentScript(currentTab.id);
        }
      } else {
        alert("Unable to get current tab");
      }
    });
  });
  
  // Inject content script
  function injectContentScript(tabId) {
    console.log("Preparing to inject content script to tab:", tabId);
    
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content-script.js']
      }).then(() => {
        console.log("Content script injection successful");
        // Inject after a delay to give script running and event registration time
        setTimeout(() => {
          startEyeDropper(tabId);
        }, 300);
      }).catch(err => {
        console.error("Error injecting script:", err);
        fallbackToNativeEyeDropper();
      });
    } catch (e) {
      console.error("Error executing scripting API:", e);
      fallbackToNativeEyeDropper();
    }
  }
  
  // Start eyedropper tool
  function startEyeDropper(tabId) {
    console.log("Starting eyedropper tool, tabId:", tabId);
    
    try {
      chrome.tabs.sendMessage(tabId, {action: 'startEyeDropper'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error starting eyedropper tool: ", chrome.runtime.lastError.message);
          fallbackToNativeEyeDropper();
          return;
        }
        
        if (response && response.success) {
          console.log("Successfully started eyedropper tool, closing popup");
          // Close extension popup, allowing user to select color
          window.close();
        } else {
          console.error("Unknown error occurred starting eyedropper tool");
          fallbackToNativeEyeDropper();
        }
      });
    } catch (e) {
      console.error("Error attempting to start eyedropper tool:", e);
      fallbackToNativeEyeDropper();
    }
  }
  
  // Fallback to native eyedropper API
  function fallbackToNativeEyeDropper() {
    console.log("Attempting to use native eyedropper tool");
    // If content script is not ready, try to use native EyeDropper API
    if (typeof EyeDropper === 'function') {
      useNativeEyeDropper();
    } else {
      alert("Unable to start eyedropper tool, please ensure you're using this feature on a regular webpage.\n\nTip: Please try refreshing the page and trying again.");
    }
  }
  
  // Use native EyeDropper API
  async function useNativeEyeDropper() {
    try {
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      
      if (result && result.sRGBHex) {
        // Directly update color
        const colorValue = result.sRGBHex;
        colorPicker.value = colorValue;
        colorPreview.style.backgroundColor = colorValue;
        updateColorInfo(colorValue);
        
        // Parse RGB values
        const r = parseInt(colorValue.substr(1, 2), 16);
        const g = parseInt(colorValue.substr(3, 2), 16);
        const b = parseInt(colorValue.substr(5, 2), 16);
        
        // Save to local storage
        chrome.storage.local.set({ 
          currentColor: colorValue,
          lastRgb: { r, g, b },
          timestamp: Date.now()
        });
        
        // Notify background page to update color to ensure synchronization
        try {
          chrome.runtime.sendMessage({
            action: 'colorSelected',
            color: colorValue,
            rgb: { r, g, b }
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('Failed to notify background page:', chrome.runtime.lastError);
            } else {
              console.log('Successfully notified background page to update color');
            }
          });
        } catch (e) {
          console.error('Error attempting to send color message:', e);
        }
      }
    } catch (error) {
      console.error("Eyedropper tool error:", error);
      alert('Unable to start eyedropper tool');
    }
  }
  
  // Copy button event
  copyHex.addEventListener('click', () => copyToClipboard(hexColor));
  copyRgb.addEventListener('click', () => copyToClipboard(rgbColor));
  copyHsl.addEventListener('click', () => copyToClipboard(hslColor));
  
  // Save color event
  saveColor.addEventListener('click', function() {
    saveCurrentColor(colorPicker.value);
    // Make button lose focus immediately to avoid keeping selected state
    saveColor.blur();
  });
  
  // Clear all colors event
  clearColors.addEventListener('click', function() {
    chrome.storage.sync.set({ savedColors: [] }, function() {
      loadSavedColors(); // Reload color list (will display 15 empty slots)
    });
    // Make button lose focus
    clearColors.blur();
  });
  
  // Update color information function
  function updateColorInfo(color) {
    // Update HEX format
    hexColor.value = color.toUpperCase();
    
    // Convert to RGB format
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);
    rgbColor.value = `rgb(${r}, ${g}, ${b})`;
    
    // Convert to HSL format
    const [h, s, l] = rgbToHsl(r, g, b);
    hslColor.value = `hsl(${h}, ${s}%, ${l}%)`;
  }
  
  // RGB to HSL
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0; // Grayscale
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      
      h = Math.round(h * 60);
    }
    
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    
    return [h, s, l];
  }
  
  // Copy to clipboard
  function copyToClipboard(inputElement) {
    inputElement.select();
    document.execCommand('copy');
    
    // Unselect - add this line to avoid selection box staying visible
    window.getSelection().removeAllRanges();
    
    // Show visual feedback for copy success
    const originalText = inputElement.nextElementSibling.textContent;
    inputElement.nextElementSibling.textContent = 'Copied!';
    setTimeout(() => {
      inputElement.nextElementSibling.textContent = originalText;
    }, 1000);
  }
  
  // Save current color
  function saveCurrentColor(color) {
    // First check background page to determine if color limit is reached
    try {
      chrome.runtime.sendMessage({action: 'checkColorLimit'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error checking color limit:', chrome.runtime.lastError);
          // Backup plan: directly get from local storage
          checkAndSaveColor(color);
        } else if (response && response.success) {
          if (response.canAddMore) {
            // Can save more colors
            checkAndSaveColor(color);
          } else {
            // Color limit reached
            alert("Current storage slot is full (15/15), please delete unused colors before saving new ones.");
          }
        } else {
          // Unexpected situation, try to save directly
          checkAndSaveColor(color);
        }
      });
    } catch (e) {
      console.error('Error checking color limit:', e);
      // Backup plan
      checkAndSaveColor(color);
    }
  }
  
  // Check if color already exists and save
  function checkAndSaveColor(color) {
    chrome.storage.sync.get('savedColors', function(data) {
      const savedColors = data.savedColors || [];
      
      // Check if color already exists
      if (!savedColors.includes(color)) {
        // Limit to maximum 15 colors
        if (savedColors.length >= 15) {
          // When reaching 15 colors, show warning window instead of automatically removing the oldest color
          alert("Current storage slot is full (15/15), please delete unused colors before saving new ones.");
          return; // Interrupt saving process
        }
        
        savedColors.push(color);
        chrome.storage.sync.set({ savedColors: savedColors }, function() {
          if (chrome.runtime.lastError) {
            console.error('Failed to save color:', chrome.runtime.lastError);
            alert('Error saving color, please try again.');
          } else {
            console.log('Successfully saved color:', color);
            loadSavedColors();
          }
        });
      } else {
        alert("This color already exists in the saved list.");
      }
    });
  }
  
  // Load saved colors
  function loadSavedColors() {
    chrome.storage.sync.get('savedColors', function(data) {
      const savedColors = data.savedColors || [];
      savedColorsList.innerHTML = '';
      
      // Update color count
      updateColorCount(savedColors.length);
      
      // First create all empty slots
      for (let i = 0; i < 15; i++) {
        if (i < savedColors.length) {
          // Use saved color
          const color = savedColors[i];
          const colorItem = createColorItem(color, i);
          savedColorsList.appendChild(colorItem);
        } else {
          // Create empty slot
          const emptySlot = document.createElement('div');
          emptySlot.className = 'empty-slot';
          emptySlot.title = 'Empty slot';
          savedColorsList.appendChild(emptySlot);
        }
      }
    });
  }
  
  // Create single color item
  function createColorItem(color, index) {
    const colorItem = document.createElement('div');
    colorItem.className = 'color-item';
    colorItem.style.backgroundColor = color;
    colorItem.setAttribute('data-color', color);
    colorItem.setAttribute('data-index', index);
    colorItem.title = color;
    
    // Delete button
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete this color';
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent triggering parent element click event
      removeColorByIndex(index);
    });
    
    colorItem.appendChild(deleteBtn);
    
    // Click to select saved color
    colorItem.addEventListener('click', function(e) {
      if (e.target === colorItem) {
        const selectedColor = colorItem.getAttribute('data-color');
        colorPicker.value = selectedColor;
        colorPreview.style.backgroundColor = selectedColor;
        updateColorInfo(selectedColor);
      }
    });
    
    return colorItem;
  }
  
  // Update color count display
  function updateColorCount(count) {
    colorCountDisplay.textContent = `(${count}/15)`;
  }
  
  // Remove color by index
  function removeColorByIndex(indexToRemove) {
    chrome.storage.sync.get('savedColors', function(data) {
      const savedColors = data.savedColors || [];
      
      if (indexToRemove >= 0 && indexToRemove < savedColors.length) {
        savedColors.splice(indexToRemove, 1);
        
        chrome.storage.sync.set({ savedColors: savedColors }, function() {
          loadSavedColors();
        });
      }
    });
  }
  
  // Remove specific color
  function removeColor(colorToRemove) {
    chrome.storage.sync.get('savedColors', function(data) {
      const savedColors = data.savedColors || [];
      const updatedColors = savedColors.filter(color => color !== colorToRemove);
      
      chrome.storage.sync.set({ savedColors: updatedColors }, function() {
        loadSavedColors();
      });
    });
  }
  
  // Load last selected color
  function loadLastSelectedColor() {
    chrome.storage.local.get('currentColor', function(data) {
      if (data.currentColor) {
        colorPicker.value = data.currentColor;
        colorPreview.style.backgroundColor = data.currentColor;
        updateColorInfo(data.currentColor);
      }
    });
  }
});
