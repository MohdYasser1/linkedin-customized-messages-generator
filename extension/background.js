// background.js

// Configuration
const SERVER_URL = 'http://localhost:8000';

chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Parser installed');
  try {
    chrome.contextMenus.create({
      id: 'lncmg-open-options',
      title: 'LinkedIn Messages: Edit My Profile',
      contexts: ['all']
    });
  } catch {}
});

// Helper to get API key from storage
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ apiKey: null }, (items) => {
      resolve(items.apiKey || null);
    });
  });
}

// Helper to check if user profile has been parsed before
function getUserProfileParsedStatus() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ userProfileParsed: false, userProfileData: null }, (items) => {
      resolve({
        isParsed: items.userProfileParsed || false,
        profileData: items.userProfileData || null
      });
    });
  });
}

// Helper to set user profile parsed status
function setUserProfileParsedStatus(isParsed, profileData = null) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ 
      userProfileParsed: isParsed,
      userProfileData: profileData 
    }, () => {
      resolve(true);
    });
  });
}

async function sendToBackend(profile) {
  const apiKey = await getApiKey();
  // if (!apiKey) throw new Error('No API key configured');

  // Use the configured server URL
  const endpoint = `${SERVER_URL}/generate`; 

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(profile)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Backend error: ${res.status} ${txt}`);
  }
  console.log("Response received from backend");
  const result = await res.json();
  console.log("Response data:", result);
  return result;
}

// Function to call the parse_profile endpoint specifically for prefill
async function parseProfileWithAI(htmlContent) {
  return new Promise(resolve => {
    chrome.storage.sync.get({ geminiApiKey: '' }, async (items) => {
      const apiKey = items.geminiApiKey || '';
      
      if (!apiKey) {
        resolve({ ok: false, error: 'no-api-key', message: 'Please configure your Gemini API key in the extension settings' });
        return;
      }

      try {
        const response = await fetch(`${SERVER_URL}/parse_profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            html_content: htmlContent,
            timestamp: new Date().toISOString()
          })
        });

        if (!response.ok) {
          // Check for specific status codes
          if (response.status === 503) {
            resolve({ ok: false, error: '503', message: 'The model is overloaded. Please try again later.' });
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
          resolve({ ok: false, error: 'backend-error', message: data.error });
          return;
        }

        // Transform the data to match expected format
        const profileData = {
          name: data.name || '',
          headline: data.headline || '',
          about: data.about || '',
          interests: data.interests || '',
          strengths: Array.isArray(data.strengths) ? data.strengths.join(', ') : (data.strengths || ''),
          other: data.others || ''
        };

        resolve({ ok: true, result: profileData });

      } catch (error) {
        console.error('Error calling parse_profile endpoint:', error);
        resolve({ 
          ok: false, 
          error: 'network-error', 
          message: `Failed to connect to AI service: ${error.message}` 
        });
      }
    });
  });
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PARSE_PROFILE_REQUEST') {
    console.log("Received PARSE_PROFILE_REQUEST for options prefill");
    const payload = message.payload;
    
    // Call the AI parsing endpoint specifically for profile prefill
    parseProfileWithAI(payload.htmlContent).then((resp) => {
      console.log("Profile parsing completed:", resp);
      sendResponse(resp);
    }).catch((err) => {
      console.error("Profile parsing failed:", err);
      sendResponse({ ok: false, error: 'parsing-failed', message: err.message });
    });
    
    return true; // async response
  }

  if (message?.type === 'GENERATE_MESSAGE') {
    console.log("Received GENERATE_MESSAGE:", message);
    const payload = message.payload;
    
    // The payload now contains: user_data, target_html, tone, length, call_to_action, extra_instruction
    const backendPayload = {
      user_data: payload.user_data,
      target_html: payload.target_html,
      tone: payload.tone,
      length: payload.length,
      call_to_action: payload.call_to_action,
      extra_instruction: payload.extra_instruction
    };
    
    console.log("Sending to backend:", backendPayload);
    
    // call backend, respond asynchronously
    
    (backendPayload).then(async (resp) => {
      console.log("Message generated successfully:", resp);
      
      // Store the generated message for popup
      const generatedMessage = resp.generated_message || resp.message || 'Generated message placeholder';
      await chrome.storage.local.set({
        generatedMessage: generatedMessage,
        messageTarget: payload,
        messageError: null  // Clear any previous errors
      });
      
      // Try to automatically open popup
      chrome.action.openPopup().catch((error) => {
        console.log("Could not auto-open popup:", error);
        // Fallback: Show notification on the page
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SHOW_SUCCESS_NOTIFICATION',
              message: 'Message generated! Click the extension icon to view it.'
            });
          }
        });
      });
      
      sendResponse({ ok: true, result: resp });
    }).catch(async (err) => {
      console.error("Failed to generate message:", err);
      
      // Store error for popup
      await chrome.storage.local.set({
        generatedMessage: null,
        messageError: err.message,
        messageTarget: payload
      });
      
      // Try to automatically open popup for error
      chrome.action.openPopup().catch((error) => {
        console.log("Could not auto-open error popup:", error);
        // Fallback: Show error notification on the page
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SHOW_ERROR_NOTIFICATION',
              message: 'Message generation failed. Click the extension icon for details.'
            });
          }
        });
      });
      
      sendResponse({ ok: false, error: err.message });
    });
    // tell Chrome we'll call sendResponse asynchronously
    return true;
  }
  
  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse?.({ ok: true });
    return true;
  }
});

// Note: Removed action click handler since we now use default_popup

// Context menu click handler
chrome.contextMenus?.onClicked.addListener((info) => {
  if (info.menuItemId === 'lncmg-open-options') {
    chrome.runtime.openOptionsPage();
  }
});

// Keyboard command handler
chrome.commands?.onCommand.addListener((cmd) => {
  if (cmd === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});
