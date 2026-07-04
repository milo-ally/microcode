#!/usr/bin/env bun
import { projectRoot, run } from './lib.ts'

async function main(): Promise<void> {
  await run(['bun', 'run', 'packaging/package-cli.ts'], { cwd: projectRoot })
  await run(['bun', 'run', 'packaging/package-gui.ts'], { cwd: projectRoot })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
