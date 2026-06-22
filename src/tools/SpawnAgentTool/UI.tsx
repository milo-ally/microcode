import { Text, Spacer, SelectList, type SelectItem, type Component } from '@earendil-works/pi-tui'
import chalk from 'chalk'
import { theme } from '../../tui/theme.ts'
import { getDefaultWorkerTools } from '../../swarm/AgentFactory.ts'

export interface SpawnPermissionResult {
  approved: boolean
  allowSession: boolean
}

export interface SpawnPermissionContext {
  input: Record<string, unknown>
  parentToolNames: readonly string[]
  chatContainer: { addChild: (c: Component) => void; removeChild: (c: Component) => void }
  setFocus: (component: Component) => void
  requestRender: () => void
}

function resolveTools(input: Record<string, unknown>, parentToolNames: readonly string[]): string[] {
  const parentSet = new Set(parentToolNames)
  if (Array.isArray(input.tools) && input.tools.length > 0) {
    return (input.tools as string[]).filter((name) => parentSet.has(name))
  }
  return getDefaultWorkerTools().filter((name) => parentSet.has(name))
}

export function promptSpawnPermission(ctx: SpawnPermissionContext): Promise<SpawnPermissionResult> {
  return new Promise<SpawnPermissionResult>((resolve) => {
    const { input, parentToolNames, chatContainer, setFocus, requestRender } = ctx

    const desc = typeof input.description === 'string' ? input.description : '(no description)'
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
    const tools = resolveTools(input, parentToolNames)

    const lines: string[] = [
      theme.fg('accent', chalk.bold('Spawn Agent')),
      '',
      `${chalk.bold('Description:')}  ${desc}`,
      '',
      `${chalk.bold(`Granted tools (${tools.length}):`)}`,
    ]
    for (const name of tools) {
      lines.push(`  ${theme.fg('success', '✓')} ${name}`)
    }
    if (prompt) {
      const preview = prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt
      lines.push('')
      lines.push(`${chalk.bold('Prompt:')}`)
      lines.push(theme.dim(`  ${preview}`))
    }

    const infoText = new Text(lines.join('\n'), 1, 0)
    const infoSpacer = new Spacer(1)
    chatContainer.addChild(infoText)
    chatContainer.addChild(infoSpacer)

    const items: SelectItem[] = [
      { value: 'allow', label: 'Spawn', description: `Launch worker with ${tools.length} tools` },
      { value: 'allow-session', label: 'Spawn & remember', description: 'Automatically allow future spawns in this session' },
      { value: 'deny', label: 'Cancel', description: 'Do not spawn this agent' },
    ]
    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text: string) => chalk.cyan(text),
      selectedText: (text: string) => chalk.cyan(text),
      description: (text: string) => theme.dim(text),
      scrollInfo: (text: string) => theme.dim(text),
      noMatch: (text: string) => theme.dim(text),
    })
    chatContainer.addChild(selectList)
    setFocus(selectList)
    requestRender()

    let finished = false
    const cleanup = () => {
      if (finished) return
      finished = true
      chatContainer.removeChild(infoText)
      chatContainer.removeChild(infoSpacer)
      chatContainer.removeChild(selectList)
    }

    const finish = (approved: boolean, allowSession: boolean) => {
      cleanup()
      const icon = approved ? theme.fg('green', '✓') : theme.fg('red', '✗')
      const resultText = approved ? 'Spawn approved' : 'Spawn cancelled'
      chatContainer.addChild(new Text(`${icon} ${resultText}`, 1, 0))
      chatContainer.addChild(new Spacer(1))
      requestRender()
      resolve({ approved, allowSession })
    }

    selectList.onSelect = (item) => {
      finish(
        item.value === 'allow' || item.value === 'allow-session',
        item.value === 'allow-session',
      )
    }
    selectList.onCancel = () => finish(false, false)
  })
}
