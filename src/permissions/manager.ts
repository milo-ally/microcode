/**
 * PermissionManager — central permission checking for tool execution.
 *
 * Follows microcode-ts's permission architecture with three modes:
 * - interactive: rules-based + ask for dangerous tools
 * - auto-approve: execute available capabilities without confirmation
 * - plan: compatibility mode mapped to read capabilities
 */

import type { AgentTool, BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core'
import { getToolDefinition } from '../tools/registry.ts'
import { matchRule, parseRuleString, ruleValueToString } from './rules.ts'
import type {
  AgentCapability,
  EffectivePolicy,
  PermissionBlockDetails,
  PermissionBehavior,
  PermissionDecision,
  PermissionMode,
  PermissionSnapshot,
  PermissionRule,
  PermissionRuleValue,
  NonInteractivePermissionStrategy,
  ToolPermissionContext,
} from './types.ts'
import { TOOL_DEFAULT_PERMISSIONS, ASK_USER_QUESTION_TOOL_NAME } from '../tools/index.ts'
import {
  ALL_CAPABILITIES,
  capabilitiesForMode,
  createCapabilityBlocker,
  requiredCapability,
} from './capabilities.ts'

function blockedDecision(
  reason: string,
  blocker?: PermissionBlockDetails,
): PermissionDecision {
  const decision: PermissionDecision = { allowed: false, reason }
  if (blocker) {
    Object.defineProperty(decision, 'blocker', {
      value: blocker,
      enumerable: false,
    })
  }
  return decision
}

export interface PermissionManagerOptions {
  mode?: PermissionMode
  allowedTools?: string[]
  deniedTools?: string[]
  askTools?: string[]
  onPermissionRequest?: (
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ) => Promise<boolean>
  onAskUserQuestion?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<{ answers?: Record<string, string>; block?: boolean }>
  nonInteractiveStrategy?: NonInteractivePermissionStrategy
  onDelegatePermissionRequest?: (
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ) => Promise<boolean>
  /** Resolver to look up a tool instance from the owning Agent tool manager. */
  getTool?: (name: string) => AgentTool<any, any> | undefined
  capabilities?: AgentCapability[]
  onPermissionBlocked?: (blocker: PermissionBlockDetails) => Promise<void> | void
}

export class PermissionManager {
  private context: ToolPermissionContext
  private onPermissionRequest?: (
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ) => Promise<boolean>
  private onAskUserQuestion?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<{ answers?: Record<string, string>; block?: boolean }>
  private nonInteractiveStrategy: NonInteractivePermissionStrategy
  private onDelegatePermissionRequest?: (
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ) => Promise<boolean>
  private getTool?: (name: string) => AgentTool<any, any> | undefined
  private configuredCapabilities: Set<AgentCapability>
  private onPermissionBlocked?: (blocker: PermissionBlockDetails) => Promise<void> | void

  constructor(options: PermissionManagerOptions = {}) {
    const allowRules: PermissionRule[] = []
    const denyRules: PermissionRule[] = []
    const askRules: PermissionRule[] = []

    for (const spec of options.allowedTools ?? []) {
      const value = parseRuleString(spec)
      allowRules.push({ ...value, behavior: 'allow', source: 'cliArg' })
    }
    for (const spec of options.deniedTools ?? []) {
      const value = parseRuleString(spec)
      denyRules.push({ ...value, behavior: 'deny', source: 'cliArg' })
    }
    for (const spec of options.askTools ?? []) {
      const value = parseRuleString(spec)
      askRules.push({ ...value, behavior: 'ask', source: 'cliArg' })
    }

    this.configuredCapabilities = new Set(options.capabilities ?? ALL_CAPABILITIES)
    this.context = {
      mode: options.mode ?? 'interactive',
      capabilities: capabilitiesForMode(
        options.mode ?? 'interactive',
        this.configuredCapabilities,
      ),
      approvedCapabilities: new Set(),
      allowRules,
      denyRules,
      askRules,
    }
    this.onPermissionRequest = options.onPermissionRequest
    this.onAskUserQuestion = options.onAskUserQuestion
    this.nonInteractiveStrategy = options.nonInteractiveStrategy ?? 'deny'
    this.onDelegatePermissionRequest = options.onDelegatePermissionRequest
    this.getTool = options.getTool
    this.onPermissionBlocked = options.onPermissionBlocked
  }

  setOnPermissionRequest(
    handler: (
      toolName: string,
      input: Record<string, unknown>,
      description: string,
    ) => Promise<boolean>,
  ): void {
    this.onPermissionRequest = handler
  }

  setOnAskUserQuestion(
    handler: (
      toolName: string,
      input: Record<string, unknown>,
    ) => Promise<{ answers?: Record<string, string>; block?: boolean }>,
  ): void {
    this.onAskUserQuestion = handler
  }

  setOnDelegatePermissionRequest(
    handler: (
      toolName: string,
      input: Record<string, unknown>,
      description: string,
    ) => Promise<boolean>,
  ): void {
    this.onDelegatePermissionRequest = handler
  }

  setGetTool(
    resolver: (name: string) => AgentTool<any, any> | undefined,
  ): void {
    this.getTool = resolver
  }

  getMode(): PermissionMode {
    return this.context.mode
  }

  setMode(mode: PermissionMode): void {
    this.context.mode = mode
    this.context.capabilities = capabilitiesForMode(mode, this.configuredCapabilities)
  }

  setCapabilities(capabilities: Iterable<AgentCapability>): void {
    this.configuredCapabilities = new Set(capabilities)
    this.context.capabilities = capabilitiesForMode(
      this.context.mode,
      this.configuredCapabilities,
    )
  }

  setApprovedCapabilities(capabilities: Iterable<AgentCapability>): void {
    this.context.approvedCapabilities = new Set(capabilities)
  }

  getEffectivePolicy(): Readonly<EffectivePolicy> {
    return Object.freeze({
      approvalMode: this.context.mode === 'auto-approve' ? 'auto-approve' : 'interactive',
      capabilities: new Set(this.context.capabilities),
      approvedCapabilities: new Set(this.context.approvedCapabilities),
      rules: Object.freeze([
        ...this.context.denyRules,
        ...this.context.askRules,
        ...this.context.allowRules,
      ].map((rule) => Object.freeze({ ...rule }))),
    })
  }

  addRule(rule: PermissionRule): void {
    const list = this.getRuleList(rule.behavior)
    list.push({ ...rule })
  }

  removeRule(ruleValue: PermissionRuleValue, behavior: PermissionBehavior): void {
    const list = this.getRuleList(behavior)
    const idx = list.findIndex(
      (r) =>
        r.toolName.toLowerCase() === ruleValue.toolName.toLowerCase() &&
        r.ruleContent === ruleValue.ruleContent,
    )
    if (idx !== -1) list.splice(idx, 1)
  }

  /**
   * Add a session-level allow rule. These rules last for the lifetime of the
   * session and are checked before mode defaults.
   */
  addSessionRule(toolName: string, ruleContent?: string): void {
    this.context.allowRules.push({
      toolName,
      ruleContent,
      behavior: 'allow',
      source: 'session',
    })
  }

  getContext(): ToolPermissionContext {
    return {
      mode: this.context.mode,
      capabilities: new Set(this.context.capabilities),
      approvedCapabilities: new Set(this.context.approvedCapabilities),
      allowRules: this.context.allowRules.map((rule) => ({ ...rule })),
      denyRules: this.context.denyRules.map((rule) => ({ ...rule })),
      askRules: this.context.askRules.map((rule) => ({ ...rule })),
    }
  }

  getSnapshot(): Readonly<PermissionSnapshot> {
    const freezeRules = (rules: PermissionRule[]): readonly Readonly<PermissionRule>[] =>
      Object.freeze(rules.map((rule) => Object.freeze({ ...rule })))

    return Object.freeze({
      mode: this.context.mode,
      approvalMode: this.context.mode === 'auto-approve' ? 'auto-approve' : 'interactive',
      capabilities: Object.freeze([...this.context.capabilities]),
      approvedCapabilities: Object.freeze([...this.context.approvedCapabilities]),
      nonInteractiveStrategy: this.nonInteractiveStrategy,
      allowRules: freezeRules(this.context.allowRules),
      denyRules: freezeRules(this.context.denyRules),
      askRules: freezeRules(this.context.askRules),
    })
  }

  /**
   * Replace all rules from a parent snapshot (permission inheritance).
   * Worker-specific deny rules are merged in on top.
   */
  inheritFrom(snapshot: PermissionSnapshot, extraDeny: PermissionRuleValue[] = [], updateMode = true): void {
    this.context.allowRules = snapshot.allowRules.map((r) => ({ ...r }))
    this.context.denyRules = [
      ...snapshot.denyRules.map((r) => ({ ...r })),
      ...extraDeny.map((v) => ({ ...v, behavior: 'deny' as const, source: 'session' as const })),
    ]
    this.context.askRules = snapshot.askRules.map((r) => ({ ...r }))
    if (updateMode) {
      this.setMode(snapshot.mode)
    }
  }

  /**
   * Core permission check — returns a decision.
   */
  checkPermission(
    toolName: string,
    input: Record<string, unknown>,
  ): PermissionDecision {
    const { mode } = this.context
    const requirement = requiredCapability(toolName, input)

    // Priority: deny > capability boundary > ask > allow > approval default.
    const denyMatch = matchRule(toolName, input, this.context.denyRules)
    if (denyMatch) {
      const reason = `Tool "${toolName}" denied by rule: ${ruleValueToString(denyMatch)}`
      return blockedDecision(
        reason,
        requirement.capability
          ? createCapabilityBlocker(
              toolName,
              input,
              requirement.capability,
              requirement.operation,
              reason,
            )
          : undefined,
      )
    }

    if (
      requirement.capability &&
      !this.context.capabilities.has(requirement.capability)
    ) {
      const blocker = createCapabilityBlocker(
        toolName,
        input,
        requirement.capability,
        requirement.operation,
        requirement.reason,
      )
      return blockedDecision(blocker.reason, blocker)
    }

    const askMatch = matchRule(toolName, input, this.context.askRules)
    if (askMatch) {
      return { allowed: false, reason: 'ask' }
    }

    const allowMatch = matchRule(toolName, input, this.context.allowRules)
    if (allowMatch) {
      return { allowed: true }
    }

    if (
      requirement.capability === 'commands.read' ||
      (requirement.capability &&
        this.context.approvedCapabilities.has(requirement.capability))
    ) {
      return { allowed: true }
    }

    if (mode === 'auto-approve' && toolName !== ASK_USER_QUESTION_TOOL_NAME) {
      return { allowed: true }
    }

    // Default behaviors for known tools
    const defaultBehavior = TOOL_DEFAULT_PERMISSIONS[toolName]
    if (defaultBehavior === 'allow') {
      return { allowed: true }
    }

    // All other tools default to ask
    return { allowed: false, reason: 'ask' }
  }

  /**
   * Full permission check with async prompt support.
   * Used as the `beforeToolCall` hook.
   */
  async checkPermissionWithPrompt(
    ctx: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> {
    const toolName = ctx.toolCall.name
    const input = (ctx.args ?? ctx.toolCall.arguments) as Record<string, unknown>
    const decision = this.checkPermission(toolName, input)

    if (decision.allowed) return undefined

    // Denied by rule
    if (decision.reason !== 'ask') {
      if (decision.blocker) await this.onPermissionBlocked?.(decision.blocker)
      return { block: true, reason: decision.reason }
    }

    // ★ Elegant: for ask_user_question, the permission flow IS the tool's functionality.
    // Instead of a generic "allow/deny" prompt, we hijack the 'ask' path to run an
    // interactive Q&A session. Answers are stored on the tool object so execute()
    // can read them — the tool and the permission system are symbiotic.
    if (toolName === ASK_USER_QUESTION_TOOL_NAME && this.onAskUserQuestion) {
      const result = await this.onAskUserQuestion(toolName, input)
      if (result.block) {
        return { block: true, reason: `User cancelled question for "${toolName}"` }
      }
      // Store answers on the tool object so execute() can read them
      if (result.answers && this.getTool) {
        const tool = this.getTool(toolName) as any
        if (tool?.setAnswers) {
          tool.setAnswers(result.answers)
        }
      }
      return undefined
    }

    // Ask behavior — prompt user
    if (!this.onPermissionRequest) {
      if (
        this.nonInteractiveStrategy === 'delegate-to-parent' &&
        this.onDelegatePermissionRequest
      ) {
        const description = this.formatToolDescription(toolName, input)
        const approved = await this.onDelegatePermissionRequest(toolName, input, description)
        if (approved) return undefined
        return {
          block: true,
          reason: `Permission denied by parent agent for "${toolName}"`,
        }
      }

      const requirement = requiredCapability(toolName, input)
      if (requirement.capability) {
        await this.onPermissionBlocked?.(createCapabilityBlocker(
          toolName,
          input,
          requirement.capability,
          requirement.operation,
          `Permission approval is required for "${toolName}".`,
        ))
      }
      return { block: true, reason: `Permission required for "${toolName}" (non-interactive mode)` }
    }

    const description = this.formatToolDescription(toolName, input)
    const approved = await this.onPermissionRequest(toolName, input, description)
    if (approved) return undefined

    return { block: true, reason: `Permission denied by user for "${toolName}"` }
  }

  private getRuleList(behavior: PermissionBehavior): PermissionRule[] {
    switch (behavior) {
      case 'allow':
        return this.context.allowRules
      case 'deny':
        return this.context.denyRules
      case 'ask':
        return this.context.askRules
    }
  }

  private formatToolDescription(
    toolName: string,
    input: Record<string, unknown>,
  ): string {
    const def = getToolDefinition(toolName)
    if (def?.formatDescription) {
      return def.formatDescription(input)
    }
    return `${toolName}(${JSON.stringify(input).slice(0, 100)})`
  }
}
