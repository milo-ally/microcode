import { createMicrocodeAgentRuntime, type MicrocodeAgent } from '../agent/index.ts'
import { getWorkerPrompt } from './prompts.ts'
import type { AgentFactoryContext } from './types.ts'
import type { AgentCapability } from '../permissions/index.ts'
import { ALL_CAPABILITIES, READ_CAPABILITIES } from '../permissions/index.ts'

export function getWorkerCapabilities(
  context: AgentFactoryContext,
  grants: Iterable<AgentCapability> = [],
): AgentCapability[] {
  const parentCapabilities = new Set(
    context.parent.getPermissionSnapshot().capabilities,
  )
  const profile = context.request.workKind === 'read'
    ? new Set<AgentCapability>([...READ_CAPABILITIES, ...grants])
    : new Set<AgentCapability>([
        ...ALL_CAPABILITIES.filter((capability) => capability !== 'agents.spawn'),
        ...grants,
      ])
  const requested = context.request.capabilities
    ? new Set(context.request.capabilities)
    : profile
  return [...requested].filter((capability) =>
    profile.has(capability) && parentCapabilities.has(capability)
  )
}

export function createWorkerAgent(context: AgentFactoryContext): MicrocodeAgent {
  const { parent, request, agentId } = context
  const parentSnapshot = parent.getSnapshot()
  const parentMode = parent.getPermissionMode()
  const requestedMode = request.permissionMode ?? parentMode
  const mode = parentMode === 'plan'
    ? 'plan'
    : parentMode === 'interactive' && requestedMode === 'auto-approve'
      ? 'interactive'
      : requestedMode

      
  const worker = createMicrocodeAgentRuntime({
    cwd: request.cwd ?? parentSnapshot.cwd,
    modelId: request.modelId ?? parentSnapshot.model.id,
    thinkingLevel: parent.getThinkingLevel(),
    identity: {
      id: agentId,
      name: request.description,
      role: request.role ?? 'worker',
      parentId: request.parentAgentId,
    },
    permission: {
      mode,
      capabilities: getWorkerCapabilities(context),
    },
    systemPromptSuffix: getWorkerPrompt(
      request.parentAgentId,
      request.description,
    ),
  })

  // Inherit parent rules, while the worker profile keeps its own capability ceiling.
  worker.inheritPermissions(parent.getPermissionSnapshot(), [], false)

  for (const skillName of parent.getLoadedSkillNames()) {
    if (worker.getSkills().some((skill) => skill.name === skillName)) {
      worker.loadSkill(skillName)
    }
  }
  worker.removeTools(['task', 'bash', 'Ask'])
  return worker
}
