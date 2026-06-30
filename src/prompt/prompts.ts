import type { McpServerState } from '../mcp/types.ts'
import type { Skill } from '../skill/skill.ts'
import { formatSkillsForPrompt } from '../skill/skill.ts'
import { getMcpInstructionsSection } from '../mcp/prompt.ts'
import { getAskUserQuestionSection } from '../tools/AskUserQuestionTool/prompt.ts'
import { getTaskToolSection } from '../tools/TaskTool/prompt.ts'
import { getDeferredToolsSection, getUsingYourToolsSection } from '../tools/prompt.ts'
import {
  getActionsSection,
  getDoingTasksSection,
  getIntroSection,
  getOutputEfficiencySection,
  getSystemSection,
  getToneAndStyleSection,
} from './base.ts'
import { getEnvInfoSection } from './environment.ts'

export interface GetSystemPromptOptions {
  cwd: string
  modelId: string
  mcpServers?: McpServerState[]
  skills?: Skill[]
  /** Names of tools that are deferred (discovered via ToolSearchTool). */
  deferredToolNames?: string[]
}

function getSkillsInstructionsSection(skills: Skill[] | undefined): string | null {
  if (!skills || skills.length === 0) return null

  return formatSkillsForPrompt(skills)
}

export function getSystemPrompt(options: GetSystemPromptOptions): string[] {
  const { cwd, modelId, mcpServers, skills, deferredToolNames } = options

  return [
    getIntroSection(),
    getSystemSection(),
    getDoingTasksSection(),
    getActionsSection(),
    getUsingYourToolsSection(),
    getToneAndStyleSection(),
    getOutputEfficiencySection(),
    getAskUserQuestionSection(),
    getTaskToolSection(),
    getEnvInfoSection(cwd, modelId),
    getMcpInstructionsSection(mcpServers),
    getSkillsInstructionsSection(skills),
    getDeferredToolsSection(deferredToolNames),
  ].filter((s): s is string => s !== null)
}
