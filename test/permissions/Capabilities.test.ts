import { describe, expect, test } from 'bun:test'
import {
  classifyBashCommand,
  PermissionManager,
  READ_CAPABILITIES,
} from '../../src/permissions/index.ts'

describe('capability policy', () => {
  test('classifies explicit read-only commands conservatively', () => {
    for (const command of [
      'uname -a',
      'node --version',
      'cc --version',
      'nvim --version',
      'git status --short',
      'git diff | head -n 20',
      'find src -type f',
      'rg permission src && git status',
    ]) {
      expect(classifyBashCommand(command).capability).toBe('commands.read')
    }
  })

  test('requires mutation capability for unsafe or unknown shell syntax', () => {
    for (const command of [
      'npm install',
      'echo value > output.txt',
      'git reset --hard',
      'git branch -D old',
      'git diff --output=changes.patch',
      'python --version -c "print(1)"',
      'find . -delete',
      'echo $(whoami)',
      'unknown-command --flag',
    ]) {
      expect(classifyBashCommand(command).capability).toBe('commands.mutate')
    }
  })

  test('auto-approve remains bounded by capabilities and explicit deny rules', () => {
    const manager = new PermissionManager({
      mode: 'auto-approve',
      capabilities: [...READ_CAPABILITIES],
      deniedTools: ['git'],
    })

    expect(manager.checkPermission('bash', { command: 'node --version' }).allowed)
      .toBe(true)
    const mutation = manager.checkPermission('bash', { command: 'npm install' })
    expect(mutation.allowed).toBe(false)
    if (!mutation.allowed) {
      expect(mutation.blocker?.requiredCapability).toBe('commands.mutate')
    }
    expect(manager.checkPermission('file_write', { path: 'x' }).allowed).toBe(false)
  })

  test('session-approved capabilities bypass repeated interactive approval', () => {
    const manager = new PermissionManager({
      mode: 'interactive',
      capabilities: ['commands.mutate'],
    })
    expect(manager.checkPermission('bash', { command: 'echo hello' }).allowed).toBe(false)
    manager.setApprovedCapabilities(['commands.mutate'])
    expect(manager.checkPermission('bash', { command: 'echo hello' }).allowed).toBe(true)
  })
})
