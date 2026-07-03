/**
 * ShakeebDictPopup - reusable, dependency-free dictionary popup
 * Authored by Shakeeb Ahmad
 *
 * Black-&-white floating popup: close (top-left), dictionary tabs (top-right,
 * single-row horizontal scroll), a toolbar (back / copy / recent / info / add),
 * an RTL-aware search box, and a definition panel that renders HTML or
 * prettified text per StarDict content type and turns `bword://` links into
 * lookups. It's resizable (drag the top-left grip) up to nearly full screen,
 * uses inline SVG icons, and can copy this/all dictionaries as plain/MD/HTML.
 * Injects its own scoped CSS once — no external stylesheet needed.
 */

import type { DefinitionResult } from '../core/types';
import { escapeHtml, prettifyPlainText, resolveLinkWord, type DefinitionTransform } from './format';
import { icon, type IconName } from './icons';
import { formatOne, formatMany, copyText, type OutputFormat } from './output-format';
import type { SearchHistory } from './history';

export interface PopupTab {
  name: string;
  label: string;
  dir?: 'rtl' | 'ltr';
  font?: string;
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
  /** Optional autocomplete — headwords starting with the typed prefix. */
  suggest?: (prefix: string) => string[];
  /** Optional reverse lookup — headwords in a dictionary whose meaning contains `query`. */
  reverseLookup?: (
    dictName: string,
    query: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<string[]>;
}

export interface PopupOptions extends PopupCallbacks {
  tabs: PopupTab[];
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  htmlTypes?: string[];
  transform?: DefinitionTransform;
  history?: SearchHistory;
  getInfo?: (dictName: string) => DictInfo | null;
  attribution?: boolean | { text: string; url?: string };
  onManage?: () => void;
}

const STYLE_ID = 'shakeeb-hyperdict-style';
const PREFIX = 'shk-dict';
const injectedFonts = new Set<string>();

const CSS = `
.${PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:none}
.${PREFIX}-overlay.open{display:block}
.${PREFIX}-popup{position:fixed;bottom:20px;right:20px;width:460px;height:auto;
  max-width:calc(100vw - 24px);max-height:min(90vh,900px);max-height:min(90dvh,900px);
  background:#fff;color:#000;border:2px solid #000;border-radius:6px;
  box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:2147483647;display:none;flex-direction:column;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.${PREFIX}-popup.open{display:flex}
.${PREFIX}-grip{position:absolute;top:0;left:0;width:18px;height:18px;cursor:nwse-resize;z-index:4;
  background:linear-gradient(135deg,#000 0 2px,transparent 2px 4px,#000 4px 6px,transparent 6px 8px,#000 8px 10px,transparent 10px)}
.${PREFIX}-head{display:flex;align-items:stretch;border-bottom:2px solid #000;flex:none}
.${PREFIX}-close{flex:none;width:30px;height:30px;margin:6px 6px 6px 10px;border:1px solid #000;
  background:#fff;color:#000;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.${PREFIX}-close:hover{background:#000;color:#fff}
.${PREFIX}-tabs{display:flex;flex-wrap:nowrap;flex:1;overflow-x:auto;overflow-y:hidden;white-space:nowrap;
  scrollbar-width:thin}
.${PREFIX}-tabs::-webkit-scrollbar{height:6px}
.${PREFIX}-tabs::-webkit-scrollbar-thumb{background:#bbb;border-radius:3px}
.${PREFIX}-tab{flex:0 0 auto;padding:10px 13px;background:none;border:none;border-bottom:3px solid transparent;
  margin-bottom:-2px;color:#777;font-weight:600;font-size:13px;cursor:pointer}
.${PREFIX}-tab:hover{color:#000}
.${PREFIX}-tab.active{color:#000;border-bottom-color:#000;background:#f4f4f4}
.${PREFIX}-tab.absent{opacity:.4}
.${PREFIX}-toolbar{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #eee;position:relative;flex:none}
.${PREFIX}-tool{width:30px;height:30px;border:1px solid #000;background:#fff;color:#000;border-radius:4px;
  cursor:pointer;display:flex;align-items:center;justify-content:center}
.${PREFIX}-tool:hover:not(:disabled){background:#000;color:#fff}
.${PREFIX}-tool:disabled{opacity:.35;cursor:default}
.${PREFIX}-tool.ml{margin-left:auto}
.${PREFIX}-search{padding:10px;flex:none;position:relative}
.${PREFIX}-tool.on{background:#000;color:#fff}
.${PREFIX}-sugg{position:absolute;left:10px;right:10px;top:calc(100% - 4px);background:#fff;border:1px solid #000;
  border-top:none;border-radius:0 0 5px 5px;max-height:220px;overflow:auto;z-index:7;box-shadow:0 8px 20px rgba(0,0,0,.2)}
.${PREFIX}-sugg.hidden{display:none}
.${PREFIX}-sugg-item{padding:8px 12px;cursor:pointer;border-bottom:1px solid #eee}
.${PREFIX}-sugg-item:hover,.${PREFIX}-sugg-item.sel{background:#f0f0f0}
.${PREFIX}-revlist button{display:block;width:100%;text-align:inherit;padding:9px 12px;background:#fff;border:none;
  border-bottom:1px solid #eee;cursor:pointer;font-size:15px}
.${PREFIX}-revlist button:hover{background:#f0f0f0}
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
.${PREFIX}-chip{display:inline-block;margin:3px;padding:5px 10px;border:1px solid #000;border-radius:14px;cursor:pointer;font-size:13px}
.${PREFIX}-chip:hover{background:#000;color:#fff}
.${PREFIX}-info b{display:block;font-size:15px;margin-bottom:4px}
.${PREFIX}-info small{color:#555}
.${PREFIX}-credit{margin-top:10px;padding-top:8px;border-top:1px solid #eee;font-size:12px;color:#555}
.${PREFIX}-credit a{color:#000}
.${PREFIX}-row2{display:flex;gap:8px;margin-bottom:8px}
.${PREFIX}-cbtn{flex:1;padding:9px;border:1px solid #000;background:#fff;border-radius:5px;cursor:pointer;
  font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px}
.${PREFIX}-cbtn:hover{background:#000;color:#fff}
.${PREFIX}-seg{display:flex;border:1px solid #000;border-radius:5px;overflow:hidden}
.${PREFIX}-seg button{flex:1;padding:6px;background:#fff;border:none;border-right:1px solid #000;cursor:pointer;font-size:12px}
.${PREFIX}-seg button:last-child{border-right:none}
.${PREFIX}-seg button.on{background:#000;color:#fff}
.${PREFIX}-toast{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:#000;color:#fff;
  padding:6px 12px;border-radius:4px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:6}
.${PREFIX}-toast.show{opacity:1}
@media (max-width:600px){
  /* Bottom sheet: cap height (dvh accounts for the mobile URL bar) so the close
     button + tabs stay on-screen; disable the drag-resize grip on touch. */
  .${PREFIX}-popup{width:auto;left:8px;right:8px;bottom:8px;
    max-height:82vh;max-height:82dvh}
  .${PREFIX}-grip{display:none}
}
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
  private copyBtn!: HTMLButtonElement;
  private reverseBtn: HTMLButtonElement | null = null;
  private suggBox!: HTMLDivElement;
  private suggTimer: ReturnType<typeof setTimeout> | null = null;
  private reverseMode = false;
  private recentPop!: HTMLDivElement;
  private infoPop!: HTMLDivElement;
  private copyPop!: HTMLDivElement;
  private toast!: HTMLDivElement;

  private activeTab: string;
  private word = '';
  private backStack: string[] = [];
  private requestSeq = 0;
  private currentResult: DefinitionResult | null = null;
  private copyFormat: OutputFormat = 'plain';
  private static readonly MAX_BACK = 100;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen()) this.close();
  };

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

  public setTabs(tabs: PopupTab[]): void {
    this.tabs = tabs.slice();
    this.tabs.forEach((t) => injectFontOnce(t.fontUrl));
    if (!this.tabs.some((t) => t.name === this.activeTab)) {
      this.activeTab = this.tabs[0]?.name ?? '';
    }
    if (this.isOpen()) {
      this.refreshTabs();
      void this.loadActive();
    }
  }

  private activeTabConfig(): PopupTab | undefined {
    return this.tabs.find((t) => t.name === this.activeTab);
  }

  private tabLabel(name: string): string {
    return this.tabs.find((t) => t.name === name)?.label ?? name;
  }

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = `${PREFIX}-overlay`;
    this.overlay.addEventListener('click', () => this.close());

    this.root = document.createElement('div');
    this.root.className = `${PREFIX}-popup`;
    this.root.setAttribute('role', 'dialog');

    const grip = document.createElement('div');
    grip.className = `${PREFIX}-grip`;
    grip.title = 'Drag to resize';
    this.attachResize(grip);

    const head = document.createElement('div');
    head.className = `${PREFIX}-head`;
    const close = this.iconButton(`${PREFIX}-close`, 'close', 'Close', () => this.close());
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = `${PREFIX}-tabs`;
    head.append(close, this.tabsEl);

    const toolbar = document.createElement('div');
    toolbar.className = `${PREFIX}-toolbar`;
    this.backBtn = this.iconButton(`${PREFIX}-tool`, 'back', 'Back', () => this.goBack());
    this.copyBtn = this.iconButton(`${PREFIX}-tool`, 'copy', 'Copy', () => this.toggleCopy());
    toolbar.append(this.backBtn, this.copyBtn);

    if (this.opts.reverseLookup) {
      this.reverseBtn = this.iconButton(`${PREFIX}-tool`, 'swap', 'Reverse lookup (search meanings)', () =>
        this.toggleReverse()
      );
      toolbar.appendChild(this.reverseBtn);
    }

    if (this.opts.history) {
      toolbar.appendChild(
        this.iconButton(`${PREFIX}-tool`, 'clock', 'Recent searches', () => this.toggleRecent())
      );
    }
    toolbar.appendChild(
      this.iconButton(`${PREFIX}-tool`, 'info', 'Dictionary info', () => this.toggleInfo())
    );
    if (this.opts.onManage) {
      toolbar.appendChild(
        this.iconButton(`${PREFIX}-tool ml`, 'plus', 'Manage dictionaries', () =>
          this.opts.onManage?.()
        )
      );
    }

    this.recentPop = this.makePopover();
    this.infoPop = this.makePopover();
    this.copyPop = this.makePopover();
    toolbar.append(this.recentPop, this.infoPop, this.copyPop);

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
        this.hideSuggestions();
        if (w) this.showWord(w);
      } else if (e.key === 'Escape' && !this.suggBox.classList.contains('hidden')) {
        e.stopPropagation();
        this.hideSuggestions();
      }
    });
    this.input.addEventListener('input', () => this.scheduleSuggest());
    this.input.addEventListener('blur', () => setTimeout(() => this.hideSuggestions(), 150));
    searchWrap.appendChild(this.input);

    this.suggBox = document.createElement('div');
    this.suggBox.className = `${PREFIX}-sugg hidden`;
    searchWrap.appendChild(this.suggBox);

    this.body = document.createElement('div');
    this.body.className = `${PREFIX}-body`;
    this.body.addEventListener('click', (e) => this.onBodyClick(e));

    this.toast = document.createElement('div');
    this.toast.className = `${PREFIX}-toast`;

    this.root.append(grip, head, toolbar, searchWrap, this.body, this.toast);
    document.body.append(this.overlay, this.root);

    document.addEventListener('keydown', this.onKeyDown);
  }

  private makePopover(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `${PREFIX}-pop hidden`;
    return el;
  }

  private iconButton(
    className: string,
    name: IconName,
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.innerHTML = icon(name);
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- resize (top-left grip, since the popup is anchored bottom-right) ---
  private attachResize(grip: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
    const onMove = (e: PointerEvent): void => {
      const w = Math.min(Math.max(startW + (startX - e.clientX), 300), window.innerWidth - 24);
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const h = Math.min(Math.max(startH + (startY - e.clientY), 200), vh - 24);
      this.root.style.width = `${w}px`;
      this.root.style.height = `${h}px`;
    };
    const onUp = (e: PointerEvent): void => {
      grip.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startW = this.root.offsetWidth;
      startH = this.root.offsetHeight;
      this.root.style.maxHeight = 'none'; // let the explicit height win
      grip.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
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
        void this.loadActive();
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

  public open(word = ''): void {
    this.backStack = [];
    this.overlay.classList.add('open');
    this.root.classList.add('open');
    const w = word.trim();
    if (w) {
      this.showWord(w, { resetBack: true });
    } else {
      this.word = '';
      this.input.value = '';
      this.currentResult = null;
      this.hidePopovers();
      this.refreshTabs();
      this.updateBackButton();
      void this.loadActive();
    }
    this.input.focus();
    this.input.select();
  }

  private showWord(word: string, opts: { fromBack?: boolean; resetBack?: boolean } = {}): void {
    const w = word.trim();
    if (!w) return;
    if (!opts.fromBack && this.word && this.word !== w) {
      this.backStack.push(this.word);
      if (this.backStack.length > ShakeebDictPopup.MAX_BACK) this.backStack.shift();
    }
    if (opts.resetBack) this.backStack = [];
    this.word = w;
    this.input.value = w;
    this.opts.history?.add(w);
    this.hidePopovers();
    this.hideSuggestions();
    this.refreshTabs();
    this.updateBackButton();
    void this.loadActive();
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
    this.hideSuggestions();
  }

  public isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay.remove();
    this.root.remove();
  }

  private onBodyClick(e: MouseEvent): void {
    const anchor = (e.target as Element | null)?.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    e.preventDefault();
    const word = resolveLinkWord(href);
    if (word) {
      this.showWord(word);
    } else if (/^https?:/i.test(href)) {
      window.open(href, '_blank', 'noopener');
    }
  }

  private async loadActive(): Promise<void> {
    const dict = this.activeTab;
    const word = this.word;
    this.currentResult = null;
    if (!dict || !word) {
      this.body.innerHTML = `<div class="${PREFIX}-msg">${
        this.reverseMode ? 'Type a word to find in meanings.' : 'Type a word to search.'
      }</div>`;
      return;
    }

    if (this.reverseMode) {
      void this.runReverse();
      return;
    }

    const cfg = this.activeTabConfig();
    this.body.dir = cfg?.dir ?? this.defaultDir;
    this.body.style.fontFamily = cfg?.font ? `'${cfg.font}', serif` : '';

    const token = ++this.requestSeq;
    this.body.innerHTML = `<div class="${PREFIX}-msg"><span class="${PREFIX}-spin"></span> Searching…</div>`;

    try {
      const result = await this.opts.getDefinition(dict, word);
      if (token !== this.requestSeq) return;
      if (!result) {
        this.body.innerHTML = `<div class="${PREFIX}-msg">“${escapeHtml(word)}” not found in this dictionary.</div>`;
        return;
      }
      this.currentResult = result;
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
      if (out instanceof HTMLElement) def.appendChild(out);
      else def.innerHTML = out;
    } else if (result.type && this.htmlTypes.includes(result.type)) {
      def.innerHTML = result.definition;
    } else {
      def.innerHTML = prettifyPlainText(result.definition, `${PREFIX}-sense`);
    }
    this.body.appendChild(def);
  }

  // --- popovers ------------------------------------------------------------
  private hidePopovers(): void {
    this.recentPop.classList.add('hidden');
    this.infoPop.classList.add('hidden');
    this.copyPop.classList.add('hidden');
  }

  private togglePop(pop: HTMLDivElement, render: () => void): void {
    const wasHidden = pop.classList.contains('hidden');
    this.hidePopovers();
    if (wasHidden) {
      render();
      pop.classList.remove('hidden');
    }
  }

  private toggleRecent(): void {
    this.togglePop(this.recentPop, () => {
      const words = this.opts.history?.list() ?? [];
      this.recentPop.textContent = '';
      if (words.length === 0) {
        this.recentPop.innerHTML = `<div class="${PREFIX}-msg">No recent searches yet.</div>`;
        return;
      }
      for (const w of words) {
        const chip = document.createElement('span');
        chip.className = `${PREFIX}-chip`;
        chip.textContent = w;
        chip.addEventListener('click', () => this.showWord(w));
        this.recentPop.appendChild(chip);
      }
    });
  }

  private toggleInfo(): void {
    this.togglePop(this.infoPop, () => {
      const info = this.opts.getInfo?.(this.activeTab) ?? null;
      const cfg = this.activeTabConfig();
      let html = '';
      if (info) {
        html += `<div class="${PREFIX}-info"><b>${escapeHtml(info.title ?? cfg?.label ?? this.activeTab)}</b>`;
        if (typeof info.wordcount === 'number') html += `<small>${info.wordcount.toLocaleString()} words</small><br>`;
        if (info.author) html += `<small>${escapeHtml(info.author)}</small><br>`;
        if (info.extra) html += `<small>${escapeHtml(info.extra)}</small>`;
        html += `</div>`;
      }
      html += this.attributionHtml();
      this.infoPop.innerHTML = html || `<div class="${PREFIX}-msg">No info available.</div>`;
    });
  }

  private toggleCopy(): void {
    this.togglePop(this.copyPop, () => this.renderCopyPop());
  }

  private renderCopyPop(): void {
    this.copyPop.textContent = '';
    const row = document.createElement('div');
    row.className = `${PREFIX}-row2`;
    const thisBtn = this.copyActionBtn('Copy this', () => this.doCopy(false));
    const allBtn = this.copyActionBtn('Copy all', () => this.doCopy(true));
    row.append(thisBtn, allBtn);

    const seg = document.createElement('div');
    seg.className = `${PREFIX}-seg`;
    const fmts: Array<[OutputFormat, string]> = [
      ['plain', 'Plain'],
      ['markdown', 'MD'],
      ['html', 'HTML'],
    ];
    for (const [fmt, label] of fmts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (fmt === this.copyFormat) b.classList.add('on');
      b.addEventListener('click', () => {
        this.copyFormat = fmt;
        this.renderCopyPop();
      });
      seg.appendChild(b);
    }
    this.copyPop.append(row, seg);
  }

  private copyActionBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${PREFIX}-cbtn`;
    b.innerHTML = icon('copy') + `<span>${label}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  private async doCopy(all: boolean): Promise<void> {
    if (!this.word) return;
    let text = '';
    if (all) {
      const found = this.opts.lookup(this.word).filter((d) => d.found);
      const entries: Array<{ label: string; result: DefinitionResult }> = [];
      for (const { name } of found) {
        try {
          const r = await this.opts.getDefinition(name, this.word);
          if (r) entries.push({ label: this.tabLabel(name), result: r });
        } catch {
          /* skip dicts that error */
        }
      }
      if (!entries.length) return this.showToast('Nothing to copy');
      text = formatMany(this.word, entries, this.copyFormat);
    } else {
      if (!this.currentResult) return this.showToast('Nothing to copy');
      text = formatOne(this.currentResult, this.copyFormat);
    }
    const ok = await copyText(text);
    this.hidePopovers();
    this.showToast(ok ? 'Copied ✓' : 'Copy failed');
  }

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 1400);
  }

  // --- reverse lookup (search within meanings) ---
  private toggleReverse(): void {
    this.reverseMode = !this.reverseMode;
    this.reverseBtn?.classList.toggle('on', this.reverseMode);
    this.reverseBtn?.setAttribute(
      'title',
      this.reverseMode ? 'Reverse lookup ON (searching meanings)' : 'Reverse lookup (search meanings)'
    );
    this.input.placeholder = this.reverseMode
      ? 'Find a word inside meanings…'
      : (this.opts.placeholder ?? 'Search…');
    this.hideSuggestions();
    if (this.word) void this.loadActive();
  }

  private async runReverse(): Promise<void> {
    if (!this.opts.reverseLookup) return;
    const dict = this.activeTab;
    const query = this.word;
    const token = ++this.requestSeq;
    this.body.dir = this.defaultDir;
    this.body.style.fontFamily = '';
    this.body.innerHTML = `<div class="${PREFIX}-msg"><span class="${PREFIX}-spin"></span> Scanning meanings…</div>`;

    try {
      const words = await this.opts.reverseLookup(dict, query, (done, total) => {
        if (token !== this.requestSeq) return;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const el = this.body.querySelector(`.${PREFIX}-msg`);
        if (el) el.innerHTML = `<span class="${PREFIX}-spin"></span> Scanning meanings… ${pct}%`;
      });
      if (token !== this.requestSeq) return;

      if (words.length === 0) {
        this.body.innerHTML = `<div class="${PREFIX}-msg">No entries whose meaning contains “${escapeHtml(query)}”.</div>`;
        return;
      }
      this.body.innerHTML = `<div class="${PREFIX}-word">${words.length} match${
        words.length === 1 ? '' : 'es'
      } for “${escapeHtml(query)}” in meanings</div>`;
      const list = document.createElement('div');
      list.className = `${PREFIX}-revlist`;
      const cfg = this.activeTabConfig();
      for (const w of words) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = w;
        b.dir = cfg?.dir ?? this.defaultDir;
        if (cfg?.font) b.style.fontFamily = `'${cfg.font}', serif`;
        b.addEventListener('click', () => {
          this.reverseMode = false;
          this.reverseBtn?.classList.remove('on');
          this.input.placeholder = this.opts.placeholder ?? 'Search…';
          this.showWord(w);
        });
        list.appendChild(b);
      }
      this.body.appendChild(list);
    } catch (err) {
      if (token !== this.requestSeq) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.body.innerHTML = `<div class="${PREFIX}-msg">Error: ${escapeHtml(msg)}</div>`;
    }
  }

  // --- autocomplete suggestions ---
  private scheduleSuggest(): void {
    if (!this.opts.suggest || this.reverseMode) {
      this.hideSuggestions();
      return;
    }
    if (this.suggTimer) clearTimeout(this.suggTimer);
    this.suggTimer = setTimeout(() => this.renderSuggestions(), 110);
  }

  private renderSuggestions(): void {
    if (!this.opts.suggest) return;
    const prefix = this.input.value.trim();
    if (!prefix) {
      this.hideSuggestions();
      return;
    }
    const words = this.opts.suggest(prefix).filter((w) => w !== prefix);
    if (words.length === 0) {
      this.hideSuggestions();
      return;
    }
    this.suggBox.textContent = '';
    const cfg = this.activeTabConfig();
    for (const w of words) {
      const item = document.createElement('div');
      item.className = `${PREFIX}-sugg-item`;
      item.textContent = w;
      item.dir = cfg?.dir ?? this.defaultDir;
      // mousedown (not click) so it fires before the input's blur hides the box.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.hideSuggestions();
        this.showWord(w);
      });
      this.suggBox.appendChild(item);
    }
    this.suggBox.classList.remove('hidden');
  }

  private hideSuggestions(): void {
    if (this.suggTimer) {
      clearTimeout(this.suggTimer);
      this.suggTimer = null;
    }
    this.suggBox.classList.add('hidden');
  }

  private attributionHtml(): string {
    const a = this.opts.attribution;
    if (a === false) return '';
    if (a && typeof a === 'object') {
      const safeUrl = a.url && /^https?:/i.test(a.url) ? a.url : '';
      const link = safeUrl
        ? ` — <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(safeUrl)}</a>`
        : '';
      return `<div class="${PREFIX}-credit">${escapeHtml(a.text)}${link}</div>`;
    }
    return `<div class="${PREFIX}-credit">Powered by <b>HyperDict</b> · Shakeeb Ahmad · <a href="https://shakeeb.in" target="_blank" rel="noopener">shakeeb.in</a></div>`;
  }
}
