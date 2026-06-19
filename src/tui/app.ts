import type { Agent, AgentEvent, AgentMessage, ThinkingLevel } from '@earendil-works/pi-agent-core'
import { generateSummary, DEFAULT_COMPACTION_SETTINGS } from '@earendil-works/pi-agent-core'
import type { Api, AssistantMessage } from '@earendil-works/pi-ai'
import { completeSimple } from '@earendil-works/pi-ai'
import {
  TUI,
  ProcessTerminal,
  Container,
  Text,
  Spacer,
  Loader,
  SelectList,
  type SelectItem,
  type Component,
  type AutocompleteProvider,
  type SlashCommand,
} from '@earendil-works/pi-tui'
import chalk from 'chalk'
import { resolveConfig, createModelForId, type ResolvedConfig } from '../config.ts'
import { getAllModels, resolveApiKey } from '../models/index.ts'
import { getSystemPrompt } from '../constants/prompts.ts'
import { theme, getEditorTheme, getMarkdownTheme, getBashModeBorderColor } from './theme.ts'
import { MicrocodeEditor } from './components/microcodeEditor.ts'
import { FooterComponent } from './components/footer.ts'
import { AssistantMessageComponent } from './components/assistantMessage.ts'
import { ToolExecutionComponent } from './components/toolExecution.ts'
import { BashExecutionComponent } from './components/bashExecution.ts'
import { getToolUIConstructor, type ToolUIComponent } from '../tools/registry.ts'
import { UserMessage } from './components/userMessage.ts'
import type { ImageContent } from '@earendil-works/pi-ai'
import { modelSupportsImages } from '../models/index.ts'
import {
  collectImagePathsFromText,
  stripImagePathsFromText,
  tryReadImageFromPath,
  storeImage,
  unquotePath,
  IMAGE_EXTENSION_REGEX,
  type CachedImage,
} from '../utils/imageUtils.ts'
import { existsSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import type { McpClientManager } from '../mcp/client.ts'
import type { McpServerState, McpServerConfig } from '../mcp/types.ts'
import { TOOL_NAME as BASH_TOOL_NAME } from '../tools/BashTool/BashTool.ts'
import { TOOL_NAME as READ_TOOL_NAME } from '../tools/FileReadTool/FileReadTool.ts'
import { TOOL_NAME as WRITE_TOOL_NAME } from '../tools/FileWriteTool/FileWriteTool.ts'
import { TOOL_NAME as EDIT_TOOL_NAME } from '../tools/FileEditTool/FileEditTool.ts'
import { addMcpServer, removeMcpServer, type ConfigScope } from '../mcp/configWrite.ts'
import { SessionManager } from '../session/SessionManager.ts'
import { getCompactionManager, getSkills, getSkillDiagnostics, rebuildCoreTools, isSkillLoaded, loadSkillIntoPrompt, unloadSkillFromPrompt } from '../agent.ts'
import { readSkillBody, type Skill } from '../skill/skill.ts'
import { createMcpTools, createListMcpResourcesTool, createReadMcpResourceTool, registerMcpToolsAsDeferred, getDeferredToolNames } from '../tools/index.ts'
import { PermissionManager, type PermissionMode, PERMISSION_MODES } from '../permissions/index.ts'

declare const MACRO: {
  VERSION: string
}

const APP_NAME = 'Microcode'

function countStreamingLines(content: string): number {
  if (!content) return 0
  let lines = 1
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lines++
  }
  return content.endsWith('\n') ? lines - 1 : lines
}

const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', description: 'Clear the conversation history' },
  { name: 'compact', description: 'Compress conversation context (usage: /compact [instructions])', argumentHint: '[instructions]' },
  { name: 'model', description: 'Show or switch model (usage: /model [model-id])', argumentHint: '[model-id]' },
  { name: 'thinking', description: 'Show or set thinking depth (usage: /thinking [level])', argumentHint: '[off|minimal|low|medium|high|xhigh]' },
  { name: 'mcp', description: 'Manage MCP servers (usage: /mcp [add|remove|enable|disable|reconnect] [args...])', argumentHint: '[action] [args...]' },
  { name: 'session', description: 'Browse and load saved sessions', argumentHint: '' },
  { name: 'new', description: 'Start a new conversation session' },
  { name: 'permission', description: 'Show or switch permission mode (usage: /permission [mode])', argumentHint: '[mode]' },
  { name: 'skills', description: 'Show available skills' },
  { name: 'exit', description: 'Exit Microcode' },
  { name: 'help', description: 'Show help and available commands' },
]

export class App {
  private ui: TUI
  private headerContainer: Container
  private chatContainer: Container
  private statusContainer: Container
  private editorContainer: Container
  private agent: Agent
  private editor!: MicrocodeEditor
  private footer: FooterComponent
  private isInitialized = false
  private streamingComponent?: AssistantMessageComponent
  private streamingMessage?: AssistantMessage
  private pendingTools = new Map<string, ToolUIComponent>()
  private pendingToolStartedAt = new Map<string, number>()
  private streamingToolLastRenderAt = new Map<string, number>()
  private toolExecutionInProgress = false // Track if any tool is currently executing
  private loadingAnimation?: Loader
  private lastSigintTime = 0
  private config: ResolvedConfig
  private mcpClient?: McpClientManager
  private sessionManager: SessionManager
  private compacting = false
  private permissionPromptActive = false
  private permissionManager: PermissionManager
  private isBashMode = false
  private bashComponent?: BashExecutionComponent
  private startupWarnings: string[] = []
  private pendingImages: CachedImage[] = []
  private imagePathProcessing = false
  private suppressTrailingQuote = false
  private titleGenerated = false
  onExit?: () => void | Promise<void>

  constructor(agent: Agent, mcpClient?: McpClientManager, sessionManager?: SessionManager, permissionManager?: PermissionManager, modelId?: string, thinkingLevel?: ThinkingLevel) {
    this.agent = agent
    this.mcpClient = mcpClient
    this.sessionManager = sessionManager ?? new SessionManager()
    this.permissionManager = permissionManager ?? new PermissionManager()
    this.config = modelId ? createModelForId(modelId) : resolveConfig()
    this.ui = new TUI(new ProcessTerminal())
    this.headerContainer = new Container()
    this.chatContainer = new Container()
    this.statusContainer = new Container()
    this.editorContainer = new Container()
    this.footer = new FooterComponent(
      agent,
      this.config.model.id,
      this.config.provider,
      process.cwd(),
      thinkingLevel ?? agent.state.thinkingLevel,
    )

    // Initialize system prompt token count for context usage display
    const compactionManager = getCompactionManager(agent)
    if (compactionManager && agent.state.systemPrompt) {
      compactionManager.setSystemPrompt(agent.state.systemPrompt)
    }
  }

  getSessionManager(): SessionManager {
    return this.sessionManager
  }

  /** Queue a warning to be shown in the chat area after TUI initializes. */
  addStartupWarning(message: string): void {
    this.startupWarnings.push(message)
  }

  async run(): Promise<void> {
    this.init()
    this.setupAgentSubscription()

    // Show existing session title in footer (e.g., from --resume)
    const currentId = this.sessionManager.getSessionId()
    if (currentId) {
      const existingTitle = this.sessionManager.getTitle(currentId)
      if (existingTitle) {
        this.footer.setSessionTitle(existingTitle)
        this.footer.invalidate()
        this.ui.requestRender()
      }
    }

    // Show any queued startup warnings
    for (const msg of this.startupWarnings) {
      this.chatContainer.addChild(new Text(chalk.hex('#ffff00')(`⚠ ${msg}`), 1, 0))
      this.chatContainer.addChild(new Spacer(1))
    }
    if (this.startupWarnings.length > 0) {
      this.ui.requestRender()
    }

    // Main interactive loop
    while (true) {
      const rawInput = await this.getUserInput()
      if (!rawInput.trim()) continue

      // Handle bash commands (! for normal, !! for excluded from context)
      if (rawInput.startsWith('!')) {
        const isExcluded = rawInput.startsWith('!!')
        const command = isExcluded ? rawInput.slice(2).trim() : rawInput.slice(1).trim()
        if (command) {
          await this.handleBashCommand(command, isExcluded)
          this.isBashMode = false
          continue
        }
      }

      // Handle slash commands locally
      if (rawInput.startsWith('/')) {
        const handled = this.handleSlashCommand(rawInput.trim())
        if (handled) continue
      }

      // --- Image processing at submit time ---
      // If pendingImages were already populated by onChange, skip re-scanning.
      const imagePaths = this.pendingImages.length === 0
        ? collectImagePathsFromText(rawInput)
        : []
      const userInput = stripImagePathsFromText(rawInput)

      if (imagePaths.length > 0) {
        if (modelSupportsImages(this.agent.state.model)) {
          for (const filePath of imagePaths) {
            const image = tryReadImageFromPath(filePath)
            if (image) {
              const sessionId = this.sessionManager.getSessionId() ?? 'unknown'
              const { cachePath, fileName } = storeImage(image.data, image.mimeType, sessionId)
              this.pendingImages.push({ cachePath, fileName, mimeType: image.mimeType, base64Data: image.data })
            }
          }
        } else {
          this.showStatus(
            chalk.hex('#ffff00')(
              'Warning: Current model does not support image input. Switch to a vision-capable model (e.g. Gemini, MiMo v2.5).',
            ),
          )
        }
      }

      // Skip if nothing to send (no text and no images)
      const images = this.getPendingImageContents()
      if (!userInput.trim() && images.length === 0) continue

      // Add user message to chat (with grey background)
      this.chatContainer.addChild(new UserMessage(userInput, images.length > 0 ? images : undefined))
      this.chatContainer.addChild(new Spacer(1))
      this.ui.requestRender()

      try {
        if (images.length > 0) {
          await this.agent.prompt(userInput, images)
        } else {
          await this.agent.prompt(userInput)
        }
        this.clearPendingImages()
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        this.chatContainer.addChild(
          new Text(chalk.hex('#cc6666')(`Error: ${errorMessage}`), 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
        this.ui.requestRender()
      }
    }
  }

  private init(): void {
    if (this.isInitialized) return

    // Header: logo + compact keybinding hints (matching pi-coding-agent style)
    const logo = theme.bold(theme.fg('accent', APP_NAME)) + theme.dim(` v${MACRO.VERSION}`)
    const compactInstructions = [
      theme.dim('escape') + theme.dim(' interrupt'),
      theme.dim('ctrl+c/ctrl+d') + theme.dim(' exit'),
      theme.dim('/') + theme.dim(' commands'),
      theme.dim('!') + theme.dim(' shell'),
    ].join(theme.dim(' · '))
    const onboarding = theme.dim(
      `${APP_NAME} can explain its own features and help you write, edit, and understand code. Ask it anything.`,
    )

    this.headerContainer.addChild(new Spacer(1))
    this.headerContainer.addChild(new Text(`${logo}  ${compactInstructions}`, 1, 0))
    this.headerContainer.addChild(new Text(onboarding, 1, 0))
    this.headerContainer.addChild(new Spacer(1))

    // Editor with border
    this.editor = new MicrocodeEditor(this.ui, getEditorTheme(), { paddingX: 1 })

    // Set up slash command autocomplete
    this.setupSlashCommands()

    this.editor.onSubmit = (text: string) => {
      this.handleEditorSubmit(text)
    }

    // Detect bash mode (! prefix)
    this.editor.onChange = (text: string) => {
      const wasBashMode = this.isBashMode
      this.isBashMode = text.trimStart().startsWith('!')
      if (wasBashMode !== this.isBashMode) {
        this.updateEditorBorderColor()
      }

      if (this.imagePathProcessing) return

      // Suppress trailing quote left behind after an image path was stripped.
      // Terminal drag-drop sends characters one by one. When a path is quoted
      // (e.g. '/path/file.jpg'), the regex may match before the closing quote
      // arrives. After we replace the path with a placeholder, the closing quote
      // arrives as a separate event — strip it from the end of the text.
      if (this.suppressTrailingQuote) {
        this.suppressTrailingQuote = false
        if (text.endsWith("'") || text.endsWith('"')) {
          this.editor.setText(text.slice(0, -1))
          return
        }
      }

      // Scan for image file paths.
      // Quoted paths (with spaces) require both quotes to match, so the closing
      // quote has already arrived and processing is safe.
      // Unquoted paths match immediately; the trailing quote (if any) will be
      // handled by suppressTrailingQuote above on the next onChange.
      const imagePaths = collectImagePathsFromText(text)
      if (imagePaths.length > 0) {
        this.imagePathProcessing = true

        const newImages: CachedImage[] = []
        if (modelSupportsImages(this.agent.state.model)) {
          for (const filePath of imagePaths) {
            const image = tryReadImageFromPath(filePath)
            if (image) {
              const sessionId = this.sessionManager.getSessionId() ?? 'unknown'
              const { cachePath, fileName } = storeImage(image.data, image.mimeType, sessionId)
              newImages.push({ cachePath, fileName, mimeType: image.mimeType, base64Data: image.data })
            }
          }
        } else {
          this.showStatus(
            chalk.hex('#ffff00')(
              'Warning: Current model does not support image input. Switch to a vision-capable model.',
            ),
          )
        }

        this.pendingImages = newImages

        let clean = stripImagePathsFromText(text)
        if (newImages.length > 0) {
          const markers = newImages.map(img => `[Image: ${img.fileName}]`).join(' ')
          clean = clean ? `${clean} ${markers}` : markers
        }
        // setText triggers onChange synchronously; imagePathProcessing guard
        // prevents the suppressTrailingQuote check from firing prematurely.
        this.editor.setText(clean)
        this.suppressTrailingQuote = true
        this.imagePathProcessing = false
      }
    }

    // App-level key handlers on the Editor (pi-coding-agent pattern)
    this.editor.onEscape = () => {
      const now = Date.now()
      if (now - this.lastSigintTime < 500) {
        this.exit()
      }
      this.lastSigintTime = now
      this.editor.setText('')
    }
    this.editor.onCtrlC = () => {
      if (this.permissionPromptActive) {
        this.exit()
      } else if (this.isAgentBusy()) {
        this.agent.abort()
      } else {
        this.exit()
      }
    }
    this.editor.onCtrlD = () => {
      this.exit()
    }

    this.editorContainer.addChild(this.editor)

    // Assemble UI layout (matching pi-coding-agent order)
    this.ui.addChild(this.headerContainer)
    this.ui.addChild(this.chatContainer)
    this.ui.addChild(this.statusContainer)
    this.ui.addChild(this.editorContainer)
    this.ui.addChild(this.footer)

    this.ui.setFocus(this.editor)
    this.ui.start()
    this.isInitialized = true
  }

  private setupSlashCommands(): void {
    const provider: AutocompleteProvider = {
      getSuggestions: async (
        lines: string[],
        cursorLine: number,
        cursorCol: number,
        _options: { signal: AbortSignal; force?: boolean },
      ) => {
        const currentLine = lines[cursorLine] ?? ''
        const textBeforeCursor = currentLine.slice(0, cursorCol)

        if (!textBeforeCursor.startsWith('/')) return null

        const query = textBeforeCursor.slice(1).toLowerCase()
        const builtinMatches = BUILTIN_SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query))

        const skills = getSkills(this.agent)
        const skillMatches = skills
          .filter(s => !s.disableModelInvocation && s.name.startsWith(query))
          .map(s => ({
            value: `/${s.name}`,
            label: `/${s.name}`,
            description: s.description,
          }))

        const allMatches = [
          ...builtinMatches.map(cmd => ({
            value: `/${cmd.name}`,
            label: `/${cmd.name}${cmd.argumentHint ? ` ${cmd.argumentHint}` : ''}`,
            description: cmd.description ?? '',
          })),
          ...skillMatches,
        ]

        if (allMatches.length === 0) return null

        return {
          items: allMatches,
          prefix: textBeforeCursor,
        }
      },

      applyCompletion: (
        lines: string[],
        cursorLine: number,
        _cursorCol: number,
        item: { value: string; label: string; description?: string },
        _prefix: string,
      ) => {
        const newLines = [...lines]
        newLines[cursorLine] = item.value + ' '
        return {
          lines: newLines,
          cursorLine,
          cursorCol: item.value.length + 1,
        }
      },
    }

    this.editor.setAutocompleteProvider(provider)
  }

  private async handleBashCommand(command: string, excludeFromContext = false): Promise<void> {
    // Create UI component for display
    this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext)
    this.chatContainer.addChild(this.bashComponent)
    this.ui.requestRender()

    try {
      const { exec } = await import('child_process')
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        const output = stdout + stderr
        if (output) {
          this.bashComponent?.appendOutput(output)
        }
        const exitCode = error ? error.code ?? 1 : 0
        this.bashComponent?.setComplete(exitCode, false)
        this.bashComponent = undefined
        this.updateEditorBorderColor()
        this.ui.requestRender()
      })
    } catch (error) {
      if (this.bashComponent) {
        this.bashComponent.setComplete(undefined, false)
      }
      this.showError(`Bash command failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      this.bashComponent = undefined
      this.updateEditorBorderColor()
    }
  }

  private updateEditorBorderColor(): void {
    if (this.isBashMode) {
      this.editor.borderColor = getBashModeBorderColor()
    } else {
      this.editor.borderColor = (text: string) => theme.fg('blue', text)
    }
    this.ui.requestRender()
  }

  private handleSlashCommand(input: string): boolean {
    this.editor.addToHistory(input)
    const parts = input.split(/\s+/)
    const command = parts[0]?.toLowerCase()
    const args = parts.slice(1).join(' ')

    switch (command) {
      case '/clear':
        this.chatContainer.clear()
        this.showStatus('Conversation cleared.')
        return true

      case '/compact':
        this.handleCompactCommand(args)
        return true

      case '/model':
        this.handleModelCommand(args || undefined)
        return true

      case '/mcp':
        this.handleMcpCommand(args)
        return true

      case '/session':
        this.handleSessionCommand(args)
        return true

      case '/permission':
        this.handlePermissionCommand(args)
        return true

      case '/thinking':
        this.handleThinkingCommand(args)
        return true

      case '/skills':
        this.handleSkillsCommand()
        return true

      case '/exit':
        this.exit()
        return true

      case '/new':
        this.handleNewSession()
        return true

      case '/help':
        this.showHelp()
        return true

      default: {
        // Check if command matches a loaded skill
        const skillName = command?.startsWith('/') ? command.slice(1) : ''
        const skills = getSkills(this.agent)
        const skill = skills.find(s => s.name === skillName && !s.disableModelInvocation)
        if (skill) {
          this.handleSkillSlashCommand(skill)
          return true
        }
        this.showError(`Unknown command: ${command}. Type /help for available commands.`)
        return true
      }
    }
  }

  private async handleCompactCommand(args: string): Promise<void> {
    if (this.compacting) {
      this.showError('Compaction already in progress.')
      return
    }

    const customInstructions = args.trim() || undefined
    this.compacting = true

    const progressText = new Text(
      theme.fg('accent', '⟳ Compacting conversation context...'),
      1,
      0,
    )
    this.chatContainer.addChild(progressText)
    this.ui.requestRender()

    try {
      const session = this.sessionManager.getSession()
      if (!session) throw new Error('No active session')

      // Get session branch entries
      const entries = await session.getBranch() as any[]

      // Find the first actual message entry (skip session header, etc.)
      const firstMsgEntry = entries.find(e => e.type === 'message')
      if (!firstMsgEntry) throw new Error('No messages to compact')

      // Extract messages to summarize (skip compaction entries, keep messages)
      const messagesToSummarize: AgentMessage[] = []
      for (const entry of entries) {
        if (entry.type === 'message') {
          const msg = entry.message
          if (msg.role !== 'compactionSummary') {
            messagesToSummarize.push(msg)
          }
        }
      }
      if (messagesToSummarize.length === 0) throw new Error('No messages to compact')

      // Calculate tokens before compaction
      const tokensBefore = messagesToSummarize.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content 
          : Array.isArray(m.content) ? m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
          : ''
        return sum + Math.ceil(content.length / 4)
      }, 0)

      // Generate summary via LLM
      const summaryResult = await generateSummary(
        messagesToSummarize,
        this.agent.state.model,
        DEFAULT_COMPACTION_SETTINGS.reserveTokens,
        this.config.apiKey,
        undefined,
        undefined,
        customInstructions,
      )
      if (!summaryResult.ok) {
        throw new Error(`Summarization failed: ${summaryResult.error.message}`)
      }
      const summary = summaryResult.value
      if (!summary || summary.trim().length === 0) {
        throw new Error('Summarization returned empty summary')
      }

      // Record compaction in session tree with correct firstKeptEntryId
      // Keep recent messages — find the entry that starts the recent window
      const msgEntries = entries.filter((e: any) => e.type === 'message')
      const keepMsgCount = Math.max(1, Math.floor(msgEntries.length * 0.3))
      const firstKeptMsgEntry = msgEntries[msgEntries.length - keepMsgCount] ?? firstMsgEntry
      const firstKeptEntryId = firstKeptMsgEntry.id
      await session.appendCompaction(summary, firstKeptEntryId, tokensBefore)

      // Build new agent messages: compaction summary + recent messages only
      const summaryText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${summary}\n</summary>`
      const summaryMsg: AgentMessage = {
        role: 'user',
        content: [{ type: 'text', text: summaryText }],
        timestamp: Date.now(),
      }
      const recentMessages = msgEntries.slice(-keepMsgCount).map((e: any) => e.message as AgentMessage)
      const newMessages: AgentMessage[] = [summaryMsg, ...recentMessages]

      // Update agent messages in-place
      const agentMsgs = this.agent.state.messages as AgentMessage[]
      agentMsgs.length = 0
      for (const msg of newMessages) {
        agentMsgs.push(msg)
      }

      // Set saved count to new length so next saveMessages only writes genuinely new messages
      this.sessionManager.setSavedMessageCount(newMessages.length)

      // Update footer
      this.updateContextUsage()
      this.footer.invalidate()
      const compactionManager = getCompactionManager(this.agent)
      if (compactionManager) {
        const usage = compactionManager.getContextUsage(agentMsgs)
        progressText.setText(
          theme.dim(`Compacted. Context: ${usage.percentUsed}% used (${Math.round(usage.tokens / 1000)}k/${Math.round(usage.contextWindow / 1000)}k)`),
        )
      } else {
        progressText.setText(theme.dim('Compacted.'))
      }
      this.chatContainer.addChild(new Spacer(1))
    } catch (error) {
      progressText.setText(
        chalk.hex('#cc6666')(`Compaction failed: ${error instanceof Error ? error.message : String(error)}`),
      )
      this.chatContainer.addChild(new Spacer(1))
    } finally {
      this.compacting = false
      this.ui.requestRender()
    }
  }

  private async handleSessionCommand(_args: string): Promise<void> {
    const sessions = await this.sessionManager.listWithTitles()
    const currentId = this.sessionManager.getSessionId()

    if (sessions.length === 0) {
      this.chatContainer.addChild(
        new Text(theme.dim('No saved sessions found.'), 1, 0),
      )
      this.chatContainer.addChild(new Spacer(1))
      this.ui.requestRender()
      return
    }

    const items: SelectItem[] = []
    for (const s of sessions.slice(0, 20)) {
      const isCurrent = s.id === currentId
      const prefix = isCurrent ? '* ' : '  '
      const date = new Date(s.createdAt).toLocaleString()
      const title = s.title ?? theme.dim('(no title)')
      const label = `${prefix}${title}`
      const desc = `${s.id.slice(0, 8)}  ${date}  ${s.cwd}${isCurrent ? ' (current)' : ''}`
      items.push({ value: s.id, label, description: desc })
    }
    items.push({ value: '__cancel__', label: 'Cancel', description: 'Return without loading' })

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => chalk.cyan(text),
      selectedText: (text) => chalk.cyan(text),
      description: (text) => theme.dim(text),
      scrollInfo: (text) => theme.dim(text),
      noMatch: (text) => theme.dim(text),
    })

    this.chatContainer.addChild(
      new Text(theme.fg('accent', 'Select a session to load:'), 1, 0),
    )
    this.chatContainer.addChild(selectList)
    this.ui.setFocus(selectList)
    this.ui.requestRender()

    let finished = false

    const removeListener = this.ui.addInputListener((data) => {
      if (data === '\x03') {
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)
        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        return { consume: true }
      }
      return undefined
    })

    const finish = async (value?: string) => {
      if (finished) return
      if (!value || value === '__cancel__') {
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)
        this.chatContainer.addChild(new Text(theme.dim('Cancelled.'), 1, 0))
        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        return
      }

      const selected = sessions.find((s) => s.id === value)
      if (!selected) return

      finished = true
      removeListener()
      this.chatContainer.removeChild(selectList)

      if (selected.id === currentId) {
        this.chatContainer.addChild(
          new Text(theme.dim('Already in this session.'), 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        return
      }

      try {
        // Save current session then load target
        const messages = await this.sessionManager.switchToSession(
          selected,
          this.agent.state.messages as AgentMessage[],
        )

        // Replace messages on agent
        this.agent.state.messages.length = 0
        this.agent.state.messages.push(...messages)

        // Rebuild system prompt preserving loaded skills
        this.rebuildSystemPromptForResume()

        // Clear and re-render chat
        this.rerenderChat(messages)

        this.chatContainer.addChild(
          new Text(theme.fg('accent', `Loaded session: ${selected.title ?? selected.id.slice(0, 8)}`), 1, 0),
        )
        this.chatContainer.addChild(
          new Text(theme.dim(`  ${selected.id}  ${new Date(selected.createdAt).toLocaleString()}`), 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
        this.updateContextUsage()
        // Show session title in footer
        this.footer.setSessionTitle(selected.title ?? null)
        this.footer.invalidate()
      } catch (error) {
        this.chatContainer.addChild(
          new Text(theme.fg('red', `Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`), 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
      }

      this.ui.setFocus(this.editor)
      this.ui.requestRender()
    }

    selectList.onSelect = (item) => finish(item.value)
    selectList.onCancel = () => finish(undefined)
  }

  private async handleNewSession(): Promise<void> {
    // Save current session
    await this.sessionManager.saveMessages(this.agent.state.messages as AgentMessage[])

    // Create new session
    const cwd = process.cwd()
    await this.sessionManager.create(cwd)

    // Reset state
    this.agent.state.messages.length = 0
    this.titleGenerated = false
    this.footer.setSessionTitle(null)
    this.footer.invalidate()

    // Clear chat and show confirmation
    this.chatContainer.clear()
    const newId = this.sessionManager.getSessionId()
    this.chatContainer.addChild(
      new Text(theme.fg('accent', `New session created: ${newId?.slice(0, 8)}`), 1, 0),
    )
    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  private async generateSessionTitle(): Promise<void> {
    const messages = this.agent.state.messages as AgentMessage[]
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return

    let text = ''
    if (typeof firstUser.content === 'string') {
      text = firstUser.content
    } else if (Array.isArray(firstUser.content)) {
      text = firstUser.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join(' ')
    }

    text = text.trim()
    if (!text) return

    const fallbackTitle = text.length > 60 ? text.slice(0, 57) + '...' : text

    let title = fallbackTitle
    try {
      const model = this.agent.state.model
      const apiKey = resolveApiKey(model)
      const result = await completeSimple(model, {
        systemPrompt: 'Generate a short, concise title (5 words max) for a conversation. Reply with ONLY the title, no quotes, no explanation.',
        messages: [{ role: 'user', content: [{ type: 'text', text: `Generate a title for a conversation that starts with: "${text.slice(0, 200)}"` }] }],
      } as any, { apiKey, maxTokens: 30, temperature: 0.3 })

      const titleContent = result.content.find((c: any) => c.type === 'text') as any
      if (titleContent?.text) {
        title = titleContent.text.trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      // Use fallback title
    }

    const sessionId = this.sessionManager.getSessionId()
    if (sessionId) {
      this.sessionManager.setTitle(sessionId, title)
      this.footer.setSessionTitle(title)
      this.footer.invalidate()
      this.ui.requestRender()
    }
  }

  /**
   * Rebuild system prompt for a resumed session, preserving loaded skills.
   */
  private rebuildSystemPromptForResume(): void {
    const basePrompt = (this.agent as any).__baseSystemPrompt as string
    const loadedSkills = (this.agent as any).__loadedSkills as Map<string, string> | undefined

    if (basePrompt) {
      let prompt = basePrompt
      if (loadedSkills && loadedSkills.size > 0) {
        for (const [name, body] of loadedSkills) {
          prompt += `\n\n# Skill: ${name}\n\n${body}`
        }
      }
      this.agent.state.systemPrompt = prompt
    }

    // Update compaction manager with new system prompt
    const compactionManager = getCompactionManager(this.agent)
    if (compactionManager) {
      compactionManager.setSystemPrompt(this.agent.state.systemPrompt)
    }
  }

  /**
   * Clear the chat container and re-render all messages from history.
   */
  private rerenderChat(messages: AgentMessage[]): void {
    this.chatContainer.clear()

    for (const msg of messages) {
      if (msg.role === 'user') {
        let text = ''
        let images: ImageContent[] | undefined
        if (typeof msg.content === 'string') {
          text = msg.content
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text)
          text = textParts.join('\n')
          const imageParts = msg.content.filter((c: any) => c.type === 'image') as ImageContent[]
          if (imageParts.length > 0) images = imageParts
        }
        this.chatContainer.addChild(new UserMessage(text, images))
        this.chatContainer.addChild(new Spacer(1))
      } else if (msg.role === 'assistant') {
        const component = new AssistantMessageComponent(getMarkdownTheme())
        component.updateContent(msg as any)
        this.chatContainer.addChild(component)
        this.chatContainer.addChild(new Spacer(1))
      } else if ((msg as any).role === 'toolResult') {
        // Tool results are rendered as part of their parent assistant message
        // Skip standalone rendering
      }
    }
  }

  private handleModelCommand(searchTerm?: string): void {
    if (searchTerm?.trim()) {
      // Direct switch by model ID (e.g. /model deepseek-v4-pro)
      this.switchModel(searchTerm.trim())
      return
    }

    // Show selectable model list
    const models = getAllModels()
    const currentId = this.config.model.id
    const currentApi = this.config.model.api

    // Detect duplicate IDs to show protocol info
    const idCounts = new Map<string, number>()
    for (const m of models) {
      idCounts.set(m.id, (idCounts.get(m.id) ?? 0) + 1)
    }

    const items: SelectItem[] = models.map((m) => {
      const hasDuplicate = (idCounts.get(m.id) ?? 0) > 1
      const protocolLabel = hasDuplicate ? ` [${m.api}]` : ''
      const isCurrent = m.id === currentId && m.api === currentApi
      return {
        value: `${m.id}|${m.api}`,
        label: `${m.name ?? m.id}${protocolLabel}`,
        description: `${m.provider}${isCurrent ? ' (current)' : ''}`,
      }
    })

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => chalk.cyan(text),
      selectedText: (text) => chalk.cyan(text),
      description: (text) => theme.dim(text),
      scrollInfo: (text) => theme.dim(text),
      noMatch: (text) => theme.dim(text),
    }, { maxPrimaryColumnWidth: 52 })

    const label = theme.fg('accent', 'Select model:')
    this.chatContainer.addChild(new Text(label, 1, 0))
    this.chatContainer.addChild(selectList)
    this.ui.setFocus(selectList)
    this.ui.requestRender()

    let finished = false
    const removeListener = this.ui.addInputListener((data) => {
      if (data === '\x03') {
        // Ctrl+C
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)
        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        return { consume: true }
      }
      return undefined
    })

    const finish = (selectedValue?: string) => {
      if (finished) return
      finished = true
      removeListener()
      this.chatContainer.removeChild(selectList)

      if (selectedValue) {
        const [modelId, api] = selectedValue.split('|')
        this.switchModel(modelId, api as Api | undefined)
      }

      this.chatContainer.addChild(new Spacer(1))
      this.ui.setFocus(this.editor)
      this.ui.requestRender()
    }

    selectList.onSelect = (item) => {
      finish(item.value)
    }

    selectList.onCancel = () => {
      finish()
    }
  }

  /** Switch to a model by ID and update all dependent state. */
  private switchModel(modelId: string, api?: Api): void {
    try {
      const { model, apiKey, provider } = createModelForId(modelId, api)

      this.agent.state.model = model
      this.config = { model, apiKey, provider }

      // Clear image state on model switch
      this.clearPendingImages()
      this.suppressTrailingQuote = false

      // Rebuild tools for new model (adds/removes vision tool based on capability)
      rebuildCoreTools(this.agent, process.cwd())

      // Update compaction manager with new model and API key
      const compactionManager = getCompactionManager(this.agent)
      if (compactionManager) {
        compactionManager.setModel(model)
        compactionManager.setApiKey(apiKey)
      }

      // Rebuild system prompt with new model ID (preserve MCP info)
      this.rebuildSystemPrompt(this.mcpClient?.getServerStates())

      // Rebuild footer with new model info
      this.rebuildFooter()

      this.showStatus(`Model switched to: ${model.id} (${provider}, ${model.api})`)
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error))
    }
  }

  private handleMcpCommand(args: string): void {
    if (!this.mcpClient) {
      this.showError('No MCP client available.')
      return
    }

    const parts = args.trim().split(/\s+/)
    const action = parts[0]?.toLowerCase()
    const serverName = parts[1]

    // /mcp with no args — show status
    if (!action) {
      const states = this.mcpClient.getServerStates()
      if (states.length === 0) {
        this.chatContainer.addChild(
          new Text(theme.dim('No MCP servers configured.'), 1, 0),
        )
        this.chatContainer.addChild(
          new Text(theme.dim('Use /mcp add <name> <command> to add a server'), 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
        this.ui.requestRender()
        return
      }

      this.chatContainer.addChild(
        new Text(theme.fg('accent', 'MCP Servers:'), 1, 0),
      )
      this.chatContainer.addChild(new Spacer(1))

      for (const state of states) {
        const statusIcon = state.status === 'connected' ? '✓'
          : state.status === 'failed' ? '✗'
          : state.status === 'disabled' ? '○'
          : '◌'
        const statusColor = state.status === 'connected' ? 'green'
          : state.status === 'failed' ? 'red'
          : 'gray'

        const statusLine = `${statusIcon} ${theme.bold(state.name)} ${theme.dim(`(${state.status})`)}`
        this.chatContainer.addChild(new Text(statusLine, 1, 0))

        if (state.status === 'connected' && state.tools.length > 0) {
          const toolNames = state.tools.map(t => t.name).join(', ')
          this.chatContainer.addChild(
            new Text(`  ${theme.dim('Tools:')} ${toolNames}`, 1, 0),
          )
        }

        if (state.status === 'connected' && state.resources.length > 0) {
          const resourceNames = state.resources.map(r => r.name).join(', ')
          this.chatContainer.addChild(
            new Text(`  ${theme.dim('Resources:')} ${resourceNames}`, 1, 0),
          )
        }

        if (state.status === 'failed' && state.error) {
          this.chatContainer.addChild(
            new Text(`  ${chalk.hex('#cc6666')(state.error)}`, 1, 0),
          )
        }
      }

      this.chatContainer.addChild(new Spacer(1))
      this.chatContainer.addChild(
        new Text(theme.dim('Usage: /mcp [enable|disable|reconnect|add|remove] <server-name>'), 1, 0),
      )
      this.chatContainer.addChild(new Spacer(1))
      this.ui.requestRender()
      return
    }

    // /mcp enable <name>
    if (action === 'enable') {
      if (!serverName) {
        this.showError('Usage: /mcp enable <server-name>')
        return
      }
      const result = this.mcpClient.setServerEnabled(serverName, true)
      if (result) {
        this.showStatus(`Enabling MCP server: ${serverName}...`)
      } else {
        this.showError(`MCP server "${serverName}" not found or already connected.`)
      }
      return
    }

    // /mcp disable <name>
    if (action === 'disable') {
      if (!serverName) {
        this.showError('Usage: /mcp disable <server-name>')
        return
      }
      const result = this.mcpClient.setServerEnabled(serverName, false)
      if (result) {
        this.showStatus(`Disabled MCP server: ${serverName}`)
      } else {
        this.showError(`MCP server "${serverName}" not found.`)
      }
      return
    }

    // /mcp reconnect <name>
    if (action === 'reconnect') {
      if (!serverName) {
        this.showError('Usage: /mcp reconnect <server-name>')
        return
      }
      this.showStatus(`Reconnecting MCP server: ${serverName}...`)
      this.mcpClient.reconnectServer(serverName).then((success) => {
        if (success) {
          this.showStatus(`Reconnected MCP server: ${serverName}`)
        } else {
          this.showError(`Failed to reconnect MCP server: ${serverName}`)
        }
      })
      return
    }

    // /mcp add <name> <command> [args...]
    if (action === 'add') {
      this.handleMcpAddCommand(args.trim())
      return
    }

    // /mcp remove <name>
    if (action === 'remove') {
      if (!serverName) {
        this.showError('Usage: /mcp remove <server-name>')
        return
      }
      this.handleMcpRemoveCommand(serverName)
      return
    }

    this.showError(`Unknown /mcp action: ${action}. Usage: /mcp [enable|disable|reconnect|add|remove] <server-name>`)
  }

  private async handleMcpAddCommand(argsStr: string): Promise<void> {
    const parts = argsStr.split(/\s+/).filter(Boolean)
    // Skip 'add' prefix if present
    const name = parts[0]
    const command = parts[1]
    const cmdArgs = parts.slice(2)

    if (!name || !command) {
      this.showError('Usage: /mcp add <name> <command> [args...]')
      return
    }

    const serverConfig: McpServerConfig = {
      type: 'stdio',
      command,
      args: cmdArgs,
    }

    try {
      const configPath = await addMcpServer(name, serverConfig, 'project', process.cwd())
      this.showStatus(`Added MCP server "${name}" to ${configPath}`)

      // Connect the new server immediately
      if (this.mcpClient) {
        this.showStatus(`Connecting MCP server: ${name}...`)
        await this.mcpClient.connectServer(name, serverConfig)
        const server = this.mcpClient.getServer(name)
        if (server?.status === 'connected') {
          this.showStatus(`MCP server "${name}" connected with ${server.tools.length} tool(s)`)

          // Register MCP tools as deferred (discovered via ToolSearchTool)
          registerMcpToolsAsDeferred(this.mcpClient)

          // Inject resource tools directly (they're always needed)
          const resourceTools = [
            createListMcpResourcesTool(this.mcpClient),
            createReadMcpResourceTool(this.mcpClient),
          ]
          this.agent.state.tools = [...this.agent.state.tools, ...resourceTools]

          // Rebuild system prompt with updated MCP info and deferred tool names
          this.rebuildSystemPrompt(this.mcpClient.getServerStates())
        } else {
          this.showError(`Failed to connect MCP server "${name}": ${server?.error ?? 'unknown error'}`)
        }
      }
    } catch (error) {
      this.showError(`Failed to add MCP server: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async handleMcpRemoveCommand(name: string): Promise<void> {
    try {
      await removeMcpServer(name, 'project', process.cwd())
      this.showStatus(`Removed MCP server "${name}" from config`)

      // Disconnect if connected
      if (this.mcpClient) {
        this.mcpClient.setServerEnabled(name, false)
      }
    } catch (error) {
      this.showError(`Failed to remove MCP server: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private rebuildFooter(): void {
    const oldFooter = this.footer
    this.footer = new FooterComponent(this.agent, this.config.model.id, this.config.provider, process.cwd(), this.agent.state.thinkingLevel)
    this.ui.removeChild(oldFooter)
    this.ui.addChild(this.footer)
    // Restore context usage on the new footer
    this.updateContextUsage()
    this.ui.requestRender()
  }

  private rebuildSystemPrompt(mcpServers?: McpServerState[]): void {
    const deferredToolNames = getDeferredToolNames()
    const sections = getSystemPrompt({
      cwd: process.cwd(),
      modelId: this.config.model.id,
      mcpServers,
      skills: getSkills(this.agent),
      deferredToolNames: deferredToolNames.length > 0 ? deferredToolNames : undefined,
    })
    this.agent.state.systemPrompt = sections.join('\n\n')

    // Update compaction manager with system prompt token count
    const compactionManager = getCompactionManager(this.agent)
    if (compactionManager) {
      compactionManager.setSystemPrompt(this.agent.state.systemPrompt)
    }
  }

  updateMcpState(mcpClient: McpClientManager): void {
    this.mcpClient = mcpClient
    this.rebuildSystemPrompt(mcpClient.getServerStates())
  }

  showMcpReady(states: McpServerState[]): void {
    const connected = states.filter(s => s.status === 'connected')
    const failed = states.filter(s => s.status === 'failed')

    const parts: string[] = []
    if (connected.length > 0) {
      parts.push(`${connected.length} server(s) connected`)
    }
    if (failed.length > 0) {
      parts.push(`${failed.length} failed`)
    }

    this.chatContainer.addChild(
      new Text(theme.dim(`MCP ready: ${parts.join(', ')}`), 1, 0),
    )
    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  private static PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
    'default': 'Read: auto-allow | Write/Edit/Bash: prompt before execution',
    'auto-approve': 'All tools execute without confirmation (YOLO mode)',
    'plan': 'Read-only — all write/edit/bash operations are blocked',
  }

  private handlePermissionCommand(args: string): void {
    const mode = args.trim().toLowerCase() as PermissionMode

    if (!mode) {
      const current = this.permissionManager.getMode()
      const items: SelectItem[] = PERMISSION_MODES.map((m) => ({
        value: m,
        label: m,
        description: `${App.PERMISSION_DESCRIPTIONS[m]}${m === current ? ' (current)' : ''}`,
      }))

      const selectList = new SelectList(items, items.length, {
        selectedPrefix: (text) => chalk.cyan(text),
        selectedText: (text) => chalk.cyan(text),
        description: (text) => theme.dim(text),
        scrollInfo: (text) => theme.dim(text),
        noMatch: (text) => theme.dim(text),
      })

      const label = theme.fg('accent', 'Select permission mode:')
      this.chatContainer.addChild(new Text(label, 1, 0))
      this.chatContainer.addChild(selectList)
      this.ui.setFocus(selectList)
      this.ui.requestRender()

      let finished = false
      const removeListener = this.ui.addInputListener((data) => {
        if (data === '\x03') {
          finished = true
          removeListener()
          this.chatContainer.removeChild(selectList)
          this.chatContainer.addChild(new Spacer(1))
          this.ui.setFocus(this.editor)
          this.ui.requestRender()
          return { consume: true }
        }
        return undefined
      })

      const finish = (selectedMode?: PermissionMode) => {
        if (finished) return
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)

        if (selectedMode) {
          this.permissionManager.setMode(selectedMode)
          this.showStatus(`Permission mode set to: ${selectedMode}`)
        }

        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
      }

      selectList.onSelect = (item) => {
        finish(item.value as PermissionMode)
      }

      selectList.onCancel = () => {
        finish()
      }

      return
    }

    if (!PERMISSION_MODES.includes(mode)) {
      this.showError(`Invalid permission mode: ${mode}. Valid modes: ${PERMISSION_MODES.join(', ')}`)
      return
    }

    this.permissionManager.setMode(mode)
    this.showStatus(`Permission mode set to: ${mode}`)
  }

  private static THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
  private static THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
    off: 'No reasoning',
    minimal: 'Very brief reasoning (~1k tokens)',
    low: 'Light reasoning (~2k tokens)',
    medium: 'Moderate reasoning (~8k tokens)',
    high: 'Deep reasoning (~16k tokens)',
    xhigh: 'Maximum reasoning (~32k tokens)',
  }

  private handleThinkingCommand(args: string): void {
    const level = args.trim().toLowerCase() as ThinkingLevel

    if (!level) {
      const current = this.agent.state.thinkingLevel
      const items: SelectItem[] = App.THINKING_LEVELS.map((l) => ({
        value: l,
        label: l,
        description: App.THINKING_DESCRIPTIONS[l],
      }))

      const selectList = new SelectList(items, items.length, {
        selectedPrefix: (text) => chalk.cyan(text),
        selectedText: (text) => chalk.cyan(text),
        description: (text) => theme.dim(text),
        scrollInfo: (text) => theme.dim(text),
        noMatch: (text) => theme.dim(text),
      })

      const thinkingLabel = theme.fg('accent', 'Select thinking level:')
      this.chatContainer.addChild(new Text(thinkingLabel, 1, 0))
      this.chatContainer.addChild(selectList)
      this.ui.setFocus(selectList)
      this.ui.requestRender()

      let finished = false
      const removeListener = this.ui.addInputListener((data) => {
        if (data === '\x03') {
          // Ctrl+C
          finished = true
          removeListener()
          this.chatContainer.removeChild(selectList)
          this.chatContainer.addChild(new Spacer(1))
          this.ui.setFocus(this.editor)
          this.ui.requestRender()
          return { consume: true }
        }
        return undefined
      })

      const finish = (selectedLevel?: ThinkingLevel) => {
        if (finished) return
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)

        if (selectedLevel) {
          this.agent.state.thinkingLevel = selectedLevel
          this.footer.setThinkingLevel(selectedLevel)
          this.showStatus(`Thinking level set to: ${selectedLevel}`)
        }

        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
      }

      selectList.onSelect = (item) => {
        finish(item.value as ThinkingLevel)
      }

      selectList.onCancel = () => {
        finish()
      }

      return
    }

    if (!App.THINKING_LEVELS.includes(level)) {
      this.showError(`Invalid thinking level: ${level}. Valid levels: ${App.THINKING_LEVELS.join(', ')}`)
      return
    }

    this.agent.state.thinkingLevel = level
    this.footer.setThinkingLevel(level)
    this.showStatus(`Thinking level set to: ${level}`)
  }

  private handleSkillsCommand(): void {
    const skills = getSkills(this.agent)
    const diagnostics = getSkillDiagnostics(this.agent)

    if (skills.length === 0) {
      this.chatContainer.addChild(
        new Text(theme.dim('No skills loaded.'), 1, 0),
      )
      this.chatContainer.addChild(
        new Text(theme.dim('Create SKILL.md files in ~/.microcode/skills/ or .microcode/skills/ to add skills.'), 1, 0),
      )
    } else {
      this.chatContainer.addChild(
        new Text(theme.fg('accent', `Available skills (${skills.length}):`), 1, 0),
      )
      this.chatContainer.addChild(new Spacer(1))

      for (const skill of skills) {
        const disabled = skill.disableModelInvocation ? theme.dim(' (disabled)') : ''
        const loaded = isSkillLoaded(this.agent, skill.name) ? chalk.green(' (loaded)') : theme.dim(' (unloaded)')
        this.chatContainer.addChild(
          new Text(`${theme.bold(skill.name)}${disabled}${loaded}`, 1, 0),
        )
        this.chatContainer.addChild(
          new Text(`  ${theme.dim(skill.description)}`, 1, 0),
        )
        this.chatContainer.addChild(
          new Text(`  ${theme.dim(skill.filePath)}`, 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
      }
    }

    if (diagnostics.length > 0) {
      this.chatContainer.addChild(
        new Text(theme.fg('yellow', 'Skill diagnostics:'), 1, 0),
      )
      for (const diagnostic of diagnostics) {
        this.chatContainer.addChild(
          new Text(`  ${theme.dim(diagnostic)}`, 1, 0),
        )
      }
      this.chatContainer.addChild(new Spacer(1))
    }

    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  private handleSkillSlashCommand(skill: Skill): void {
    const currentlyLoaded = isSkillLoaded(this.agent, skill.name)

    const statusText = currentlyLoaded
      ? chalk.green('loaded')
      : theme.dim('unloaded')

    const headerLabel = theme.fg('accent', `Skill '${skill.name}':`)
    this.chatContainer.addChild(
      new Text(`${headerLabel} ${statusText}`, 1, 0),
    )
    this.chatContainer.addChild(
      new Text(theme.dim(`  ${skill.description}`), 1, 0),
    )

    const items: SelectItem[] = []
    if (currentlyLoaded) {
      items.push({ value: 'unload', label: 'Unload', description: 'Remove skill from system prompt' })
    } else {
      items.push({ value: 'load', label: 'Load', description: 'Add skill to system prompt' })
    }
    items.push({ value: 'cancel', label: 'Cancel', description: 'Do nothing' })

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => chalk.cyan(text),
      selectedText: (text) => chalk.cyan(text),
      description: (text) => theme.dim(text),
      scrollInfo: (text) => theme.dim(text),
      noMatch: (text) => theme.dim(text),
    })

    this.chatContainer.addChild(selectList)
    this.ui.setFocus(selectList)
    this.ui.requestRender()

    let finished = false

    const removeListener = this.ui.addInputListener((data) => {
      if (data === '\x03') {
        finished = true
        removeListener()
        this.chatContainer.removeChild(selectList)
        this.chatContainer.addChild(new Spacer(1))
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        return { consume: true }
      }
      return undefined
    })

    const finish = (value?: string) => {
      if (finished) return
      finished = true
      removeListener()
      this.chatContainer.removeChild(selectList)

      if (value === 'load') {
        try {
          const body = readSkillBody(skill)
          loadSkillIntoPrompt(this.agent, skill, body)
          this.chatContainer.addChild(
            new Text(theme.fg('accent', `Loaded skill '${skill.name}' into system prompt.`), 1, 0),
          )
        } catch (error) {
          this.chatContainer.addChild(
            new Text(theme.fg('red', `Failed to load skill '${skill.name}': ${error instanceof Error ? error.message : 'Unknown error'}`), 1, 0),
          )
        }
      } else if (value === 'unload') {
        unloadSkillFromPrompt(this.agent, skill.name)
        this.chatContainer.addChild(
          new Text(theme.fg('accent', `Unloaded skill '${skill.name}' from system prompt.`), 1, 0),
        )
      } else {
        this.chatContainer.addChild(
          new Text(theme.dim('Cancelled.'), 1, 0),
        )
      }

      this.chatContainer.addChild(new Spacer(1))
      this.ui.setFocus(this.editor)
      this.ui.requestRender()
    }

    selectList.onSelect = (item) => finish(item.value)
    selectList.onCancel = () => finish(undefined)
  }

  /**
   * Interactively present questions from the ask_user_question tool and collect answers.
   * Each question is shown as a SelectList in the chat area.
   * Returns the collected answers, or { block: true } if cancelled.
   */
  async promptAskUserQuestion(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<{ answers?: Record<string, string>; block?: boolean }> {
    const questions = input.questions as Array<{
      question: string
      header: string
      options: Array<{ label: string; description: string }>
      multiSelect?: boolean
    }>

    if (!questions || questions.length === 0) {
      return { block: true }
    }

    const answers: Record<string, string> = {}

    for (const q of questions) {
      const answer = await this.promptSingleQuestion(q)
      if (answer === undefined) {
        // User cancelled
        return { block: true }
      }
      answers[q.question] = answer
    }

    return { answers }
  }

  /**
   * Present a single question with its options as a SelectList.
   * Returns the selected answer string, or undefined if cancelled.
   */
  private async promptSingleQuestion(q: {
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect?: boolean
  }): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve) => {
      this.hideWorking()
      this.permissionPromptActive = true

      // Build select items from options + "Other"
      const items: SelectItem[] = q.options.map((opt) => ({
        value: opt.label,
        label: opt.label,
        description: opt.description,
      }))
      items.push({
        value: '__other__',
        label: 'Other',
        description: 'Provide a custom answer',
      })

      const selectList = new SelectList(items, items.length, {
        selectedPrefix: (text) => chalk.cyan(text),
        selectedText: (text) => chalk.cyan(text),
        description: (text) => theme.dim(text),
        scrollInfo: (text) => theme.dim(text),
        noMatch: (text) => theme.dim(text),
      })

      // Show question header and the select list
      const headerLabel = theme.fg('accent', `${q.header}:`)
      this.chatContainer.addChild(new Text(`${headerLabel} ${q.question}`, 1, 0))
      this.chatContainer.addChild(selectList)
      this.ui.setFocus(selectList)
      this.ui.requestRender()

      let finished = false
      const removeListener = this.ui.addInputListener((data) => {
        if (data === '\x03') {
          // Ctrl+C — cancel
          finished = true
          removeListener()
          this.permissionPromptActive = false
          this.chatContainer.removeChild(selectList)
          this.chatContainer.addChild(new Spacer(1))
          this.ui.setFocus(this.editor)
          this.ui.requestRender()
          resolve(undefined)
          return { consume: true }
        }
        return undefined
      })

      const finish = (value?: string) => {
        if (finished) return
        finished = true
        removeListener()
        this.permissionPromptActive = false
        this.chatContainer.removeChild(selectList)

        if (value === '__other__') {
          // Show "Other" prompt — let user type free-text
          this.chatContainer.addChild(
            new Text(theme.dim('Type your answer and press Enter:'), 1, 0),
          )
          this.ui.setFocus(this.editor)
          this.ui.requestRender()

          // Wait for user to type in the editor
          void this.getUserInput().then((text) => {
            const trimmed = text.trim()
            this.chatContainer.addChild(new Text(`  ${chalk.cyan(trimmed)}`, 1, 0))
            this.chatContainer.addChild(new Spacer(1))
            this.ui.requestRender()
            resolve(trimmed || undefined)
          })
          return
        }

        // Show selected answer
        this.chatContainer.addChild(
          new Text(`  ${chalk.cyan(value ?? '')}`, 1, 0),
        )
        this.chatContainer.addChild(new Spacer(1))
        this.showWorking()
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        resolve(value)
      }

      selectList.onSelect = (item) => finish(item.value)
      selectList.onCancel = () => finish(undefined)
    })
  }

  /**
   * Prompt user for tool permission using an inline select list in the chat area.
   * Returns true if approved, false if denied.
   */
  async promptPermission(
    toolName: string,
    input: Record<string, unknown>,
    description: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Pause spinner while waiting for user decision
      this.hideWorking()
      this.permissionPromptActive = true

      // Extract content for session rule matching
      const ruleContent = this.extractRuleContent(toolName, input)
      const sessionLabel = ruleContent ? `${toolName}(${ruleContent})` : toolName

      const items: SelectItem[] = [
        { value: 'allow', label: 'Allow', description: `Allow ${toolName} to execute` },
        { value: 'allow-session', label: `Allow for session`, description: `Don't ask again for ${sessionLabel}` },
        { value: 'deny', label: 'Deny', description: `Block ${toolName} execution` },
      ]

      const selectList = new SelectList(items, items.length, {
        selectedPrefix: (text) => chalk.cyan(text),
        selectedText: (text) => chalk.cyan(text),
        description: (text) => theme.dim(text),
        scrollInfo: (text) => theme.dim(text),
        noMatch: (text) => theme.dim(text),
      })

      // Add inline to chat area
      const permLabel = theme.fg('accent', 'Permission requested:')
      this.chatContainer.addChild(new Text(`${permLabel} ${description}`, 1, 0))
      this.chatContainer.addChild(selectList)
      this.ui.setFocus(selectList)
      this.ui.requestRender()

      // Intercept Ctrl+C before it reaches SelectList — exit app instead of deny
      let finished = false
      const removeListener = this.ui.addInputListener((data) => {
        if (data === '\x03') { // Ctrl+C
          finished = true
          removeListener()
          this.permissionPromptActive = false
          this.chatContainer.removeChild(selectList)
          this.exit()
          return { consume: true }
        }
        return undefined
      })

      const finish = (approved: boolean) => {
        if (finished) return
        finished = true
        removeListener()
        this.permissionPromptActive = false
        this.chatContainer.removeChild(selectList)
        const icon = approved ? theme.fg('green', '✓') : theme.fg('red', '✗')
        const resultText = approved ? 'Approved' : 'Denied'
        this.chatContainer.addChild(new Text(`${icon} ${resultText}`, 1, 0))
        this.chatContainer.addChild(new Spacer(1))
        // Resume spinner if approved - agent will continue responding
        if (approved) this.showWorking()
        // Restore focus to editor so user can type again
        this.ui.setFocus(this.editor)
        this.ui.requestRender()
        if (!approved) this.agent.abort()
        resolve(approved)
      }

      selectList.onSelect = (item) => {
        if (item.value === 'allow-session') {
          this.permissionManager.addSessionRule(toolName, ruleContent)
        }
        finish(item.value === 'allow' || item.value === 'allow-session')
      }
      selectList.onCancel = () => finish(false)
    })
  }

  private extractRuleContent(toolName: string, input: Record<string, unknown>): string | undefined {
    switch (toolName) {
      case BASH_TOOL_NAME:
        return typeof input.command === 'string' ? input.command : undefined
      case EDIT_TOOL_NAME:
      case WRITE_TOOL_NAME:
      case READ_TOOL_NAME:
        return typeof input.path === 'string' ? input.path : undefined
      default:
        return undefined
    }
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager
  }

  private showHelp(): void {
    const helpText = [
      `${theme.fg('accent', 'Available Commands:')}`,
      '',
      `  ${theme.bold('/clear')}              Clear the conversation history`,
      `  ${theme.bold('/compact')} [instr.]    Compress conversation context`,
      `  ${theme.bold('/model')} [model-id]   Show current model or switch to a different model`,
      `  ${theme.bold('/thinking')} [level]   Show or set thinking depth`,
      `  ${theme.bold('/mcp')}                Manage MCP servers (add/remove/enable/disable)`,
      `  ${theme.bold('/session')}            Browse and load saved sessions`,
      `  ${theme.bold('/new')}                Start a new conversation session`,
      `  ${theme.bold('/permission')} [mode]  Show or switch permission mode`,
      `  ${theme.bold('/exit')}               Exit Microcode`,
      `  ${theme.bold('/help')}               Show this help message`,
      '',
      `${theme.fg('accent', 'Keyboard Shortcuts:')}`,
      '',
      `  ${theme.bold('Escape')}              Interrupt current operation`,
      `  ${theme.bold('Ctrl+C')}              Interrupt (when busy) / Exit`,
      `  ${theme.bold('Ctrl+D')}              Exit (when input is empty)`,
      `  ${theme.bold('Enter')}               Submit message`,
      `  ${theme.bold('Shift+Enter')}         New line in editor`,
      `  ${theme.bold('Up/Down')}             Browse command history`,
      `  ${theme.bold('Tab')}                 Accept autocomplete suggestion`,
      '',
      `${theme.fg('accent', 'Environment Variables:')}`,
      '',
      `  ANTHROPIC_API_KEY     Anthropic API key`,
      `  ANTHROPIC_BASE_URL    Anthropic API base URL`,
      `  ANTHROPIC_MODEL       Anthropic model ID`,
      `  OPENAI_API_KEY        OpenAI API key`,
      `  OPENAI_BASE_URL       OpenAI API base URL`,
      `  OPENAI_MODEL          OpenAI model ID`,
      `  API_KEY               Fallback API key`,
      `  BASE_URL              Fallback base URL`,
      `  MODEL                 Fallback model ID`,
    ]

    // Add available skills
    const skills = getSkills(this.agent)
    if (skills.length > 0) {
      helpText.push('')
      helpText.push(`${theme.fg('accent', 'Available Skills:')}`)
      helpText.push('')
      for (const skill of skills) {
        const disabled = skill.disableModelInvocation ? ' (disabled)' : ''
        helpText.push(`  ${theme.bold(`/${skill.name}`)}${disabled}    ${skill.description}`)
      }
    }

    for (const line of helpText) {
      this.chatContainer.addChild(new Text(line, 1, 0))
    }
    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  private showStatus(message: string): void {
    this.chatContainer.addChild(new Spacer(1))
    this.chatContainer.addChild(new Text(theme.dim(message), 1, 0))
    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  private showError(message: string): void {
    this.chatContainer.addChild(
      new Text(chalk.hex('#cc6666')(`Error: ${message}`), 1, 0),
    )
    this.chatContainer.addChild(new Spacer(1))
    this.ui.requestRender()
  }

  getPendingImageContents(): ImageContent[] {
    return this.pendingImages.map((img) => ({
      type: 'image' as const,
      data: img.base64Data,
      mimeType: img.mimeType,
    }))
  }

  clearPendingImages(): void {
    this.pendingImages = []
    this.suppressTrailingQuote = false
  }

  private handleEditorSubmit(text: string): void {
    this.editor.addToHistory(text)
    this._pendingInput = text
    this._inputResolve?.()
  }

  private _pendingInput?: string
  private _inputResolve?: () => void

  async getUserInput(): Promise<string> {
    return new Promise<string>((resolve) => {
      this._inputResolve = () => {
        const text = this._pendingInput ?? ''
        this._pendingInput = undefined
        this._inputResolve = undefined
        resolve(text)
      }

      if (this._pendingInput !== undefined) {
        this._inputResolve()
      }
    })
  }

  private setupAgentSubscription(): void {
    this.agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case 'agent_start':
          this.showWorking()
          break

        case 'message_start':
          if (event.message.role === 'assistant') {
            this.streamingComponent = new AssistantMessageComponent(getMarkdownTheme())
            this.streamingMessage = event.message
            this.chatContainer.addChild(this.streamingComponent)
            this.streamingComponent.updateContent(this.streamingMessage)
            this.ui.requestRender()
          }
          break

        case 'message_update':
          if (this.streamingComponent && event.message.role === 'assistant') {
            this.streamingMessage = event.message
            this.streamingComponent.updateContent(this.streamingMessage)
            if (
              event.assistantMessageEvent.type === 'toolcall_start' ||
              event.assistantMessageEvent.type === 'toolcall_delta'
            ) {
              this.updateStreamingToolCall(
                event.message,
                event.assistantMessageEvent.type === 'toolcall_start',
              )
            }
            this.ui.requestRender()
          }
          break

        case 'message_end':
          if (event.message.role === 'assistant') {
            if (this.streamingComponent && this.streamingMessage) {
              this.streamingComponent.updateContent(this.streamingMessage)
              this.streamingComponent = undefined
              this.streamingMessage = undefined
            }
            this.updateContextUsage()
            this.footer.invalidate()
          }
          this.ui.requestRender()
          break

        case 'tool_execution_start': {
          const existing = this.pendingTools.get(event.toolCallId)
          const UIConstructor = getToolUIConstructor(event.toolName)
          const component: ToolUIComponent = existing ?? (
            UIConstructor
              ? new UIConstructor(event.toolCallId, event.args)
              : new ToolExecutionComponent(event.toolName, event.toolCallId, event.args)
          )
          component.updateArgs?.(event.args)
          component.setExpanded(false)
          component.markExecutionStarted()
          if (!existing) {
            this.chatContainer.addChild(component)
          }
          this.pendingTools.set(event.toolCallId, component)
          this.pendingToolStartedAt.set(event.toolCallId, performance.now())
          this.toolExecutionInProgress = true
          // Ensure spinner is visible during tool execution
          this.showWorking()
          this.commitToolFrame()
          break
        }

        case 'tool_execution_update': {
          const component = this.pendingTools.get(event.toolCallId)
          if (component) {
            if (component.updateDetails && event.partialResult.details) {
              component.updateDetails(event.partialResult.details)
            }
            component.updateResult(
              { ...event.partialResult, isError: false },
              true,
            )
            this.commitToolFrame()
          }
          break
        }

        case 'tool_execution_end': {
          const component = this.pendingTools.get(event.toolCallId)
          if (component) {
            const startedAt = this.pendingToolStartedAt.get(event.toolCallId)
            if (startedAt !== undefined) {
              component.updateElapsed?.(performance.now() - startedAt)
            }
            component.updateResult({
              ...event.result,
              isError: event.isError,
            })
            // Pass details to per-tool UI for diff rendering
            if (component.updateDetails && event.result.details) {
              component.updateDetails(event.result.details)
            }
            this.pendingTools.delete(event.toolCallId)
            this.pendingToolStartedAt.delete(event.toolCallId)
            this.streamingToolLastRenderAt.delete(event.toolCallId)
            if (this.pendingTools.size === 0) {
              this.toolExecutionInProgress = false
            }
            this.updateContextUsage()
            this.footer.invalidate()
            this.ui.requestRender()
          }
          break
        }

        case 'turn_end':
          // Don't hide spinner if tools are still executing
          if (!this.toolExecutionInProgress) {
            this.hideWorking()
          }
          if (event.message.role === 'assistant' && event.message.stopReason === 'aborted') {
            this.chatContainer.addChild(
              new Text(chalk.hex('#cc6666').bold('\nInterrupted\n'), 1, 0),
            )
          } else if (event.message.role === 'assistant' && event.message.stopReason === 'error') {
            const errMsg = event.message.errorMessage || 'Unknown error'
            this.chatContainer.addChild(
              new Text(chalk.hex('#cc6666')(`\nError: ${errMsg}\n`), 1, 0),
            )
          }
          this.chatContainer.addChild(new Spacer(1))
          // Generate session title from first user message
          if (!this.titleGenerated) {
            this.titleGenerated = true
            void this.generateSessionTitle()
          }
          // Save messages to session after each turn
          void this.sessionManager.saveMessages(this.agent.state.messages as AgentMessage[])
          this.updateContextUsage()
          this.footer.invalidate()
          this.ui.requestRender()
          break

        case 'agent_end':
          this.hideWorking()
          this.ui.requestRender()
          break
      }
    })
  }

  private updateStreamingToolCall(message: AgentMessage, forceRender: boolean): void {
    if (message.role !== 'assistant') return

    const toolCalls = message.content.filter((block) => block.type === 'toolCall')
    for (const toolCall of toolCalls) {
      const args = toolCall.arguments ?? {}
      let component = this.pendingTools.get(toolCall.id)

      if (!component) {
        const UIConstructor = getToolUIConstructor(toolCall.name)
        component = UIConstructor
          ? new UIConstructor(toolCall.id, args)
          : new ToolExecutionComponent(toolCall.name, toolCall.id, args)
        component.setExpanded(false)
        component.markExecutionStarted()
        this.chatContainer.addChild(component)
        this.pendingTools.set(toolCall.id, component)
        this.pendingToolStartedAt.set(toolCall.id, performance.now())
      } else {
        component.updateArgs?.(args)
      }

      if (toolCall.name === WRITE_TOOL_NAME && component.updateDetails) {
        const filePath = typeof args.file_path === 'string' ? args.file_path : ''
        const content = typeof args.content === 'string' ? args.content : ''
        const resolvedPath = filePath
          ? (isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath))
          : ''
        const isNewFile = resolvedPath ? !existsSync(resolvedPath) : false
        component.updateDetails({
          path: resolvedPath || filePath,
          bytesWritten: Buffer.byteLength(content, 'utf8'),
          additions: countStreamingLines(content),
          removals: 0,
          isNewFile,
          phase: 'preparing',
        })
      } else if (toolCall.name === EDIT_TOOL_NAME && component.updateDetails) {
        const oldString = typeof args.old_string === 'string' ? args.old_string : ''
        const newString = typeof args.new_string === 'string' ? args.new_string : ''
        component.updateDetails({
          path: typeof args.file_path === 'string' ? args.file_path : '',
          additions: countStreamingLines(newString),
          removals: countStreamingLines(oldString),
          replacements: args.replace_all === true ? 0 : 1,
          phase: 'preparing',
        })
      }

      const now = performance.now()
      const lastRenderAt = this.streamingToolLastRenderAt.get(toolCall.id) ?? 0
      if (forceRender || now - lastRenderAt >= 100) {
        this.streamingToolLastRenderAt.set(toolCall.id, now)
        this.commitToolFrame()
      }
    }
  }

  private commitToolFrame(): void {
    const immediateUi = this.ui as unknown as {
      stopped?: boolean
      renderRequested?: boolean
      renderTimer?: ReturnType<typeof setTimeout>
      lastRenderAt?: number
      doRender?: () => void
    }

    if (!immediateUi.stopped && typeof immediateUi.doRender === 'function') {
      if (immediateUi.renderTimer) {
        clearTimeout(immediateUi.renderTimer)
        immediateUi.renderTimer = undefined
      }
      immediateUi.renderRequested = false
      immediateUi.lastRenderAt = performance.now()
      immediateUi.doRender()
      return
    }

    // Fallback for future pi-tui versions that change their renderer internals.
    this.ui.requestRender()
  }

  private updateContextUsage(): void {
    const compactionManager = getCompactionManager(this.agent)
    if (!compactionManager) return

    const messages = this.agent.state.messages as AgentMessage[]
    const usage = compactionManager.getContextUsage(messages)
    this.footer.setContextUsage(usage.percentUsed, usage.tokens, usage.contextWindow)
  }

  private showWorking(): void {
    if (!this.loadingAnimation) {
      this.loadingAnimation = new Loader(
        this.ui,
        (text: string) => chalk.hex('#00d7ff')(text),
        (text: string) => chalk.hex('#666666')(text),
        'Working...',
        { frames: [] },
      )
      this.loadingAnimation.start()
      this.statusContainer.clear()
      this.statusContainer.addChild(this.loadingAnimation)
      this.ui.requestRender()
    }
  }

  private hideWorking(): void {
    if (this.loadingAnimation) {
      this.loadingAnimation.stop()
      this.statusContainer.clear()
      this.loadingAnimation = undefined
      this.ui.requestRender()
    }
  }

  stop(): void {
    this.ui.stop()
  }

  private isAgentBusy(): boolean {
    return this.agent.state.isStreaming || this.agent.state.pendingToolCalls.size > 0
  }

  private exit(): void {
    this.stop()
    if (this.onExit) {
      this.onExit()
    } else {
      process.exit(0)
    }
  }
}
