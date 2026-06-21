# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Microcode is an AI-powered coding assistant with a terminal UI (TUI). It wraps the `@earendil-works/pi-agent-core` agent runtime with a custom TUI built on `@earendil-works/pi-tui`, model-agnostic provider support via `@earendil-works/pi-ai`, and MCP tool integration via `@modelcontextprotocol/sdk`.

- **Runtime**: Bun >= 1.3.5 (TypeScript, ESM, `"type": "module"`)
- **Build output**: Standalone native binary via `bun build --compile` — zero runtime dependencies

## Commands

```bash
bun install                          # Install dependencies
bun run dev                          # Run in dev mode (interprets TS directly via Bun)
bun run build                        # Compile standalone binary + install to ~/.local/bin or %LOCALAPPDATA%\microcode
bun run build.ts --no-install        # Build only, skip install step
bun test ./test                      # Run all tests (Bun native test runner)
bun test ./test --test-name-pattern "<pattern>"  # Run a single test
```

There is no lint or type-check script configured. TypeScript strict mode is enabled in `tsconfig.json` but type-checking is handled by the IDE/language server (Bun strips types at runtime; the project uses `"noEmit": true`).

## Architecture

### Entry and startup flow

```
entry.ts  →  main.tsx  →  App (TUI)
               ├── SessionManager (create or resume JSONL sessions)
               ├── MicrocodeAgent (wraps pi-agent-core Agent)
               └── McpClientManager (background MCP server connections)
```

[src/entry.ts](src/entry.ts) sets the process title, handles `--version`, and imports [src/main.tsx](src/main.tsx). `main.tsx` is the CLI orchestrator: it parses CLI flags (`--resume`, `--model`, `--permission`, `--thinking`), handles subcommands (`microcode mcp add/remove/list`, `microcode model list`), creates the three core services (SessionManager, MicrocodeAgent, McpClientManager), wires them together, and starts the TUI App. MCP connections happen in the background — the REPL is available immediately.

### Agent layer (`src/agent/`)

[MicrocodeAgent.ts](src/agent/MicrocodeAgent.ts) is the central class. It wraps `pi-agent-core`'s `Agent` and delegates to sub-managers:

| Sub-manager | Responsibility |
|---|---|
| `AgentModelManager` | Model resolution, API key discovery, model switching |
| `AgentToolManager` | Tool lifecycle (built-in + MCP + deferred tools) |
| `AgentSkillManager` | Skill loading/unloading from SKILL.md files |
| `AgentTokenTracker` | Per-message and aggregate token accounting |
| `PermissionManager` (`src/permissions/`) | Rule-based tool permission gating |
| `CompactionManager` (`src/session/`) | Three-tier context compression |
| `TaskSystem` (`src/tasks/`) | Session-scoped persistent task lists |

The agent is event-driven. It emits `MicrocodeAgentEvent` objects (see `src/agent/types.ts`) for: agent start/end, message streaming, tool execution, token usage, permission requests, state changes, compaction, and model changes. The TUI subscribes to these events to update the display reactively. Use `agent.subscribe(listener)` to add a listener; it returns an unsubscribe function.

**System prompt** — the agent's "personality" is built in [src/prompt/prompts.ts](src/prompt/prompts.ts). `getSystemPrompt()` assembles the full system prompt from modular section functions (intro, system rules, doing tasks, actions, tools, tone, output efficiency, ask-user-question), then appends dynamic sections for env info, MCP servers, skills, and deferred tools. Each section function returns a markdown string. When modifying agent behavior, start in this file.

**Internal message format** — Messages flowing through `pi-agent-core` use these roles: `user`, `assistant`, `toolResult`, `bashExecution`, `compactionSummary`, `branchSummary`, `custom`. The `convertToLlm()` function in [MicrocodeAgent.ts](src/agent/MicrocodeAgent.ts) transforms these into provider-specific LLM message formats. Assistant messages carry `content` arrays with typed blocks (`text`, `thinking`, `tool_use`, etc.) plus `usage` metadata (input/output tokens, cost).

### TUI layer (`src/tui/`)

The TUI is built on `@earendil-works/pi-tui` and uses a **custom JSX runtime** — this is NOT React. The JSX is configured via `tsconfig.json` (`"jsxFactory": "h"`, `"jsxFragmentFactory": "Fragment"`). The runtime is in [jsxFactory.ts](src/tui/jsxFactory.ts). Component trees are declared with JSX syntax but render to pi-tui widgets (Container, Text, Editor, SelectList, etc.). When adding UI, import `h` and `Fragment` from `./jsxFactory.ts`, not from React.

Key TUI components:
- [app.ts](src/tui/app.ts) — Main App class: TUI lifecycle, slash commands (`/model`, `/compact`, `/permission`, `/skills`, `/help`, `/clear`), streaming message display, permission prompts, session management UI. The `/tasks` command uses a two-level interactive browser (list picker → task multi-select) implemented inline.
- [microcodeEditor.ts](src/tui/components/microcodeEditor.ts) — Custom Editor with app-level keybindings (Escape to cancel, Ctrl+C / Ctrl+D to exit)
- [multiSelectList.ts](src/tui/components/multiSelectList.ts) — Implements `Component` for multi-select lists (Space toggles, Enter confirms, Esc cancels). Used by the `/tasks` command to batch-prioritize tasks. Items support a `disabled` flag (rendered dimmed, cannot be selected).
- [assistantMessage.ts](src/tui/components/assistantMessage.ts) — Markdown rendering of assistant responses
- [toolExecution.ts](src/tui/components/toolExecution.ts) / [bashExecution.ts](src/tui/components/bashExecution.ts) — Tool call presentation

### Tool system (`src/tools/`)

Each tool is a subdirectory under `src/tools/` containing its own module, UI component, and exports. Tools are registered in [registry.ts](src/tools/registry.ts) via `registerTool()`. The central registry supports **deferred tools** — tools discovered at runtime via `ToolSearchTool` (e.g., MCP tools are registered as deferred). `createCodingTools()` in [index.ts](src/tools/index.ts) creates the base tool set.

MCP tools are proxied through `MCPTool/` and get namespaced as `mcp__<server>__<tool>`. After a `ToolSearchTool` invocation, discovered deferred tools are committed to the agent via the `afterToolCall` hook in MicrocodeAgent.

### Configuration and persistence

Configuration files (JSON):
- `~/.microcode/config.json` — user-level: custom models, MCP servers, permissions
- `.microcode/config.json` — project-level: same format, project settings override user for same-key models
- `~/.microcode/sessions/` — Session data stored as JSONL files; task lists under `.tasks/` subdirectory
- `~/.microcode/skills/` and `.microcode/skills/` — Skills loaded from SKILL.md files with YAML frontmatter (`name`, `description`, `disable-model-invocation`)

### Macro system (`src/macro.ts`)

Build-time constants (`VERSION`, `ISSUES_EXPLAINER`, etc.) are injected via `globalThis.MACRO`. At dev time, values come from `package.json`. At build time (`bun build --compile`), they can be replaced with release values. Code that references `MACRO.VERSION` must declare `declare const MACRO: { VERSION: string }` (or the relevant subset). Tests that use agent factories must call `ensureBootstrapMacro()` in a `beforeAll` hook — otherwise `MACRO` is undefined and the agent constructor fails.

### Compaction system (`src/session/CompactionManager.ts`)

Three tiers, all managed through `CompactionManager`:
1. **Microcompact** — Cheap: clears old tool results and trims whitespace from messages (no LLM call)
2. **Auto-compact** — LLM-powered: triggered when estimated tokens near the model's context limit. Generates a summary via the LLM and replaces older messages
3. **Manual compact** — User-invoked via `/compact` slash command

The compaction check runs inside the `transformContext` hook passed to `pi-agent-core`'s Agent, so it executes before every LLM call.

### Task system (`src/tasks/`)

[TaskSystem.ts](src/tasks/TaskSystem.ts) provides session-scoped persistent task lists. Each session gets its own JSON file in `~/.microcode/sessions/.tasks/<sessionId>.json`. Operations: `createList`, `listTaskLists`, `claimTaskList` (returns only unfinished tasks), `markTask` (toggle completion). Writes are atomic (temp file + rename).

The TaskSystem is owned by `SessionManager` and exposed through optional methods on the `AgentSessionPersistence` interface (`createTaskList`, `listTaskLists`, `claimTaskList`, `markTask`). The [TaskTool](src/tools/TaskTool/TaskTool.ts) is a built-in, non-deferred, default-allowed tool that wraps these persistence methods. It has three actions: `write` (create a list), `claim` (get unfinished tasks), `mark` (toggle completion). TaskTool receives `getPersistence` via the `ToolCreationContext` passed through from `AgentToolManager` → `createCodingTools`. If no persistence is configured (no session), the tool throws.

### Model system (`src/models/`)

[registry.ts](src/models/registry.ts) defines built-in models and resolves them via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, plus their `_BASE_URL` and `_MODEL` variants, with `API_KEY`/`BASE_URL`/`MODEL` as protocol-agnostic fallbacks). [custom.ts](src/models/custom.ts) loads user-defined models from config files. Custom models with the same ID override built-in ones.

### MCP integration (`src/mcp/`)

MCP servers connect via stdio, SSE, HTTP, or WebSocket. `McpClientManager` manages connection lifecycle. Tools from connected servers are registered as deferred tools under `mcp__<server>__<tool>` names. MCP can be configured via the `microcode mcp add/remove/list` CLI subcommands or by editing the config JSON directly.

## Testing

Tests live in `test/` and use Bun's native test runner (`bun:test` — `describe`, `test`, `expect`, `beforeAll`). Run with `bun test ./test`.

Key patterns:
- Agent instances are created via `createMicrocodeAgentRuntime()` (from `src/agent/index.ts`), not by constructing `MicrocodeAgent` directly. All agent state is managed through the returned boundary object.
- `ensureBootstrapMacro()` must be called in a `beforeAll` hook before any test that creates an agent — otherwise `globalThis.MACRO` is undefined and the system prompt builder throws.
- Persistence is tested via a `MemoryPersistence` class that implements `AgentSessionPersistence` (in-memory `saved` array + `records` array) — see the test file for the canonical mock.
- Test skill fixtures live in `test/fixtures/skills/` as SKILL.md files with YAML frontmatter. Pass the fixture path via `skillPaths` in agent options.
- Helper factories like `userMessage(content)` and `assistantMessage(responseId, inputTokens)` create well-formed `AgentMessage` objects for tests — model switching, compaction, and token tracking tests all depend on messages carrying correct `usage` metadata.
- TaskSystem tests use temporary directories (`mkdtemp`) with cleanup in `afterEach`. The TaskTool is tested by creating inline persistence objects that delegate to a TaskSystem, avoiding the need for a full SessionManager.

## Important patterns

- **JSX is NOT React**: Import `h` and `Fragment` from `src/tui/jsxFactory.ts`. The TSX compiles to pi-tui widget constructors.
- **Agent events are the integration boundary**: The TUI never calls agent methods directly for display updates — it subscribes to `MicrocodeAgentEvent` objects and renders reactively.
- **Tools return structured results**: Tool implementations return typed objects that get rendered by their corresponding TUI presentation component.
- **`Bun` globals are available**: The runtime is Bun, so `Bun.file()`, `Bun.spawn()`, `Bun.write()`, etc. can be used. Types are provided by `bun-types`.
- **No build-step for development**: `bun run dev` runs TypeScript directly. The build step is only for producing the distributable binary.
- **`MACRO` declaration**: Any file that accesses `MACRO.VERSION` (or other MACRO fields) must include `declare const MACRO: { VERSION: string; ... }` at the top. This is a compile-time global injected by the build system — it doesn't exist as an import.
