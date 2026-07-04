#!/usr/bin/env bun
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'

const root = import.meta.dir
const source = join(root, 'microcode-logo.svg')
const out = join(root, 'generated')
const png = join(out, 'microcode.png')
const ico = join(out, 'microcode.ico')
const iconset = join(out, 'Microcode.iconset')
const icns = join(out, 'Microcode.icns')

async function run(cmd: string[]): Promise<boolean> {
  const proc = Bun.spawn(cmd, { stdout: 'inherit', stderr: 'inherit' })
  return await proc.exited === 0
}

async function commandExists(command: string): Promise<boolean> {
  const proc = process.platform === 'win32'
    ? Bun.spawn(['cmd', '/c', 'where', command], { stdout: 'ignore', stderr: 'ignore' })
    : Bun.spawn(['sh', '-c', `command -v ${command} >/dev/null 2>&1`])
  return await proc.exited === 0
}

async function renderPng(size: number, dest: string): Promise<void> {
  if (await commandExists('rsvg-convert')) {
    if (await run(['rsvg-convert', '-w', String(size), '-h', String(size), source, '-o', dest])) return
  }
  if (await commandExists('convert')) {
    if (await run(['convert', '-background', 'none', '-resize', `${size}x${size}`, source, dest])) return
  }
  throw new Error('Install rsvg-convert or ImageMagick convert to generate icon PNGs.')
}

async function main(): Promise<void> {
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await renderPng(1024, png)

  if (await commandExists('convert')) {
    await run(['convert', png, '-define', 'icon:auto-resize=256,128,64,48,32,16', ico])
  }

  await mkdir(iconset, { recursive: true })
  const sizes = [16, 32, 64, 128, 256, 512, 1024]
  for (const size of sizes) {
    await renderPng(size, join(iconset, `icon_${size}x${size}.png`))
  }
  if (await commandExists('iconutil')) {
    await run(['iconutil', '-c', 'icns', iconset, '-o', icns])
  }

  console.log(`Generated icons in ${out}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
