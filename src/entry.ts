/**
 * Entry point for microcode.
 * Used both in dev mode (bun run ./src/entry.ts) and as the compiled binary
 * (bun build ./src/entry.ts --compile).
 */
import { ensureBootstrapMacro } from './macro'

declare const MACRO: {
  VERSION: string
}

try {
  process.title = 'microcode'
} catch {}

ensureBootstrapMacro()

if (process.argv.length === 3 && (process.argv[2] === '--version' || process.argv[2] === '-v')) {
  console.log(`${MACRO.VERSION} (Microcode)`)
  process.exit(0)
}

await import('./main.tsx')
