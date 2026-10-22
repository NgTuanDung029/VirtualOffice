# The Virtual Office for Your Work

**Local Windows Application | Antigravity CLI (`agy.exe`) Integration | Animated Pixel-Art Virtual Office | Automatic Tab-Lifecycle Shutdown**

---

## 1. Overview

**The Virtual Office for Your Work** is a Windows 10/11 (64-bit) local web application that combines a developer-focused AI coding terminal with a cozy, animated pixel-art virtual office:

- **Left Panel (66.67% width)**: Terminal-inspired AI coding workspace featuring Windows directory selection (native Windows Folder Browser Dialog + in-app drive/directory navigator supporting drive letters, spaces, Unicode, and Vietnamese paths), per-project conversation history, syntax-highlighted code blocks with one-click copy, tool execution trace cards, permission authorization prompts, and file context attachment.
- **Right Panel (33.33% width)**: Crisp, nearest-neighbor scaled pixel-art virtual office (`240x156` native pixel canvas) featuring an animated AI developer character that transitions across `IDLE`, `THINKING`, `WORKING`, `WAITING`, `COMPLETED`, `ERROR`, and `DISCONNECTED`, complete with a real-time local wall clock, dusk window skyline, bookshelves, potted plants, warm desk lamp lighting, live status card, and real-time activity feed.
- **Bottom-Right Persistent Token Usage Status Bar**: Displays live model, session/turn token consumption, context window status, and account quota buckets from your authenticated Antigravity CLI (`agy -p "/usage" --output-format json`), with a detailed click-to-open popover.
- **Automatic Server Shutdown**: Binds strictly to `127.0.0.1` and automatically shuts down after all application browser tabs have closed (handling multi-tab sessions, page reloads, and browser crashes via per-tab heartbeats and `navigator.sendBeacon`).

---

## 2. Quick Start (One-Click Launch & Installation)

### Option A: One-Click Launch from Workspace or Portable Folder
Double-click:
- **`start-virtual-office.bat`** (or the generated **`The Virtual Office for Your Work.lnk`** shortcut).

What happens automatically:
1. Resolves the application directory relative to the launcher (no hardcoded paths).
2. Checks if a healthy instance is already running via `%LOCALAPPDATA%\VirtualOffice\runtime-instance.json` and `GET /health`. If running, opens a new tab in your default Windows browser.
3. Otherwise, launches the local loopback server (`127.0.0.1`) using the bundled `runtime\node.exe` (or system `node.exe`), waits for `/health` readiness, and opens the application URL in your Windows default browser.

### Option B: Native Windows Installer (`VirtualOffice-Setup.exe`)
- Double-click **`VirtualOffice-Setup.exe`** (located in the root directory and in `dist-release\VirtualOffice-Setup.exe`).
- Features a lively retro pixel-office illustration banner (GDI+ drawn starry night window, computer workstation, glowing terminal screen, warm lamp, AI bot assistant, steaming coffee mug, and bonsai plant).
- Defaults cleanly to English, with an instant one-click `[🌐 VI / EN]` language switcher.
- Choose any installation drive (`C:`, `D:`, `E:...`) or directory with real-time free disk space calculation (defaults to `%LOCALAPPDATA%\Programs\VirtualOffice`; supports spaces and Unicode/Vietnamese folder names).
- Optionally create a Desktop Shortcut, and click **Install Now**.
- Supports silent installation for automated deployment:
  ```powershell
  .\VirtualOffice-Setup.exe /SILENT /DIR="C:\Custom\Install\Path" /NOSHORTCUT
  ```

### Option C: Self-Contained Portable Package
- Located at **`dist-release\VirtualOffice-Portable\`**.
- Includes the standalone 64-bit Windows Node.js runtime (`runtime\node.exe`), prebuilt production frontend (`dist\client\`), bundled zero-dependency backend (`dist\server\index.mjs`), pixel-art assets, and `start-virtual-office.bat`. No manual development environment setup is required on the target Windows PC.

---

## 3. Real vs. Simulated Features (Antigravity Integration Matrix)

This application includes two strictly separated agent adapters selectable in the top toolbar:
1. **Real Antigravity CLI (`agy.exe`) Adapter** *(Default when `agy.exe` is detected)*
2. **Demo Mode (Simulated Offline Adapter)** *(Explicitly badged `[DEMO MODE — SIMULATED]`)*

| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Sending Prompts & Streaming Responses** | **REAL** (`agy.exe`) | Executes `agy.exe -p "<prompt>" --output-format stream-json` with real-time NDJSON streaming (`init`, `step_update`, `result`). |
| **Working Directory Binding** | **REAL** (`agy.exe`) | Validates the selected Windows folder and spawns `agy.exe` with `cwd` set to the project folder and `--add-dir <projectPath>`. |
| **Agent Activity States & Tool Events** | **REAL** (`agy.exe`) | Synchronizes actual `init`, `thinking_delta`, `text_delta`, `tool` step updates, and `denied_actions` with the Pixel-Art Virtual Office character and Activity Feed. |
| **Tool Permission Authorization** | **REAL** (`agy.exe`) | Respects Antigravity's permission model (`request-review` by default). If headless print mode pauses on a tool requiring permission (`denied_actions`), displays an interactive **Authorize & Re-Run Turn** card in the chat. |
| **Model Discovery & Selection** | **REAL** (`agy.exe`) | Queries `agy.exe models` to populate actual available models (`gemini-4-argon-medium`, `gemini-3.8-flash-low`, `claude-sonnet-5-5-medium`, etc.). |
| **Account Quota Usage (`/usage`)** | **REAL** (`agy.exe`) | Queries `agy.exe -p "/usage" --output-format json` to display actual quota groups (`Gemini Models`, `Claude and GPT models`, `Gemini 4 Argon`), remaining percentages, and reset timestamps. |
| **Per-Turn & Session Token Counts** | **REAL** (`agy.exe`) | Reads exact `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, and `total_tokens` returned by `agy.exe` on each turn. |
| **Static Context-Window Capacity %** | **UNSUPPORTED BY CLI** | `agy.exe` JSON output reports exact per-turn `input_tokens` (prompt context size), but does not expose a static model `context_window_capacity` percentage. The Usage Bar honestly labels static capacity % as `UNSUPPORTED` rather than fabricating numbers. |
| **Internal IDE Chat History Sync** | **SEPARATE BY DESIGN** | Conversations created in this application are stored locally in `%LOCALAPPDATA%\VirtualOffice\conversations.json` (while preserving `agyConversationId` for multi-turn CLI continuity). It does not scrape internal IDE state. |
| **Demo Mode (Fallback)** | **SIMULATED (LABELED)** | Provided as a separate adapter (`src/server/demoAdapter.ts`) for offline testing or machines without `agy.exe`. Never fabricates token counts or quota data. |

---

## 4. Automatic Tab-Lifecycle Shutdown Protocol & Timings

The local backend (`src/server/lifecycleManager.ts`) tracks active browser tabs to ensure no background process is left orphaned after you finish working:

- **Per-Tab Session ID**: Each browser tab generates a unique `tabId` on load and registers via `POST /api/lifecycle/register`.
- **Periodic Heartbeat**: Active tabs send `POST /api/lifecycle/heartbeat` every **5 seconds** (configurable in Settings).
- **Immediate Close Notification**: Closing a tab triggers `navigator.sendBeacon('/api/lifecycle/close')` via `pagehide` / `beforeunload`.
- **Multi-Tab Safety**: If Tab A closes while Tab B remains open (`activeTabCount > 0`), the server continues running uninterrupted.
- **Reload Survival**: Reloading the last open tab starts a **5-second shutdown grace period**; when the reloaded page registers within the grace window, the pending shutdown is automatically cancelled.
- **Browser Crash Recovery**: If the browser process terminates unexpectedly without sending a close beacon, stale tab sessions expire after **25 seconds** (configurable), followed by the **5-second** grace period, after which the server shuts down and releases its loopback port.

---

## 5. Data Storage & Security

- **Loopback Only**: The server binds strictly to `127.0.0.1` (never `0.0.0.0`).
- **Host & Origin Validation**: All requests are checked against valid loopback `Host` and `Origin` headers (`403 Forbidden` on cross-origin attempts).
- **Path Traversal Protection**: Project file browsing and context attachments are restricted strictly to the user-selected project folder via `isPathInsideProject()`.
- **User Data Location**: Stored in `%LOCALAPPDATA%\VirtualOffice\` (`config.json`, `conversations.json`, `runtime-instance.json`, `logs\`). Uninstalling the application never deletes user project folders.

---

## 6. Development & Testing Commands

```powershell
# Build production frontend (dist/client) and backend (dist/server/index.mjs)
npm run build

# Run automated test suite (6 end-to-end backend, security, Unicode path, lifecycle, and agy integration tests)
npm test

# Build Windows portable distribution (dist-release/VirtualOffice-Portable) and native installer (VirtualOffice-Setup.exe)
npm run package:win
```
