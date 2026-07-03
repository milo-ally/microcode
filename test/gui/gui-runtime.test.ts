import { describe, expect, test } from 'bun:test'
import '../../src/tools/BashTool/index.ts'
import {
  extractStreamingToolCalls,
  getStreamingToolDetails,
  restoreGuiTimelineFromMessages,
} from '../../src/gui/runtime/createMicrocodeRuntime.ts'

describe('GUI runtime timeline restore', () => {
  test('rebuilds completed tool cards from persisted tool call and result messages', () => {
    const timeline = restoreGuiTimelineFromMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'run a command' }],
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will check.' },
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'bash',
            arguments: { command: 'printf hi' },
          },
        ],
        timestamp: 2000,
      },
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: 'hi' }],
        details: { stdout: 'hi', stderr: '', output: 'hi', exitCode: 0 },
        isError: false,
        timestamp: 2500,
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        timestamp: 3000,
      },
    ] as any)

    const tool = timeline.find((item) => item.kind === 'tool')
    expect(tool).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-1',
      toolName: 'bash',
      args: { command: 'printf hi' },
      status: 'complete',
      output: 'hi',
      details: { stdout: 'hi', stderr: '', output: 'hi', exitCode: 0 },
      isError: false,
      elapsedMs: 500,
    })
    expect(tool?.summary).toContain('[bash]')
    expect(timeline.map((item) => item.kind)).toEqual(['message', 'message', 'tool', 'message'])
  })

  test('keeps pending tool cards when a saved assistant message has no result yet', () => {
    const timeline = restoreGuiTimelineFromMessages([
      {
        role: 'assistant',
        content: [{
          type: 'toolCall',
          id: 'call-2',
          name: 'read',
          arguments: { file_path: 'src/app.ts' },
        }],
        timestamp: 1000,
      },
    ] as any)

    const tool = timeline.find((item) => item.kind === 'tool')
    expect(tool).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-2',
      toolName: 'read',
      args: { file_path: 'src/app.ts' },
      status: 'pending',
      startedAt: 1000,
    })
  })

  test('derives live write and edit details while tool arguments are streaming', () => {
    expect(getStreamingToolDetails('write', {
      file_path: 'intro.md',
      content: 'hello\nworld\n',
    }, '/tmp/project')).toMatchObject({
      path: '/tmp/project/intro.md',
      bytesWritten: 12,
      additions: 2,
      removals: 0,
      phase: 'preparing',
    })

    expect(getStreamingToolDetails('edit', {
      file_path: 'intro.md',
      old_string: 'old\nline',
      new_string: 'new\nline\nagain',
    }, '/tmp/project')).toMatchObject({
      path: 'intro.md',
      additions: 3,
      removals: 2,
      replacements: 1,
      phase: 'preparing',
    })
  })

  test('extracts incomplete streaming tool calls for every tool before execution starts', () => {
    const calls = extractStreamingToolCalls({
      role: 'assistant',
      content: [
        { type: 'text', text: 'checking' },
        {
          type: 'toolCall',
          id: '',
          name: 'bash',
          arguments: {},
          partialArgs: '{"command":"pwd"}',
        },
        {
          type: 'toolCall',
          id: 'call-read',
          name: 'read',
          arguments: { file_path: 'src/app.ts' },
        },
      ],
    } as any, 'assistant-1')

    expect(calls).toEqual([
      {
        id: 'assistant-1-1',
        actualId: undefined,
        fallbackId: 'assistant-1-1',
        name: 'bash',
        args: { command: 'pwd' },
      },
      {
        id: 'call-read',
        actualId: 'call-read',
        fallbackId: 'assistant-1-2',
        name: 'read',
        args: { file_path: 'src/app.ts' },
      },
    ])
  })
})
