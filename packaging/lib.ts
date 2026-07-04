import { chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'

export const projectRoot = resolve(import.meta.dir, '..')
export const packagingRoot = join(projectRoot, 'packaging')
export const outRoot = join(packagingRoot, 'out')
export const stagingRoot = join(outRoot, 'staging')

export interface PackageMeta {
  name: string
  version: string
}

export function platformTag(): string {
  const platform = process.platform === 'win32'
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : process.platform
  return `${platform}-${process.arch}`
}

export async function readPackageMeta(): Promise<PackageMeta> {
  const raw = await readFile(join(projectRoot, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as { name?: string; version?: string }
  return {
    name: parsed.name ?? 'microcode',
    version: parsed.version ?? '0.0.0',
  }
}

export async function resetDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
  await mkdir(path, { recursive: true })
}

export async function copyDir(from: string, to: string): Promise<void> {
  await cp(from, to, { recursive: true, force: true })
}

export async function copyFileExecutable(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { force: true })
  if (process.platform !== 'win32') await chmod(to, 0o755)
}

export async function writeExecutable(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  if (process.platform !== 'win32') await chmod(path, 0o755)
}

export async function run(cmd: string[], options: { cwd?: string } = {}): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd ?? projectRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${cmd.join(' ')}`)
  }
}

export async function assertExists(path: string): Promise<void> {
  await stat(path)
}

export async function archiveDirectory(sourceDir: string, artifactBase: string): Promise<string> {
  await mkdir(outRoot, { recursive: true })
  const parent = dirname(sourceDir)
  const name = basename(sourceDir)

  if (process.platform === 'win32') {
    const archivePath = `${artifactBase}.zip`
    await rm(archivePath, { force: true })
    await run([
      'powershell',
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path ${JSON.stringify(sourceDir)} -DestinationPath ${JSON.stringify(archivePath)} -Force`,
    ])
    return archivePath
  }

  const archivePath = `${artifactBase}.tar.gz`
  await rm(archivePath, { force: true })
  await run(['tar', '-czf', archivePath, '-C', parent, name])
  return archivePath
}

export function formatDone(label: string, value: string): void {
  console.log(`✓ ${label}: ${value}`)
}
