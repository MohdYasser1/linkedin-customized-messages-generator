// background.js

// Import shared utilities
importScripts('shared.js');

// Configuration
const SERVER_URL = 'https://theaverage-linkedin-customized-message-generator.hf.space';

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

async function sendToBackend(profile) {
  const apiKey = await getApiKey();

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
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    return { ok: false, error: 'no-api-key', message: 'Please configure your Gemini API key in the extension settings' };
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
        return { ok: false, error: '503', message: 'The model is overloaded. Please try again later.' };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      return { ok: false, error: 'backend-error', message: data.error };
    }

    // Transform the data to match expected format
    const profileData = {
      name: data.name || '',
      headline: data.headline || '',
      about: data.about || '',
      interests: data.interests || '',
      strengths: Array.isArray(data.strengths) ? data.strengths.join('\n') : (data.strengths || ''),
      other: data.other || ''
    };

    return { ok: true, result: profileData };

  } catch (error) {
    console.error('Error calling parse_profile endpoint:', error);
    return { 
      ok: false, 
      error: 'network-error', 
      message: `Failed to connect to AI service: ${error.message}` 
    };
  }
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PARSE_PROFILE_REQUEST') {
    console.log("Received PARSE_PROFILE_REQUEST for profile parsing");
    const htmlContent = message.html;
    
    if (!htmlContent) {
      console.error("No HTML content provided for parsing");
      sendResponse({ ok: false, error: 'no-html', message: 'No HTML content provided' });
      return true;
    }
    
    // Call the AI parsing endpoint with the HTML content
    parseProfileWithAI(htmlContent).then((resp) => {
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
    sendToBackend(backendPayload).then(async (resp) => {
      console.log("Message generated successfully:", resp);
      
      // Store the generated message for popup
      const generatedMessage = resp.generated_message || resp.message || 'Generated message placeholder';
      await chrome.storage.local.set({
        generatedMessage: generatedMessage,
        messageTarget: payload,
        messageError: null  // Clear any previous errors
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

// Context menu click handler
chrome.contextMenus?.onClicked.addListener((info) => {
  if (info.menuItemId === 'lncmg-open-options') {
    chrome.runtime.openOptionsPage();
  }
});