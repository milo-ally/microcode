import { describe, expect, test } from 'bun:test'
import { PermissionManager } from '../../src/permissions/index.ts'

describe('permission rules', () => {
  test('deny rules block tools', () => {
    const manager = new PermissionManager({
      mode: 'auto-approve',
      deniedTools: ['bash'],
    })
    expect(manager.checkPermission('bash', { command: 'anything' }).allowed)
      .toBe(false)
    expect(manager.checkPermission('read', { path: 'x' }).allowed)
      .toBe(true)
  })

  test('auto-approve allows non-denied tools', () => {
    const manager = new PermissionManager({ mode: 'auto-approve' })
    expect(manager.checkPermission('bash', { command: 'rm -rf /' }).allowed)
      .toBe(true)
    expect(manager.checkPermission('write', { path: 'x' }).allowed)
      .toBe(true)
  })

  test('interactive mode asks for non-allowed tools', () => {
    const manager = new PermissionManager({ mode: 'interactive' })
    expect(manager.checkPermission('bash', { command: 'echo hello' }).allowed)
      .toBe(false)
  })

  test('session allow rules bypass interactive mode', () => {
    const manager = new PermissionManager({ mode: 'interactive' })
    expect(manager.checkPermission('bash', { command: 'echo hello' }).allowed).toBe(false)
    manager.addSessionRule('bash')
    expect(manager.checkPermission('bash', { command: 'echo hello' }).allowed).toBe(true)
  })
})
