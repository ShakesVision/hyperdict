/**
 * ManageDictionariesPanel - enable/disable, add, delete, and reset dictionaries
 * Authored by Shakeeb Ahmad
 *
 * A black-&-white overlay giving end-users safe control over the dictionary set:
 *   - a toggle per dictionary (disable = hide + free memory, fully reversible)
 *   - "Delete" for user-added (custom) dictionaries (permanent; also clears
 *     their cached files) — with a confirm, so nothing vanishes on a stray click
 *   - "Reset to defaults" to recover the original set
 *   - an add form (archive .zip URL, or explicit .ifo/.idx/.dict URLs)
 *
 * It calls back into whatever wired it (typically the engine); persistence of
 * the resulting state is the embedder's job (mountHyperDictUI uses localStorage).
 */

import type { DictionaryConfig } from '../core/types';

export interface ManageRow {
  name: string;
  label: string;
  origin: 'default' | 'custom';
  enabled: boolean;
}

export interface ManageOptions {
  list: () => ManageRow[];
  setEnabled: (name: string, enabled: boolean) => void | Promise<void>;
  /** Permanently remove a (custom) dictionary and its cached files. */
  remove: (name: string) => void | Promise<void>;
  /** Reset to the default dictionary set. */
  reset: () => void | Promise<void>;
  /** Add (register + load) a dictionary. Should reject on failure. */
  add: (config: DictionaryConfig) => Promise<void>;
  /** Called after any successful change. */
  onChange?: () => void;
}

const PREFIX = 'shk-dict-mng';
const STYLE_ID = 'shakeeb-hyperdict-manage-style';

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:none;
  align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-overlay.open{display:flex}
.${PREFIX}-card{background:#fff;color:#000;border:2px solid #000;border-radius:8px;width:540px;
  max-width:calc(100vw - 24px);max-height:88vh;overflow:auto;padding:18px}
.${PREFIX}-card h3{margin:0 0 12px;display:flex;justify-content:space-between;align-items:center;font-size:1.1em}
.${PREFIX}-x{border:1px solid #000;background:#fff;border-radius:4px;width:28px;height:28px;cursor:pointer}
.${PREFIX}-x:hover{background:#000;color:#fff}
.${PREFIX}-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eee}
.${PREFIX}-row .name{flex:1}
.${PREFIX}-badge{font-size:10px;text-transform:uppercase;letter-spacing:.04em;border:1px solid #999;
  color:#666;border-radius:3px;padding:1px 5px}
.${PREFIX}-del{border:1px solid #000;background:#fff;border-radius:4px;padding:3px 9px;cursor:pointer;font-size:12px}
.${PREFIX}-del:hover{background:#000;color:#fff}
.${PREFIX}-toggle{position:relative;width:38px;height:20px;flex:none;cursor:pointer}
.${PREFIX}-toggle input{opacity:0;width:0;height:0;position:absolute}
.${PREFIX}-track{position:absolute;inset:0;background:#ccc;border-radius:20px;transition:.2s}
.${PREFIX}-track:before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;
  border-radius:50%;transition:.2s}
.${PREFIX}-toggle input:checked + .${PREFIX}-track{background:#000}
.${PREFIX}-toggle input:checked + .${PREFIX}-track:before{transform:translateX(18px)}
.${PREFIX}-toggle input:disabled + .${PREFIX}-track{opacity:.5}
.${PREFIX}-form{margin-top:14px;display:grid;gap:8px}
.${PREFIX}-form h4{margin:6px 0 0;font-size:.95em}
.${PREFIX}-form label{font-size:12px;font-weight:600;color:#333}
.${PREFIX}-form input,.${PREFIX}-form select{width:100%;padding:8px;border:1px solid #000;border-radius:4px;font-size:14px}
.${PREFIX}-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.${PREFIX}-add{margin-top:6px;padding:10px;border:2px solid #000;background:#000;color:#fff;border-radius:5px;
  font-weight:700;cursor:pointer}
.${PREFIX}-add:hover{background:#fff;color:#000}
.${PREFIX}-add:disabled{opacity:.5;cursor:default}
.${PREFIX}-err{color:#b00;font-size:13px;min-height:16px}
.${PREFIX}-foot{display:flex;justify-content:flex-end;margin-top:14px}
.${PREFIX}-reset{border:1px solid #000;background:#fff;border-radius:5px;padding:8px 12px;cursor:pointer;font-size:13px}
.${PREFIX}-reset:hover{background:#000;color:#fff}
`;

function injectStyleOnce(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class ManageDictionariesPanel {
  private readonly opts: ManageOptions;
  private overlay!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private err!: HTMLDivElement;
  private fields: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  private addBtn!: HTMLButtonElement;

  constructor(opts: ManageOptions) {
    this.opts = opts;
    injectStyleOnce();
    this.build();
  }

  public open(): void {
    this.renderList();
    this.overlay.classList.add('open');
  }

  public close(): void {
    this.overlay.classList.remove('open');
  }

  public destroy(): void {
    this.overlay.remove();
  }

  public contains(node: EventTarget | null): boolean {
    return node instanceof Node && this.overlay.contains(node);
  }

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = `${PREFIX}-overlay`;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const card = document.createElement('div');
    card.className = `${PREFIX}-card`;
    card.innerHTML = `
      <h3>Manage dictionaries <button type="button" class="${PREFIX}-x" aria-label="Close">✕</button></h3>
      <div class="${PREFIX}-list"></div>
      <div class="${PREFIX}-foot"><button type="button" class="${PREFIX}-reset">Reset to defaults</button></div>
      <div class="${PREFIX}-form">
        <h4>Add a dictionary</h4>
        <div class="${PREFIX}-two">
          <div><label>Name (unique id)</label><input data-f="name" placeholder="MyDict" /></div>
          <div><label>Label (shown on tab)</label><input data-f="label" placeholder="My Dictionary" /></div>
        </div>
        <div><label>Archive .zip URL (optional — provides all files)</label><input data-f="archive" placeholder="https://…/MyDict.zip" /></div>
        <div><label>.ifo URL *</label><input data-f="ifo" placeholder="https://…/MyDict.ifo" /></div>
        <div><label>.idx URL *</label><input data-f="idx" placeholder="https://…/MyDict.idx" /></div>
        <div><label>.dict.dz or .dict URL *</label><input data-f="dict" placeholder="https://…/MyDict.dict.dz" /></div>
        <div><label>.syn URL (optional)</label><input data-f="syn" placeholder="https://…/MyDict.syn" /></div>
        <div class="${PREFIX}-two">
          <div><label>Language</label>
            <select data-f="lang">
              <option value="ur">Urdu</option>
              <option value="ar">Arabic</option>
              <option value="fa">Persian</option>
              <option value="en">English</option>
              <option value="">Other</option>
            </select>
          </div>
          <div><label>Direction</label>
            <select data-f="dir">
              <option value="">Auto</option>
              <option value="rtl">Right-to-left</option>
              <option value="ltr">Left-to-right</option>
            </select>
          </div>
        </div>
        <div><label>Font family (optional)</label><input data-f="font" placeholder="Noto Nastaliq Urdu" /></div>
        <div><label>Font stylesheet URL (optional)</label><input data-f="fontUrl" placeholder="https://fonts.googleapis.com/…" /></div>
        <div class="${PREFIX}-err"></div>
        <button type="button" class="${PREFIX}-add">Add dictionary</button>
      </div>`;

    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);

    card.querySelector(`.${PREFIX}-x`)!.addEventListener('click', () => this.close());
    this.listEl = card.querySelector(`.${PREFIX}-list`) as HTMLDivElement;
    this.err = card.querySelector(`.${PREFIX}-err`) as HTMLDivElement;
    card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-f]').forEach((el) => {
      this.fields[el.dataset.f as string] = el;
    });
    this.addBtn = card.querySelector(`.${PREFIX}-add`) as HTMLButtonElement;
    this.addBtn.addEventListener('click', () => void this.submit());
    (card.querySelector(`.${PREFIX}-reset`) as HTMLButtonElement).addEventListener('click', () =>
      void this.doReset()
    );
  }

  private renderList(): void {
    const rows = this.opts.list();
    this.listEl.innerHTML = '';
    if (rows.length === 0) {
      this.listEl.innerHTML = `<div style="color:#777;padding:6px 0">No dictionaries yet — add one below.</div>`;
      return;
    }
    for (const row of rows) {
      const el = document.createElement('div');
      el.className = `${PREFIX}-row`;

      // Enable/disable toggle
      const toggle = document.createElement('label');
      toggle.className = `${PREFIX}-toggle`;
      toggle.title = row.enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = row.enabled;
      const track = document.createElement('span');
      track.className = `${PREFIX}-track`;
      toggle.append(cb, track);
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        try {
          await this.opts.setEnabled(row.name, cb.checked);
          this.opts.onChange?.();
        } finally {
          this.renderList();
        }
      });

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.label || row.name;

      const badge = document.createElement('span');
      badge.className = `${PREFIX}-badge`;
      badge.textContent = row.origin;

      el.append(toggle, name, badge);

      if (row.origin === 'custom') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = `${PREFIX}-del`;
        del.textContent = 'Delete';
        del.title = 'Remove permanently and clear its cached files';
        del.addEventListener('click', async () => {
          if (!confirm(`Delete "${row.label || row.name}" permanently? This clears its cached files.`)) {
            return;
          }
          await this.opts.remove(row.name);
          this.opts.onChange?.();
          this.renderList();
        });
        el.appendChild(del);
      }

      this.listEl.appendChild(el);
    }
  }

  private async doReset(): Promise<void> {
    if (!confirm('Reset to the default dictionaries? Custom dictionaries you added will be removed.')) {
      return;
    }
    await this.opts.reset();
    this.opts.onChange?.();
    this.renderList();
  }

  private val(name: string): string {
    return (this.fields[name]?.value ?? '').trim();
  }

  private async submit(): Promise<void> {
    this.err.textContent = '';
    const name = this.val('name');
    const archive = this.val('archive');
    const ifo = this.val('ifo');
    const idx = this.val('idx');
    const dict = this.val('dict');

    if (!name) {
      this.err.textContent = 'A unique name is required.';
      return;
    }
    if (!archive && !(ifo && idx && dict)) {
      this.err.textContent = 'Provide an archive .zip URL, or all of .ifo, .idx and .dict URLs.';
      return;
    }

    const dir = this.val('dir');
    const config: DictionaryConfig = {
      name,
      label: this.val('label') || name,
      lang: this.val('lang') || undefined,
      dir: dir === 'rtl' || dir === 'ltr' ? dir : undefined,
      font: this.val('font') || undefined,
      fontUrl: this.val('fontUrl') || undefined,
      ...(archive
        ? { archive }
        : { files: { ifo, idx, dict, syn: this.val('syn') || undefined } }),
    };

    this.addBtn.disabled = true;
    this.addBtn.textContent = 'Loading…';
    try {
      await this.opts.add(config);
      ['name', 'label', 'archive', 'ifo', 'idx', 'dict', 'syn', 'font', 'fontUrl'].forEach((f) => {
        if (this.fields[f]) (this.fields[f] as HTMLInputElement).value = '';
      });
      this.renderList();
      this.opts.onChange?.();
    } catch (e) {
      this.err.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      this.addBtn.disabled = false;
      this.addBtn.textContent = 'Add dictionary';
    }
  }
}
