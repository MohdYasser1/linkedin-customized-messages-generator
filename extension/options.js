// options.js

const DEFAULT_USER_PROFILE = {
  myName: '',
  myTitle: '',
  myCompany: '',
  aboutMe: '',
  interests: '',
  goals: '',
  strengths: '',
  tone: 'professional',
  callToAction: 'Would you be open to a quick chat next week?',
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
  if (status) { status.textContent = 'Saved'; setTimeout(() => status.textContent = '', 1200); }
}

async function prefillFromCurrentTab() {
  const status = byId('status');
  const prefillBtn = byId('prefill');
  if (prefillBtn) prefillBtn.disabled = true;
  if (status) status.textContent = 'Opening your profile...';
  const openMyProfile = async () => {
    const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/' });
    // wait for complete
    await new Promise((resolve) => {
      const start = Date.now();
      const timeout = 25000;
      const onUpdated = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      const interval = setInterval(async () => {
        if (Date.now() - start > timeout) {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          clearInterval(interval);
          resolve(false);
        }
        try {
          const t = await chrome.tabs.get(tab.id);
          if (t.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearInterval(interval);
            resolve(true);
          }
        } catch {}
      }, 300);
    });
    return tab;
  };

  const sendParse = (tabId) => new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PARSE_PROFILE_REQUEST' }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, error: 'no-response' });
      }
    });
  });

  const ensureContent = async (tabId) => {
    let resp = await sendParse(tabId);
    if (!resp.ok && /Receiving end does not exist/i.test(String(resp.error || ''))) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 300));
      resp = await sendParse(tabId);
    }
    return resp;
  };

  const showToastInTab = async (tabId, message) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => {
          try {
            const id = '__ln_prefill_toast';
            let toast = document.getElementById(id);
            if (!toast) {
              toast = document.createElement('div');
              toast.id = id;
              document.body.appendChild(toast);
            }
            toast.textContent = msg || 'Done';
            Object.assign(toast.style, {
              position: 'fixed',
              top: '16px',
              right: '16px',
              zIndex: 2147483647,
              background: '#0a66c2',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              fontFamily: 'Segoe UI, Arial, sans-serif',
              fontSize: '14px',
              opacity: '1',
              transition: 'opacity 0.4s ease'
            });
            setTimeout(() => { toast.style.opacity = '0'; }, 2200);
            setTimeout(() => { toast.remove(); }, 2600);
          } catch {}
        },
        args: [message]
      });
    } catch {}
  };

  try {
    const tab = await openMyProfile();
    if (!tab?.id) {
      if (status) status.textContent = 'Could not open your profile';
      return;
    }
    if (status) status.textContent = 'Parsing your profile...';
    const resp = await ensureContent(tab.id);
    if (resp?.ok && resp?.schema) {
      const current = await getUserProfile();
      const s = resp.schema;
      const deriveLatestCompany = (expArr) => {
        try {
          if (!Array.isArray(expArr)) return '';
          const firstWithCompany = expArr.find(e => e && typeof e.company === 'string' && e.company.trim().length > 0);
          return firstWithCompany ? firstWithCompany.company.trim() : '';
        } catch { return ''; }
      };
      const deriveLatestTitle = (expArr) => {
        try {
          if (!Array.isArray(expArr)) return '';
          const firstWithTitle = expArr.find(e => e && typeof e.title === 'string' && e.title.trim().length > 0);
          return firstWithTitle ? firstWithTitle.title.trim() : '';
        } catch { return ''; }
      };
      const latestCompany = deriveLatestCompany(s.experience);
      const latestTitle = deriveLatestTitle(s.experience);
      const next = {
        ...current,
        myName: current.myName || (s.name || ''),
        myTitle: current.myTitle || s.headline || (s.headline || ''),
        aboutMe: current.aboutMe || (s.about || ''),
        myCompany: current.myCompany || latestCompany || ''
      };
      await setUserProfile(next);
      await loadForm();
      if (status) status.textContent = 'Prefill successful!';
      // Show success toast on the LinkedIn tab that was opened
      await showToastInTab(tab.id, 'Prefill successful! You can return to the Options page.');
    } else {
      if (status) status.textContent = 'Could not parse your profile';
    }
  } catch (e) {
    if (status) status.textContent = 'Prefill failed';
  }
  finally {
    if (prefillBtn) prefillBtn.disabled = false;
  }
}

byId('save').addEventListener('click', saveForm);
byId('prefill').addEventListener('click', prefillFromCurrentTab);
loadForm();
