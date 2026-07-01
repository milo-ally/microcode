#!/usr/bin/env bun
import { mkdir, copyFile, rename, rm } from 'fs/promises'
import { join } from 'path'

const root = import.meta.dir
const outDir = join(root, 'dist', 'gui')
const rendererOut = join(outDir, 'renderer')
const electronOut = join(outDir, 'electron')

async function build() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(rendererOut, { recursive: true })
  await mkdir(electronOut, { recursive: true })

  const renderer = await Bun.build({
    entrypoints: [join(root, 'src/gui/renderer/main.ts')],
    outdir: rendererOut,
    target: 'browser',
    format: 'esm',
    splitting: false,
    sourcemap: 'linked',
    minify: false,
  })
  if (!renderer.success) {
    for (const log of renderer.logs) console.error(log)
    throw new Error('Renderer build failed.')
  }

  const preload = await Bun.build({
    entrypoints: [join(root, 'src/gui/preload/preload.ts')],
    outdir: electronOut,
    target: 'node',
    format: 'cjs',
    external: ['electron'],
    sourcemap: 'linked',
    minify: false,
  })
  if (!preload.success) {
    for (const log of preload.logs) console.error(log)
    throw new Error('Preload build failed.')
  }
  await mkdir(join(outDir, 'preload'), { recursive: true })
  await rename(join(electronOut, 'preload.js'), join(outDir, 'preload', 'preload.cjs'))

  const main = await Bun.build({
    entrypoints: [join(root, 'src/gui/main-process/main.ts')],
    outdir: electronOut,
    target: 'node',
    format: 'cjs',
    external: ['electron'],
    sourcemap: 'linked',
    minify: false,
  })
  if (!main.success) {
    for (const log of main.logs) console.error(log)
    throw new Error('Electron main build failed.')
  }
  await rename(join(electronOut, 'main.js'), join(electronOut, 'main.cjs'))

  await copyFile(
    join(root, 'src/gui/renderer/index.html'),
    join(rendererOut, 'index.html'),
  )
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
