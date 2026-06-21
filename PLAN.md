# Microcode-dev Multi-Agent

## Runtime

- [x] Expose `followUp`, `steer`, and `waitForIdle` on `MicrocodeAgent`
- [x] Add `AgentRegistry`
- [x] Add `AgentTaskStore`
- [x] Add `AgentFactory`
- [x] Add `AgentSupervisor`
- [x] Enforce worker concurrency, single-writer scheduling, timeout, and shutdown

## Orchestration

- [x] Add `spawn_agent`
- [x] Add `send_agent_message`
- [x] Add `stop_agent`
- [x] Add `get_agent_status`
- [x] Add coordinator and worker prompts
- [x] Deliver worker completion to the coordinator exactly once
- [x] Delegate worker permission requests to the coordinator

## Product integration

- [x] Wire the supervisor into startup and shutdown
- [x] Show agent activity in the main conversation
- [x] Show running/max agents in the footer
- [x] Add agent list, detail, transcript, stop, and message actions
- [x] Persist agent tasks and transcripts per session
- [x] Mark unfinished restored tasks as interrupted

## Verification

- [x] Registry tests
- [x] Task store tests
- [x] Supervisor lifecycle and scheduling tests
- [x] Permission and recursion tests
- [x] Persistence and restore tests
- [x] TUI rendering tests
- [x] Existing test suite passes
