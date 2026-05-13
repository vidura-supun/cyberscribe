# CyberScribe — Manual Installation

> CyberScribe is an Obsidian plugin for security analysts. It highlights text by regex with custom colors, auto-defangs IOCs as you type, and tracks investigation and action timers for case management.

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

Tracks time spent on each OODA phase — investigation and taking action — with pause (hold) support.

**How it works:**

- The 45-minute investigation timer **auto-starts** when you paste content into an empty note inside your configured timer folder.
- Open the timer panel via the **clock icon** in the left ribbon, or run **"Open investigation timer panel"** from the command palette.

**Timer panel controls:**

| State | Buttons |
|---|---|
| Idle | Start Investigation |
| Investigating | ⏸️ Hold · Take Action ✏️ · Reset |
| Investigating (on hold) | ▶️ Resume · Take Action ✏️ · Reset |
| Taking Action | ⏸️ Hold · 🔍 Investigate · Stop |
| Taking Action (on hold) | ▶️ Resume · 🔍 Investigate · Stop |

- **Hold** — pauses the current timer without losing elapsed time.
- **Resume** — continues from where it was paused.
- **Take Action** — switches to a fresh 20-minute action countdown.
- **Investigate** — switches back to a fresh 45-minute investigation countdown.
- **Stop / Reset** — clears the timer entirely.

The **status bar** shows the active phase and remaining time (e.g. `🔍 38:22` or `✏️ 14:05 ⏸️`). Clicking the status bar item toggles Hold/Resume.

**Settings:**
- **Investigation timer** — enable/disable the feature globally.
- **Investigation timer folder** — restrict auto-start to notes inside a specific folder (e.g. `OODAS`). Leave blank to apply vault-wide.

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

---

## Configuration

Open **Settings → CyberScribe** to configure:

- **Color Rules** — Add/remove regex → color pairs (up to 12), toggle each on/off
- **Auto-Defang → Scope** — Optional start/end regex to restrict the defang region
- **Auto-Defang → IOC Types** — Per-type regex (URLs, IPs, Domains, Emails) and enable/disable toggles

---

## Source Code

The full source code is available at: https://github.com/vidura-supun/cyberscribe

## License

MIT License — see [LICENSE](https://github.com/vidura-supun/cyberscribe/blob/main/LICENSE)
