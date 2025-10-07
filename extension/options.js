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

async function loadForm() {
  const p = await getUserProfile();
  Object.keys(DEFAULT_USER_PROFILE).forEach(k => {
    const el = byId(k);
    if (el) el.value = p[k] || '';
  });
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

    if (status) status.textContent = 'Parsing your profile...';
    
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
      
      if (status) status.textContent = 'Prefill successful!';
      tab && tab.id && chrome.tabs.remove(tab.id);
      
      // Show success message on LinkedIn tab
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const toast = document.createElement('div');
          toast.textContent = 'Profile data extracted successfully!';
          Object.assign(toast.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '10000',
            background: '#0a66c2', color: 'white', padding: '12px 16px',
            borderRadius: '8px', fontFamily: 'sans-serif', fontSize: '14px'
          });
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        }
      });
    } else {
      if (status) status.textContent = 'Could not parse profile data';
    }
  } catch (error) {
    console.error('Prefill error:', error);
    if (status) status.textContent = 'Prefill failed';
  } finally {
    if (prefillBtn) prefillBtn.disabled = false;
  }
}

// Event listeners
byId('save').addEventListener('click', saveForm);
byId('prefill').addEventListener('click', prefillFromCurrentTab);

// Initialize the page
loadForm();
