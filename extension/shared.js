// shared.js - Shared utility functions for the extension

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
    
    // Try to parse the profile
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PARSE_PROFILE_REQUEST' });
    
    // Close the LinkedIn tab
    if (tab && tab.id) {
      chrome.tabs.remove(tab.id);
    }
    
    if (response?.ok && response?.result) {
      console.log('[shared] Profile parsed successfully');
      
      // Save the full backend response and last parsed time to storage
      const lastParsed = new Date().toISOString();
      await chrome.storage.sync.set({
        userProfileFull: response.fullProfile || response.result,
        userProfileLastParsed: lastParsed
      });
      console.log('[shared] Saved profile to storage with timestamp:', lastParsed);
      
      return { ok: true, result: response.result, fullProfile: response.fullProfile };
    } else {
      const errorMessage = response?.message || 'Could not parse profile data';
      const errorType = response?.error || 'unknown';
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
