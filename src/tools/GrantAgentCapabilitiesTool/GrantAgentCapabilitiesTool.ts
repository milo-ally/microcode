import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import {
  AGENT_CAPABILITIES,
  type AgentCapability,
  type PermissionBehavior,
} from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'grant'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const capabilitySchema = Type.Union(
  AGENT_CAPABILITIES.map((capability) => Type.Literal(capability)),
)

const grantSchema = Type.Object({
  capabilities: Type.Array(capabilitySchema, {
    minItems: 1,
    description: 'Capabilities explicitly approved by the user for this session.',
  }),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createGrantAgentCapabilitiesTool(
  supervisor: AgentSupervisor,
  _coordinatorId: string,
): AgentTool<typeof grantSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Grant worker capabilities',
    description:
      'Apply capabilities explicitly approved by the user to blocked workers for this session.',
    parameters: grantSchema,
    async execute(_id, input: Static<typeof grantSchema>) {
      const requested = [...new Set(input.capabilities)] as AgentCapability[]
      const grantable = new Set(supervisor.getGrantableCapabilities())
      const invalid = requested.filter((capability) => !grantable.has(capability))
      if (invalid.length > 0) {
        throw new Error(
          `Capabilities were not requested by blocked workers or exceed the parent policy: ${invalid.join(', ')}`,
        )
      }
      const granted = supervisor.grantSessionCapabilities(requested)
      return textResult(
        `Granted for this session: ${granted.join(', ')}`,
        { capabilities: granted },
      )
    },
  }
}
