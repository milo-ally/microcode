import { describe, expect, test } from 'bun:test'
import { isBareInteractiveCommand } from '../../src/tui/app.ts'

describe('inline bash command classification', () => {
  test('blocks known interactive shells and TUIs without arguments', () => {
    expect(isBareInteractiveCommand('node')).toBe(true)
    expect(isBareInteractiveCommand('codex')).toBe(true)
    expect(isBareInteractiveCommand('claude')).toBe(true)
    expect(isBareInteractiveCommand('microcode')).toBe(true)
  })

  test('allows explicit non-interactive invocations', () => {
    expect(isBareInteractiveCommand('node -e "console.log(1)"')).toBe(false)
    expect(isBareInteractiveCommand('microcode --help')).toBe(false)
    expect(isBareInteractiveCommand('microcode --version')).toBe(false)
    expect(isBareInteractiveCommand('microcode model list')).toBe(false)
    expect(isBareInteractiveCommand('microcode mcp list')).toBe(false)
  })

  test('continues blocking nested TUI invocations with ordinary arguments', () => {
    expect(isBareInteractiveCommand('microcode hello')).toBe(true)
    expect(isBareInteractiveCommand('codex exec')).toBe(true)
    expect(isBareInteractiveCommand('claude chat')).toBe(true)
  })
})
