/**
 * ShakeebDictPopup - reusable, dependency-free dictionary popup
 * Authored by Shakeeb Ahmad
 *
 * Black-&-white floating popup: close (top-left), dictionary tabs (top-right),
 * a toolbar (back / recent / info / add), an RTL-aware search box, and a
 * definition panel that renders HTML or prettified text per StarDict content
 * type — and turns `bword://` cross-references into clickable lookups. It
 * injects its own scoped CSS once, so embedding needs no external stylesheet.
 */

import type { DefinitionResult } from '../core/types';
import { escapeHtml, prettifyPlainText, resolveLinkWord, type DefinitionTransform } from './format';
import type { SearchHistory } from './history';

export interface PopupTab {
  name: string;
  label: string;
  /** Text direction for this dictionary's content. */
  dir?: 'rtl' | 'ltr';
  /** CSS font-family for this dictionary's content. */
  font?: string;
  /** Stylesheet URL to inject for `font`. */
  fontUrl?: string;
  lang?: string;
}

export interface DictInfo {
  title?: string;
  author?: string;
  wordcount?: number;
  extra?: string;
}

export interface PopupCallbacks {
  lookup: (word: string) => Array<{ name: string; found: boolean }>;
  getDefinition: (dictName: string, word: string) => Promise<DefinitionResult | null>;
}

export interface PopupOptions extends PopupCallbacks {
  tabs: PopupTab[];
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  /** Content types rendered as raw HTML; others are prettified + escaped. Default ['h','g','x']. */
  htmlTypes?: string[];
  /** Per-dictionary render override. */
  transform?: DefinitionTransform;
  /** Recent-search store powering the 🕘 dropdown. Omit to hide it. */
  history?: SearchHistory;
  /** Supplies metadata for the ⓘ info panel. */
  getInfo?: (dictName: string) => DictInfo | null;
  /** Attribution shown in the info panel. `true` = default credit; object customizes; `false` hides. */
  attribution?: boolean | { text: string; url?: string };
  /** If provided, an "＋" button appears and calls this to open a manage UI. */
  onManage?: () => void;
}

const STYLE_ID = 'shakeeb-hyperdict-style';
const PREFIX = 'shk-dict';
const injectedFonts = new Set<string>();

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:none}
.${PREFIX}-overlay.open{display:block}
.${PREFIX}-popup{position:fixed;bottom:20px;right:20px;width:460px;max-width:calc(100vw - 24px);
  max-height:82vh;background:#fff;color:#000;border:2px solid #000;border-radius:6px;
  box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:2147483647;display:none;flex-direction:column;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-popup.open{display:flex}
.${PREFIX}-head{display:flex;align-items:flex-end;border-bottom:2px solid #000}
.${PREFIX}-close{flex:none;width:30px;height:30px;margin:6px;line-height:1;border:1px solid #000;
  background:#fff;color:#000;border-radius:4px;cursor:pointer;font-size:15px}
.${PREFIX}-close:hover{background:#000;color:#fff}
.${PREFIX}-tabs{display:flex;gap:0;flex:1;overflow-x:auto}
.${PREFIX}-tab{padding:10px 13px;background:none;border:none;border-bottom:3px solid transparent;
  margin-bottom:-2px;color:#777;font-weight:600;font-size:13px;white-space:nowrap;cursor:pointer}
.${PREFIX}-tab:hover{color:#000}
.${PREFIX}-tab.active{color:#000;border-bottom-color:#000;background:#f4f4f4}
.${PREFIX}-tab.absent{opacity:.4}
.${PREFIX}-toolbar{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #eee;position:relative}
.${PREFIX}-tool{width:30px;height:30px;border:1px solid #000;background:#fff;color:#000;border-radius:4px;
  cursor:pointer;font-size:14px;line-height:1}
.${PREFIX}-tool:hover{background:#000;color:#fff}
.${PREFIX}-tool:disabled{opacity:.35;cursor:default;background:#fff;color:#000}
.${PREFIX}-tool.ml{margin-left:auto}
.${PREFIX}-search{padding:10px}
.${PREFIX}-input{width:100%;padding:10px 12px;border:1px solid #000;border-radius:4px;font-size:15px;
  background:#fff;color:#000;font-family:inherit}
.${PREFIX}-input:focus{outline:none;box-shadow:0 0 0 2px rgba(0,0,0,.12)}
.${PREFIX}-body{flex:1;overflow-y:auto;padding:0 14px 14px;line-height:1.85;font-size:16px}
.${PREFIX}-word{font-weight:700;font-size:18px;margin:6px 0 10px}
.${PREFIX}-def{background:#fafafa;border-left:3px solid #000;border-radius:3px;padding:12px 14px;word-break:break-word}
.${PREFIX}-def img{max-width:100%}
.${PREFIX}-def a{color:#000;text-decoration:underline;cursor:pointer}
.${PREFIX}-sense{padding:4px 0}
.${PREFIX}-sense + .${PREFIX}-sense{border-top:1px dashed #ccc;margin-top:6px}
.${PREFIX}-msg{text-align:center;color:#666;padding:20px}
.${PREFIX}-spin{display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#000;
  border-radius:50%;animation:${PREFIX}-spin .8s linear infinite;vertical-align:middle}
@keyframes ${PREFIX}-spin{to{transform:rotate(360deg)}}
.${PREFIX}-pop{position:absolute;top:44px;left:10px;right:10px;background:#fff;border:1px solid #000;
  border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:10px;z-index:5;max-height:50vh;overflow:auto}
.${PREFIX}-pop.hidden{display:none}
.${PREFIX}-chip{display:inline-block;margin:3px;padding:5px 10px;border:1px solid #000;border-radius:14px;
  cursor:pointer;font-size:13px}
.${PREFIX}-chip:hover{background:#000;color:#fff}
.${PREFIX}-info b{display:block;font-size:15px;margin-bottom:4px}
.${PREFIX}-info small{color:#555}
.${PREFIX}-credit{margin-top:10px;padding-top:8px;border-top:1px solid #eee;font-size:12px;color:#555}
.${PREFIX}-credit a{color:#000}
@media (max-width:600px){.${PREFIX}-popup{width:auto;left:8px;right:8px;bottom:8px}}
`;

function injectStyleOnce(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function injectFontOnce(url?: string): void {
  if (!url || injectedFonts.has(url) || typeof document === 'undefined') return;
  injectedFonts.add(url);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

export class ShakeebDictPopup {
  private readonly opts: PopupOptions;
  private readonly htmlTypes: string[];
  private readonly defaultDir: 'rtl' | 'ltr';
  private tabs: PopupTab[];

  private overlay!: HTMLDivElement;
  private root!: HTMLDivElement;
  private tabsEl!: HTMLDivElement;
  private input!: HTMLInputElement;
  private body!: HTMLDivElement;
  private backBtn!: HTMLButtonElement;
  private recentPop!: HTMLDivElement;
  private infoPop!: HTMLDivElement;

  private activeTab: string;
  private word = '';
  private backStack: string[] = [];
  private requestSeq = 0;

  constructor(options: PopupOptions) {
    this.opts = options;
    this.htmlTypes = options.htmlTypes ?? ['h', 'g', 'x'];
    this.defaultDir = options.dir ?? 'rtl';
    this.tabs = options.tabs.slice();
    this.activeTab = this.tabs[0]?.name ?? '';
    injectStyleOnce();
    this.tabs.forEach((t) => injectFontOnce(t.fontUrl));
    this.build();
  }

  public get element(): HTMLElement {
    return this.root;
  }

  public contains(node: EventTarget | null): boolean {
    return node instanceof Node && (this.root.contains(node) || this.overlay.contains(node));
  }

  /** Replace the tab set (e.g. after add/remove). Keeps the active tab if it survives. */
  public setTabs(tabs: PopupTab[]): void {
    this.tabs = tabs.slice();
    this.tabs.forEach((t) => injectFontOnce(t.fontUrl));
    if (!this.tabs.some((t) => t.name === this.activeTab)) {
      this.activeTab = this.tabs[0]?.name ?? '';
    }
    if (this.isOpen()) {
      this.refreshTabs();
      this.loadActive();
    }
  }

  private activeTabConfig(): PopupTab | undefined {
    return this.tabs.find((t) => t.name === this.activeTab);
  }

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = `${PREFIX}-overlay`;
    this.overlay.addEventListener('click', () => this.close());

    this.root = document.createElement('div');
    this.root.className = `${PREFIX}-popup`;
    this.root.setAttribute('role', 'dialog');

    // Header: close + tabs
    const head = document.createElement('div');
    head.className = `${PREFIX}-head`;
    const close = this.iconButton(`${PREFIX}-close`, '✕', 'Close', () => this.close());
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = `${PREFIX}-tabs`;
    head.append(close, this.tabsEl);

    // Toolbar: back / recent / info / add
    const toolbar = document.createElement('div');
    toolbar.className = `${PREFIX}-toolbar`;
    this.backBtn = this.iconButton(`${PREFIX}-tool`, '←', 'Back', () => this.goBack());
    toolbar.appendChild(this.backBtn);

    if (this.opts.history) {
      const recent = this.iconButton(`${PREFIX}-tool`, '🕘', 'Recent searches', () =>
        this.toggleRecent()
      );
      toolbar.appendChild(recent);
    }
    const info = this.iconButton(`${PREFIX}-tool`, 'ⓘ', 'Dictionary info', () => this.toggleInfo());
    toolbar.appendChild(info);

    if (this.opts.onManage) {
      const add = this.iconButton(`${PREFIX}-tool ml`, '＋', 'Manage dictionaries', () =>
        this.opts.onManage?.()
      );
      toolbar.appendChild(add);
    }

    // Popovers (recent + info) live in the toolbar row.
    this.recentPop = document.createElement('div');
    this.recentPop.className = `${PREFIX}-pop hidden`;
    this.infoPop = document.createElement('div');
    this.infoPop.className = `${PREFIX}-pop hidden`;
    toolbar.append(this.recentPop, this.infoPop);

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = `${PREFIX}-search`;
    this.input = document.createElement('input');
    this.input.className = `${PREFIX}-input`;
    this.input.type = 'text';
    this.input.placeholder = this.opts.placeholder ?? 'Search…';
    this.input.dir = this.defaultDir;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const w = this.input.value.trim();
        if (w) this.showWord(w);
      }
    });
    searchWrap.appendChild(this.input);

    // Body
    this.body = document.createElement('div');
    this.body.className = `${PREFIX}-body`;
    this.body.addEventListener('click', (e) => this.onBodyClick(e));

    this.root.append(head, toolbar, searchWrap, this.body);
    document.body.append(this.overlay, this.root);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  private iconButton(
    className: string,
    label: string,
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private renderTabs(availability: Record<string, boolean>): void {
    this.tabsEl.textContent = '';
    for (const tab of this.tabs) {
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
    const availability: Record<string, boolean> = {};
    for (const r of this.opts.lookup(this.word)) availability[r.name] = r.found;
    const firstHit = this.tabs.find((t) => availability[t.name]);
    if (firstHit && availability[this.activeTab] !== true) {
      this.activeTab = firstHit.name;
    }
    this.renderTabs(availability);
  }

  /** Public entry: open the popup for a word. */
  public open(word: string): void {
    this.backStack = [];
    this.overlay.classList.add('open');
    this.root.classList.add('open');
    this.showWord(word, { resetBack: true });
    this.input.focus();
    this.input.select();
  }

  /** Show a word (records back-history, updates recent list). */
  private showWord(word: string, opts: { fromBack?: boolean; resetBack?: boolean } = {}): void {
    const w = word.trim();
    if (!w) return;
    if (!opts.fromBack && this.word && this.word !== w) {
      this.backStack.push(this.word);
    }
    if (opts.resetBack) this.backStack = [];
    this.word = w;
    this.input.value = w;
    this.opts.history?.add(w);
    this.hidePopovers();
    this.refreshTabs();
    this.updateBackButton();
    this.loadActive();
  }

  private goBack(): void {
    const prev = this.backStack.pop();
    if (prev) this.showWord(prev, { fromBack: true });
    this.updateBackButton();
  }

  private updateBackButton(): void {
    this.backBtn.disabled = this.backStack.length === 0;
  }

  public close(): void {
    this.overlay.classList.remove('open');
    this.root.classList.remove('open');
    this.hidePopovers();
  }

  public isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  public destroy(): void {
    this.overlay.remove();
    this.root.remove();
  }

  private onBodyClick(e: MouseEvent): void {
    const anchor = (e.target as Element | null)?.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    const word = resolveLinkWord(href);
    if (word) {
      e.preventDefault();
      this.showWord(word);
    } else if (/^https?:/i.test(href)) {
      // External link — open safely in a new tab.
      e.preventDefault();
      window.open(href, '_blank', 'noopener');
    }
  }

  private async loadActive(): Promise<void> {
    const dict = this.activeTab;
    const word = this.word;
    if (!dict || !word) {
      this.body.innerHTML = `<div class="${PREFIX}-msg">Type a word to search.</div>`;
      return;
    }

    const cfg = this.activeTabConfig();
    const dir = cfg?.dir ?? this.defaultDir;
    this.body.dir = dir;
    this.body.style.fontFamily = cfg?.font ? `'${cfg.font}', serif` : '';

    const token = ++this.requestSeq;
    this.body.innerHTML = `<div class="${PREFIX}-msg"><span class="${PREFIX}-spin"></span> Searching…</div>`;

    try {
      const result = await this.opts.getDefinition(dict, word);
      if (token !== this.requestSeq) return; // superseded

      if (!result) {
        this.body.innerHTML = `<div class="${PREFIX}-msg">“${escapeHtml(word)}” not found in this dictionary.</div>`;
        return;
      }
      this.renderDefinition(result, dict);
    } catch (err) {
      if (token !== this.requestSeq) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.body.innerHTML = `<div class="${PREFIX}-msg">Error: ${escapeHtml(msg)}</div>`;
    }
  }

  private renderDefinition(result: DefinitionResult, dict: string): void {
    this.body.innerHTML = `<div class="${PREFIX}-word">${escapeHtml(result.word)}</div>`;
    const def = document.createElement('div');
    def.className = `${PREFIX}-def`;

    if (this.opts.transform) {
      const out = this.opts.transform(result, dict);
      if (out instanceof HTMLElement) {
        def.appendChild(out);
      } else {
        def.innerHTML = out;
      }
    } else if (result.type && this.htmlTypes.includes(result.type)) {
      def.innerHTML = result.definition; // trusted dictionary HTML
    } else {
      def.innerHTML = prettifyPlainText(result.definition, `${PREFIX}-sense`);
    }
    this.body.appendChild(def);
  }

  // --- popovers ------------------------------------------------------------

  private hidePopovers(): void {
    this.recentPop.classList.add('hidden');
    this.infoPop.classList.add('hidden');
  }

  private toggleRecent(): void {
    this.infoPop.classList.add('hidden');
    if (!this.recentPop.classList.contains('hidden')) {
      this.recentPop.classList.add('hidden');
      return;
    }
    const words = this.opts.history?.list() ?? [];
    this.recentPop.textContent = '';
    if (words.length === 0) {
      this.recentPop.innerHTML = `<div class="${PREFIX}-msg">No recent searches yet.</div>`;
    } else {
      for (const w of words) {
        const chip = document.createElement('span');
        chip.className = `${PREFIX}-chip`;
        chip.textContent = w;
        chip.addEventListener('click', () => this.showWord(w));
        this.recentPop.appendChild(chip);
      }
    }
    this.recentPop.classList.remove('hidden');
  }

  private toggleInfo(): void {
    this.recentPop.classList.add('hidden');
    if (!this.infoPop.classList.contains('hidden')) {
      this.infoPop.classList.add('hidden');
      return;
    }
    const info = this.opts.getInfo?.(this.activeTab) ?? null;
    const cfg = this.activeTabConfig();
    let html = '';
    if (info) {
      html += `<div class="${PREFIX}-info"><b>${escapeHtml(info.title ?? cfg?.label ?? this.activeTab)}</b>`;
      if (typeof info.wordcount === 'number') {
        html += `<small>${info.wordcount.toLocaleString()} words</small><br>`;
      }
      if (info.author) html += `<small>${escapeHtml(info.author)}</small><br>`;
      if (info.extra) html += `<small>${escapeHtml(info.extra)}</small>`;
      html += `</div>`;
    }
    html += this.attributionHtml();
    this.infoPop.innerHTML = html || `<div class="${PREFIX}-msg">No info available.</div>`;
    this.infoPop.classList.remove('hidden');
  }

  private attributionHtml(): string {
    const a = this.opts.attribution;
    if (a === false) return '';
    if (a && typeof a === 'object') {
      const link = a.url ? ` — <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.url)}</a>` : '';
      return `<div class="${PREFIX}-credit">${escapeHtml(a.text)}${link}</div>`;
    }
    return `<div class="${PREFIX}-credit">Powered by <b>HyperDict</b> · Shakeeb Ahmad · <a href="https://shakeeb.in" target="_blank" rel="noopener">shakeeb.in</a></div>`;
  }
}
