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

// API Key functions - setApiKey (getApiKey is now in shared.js)
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
  
  // Check for error message and tab preference from popup
  const result = await chrome.storage.local.get(['optionsPageError', 'optionsPageTab']);
  if (result.optionsPageError) {
    // Switch to the specified tab if provided
    if (result.optionsPageTab) {
      const tabButtons = document.querySelectorAll('.tab-button');
      const tabPanes = document.querySelectorAll('.tab-pane');
      
      // Activate the specified tab
      tabButtons.forEach(btn => {
        if (btn.dataset.tab === result.optionsPageTab) {
          // Remove active from all buttons
          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          // Remove active from all panes
          tabPanes.forEach(pane => pane.classList.remove('active'));
          const targetPane = document.getElementById(`${result.optionsPageTab}-tab`);
          if (targetPane) {
            targetPane.classList.add('active');
          }
        }
      });
    }
    
    // Display error in the appropriate status element
    const statusId = result.optionsPageTab === 'settings' ? 'apiStatus' : 'status';
    const status = byId(statusId);
    if (status) {
      status.textContent = result.optionsPageError;
      status.style.color = '#d73a49';
      status.style.fontWeight = '600';
    }
    // Clear the error and tab preference after displaying
    chrome.storage.local.remove(['optionsPageError', 'optionsPageTab']);
  }
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
  const loading = byId('prefillLoading');
  const loadingText = byId('prefillLoadingText');
  
  if (prefillBtn) prefillBtn.disabled = true;
  if (status) { status.textContent = ''; status.style.color = '#666'; }
  if (loading) loading.style.display = 'inline-flex';
  if (loadingText) loadingText.textContent = 'Opening your profile…';

  try {
    // Use the shared parseUserProfile function
    if (loadingText) loadingText.textContent = 'Parsing your profile with AI…';
    const response = await parseUserProfile();
    
    if (response.ok) {
      const current = await getUserProfile();
      const profileData = response.result;

      // Note: Storage is already handled by parseUserProfile() in shared.js

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

      if (loading) loading.style.display = 'none';
      if (status) {
        status.textContent = 'AI profile parsing successful!';
        status.style.color = '#28a745';
      }
    } else {
      // Use shared error message function
      const userMessage = getProfileParseErrorMessage(response.error);
      
      if (loading) loading.style.display = 'none';
      if (status) {
        status.textContent = userMessage;
        status.style.color = '#d73a49';
      }
    }
  } catch (error) {
    console.error('Prefill error:', error);
    if (loading) loading.style.display = 'none';
    if (status) {
      status.textContent = 'Prefill failed';
      status.style.color = '#d73a49';
    }
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
