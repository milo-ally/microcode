/**
 * Permission type definitions for microcode-pi.
 *
 * Follows microcode-ts's permission architecture with simplified modes
 * and rule-based access control for tool execution.
 */

// ============================================================================
// Permission Modes
// ============================================================================

export const PERMISSION_MODES = ['interactive', 'auto-approve', 'plan'] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]
export type ApprovalMode = Exclude<PermissionMode, 'plan'>

export const AGENT_CAPABILITIES = [
  'files.read',
  'files.write',
  'commands.read',
  'commands.mutate',
  'network',
  'agents.spawn',
] as const
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number]

// ============================================================================
// Permission Behaviors
// ============================================================================

export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type NonInteractivePermissionStrategy = 'deny' | 'delegate-to-parent'

// ============================================================================
// Permission Rules
// ============================================================================

export type PermissionRuleSource =
  | 'globalSettings'
  | 'projectSettings'
  | 'cliArg'
  | 'session'

export interface PermissionRule {
  toolName: string
  ruleContent?: string
  behavior: PermissionBehavior
  source: PermissionRuleSource
}

export interface PermissionRuleValue {
  toolName: string
  ruleContent?: string
}

// ============================================================================
// Permission Decisions
// ============================================================================

export type PermissionDecision =
  | { allowed: true }
  | {
      allowed: false
      reason: string
      blocker?: PermissionBlockDetails
    }

export interface PermissionBlockDetails {
  type: 'permission'
  toolName: string
  operation: string
  requiredCapability: AgentCapability
  reason: string
  retryable: boolean
  inputSummary: string
}

export interface EffectivePolicy {
  approvalMode: ApprovalMode
  capabilities: ReadonlySet<AgentCapability>
  approvedCapabilities: ReadonlySet<AgentCapability>
  rules: readonly Readonly<PermissionRule>[]
}

// ============================================================================
// Permission Context
// ============================================================================

export interface ToolPermissionContext {
  mode: PermissionMode
  capabilities: Set<AgentCapability>
  approvedCapabilities: Set<AgentCapability>
  allowRules: PermissionRule[]
  denyRules: PermissionRule[]
  askRules: PermissionRule[]
}

export interface PermissionSnapshot {
  readonly mode: PermissionMode
  readonly approvalMode: ApprovalMode
  readonly capabilities: readonly AgentCapability[]
  readonly approvedCapabilities: readonly AgentCapability[]
  readonly nonInteractiveStrategy: NonInteractivePermissionStrategy
  readonly allowRules: readonly Readonly<PermissionRule>[]
  readonly denyRules: readonly Readonly<PermissionRule>[]
  readonly askRules: readonly Readonly<PermissionRule>[]
}
