# Tether

One-click remote help tool. The helpee double-clicks an app, reads a code to confirm it's you, clicks Allow — and you're in.

Built with [Wails](https://wails.io) (Go + WebView2), tunneled via [upterm](https://upterm.dev).

---

## How it works

```
Helpee                              Helper
──────                              ──────
1. Opens Tether app
2. Clicks "Get Help"
3. Reads 4-digit code to helper ──► helper confirms code
4. Clicks Allow
5. upterm session starts
6. Join URL POSTed to NotifyURL ──► helper gets notified
                                    helper runs: upterm join ssh://...
                                    helper runs: claude
7. "X is connected" status shown
8. Clicks "End Session" to stop ──► SSH session drops
```

**Claude runs entirely on the helper's machine.** The helpee's computer only runs a shell (PowerShell on Windows, `$SHELL` on Mac/Linux) that the helper attaches to via SSH. No API keys ever touch the helpee's machine.

---

## Setup (helper — you)

### 1. Prerequisites

- [Go 1.23+](https://go.dev/dl/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation): `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [upterm](https://upterm.dev): download `upterm` / `upterm.exe` and place it in `PATH` or next to the built binary
- [Node.js](https://nodejs.org) (for frontend build only)

### 2. Edit `config.go`

```go
// HelperName — shown on the helpee's consent screen
const HelperName = "Alice"

// NotifyURL — HTTP POST endpoint that receives the join command when helpee clicks Allow
// Examples:
//   ntfy (self-hosted):  "http://your-server:2586/tether"
//   ntfy (public):       "https://ntfy.sh/your-topic"
//   Gotify:              "http://your-server:8080/message?token=TOKEN"
//   Any webhook:         "http://your-server/tether-notify"
// Leave empty to skip — the join URL still appears in the upterm log.
const NotifyURL = "http://your-ntfy-server/tether"

// UptermServer — upterm relay. Public server works out of the box.
// Replace with your own sish server for full self-hosting.
const UptermServer = "wss://uptermd.io"
```

### 3. Build

```bash
# Windows (run in the tether-app directory)
wails build

# Output: build/bin/tether-app.exe
```

### 4. Distribute

Send the helpee `tether-app.exe` (and `upterm.exe` if not installed system-wide). That's it — no installer, no configuration, no terminal needed on their end.

---

## What the helpee sees

| Screen | Description |
|--------|-------------|
| **Idle** | "Tether — Remote help from someone you trust." + Get Help button |
| **Consent** | Your name, what you'll be able to do, a 4-digit verbal confirmation code |
| **Loading** | Spinner while the secure tunnel starts |
| **Live** | Windows: static "X is connected" panel. Mac/Linux: live terminal mirror (read-only) |
| **Ended** | Confirmation the session is closed |

The helpee can end the session at any time by clicking **End Session** or closing the window.

---

## Helper workflow

When you get notified (via ntfy / Gotify / webhook), the message body looks like:

```
Tether session ready. Run this to attach:

upterm join ssh://token@uptermd.io:22

Then run: claude
```

Run those two commands in your terminal. You're now in the helpee's shell with Claude Code ready to go.

---

## Security model

| Property | Detail |
|----------|--------|
| **Consent-gated** | Session only starts after the helpee clicks Allow |
| **Verbal confirmation** | 4-digit code prevents a URL-guessing attacker from impersonating you |
| **Full token required** | The upterm join URL contains a full random token — not guessable |
| **Helpee screen read-only** | `disableStdin: true` in xterm — helpee cannot accidentally type into your session |
| **Instant kill switch** | End Session kills the upterm process immediately |
| **No persistent access** | Every session is a fresh upterm tunnel; nothing persists after the session ends |

---

## Architecture

```
tether-app/
├── config.go          # HelperName, NotifyURL, UptermServer — edit before building
├── app.go             # StartSession / EndSession / GetConfig (Wails backend)
├── main.go            # Wails window setup (480×640, non-resizable)
└── frontend/
    ├── index.html     # Loads xterm.js from CDN
    └── src/
        ├── main.js    # State machine: idle → consent → loading → live → ended
        └── app.css    # Dark theme
```

**Dependencies:**
- [Wails v2](https://wails.io) — Go/WebView2 desktop framework
- [upterm](https://upterm.dev) — SSH session sharing (runs as a subprocess)
- [xterm.js v5](https://xtermjs.org) — Terminal emulator (Mac/Linux live view only)

---

## Roadmap

- **M1** — SSHFS mount so Claude can use native file tools instead of shell commands
- **M2** — Custom sish server for full self-hosting (no dependency on uptermd.io)
- **M3** — Auto-update, code signing, notarization

---

## License

MIT
