import { createMicrocodeAgentRuntime, type MicrocodeAgent } from '../agent/index.ts'
import { getWorkerPrompt } from './prompts.ts'
import type { AgentFactoryContext } from './types.ts'

const READ_ONLY_DENY = [
  { toolName: 'bash' },
  { toolName: 'file_edit' },
  { toolName: 'file_write' },
]

export function createWorkerAgent(context: AgentFactoryContext): MicrocodeAgent {
  const { parent, request, agentId } = context
  const parentSnapshot = parent.getSnapshot()
  const parentMode = parent.getPermissionMode()
  const requestedMode = request.permissionMode ?? parentMode
  const mode = request.workKind === 'read' || parentMode === 'plan'
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
      deny: request.workKind === 'read'
        ? READ_ONLY_DENY.map((r) => r.toolName)
        : [],
    },
    systemPromptSuffix: getWorkerPrompt(
      request.parentAgentId,
      request.description,
    ),
  })

  // Inherit all permission rules from parent (allow, deny, ask)
  // Mode is NOT inherited — worker mode is set above based on workKind
  worker.inheritPermissions(
    parent.getPermissionSnapshot(),
    request.workKind === 'read' ? READ_ONLY_DENY : [],
    false,
  )

  for (const skillName of parent.getLoadedSkillNames()) {
    if (worker.getSkills().some((skill) => skill.name === skillName)) {
      worker.loadSkill(skillName)
    }
  }
  worker.removeTools(['task'])
  return worker
}
