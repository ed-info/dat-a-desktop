# dat.A — Desktop Database Manager

**dat.A** is an **application for working with relational databases**, created primarily for educational purposes (school computer science and distance learning).

The name comes from “data Access” (shortened to avoid conflicts with Microsoft Access).

### Technical foundation

Under the hood, dat.A uses the **rusqlite** library (in the desktop version) or **sql.js** (in the browser version). You can:

* create and edit tables;
* execute SQL queries;
* work with visual query builders;
* import and export SQLite files;
* store databases in the browser's localStorage or in the application's own .DTA format.

The interface resembles classic desktop DBMS applications (with menus such as “File,” “Tables,” “Queries,” “Reports,” “Forms,” etc.) and is adapted for both desktop and mobile devices.

### What makes it unique

1. **Designed for education**: it combines a visual builder (convenient for beginners) with direct SQL (for deeper understanding). It also provides convenient lookup values for foreign keys: users see meaningful values, such as names, while numerical identifiers are stored in the database.

2. **A simple and intuitive interface** in Ukrainian, with large buttons suitable for touch screens and without the complexity of the Java Runtime (unlike LibreOffice Base) or the instability of some other free tools.

3. **Free and open for educational use**. It is not an enterprise DBMS designed for large production systems, but rather a convenient, lightweight educational tool for learning relational databases and SQL without installing additional software.

4. **The dat.A interface is localized into 7 languages:**

* Ukrainian
* English
* Polish
* German
* French
* Spanish
* Italian

5. **A fully client-side (browser-only) application** — nothing needs to be installed, it works even on a phone, and it is suitable for distance learning and low-powered school computers. It is available at addresses such as dat-a-dbms.github.io or dat-a.pp.ua.

6. **The desktop version** of the application runs on:

* Windows
* Linux
* macOS


**dat.A** is a desktop application  built on [Tauri 2](https://tauri.app) (Rust + WebKit/WebView) with a vanilla HTML/CSS/JS frontend.

Build outputs:

- **Linux** — `deb` and `AppImage` packages (menu entry “dat.A DBMS” in the “Office” category);
- **Windows** — `msi` and `nsis` installers;
- **macOS** — `.app` bundle and `dmg` image.

---

## 1. Requirements

| Platform | Required software |
|---|---|
| Linux | Rust, Node.js, WebKitGTK system dependencies (below) |
| Windows | Rust, Node.js, Visual Studio C++ Build Tools, WebView2 Runtime |
| macOS | Rust, Node.js, Xcode Command Line Tools |

Minimum versions: **Rust 1.77.2+**, **Node.js 20+** (LTS 20/22 recommended), **npm 10+**.

---

## 2. Installing the tools

### 2.1. Rust

Install it via `rustup` (the official way):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

During installation choose option `1` (“Proceed with installation”). The script adds `cargo` to your `PATH` (`~/.bashrc` / `~/.profile`). Reload your terminal and verify:

```bash
rustc --version
cargo --version
```

### 2.2. Node.js and npm

- **Recommended:** [nvm](https://github.com/nvm-sh/nvm) (Linux/macOS):

  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install 20
  nvm use 20
  ```

- Or install Node.js from the [official website](https://nodejs.org) or your distribution’s package manager. Verify:

  ```bash
  node --version
  npm --version
  ```

### 2.3. System dependencies

**Linux (Debian / Ubuntu / Linux Mint)**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Windows**

1. Microsoft Visual Studio C++ Build Tools (install the “Desktop development with C++” workload).
2. WebView2 Runtime (pre-installed on Windows 11).

**macOS**

```bash
xcode-select --install
```

---

## 3. Installing the Tauri CLI

The Tauri CLI (`@tauri-apps/cli`) is already declared as a dev dependency in the project’s `package.json`, so installing the npm dependencies is enough:

1. Copy or unpack the project source (the directory containing `package.json`).
2. From the project root run:

   ```bash
   npm install
   ```

3. Verify the CLI is installed:

   ```bash
   npm run tauri -- --version
   ```

> This installs a project-local version of the CLI. A global install (`npm install -g @tauri-apps/cli`) is optional.

---

## 4. Development mode

Compiles a debug Rust build and opens the app window:

```bash
npm run tauri dev
```

The first compilation takes a few minutes (crate dependencies are downloaded).

---

## 5. Production build

```bash
npm run tauri build
```

The results are placed in:

```
src-tauri/target/release/bundle/
```

Depending on the OS, the following are generated:

| OS | Formats | `bundle/` directory |
|---|---|---|
| Linux | `dat-a-desktop_<ver>_amd64.deb` + `*.AppImage` | `deb/`, `appimage/` |
| Windows | `*.msi` + `*.exe` (NSIS) | `msi/`, `nsis/` |
| macOS | `*.app` + `*.dmg` | `macos/`, `dmg/` |

The exact set of formats is defined in `src-tauri/tauri.conf.json` (`bundle.targets = "all"` — all formats for the current platform).

To build only a specific format, pass the `--bundles` flag:

```bash
# Linux
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles appimage

# Windows
npm run tauri build -- --bundles nsis
npm run tauri build -- --bundles msi

# macOS
npm run tauri build -- --bundles dmg
```

> The **macOS package can only be built on macOS** (the `.app`/`.dmg` requires macOS and code signing by default). Windows installers can be built on Windows (or on Linux/macOS via `cargo-xwin` for NSIS).

---

## 6. Installing the built packages

**Linux**

- `.deb`:

  ```bash
  sudo dpkg -i dat-a-desktop_*.deb
  ```

- `.AppImage` (portable, no installation required):

  ```bash
  chmod +x dat-a-desktop_*.AppImage
  ./dat-a-desktop_*.AppImage
  ```

  For menu integration use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

> After installing the `.deb`, the menu shows **“dat.A DBMS”** in the **“Office”** category (defined by `src-tauri/desktop/linux.desktop` and `bundle.category` in `tauri.conf.json`).

**Windows** — run the `.msi` or `.exe` installer.

**macOS** — drag `.app` into “Applications”, or open the `.dmg`.

---

## 7. Where data is stored

Databases are created by default in the app’s data directory (`app_data_dir`, keyed by the identifier `com.mx-linux.dat-a-desktop`):

- **Linux:** `~/.local/share/com.mx-linux.dat-a-desktop/databases/`
- **Windows:** `%APPDATA%\com.mx-linux.dat-a-desktop\databases\`
- **macOS:** `~/Library/Application Support/com.mx-linux.dat-a-desktop/databases/`

You can also open any `.dta` file through the menu.

---

## 8. Useful tips

- **Disk space.** A full Rust build occupies 1–3 GB in `src-tauri/target/`. If the system partition is small, redirect Cargo’s target directory:

  ```bash
  CARGO_TARGET_DIR=/path/with/enough/space npm run tauri build
  ```

- **UI debugging.** Devtools are enabled in the builds (`features = ["devtools"]` in `Cargo.toml`, `"devtools": true` in `tauri.conf.json`). Open DevTools with **Ctrl+Shift+I** or **F12**.

- **Blank/black window on Linux.** On some systems WebKitGTK may have issues with DMABUF or compositing. The app already sets `WEBKIT_DISABLE_COMPOSITING_MODE=1` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically at startup on Linux — no action needed.

- **Updating versions.** All build versions (`version`, `productName`) are set in `src-tauri/tauri.conf.json`; the Rust crate version is in the `version` field of `src-tauri/Cargo.toml`.

---

## 9. Project structure

```
dat-a-desktop/
├── package.json              # npm dependencies and the `tauri` script
├── src/                      # frontend (HTML/CSS/JS)
│   ├── index.html            # main window
│   ├── help.html             # help window
│   ├── lib/                  # UI logic
│   └── locales/              # translations (uk, en, de, fr, es, it, pl)
└── src-tauri/
    ├── Cargo.toml            # Rust dependencies (rusqlite, tauri…)
    ├── tauri.conf.json       # build and window configuration
    ├── desktop/linux.desktop # Linux menu entry template
    ├── icons/                # app icons
    └── src/
        ├── lib.rs            # Tauri entry point, system workarounds
        └── sqlite.rs         # SQLite commands (open, query, export)
```
