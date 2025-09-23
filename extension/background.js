// background.js
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

async function sendToBackend(profile) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured');

  // Replace with your backend endpoint
  const endpoint = 'https://your-backend.example.com/parse';

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
  console.log("Response data:", await res.json());
  return await res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PARSED_PROFILE') {
    const profile = message.payload;
    // call backend, respond asynchronously
    sendToBackend(profile).then(resp => {
      sendResponse({ ok: true, result: resp });
    }).catch(err => {
      console.error(err);
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

// Open options when clicking toolbar icon
chrome.action?.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

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
