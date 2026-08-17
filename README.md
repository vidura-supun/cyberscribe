# CyberScribe

> CyberScribe is an Obsidian plugin for security analysts. It highlights text by regex with custom colors, auto-defangs IOCs as you type, tracks investigation and action timers for case management, and converts local timestamps to UTC on paste.

---

## Manual Installation

### Step 1 — Download the plugin files

Download the following two files from the [latest release](https://github.com/vidura-supun/cyberscribe/releases/latest):

- `main.js`
- `manifest.json`

### Step 2 — Locate your vault's plugin folder

Your Obsidian vault has a hidden folder called `.obsidian`. Inside it, create the following path if it doesn't exist:

```
<your-vault>/.obsidian/plugins/cyberscribe/
```

**On Windows:**
```
C:\Users\<you>\Documents\<vault-name>\.obsidian\plugins\cyberscribe\
```

**On macOS:**
```
/Users/<you>/<vault-name>/.obsidian/plugins/cyberscribe/
```

**On Linux:**
```
/home/<you>/<vault-name>/.obsidian/plugins/cyberscribe/
```

> **Tip:** If you don't see the `.obsidian` folder, enable hidden files/folders in your file explorer.
> - Windows: View → Show → Hidden items
> - macOS: `Cmd + Shift + .`

### Step 3 — Copy the files

Copy both `main.js` and `manifest.json` into the `cyberscribe` folder you just created.

> **Updating to a new version?** Only replace `main.js` (and `manifest.json`). Your settings are saved automatically in `data.json` — do not overwrite or delete it.

Your folder should look like this:

```
.obsidian/
└── plugins/
    └── cyberscribe/
        ├── main.js
        └── manifest.json
```

### Step 4 — Enable the plugin in Obsidian

1. Open Obsidian
2. Go to **Settings** (gear icon)
3. Click **Community plugins** in the left sidebar
4. If prompted, click **Turn off restricted mode**
5. Under **Installed plugins**, find **CyberScribe** and toggle it **on**

---

## Features

### Investigation Timer

Tracks time spent on each OODA phase — investigation (45 min) and taking action (20 min).

**How it works:**

- The investigation timer **auto-starts** when you paste content into an empty note inside your configured timer folder.
- Open the timer panel via the **clock icon** in the left ribbon, or run **"Open investigation timer panel"** from the command palette.

**Timer panel controls:**

| State | Buttons |
|---|---|
| Idle | Start Investigation |
| Investigating | Take Action ✏️ · Reset |
| Taking Action | Stop |

- **Take Action** — switches to a fresh 20-minute action countdown.
- **Stop / Reset** — clears the timer entirely.

The **status bar** shows the active phase and remaining time (e.g. `🔍 38:22` or `✏️ 14:05`). Clicking the status bar item while investigating advances to the action phase; clicking while taking action resets the timer.

**Settings:**
- **Investigation timer** — enable/disable the feature globally.
- **Investigation timer folder** — restrict auto-start to notes inside a specific folder (e.g. `OODAS`). Leave blank to apply vault-wide.

---

### Pixel Animations

Small sprite animations appear in the top bar to reflect your current workflow state.

| Trigger | Animation | Duration |
|---|---|---|
| New note created (timer idle) | Wink | Until you type or paste, or 1 minute |
| Investigation timer starts | Coding | Full investigation phase |

- Creating a new note while the timer is already running does not interrupt the active animation.
- Switching phases (Investigate → Take Action) dismisses the animation immediately.
- Timer depletion, Reset, or Stop dismisses the animation.

---

### Color Rules
Define up to 12 regex → color rules to highlight matching text inline, in both Live Preview and Reading view.

**Example:** Regex `---OODA---` with color Yellow highlights all OODA loop markers in your notes.

**Available colors:** Red, Orange, Yellow, Green, Teal, Blue, Purple, Pink, Crimson, Lime, Cyan, Indigo

### Auto-Defang
Automatically rewrites IOCs to defanged format as you type — modifying the file in place.

| IOC Type | Input | Output |
|---|---|---|
| URL | `https://evil.com/path` | `hxxps://evil.com/path` |
| IP Address | `1.2.3.4` | `1[.]2[.]3[.]4` |
| Domain | `evil.sh` | `evil[.]sh` |
| Email | `user@evil.com` | `user[@]evil[.]com` |

### Defang Scope
Limit defanging to a region of your note using start/end regex markers:

```
Normal text: 1.2.3.4        ← NOT defanged

---IOC-START---
1.2.3.4                    ← defanged → 1[.]2[.]3[.]4
user@evil.com              ← defanged → user[@]evil[.]com
---IOC-END---

1.2.3.4                    ← NOT defanged
```

### Paste as Plain Text
Toggle in settings to strip all formatting on paste — useful when copying from browsers or rich text sources.

### Date Tokens
Type a token and it auto-replaces with the current UTC date or datetime:

| Token | Output |
|---|---|
| `<$ date-now $>` | `2026-04-19` |
| `<$ datetime-now $>` | `2026-04-19 14:30:00 UTC` |

Can be toggled on/off. Three hotkeys available via **Settings → Hotkeys** (search "CyberScribe"):

- **Process date tokens in note** — replaces all tokens in the current note on demand
- **Insert current date** — inserts `YYYY-MM-DD` at cursor
- **Insert current datetime** — inserts `YYYY-MM-DD HH:mm:ss UTC` at cursor

Leave both scope fields blank to apply defanging to the entire note.

### Local Time → UTC Conversion

Automatically converts local timestamps to UTC when you paste them into a note, keeping the original in brackets for reference.

**Example:**

Input (pasted):
```
May 27, 2026 12:17 PM
```

Output (converted, source timezone UTC+8):
```
2026-05-27 04:17 UTC (May 27, 2026 12:17 PM UTC+8)
```

Supported format: `Month DD, YYYY HH:MM AM/PM` (e.g. `January 3, 2025 9:45 AM`)

**Settings:**
- **Enable** — toggle conversion on/off.
- **Local timezone** — UTC offset of the source timestamps. Examples: `+8` for UTC+8, `-5` for UTC-5, `+5:30` for IST.
- **Scope start / end** — optional regex markers to restrict conversion to a region of the note (same mechanism as defang scope). Leave blank to convert anywhere in the note.

**Command:** Run **"Convert local timestamps to UTC (selection or whole note)"** from the command palette to convert timestamps in the current selection or the entire note on demand.

---

## Configuration

Open **Settings → CyberScribe** to configure:

- **Color Rules** — Add/remove regex → color pairs (up to 12), toggle each on/off
- **Auto-Defang → Scope** — Optional start/end regex to restrict the defang region
- **Auto-Defang → IOC Types** — Per-type regex (URLs, IPs, Domains, Emails) and enable/disable toggles
- **Local time → UTC conversion** — Enable/disable, set the source timezone offset, and optionally limit conversion to a scoped region

---

## Source Code

The full source code is available at: https://github.com/vidura-supun/cyberscribe

## License

MIT License — see [LICENSE](https://github.com/vidura-supun/cyberscribe/blob/main/LICENSE)
