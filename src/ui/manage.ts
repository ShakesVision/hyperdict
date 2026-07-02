/**
 * ManageDictionariesPanel - enable/disable, reorder, add, delete, reset
 * Authored by Shakeeb Ahmad
 *
 * A black-&-white overlay giving end-users safe control over the dictionary set:
 *   - a toggle per dictionary (disable = hide + free memory, reversible)
 *   - up/down to reorder (drives tab order)
 *   - "Delete" for custom dictionaries (permanent; clears cached files; confirmed)
 *   - "Reset to defaults" to recover the original set
 *   - an add form with a Files/Archive mode switch, so only the relevant fields
 *     are shown and required (no confusing asterisks)
 */

import type { DictionaryConfig } from '../core/types';
import { icon } from './icons';

export interface ManageRow {
  name: string;
  label: string;
  origin: 'default' | 'custom';
  enabled: boolean;
}

export interface ManageOptions {
  list: () => ManageRow[];
  setEnabled: (name: string, enabled: boolean) => void | Promise<void>;
  reorder: (orderedNames: string[]) => void | Promise<void>;
  remove: (name: string) => void | Promise<void>;
  reset: () => void | Promise<void>;
  add: (config: DictionaryConfig) => Promise<void>;
  onChange?: () => void;
}

const PREFIX = 'shk-dict-mng';
const STYLE_ID = 'shakeeb-hyperdict-manage-style';

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:none;
  align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-overlay.open{display:flex}
.${PREFIX}-card{background:#fff;color:#000;border:2px solid #000;border-radius:8px;width:560px;
  max-width:calc(100vw - 24px);max-height:90vh;overflow:auto;padding:18px}
.${PREFIX}-card h3{margin:0 0 12px;display:flex;justify-content:space-between;align-items:center;font-size:1.1em}
.${PREFIX}-ico{display:inline-flex;align-items:center;justify-content:center}
.${PREFIX}-x{border:1px solid #000;background:#fff;border-radius:4px;width:28px;height:28px;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.${PREFIX}-x:hover{background:#000;color:#fff}
.${PREFIX}-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee}
.${PREFIX}-ord{display:flex;flex-direction:column}
.${PREFIX}-ord button{width:22px;height:16px;border:1px solid #999;background:#fff;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;color:#333}
.${PREFIX}-ord button:first-child{border-radius:4px 4px 0 0;border-bottom:none}
.${PREFIX}-ord button:last-child{border-radius:0 0 4px 4px}
.${PREFIX}-ord button:hover:not(:disabled){background:#000;color:#fff}
.${PREFIX}-ord button:disabled{opacity:.3;cursor:default}
.${PREFIX}-name{flex:1}
.${PREFIX}-badge{font-size:10px;text-transform:uppercase;letter-spacing:.04em;border:1px solid #999;
  color:#666;border-radius:3px;padding:1px 5px}
.${PREFIX}-del{border:1px solid #000;background:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;
  display:flex;align-items:center;gap:4px;font-size:12px}
.${PREFIX}-del:hover{background:#000;color:#fff}
.${PREFIX}-toggle{position:relative;width:38px;height:20px;flex:none;cursor:pointer}
.${PREFIX}-toggle input{opacity:0;width:0;height:0;position:absolute}
.${PREFIX}-track{position:absolute;inset:0;background:#ccc;border-radius:20px;transition:.2s}
.${PREFIX}-track:before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.2s}
.${PREFIX}-toggle input:checked + .${PREFIX}-track{background:#000}
.${PREFIX}-toggle input:checked + .${PREFIX}-track:before{transform:translateX(18px)}
.${PREFIX}-toggle input:disabled + .${PREFIX}-track{opacity:.5}
.${PREFIX}-form{margin-top:14px;display:grid;gap:8px}
.${PREFIX}-form h4{margin:6px 0 0;font-size:.95em}
.${PREFIX}-form label{font-size:12px;font-weight:600;color:#333}
.${PREFIX}-form input,.${PREFIX}-form select{width:100%;padding:8px;border:1px solid #000;border-radius:4px;font-size:14px}
.${PREFIX}-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.${PREFIX}-seg{display:flex;border:1px solid #000;border-radius:5px;overflow:hidden;margin-top:2px}
.${PREFIX}-seg button{flex:1;padding:8px;background:#fff;border:none;border-right:1px solid #000;cursor:pointer;font-size:13px;font-weight:600}
.${PREFIX}-seg button:last-child{border-right:none}
.${PREFIX}-seg button.on{background:#000;color:#fff}
.${PREFIX}-hint{font-size:12px;color:#666}
.${PREFIX}-hidden{display:none}
.${PREFIX}-add{margin-top:6px;padding:10px;border:2px solid #000;background:#000;color:#fff;border-radius:5px;font-weight:700;cursor:pointer}
.${PREFIX}-add:hover{background:#fff;color:#000}
.${PREFIX}-add:disabled{opacity:.5;cursor:default}
.${PREFIX}-err{color:#b00;font-size:13px;min-height:16px}
.${PREFIX}-foot{display:flex;justify-content:flex-end;margin-top:14px}
.${PREFIX}-reset{border:1px solid #000;background:#fff;border-radius:5px;padding:8px 12px;cursor:pointer;
  font-size:13px;display:flex;align-items:center;gap:6px}
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
  private mode: 'files' | 'archive' = 'files';
  private filesGrp!: HTMLDivElement;
  private archiveGrp!: HTMLDivElement;

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
      <h3>Manage dictionaries <button type="button" class="${PREFIX}-x" aria-label="Close">${icon('close')}</button></h3>
      <div class="${PREFIX}-list"></div>
      <div class="${PREFIX}-foot"><button type="button" class="${PREFIX}-reset">${icon('reset')} Reset to defaults</button></div>
      <div class="${PREFIX}-form">
        <h4>Add a dictionary</h4>
        <div class="${PREFIX}-two">
          <div><label>Name (unique id)</label><input data-f="name" placeholder="MyDict" /></div>
          <div><label>Label (tab title)</label><input data-f="label" placeholder="My Dictionary" /></div>
        </div>
        <div class="${PREFIX}-seg" data-seg>
          <button type="button" data-mode="files" class="on">Individual files</button>
          <button type="button" data-mode="archive">Archive</button>
        </div>
        <div class="${PREFIX}-grp-files">
          <div class="${PREFIX}-hint">Needs .ifo, .idx and .dict.dz (or .dict). .syn is optional.</div>
          <div><label>.ifo URL</label><input data-f="ifo" placeholder="https://…/MyDict.ifo" /></div>
          <div><label>.idx URL</label><input data-f="idx" placeholder="https://…/MyDict.idx" /></div>
          <div><label>.dict.dz or .dict URL</label><input data-f="dict" placeholder="https://…/MyDict.dict.dz" /></div>
          <div><label>.syn URL (optional)</label><input data-f="syn" placeholder="https://…/MyDict.syn" /></div>
        </div>
        <div class="${PREFIX}-grp-archive ${PREFIX}-hidden">
          <div class="${PREFIX}-hint">One archive containing all files. Supported: .zip, .tar, .tar.gz</div>
          <div><label>Archive URL</label><input data-f="archive" placeholder="https://…/MyDict.zip" /></div>
        </div>
        <div class="${PREFIX}-two">
          <div><label>Language</label>
            <select data-f="lang">
              <option value="ur">Urdu</option><option value="ar">Arabic</option>
              <option value="fa">Persian</option><option value="en">English</option><option value="">Other</option>
            </select>
          </div>
          <div><label>Direction</label>
            <select data-f="dir">
              <option value="">Auto</option><option value="rtl">Right-to-left</option><option value="ltr">Left-to-right</option>
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
    this.filesGrp = card.querySelector(`.${PREFIX}-grp-files`) as HTMLDivElement;
    this.archiveGrp = card.querySelector(`.${PREFIX}-grp-archive`) as HTMLDivElement;
    card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-f]').forEach((el) => {
      this.fields[el.dataset.f as string] = el;
    });
    card.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => this.setMode(b.dataset.mode as 'files' | 'archive'));
    });
    this.addBtn = card.querySelector(`.${PREFIX}-add`) as HTMLButtonElement;
    this.addBtn.addEventListener('click', () => void this.submit());
    (card.querySelector(`.${PREFIX}-reset`) as HTMLButtonElement).addEventListener('click', () =>
      void this.doReset()
    );
  }

  private setMode(mode: 'files' | 'archive'): void {
    this.mode = mode;
    this.filesGrp.classList.toggle(`${PREFIX}-hidden`, mode !== 'files');
    this.archiveGrp.classList.toggle(`${PREFIX}-hidden`, mode !== 'archive');
    this.overlay
      .querySelectorAll<HTMLButtonElement>('[data-mode]')
      .forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  }

  private renderList(): void {
    const rows = this.opts.list();
    this.listEl.innerHTML = '';
    if (rows.length === 0) {
      this.listEl.innerHTML = `<div style="color:#777;padding:6px 0">No dictionaries yet — add one below.</div>`;
      return;
    }
    rows.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = `${PREFIX}-row`;

      // Reorder controls
      const ord = document.createElement('div');
      ord.className = `${PREFIX}-ord`;
      const up = this.miniBtn('up', 'Move up', i === 0, () => this.move(rows, i, -1));
      const down = this.miniBtn('down', 'Move down', i === rows.length - 1, () => this.move(rows, i, 1));
      ord.append(up, down);

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
      name.className = `${PREFIX}-name`;
      name.textContent = row.label || row.name;

      const badge = document.createElement('span');
      badge.className = `${PREFIX}-badge`;
      badge.textContent = row.origin;

      el.append(ord, toggle, name, badge);

      if (row.origin === 'custom') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = `${PREFIX}-del`;
        del.innerHTML = `${icon('trash')}<span>Delete</span>`;
        del.title = 'Remove permanently and clear its cached files';
        del.addEventListener('click', async () => {
          if (!confirm(`Delete "${row.label || row.name}" permanently? This clears its cached files.`)) return;
          await this.opts.remove(row.name);
          this.opts.onChange?.();
          this.renderList();
        });
        el.appendChild(del);
      }

      this.listEl.appendChild(el);
    });
  }

  private miniBtn(
    ic: 'up' | 'down',
    title: string,
    disabled: boolean,
    onClick: () => void
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon(ic, 12);
    b.title = title;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  private async move(rows: ManageRow[], i: number, delta: number): Promise<void> {
    const names = rows.map((r) => r.name);
    const j = i + delta;
    if (j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    await this.opts.reorder(names);
    this.opts.onChange?.();
    this.renderList();
  }

  private async doReset(): Promise<void> {
    if (!confirm('Reset to the default dictionaries? Custom dictionaries you added will be removed.')) return;
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
    if (!name) {
      this.err.textContent = 'A unique name is required.';
      return;
    }

    let source: Partial<DictionaryConfig>;
    if (this.mode === 'archive') {
      const archive = this.val('archive');
      if (!archive) {
        this.err.textContent = 'Enter the archive URL (.zip, .tar or .tar.gz).';
        return;
      }
      source = { archive };
    } else {
      const ifo = this.val('ifo');
      const idx = this.val('idx');
      const dict = this.val('dict');
      if (!ifo || !idx || !dict) {
        this.err.textContent = 'Enter the .ifo, .idx and .dict URLs (or switch to Archive).';
        return;
      }
      source = { files: { ifo, idx, dict, syn: this.val('syn') || undefined } };
    }

    const dir = this.val('dir');
    const config: DictionaryConfig = {
      name,
      label: this.val('label') || name,
      lang: this.val('lang') || undefined,
      dir: dir === 'rtl' || dir === 'ltr' ? dir : undefined,
      font: this.val('font') || undefined,
      fontUrl: this.val('fontUrl') || undefined,
      ...source,
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
