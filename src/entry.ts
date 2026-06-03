/**
 * Entry point for microcode.
 * Used both in dev mode (bun run ./src/entry.ts) and as the compiled binary
 * (bun build ./src/entry.ts --compile).
 */
import { ensureBootstrapMacro } from './macro'

try {
  process.title = 'microcode'
} catch {}

ensureBootstrapMacro()

await import('./main.tsx')
