import type {
  AgentCapability,
  PermissionBlockDetails,
  PermissionMode,
} from './types.ts'

export const ALL_CAPABILITIES: readonly AgentCapability[] = [
  'files.read',
  'files.write',
  'commands.read',
  'commands.mutate',
  'network',
  'agents.spawn',
]

export const READ_CAPABILITIES: readonly AgentCapability[] = [
  'files.read',
  'commands.read',
  'network',
]

const SIMPLE_READ_COMMANDS = new Set([
  'arch',
  'bun',
  'cargo',
  'cat',
  'cc',
  'clang',
  'cmake',
  'command',
  'cut',
  'date',
  'df',
  'docker',
  'deno',
  'du',
  'env',
  'find',
  'git',
  'go',
  'gcc',
  'grep',
  'head',
  'id',
  'ls',
  'node',
  'npm',
  'npx',
  'nvim',
  'java',
  'javac',
  'make',
  'perl',
  'php',
  'pip',
  'pip3',
  'pnpm',
  'printenv',
  'pwd',
  'python',
  'python3',
  'ruby',
  'rg',
  'rustc',
  'sort',
  'stat',
  'tail',
  'type',
  'uname',
  'uniq',
  'wc',
  'which',
  'whoami',
  'yarn',
])

const VERSION_ONLY_COMMANDS = new Set([
  'bun',
  'cargo',
  'cc',
  'clang',
  'cmake',
  'deno',
  'docker',
  'gcc',
  'go',
  'java',
  'javac',
  'make',
  'node',
  'npm',
  'npx',
  'nvim',
  'perl',
  'php',
  'pip',
  'pip3',
  'pnpm',
  'python',
  'python3',
  'ruby',
  'rustc',
  'yarn',
])

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'diff',
  'grep',
  'log',
  'ls-files',
  'rev-parse',
  'show',
  'status',
  'version',
])

export interface CommandClassification {
  capability: Extract<AgentCapability, 'commands.read' | 'commands.mutate'>
  operation: string
  reason?: string
}

function tokenize(segment: string): string[] | undefined {
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | undefined
  let escaped = false

  for (const char of segment.trim()) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      else current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaped || quote) return undefined
  if (current) tokens.push(current)
  return tokens
}

function gitSubcommand(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '-C' || arg === '-c' || arg === '--git-dir' || arg === '--work-tree') {
      index++
      continue
    }
    if (!arg.startsWith('-')) return arg
  }
  return undefined
}

function segmentIsReadOnly(segment: string): boolean {
  const tokens = tokenize(segment)
  if (!tokens || tokens.length === 0) return false
  while (tokens[0]?.includes('=') && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
    tokens.shift()
  }
  const command = tokens[0]?.split('/').pop()
  if (!command || !SIMPLE_READ_COMMANDS.has(command)) return false

  const args = tokens.slice(1)
  if (VERSION_ONLY_COMMANDS.has(command)) {
    if (command === 'go') return args[0] === 'version' || args[0] === 'env'
    if (command === 'docker') return args[0] === 'version' || args[0] === '--version'
    return args.length === 1 && args.some((arg) =>
      arg === '--version' || arg === '-version' || arg === '-V' || arg === '-v'
    )
  }
  if (command === 'git') {
    const subcommand = gitSubcommand(args)
    if (!subcommand) return false
    const subcommandIndex = args.indexOf(subcommand)
    const subcommandArgs = args.slice(subcommandIndex + 1)
    if (subcommand === 'branch') {
      return subcommandArgs.length === 0 ||
        subcommandArgs.every((arg) => arg === '--show-current' || arg === '--list')
    }
    if (subcommand === 'tag') {
      return subcommandArgs.length === 0 ||
        subcommandArgs.every((arg) => arg === '--list')
    }
    if (!READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return false
    return !subcommandArgs.some((arg) =>
      arg === '--ext-diff' ||
      arg === '--textconv' ||
      arg.startsWith('--output') ||
      arg.startsWith('--exec') ||
      arg === '-x'
    )
  }
  if (command === 'find') {
    return !args.some((arg) =>
      ['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fls', '-fprint', '-fprintf'].includes(arg)
    )
  }
  if (command === 'command') return args[0] === '-v' || args[0] === '-V'
  return true
}

export function classifyBashCommand(command: string): CommandClassification {
  const trimmed = command.trim()
  const unsafeSyntax =
    !trimmed ||
    /[\n\r;]/.test(trimmed) ||
    /`|\$\(|\$\{|\b(if|then|else|fi|for|while|until|case|function)\b/.test(trimmed) ||
    /(^|[^<])>{1,2}|<{1,2}|&>/.test(trimmed) ||
    /\|\|/.test(trimmed)

  if (unsafeSyntax) {
    return {
      capability: 'commands.mutate',
      operation: trimmed || '(empty command)',
      reason: 'Command contains syntax that cannot be proven read-only.',
    }
  }

  const segments = trimmed.split(/&&|\|/).map((part) => part.trim())
  if (segments.length > 0 && segments.every(segmentIsReadOnly)) {
    return { capability: 'commands.read', operation: trimmed }
  }
  return {
    capability: 'commands.mutate',
    operation: trimmed,
    reason: 'Command is not in the read-only command policy.',
  }
}

export function capabilitiesForMode(
  mode: PermissionMode,
  configured?: Iterable<AgentCapability>,
): Set<AgentCapability> {
  const base = new Set(configured ?? ALL_CAPABILITIES)
  if (mode !== 'plan') return base
  return new Set(READ_CAPABILITIES.filter((capability) => base.has(capability)))
}

export function requiredCapability(
  toolName: string,
  input: Record<string, unknown>,
): { capability?: AgentCapability; operation: string; reason?: string } {
  switch (toolName) {
    case 'file_read':
    case 'read':
    case 'grep':
    case 'glob':
    case 'vision':
      return { capability: 'files.read', operation: toolName }
    case 'file_edit':
    case 'edit':
    case 'file_write':
    case 'write':
      return { capability: 'files.write', operation: toolName }
    case 'bash': {
      const command = typeof input.command === 'string' ? input.command : ''
      const classified = classifyBashCommand(command)
      return {
        capability: classified.capability,
        operation: classified.operation,
        reason: classified.reason,
      }
    }
    case 'spawn':
    case 'spawn_agent':
      return { capability: 'agents.spawn', operation: toolName }
    case 'ask_user_question':
    case 'Ask':
      return { operation: toolName }
    case 'skill':
    case 'tool_search':
    case 'search':
      return { capability: 'files.read', operation: toolName }
    default:
      return { capability: 'network', operation: toolName }
  }
}

export function createCapabilityBlocker(
  toolName: string,
  input: Record<string, unknown>,
  capability: AgentCapability,
  operation: string,
  reason?: string,
): PermissionBlockDetails {
  return {
    type: 'permission',
    toolName,
    operation,
    requiredCapability: capability,
    reason: reason ?? `Capability "${capability}" is not available.`,
    retryable: true,
    inputSummary: JSON.stringify(input).slice(0, 500),
  }
}
