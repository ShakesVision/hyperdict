/**
 * ManageDictionariesPanel - add/remove dictionaries at runtime
 * Authored by Shakeeb Ahmad
 *
 * A small black-&-white overlay letting a (possibly non-technical) end-user add
 * a dictionary by pasting the three required file URLs (.ifo, .idx, .dict.dz)
 * plus an optional .syn, and choosing a name, language and text direction; and
 * remove existing ones. It calls back into whatever wired it (typically the
 * engine's addDictionary/removeDictionary), then fires onChange so the popup can
 * refresh its tabs. Where the resulting config is persisted is the embedder's
 * choice (mountHyperDictUI defaults to localStorage).
 */

import type { DictionaryConfig } from '../core/types';

export interface ManageOptions {
  /** Current dictionaries (name + display label). */
  list: () => Array<{ name: string; label: string }>;
  /** Add (register + load) a dictionary. Should reject on failure. */
  add: (config: DictionaryConfig) => Promise<void>;
  /** Remove a dictionary by name. */
  remove: (name: string) => void | Promise<void>;
  /** Called after any successful add/remove. */
  onChange?: () => void;
}

const PREFIX = 'shk-dict-mng';
const STYLE_ID = 'shakeeb-hyperdict-manage-style';

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:none;
  align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-overlay.open{display:flex}
.${PREFIX}-card{background:#fff;color:#000;border:2px solid #000;border-radius:8px;width:520px;
  max-width:calc(100vw - 24px);max-height:88vh;overflow:auto;padding:18px}
.${PREFIX}-card h3{margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}
.${PREFIX}-x{border:1px solid #000;background:#fff;border-radius:4px;width:28px;height:28px;cursor:pointer}
.${PREFIX}-x:hover{background:#000;color:#fff}
.${PREFIX}-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eee}
.${PREFIX}-del{border:1px solid #000;background:#fff;border-radius:4px;padding:4px 10px;cursor:pointer}
.${PREFIX}-del:hover{background:#000;color:#fff}
.${PREFIX}-form{margin-top:14px;display:grid;gap:8px}
.${PREFIX}-form label{font-size:12px;font-weight:600;color:#333}
.${PREFIX}-form input,.${PREFIX}-form select{width:100%;padding:8px;border:1px solid #000;border-radius:4px;font-size:14px}
.${PREFIX}-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.${PREFIX}-add{margin-top:6px;padding:10px;border:2px solid #000;background:#000;color:#fff;border-radius:5px;
  font-weight:700;cursor:pointer}
.${PREFIX}-add:hover{background:#fff;color:#000}
.${PREFIX}-add:disabled{opacity:.5;cursor:default}
.${PREFIX}-err{color:#b00;font-size:13px;min-height:16px}
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
      <div class="${PREFIX}-form">
        <div class="${PREFIX}-two">
          <div><label>Name (unique id)</label><input data-f="name" placeholder="MyDict" /></div>
          <div><label>Label (shown on tab)</label><input data-f="label" placeholder="My Dictionary" /></div>
        </div>
        <div><label>.ifo URL *</label><input data-f="ifo" placeholder="https://…/MyDict.ifo" /></div>
        <div><label>.idx URL *</label><input data-f="idx" placeholder="https://…/MyDict.idx" /></div>
        <div><label>.dict.dz URL *</label><input data-f="dict" placeholder="https://…/MyDict.dict.dz" /></div>
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
  }

  private renderList(): void {
    const dicts = this.opts.list();
    this.listEl.innerHTML = '';
    if (dicts.length === 0) {
      this.listEl.innerHTML = `<div style="color:#777;padding:6px 0">No dictionaries yet — add one below.</div>`;
      return;
    }
    for (const d of dicts) {
      const row = document.createElement('div');
      row.className = `${PREFIX}-row`;
      const label = document.createElement('span');
      label.textContent = d.label || d.name;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = `${PREFIX}-del`;
      del.textContent = 'Remove';
      del.addEventListener('click', async () => {
        await this.opts.remove(d.name);
        this.renderList();
        this.opts.onChange?.();
      });
      row.append(label, del);
      this.listEl.appendChild(row);
    }
  }

  private val(name: string): string {
    return (this.fields[name]?.value ?? '').trim();
  }

  private async submit(): Promise<void> {
    this.err.textContent = '';
    const name = this.val('name');
    const ifo = this.val('ifo');
    const idx = this.val('idx');
    const dict = this.val('dict');
    if (!name || !ifo || !idx || !dict) {
      this.err.textContent = 'Name, .ifo, .idx and .dict.dz URLs are required.';
      return;
    }

    const dir = this.val('dir');
    const config: DictionaryConfig = {
      name,
      label: this.val('label') || name,
      files: { ifo, idx, dict, syn: this.val('syn') || undefined },
      lang: this.val('lang') || undefined,
      dir: dir === 'rtl' || dir === 'ltr' ? dir : undefined,
      font: this.val('font') || undefined,
      fontUrl: this.val('fontUrl') || undefined,
    };

    this.addBtn.disabled = true;
    this.addBtn.textContent = 'Loading…';
    try {
      await this.opts.add(config);
      // Reset the URL/name fields on success.
      ['name', 'label', 'ifo', 'idx', 'dict', 'syn', 'font', 'fontUrl'].forEach((f) => {
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
