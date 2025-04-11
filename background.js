// Listen for extension installation event
chrome.runtime.onInstalled.addListener(function() {
  console.log('Color picker extension installed/updated');
  
  // Initialize storage space
  chrome.storage.local.get('savedColors', function(data) {
    if (!data.savedColors) {
      chrome.storage.local.set({ savedColors: [] });
    }
  });
  
  // Initialize current color storage
  chrome.storage.local.set({ 
    currentColor: '#3366ff'
  });
});

// Listen for storage changes to sync with any open popup windows
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local' && changes.currentColor) {
    const newColor = changes.currentColor.newValue;
    
    // Try to update any open popup with the new color
    try {
      chrome.runtime.sendMessage({
        action: 'updateSelectedColor',
        color: newColor
      }).catch(() => {
        // Popup might be closed, that's okay
      });
    } catch (e) {
      // Error is expected if popup is closed
    }
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Basic ping for connection testing
  if (request.action === 'ping') {
    sendResponse({ success: true });
    return true;
  }
  
  // Handle color selection from EyeDropper
  if (request.action === 'colorSelected' && request.color) {
    // No need for complex processing, just acknowledge
    sendResponse({ success: true });
    return true;
  }
  
  // 檢查顏色限制 - 處理來自popup.js的請求
  if (request.action === 'checkColorLimit') {
    // 從同步儲存獲取已保存的顏色
    chrome.storage.sync.get('savedColors', function(data) {
      const savedColors = data.savedColors || [];
      // 判斷是否可以添加更多顏色（最多15個）
      const canAddMore = savedColors.length < 15;
      
      // 返回結果
      sendResponse({ 
        success: true, 
        canAddMore: canAddMore,
        currentCount: savedColors.length
      });
    });
    
    // 非同步回應必須返回true
    return true;
  }
});
