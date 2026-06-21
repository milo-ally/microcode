import { createMicrocodeAgentRuntime, type MicrocodeAgent } from '../agent/index.ts'
import { getWorkerPrompt } from './prompts.ts'
import type { AgentFactoryContext } from './types.ts'

const READ_ONLY_DENY = ['bash', 'file_edit', 'file_write']

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
  const parentDeny = parent.getPermissionSnapshot().denyRules.map((rule) =>
    rule.ruleContent
      ? `${rule.toolName}(${rule.ruleContent})`
      : rule.toolName
  )
  const delegate = (
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ) => {
    const decision = parent.checkPermission(toolName, input)
    if (decision.allowed) return Promise.resolve(true)
    if (decision.reason !== 'ask') return Promise.resolve(false)
    return parent.requestDelegatedPermission(
      toolName,
      input,
      `[Worker: ${request.description}] ${description}`,
    )
  }

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
      deny: [
        ...parentDeny,
        ...(request.workKind === 'read' ? READ_ONLY_DENY : []),
      ],
      nonInteractiveStrategy: 'delegate-to-parent',
      onPermissionRequest: delegate,
      onDelegatePermissionRequest: delegate,
    },
    systemPromptSuffix: getWorkerPrompt(
      request.parentAgentId,
      request.description,
    ),
  })

  for (const skillName of parent.getLoadedSkillNames()) {
    if (worker.getSkills().some((skill) => skill.name === skillName)) {
      worker.loadSkill(skillName)
    }
  }
  worker.removeTools(['task'])
  return worker
}
