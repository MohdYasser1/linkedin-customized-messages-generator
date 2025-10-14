// popup.js

let currentMessage = '';
let currentTarget = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadGeneratedMessage();
});

function setupEventListeners() {
  // Close button
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });

  // Options button
  document.getElementById('optionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Copy button
  document.getElementById('copyBtn').addEventListener('click', copyMessage);

  // Regenerate button
  document.getElementById('regenerateBtn').addEventListener('click', regenerateMessage);

  // Generate button (no-op for now)
  const genBtn = document.getElementById('generateBtn');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      // Check if the current tab is a LinkedIn profile
      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url || !/^https:\/\/www\.linkedin\.com\/in\//.test(tab.url)) {
          displayError('Please open a LinkedIn profile (linkedin.com/in/...) and try again.');
          return;
        }
        
        // Check userProfileLastParsed and API key from storage BEFORE showing loading
        const result = await chrome.storage.sync.get(['userProfileLastParsed', 'geminiApiKey']);
        const lastParsed = result.userProfileLastParsed;
        const apiKey = result.geminiApiKey;
        
        // Check if API key is set
        if (!apiKey || apiKey.trim() === '') {
          console.log('[popup] No API key found in storage...');
          // Store the error message and tab preference for the options page
          await chrome.storage.local.set({ 
            optionsPageError: 'Gemini API key needs to be set up first. Please enter your API key below and click "Save API Key".',
            optionsPageTab: 'settings' // Open the API Settings tab
          });
          // Open the options page
          chrome.runtime.openOptionsPage();
          return;
        }
        
        // Check if user profile exists
        if (!lastParsed) {
          // No user profile parsed yet - open options page and show error there
          console.log('[popup] No user profile found in storage...');
          // Store the error message for the options page to display
          await chrome.storage.local.set({ 
            optionsPageError: 'User profile needs to be set up first. Please click "Prefill from current LinkedIn tab" to set up your profile.',
            optionsPageTab: 'profile' // Open the Profile tab
          });
          // Open the options page
          chrome.runtime.openOptionsPage();
          return;
        }
        
        const lastParsedTime = new Date(lastParsed).getTime();
        const now = Date.now();
        const hoursDiff = (now - lastParsedTime) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
          // User profile is stale (more than 24 hours old) - trigger profile update
          console.log('[popup] User profile is stale (>24h), updating profile...');
          
          // Show loading with profile update message
          showLoading('Updating your profile...');
          
          const parseResult = await parseUserProfile();
          
          if (parseResult.ok) {
            console.log('[popup] Profile updated successfully, proceeding with message generation...');
            // Profile updated, now show generating message
            showLoading('Generating personalized message...');
          } else {
            const errorMsg = getProfileParseErrorMessage(parseResult.error);
            displayError(`Failed to update your profile: ${errorMsg}. Please try again or update manually in Options.`);
            return;
          }
        } else {
          // Profile is fresh, show loading for message generation
          showLoading('Generating personalized message...');
        }
        
        // Get the updated user data from storage
        const storageData = await chrome.storage.sync.get(['userProfileFull']);
        const userData = storageData.userProfileFull;
        
        if (!userData) {
          displayError('User profile data not found. Please update your profile in Options.');
          return;
        }
        
        // Get form values for tone, length, CTA, and extra instructions
        const tone = document.getElementById('toneSelect')?.value || 'professional';
        const length = document.getElementById('lengthSelect')?.value || 'medium';
        const cta = document.getElementById('ctaInput')?.value || '';
        const extra = document.getElementById('extraInput')?.value || '';
        
        // Get target profile HTML from the current tab via content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROFILE_HTML' });
          
          if (!response?.ok || !response?.htmlContent) {
            displayError('Failed to extract profile HTML. Please refresh the page and try again.');
            return;
          }
          
          const targetHtml = response.htmlContent;
          
          // Create the payload for the background script
          const payload = {
            user_data: userData,
            target_html: targetHtml,
            tone: tone,
            length: length,
            call_to_action: cta,
            extra_instruction: extra
          };
          
          console.log('[popup] Sending generate message request with payload');
          
          // Send the payload to the background script
          chrome.runtime.sendMessage({
            type: 'GENERATE_MESSAGE',
            payload: payload
          });
          
        } catch (error) {
          console.error('[popup] Error getting target HTML:', error);
          displayError('Failed to read profile content. Please make sure you are on a LinkedIn profile page.');
          return;
        }
      });
    });
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MESSAGE_GENERATED') {
      displayMessage(message.payload);
    } else if (message.type === 'MESSAGE_ERROR') {
      displayError(message.error);
    }
  });
}

async function loadGeneratedMessage() {
  try {
    // Check if there's a message waiting in storage
    const result = await chrome.storage.local.get(['generatedMessage', 'messageTarget', 'messageError']);
    
    if (result.messageError) {
      displayError(result.messageError);
      // Clear the stored error
      chrome.storage.local.remove(['messageError']);
    } else if (result.generatedMessage) {
      displayMessage(result.generatedMessage);
      currentTarget = result.messageTarget;
      
      // Clear the stored message
      chrome.storage.local.remove(['generatedMessage', 'messageTarget']);
    } else {
      // Show a neutral placeholder until user clicks Generate
      displayPlaceholder();
    }
  } catch (error) {
    console.error('Failed to load message:', error);
    displayError('Failed to load generated message');
  }
}

function showLoading(message = 'Generating personalized message...') {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="loading">
      <span>${message}</span>
      <div class="spinner"></div>
    </div>
  `;
  document.getElementById('actions').style.display = 'none';
}

function displayMessage(message) {
  currentMessage = message;
  
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="message-content">
      ${escapeHtml(message)}
    </div>
  `;
  
  document.getElementById('actions').style.display = 'flex';
  hideStatus();
}

function displayError(error) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="placeholder error">
      <strong>Error</strong><br>
      ${escapeHtml(error)}<br><br>
      <em style="color:#b3261e;font-size:1rem;font-weight:400;">Please try again or check your settings.</em>
    </div>
  `;
  document.getElementById('actions').style.display = 'flex';
  hideStatus();
}

function displayPlaceholder() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="placeholder">
      <strong>No Generated Message</strong><br>
      Visit a LinkedIn profile and click "Generate Message" to create a personalized message.<br><br>
      <em>Generated messages will appear here for easy copying.</em>
    </div>
  `;
  
  document.getElementById('actions').style.display = 'none';
}

async function copyMessage() {
  if (!currentMessage) {
    showStatus('No message to copy', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(currentMessage);
    showStatus('Message copied to clipboard!', 'success');
  } catch (error) {
    console.error('Failed to copy message:', error);
    
    // Fallback: create a textarea and select the text
    const textarea = document.createElement('textarea');
    textarea.value = currentMessage;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    showStatus('Message copied to clipboard!', 'success');
  }
}

async function regenerateMessage() {
  showLoading();
  
  try {
    // Request regeneration from background script
    chrome.runtime.sendMessage({
      type: 'REGENERATE_MESSAGE',
      payload: currentTarget
    });
  } catch (error) {
    console.error('Failed to regenerate message:', error);
    displayError('Failed to regenerate message');
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    hideStatus();
  }, 3000);
}

function hideStatus() {
  const status = document.getElementById('status');
  status.style.display = 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// Show placeholder for now until AI integration is complete
displayPlaceholder();