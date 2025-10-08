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
    genBtn.addEventListener('click', () => {
      // Show loading spinner until generation is implemented
      showLoading();
      // TODO: Wire generation using selected tone/length/cta/extra inputs
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

function showLoading() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="loading">
      <span>Generating personalized message...</span>
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
    <div class="placeholder">
      <strong>Error generating message</strong><br>
      ${escapeHtml(error)}<br><br>
      <em>Please try again or check your settings.</em>
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