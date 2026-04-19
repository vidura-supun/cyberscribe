# CyberScribe — Manual Installation

> CyberScribe is an Obsidian plugin for security analysts. It highlights text by regex with custom colors and auto-defangs IPs, domains, and emails as you type.
>
> The plugin has been submitted to the Obsidian Community Plugins directory and is pending review. In the meantime, you can install it manually using the steps below.

---

## Manual Installation

### Step 1 — Download the plugin files

Download the following two files from the [latest release](https://github.com/vidura-supun/obsidian-cyberscribe/releases/latest):

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

### Color Rules
Define up to 12 regex → color rules to highlight matching text inline, in both Live Preview and Reading view.

**Example:** Regex `---OODA---` with color Yellow highlights all OODA loop markers in your notes.

**Available colors:** Red, Orange, Yellow, Green, Teal, Blue, Purple, Pink, Crimson, Lime, Cyan, Indigo

### Auto-Defang
Automatically rewrites IOCs to defanged format as you type — modifying the file in place.

| IOC Type | Input | Output |
|---|---|---|
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
- **Auto-Defang → IOC Types** — Per-type regex (IPs, Domains, Emails) and enable/disable toggles

---

## Source Code

The full source code is available at: https://github.com/vidura-supun/obsidian-cyberscribe

## License

MIT License — see [LICENSE](https://github.com/vidura-supun/obsidian-cyberscribe/blob/main/LICENSE)
