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
  default: () => IOCHighlighter
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
var DEFAULT_SETTINGS = {
  colorRules: [],
  plainTextPaste: false,
  dateTokens: true,
  defang: {
    ips: {
      regex: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b`,
      enabled: true
    },
    domains: {
      // Covers common TLDs including .sh and other short TLDs
      regex: String.raw`\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|sh|gov|edu|co|uk|de|fr|ru|cn|jp|au|ca|info|biz|xyz|top|site|online|tech|me|tv|cc|app|dev|mil|int|us|in|br|nl|se|no|fi|dk|pl|ch|at|be|nz|sg|hk|tw|kr|za|mx|ar|cl|pe|ph|id|th|vn|pk|bd|ng|ke|eg|ma|dz|tn|ly|sd|gh|tz|ci|cm|sn|ug|zm|zw)\b`,
      enabled: true
    },
    emails: {
      regex: String.raw`\b[a-zA-Z0-9._%+\-]+@(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}\b`,
      enabled: true
    },
    scopeStart: "",
    scopeEnd: ""
  }
};
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
    const m = endRe.exec(docText);
    return [{ from: 0, to: m ? m.index : len }];
  }
  if (startRe && !endRe) {
    const m = startRe.exec(docText);
    return m ? [{ from: m.index + m[0].length, to: len }] : [];
  }
  const ranges = [];
  let sm;
  while ((sm = startRe.exec(docText)) !== null) {
    const from = sm.index + sm[0].length;
    endRe.lastIndex = from;
    const em = endRe.exec(docText);
    if (em) {
      ranges.push({ from, to: em.index });
      startRe.lastIndex = em.index + em[0].length;
    } else {
      ranges.push({ from, to: len });
      break;
    }
  }
  return ranges;
}
function defangText(text, type) {
  if (type === "ips" || type === "domains") {
    return text.replace(/\./g, "[.]");
  }
  const atIdx = text.lastIndexOf("@");
  if (atIdx === -1)
    return text;
  return text.slice(0, atIdx) + "[@]" + text.slice(atIdx + 1).replace(/\./g, "[.]");
}
function isDefanged(text) {
  return text.includes("[.]") || text.includes("[@]");
}
var defangTx = import_state.Annotation.define();
var dateTx = import_state.Annotation.define();
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
var IOCHighlighter = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerEditorExtension(this.buildEditorExtensions());
    this.registerMarkdownPostProcessor(this.processReadingView.bind(this));
    this.addCommand({
      id: "process-date-tokens",
      name: "Process date tokens in note",
      editorCallback: (editor) => {
        const tokens = [
          { pattern: /<\$ datetime-now \$>/g, value: utcDateTimeString },
          { pattern: /<\$ date-now \$>/g, value: utcDateString }
        ];
        let content = editor.getValue();
        let changed = false;
        for (const { pattern, value } of tokens) {
          const replaced = content.replace(pattern, () => {
            changed = true;
            return value();
          });
          content = replaced;
        }
        if (changed)
          editor.setValue(content);
      }
    });
    this.addCommand({
      id: "insert-date",
      name: "Insert current date (YYYY-MM-DD)",
      editorCallback: (editor) => {
        editor.replaceSelection(utcDateString());
      }
    });
    this.addCommand({
      id: "insert-datetime",
      name: "Insert current datetime (YYYY-MM-DD HH:mm:ss UTC)",
      editorCallback: (editor) => {
        editor.replaceSelection(utcDateTimeString());
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => {
        var _a;
        if (!this.settings.plainTextPaste)
          return;
        const text = (_a = evt.clipboardData) == null ? void 0 : _a.getData("text/plain");
        if (text === void 0)
          return;
        evt.preventDefault();
        editor.replaceSelection(text);
      })
    );
  }
  buildEditorExtensions() {
    const plugin = this;
    const colorPlugin = import_view.ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = buildDecorations(view);
        }
        update(u) {
          if (u.docChanged || u.viewportChanged)
            this.decorations = buildDecorations(u.view);
        }
      },
      { decorations: (v) => v.decorations }
    );
    function buildDecorations(view) {
      const rules = plugin.settings.colorRules.filter((r) => r.enabled && r.regex);
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
    }
    const defangListener = import_view.EditorView.updateListener.of((u) => {
      if (!u.docChanged)
        return;
      if (u.transactions.some((tr) => tr.annotation(defangTx)))
        return;
      const docText = u.state.doc.toString();
      const scopeRanges = getScopeRanges(
        docText,
        plugin.settings.defang.scopeStart,
        plugin.settings.defang.scopeEnd
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
        ["emails", plugin.settings.defang.emails],
        ["ips", plugin.settings.defang.ips],
        ["domains", plugin.settings.defang.domains]
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
            const abs = lo + m.index;
            const absEnd = abs + m[0].length;
            if (!inScope(abs, absEnd) || overlaps(abs, absEnd) || isDefanged(m[0]))
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
      if (!plugin.settings.dateTokens)
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
      const text = (_a = node.nodeValue) != null ? _a : "";
      const spans = buildSpans(text, rules);
      if (spans.length === 1 && !spans[0].color)
        continue;
      const frag = document.createDocumentFragment();
      for (const { text: t, color } of spans) {
        if (color) {
          const s = document.createElement("span");
          s.style.cssText = `color:${color};font-weight:600`;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const saved = (_a = await this.loadData()) != null ? _a : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      plainTextPaste: (_b = saved.plainTextPaste) != null ? _b : DEFAULT_SETTINGS.plainTextPaste,
      dateTokens: (_c = saved.dateTokens) != null ? _c : DEFAULT_SETTINGS.dateTokens,
      defang: {
        ips: { ...DEFAULT_SETTINGS.defang.ips, ...(_e = (_d = saved.defang) == null ? void 0 : _d.ips) != null ? _e : {} },
        domains: { ...DEFAULT_SETTINGS.defang.domains, ...(_g = (_f = saved.defang) == null ? void 0 : _f.domains) != null ? _g : {} },
        emails: { ...DEFAULT_SETTINGS.defang.emails, ...(_i = (_h = saved.defang) == null ? void 0 : _h.emails) != null ? _i : {} },
        scopeStart: (_k = (_j = saved.defang) == null ? void 0 : _j.scopeStart) != null ? _k : "",
        scopeEnd: (_m = (_l = saved.defang) == null ? void 0 : _l.scopeEnd) != null ? _m : ""
      }
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
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
      hits.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
    }
  }
  if (!hits.length)
    return [{ text, color: null }];
  hits.sort((a, b) => a.start - b.start);
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
var SettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    var _a;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CyberScribe" });
    new import_obsidian.Setting(containerEl).setName("Paste as plain text").setDesc("Strip all formatting when pasting. Overrides Obsidian's default paste behaviour.").addToggle(
      (t) => t.setValue(this.plugin.settings.plainTextPaste).onChange(async (v) => {
        this.plugin.settings.plainTextPaste = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Date tokens").setDesc("Auto-replace <$ date-now $> with YYYY-MM-DD and <$ datetime-now $> with YYYY-MM-DD HH:mm:ss UTC.").addToggle(
      (t) => t.setValue(this.plugin.settings.dateTokens).onChange(async (v) => {
        this.plugin.settings.dateTokens = v;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Color Rules" });
    containerEl.createEl("p", {
      text: "Highlight matched text in the editor and reading view. Up to 12 rules.",
      attr: { style: "color: var(--text-muted); margin-top: 0;" }
    });
    const rules = this.plugin.settings.colorRules;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const colorMeta = (_a = FLAT_COLORS.find((c) => c.value === rule.color)) != null ? _a : FLAT_COLORS[0];
      new import_obsidian.Setting(containerEl).setName(`Rule ${i + 1}`).addText(
        (t) => t.setPlaceholder("Regex pattern  e.g.  ---OODA---").setValue(rule.regex).onChange(async (v) => {
          rule.regex = v;
          await this.plugin.saveSettings();
        })
      ).addDropdown((d) => {
        FLAT_COLORS.forEach((c) => d.addOption(c.value, c.name));
        d.setValue(rule.color).onChange(async (v) => {
          rule.color = v;
          await this.plugin.saveSettings();
          this.display();
        });
      }).addToggle(
        (t) => t.setValue(rule.enabled).onChange(async (v) => {
          rule.enabled = v;
          await this.plugin.saveSettings();
        })
      ).addButton(
        (b) => b.setButtonText("\u2715").setWarning().onClick(async () => {
          rules.splice(i, 1);
          await this.plugin.saveSettings();
          this.display();
        })
      ).then((s) => {
        s.controlEl.createEl("span", {
          attr: {
            style: `display:inline-block;width:14px;height:14px;border-radius:50%;background:${rule.color};margin-left:6px;vertical-align:middle;`,
            title: colorMeta.name
          }
        });
      });
    }
    if (rules.length < 12) {
      new import_obsidian.Setting(containerEl).addButton(
        (b) => b.setButtonText("+ Add Rule").setCta().onClick(async () => {
          rules.push({
            id: crypto.randomUUID(),
            regex: "",
            color: FLAT_COLORS[rules.length % FLAT_COLORS.length].value,
            enabled: true
          });
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    containerEl.createEl("h3", { text: "Auto-Defang" });
    containerEl.createEl("p", {
      text: "Automatically rewrites matching IOCs as you type. Modifies file content.",
      attr: { style: "color: var(--text-muted); margin-top: 0;" }
    });
    containerEl.createEl("h3", { text: "Scope" });
    containerEl.createEl("p", {
      text: "Limit defanging to the region between two regex markers. Leave blank to apply to the whole note.",
      attr: { style: "color: var(--text-muted); margin-top: 0;" }
    });
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
    containerEl.createEl("h3", { text: "IOC Types" });
    const defangEntries = [
      ["ips", "IP Addresses", "1.2.3.4  \u2192  1[.]2[.]3[.]4"],
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
  }
};
