/**
 * HyperDict extension — options page
 * Authored by Shakeeb Ahmad
 */
const $ = (id) => document.getElementById(id);
const ARCHIVE_RE = /\.(zip|tar|tgz|tar\.gz|gz)(\?|$)/i;

function dictRow(d) {
  const src = d.archive || d.path || (d.files && d.files.dict) || '';
  const el = document.createElement('div');
  el.className = 'dict';
  el.innerHTML = `
    <div class="dhead">
      <label class="check"><input type="checkbox" class="d-enabled" ${d.enabled !== false ? 'checked' : ''} /> on</label>
      <span class="name"></span>
      <button type="button" class="rm">Remove</button>
    </div>
    <div class="two3">
      <input type="text" class="d-name" placeholder="Name (unique id)" />
      <input type="text" class="d-label" placeholder="Label (tab title)" />
      <select class="d-lang">
        <option value="ur">Urdu</option><option value="ar">Arabic</option>
        <option value="fa">Persian</option><option value="en">English</option><option value="">Other</option>
      </select>
    </div>
    <div class="field"><input type="text" class="d-src" placeholder="Folder URL or archive URL" /></div>
    <div class="two">
      <select class="d-dir"><option value="">Auto direction</option><option value="rtl">RTL</option><option value="ltr">LTR</option></select>
      <input type="text" class="d-font" placeholder="Font family (optional, e.g. Noto Nastaliq Urdu)" />
    </div>`;
  el.querySelector('.d-name').value = d.name || '';
  el.querySelector('.d-label').value = d.label || '';
  el.querySelector('.d-src').value = src;
  el.querySelector('.d-lang').value = d.lang || '';
  el.querySelector('.d-dir').value = d.dir || '';
  el.querySelector('.d-font').value = d.font || '';
  const nameEl = el.querySelector('.name');
  const sync = () => (nameEl.textContent = el.querySelector('.d-name').value || '(unnamed)');
  el.querySelector('.d-name').addEventListener('input', sync);
  sync();
  el.querySelector('.rm').addEventListener('click', () => el.remove());
  return el;
}

function render(settings) {
  $('enabled').checked = settings.enabled;
  $('dir').value = settings.dir;
  $('placeholder').value = settings.placeholder;
  $('chipLabel').value = settings.chipLabel;
  $('attribution').checked = settings.attribution;
  $('selection').checked = settings.selection;
  $('longPress').checked = settings.longPress;
  const box = $('dicts');
  box.innerHTML = '';
  settings.dictionaries.forEach((d) => box.appendChild(dictRow(d)));
}

function collect() {
  const dictionaries = [];
  for (const el of document.querySelectorAll('.dict')) {
    const name = el.querySelector('.d-name').value.trim();
    const src = el.querySelector('.d-src').value.trim();
    if (!name || !src) continue;
    const d = {
      name,
      label: el.querySelector('.d-label').value.trim() || name,
      lang: el.querySelector('.d-lang').value || undefined,
      dir: el.querySelector('.d-dir').value || undefined,
      font: el.querySelector('.d-font').value.trim() || undefined,
      enabled: el.querySelector('.d-enabled').checked,
    };
    if (ARCHIVE_RE.test(src)) d.archive = src;
    else d.path = src;
    dictionaries.push(d);
  }
  return {
    enabled: $('enabled').checked,
    dir: $('dir').value,
    placeholder: $('placeholder').value,
    chipLabel: $('chipLabel').value,
    attribution: $('attribution').checked,
    selection: $('selection').checked,
    longPress: $('longPress').checked,
    dictionaries,
  };
}

chrome.storage.sync.get(null, (data) => render(HyperDictSettings.withDefaults(data || {})));

$('addDict').addEventListener('click', () => $('dicts').appendChild(dictRow({ enabled: true })));

$('save').addEventListener('click', () => {
  const merged = collect();
  chrome.storage.sync.set(merged, () => {
    $('status').textContent = '✓ Saved';
    setTimeout(() => ($('status').textContent = ''), 1500);
  });
});

$('reset').addEventListener('click', () => {
  if (!confirm('Reset all settings and dictionaries to defaults?')) return;
  const defaults = HyperDictSettings.DEFAULTS;
  chrome.storage.sync.set(defaults, () => render(HyperDictSettings.withDefaults({})));
});
