/**
 * ShakeebDictPopup - reusable, dependency-free dictionary popup
 * Authored by Shakeeb Ahmad
 *
 * A black-&-white floating popup with: a close button (top-left), dictionary
 * tabs (top-right), a search input (pre-filled with the looked-up word, RTL
 * aware), and a definition panel that renders HTML or plain text depending on
 * the StarDict content type. It injects its own scoped CSS once, so embedding
 * is a single `new ShakeebDictPopup(...)` with no external stylesheet.
 */

import type { DefinitionResult } from '../core/types';

export interface PopupTab {
  /** Dictionary name as registered in the engine. */
  name: string;
  /** Human-readable label shown on the tab. */
  label: string;
}

export interface PopupCallbacks {
  /** Fast, synchronous "which dictionaries contain this word". */
  lookup: (word: string) => Array<{ name: string; found: boolean }>;
  /** Fetch a definition for a specific dictionary. */
  getDefinition: (dictName: string, word: string) => Promise<DefinitionResult | null>;
}

export interface PopupOptions extends PopupCallbacks {
  tabs: PopupTab[];
  /** Search-box placeholder. Default: "Search…". */
  placeholder?: string;
  /** Text direction for the word/definition. Default 'rtl' (Urdu). */
  dir?: 'rtl' | 'ltr';
  /** Content types rendered as raw HTML; others are escaped. Default ['h','g','x']. */
  htmlTypes?: string[];
}

const STYLE_ID = 'shakeeb-hyperdict-style';
const PREFIX = 'shk-dict';

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:none}
.${PREFIX}-overlay.open{display:block}
.${PREFIX}-popup{position:fixed;bottom:20px;right:20px;width:440px;max-width:calc(100vw - 24px);
  max-height:80vh;background:#fff;color:#000;border:2px solid #000;border-radius:6px;
  box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:2147483647;display:none;flex-direction:column;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-popup.open{display:flex}
.${PREFIX}-close{position:absolute;top:8px;left:8px;width:28px;height:28px;line-height:1;
  border:1px solid #000;background:#fff;color:#000;border-radius:4px;cursor:pointer;font-size:16px;z-index:2}
.${PREFIX}-close:hover{background:#000;color:#fff}
.${PREFIX}-tabs{display:flex;gap:0;border-bottom:2px solid #000;margin-left:44px;overflow-x:auto}
.${PREFIX}-tab{padding:12px 14px;background:none;border:none;border-bottom:3px solid transparent;
  margin-bottom:-2px;color:#777;font-weight:600;font-size:14px;white-space:nowrap;cursor:pointer}
.${PREFIX}-tab:hover{color:#000}
.${PREFIX}-tab.active{color:#000;border-bottom-color:#000;background:#f4f4f4}
.${PREFIX}-tab.absent{opacity:.45}
.${PREFIX}-search{padding:12px;border-bottom:1px solid #e0e0e0}
.${PREFIX}-input{width:100%;padding:10px 12px;border:1px solid #000;border-radius:4px;
  font-size:15px;background:#fff;color:#000;font-family:inherit}
.${PREFIX}-input:focus{outline:none;box-shadow:0 0 0 2px rgba(0,0,0,.12)}
.${PREFIX}-body{flex:1;overflow-y:auto;padding:14px;line-height:1.7;font-size:15px}
.${PREFIX}-word{font-weight:700;font-size:17px;margin-bottom:8px}
.${PREFIX}-def{background:#fafafa;border-left:3px solid #000;border-radius:3px;padding:10px 12px;
  word-break:break-word}
.${PREFIX}-def img{max-width:100%}
.${PREFIX}-msg{text-align:center;color:#666;padding:18px}
.${PREFIX}-spin{display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#000;
  border-radius:50%;animation:${PREFIX}-spin .8s linear infinite;vertical-align:middle}
@keyframes ${PREFIX}-spin{to{transform:rotate(360deg)}}
@media (max-width:600px){.${PREFIX}-popup{width:auto;left:8px;right:8px;bottom:8px;border-radius:6px}}
`;

function injectStyleOnce(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] as string
  );
}

export class ShakeebDictPopup {
  private readonly opts: Required<Pick<PopupOptions, 'placeholder' | 'dir' | 'htmlTypes'>> &
    PopupOptions;
  private overlay!: HTMLDivElement;
  private root!: HTMLDivElement;
  private tabsEl!: HTMLDivElement;
  private input!: HTMLInputElement;
  private body!: HTMLDivElement;
  private activeTab: string;
  private word = '';
  /** Monotonic token so a slow fetch can't overwrite a newer one. */
  private requestSeq = 0;

  constructor(options: PopupOptions) {
    this.opts = {
      placeholder: 'Search…',
      dir: 'rtl',
      htmlTypes: ['h', 'g', 'x'],
      ...options,
    };
    this.activeTab = options.tabs[0]?.name ?? '';
    injectStyleOnce();
    this.build();
  }

  /** The popup's own DOM root, so triggers can ignore gestures inside it. */
  public get element(): HTMLElement {
    return this.root;
  }

  public contains(node: EventTarget | null): boolean {
    return (
      node instanceof Node && (this.root.contains(node) || this.overlay.contains(node))
    );
  }

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = `${PREFIX}-overlay`;
    this.overlay.addEventListener('click', () => this.close());

    this.root = document.createElement('div');
    this.root.className = `${PREFIX}-popup`;
    this.root.setAttribute('role', 'dialog');

    const close = document.createElement('button');
    close.className = `${PREFIX}-close`;
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());

    this.tabsEl = document.createElement('div');
    this.tabsEl.className = `${PREFIX}-tabs`;

    const searchWrap = document.createElement('div');
    searchWrap.className = `${PREFIX}-search`;
    this.input = document.createElement('input');
    this.input.className = `${PREFIX}-input`;
    this.input.type = 'text';
    this.input.placeholder = this.opts.placeholder;
    this.input.dir = this.opts.dir;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const w = this.input.value.trim();
        if (w) {
          this.word = w;
          this.refreshTabs();
          this.loadActive();
        }
      }
    });
    searchWrap.appendChild(this.input);

    this.body = document.createElement('div');
    this.body.className = `${PREFIX}-body`;
    this.body.dir = this.opts.dir;

    this.root.append(close, this.tabsEl, searchWrap, this.body);
    document.body.append(this.overlay, this.root);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  private renderTabs(availability: Record<string, boolean>): void {
    this.tabsEl.textContent = '';
    for (const tab of this.opts.tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${PREFIX}-tab${tab.name === this.activeTab ? ' active' : ''}${
        availability[tab.name] === false ? ' absent' : ''
      }`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        this.activeTab = tab.name;
        this.renderTabs(availability);
        this.loadActive();
      });
      this.tabsEl.appendChild(btn);
    }
  }

  private refreshTabs(): void {
    const results = this.opts.lookup(this.word);
    const availability: Record<string, boolean> = {};
    for (const r of results) availability[r.name] = r.found;
    // Auto-select the first tab that actually contains the word.
    const firstHit = this.opts.tabs.find((t) => availability[t.name]);
    if (firstHit && availability[this.activeTab] !== true) {
      this.activeTab = firstHit.name;
    }
    this.renderTabs(availability);
  }

  /** Open the popup for a word. */
  public open(word: string): void {
    this.word = word.trim();
    this.input.value = this.word;
    this.refreshTabs();
    this.overlay.classList.add('open');
    this.root.classList.add('open');
    this.loadActive();
    this.input.focus();
    this.input.select();
  }

  public close(): void {
    this.overlay.classList.remove('open');
    this.root.classList.remove('open');
  }

  public isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  public destroy(): void {
    this.overlay.remove();
    this.root.remove();
  }

  private async loadActive(): Promise<void> {
    const dict = this.activeTab;
    const word = this.word;
    if (!dict || !word) {
      this.body.innerHTML = `<div class="${PREFIX}-msg">Type a word to search.</div>`;
      return;
    }

    const token = ++this.requestSeq;
    this.body.innerHTML = `<div class="${PREFIX}-msg"><span class="${PREFIX}-spin"></span> Searching…</div>`;

    try {
      const result = await this.opts.getDefinition(dict, word);
      if (token !== this.requestSeq) return; // a newer request superseded this one

      if (!result) {
        this.body.innerHTML = `<div class="${PREFIX}-msg">“${escapeHtml(word)}” not found in this dictionary.</div>`;
        return;
      }

      const isHtml = !!result.type && this.opts.htmlTypes.includes(result.type);
      const defHtml = isHtml ? result.definition : escapeHtml(result.definition);
      this.body.innerHTML =
        `<div class="${PREFIX}-word">${escapeHtml(result.word)}</div>` +
        `<div class="${PREFIX}-def">${defHtml}</div>`;
    } catch (err) {
      if (token !== this.requestSeq) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.body.innerHTML = `<div class="${PREFIX}-msg">Error: ${escapeHtml(msg)}</div>`;
    }
  }
}
