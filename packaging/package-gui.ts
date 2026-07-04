#!/usr/bin/env bun
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
  if (process.platform === 'win32') return 'electron\\electron.exe'
  if (process.platform === 'darwin') return 'electron/Electron.app/Contents/MacOS/Electron'
  return 'electron/electron'
}

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
      '"%ROOT%electron\\electron.exe" "%ROOT%resources\\app\\electron\\main.cjs" %*',
      '',
    ].join('\r\n'))
    return
  }

  await writeExecutable(join(packageDir, 'microcode-gui'), [
    '#!/usr/bin/env sh',
    'set -eu',
    'root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    process.platform === 'darwin'
      ? 'exec "$root/electron/Electron.app/Contents/MacOS/Electron" "$root/resources/app/electron/main.cjs" "$@"'
      : 'exec "$root/electron/electron" "$root/resources/app/electron/main.cjs" "$@"',
    '',
  ].join('\n'))

  if (process.platform === 'linux') {
    await Bun.write(join(packageDir, 'Microcode.desktop'), [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Microcode',
      'Comment=AI-powered coding assistant',
      'Exec=./microcode-gui',
      'Terminal=false',
      'Categories=Development;',
      '',
    ].join('\n'))
  }
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
