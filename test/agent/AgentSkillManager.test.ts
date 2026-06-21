import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { AgentSkillManager } from '../../src/agent/AgentSkillManager.ts'

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'skills')

describe('AgentSkillManager', () => {
  test('manages available, diagnostic, and loaded skill state', () => {
    const manager = new AgentSkillManager({
      cwd: process.cwd(),
      skillPaths: [FIXTURES],
      includeDefaults: false,
    })

    expect(manager.getSkills().map((skill) => skill.name)).toEqual([
      'phase-six-alpha',
      'phase-six-beta',
    ])
    expect(manager.getDiagnostics()).toEqual([])
    expect(manager.getLoadedNames()).toEqual([])

    manager.load('phase-six-alpha')
    expect(manager.isLoaded('phase-six-alpha')).toBe(true)
    expect(manager.getLoadedNames()).toEqual(['phase-six-alpha'])
    expect(manager.appendLoadedSkills('base')).toContain(
      '# Skill: phase-six-alpha\n\nFollow the alpha workflow exactly.',
    )

    expect(manager.unload('phase-six-alpha')).toBe(true)
    expect(manager.isLoaded('phase-six-alpha')).toBe(false)
  })

  test('returns an immutable snapshot', () => {
    const manager = new AgentSkillManager({
      cwd: process.cwd(),
      skillPaths: [FIXTURES],
      includeDefaults: false,
    })
    manager.load('phase-six-beta')
    const snapshot = manager.getSnapshot()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.available)).toBe(true)
    expect(Object.isFrozen(snapshot.available[0])).toBe(true)
    expect(Object.isFrozen(snapshot.loaded)).toBe(true)
    expect(snapshot.loaded[0].name).toBe('phase-six-beta')
  })

  test('rejects unknown skills without changing loaded state', () => {
    const manager = new AgentSkillManager({
      cwd: process.cwd(),
      skillPaths: [FIXTURES],
      includeDefaults: false,
    })

    expect(() => manager.load('missing-skill')).toThrow(
      'Skill "missing-skill" not found.',
    )
    expect(manager.getLoadedNames()).toEqual([])
  })
})
