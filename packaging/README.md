# Microcode Packaging

This directory contains release packaging scripts outside `src/` and `test/`.

The scripts are platform-aware and produce native packages for the operating
system they run on:

- Linux: `*-linux-x64.tar.gz` or `*-linux-arm64.tar.gz`
- Windows: `*-windows-x64.zip` or `*-windows-arm64.zip`
- macOS: `*-macos-x64.tar.gz` or `*-macos-arm64.tar.gz`

Build on each target platform to create downloads for Linux, Windows, and
macOS. The GUI package includes the Electron runtime from the local platform,
so it should not be cross-packaged from a different OS.

## CLI / TUI Package

```sh
bun run package:cli
```

Creates:

- `packaging/out/staging/microcode-cli-v<version>-<platform>-<arch>/`
- `packaging/out/microcode-cli-v<version>-<platform>-<arch>.tar.gz` on Linux/macOS
- `packaging/out/microcode-cli-v<version>-<platform>-<arch>.zip` on Windows

The CLI package contains a standalone `bin/microcode` binary and `install.sh`.
On Windows it also includes `install.cmd`.

## GUI App Package

```sh
bun run package:gui
```

On Windows PowerShell, if `bun` resolves to `bun.ps1` and script execution is
disabled, run the same command through `bun.cmd`, for example
`bun.cmd run package:gui`.

If a previous Windows GUI package is still running, Windows may lock its staging
directory. The packaging script will use a `.build-...` staging directory and
still write the normal `microcode-gui-v<version>-windows-<arch>.zip` artifact.

Creates:

- `packaging/out/staging/microcode-gui-v<version>-<platform>-<arch>/`
- `packaging/out/microcode-gui-v<version>-<platform>-<arch>.tar.gz` on Linux/macOS
- `packaging/out/microcode-gui-v<version>-<platform>-<arch>.zip` on Windows

The GUI package is portable and includes the Electron runtime. On Linux/macOS,
run `./microcode-gui` from the extracted folder. On Windows, run
`electron\Microcode.exe`.

GUI app icons are applied at the OS level:

- Linux: the package includes `microcode.desktop`, `microcode.png`, and
  `install-desktop.sh` for launcher/Dock integration.
- Windows: the package renames Electron to `Microcode.exe` and uses the local
  `rcedit` dependency to replace the executable icon.
- macOS: the package renames `Electron.app` to `Microcode.app`, updates
  `Info.plist`, and replaces the app icon with `Microcode.icns`.

## Build Both

```sh
bun run package:all
```

Packages are built for the current operating system and CPU architecture.
