<div align="center">
  <img src="app-icon.png" width="128" alt="Remie Chat Logo" />
  <h1>Remie Chat</h1>
</div>

<div align="center">
  <img src="tauri-logo.svg" width="96" alt="Tauri Logo" />
  <p><strong>Built with Tauri, Preact, and Rust</strong></p>
</div>

---

## Introduction

Remie is a desktop and mobile **interface** for chatting with AI. It sits on your screen as a compact chatbox, or collapses down to a simple animated icon that reacts to what you're doing.

## Supported Platforms

| Platform | Status | Notes |
| :--- | :--- | :--- |
| **Windows** | ✅ Supported | Fully supported native desktop app |
| **Linux** | ✅ Supported | Fully supported native desktop app |
| **Android** | ⚠️ Dev Only | App builds and runs, but Secure Storage is not yet fully available on mobile |
| **macOS** | ❌ Not Yet | Planning |

## Storage & Config

**API keys** are stored securely and locally on your machine. However, the level of security differs by platform:
- **Desktop (Windows, macOS, Linux):** API keys are encrypted at rest using [Tauri Stronghold](https://v2.tauri.app/plugin/stronghold/), which uses your operating system's native credential vault for hardware-backed security.
- **Mobile (Android):** Due to current plugin limitations on mobile, API keys are saved to `localStorage`. We apply basic WebCrypto obfuscation to prevent trivial plaintext inspection via DevTools, but **this does not provide real security against a determined attacker with device access**. Please be aware of this platform security gap when using your own keys on a mobile device.

Keys are never transmitted anywhere except directly to the AI provider you've connected.

**Other settings** (generation parameters, profile/persona settings) are saved via the Tauri plugin-store, written to a `config.json` file in your OS's AppData directory:

| OS | Location |
|---|---|
| Windows | `C:\Users\<User>\AppData\Roaming\com.pancakes.remie-chat\config.json` |
| Linux | `~/.local/share/com.pancakes.remie-chat/config.json` |

---

## Development

### Prerequisites

- Install the [prerequisites for your OS](https://tauri.app/start/prerequisites/) before continuing.

#### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Libsodium Install](https://download.libsodium.org/libsodium/releases/)
---

### Setup

```bash
cd remie-chat
pnpm install
pnpm tauri dev
```

### Android
If you have Emulator, then start it:
```powershell
Start-Process -FilePath "C:\Users\<Username>\AppData\Local\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd remie_emulator"
```
Start app in development mode:
```bash
pnpm tauri android dev --host 127.0.0.1
```
If no emulator detected, the app will spin up Android Studio instead

Clean up emulator:
```bash
C:\Users\<Username>\AppData\Local\Android\Sdk\platform-tools\adb.exe shell pm clear com.pancakes.remie_chat
```

### Building

To build the application for release on your current platform:

```bash
pnpm tauri build
```

Once the build successfully completes, you will find the executable installers and bundled files located in:
- **Windows (`.exe`, `.msi`)**: `src-tauri/target/release/bundle/nsis/`
- **Linux (`.AppImage`, `.deb`)**: `src-tauri/target/release/bundle/`
- **macOS (`.dmg`, `.app`)**: `src-tauri/target/release/bundle/macos/`

## Disclaimer

These mascot assets are from a web event by **Zenless Zone Zero**. These assets are not original work and are used here for decorative an entertainment purposes only. All assets belong to Hoyoverse/Cognosphere.