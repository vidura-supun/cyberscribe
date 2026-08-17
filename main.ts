import {
  App,
  Editor,
  MarkdownPostProcessorContext,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  ItemView,
  WorkspaceLeaf,
} from 'obsidian';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { Annotation, RangeSetBuilder, StateEffect } from '@codemirror/state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColorRule {
  id: string;
  regex: string;
  color: string;
  enabled: boolean;
}

interface DefangRule {
  regex: string;
  enabled: boolean;
}

/** The two working phases of the timer. */
type TimerPhase = 'investigating' | 'acting';
type TimerState = TimerPhase | 'idle';

interface PluginSettings {
  colorRules: ColorRule[];
  plainTextPaste: boolean;
  dateTokens: boolean;
  timerEnabled: boolean;
  timerFolder: string;
  defang: {
    ips: DefangRule;
    domains: DefangRule;
    emails: DefangRule;
    urls: DefangRule;
    scopeStart: string;
    scopeEnd: string;
  };
  timeConvert: {
    enabled: boolean;
    timezoneOffset: string;
    scopeStart: string;
    scopeEnd: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAT_COLORS = [
  { name: 'Red',     value: '#e74c3c' },
  { name: 'Orange',  value: '#e67e22' },
  { name: 'Yellow',  value: '#f1c40f' },
  { name: 'Green',   value: '#2ecc71' },
  { name: 'Teal',    value: '#1abc9c' },
  { name: 'Blue',    value: '#3498db' },
  { name: 'Purple',  value: '#9b59b6' },
  { name: 'Pink',    value: '#fd79a8' },
  { name: 'Crimson', value: '#c0392b' },
  { name: 'Lime',    value: '#a8e063' },
  { name: 'Cyan',    value: '#00cec9' },
  { name: 'Indigo',  value: '#6c5ce7' },
] as const;

const VALID_COLORS = new Set(FLAT_COLORS.map((c) => c.value));

const INVESTIGATION_DURATION = 45 * 60 * 1000;
const ACTION_DURATION        = 20 * 60 * 1000;
const TIMER_VIEW_TYPE        = 'cyberscribe-timer';

const PHASE_DURATION: Record<TimerPhase, number> = {
  investigating: INVESTIGATION_DURATION,
  acting:        ACTION_DURATION,
};

const PHASE_LABEL: Record<TimerPhase, string> = {
  investigating: 'Investigation',
  acting:        'Taking Action',
};

const PHASE_ICON: Record<TimerPhase, string> = {
  investigating: '🔍',
  acting:        '✏️',
};

const DEFAULT_SETTINGS: PluginSettings = {
  colorRules: [],
  plainTextPaste: false,
  dateTokens: true,
  timerEnabled: true,
  timerFolder: '',
  defang: {
    ips: {
      regex: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b`,
      enabled: true,
    },
    domains: {
      regex: String.raw`\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|sh|gov|edu|co|uk|de|fr|ru|cn|jp|au|ca|info|biz|xyz|top|site|online|tech|me|tv|cc|app|dev|mil|int|us|in|br|nl|se|no|fi|dk|pl|ch|at|be|nz|sg|hk|tw|kr|za|mx|ar|cl|pe|ph|id|th|vn|pk|bd|ng|ke|eg|ma|dz|tn|ly|sd|gh|tz|ci|cm|sn|ug|zm|zw)\b`,
      enabled: true,
    },
    emails: {
      regex: String.raw`\b[a-zA-Z0-9._%+\-]+@(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}\b`,
      enabled: true,
    },
    urls: {
      regex: String.raw`https?://[^\s<>"'\]]+`,
      enabled: true,
    },
    scopeStart: '',
    scopeEnd: '',
  },
  timeConvert: {
    enabled: false,
    timezoneOffset: '+0',
    scopeStart: '',
    scopeEnd: '',
  },
};

// ─── CM6 effects and annotations ─────────────────────────────────────────────

// Dispatched after saving settings to trigger decoration rebuild in all open editors
const settingsChangedEffect = StateEffect.define<void>();

const defangTx = Annotation.define<true>();
const dateTx   = Annotation.define<true>();

// ─── Scope helper ─────────────────────────────────────────────────────────────

function getScopeRanges(
  docText: string,
  scopeStart: string,
  scopeEnd: string
): { from: number; to: number }[] {
  const len = docText.length;

  if (!scopeStart && !scopeEnd) return [{ from: 0, to: len }];

  let startRe: RegExp | null = null;
  let endRe: RegExp | null = null;
  try { if (scopeStart) startRe = new RegExp(scopeStart, 'g'); } catch { /* invalid */ }
  try { if (scopeEnd)   endRe   = new RegExp(scopeEnd,   'g'); } catch { /* invalid */ }

  if (scopeStart && !startRe && scopeEnd && !endRe) return [{ from: 0, to: len }];

  if (!startRe && endRe) {
    const m = safeExec(endRe, docText);
    return [{ from: 0, to: m ? m.index : len }];
  }

  if (startRe && !endRe) {
    const m = safeExec(startRe, docText);
    return m ? [{ from: m.index + m[0].length, to: len }] : [];
  }

  // Both provided: find all paired start→end regions
  const ranges: { from: number; to: number }[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = safeExec(startRe!, docText)) !== null) {
    // Guard zero-width start match to prevent infinite loop (#1)
    if (sm[0].length === 0) { startRe!.lastIndex++; continue; }
    const from = sm.index + sm[0].length;
    endRe!.lastIndex = from;
    const em = safeExec(endRe!, docText);
    if (em) {
      if (em[0].length === 0) endRe!.lastIndex++;
      ranges.push({ from, to: em.index });
      startRe!.lastIndex = Math.max(startRe!.lastIndex, em.index + em[0].length);
    } else {
      ranges.push({ from, to: len });
      break;
    }
  }
  return ranges;
}

// Wraps exec and advances lastIndex on zero-width match to prevent infinite loops (#27)
function safeExec(re: RegExp, text: string): RegExpExecArray | null {
  const m = re.exec(text);
  if (m && m[0].length === 0) re.lastIndex++;
  return m;
}

// ─── Defang helpers ───────────────────────────────────────────────────────────

function defangText(text: string, type: 'ips' | 'domains' | 'emails' | 'urls'): string {
  if (type === 'urls') {
    return text.replace(/^https?/i, (m) => m.replace(/http/i, 'hxxp'));
  }
  if (type === 'ips' || type === 'domains') {
    return text.replace(/\./g, '[.]');
  }
  const atIdx = text.lastIndexOf('@');
  if (atIdx === -1) return text;
  return text.slice(0, atIdx) + '[@]' + text.slice(atIdx + 1).replace(/\./g, '[.]');
}

function isDefanged(text: string, type?: 'ips' | 'domains' | 'emails' | 'urls'): boolean {
  // For URLs, only the scheme matters — a URL with [.] in its host but a live
  // http(s):// scheme must still be defanged. Conversely a URL whose scheme is
  // already hxxp(s):// should be skipped regardless of bracketed host.
  if (type === 'urls') return /^hxxps?:\/\//i.test(text);
  return text.includes('[.]') || text.includes('[@]') || /hxxps?:\/\//i.test(text);
}

// ─── Date token helpers ───────────────────────────────────────────────────────

function utcDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

function utcDateTimeString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  return `${date} ${time} UTC`;
}

// Returns true if a DOM node is inside a code block, pre, or anchor — used to
// skip coloring inside those elements in reading view (#17)
function isInsideCodeOrLink(node: Node): boolean {
  let p = node.parentElement;
  while (p) {
    const tag = p.tagName.toLowerCase();
    if (tag === 'code' || tag === 'pre' || tag === 'a') return true;
    p = p.parentElement;
  }
  return false;
}

// ─── Time conversion helpers ──────────────────────────────────────────────────

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseTimezoneOffset(tz: string): number {
  const s = tz.trim().replace(/^UTC/i, '');
  const m = s.match(/^([+-]?)(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 60 : 0));
}

function formatOffset(offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs);
  const mins = Math.round((abs - h) * 60);
  return mins > 0 ? `UTC${sign}${h}:${String(mins).padStart(2, '0')}` : `UTC${sign}${h}`;
}

function convertTimestamps(text: string, offsetHours: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const tzLabel = formatOffset(offsetHours);
  // Matches: May 27, 2026 12:17 PM  or  May 27, 2026 04:15:43 PM  (seconds optional)
  const re = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\b/gi;
  return text.replace(re, (match, monthStr, dayStr, yearStr, hourStr, minStr, _secStr, ampm) => {
    const month = MONTH_INDEX[monthStr.slice(0, 3).toLowerCase()] ?? 0;
    let hour = parseInt(hourStr);
    const min = parseInt(minStr);
    if (ampm.toUpperCase() === 'AM') { if (hour === 12) hour = 0; }
    else { if (hour !== 12) hour += 12; }
    const utcMs = Date.UTC(parseInt(yearStr), month, parseInt(dayStr), hour, min)
      - Math.round(offsetHours * 60) * 60000;
    const d = new Date(utcMs);
    const utcStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    return `${utcStr} (${match} ${tzLabel})`;
  });
}

// ─── Main Plugin ──────────────────────────────────────────────────────────────

export default class CyberScribe extends Plugin {
  settings: PluginSettings;

  timerState: TimerState = 'idle';
  timerPaused = false;
  // Each phase keeps its own elapsed time so switching back and forth resumes where it left off
  private timerElapsed: Record<TimerPhase, number> = { investigating: 0, acting: 0 };
  private timerLastStart: number | null = null;
  private timerInterval: number | null = null;
  private timerBar: HTMLElement | null = null;
  private emptyOnOpen = new Set<string>();

  timerElapsedMs(): number {
    if (this.timerState === 'idle') return 0;
    const accum = this.timerElapsed[this.timerState];
    return accum + (this.timerLastStart !== null ? Date.now() - this.timerLastStart : 0);
  }

  /** Duration of the active phase, or 0 when idle. */
  phaseDuration(): number {
    return this.timerState === 'idle' ? 0 : PHASE_DURATION[this.timerState];
  }

  /** True when the active phase has counted all the way down. */
  phaseExpired(): boolean {
    return this.timerState !== 'idle' && this.timerElapsedMs() >= PHASE_DURATION[this.timerState];
  }

  formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  updateTimerBar() {
    if (this.timerBar) {
      if (!this.settings.timerEnabled || this.timerState === 'idle') {
        this.timerBar.style.display = 'none';
      } else {
        this.timerBar.style.display = 'inline-flex';
        const remaining = Math.max(0, this.phaseDuration() - this.timerElapsedMs());
        const prefix = this.timerPaused ? '⏸ ' : '';
        this.timerBar.setText(`${prefix}${PHASE_ICON[this.timerState]} ${this.formatTime(remaining)}`);
        const other = PHASE_LABEL[this.timerState === 'investigating' ? 'acting' : 'investigating'];
        this.timerBar.setAttribute(
          'aria-label',
          `${PHASE_LABEL[this.timerState]}${this.timerPaused ? ' (paused)' : ''}\n` +
            `Click: switch to ${other}\nCtrl/middle-click: ${this.timerPaused ? 'resume' : 'pause'}`
        );
      }
    }
    this.refreshTimerView();
  }

  private refreshTimerView() {
    this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE).forEach((leaf) => {
      (leaf.view as TimerView).refresh();
    });
  }

  async openTimerPanel() {
    const existing = this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: TIMER_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private startTicking() {
    if (this.timerInterval === null) {
      this.timerInterval = window.setInterval(() => this.tick(), 1000);
    }
  }

  private stopTicking() {
    if (this.timerInterval !== null) { clearInterval(this.timerInterval); this.timerInterval = null; }
  }

  /** Fold the time spent since the clock last started into the active phase's total. */
  private accumulate() {
    if (this.timerState !== 'idle' && this.timerLastStart !== null) {
      this.timerElapsed[this.timerState] += Date.now() - this.timerLastStart;
    }
    this.timerLastStart = null;
  }

  private tick() {
    if (this.timerState === 'idle' || this.timerPaused) return;
    const phase = this.timerState;
    if (this.timerElapsedMs() >= PHASE_DURATION[phase]) {
      // Freeze the phase at its full duration but stay in it, so the other phase stays reachable
      this.timerElapsed[phase] = PHASE_DURATION[phase];
      this.timerLastStart = null;
      this.stopTicking();
      this.updateTimerBar();
      new Notice(`CyberScribe: ${PHASE_LABEL[phase]} time is up!`);
      return;
    }
    this.updateTimerBar();
  }

  startInvestigation() {
    this.stopTicking();
    this.openTimerPanel();
    this.timerState = 'investigating';
    this.timerPaused = false;
    this.timerElapsed = { investigating: 0, acting: 0 };
    this.timerLastStart = Date.now();
    this.startTicking();
    this.updateTimerBar();
  }

  /**
   * Move to `phase`, banking the time spent in the current one. Both directions are allowed,
   * and each phase resumes from its own remaining time rather than restarting from scratch.
   */
  switchPhase(phase: TimerPhase) {
    if (this.timerState === 'idle' || this.timerState === phase) return;
    this.accumulate();
    this.timerState = phase;
    this.timerPaused = false;
    if (this.timerElapsed[phase] >= PHASE_DURATION[phase]) {
      // Target phase is already spent — hold it at 00:00 instead of counting past its limit
      this.stopTicking();
    } else {
      this.timerLastStart = Date.now();
      this.startTicking();
    }
    this.updateTimerBar();
  }

  /** Switch to whichever phase is not currently active. */
  togglePhase() {
    if (this.timerState === 'idle') return;
    this.switchPhase(this.timerState === 'investigating' ? 'acting' : 'investigating');
  }

  togglePause() {
    // An expired phase has nothing left to pause or resume
    if (this.timerState === 'idle' || this.phaseExpired()) return;
    if (this.timerPaused) {
      this.timerPaused = false;
      this.timerLastStart = Date.now();
      this.startTicking();
    } else {
      this.accumulate();
      this.timerPaused = true;
      this.stopTicking();
    }
    this.updateTimerBar();
  }

  resetTimer() {
    this.stopTicking();
    this.timerState = 'idle';
    this.timerPaused = false;
    this.timerElapsed = { investigating: 0, acting: 0 };
    this.timerLastStart = null;
    this.updateTimerBar();
  }

  private inTimerScope(file: { path: string } | null): boolean {
    if (!file) return false;
    const folder = this.settings.timerFolder.trim().replace(/\/+$/, '');
    if (!folder) return true;
    return file.path.startsWith(folder + '/');
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerEditorExtension(this.buildEditorExtensions());
    this.registerMarkdownPostProcessor(this.processReadingView.bind(this));
    this.app.workspace.detachLeavesOfType(TIMER_VIEW_TYPE);
    this.registerView(TIMER_VIEW_TYPE, (leaf) => new TimerView(leaf, this));
    this.addRibbonIcon('clock', 'Open investigation timer', () => this.openTimerPanel());
    this.addCommand({
      id: 'open-timer-panel',
      name: 'Open investigation timer panel',
      callback: () => this.openTimerPanel(),
    });

    // ── Commands ─────────────────────────────────────────────────────────────

    this.addCommand({
      id: 'process-date-tokens',
      name: 'Process date tokens in note',
      editorCallback: (editor: Editor) => {
        const tokens = [
          { pattern: /<\$ datetime-now \$>/g, value: utcDateTimeString },
          { pattern: /<\$ date-now \$>/g,     value: utcDateString },
        ];
        const content = editor.getValue();
        const changes: { from: number; to: number; text: string }[] = [];

        // Snapshot one timestamp per token type so all replacements share the same instant
        for (const { pattern, value } of tokens) {
          const snapshot = value();
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(content)) !== null) {
            if (m[0].length === 0) { pattern.lastIndex++; continue; }
            changes.push({ from: m.index, to: m.index + m[0].length, text: snapshot });
          }
        }

        if (!changes.length) return;
        // Apply in reverse order so earlier positions stay valid (#13/#26 — avoids setValue)
        changes.sort((a, b) => b.from - a.from);
        for (const { from, to, text } of changes) {
          editor.replaceRange(text, editor.offsetToPos(from), editor.offsetToPos(to));
        }
      },
    });

    this.addCommand({
      id: 'insert-date',
      name: 'Insert current date',
      editorCallback: (editor: Editor) => {
        editor.replaceSelection(utcDateString());
      },
    });

    this.addCommand({
      id: 'insert-datetime',
      name: 'Insert current datetime',
      editorCallback: (editor: Editor) => {
        editor.replaceSelection(utcDateTimeString());
      },
    });

    this.addCommand({
      id: 'convert-timestamps',
      name: 'Convert local timestamps to UTC (selection or whole note)',
      editorCallback: (editor: Editor) => {
        const tc = this.settings.timeConvert;
        if (!tc.enabled) { new Notice('CyberScribe: Time conversion is disabled in settings'); return; }
        const sel = editor.getSelection();
        const input = sel || editor.getValue();
        const converted = convertTimestamps(input, parseTimezoneOffset(tc.timezoneOffset));
        if (converted === input) { new Notice('CyberScribe: No timestamp patterns found'); return; }
        if (sel) editor.replaceSelection(converted);
        else editor.setValue(converted);
        new Notice('CyberScribe: Timestamps converted to UTC');
      },
    });

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
        const text = evt.clipboardData?.getData('text/plain');
        // Guard: empty or missing means non-text content (e.g. image) — don't swallow it (#22)
        if (!text) return;

        let result = text;
        const tc = this.settings.timeConvert;

        if (tc.enabled) {
          const docText = editor.getValue();
          const cursorOffset = editor.posToOffset(editor.getCursor());
          const scopeRanges = getScopeRanges(docText, tc.scopeStart, tc.scopeEnd);
          const inScope = scopeRanges.some((r) => cursorOffset >= r.from && cursorOffset <= r.to);
          if (inScope) {
            const converted = convertTimestamps(result, parseTimezoneOffset(tc.timezoneOffset));
            if (converted !== result) {
              result = converted;
              new Notice('CyberScribe: Timestamps converted to UTC');
            }
          }
        }

        if (this.settings.plainTextPaste || result !== text) {
          evt.preventDefault();
          editor.replaceSelection(result);
        }
      })
    );

    // ── Timer ────────────────────────────────────────────────────────────────

    // Track notes that were empty when opened so we can start the timer on first content
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.settings.timerEnabled) return;
        this.app.vault.read(file).then((content) => {
          if (content.trim() === '') {
            this.emptyOnOpen.add(file.path);
          } else {
            this.emptyOnOpen.delete(file.path);
          }
        });
      })
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.timerEnabled || this.timerState !== 'idle') return;
        if (!this.emptyOnOpen.has(file.path)) return;
        if (!this.inTimerScope(file)) return;
        this.emptyOnOpen.delete(file.path);
        this.startInvestigation();
      })
    );

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (!file.path || !file.path.endsWith('.md')) return;
        this.emptyOnOpen.add(file.path);
      })
    );

    this.addCommand({
      id: 'investigation-start',
      name: 'Investigation: Start timer',
      callback: () => {
        if (this.timerState === 'idle') this.startInvestigation();
      },
    });

    this.addCommand({
      id: 'investigation-switch-phase',
      name: 'Investigation: Switch between Investigation and Taking Action',
      callback: () => {
        if (this.timerState === 'idle') { new Notice('CyberScribe: No active investigation'); return; }
        this.togglePhase();
      },
    });

    this.addCommand({
      id: 'investigation-toggle-pause',
      name: 'Investigation: Pause / resume timer',
      callback: () => {
        if (this.timerState === 'idle') { new Notice('CyberScribe: No active investigation'); return; }
        if (this.phaseExpired()) { new Notice('CyberScribe: This phase has already finished'); return; }
        this.togglePause();
      },
    });

    this.addCommand({
      id: 'investigation-reset',
      name: 'Investigation: Reset timer',
      callback: () => this.resetTimer(),
    });

    this.timerBar = this.addStatusBarItem();
    this.timerBar.addClass('cyberscribe-timer');
    // Click switches phase; ctrl/cmd- or middle-click pauses without leaving the phase
    this.timerBar.addEventListener('click', (evt: MouseEvent) => {
      if (evt.ctrlKey || evt.metaKey) this.togglePause();
      else this.togglePhase();
    });
    this.timerBar.addEventListener('auxclick', (evt: MouseEvent) => {
      if (evt.button === 1) { evt.preventDefault(); this.togglePause(); }
    });
    this.updateTimerBar();
  }

  onunload() {
    if (this.timerInterval !== null) clearInterval(this.timerInterval);
    this.app.workspace.detachLeavesOfType(TIMER_VIEW_TYPE);
  }

  buildEditorExtensions() {
    // ── Live Preview coloring ────────────────────────────────────────────────

    const buildDecorations = (view: EditorView): DecorationSet => {
      const rules = this.settings.colorRules.filter((r) => r.enabled && r.regex);
      const hits: { from: number; to: number; color: string }[] = [];

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const rule of rules) {
          let re: RegExp;
          try { re = new RegExp(rule.regex, 'g'); } catch { continue; }
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            // Guard zero-width match to prevent infinite loop (#27)
            if (m[0].length === 0) { re.lastIndex++; continue; }
            hits.push({ from: from + m.index, to: from + m.index + m[0].length, color: rule.color });
          }
        }
      }

      hits.sort((a, b) => a.from - b.from);
      const builder = new RangeSetBuilder<Decoration>();
      let cursor = 0;
      for (const { from, to, color } of hits) {
        if (from >= cursor) {
          builder.add(from, to, Decoration.mark({ attributes: { style: `color:${color};font-weight:600` } }));
          cursor = to;
        }
      }
      return builder.finish();
    };

    const colorPlugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) { this.decorations = buildDecorations(view); }
        update(u: ViewUpdate) {
          // Rebuild on doc/viewport change OR when settings were saved (#19)
          if (
            u.docChanged ||
            u.viewportChanged ||
            u.transactions.some((tr) => tr.effects.some((e) => e.is(settingsChangedEffect)))
          ) {
            this.decorations = buildDecorations(u.view);
          }
        }
      },
      { decorations: (v) => v.decorations }
    );

    // ── Auto-defang on type ──────────────────────────────────────────────────

    const defangListener = EditorView.updateListener.of((u: ViewUpdate) => {
      if (!u.docChanged) return;
      if (u.transactions.some((tr) => tr.annotation(defangTx))) return;

      const docText = u.state.doc.toString();
      const scopeRanges = getScopeRanges(
        docText,
        this.settings.defang.scopeStart,
        this.settings.defang.scopeEnd
      );

      function inScope(from: number, to: number): boolean {
        return scopeRanges.some((r) => from >= r.from && to <= r.to);
      }

      const changes: { from: number; to: number; insert: string }[] = [];
      const taken: { from: number; to: number }[] = [];

      function overlaps(from: number, to: number): boolean {
        return taken.some((r) => r.from < to && r.to > from);
      }

      // URLs first (contain domains/emails), then emails (contain domains), then IPs, then domains
      const types: Array<['urls' | 'emails' | 'ips' | 'domains', DefangRule]> = [
        ['urls',    this.settings.defang.urls],
        ['emails',  this.settings.defang.emails],
        ['ips',     this.settings.defang.ips],
        ['domains', this.settings.defang.domains],
      ];

      u.changes.iterChangedRanges((_fa, _ta, fb, tb) => {
        const lo = Math.max(0, fb - 100);
        const hi = Math.min(u.state.doc.length, tb + 100);
        const text = u.state.doc.sliceString(lo, hi);

        for (const [type, rule] of types) {
          if (!rule.enabled || !rule.regex) continue;
          let re: RegExp;
          try { re = new RegExp(rule.regex, 'g'); } catch { continue; }
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            // Guard zero-width match (#27)
            if (m[0].length === 0) { re.lastIndex++; continue; }
            const abs = lo + m.index;
            const absEnd = abs + m[0].length;
            if (!inScope(abs, absEnd) || overlaps(abs, absEnd) || isDefanged(m[0], type)) continue;
            taken.push({ from: abs, to: absEnd });
            changes.push({ from: abs, to: absEnd, insert: defangText(m[0], type) });
          }
        }
      });

      if (!changes.length) return;
      changes.sort((a, b) => b.from - a.from);
      u.view.dispatch({ changes, annotations: defangTx.of(true) });
    });

    // ── Date token replacement ────────────────────────────────────────────────

    const DATE_TOKENS = [
      { pattern: /<\$ datetime-now \$>/g, value: utcDateTimeString },
      { pattern: /<\$ date-now \$>/g,     value: utcDateString },
    ];

    const dateListener = EditorView.updateListener.of((u: ViewUpdate) => {
      if (!u.docChanged) return;
      if (!this.settings.dateTokens) return;
      if (u.transactions.some((tr) => tr.annotation(dateTx))) return;

      const changes: { from: number; to: number; insert: string }[] = [];

      u.changes.iterChangedRanges((_fa, _ta, fb, tb) => {
        const lo = Math.max(0, fb - 30);
        const hi = Math.min(u.state.doc.length, tb + 30);
        const text = u.state.doc.sliceString(lo, hi);

        for (const { pattern, value } of DATE_TOKENS) {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          // Date token patterns are fixed literals — zero-width guard included for safety (#27)
          while ((m = pattern.exec(text)) !== null) {
            if (m[0].length === 0) { pattern.lastIndex++; continue; }
            changes.push({ from: lo + m.index, to: lo + m.index + m[0].length, insert: value() });
          }
        }
      });

      if (!changes.length) return;
      changes.sort((a, b) => b.from - a.from);
      u.view.dispatch({ changes, annotations: dateTx.of(true) });
    });

    return [colorPlugin, defangListener, dateListener];
  }

  // ── Reading View coloring ─────────────────────────────────────────────────

  processReadingView(el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const rules = this.settings.colorRules.filter((r) => r.enabled && r.regex);
    if (!rules.length) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);

    for (const node of nodes) {
      // Skip text inside code blocks, pre, and links (#17)
      if (isInsideCodeOrLink(node)) continue;

      const text = node.nodeValue ?? '';
      const spans = buildSpans(text, rules);
      if (spans.length === 1 && !spans[0].color) continue;

      const frag = document.createDocumentFragment();
      for (const { text: t, color } of spans) {
        if (color) {
          const s = document.createElement('span');
          s.style.color = color;
          s.classList.add('cyberscribe-highlight');
          s.textContent = t;
          frag.appendChild(s);
        } else {
          frag.appendChild(document.createTextNode(t));
        }
      }
      node.parentNode?.replaceChild(frag, node);
    }
  }

  // ── Settings persistence ──────────────────────────────────────────────────

  async loadSettings() {
    const saved = (await this.loadData()) ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      plainTextPaste: saved.plainTextPaste ?? DEFAULT_SETTINGS.plainTextPaste,
      dateTokens:     saved.dateTokens     ?? DEFAULT_SETTINGS.dateTokens,
      timerEnabled:   saved.timerEnabled   ?? DEFAULT_SETTINGS.timerEnabled,
      timerFolder:    saved.timerFolder    ?? DEFAULT_SETTINGS.timerFolder,
      // Sanitize saved color rules — guard against missing/invalid fields from old versions (#10)
      colorRules: ((saved.colorRules ?? []) as Record<string, unknown>[]).map((r) => ({
        id:      typeof r.id      === 'string'  ? r.id      : (crypto.randomUUID?.() ?? Math.random().toString(36)),
        regex:   typeof r.regex   === 'string'  ? r.regex   : '',
        color:   (VALID_COLORS as Set<string>).has(r.color as string) ? (r.color as typeof FLAT_COLORS[number]['value']) : FLAT_COLORS[0].value,
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      })),
      defang: {
        ips:        { ...DEFAULT_SETTINGS.defang.ips,     ...(saved.defang?.ips     ?? {}) },
        domains:    { ...DEFAULT_SETTINGS.defang.domains, ...(saved.defang?.domains ?? {}) },
        emails:     { ...DEFAULT_SETTINGS.defang.emails,  ...(saved.defang?.emails  ?? {}) },
        urls:       { ...DEFAULT_SETTINGS.defang.urls,    ...(saved.defang?.urls    ?? {}) },
        scopeStart: saved.defang?.scopeStart ?? '',
        scopeEnd:   saved.defang?.scopeEnd   ?? '',
      },
      timeConvert: {
        enabled:        saved.timeConvert?.enabled        ?? false,
        timezoneOffset: saved.timeConvert?.timezoneOffset ?? '+0',
        scopeStart:     saved.timeConvert?.scopeStart     ?? '',
        scopeEnd:       saved.timeConvert?.scopeEnd       ?? '',
      },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Push settingsChangedEffect to all open CM6 editors to trigger decoration rebuild (#19)
    this.app.workspace.iterateAllLeaves((leaf) => {
      const cm = (leaf.view as { editor?: { cm?: EditorView } }).editor?.cm;
      if (cm) cm.dispatch({ effects: settingsChangedEffect.of() });
    });
  }
}

// ─── Reading view span builder ────────────────────────────────────────────────

function buildSpans(text: string, rules: ColorRule[]): { text: string; color: string | null }[] {
  const hits: { start: number; end: number; color: string }[] = [];

  for (const rule of rules) {
    let re: RegExp;
    try { re = new RegExp(rule.regex, 'g'); } catch { continue; }
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Guard zero-width match to prevent infinite loop (#27)
      if (m[0].length === 0) { re.lastIndex++; continue; }
      hits.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
    }
  }

  if (!hits.length) return [{ text, color: null }];

  // Sort by start position; on equal start, first rule (earlier in array) wins (#16)
  hits.sort((a, b) => a.start - b.start || 0);
  const out: { text: string; color: string | null }[] = [];
  let pos = 0, cursor = 0;
  for (const { start, end, color } of hits) {
    if (start < cursor) continue;
    if (pos < start) out.push({ text: text.slice(pos, start), color: null });
    out.push({ text: text.slice(start, end), color });
    pos = cursor = end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), color: null });
  return out;
}

// ─── Timer Panel View ─────────────────────────────────────────────────────────

class TimerView extends ItemView {
  private phaseEl: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;
  private btnEl: HTMLElement | null = null;
  private lastRenderedState = '';

  constructor(leaf: WorkspaceLeaf, private plugin: CyberScribe) {
    super(leaf);
  }

  getViewType()    { return TIMER_VIEW_TYPE; }
  getDisplayText() { return 'Investigation Timer'; }
  getIcon()        { return 'clock'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('cs-timer-panel');

    new Setting(contentEl)
      .setName('Investigation timer')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.timerEnabled).onChange(async (v) => {
          this.plugin.settings.timerEnabled = v;
          if (!v) this.plugin.resetTimer();
          await this.plugin.saveSettings();
          this.plugin.updateTimerBar();
        })
      );

    this.phaseEl = contentEl.createDiv('cs-timer-phase');
    this.timeEl  = contentEl.createDiv('cs-timer-time');
    this.btnEl   = contentEl.createDiv('cs-timer-buttons');
    this.refresh();
  }

  refresh() {
    if (!this.phaseEl || !this.timeEl || !this.btnEl) return;

    const { timerState: state, settings } = this.plugin;

    if (!settings.timerEnabled) {
      this.phaseEl.setText('Timer disabled');
      this.timeEl.setText('');
      if (this.lastRenderedState !== 'disabled') {
        this.lastRenderedState = 'disabled';
        this.btnEl.empty();
      }
      return;
    }

    const paused  = this.plugin.timerPaused;
    const expired = this.plugin.phaseExpired();

    if (state === 'idle') {
      this.phaseEl.setText('No active investigation');
      this.timeEl.setText('–');
    } else {
      const remaining = Math.max(0, this.plugin.phaseDuration() - this.plugin.timerElapsedMs());
      const suffix = paused ? '  (paused)' : expired ? '  (time up)' : '';
      this.phaseEl.setText(`${PHASE_ICON[state]}  ${PHASE_LABEL[state]}${suffix}`);
      this.timeEl.setText(this.plugin.formatTime(remaining));
    }
    // Dim the countdown while paused so the stopped clock is obvious at a glance
    this.timeEl.style.opacity = paused ? '0.5' : '1';

    // Buttons only need rebuilding when something they depend on changes
    const key = `${state}|${paused}|${expired}`;
    if (key !== this.lastRenderedState) {
      this.lastRenderedState = key;
      this.btnEl.empty();
      if (state === 'idle') {
        const btn = this.btnEl.createEl('button', { text: 'Start Investigation', cls: 'mod-cta cs-timer-btn' });
        btn.addEventListener('click', () => this.plugin.startInvestigation());
      } else {
        const target: TimerPhase = state === 'investigating' ? 'acting' : 'investigating';
        const swap = this.btnEl.createEl('button', {
          text: `${PHASE_ICON[target]}  ${PHASE_LABEL[target]}`,
          cls: 'mod-cta cs-timer-btn',
        });
        swap.addEventListener('click', () => this.plugin.switchPhase(target));

        if (!expired) {
          const pause = this.btnEl.createEl('button', {
            text: paused ? '▶  Resume' : '⏸  Pause',
            cls: 'cs-timer-btn',
          });
          pause.addEventListener('click', () => this.plugin.togglePause());
        }

        const rst = this.btnEl.createEl('button', { text: 'Reset', cls: 'mod-warning cs-timer-btn' });
        rst.addEventListener('click', () => this.plugin.resetTimer());
      }
    }
  }

  async onClose() {}
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: CyberScribe) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('CyberScribe').setHeading();

    new Setting(containerEl)
      .setName('Paste as plain text')
      .setDesc("Strip all formatting when pasting. Overrides Obsidian's default paste behaviour.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.plainTextPaste).onChange(async (v) => {
          this.plugin.settings.plainTextPaste = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Date tokens')
      .setDesc('Auto-replace date-now tokens with today\'s date and datetime-now tokens with the current UTC timestamp.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.dateTokens).onChange(async (v) => {
          this.plugin.settings.dateTokens = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Investigation timer')
      .setDesc('Auto-start a 45-minute countdown when content is pasted into an empty note. Click the status bar item to switch between Investigation and Taking Action; ctrl- or middle-click to pause.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.timerEnabled).onChange(async (v) => {
          this.plugin.settings.timerEnabled = v;
          if (!v) this.plugin.resetTimer();
          await this.plugin.saveSettings();
          this.plugin.updateTimerBar();
        })
      );

    new Setting(containerEl)
      .setName('Investigation timer folder')
      .setDesc('Only auto-start the timer for notes inside this folder (e.g. Investigations). Leave blank to apply vault-wide.')
      .addText((t) =>
        t
          .setPlaceholder('e.g. Investigations')
          .setValue(this.plugin.settings.timerFolder)
          .onChange(async (v) => {
            this.plugin.settings.timerFolder = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Color Rules ──────────────────────────────────────────────────────────

    new Setting(containerEl)
      .setName('Color rules')
      .setDesc('Highlight matched text in the editor and reading view. Up to 12 rules.')
      .setHeading();

    const rules = this.plugin.settings.colorRules;

    for (const rule of rules) {
      const colorMeta = FLAT_COLORS.find((c) => c.value === rule.color) ?? FLAT_COLORS[0];
      let swatch: HTMLElement;

      new Setting(containerEl)
        .addText((t) =>
          t
            .setPlaceholder('Regex pattern, e.g. ---OODA---')
            .setValue(rule.regex)
            .onChange(async (v) => { rule.regex = v; await this.plugin.saveSettings(); })
        )
        .addDropdown((d) => {
          FLAT_COLORS.forEach((c) => d.addOption(c.value, c.name));
          // Don't call display() on color change — update swatch in-place to preserve scroll (#24)
          d.setValue(rule.color).onChange((v) => {
            rule.color = v;
            void this.plugin.saveSettings();
            if (swatch) swatch.style.background = v;
          });
        })
        .addToggle((t) =>
          t.setValue(rule.enabled).onChange(async (v) => { rule.enabled = v; await this.plugin.saveSettings(); })
        )
        .addButton((b) =>
          // Use rule.id to find the rule rather than captured index to avoid race on double-click (#25)
          b.setButtonText('✕').setWarning().onClick(async () => {
            const idx = rules.findIndex((r) => r.id === rule.id);
            if (idx !== -1) rules.splice(idx, 1);
            await this.plugin.saveSettings();
            this.display();
          })
        )
        .then((s) => {
          swatch = s.controlEl.createEl('span', {
            attr: {
              style: `display:inline-block;width:14px;height:14px;border-radius:50%;background:${rule.color};margin-left:6px;vertical-align:middle;`,
              title: colorMeta.name,
            },
          });
        });
    }

    if (rules.length < 12) {
      new Setting(containerEl).addButton((b) =>
        b.setButtonText('+ Add rule').setCta().onClick(async () => {
          rules.push({
            id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
            regex: '',
            color: FLAT_COLORS[rules.length % FLAT_COLORS.length].value,
            enabled: true,
          });
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }

    // ── Defang Rules ─────────────────────────────────────────────────────────

    new Setting(containerEl)
      .setName('Auto-defang')
      .setDesc('Automatically rewrites matching IOCs as you type. Modifies file content.')
      .setHeading();

    new Setting(containerEl)
      .setName('Scope')
      .setDesc('Limit defanging to the region between two regex markers. Leave blank to apply to the whole note.')
      .setHeading();

    new Setting(containerEl)
      .setName('Scope start')
      .setDesc('Defang begins after the first match of this regex')
      .addText((t) =>
        t
          .setPlaceholder('e.g.  ---IOC-START---')
          .setValue(this.plugin.settings.defang.scopeStart)
          .onChange(async (v) => { this.plugin.settings.defang.scopeStart = v; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl)
      .setName('Scope end')
      .setDesc('Defang stops before the first match of this regex after the start')
      .addText((t) =>
        t
          .setPlaceholder('e.g.  ---IOC-END---')
          .setValue(this.plugin.settings.defang.scopeEnd)
          .onChange(async (v) => { this.plugin.settings.defang.scopeEnd = v; await this.plugin.saveSettings(); })
      );

    new Setting(containerEl).setName('IOC types').setHeading();

    const defangEntries: Array<[keyof Pick<PluginSettings['defang'], 'ips' | 'domains' | 'emails' | 'urls'>, string, string]> = [
      ['urls',    'URLs',         'https://evil.com  →  hxxps://evil.com'],
      ['ips',     'IP addresses', '1.2.3.4  →  1[.]2[.]3[.]4'],
      ['domains', 'Domains',      'evil.sh  →  evil[.]sh'],
      ['emails',  'Emails',       'a@evil.com  →  a[@]evil[.]com'],
    ];

    for (const [key, name, example] of defangEntries) {
      const rule = this.plugin.settings.defang[key];
      new Setting(containerEl)
        .setName(name)
        .setDesc(example)
        .addText((t) =>
          t
            .setValue(rule.regex)
            .onChange(async (v) => { rule.regex = v; await this.plugin.saveSettings(); })
        )
        .addToggle((t) =>
          t.setValue(rule.enabled).onChange(async (v) => { rule.enabled = v; await this.plugin.saveSettings(); })
        );
    }

    // ── Local time → UTC conversion ──────────────────────────────────────────

    new Setting(containerEl)
      .setName('Local time → UTC conversion')
      .setDesc('On paste, convert timestamps like "May 27, 2026 12:17 PM" to UTC. Original time is kept in brackets.')
      .setHeading();

    new Setting(containerEl)
      .setName('Enable')
      .setDesc('Convert local timestamps to UTC when pasting.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.timeConvert.enabled).onChange(async (v) => {
          this.plugin.settings.timeConvert.enabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Local timezone')
      .setDesc('UTC offset of the source timestamps. Examples: +8 for UTC+8, -5 for UTC-5, +5:30 for IST.')
      .addText((t) =>
        t
          .setPlaceholder('+8')
          .setValue(this.plugin.settings.timeConvert.timezoneOffset)
          .onChange(async (v) => {
            this.plugin.settings.timeConvert.timezoneOffset = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Scope')
      .setDesc('Limit conversion to the region between two regex markers. Leave blank to apply to the whole note.')
      .setHeading();

    new Setting(containerEl)
      .setName('Scope start')
      .setDesc('Conversion applies only after the first match of this regex.')
      .addText((t) =>
        t
          .setPlaceholder('e.g.  ---EVENTS-START---')
          .setValue(this.plugin.settings.timeConvert.scopeStart)
          .onChange(async (v) => {
            this.plugin.settings.timeConvert.scopeStart = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Scope end')
      .setDesc('Conversion stops before the first match of this regex after the start.')
      .addText((t) =>
        t
          .setPlaceholder('e.g.  ---EVENTS-END---')
          .setValue(this.plugin.settings.timeConvert.scopeEnd)
          .onChange(async (v) => {
            this.plugin.settings.timeConvert.scopeEnd = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
