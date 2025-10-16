// shared.js - Shared utility functions for the extension

/**
 * Gets the Gemini API key from storage
 * @returns {Promise<string>} The API key or empty string
 */
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ geminiApiKey: '' }, (items) => {
      resolve(items.geminiApiKey || '');
    });
  });
}

/**
 * Parses the user's LinkedIn profile by opening their profile page,
 * sending a parse request to the content script, and saving the result.
 * @returns {Promise<{ok: boolean, error?: string, result?: any}>}
 */
async function parseUserProfile() {
  console.log('[shared] Parsing user profile...');
  
  try {
    // Open LinkedIn profile tab
    const tab = await chrome.tabs.create({
      url: 'https://www.linkedin.com/in/me/',
      active: false
    });
    
    // Wait for tab to load
    const loadSuccess = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 25000); // 25 second timeout
      
      const onUpdated = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          clearTimeout(timeout);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    
    if (!loadSuccess) {
      // Close the tab if it timed out
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      }
      return { ok: false, error: 'Profile page load timeout' };
    }
    
    // Get profile HTML from content script
    const htmlResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROFILE_HTML' });
    
    // Close the LinkedIn tab
    if (tab && tab.id) {
      chrome.tabs.remove(tab.id);
    }
    
    if (!htmlResponse?.ok) {
      const errorMessage = htmlResponse?.message || 'Could not extract profile HTML';
      console.error('[shared] Profile HTML extraction failed:', errorMessage);
      return { ok: false, error: 'no-main-element', message: errorMessage };
    }
    
    // Send HTML to background script for AI parsing
    const parseResponse = await chrome.runtime.sendMessage({
      type: 'PARSE_PROFILE_REQUEST',
      html: htmlResponse.htmlContent
    });
    
    if (parseResponse?.ok && parseResponse?.result) {
      console.log('[shared] Profile parsed successfully');
      
      // Save the full backend response and last parsed time to storage
      const lastParsed = new Date().toISOString();
      await chrome.storage.sync.set({
        userProfileFull: parseResponse.fullProfile || parseResponse.result,
        userProfileLastParsed: lastParsed
      });
      console.log('[shared] Saved profile to storage with timestamp:', lastParsed);
      
      return { ok: true, result: parseResponse.result, fullProfile: parseResponse.fullProfile };
    } else {
      const errorMessage = parseResponse?.message || 'Could not parse profile data';
      const errorType = parseResponse?.error || 'unknown';
      console.error('[shared] Profile parsing failed:', errorType, errorMessage);
      return { ok: false, error: errorType, message: errorMessage };
    }
  } catch (error) {
    console.error('[shared] Profile parsing error:', error);
    return { ok: false, error: 'exception', message: error.message };
  }
}

/**
 * Gets a user-friendly error message based on the error type
 * @param {string} errorType - The error type from the parse response
 * @returns {string} User-friendly error message
 */
function getProfileParseErrorMessage(errorType) {
  switch (errorType) {
    case 'no-api-key':
      return 'Please configure your API key in Settings tab first';
    case '503':
      return 'The model is overloaded. Please try again later.';
    case 'network-error':
      return 'Could not connect to AI service - check if backend is running';
    case 'backend-error':
      return 'AI processing failed - check your API key in Settings';
    case 'no-main-element':
      return 'Could not find profile content on the page';
    case 'exception':
      return 'An error occurred while parsing the profile';
    case 'timeout':
      return 'Profile page took too long to load';
    default:
      return 'Profile parsing failed';
  }
}
