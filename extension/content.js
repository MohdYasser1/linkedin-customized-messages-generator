// content.js
(async function () {
  // --- UTILITIES ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /**
   * Gets the main element HTML from the LinkedIn profile page
   * @returns {Promise<{ok: boolean, htmlContent?: string, error?: string}>}
   */
  async function getMainElementHtml() {
    // small wait to let dynamic elements load
    await sleep(400);

    // Extract the main HTML element from the LinkedIn profile
    const mainElement = document.querySelector('main');
    if (!mainElement) {
      console.error('Could not find main profile content');
      return { ok: false, error: 'no-main-element' };
    }

    const htmlContent = mainElement.outerHTML;
    return { ok: true, htmlContent: htmlContent };
  }

  // Handle requests for profile HTML extraction
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'GET_PROFILE_HTML') {
      (async () => {
        console.log('Extracting profile HTML from LinkedIn page...');
        
        const result = await getMainElementHtml();
        sendResponse(result);
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
