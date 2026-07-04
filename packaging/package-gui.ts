#!/usr/bin/env bun
import { chmod, copyFile, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  archiveDirectory,
  assertExists,
  copyDir,
  formatDone,
  outRoot,
  platformTag,
  projectRoot,
  readPackageMeta,
  resetDir,
  stagingRoot,
  writeExecutable,
} from './lib.ts'

function electronExecutable(): string {
  if (process.platform === 'win32') return 'electron\\Microcode.exe'
  if (process.platform === 'darwin') return 'electron/Microcode.app/Contents/MacOS/Microcode'
  return 'electron/microcode-gui'
}

const linuxDesktopId = 'works.earendil.microcode'

function runInstruction(): string {
  if (process.platform === 'win32') return 'Run `microcode-gui.cmd` to start the app.'
  if (process.platform === 'darwin') return 'Run `./microcode-gui` from Terminal, or create a shortcut to it.'
  return 'Run `./microcode-gui` to start the app.'
}

async function writeLaunchers(packageDir: string): Promise<void> {
  if (process.platform === 'win32') {
    await Bun.write(join(packageDir, 'microcode-gui.cmd'), [
      '@echo off',
      'setlocal',
      'set "ROOT=%~dp0"',
      'set "MICROCODE_GUI_APP_DIR=%ROOT%resources\\app"',
      '"%ROOT%electron\\Microcode.exe" "%ROOT%resources\\app\\electron\\main.cjs" %*',
      '',
    ].join('\r\n'))
    return
  }

  if (process.platform === 'linux') {
    await writeExecutable(join(packageDir, 'microcode-gui'), [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
      '"$root/install-desktop.sh" >/dev/null 2>&1 || true',
      'export MICROCODE_GUI_APP_DIR="$root/resources/app"',
      `exec -a Microcode "$root/electron/microcode-gui" --no-sandbox --class=${linuxDesktopId} "$MICROCODE_GUI_APP_DIR/electron/main.cjs" "$@"`,
      '',
    ].join('\n'))
  } else {
    await writeExecutable(join(packageDir, 'microcode-gui'), [
      '#!/usr/bin/env sh',
      'set -eu',
      'root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
      'export MICROCODE_GUI_APP_DIR="$root/resources/app"',
      'exec "$root/electron/Microcode.app/Contents/MacOS/Microcode" "$MICROCODE_GUI_APP_DIR/electron/main.cjs" "$@"',
      '',
    ].join('\n'))
  }

  if (process.platform === 'linux') {
    await Bun.write(join(packageDir, 'microcode.desktop'), [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Microcode',
      'Comment=AI-powered coding assistant',
      'Exec=./microcode-gui',
      `Icon=${linuxDesktopId}`,
      `StartupWMClass=${linuxDesktopId}`,
      'Terminal=false',
      'Categories=Development;',
      '',
    ].join('\n'))
    await writeExecutable(join(packageDir, 'install-desktop.sh'), [
      '#!/usr/bin/env sh',
      'set -eu',
      'root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
      'desktop_dir="${HOME}/.local/share/applications"',
      'icon_dir="${HOME}/.local/share/icons/hicolor/512x512/apps"',
      'mkdir -p "$desktop_dir" "$icon_dir"',
      `cp "$root/microcode.png" "$icon_dir/${linuxDesktopId}.png"`,
      `desktop_file="$desktop_dir/${linuxDesktopId}.desktop"`,
      'rm -f "$desktop_dir/microcode.desktop"',
      '{',
      '  echo "[Desktop Entry]"',
      '  echo "Type=Application"',
      '  echo "Name=Microcode"',
      '  echo "Comment=AI-powered coding assistant"',
      '  echo "Exec=$root/microcode-gui"',
      '  echo "Icon=$root/microcode.png"',
      `  echo "StartupWMClass=${linuxDesktopId}"`,
      '  echo "Terminal=false"',
      '  echo "Categories=Development;"',
      '} > "$desktop_file"',
      'chmod +x "$desktop_file"',
      'if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true; fi',
      'if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true; fi',
      'echo "Installed launcher to $desktop_file"',
      '',
    ].join('\n'))
  }
}

async function commandExists(command: string): Promise<boolean> {
  const proc = process.platform === 'win32'
    ? Bun.spawn(['cmd', '/c', 'where', command], { stdout: 'ignore', stderr: 'ignore' })
    : Bun.spawn(['sh', '-c', `command -v ${command} >/dev/null 2>&1`])
  return await proc.exited === 0
}

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await proc.exited
  if (exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${cmd.join(' ')}`)
}

async function patchWindowsExecutable(packageDir: string): Promise<void> {
  const source = join(packageDir, 'electron', 'electron.exe')
  const target = join(packageDir, 'electron', 'Microcode.exe')
  await rename(source, target)
  const iconPath = join(projectRoot, 'assets', 'logo', 'generated', 'microcode.ico')
  if (!(await commandExists('rcedit'))) {
    throw new Error('Windows GUI packaging requires rcedit on PATH to replace the Electron executable icon.')
  }
  await run([
    'rcedit',
    target,
    '--set-icon', iconPath,
    '--set-version-string', 'ProductName', 'Microcode',
    '--set-version-string', 'FileDescription', 'Microcode',
    '--set-version-string', 'CompanyName', 'Earendil Works',
    '--set-version-string', 'InternalName', 'Microcode',
    '--set-version-string', 'OriginalFilename', 'Microcode.exe',
    '--set-version-string', 'AppUserModelId', 'works.earendil.microcode',
  ])
}

async function patchMacApp(packageDir: string, version: string): Promise<void> {
  await rename(join(packageDir, 'electron', 'Electron.app'), join(packageDir, 'electron', 'Microcode.app'))
  const appRoot = join(packageDir, 'electron', 'Microcode.app')
  try {
    await copyFile(
      join(projectRoot, 'assets', 'logo', 'generated', 'Microcode.icns'),
      join(appRoot, 'Contents', 'Resources', 'electron.icns'),
    )
  } catch {
    // iconutil is macOS-only; portable packaging still works without the icns.
  }
  try {
    await rename(
      join(appRoot, 'Contents', 'MacOS', 'Electron'),
      join(appRoot, 'Contents', 'MacOS', 'Microcode'),
    )
    await chmod(join(appRoot, 'Contents', 'MacOS', 'Microcode'), 0o755)
  } catch {}

  const plistPath = join(appRoot, 'Contents', 'Info.plist')
  let plist = await readFile(plistPath, 'utf8')
  plist = plist
    .replace(/<key>CFBundleExecutable<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleExecutable</key>\n\t<string>Microcode</string>')
    .replace(/<key>CFBundleName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleName</key>\n\t<string>Microcode</string>')
    .replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>Microcode</string>')
    .replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleIdentifier</key>\n\t<string>works.earendil.microcode</string>')
    .replace(/<key>CFBundleShortVersionString<\/key>\s*<string>[^<]+<\/string>/, `<key>CFBundleShortVersionString</key>\n\t<string>${version}</string>`)
  if (!plist.includes('<key>CFBundleDisplayName</key>')) {
    plist = plist.replace('</dict>', '\t<key>CFBundleDisplayName</key>\n\t<string>Microcode</string>\n</dict>')
  }
  await writeFile(plistPath, plist, 'utf8')
}

async function main(): Promise<void> {
  const meta = await readPackageMeta()
  const tag = platformTag()
  const packageName = `microcode-gui-v${meta.version}-${tag}`
  const packageDir = join(stagingRoot, packageName)
  const appDir = join(packageDir, 'resources', 'app')

  await Bun.$`bun run build-gui.ts`.cwd(projectRoot)
  await resetDir(packageDir)

  await copyDir(join(projectRoot, 'node_modules', 'electron', 'dist'), join(packageDir, 'electron'))
  await copyDir(join(projectRoot, 'dist', 'gui', 'electron'), join(appDir, 'electron'))
  await copyDir(join(projectRoot, 'dist', 'gui', 'preload'), join(appDir, 'preload'))
  await copyDir(join(projectRoot, 'dist', 'gui', 'renderer'), join(appDir, 'renderer'))
  await copyFile(
    join(projectRoot, 'assets', 'logo', 'generated', 'microcode.png'),
    join(packageDir, 'microcode.png'),
  )

  if (process.platform === 'linux') {
    await rename(join(packageDir, 'electron', 'electron'), join(packageDir, 'electron', 'microcode-gui'))
    await chmod(join(packageDir, 'electron', 'microcode-gui'), 0o755)
  }

  if (process.platform === 'win32') {
    await patchWindowsExecutable(packageDir)
  }

  if (process.platform === 'darwin') {
    await patchMacApp(packageDir, meta.version)
  }

  await Bun.write(join(appDir, 'package.json'), JSON.stringify({
    name: 'microcode-gui',
    version: meta.version,
    private: true,
    main: 'electron/main.cjs',
  }, null, 2))

  await writeLaunchers(packageDir)

  await Bun.write(join(packageDir, 'README.md'), [
    '# Microcode GUI',
    '',
    'Portable desktop app build. Electron runtime is included in this folder.',
    '',
    runInstruction(),
    '',
    'Configuration and sessions are stored under `~/.microcode/`.',
    '',
  ].join('\n'))

  await assertExists(join(packageDir, electronExecutable()))
  await assertExists(join(appDir, 'electron', 'main.cjs'))
  await assertExists(join(appDir, 'renderer', 'index.html'))
  const archive = await archiveDirectory(packageDir, join(outRoot, packageName))
  formatDone('GUI package', packageDir)
  formatDone('GUI archive', archive)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
