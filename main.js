var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CyberScribe
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var FLAT_COLORS = [
  { name: "Red", value: "#e74c3c" },
  { name: "Orange", value: "#e67e22" },
  { name: "Yellow", value: "#f1c40f" },
  { name: "Green", value: "#2ecc71" },
  { name: "Teal", value: "#1abc9c" },
  { name: "Blue", value: "#3498db" },
  { name: "Purple", value: "#9b59b6" },
  { name: "Pink", value: "#fd79a8" },
  { name: "Crimson", value: "#c0392b" },
  { name: "Lime", value: "#a8e063" },
  { name: "Cyan", value: "#00cec9" },
  { name: "Indigo", value: "#6c5ce7" }
];
var VALID_COLORS = new Set(FLAT_COLORS.map((c) => c.value));
var INVESTIGATION_DURATION = 45 * 60 * 1e3;
var ACTION_DURATION = 20 * 60 * 1e3;
var TIMER_VIEW_TYPE = "cyberscribe-timer";
var DEFAULT_SETTINGS = {
  colorRules: [],
  plainTextPaste: false,
  dateTokens: true,
  timerEnabled: true,
  timerFolder: "",
  defang: {
    ips: {
      regex: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b`,
      enabled: true
    },
    domains: {
      regex: String.raw`\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|sh|gov|edu|co|uk|de|fr|ru|cn|jp|au|ca|info|biz|xyz|top|site|online|tech|me|tv|cc|app|dev|mil|int|us|in|br|nl|se|no|fi|dk|pl|ch|at|be|nz|sg|hk|tw|kr|za|mx|ar|cl|pe|ph|id|th|vn|pk|bd|ng|ke|eg|ma|dz|tn|ly|sd|gh|tz|ci|cm|sn|ug|zm|zw)\b`,
      enabled: true
    },
    emails: {
      regex: String.raw`\b[a-zA-Z0-9._%+\-]+@(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}\b`,
      enabled: true
    },
    urls: {
      regex: String.raw`https?://[^\s<>"'\]]+`,
      enabled: true
    },
    scopeStart: "",
    scopeEnd: ""
  },
  timeConvert: {
    enabled: false,
    timezoneOffset: "+0",
    scopeStart: "",
    scopeEnd: ""
  }
};
var settingsChangedEffect = import_state.StateEffect.define();
var defangTx = import_state.Annotation.define();
var dateTx = import_state.Annotation.define();
function getScopeRanges(docText, scopeStart, scopeEnd) {
  const len = docText.length;
  if (!scopeStart && !scopeEnd)
    return [{ from: 0, to: len }];
  let startRe = null;
  let endRe = null;
  try {
    if (scopeStart)
      startRe = new RegExp(scopeStart, "g");
  } catch (e) {
  }
  try {
    if (scopeEnd)
      endRe = new RegExp(scopeEnd, "g");
  } catch (e) {
  }
  if (scopeStart && !startRe && scopeEnd && !endRe)
    return [{ from: 0, to: len }];
  if (!startRe && endRe) {
    const m = safeExec(endRe, docText);
    return [{ from: 0, to: m ? m.index : len }];
  }
  if (startRe && !endRe) {
    const m = safeExec(startRe, docText);
    return m ? [{ from: m.index + m[0].length, to: len }] : [];
  }
  const ranges = [];
  let sm;
  while ((sm = safeExec(startRe, docText)) !== null) {
    if (sm[0].length === 0) {
      startRe.lastIndex++;
      continue;
    }
    const from = sm.index + sm[0].length;
    endRe.lastIndex = from;
    const em = safeExec(endRe, docText);
    if (em) {
      if (em[0].length === 0)
        endRe.lastIndex++;
      ranges.push({ from, to: em.index });
      startRe.lastIndex = Math.max(startRe.lastIndex, em.index + em[0].length);
    } else {
      ranges.push({ from, to: len });
      break;
    }
  }
  return ranges;
}
function safeExec(re, text) {
  const m = re.exec(text);
  if (m && m[0].length === 0)
    re.lastIndex++;
  return m;
}
function defangText(text, type) {
  if (type === "urls") {
    return text.replace(/^https?/i, (m) => m.replace(/http/i, "hxxp"));
  }
  if (type === "ips" || type === "domains") {
    return text.replace(/\./g, "[.]");
  }
  const atIdx = text.lastIndexOf("@");
  if (atIdx === -1)
    return text;
  return text.slice(0, atIdx) + "[@]" + text.slice(atIdx + 1).replace(/\./g, "[.]");
}
function isDefanged(text, type) {
  if (type === "urls")
    return /^hxxps?:\/\//i.test(text);
  return text.includes("[.]") || text.includes("[@]") || /hxxps?:\/\//i.test(text);
}
function utcDateString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}
function utcDateTimeString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  return `${date} ${time} UTC`;
}
function isInsideCodeOrLink(node) {
  let p = node.parentElement;
  while (p) {
    const tag = p.tagName.toLowerCase();
    if (tag === "code" || tag === "pre" || tag === "a")
      return true;
    p = p.parentElement;
  }
  return false;
}
var MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};
function parseTimezoneOffset(tz) {
  const s = tz.trim().replace(/^UTC/i, "");
  const m = s.match(/^([+-]?)(\d{1,2})(?::(\d{2}))?$/);
  if (!m)
    return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 60 : 0));
}
function formatOffset(offsetHours) {
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs);
  const mins = Math.round((abs - h) * 60);
  return mins > 0 ? `UTC${sign}${h}:${String(mins).padStart(2, "0")}` : `UTC${sign}${h}`;
}
function convertTimestamps(text, offsetHours) {
  const pad = (n) => String(n).padStart(2, "0");
  const tzLabel = formatOffset(offsetHours);
  const re = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\b/gi;
  return text.replace(re, (match, monthStr, dayStr, yearStr, hourStr, minStr, _secStr, ampm) => {
    var _a;
    const month = (_a = MONTH_INDEX[monthStr.slice(0, 3).toLowerCase()]) != null ? _a : 0;
    let hour = parseInt(hourStr);
    const min = parseInt(minStr);
    if (ampm.toUpperCase() === "AM") {
      if (hour === 12)
        hour = 0;
    } else {
      if (hour !== 12)
        hour += 12;
    }
    const utcMs = Date.UTC(parseInt(yearStr), month, parseInt(dayStr), hour, min) - Math.round(offsetHours * 60) * 6e4;
    const d = new Date(utcMs);
    const utcStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    return `${utcStr} (${match} ${tzLabel})`;
  });
}
var CyberScribe = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.timerState = "idle";
    this.timerElapsedAccum = 0;
    this.timerLastStart = null;
    this.timerInterval = null;
    this.timerBar = null;
    this.emptyOnOpen = /* @__PURE__ */ new Set();
  }
  timerElapsedMs() {
    return this.timerElapsedAccum + (this.timerLastStart !== null ? Date.now() - this.timerLastStart : 0);
  }
  formatTime(ms) {
    const s = Math.floor(ms / 1e3);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  updateTimerBar() {
    if (this.timerBar) {
      if (!this.settings.timerEnabled || this.timerState === "idle") {
        this.timerBar.style.display = "none";
      } else {
        this.timerBar.style.display = "inline-flex";
        const duration = this.timerState === "investigating" ? INVESTIGATION_DURATION : ACTION_DURATION;
        const remaining = Math.max(0, duration - this.timerElapsedMs());
        const icon = this.timerState === "investigating" ? "\u{1F50D}" : "\u270F\uFE0F";
        this.timerBar.setText(`${icon} ${this.formatTime(remaining)}`);
      }
    }
    this.refreshTimerView();
  }
  refreshTimerView() {
    this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE).forEach((leaf) => {
      leaf.view.refresh();
    });
  }
  async openTimerPanel() {
    const existing = this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: TIMER_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
  startInvestigation() {
    this.timerState = "investigating";
    this.timerElapsedAccum = 0;
    this.timerLastStart = Date.now();
    this.timerInterval = window.setInterval(() => {
      if (this.timerElapsedMs() >= INVESTIGATION_DURATION) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.timerElapsedAccum = INVESTIGATION_DURATION;
        this.timerLastStart = null;
        this.updateTimerBar();
        new import_obsidian.Notice("CyberScribe: Investigation time is up!");
        return;
      }
      this.updateTimerBar();
    }, 1e3);
    this.updateTimerBar();
  }
  handleTimerClick() {
    if (this.timerState === "investigating") {
      if (this.timerInterval !== null) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.timerState = "acting";
      this.timerElapsedAccum = 0;
      this.timerLastStart = Date.now();
      this.timerInterval = window.setInterval(() => {
        if (this.timerElapsedMs() >= ACTION_DURATION) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
          this.timerElapsedAccum = ACTION_DURATION;
          this.timerLastStart = null;
          this.updateTimerBar();
          new import_obsidian.Notice("CyberScribe: Action time is up!");
          return;
        }
        this.updateTimerBar();
      }, 1e3);
      this.updateTimerBar();
    } else if (this.timerState === "acting") {
      this.resetTimer();
    }
  }
  resetTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerState = "idle";
    this.timerElapsedAccum = 0;
    this.timerLastStart = null;
    this.updateTimerBar();
  }
  inTimerScope(file) {
    if (!file)
      return false;
    const folder = this.settings.timerFolder.trim().replace(/\/+$/, "");
    if (!folder)
      return true;
    return file.path.startsWith(folder + "/");
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerEditorExtension(this.buildEditorExtensions());
    this.registerMarkdownPostProcessor(this.processReadingView.bind(this));
    this.app.workspace.detachLeavesOfType(TIMER_VIEW_TYPE);
    this.registerView(TIMER_VIEW_TYPE, (leaf) => new TimerView(leaf, this));
    this.addRibbonIcon("clock", "Open investigation timer", () => this.openTimerPanel());
    this.addCommand({
      id: "open-timer-panel",
      name: "Open investigation timer panel",
      callback: () => this.openTimerPanel()
    });
    this.addCommand({
      id: "process-date-tokens",
      name: "Process date tokens in note",
      editorCallback: (editor) => {
        const tokens = [
          { pattern: /<\$ datetime-now \$>/g, value: utcDateTimeString },
          { pattern: /<\$ date-now \$>/g, value: utcDateString }
        ];
        const content = editor.getValue();
        const changes = [];
        for (const { pattern, value } of tokens) {
          const snapshot = value();
          pattern.lastIndex = 0;
          let m;
          while ((m = pattern.exec(content)) !== null) {
            if (m[0].length === 0) {
              pattern.lastIndex++;
              continue;
            }
            changes.push({ from: m.index, to: m.index + m[0].length, text: snapshot });
          }
        }
        if (!changes.length)
          return;
        changes.sort((a, b) => b.from - a.from);
        for (const { from, to, text } of changes) {
          editor.replaceRange(text, editor.offsetToPos(from), editor.offsetToPos(to));
        }
      }
    });
    this.addCommand({
      id: "insert-date",
      name: "Insert current date",
      editorCallback: (editor) => {
        editor.replaceSelection(utcDateString());
      }
    });
    this.addCommand({
      id: "insert-datetime",
      name: "Insert current datetime",
      editorCallback: (editor) => {
        editor.replaceSelection(utcDateTimeString());
      }
    });
    this.addCommand({
      id: "convert-timestamps",
      name: "Convert local timestamps to UTC (selection or whole note)",
      editorCallback: (editor) => {
        const tc = this.settings.timeConvert;
        if (!tc.enabled) {
          new import_obsidian.Notice("CyberScribe: Time conversion is disabled in settings");
          return;
        }
        const sel = editor.getSelection();
        const input = sel || editor.getValue();
        const converted = convertTimestamps(input, parseTimezoneOffset(tc.timezoneOffset));
        if (converted === input) {
          new import_obsidian.Notice("CyberScribe: No timestamp patterns found");
          return;
        }
        if (sel)
          editor.replaceSelection(converted);
        else
          editor.setValue(converted);
        new import_obsidian.Notice("CyberScribe: Timestamps converted to UTC");
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => {
        var _a;
        const text = (_a = evt.clipboardData) == null ? void 0 : _a.getData("text/plain");
        if (!text)
          return;
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
              new import_obsidian.Notice("CyberScribe: Timestamps converted to UTC");
            }
          }
        }
        if (this.settings.plainTextPaste || result !== text) {
          evt.preventDefault();
          editor.replaceSelection(result);
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.settings.timerEnabled)
          return;
        this.app.vault.read(file).then((content) => {
          if (content.trim() === "") {
            this.emptyOnOpen.add(file.path);
          } else {
            this.emptyOnOpen.delete(file.path);
          }
        });
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!this.settings.timerEnabled || this.timerState !== "idle")
          return;
        if (!this.emptyOnOpen.has(file.path))
          return;
        if (!this.inTimerScope(file))
          return;
        this.emptyOnOpen.delete(file.path);
        this.startInvestigation();
      })
    );
    this.addCommand({
      id: "investigation-start",
      name: "Investigation: Start timer",
      callback: () => {
        if (this.timerState === "idle")
          this.startInvestigation();
      }
    });
    this.addCommand({
      id: "investigation-reset",
      name: "Investigation: Reset timer",
      callback: () => this.resetTimer()
    });
    this.timerBar = this.addStatusBarItem();
    this.timerBar.addClass("cyberscribe-timer");
    this.timerBar.addEventListener("click", () => this.handleTimerClick());
    this.updateTimerBar();
  }
  onunload() {
    if (this.timerInterval !== null)
      clearInterval(this.timerInterval);
    this.app.workspace.detachLeavesOfType(TIMER_VIEW_TYPE);
  }
  buildEditorExtensions() {
    const buildDecorations = (view) => {
      const rules = this.settings.colorRules.filter((r) => r.enabled && r.regex);
      const hits = [];
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const rule of rules) {
          let re;
          try {
            re = new RegExp(rule.regex, "g");
          } catch (e) {
            continue;
          }
          let m;
          while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) {
              re.lastIndex++;
              continue;
            }
            hits.push({ from: from + m.index, to: from + m.index + m[0].length, color: rule.color });
          }
        }
      }
      hits.sort((a, b) => a.from - b.from);
      const builder = new import_state.RangeSetBuilder();
      let cursor = 0;
      for (const { from, to, color } of hits) {
        if (from >= cursor) {
          builder.add(from, to, import_view.Decoration.mark({ attributes: { style: `color:${color};font-weight:600` } }));
          cursor = to;
        }
      }
      return builder.finish();
    };
    const colorPlugin = import_view.ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = buildDecorations(view);
        }
        update(u) {
          if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(settingsChangedEffect)))) {
            this.decorations = buildDecorations(u.view);
          }
        }
      },
      { decorations: (v) => v.decorations }
    );
    const defangListener = import_view.EditorView.updateListener.of((u) => {
      if (!u.docChanged)
        return;
      if (u.transactions.some((tr) => tr.annotation(defangTx)))
        return;
      const docText = u.state.doc.toString();
      const scopeRanges = getScopeRanges(
        docText,
        this.settings.defang.scopeStart,
        this.settings.defang.scopeEnd
      );
      function inScope(from, to) {
        return scopeRanges.some((r) => from >= r.from && to <= r.to);
      }
      const changes = [];
      const taken = [];
      function overlaps(from, to) {
        return taken.some((r) => r.from < to && r.to > from);
      }
      const types = [
        ["urls", this.settings.defang.urls],
        ["emails", this.settings.defang.emails],
        ["ips", this.settings.defang.ips],
        ["domains", this.settings.defang.domains]
      ];
      u.changes.iterChangedRanges((_fa, _ta, fb, tb) => {
        const lo = Math.max(0, fb - 100);
        const hi = Math.min(u.state.doc.length, tb + 100);
        const text = u.state.doc.sliceString(lo, hi);
        for (const [type, rule] of types) {
          if (!rule.enabled || !rule.regex)
            continue;
          let re;
          try {
            re = new RegExp(rule.regex, "g");
          } catch (e) {
            continue;
          }
          let m;
          while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) {
              re.lastIndex++;
              continue;
            }
            const abs = lo + m.index;
            const absEnd = abs + m[0].length;
            if (!inScope(abs, absEnd) || overlaps(abs, absEnd) || isDefanged(m[0], type))
              continue;
            taken.push({ from: abs, to: absEnd });
            changes.push({ from: abs, to: absEnd, insert: defangText(m[0], type) });
          }
        }
      });
      if (!changes.length)
        return;
      changes.sort((a, b) => b.from - a.from);
      u.view.dispatch({ changes, annotations: defangTx.of(true) });
    });
    const DATE_TOKENS = [
      { pattern: /<\$ datetime-now \$>/g, value: utcDateTimeString },
      { pattern: /<\$ date-now \$>/g, value: utcDateString }
    ];
    const dateListener = import_view.EditorView.updateListener.of((u) => {
      if (!u.docChanged)
        return;
      if (!this.settings.dateTokens)
        return;
      if (u.transactions.some((tr) => tr.annotation(dateTx)))
        return;
      const changes = [];
      u.changes.iterChangedRanges((_fa, _ta, fb, tb) => {
        const lo = Math.max(0, fb - 30);
        const hi = Math.min(u.state.doc.length, tb + 30);
        const text = u.state.doc.sliceString(lo, hi);
        for (const { pattern, value } of DATE_TOKENS) {
          pattern.lastIndex = 0;
          let m;
          while ((m = pattern.exec(text)) !== null) {
            if (m[0].length === 0) {
              pattern.lastIndex++;
              continue;
            }
            changes.push({ from: lo + m.index, to: lo + m.index + m[0].length, insert: value() });
          }
        }
      });
      if (!changes.length)
        return;
      changes.sort((a, b) => b.from - a.from);
      u.view.dispatch({ changes, annotations: dateTx.of(true) });
    });
    return [colorPlugin, defangListener, dateListener];
  }
  // ── Reading View coloring ─────────────────────────────────────────────────
  processReadingView(el, _ctx) {
    var _a, _b;
    const rules = this.settings.colorRules.filter((r) => r.enabled && r.regex);
    if (!rules.length)
      return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while (n = walker.nextNode())
      nodes.push(n);
    for (const node of nodes) {
      if (isInsideCodeOrLink(node))
        continue;
      const text = (_a = node.nodeValue) != null ? _a : "";
      const spans = buildSpans(text, rules);
      if (spans.length === 1 && !spans[0].color)
        continue;
      const frag = document.createDocumentFragment();
      for (const { text: t, color } of spans) {
        if (color) {
          const s = document.createElement("span");
          s.style.color = color;
          s.classList.add("cyberscribe-highlight");
          s.textContent = t;
          frag.appendChild(s);
        } else {
          frag.appendChild(document.createTextNode(t));
        }
      }
      (_b = node.parentNode) == null ? void 0 : _b.replaceChild(frag, node);
    }
  }
  // ── Settings persistence ──────────────────────────────────────────────────
  async loadSettings() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const saved = (_a = await this.loadData()) != null ? _a : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      plainTextPaste: (_b = saved.plainTextPaste) != null ? _b : DEFAULT_SETTINGS.plainTextPaste,
      dateTokens: (_c = saved.dateTokens) != null ? _c : DEFAULT_SETTINGS.dateTokens,
      timerEnabled: (_d = saved.timerEnabled) != null ? _d : DEFAULT_SETTINGS.timerEnabled,
      timerFolder: (_e = saved.timerFolder) != null ? _e : DEFAULT_SETTINGS.timerFolder,
      // Sanitize saved color rules — guard against missing/invalid fields from old versions (#10)
      colorRules: ((_f = saved.colorRules) != null ? _f : []).map((r) => {
        var _a2, _b2;
        return {
          id: typeof r.id === "string" ? r.id : (_b2 = (_a2 = crypto.randomUUID) == null ? void 0 : _a2.call(crypto)) != null ? _b2 : Math.random().toString(36),
          regex: typeof r.regex === "string" ? r.regex : "",
          color: VALID_COLORS.has(r.color) ? r.color : FLAT_COLORS[0].value,
          enabled: typeof r.enabled === "boolean" ? r.enabled : true
        };
      }),
      defang: {
        ips: { ...DEFAULT_SETTINGS.defang.ips, ...(_h = (_g = saved.defang) == null ? void 0 : _g.ips) != null ? _h : {} },
        domains: { ...DEFAULT_SETTINGS.defang.domains, ...(_j = (_i = saved.defang) == null ? void 0 : _i.domains) != null ? _j : {} },
        emails: { ...DEFAULT_SETTINGS.defang.emails, ...(_l = (_k = saved.defang) == null ? void 0 : _k.emails) != null ? _l : {} },
        urls: { ...DEFAULT_SETTINGS.defang.urls, ...(_n = (_m = saved.defang) == null ? void 0 : _m.urls) != null ? _n : {} },
        scopeStart: (_p = (_o = saved.defang) == null ? void 0 : _o.scopeStart) != null ? _p : "",
        scopeEnd: (_r = (_q = saved.defang) == null ? void 0 : _q.scopeEnd) != null ? _r : ""
      },
      timeConvert: {
        enabled: (_t = (_s = saved.timeConvert) == null ? void 0 : _s.enabled) != null ? _t : false,
        timezoneOffset: (_v = (_u = saved.timeConvert) == null ? void 0 : _u.timezoneOffset) != null ? _v : "+0",
        scopeStart: (_x = (_w = saved.timeConvert) == null ? void 0 : _w.scopeStart) != null ? _x : "",
        scopeEnd: (_z = (_y = saved.timeConvert) == null ? void 0 : _y.scopeEnd) != null ? _z : ""
      }
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.app.workspace.iterateAllLeaves((leaf) => {
      var _a;
      const cm = (_a = leaf.view.editor) == null ? void 0 : _a.cm;
      if (cm)
        cm.dispatch({ effects: settingsChangedEffect.of() });
    });
  }
};
function buildSpans(text, rules) {
  const hits = [];
  for (const rule of rules) {
    let re;
    try {
      re = new RegExp(rule.regex, "g");
    } catch (e) {
      continue;
    }
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      hits.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
    }
  }
  if (!hits.length)
    return [{ text, color: null }];
  hits.sort((a, b) => a.start - b.start || 0);
  const out = [];
  let pos = 0, cursor = 0;
  for (const { start, end, color } of hits) {
    if (start < cursor)
      continue;
    if (pos < start)
      out.push({ text: text.slice(pos, start), color: null });
    out.push({ text: text.slice(start, end), color });
    pos = cursor = end;
  }
  if (pos < text.length)
    out.push({ text: text.slice(pos), color: null });
  return out;
}
var TimerView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.phaseEl = null;
    this.timeEl = null;
    this.btnEl = null;
    this.lastRenderedState = "";
  }
  getViewType() {
    return TIMER_VIEW_TYPE;
  }
  getDisplayText() {
    return "Investigation Timer";
  }
  getIcon() {
    return "clock";
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("cs-timer-panel");
    new import_obsidian.Setting(contentEl).setName("Investigation timer").addToggle(
      (t) => t.setValue(this.plugin.settings.timerEnabled).onChange(async (v) => {
        this.plugin.settings.timerEnabled = v;
        if (!v)
          this.plugin.resetTimer();
        await this.plugin.saveSettings();
        this.plugin.updateTimerBar();
      })
    );
    this.phaseEl = contentEl.createDiv("cs-timer-phase");
    this.timeEl = contentEl.createDiv("cs-timer-time");
    this.btnEl = contentEl.createDiv("cs-timer-buttons");
    this.refresh();
  }
  refresh() {
    if (!this.phaseEl || !this.timeEl || !this.btnEl)
      return;
    const { timerState: state, settings } = this.plugin;
    if (!settings.timerEnabled) {
      this.phaseEl.setText("Timer disabled");
      this.timeEl.setText("");
      if (this.lastRenderedState !== "disabled") {
        this.lastRenderedState = "disabled";
        this.btnEl.empty();
      }
      return;
    }
    const duration = state === "investigating" ? INVESTIGATION_DURATION : ACTION_DURATION;
    const remaining = Math.max(0, duration - this.plugin.timerElapsedMs());
    if (state === "idle") {
      this.phaseEl.setText("No active investigation");
      this.timeEl.setText("\u2013");
    } else if (state === "investigating") {
      this.phaseEl.setText("\u{1F50D}  Investigation");
      this.timeEl.setText(this.plugin.formatTime(remaining));
    } else {
      this.phaseEl.setText("\u270F\uFE0F  Taking Action");
      this.timeEl.setText(this.plugin.formatTime(remaining));
    }
    if (state !== this.lastRenderedState) {
      this.lastRenderedState = state;
      this.btnEl.empty();
      if (state === "idle") {
        const btn = this.btnEl.createEl("button", { text: "Start Investigation", cls: "mod-cta cs-timer-btn" });
        btn.addEventListener("click", () => this.plugin.startInvestigation());
      } else if (state === "investigating") {
        const act = this.btnEl.createEl("button", { text: "Take Action  \u270F\uFE0F", cls: "cs-timer-btn" });
        act.addEventListener("click", () => this.plugin.handleTimerClick());
        const rst = this.btnEl.createEl("button", { text: "Reset", cls: "mod-warning cs-timer-btn" });
        rst.addEventListener("click", () => this.plugin.resetTimer());
      } else {
        const stop = this.btnEl.createEl("button", { text: "Stop", cls: "mod-warning cs-timer-btn" });
        stop.addEventListener("click", () => this.plugin.resetTimer());
      }
    }
  }
  async onClose() {
  }
};
var SettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    var _a;
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("CyberScribe").setHeading();
    new import_obsidian.Setting(containerEl).setName("Paste as plain text").setDesc("Strip all formatting when pasting. Overrides Obsidian's default paste behaviour.").addToggle(
      (t) => t.setValue(this.plugin.settings.plainTextPaste).onChange(async (v) => {
        this.plugin.settings.plainTextPaste = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Date tokens").setDesc("Auto-replace date-now tokens with today's date and datetime-now tokens with the current UTC timestamp.").addToggle(
      (t) => t.setValue(this.plugin.settings.dateTokens).onChange(async (v) => {
        this.plugin.settings.dateTokens = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Investigation timer").setDesc("Auto-start a 45-minute countdown when content is pasted into an empty note. Click the status bar item to switch to Taking Action (\u26A1), click again to stop.").addToggle(
      (t) => t.setValue(this.plugin.settings.timerEnabled).onChange(async (v) => {
        this.plugin.settings.timerEnabled = v;
        if (!v)
          this.plugin.resetTimer();
        await this.plugin.saveSettings();
        this.plugin.updateTimerBar();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Investigation timer folder").setDesc("Only auto-start the timer for notes inside this folder (e.g. Investigations). Leave blank to apply vault-wide.").addText(
      (t) => t.setPlaceholder("e.g. Investigations").setValue(this.plugin.settings.timerFolder).onChange(async (v) => {
        this.plugin.settings.timerFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Color rules").setDesc("Highlight matched text in the editor and reading view. Up to 12 rules.").setHeading();
    const rules = this.plugin.settings.colorRules;
    for (const rule of rules) {
      const colorMeta = (_a = FLAT_COLORS.find((c) => c.value === rule.color)) != null ? _a : FLAT_COLORS[0];
      let swatch;
      new import_obsidian.Setting(containerEl).addText(
        (t) => t.setPlaceholder("Regex pattern, e.g. ---OODA---").setValue(rule.regex).onChange(async (v) => {
          rule.regex = v;
          await this.plugin.saveSettings();
        })
      ).addDropdown((d) => {
        FLAT_COLORS.forEach((c) => d.addOption(c.value, c.name));
        d.setValue(rule.color).onChange((v) => {
          rule.color = v;
          void this.plugin.saveSettings();
          if (swatch)
            swatch.style.background = v;
        });
      }).addToggle(
        (t) => t.setValue(rule.enabled).onChange(async (v) => {
          rule.enabled = v;
          await this.plugin.saveSettings();
        })
      ).addButton(
        (b) => (
          // Use rule.id to find the rule rather than captured index to avoid race on double-click (#25)
          b.setButtonText("\u2715").setWarning().onClick(async () => {
            const idx = rules.findIndex((r) => r.id === rule.id);
            if (idx !== -1)
              rules.splice(idx, 1);
            await this.plugin.saveSettings();
            this.display();
          })
        )
      ).then((s) => {
        swatch = s.controlEl.createEl("span", {
          attr: {
            style: `display:inline-block;width:14px;height:14px;border-radius:50%;background:${rule.color};margin-left:6px;vertical-align:middle;`,
            title: colorMeta.name
          }
        });
      });
    }
    if (rules.length < 12) {
      new import_obsidian.Setting(containerEl).addButton(
        (b) => b.setButtonText("+ Add rule").setCta().onClick(async () => {
          var _a2, _b;
          rules.push({
            id: (_b = (_a2 = crypto.randomUUID) == null ? void 0 : _a2.call(crypto)) != null ? _b : Math.random().toString(36).slice(2),
            regex: "",
            color: FLAT_COLORS[rules.length % FLAT_COLORS.length].value,
            enabled: true
          });
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("Auto-defang").setDesc("Automatically rewrites matching IOCs as you type. Modifies file content.").setHeading();
    new import_obsidian.Setting(containerEl).setName("Scope").setDesc("Limit defanging to the region between two regex markers. Leave blank to apply to the whole note.").setHeading();
    new import_obsidian.Setting(containerEl).setName("Scope start").setDesc("Defang begins after the first match of this regex").addText(
      (t) => t.setPlaceholder("e.g.  ---IOC-START---").setValue(this.plugin.settings.defang.scopeStart).onChange(async (v) => {
        this.plugin.settings.defang.scopeStart = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Scope end").setDesc("Defang stops before the first match of this regex after the start").addText(
      (t) => t.setPlaceholder("e.g.  ---IOC-END---").setValue(this.plugin.settings.defang.scopeEnd).onChange(async (v) => {
        this.plugin.settings.defang.scopeEnd = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("IOC types").setHeading();
    const defangEntries = [
      ["urls", "URLs", "https://evil.com  \u2192  hxxps://evil.com"],
      ["ips", "IP addresses", "1.2.3.4  \u2192  1[.]2[.]3[.]4"],
      ["domains", "Domains", "evil.sh  \u2192  evil[.]sh"],
      ["emails", "Emails", "a@evil.com  \u2192  a[@]evil[.]com"]
    ];
    for (const [key, name, example] of defangEntries) {
      const rule = this.plugin.settings.defang[key];
      new import_obsidian.Setting(containerEl).setName(name).setDesc(example).addText(
        (t) => t.setValue(rule.regex).onChange(async (v) => {
          rule.regex = v;
          await this.plugin.saveSettings();
        })
      ).addToggle(
        (t) => t.setValue(rule.enabled).onChange(async (v) => {
          rule.enabled = v;
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("Local time \u2192 UTC conversion").setDesc('On paste, convert timestamps like "May 27, 2026 12:17 PM" to UTC. Original time is kept in brackets.').setHeading();
    new import_obsidian.Setting(containerEl).setName("Enable").setDesc("Convert local timestamps to UTC when pasting.").addToggle(
      (t) => t.setValue(this.plugin.settings.timeConvert.enabled).onChange(async (v) => {
        this.plugin.settings.timeConvert.enabled = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Local timezone").setDesc("UTC offset of the source timestamps. Examples: +8 for UTC+8, -5 for UTC-5, +5:30 for IST.").addText(
      (t) => t.setPlaceholder("+8").setValue(this.plugin.settings.timeConvert.timezoneOffset).onChange(async (v) => {
        this.plugin.settings.timeConvert.timezoneOffset = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Scope").setDesc("Limit conversion to the region between two regex markers. Leave blank to apply to the whole note.").setHeading();
    new import_obsidian.Setting(containerEl).setName("Scope start").setDesc("Conversion applies only after the first match of this regex.").addText(
      (t) => t.setPlaceholder("e.g.  ---EVENTS-START---").setValue(this.plugin.settings.timeConvert.scopeStart).onChange(async (v) => {
        this.plugin.settings.timeConvert.scopeStart = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Scope end").setDesc("Conversion stops before the first match of this regex after the start.").addText(
      (t) => t.setPlaceholder("e.g.  ---EVENTS-END---").setValue(this.plugin.settings.timeConvert.scopeEnd).onChange(async (v) => {
        this.plugin.settings.timeConvert.scopeEnd = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
