// content.js
(async function () {
  // --- UTILITIES ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // load selectors.json (packaged in extension)
  async function loadSelectors() {
    try {
      console.log("Loading selectors.json");
      console.log("Fetching:", chrome.runtime.getURL("selectors.json"));
      const res = await fetch(chrome.runtime.getURL("selectors.json"));
      return await res.json();
    } catch (e) {
      console.error("Failed to load selectors.json", e);
      return null;
    }
  }

  // Document-level first match for any of the selectors (in order)
  function firstInDocument(selectors) {
    if (!selectors) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  function getTextFrom(el) {
    if (!el) return null;
    const text = el.innerText || el.textContent || "";
    return text.trim().replace(/\s{2,}/g, " ");
  }

  // Collect all matches for all selectors (union), preserving order and uniqueness
  function getAll(container, selectors) {
    if (!container || !selectors) return [];
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const out = [];
    const seen = new Set();
    for (const sel of list) {
      try {
        const nodes = container.querySelectorAll(sel);
        for (const n of nodes) {
          if (!seen.has(n)) {
            seen.add(n);
            out.push(n);
          }
        }
      } catch {}
    }
    return out;
  }
  
  // Text/query helpers
  function first(root, selectors) {
    if (!root || !selectors) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch {}
    }
    return null;
  }
  function text(root, selectors, opts = {}) {
    const { excludeWithin } = opts;
    if (!root || !selectors) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const excludes = Array.isArray(excludeWithin) ? excludeWithin : (excludeWithin ? [excludeWithin] : []);
    for (const sel of list) {
      try {
        const nodes = root.querySelectorAll(sel);
        for (const el of nodes) {
          const insideAny = excludes.some(ex => ex && ex.contains(el));
          if (!insideAny) {
            const t = getTextFrom(el);
            if (t) return t;
          }
        }
      } catch {}
    }
    return null;
  }
  function all(root, selectors, opts = {}) {
    const { excludeWithin } = opts;
    const nodes = getAll(root, selectors);
    if (!excludeWithin) return nodes;
    const excludes = Array.isArray(excludeWithin) ? excludeWithin : [excludeWithin];
    return nodes.filter(n => !excludes.some(ex => ex && ex.contains(n)));
  }

  // Resolve a section container using an inner "anchor" selector or id
  function resolveAnchorSection(anchor) {
    if (!anchor) return null;
    let selector = null;
    if (typeof anchor === 'string') {
      selector = anchor; // e.g., 'div#experience'
    } else if (typeof anchor === 'object') {
      if (anchor.selector) selector = anchor.selector;
      else if (anchor.id) selector = `div#${anchor.id}`;
    }
    if (!selector) return null;

    const el = document.querySelector(selector);
    if (el) {
      const sec = el.closest('section');
      if (sec) return sec;
    }
    // Try :has() as a last resort (Chromium supports)
    try {
      const secHas = document.querySelector(`section:has(${selector})`);
      if (secHas) return secHas;
    } catch {}
    return null;
  }

  // Robust extraction with candidate selectors
  function extractField(selectorsObj, fieldName) {
    const candidates = selectorsObj[fieldName];
    if (!candidates) return null;
    const el = firstInDocument(candidates);
    return getTextFrom(el);
  }

  // Parse experience with structural detection (single vs multi-role)
  function parseExperience(expCfg = {}) {
    const kind = 'experience';
    let container = resolveAnchorSection(expCfg.anchor);
    if (!container) container = firstInDocument(expCfg.container || []);
    if (!container) return [];

    if (expCfg.anchor) {
      const txt = getTextFrom(container);
    }

    const topListSel = expCfg.topList || (expCfg.group && expCfg.group.roleList);
    const roleListSel = expCfg.group && expCfg.group.roleList;
    const roleItemSels = (expCfg.group && expCfg.group.roleItems) || [];
    const singleFields = expCfg.fields || {};
    const roleFields = expCfg.roleFields || singleFields;
    const groupCompanySel = (expCfg.group && expCfg.group.company) || [];

    let items = getAll(container, expCfg.items || []);
    // Choose the top list from config, preferring those not within any role list
    let topList = null;
    if (topListSel) {
      const allTopCandidates = Array.from(container.querySelectorAll(topListSel));
      const roleLists = roleListSel ? Array.from(container.querySelectorAll(roleListSel)) : [];
      const preferred = allTopCandidates.filter(listEl => !roleLists.some(rl => rl.contains(listEl)));
      topList = preferred[0] || allTopCandidates[0] || null;
      // If none found, but the container itself matches the top list criteria and isn't a role list, use it
      try {
        if (!topList && container.matches && container.matches(topListSel)) {
          const insideRole = roleListSel ? !!container.closest(roleListSel) : false;
          if (!insideRole) topList = container;
        }
      } catch {}
    }
    if (topList && topListSel) {
      items = items.filter(n => n.closest(topListSel) === topList);
    }
    // Exclude items that are within any role list (from config)
    if (roleListSel) {
      const roleLists = Array.from(container.querySelectorAll(roleListSel));
      items = items.filter(n => !roleLists.some(rl => rl.contains(n)));
    }

    const results = [];
    for (const node of items) {
      // Structural detection using configured selectors only
      const rolesList = roleListSel ? first(node, roleListSel) : null;
      const roleItems = rolesList ? Array.from(rolesList.children) : [];
      // A block is only multi-role if its nested list CONTAINS items that are themselves roles.
      // We check the first item in the list to see if it has a title.
      let firstItemIsARole = false;
      if (rolesList && roleItems.length > 0) {
        // Check if the first child li has an element matching the title selector
        const firstItemTitle = text(roleItems[0], roleFields.title);
        if (firstItemTitle) {
          firstItemIsARole = true;
        }
      }

      // The condition is now much more robust.
      if (firstItemIsARole) {
        // Multiple-role experience: company/dates at top-level, roles inside rolesList
        const company = text(node, groupCompanySel, { excludeWithin: rolesList }) || text(node, singleFields.company, { excludeWithin: rolesList });
        let idx = 0;
        for (const role of roleItems) {
          idx++;
          const title = text(role, roleFields.title);
          const date = text(role, roleFields.date);
          const description = text(role, roleFields.description);
          const raw = getTextFrom(role);
          const rec = { raw, title, company, date, description };
          results.push(rec);
        }
      } else {
        // Single-role experience: all primary details at top level
        const title = text(node, singleFields.title);
        const company = text(node, singleFields.company);
        const date = text(node, singleFields.date);
        const description = text(node, singleFields.description);
        const raw = getTextFrom(node);
        const rec = { raw, title, company, date, description };
        results.push(rec);
      }
    }

    // cap to avoid runaway size
    return results.slice(0, 20);
  }

  // Parse education using selectors.json only (flat list; no groups)
  function parseEducation(edCfg = {}) {
    const kind = 'education';
    let container = resolveAnchorSection(edCfg.anchor);
    if (!container) container = firstInDocument(edCfg.container || []);
    if (!container) return [];

    if (edCfg.anchor) {
      const txt = getTextFrom(container);
    }

    const topListSel = edCfg.topList;
    let items = getAll(container, edCfg.items || []);
    // Choose top list if provided
    let topList = null;
    if (topListSel) {
      const candidates = Array.from(container.querySelectorAll(topListSel));
      topList = candidates[0] || null;
      try {
        if (!topList && container.matches && container.matches(topListSel)) {
          topList = container;
        }
      } catch {}
    }
    if (topList && topListSel) {
      items = items.filter(n => n.closest(topListSel) === topList);
    }

    const fields = edCfg.fields || {};
    const results = items.map((node, idx) => {
    const school = text(node, fields.school);
    const degree = text(node, fields.degree);
    const date = text(node, fields.date);
    const description = text(node, fields.description);
      const raw = getTextFrom(node);
      const rec = { raw, school, degree, date, description };
      return rec;
    });

    return results.slice(0, 20);
  }

  // --- UI: inject a button into page ---
  function injectButton() {
    if (document.getElementById('__ln-parser-btn')) return;
    const btn = document.createElement('button');
    btn.id = '__ln-parser-btn';
    btn.textContent = 'Generate Message';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '16px',
      bottom: '80px',
      zIndex: 99999,
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      background: '#0a66c2',
      color: 'white',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px'
    });
    document.body.appendChild(btn);
    btn.addEventListener('click', onGenerateClick);

    // Inject a small settings button to open Options page
    if (!document.getElementById('__ln-parser-settings')) {
      const gear = document.createElement('button');
      gear.id = '__ln-parser-settings';
      gear.title = 'Edit my profile (Options)';
      gear.textContent = '⚙️';
      Object.assign(gear.style, {
        position: 'fixed',
        right: '16px',
        bottom: '44px',
        zIndex: 99999,
        width: '40px',
        height: '32px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        background: '#ffffff',
        color: '#0a66c2',
        border: '1px solid #c7c7c7',
        cursor: 'pointer',
        fontSize: '16px',
        lineHeight: '16px'
      });
      document.body.appendChild(gear);
      gear.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      });
    }
  }

  // --- main generate handler ---
  async function onGenerateClick(ev) {
    // Check if button still exists
    if (!ev.currentTarget) {
      console.warn('Button element no longer exists');
      return;
    }

    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'Generating...';

    // small wait to let dynamic elements load
    await sleep(400);

    // Extract the main HTML element from the LinkedIn profile
    const mainElement = document.querySelector('main');
    if (!mainElement) {
      alert('Could not find main profile content');
      if (ev.currentTarget) {
        ev.currentTarget.disabled = false;
        ev.currentTarget.textContent = 'Generate Message';
      }
      return;
    }

    const htmlContent = mainElement.outerHTML;
    const url = window.location.href;
    const timestamp = new Date().toISOString();

    const payload = {
      htmlContent,
      url,
      timestamp,
      type: 'TARGET_PROFILE' // Indicate this is a target profile for message generation
    };

    console.log('Sending target profile HTML to server for message generation');

    // Set a fallback timeout to reset button in case callback doesn't work
    const resetButtonTimeout = setTimeout(() => {
      if (ev.currentTarget) {
        ev.currentTarget.disabled = false;
        ev.currentTarget.textContent = 'Generate Message';
        console.log('Button reset by timeout fallback');
      }
    }, 10000); // 10 second fallback

    // send to background worker for AI processing
    chrome.runtime.sendMessage({ type: 'GENERATE_MESSAGE', payload }, (resp) => {
      // Clear the fallback timeout since we got a response
      clearTimeout(resetButtonTimeout);
      
      if (chrome.runtime.lastError) {
        console.error('Message failed', chrome.runtime.lastError);
        alert('Failed to send data to extension backend.');
        // Check if button still exists before trying to modify it
        if (ev.currentTarget) {
          ev.currentTarget.disabled = false;
          ev.currentTarget.textContent = 'Generate Message';
        }
      } else {
        console.log('Message generation response:', resp);
        // Reset button immediately since popup will open automatically
        if (ev.currentTarget) {
          ev.currentTarget.disabled = false;
          ev.currentTarget.textContent = 'Generate Message';
        }
      }
    });
  }

  // inject button on load & on route changes (LinkedIn is SPA)
  function observeForProfile() {
    injectButton();
    // LinkedIn uses SPA navigation: observe body for attribute changes
    const observer = new MutationObserver(() => {
      // re-inject if button missing after navigation
      injectButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // start
  observeForProfile();

  // Function to parse user's own profile and send to AI server
  async function parseUserProfile() {
    console.log('Parsing user profile for AI processing...');
    
    // small wait to let dynamic elements load
    await sleep(400);

    // Extract the main HTML element from the user's LinkedIn profile
    const mainElement = document.querySelector('main');
    if (!mainElement) {
      console.error('Could not find main profile content');
      return { ok: false, error: 'no-main-element' };
    }

    const htmlContent = mainElement.outerHTML;
    const url = window.location.href;
    const timestamp = new Date().toISOString();

    const payload = {
      htmlContent,
      url,
      timestamp,
      type: 'USER_PROFILE' // Indicate this is the user's own profile
    };

    console.log('Sending user profile HTML to server for AI parsing');

    // Send to background worker for AI processing
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GENERATE_MESSAGE', payload }, (resp) => {
        if (chrome.runtime.lastError) {
          console.error('Message failed', chrome.runtime.lastError);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    });
  }

  // Show notification on page
  function showPageNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: ${isError ? '#dc3545' : '#0a66c2'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      cursor: pointer;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
    
    // Click to dismiss
    notification.addEventListener('click', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  }

  // Allow Options page to request parsing for prefill
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'PARSE_PROFILE_REQUEST') {
      (async () => {
        const result = await parseUserProfile();
        sendResponse(result);
      })();
      return true; // async response
    }
    
    if (msg?.type === 'SHOW_SUCCESS_NOTIFICATION') {
      showPageNotification(msg.message, false);
    }
    
    if (msg?.type === 'SHOW_ERROR_NOTIFICATION') {
      showPageNotification(msg.message, true);
    }
  });

})();
