/**
 * HyperDict extension — toolbar popup
 * Authored by Shakeeb Ahmad
 */
const $ = (id) => document.getElementById(id);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

(async function init() {
  const tab = await activeTab();
  const host = hostOf(tab && tab.url);
  $('host').textContent = host || 'this site';

  chrome.storage.sync.get(null, (data) => {
    const s = HyperDictSettings.withDefaults(data || {});
    $('site').checked = s.enabled && !(s.disabledSites || []).includes(host);
    $('site').disabled = !host;
  });

  $('site').addEventListener('change', () => {
    chrome.storage.sync.get(null, (data) => {
      const s = HyperDictSettings.withDefaults(data || {});
      const ds = new Set(s.disabledSites || []);
      if ($('site').checked) ds.delete(host);
      else ds.add(host);
      chrome.storage.sync.set({ enabled: true, disabledSites: [...ds] });
    });
  });

  $('open').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'open' });
      window.close();
    } catch {
      // Content script not present on this page (e.g. chrome:// or the Web Store).
      $('open').textContent = 'Not available on this page';
    }
  });

  $('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());
})();
