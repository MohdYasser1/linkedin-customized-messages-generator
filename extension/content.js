// content.js
(async function () {
  // --- UTILITIES ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Allow Options page to request parsing for prefill
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'PARSE_PROFILE_REQUEST') {
      (async () => {
        console.log('Extracting profile HTML for AI parsing...');
        
        // small wait to let dynamic elements load
        await sleep(400);

        // Extract the main HTML element from the user's LinkedIn profile
        const mainElement = document.querySelector('main');
        if (!mainElement) {
          console.error('Could not find main profile content');
          sendResponse({ ok: false, error: 'no-main-element' });
          return;
        }

        const htmlContent = mainElement.outerHTML;
        
        // Send HTML to background script for AI processing
        chrome.runtime.sendMessage({ 
          type: 'PARSE_PROFILE_REQUEST',
          payload: { htmlContent }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Background script communication failed', chrome.runtime.lastError);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      })();
      return true; // async response
    }
    
    if (msg?.type === 'SHOW_SUCCESS_NOTIFICATION') {
      showPageNotification(msg.message, false);
    }
    
    if (msg?.type === 'SHOW_ERROR_NOTIFICATION') {
      showPageNotification(msg.message, true);
    }
  });

})();
