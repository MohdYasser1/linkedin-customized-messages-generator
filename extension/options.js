// options.js

const DEFAULT_USER_PROFILE = {
  myName: '',
  myTitle: '',
  aboutMe: '',
  interests: '',
  strengths: '',
  other: '',
};

function byId(id) { return document.getElementById(id); }

function getUserProfile() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ userProfile: DEFAULT_USER_PROFILE }, (items) => {
      resolve(items.userProfile || DEFAULT_USER_PROFILE);
    });
  });
}

function setUserProfile(profile) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ userProfile: profile }, () => resolve(true));
  });
}

// API Key functions
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ geminiApiKey: '' }, (items) => {
      resolve(items.geminiApiKey || '');
    });
  });
}

function setApiKey(apiKey) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ geminiApiKey: apiKey }, () => resolve(true));
  });
}

async function loadApiKey() {
  const apiKey = await getApiKey();
  const apiKeyInput = byId('geminiApiKey');
  if (apiKeyInput) {
    apiKeyInput.value = apiKey;
  }
}

async function saveApiKey() {
  const apiKeyInput = byId('geminiApiKey');
  const status = byId('apiStatus');
  
  if (!apiKeyInput) return;
  
  const apiKey = apiKeyInput.value.trim();
  
  try {
    await setApiKey(apiKey);
    if (status) {
      status.textContent = apiKey ? 'API key saved successfully!' : 'API key cleared!';
      status.style.color = '#0a66c2';
    }
  } catch (error) {
    console.error('Error saving API key:', error);
    if (status) {
      status.textContent = 'Failed to save API key';
      status.style.color = '#d73a49';
    }
  }
}

async function testApiKey() {
  const apiKey = await getApiKey();
  const status = byId('apiStatus');
  const testBtn = byId('testApiKey');
  
  if (!apiKey) {
    if (status) {
      status.textContent = 'Please enter an API key first';
      status.style.color = '#d73a49';
    }
    return;
  }
  
  if (testBtn) testBtn.disabled = true;
  if (status) {
    status.textContent = 'Testing connection...';
    status.style.color = '#666';
  }
  
  try {
    // Simple test call to Gemini API
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey);
    
    if (response.ok) {
      if (status) {
        status.textContent = 'API key is valid!';
        status.style.color = '#28a745';
      }
    } else {
      throw new Error('Invalid API key or API error');
    }
  } catch (error) {
    console.error('API test error:', error);
    if (status) {
      status.textContent = 'API key test failed - please check your key';
      status.style.color = '#d73a49';
    }
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

async function loadForm() {
  const p = await getUserProfile();
  Object.keys(DEFAULT_USER_PROFILE).forEach(k => {
    const el = byId(k);
    if (el) el.value = p[k] || '';
  });
  
  // Also load the API key
  await loadApiKey();
}

async function saveForm() {
  const profile = {};
  Object.keys(DEFAULT_USER_PROFILE).forEach(k => {
    const el = byId(k);
    profile[k] = el ? el.value.trim() : DEFAULT_USER_PROFILE[k];
  });
  await setUserProfile(profile);
  const status = byId('status');
  if (status) { 
    status.textContent = 'Saved'; 
    setTimeout(() => status.textContent = '', 1200); 
  }
}

async function prefillFromCurrentTab() {
  const status = byId('status');
  const prefillBtn = byId('prefill');
  
  if (prefillBtn) prefillBtn.disabled = true;
  if (status) status.textContent = 'Opening your profile...';

  try {
    // Open LinkedIn profile tab
    const tab = await chrome.tabs.create({
      url: 'https://www.linkedin.com/in/me/',
      active: false
    });
    
    // Wait for tab to load
    await new Promise((resolve) => {
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

    if (status) status.textContent = 'Parsing your profile with AI...';
    
    // Try to parse the profile
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PARSE_PROFILE_REQUEST' });
    
    if (response?.ok && response?.result) {
      const current = await getUserProfile();
      const profileData = response.result;
      
      // Update profile with parsed data (only if current fields are empty)
      const updated = {
        ...current,
        myName: current.myName || profileData.name || '',
        myTitle: current.myTitle || profileData.headline || '',
        aboutMe: current.aboutMe || profileData.about || '',
        interests: current.interests || profileData.interests || '',
        other: current.other || profileData.other || '',
        strengths: current.strengths || profileData.strengths || ''
      };
      
      await setUserProfile(updated);
      await loadForm();
      
      if (status) {
        status.textContent = 'AI profile parsing successful!';
        status.style.color = '#28a745';
      }
      
      // Close the LinkedIn tab
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      }
      
    } else {
      // Handle different error types
      const errorMessage = response?.message || 'Could not parse profile data';
      const errorType = response?.error || 'unknown';
      
      let userMessage = 'Prefill failed';
      if (errorType === 'no-api-key') {
        userMessage = 'Please configure your API key in Settings tab first';
      } else if (errorType === 'network-error') {
        userMessage = 'Could not connect to AI service - check if backend is running';
      } else if (errorType === 'backend-error') {
        userMessage = 'AI processing failed - check your API key in Settings';
      } else if (errorType === 'no-main-element') {
        userMessage = 'Could not find profile content on the page';
      }
      
      if (status) {
        status.textContent = userMessage;
        status.style.color = '#d73a49';
      }
      
      // Close the LinkedIn tab
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      }
    }
  } catch (error) {
    console.error('Prefill error:', error);
    if (status) status.textContent = 'Prefill failed';
  } finally {
    if (prefillBtn) prefillBtn.disabled = false;
  }
}

// Tab switching functionality
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      // Update active button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active tab pane
      tabPanes.forEach(pane => pane.classList.remove('active'));
      const targetPane = document.getElementById(`${targetTab}-tab`);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });
}

// Event listeners
initializeTabs();
byId('save').addEventListener('click', saveForm);
byId('prefill').addEventListener('click', prefillFromCurrentTab);
byId('saveApiKey').addEventListener('click', saveApiKey);
byId('testApiKey').addEventListener('click', testApiKey);

// Initialize the page
loadForm();
