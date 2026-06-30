import { describe, expect, test } from 'bun:test'
import { createModelForId, getAvailableModelIds, getApiKeyForProvider, resolveConfig } from '../../src/config.ts'
import { customModelToModel, loadCustomModels, type CustomModelDef } from '../../src/models/custom.ts'
import { findModel, getAllModels, resolveApiKey } from '../../src/models/registry.ts'

describe('models and config modules', () => {
  test('exposes built-in model ids through the compatibility config facade', () => {
    expect(getAvailableModelIds()).toContain('deepseek-v4-pro')
    expect(getAvailableModelIds()).toContain('gemini-2.5-flash')
  })

  test('disambiguates duplicate model ids by api protocol', () => {
    const openai = findModel('deepseek-v4-pro', 'openai-completions')
    const anthropic = findModel('deepseek-v4-pro', 'anthropic-messages')

    expect(openai?.api).toBe('openai-completions')
    expect(anthropic?.api).toBe('anthropic-messages')
    expect(openai?.baseUrl).not.toBe(anthropic?.baseUrl)
  })

  test('createModelForId updates the active resolved config', () => {
    const selected = createModelForId('gemini-2.5-flash', 'google-generative-ai')
    const current = resolveConfig()

    expect(selected.model.id).toBe('gemini-2.5-flash')
    expect(current.model.id).toBe('gemini-2.5-flash')
    expect(current.provider).toBe('google')
  })

  test('custom model conversion preserves capabilities and explicit key env', () => {
    const def: CustomModelDef = {
      id: 'local-test',
      name: 'Local Test',
      api: 'openai-completions',
      baseUrl: 'http://localhost:11434/v1',
      apiKeyEnv: 'LOCAL_TEST_KEY',
      reasoning: true,
      thinkingFormat: 'deepseek',
      input: ['text', 'image'],
      contextWindow: 8192,
      maxTokens: 2048,
    }
    process.env.LOCAL_TEST_KEY = 'secret'
    const model = customModelToModel(def)

    expect(model.provider).toBe('custom')
    expect(model.input).toEqual(['text', 'image'])
    expect(model.compat?.thinkingFormat).toBe('deepseek')
    expect(resolveApiKey(model)).toBe('secret')
    delete process.env.LOCAL_TEST_KEY
  })

  test('loads valid custom models from project config and ignores invalid entries', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const cwd = await mkdtemp(join(tmpdir(), 'microcode-models-'))
    try {
      await mkdir(join(cwd, '.microcode'), { recursive: true })
      await writeFile(join(cwd, '.microcode', 'config.json'), JSON.stringify({
        models: [
          {
            id: 'project-model',
            name: 'Project Model',
            api: 'openai-completions',
            baseUrl: 'http://localhost/v1',
            contextWindow: 128000,
            maxTokens: 4096,
          },
          { id: 'invalid' },
        ],
      }))

      expect(loadCustomModels(cwd).map((model) => model.id)).toEqual(['project-model'])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('registry returns a non-empty model list and provider key fallback is stable', () => {
    expect(getAllModels().length).toBeGreaterThan(0)
    expect(getApiKeyForProvider('not-current-provider')).toBe(process.env.API_KEY)
  })
})
