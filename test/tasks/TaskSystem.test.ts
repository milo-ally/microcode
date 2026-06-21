import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { TaskSystem } from '../../src/tasks/TaskSystem.ts'
import { createTaskTool } from '../../src/tools/TaskTool/TaskTool.ts'
import { TOOL_DEFAULT_PERMISSIONS } from '../../src/tools/index.ts'
import { getToolDefinition } from '../../src/tools/registry.ts'
import { Value } from 'typebox/value'

const temporaryRoots: string[] = []

async function createSystem(): Promise<TaskSystem> {
  const root = await mkdtemp(join(tmpdir(), 'microcode-tasks-'))
  temporaryRoots.push(root)
  return new TaskSystem(root)
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('TaskSystem', () => {
  test('registers TaskTool as an allowed, non-deferred default tool', () => {
    expect(TOOL_DEFAULT_PERMISSIONS.task).toBe('allow')
    expect(getToolDefinition('task')?.shouldDefer).toBe(false)
  })

  test('exposes a flat model-friendly schema for every task action', () => {
    const tool = createTaskTool(process.cwd())
    const schema = tool.parameters as any

    expect(schema.type).toBe('object')
    expect(schema.anyOf).toBeUndefined()
    expect(Value.Check(schema, {
      action: 'write',
      title: 'Plan',
      tasks: ['Inspect code'],
    })).toBe(true)
    expect(Value.Check(schema, {
      action: 'mark',
      task_id: 'task-1',
      checked: true,
    })).toBe(true)
    expect(Value.Check(schema, {
      action: 'mark_batch',
      list_id: 'list-1',
      tasks: [
        { task_id: 'task-1', checked: true },
        { task_id: 'task-2', status: 'pending' },
      ],
    })).toBe(true)
  })

  test('creates, claims, and marks tasks within one session', async () => {
    const system = await createSystem()
    const created = await system.createList('session-a', 'Implement feature', [
      'Add storage',
      'Add UI',
    ])

    expect(created.tasks.map((task) => task.completed)).toEqual([false, false])

    const marked = await system.markTask(
      'session-a',
      created.id,
      created.tasks[0]!.id,
      true,
    )
    expect(marked.tasks.map((task) => task.completed)).toEqual([true, false])

    const claimed = await system.claimTaskList('session-a', created.id)
    expect(claimed.tasks.map((task) => task.content)).toEqual(['Add UI'])
  })

  test('isolates task lists by session', async () => {
    const system = await createSystem()
    await system.createList('session-a', 'A', ['Only A'])
    await system.createList('session-b', 'B', ['Only B'])

    expect((await system.listTaskLists('session-a')).map((list) => list.title)).toEqual(['A'])
    expect((await system.listTaskLists('session-b')).map((list) => list.title)).toEqual(['B'])
  })

  test('marks a task in the most recent matching list when list ID is omitted', async () => {
    const system = await createSystem()
    await system.createList('session-a', 'Older list', ['Older task'])
    const latest = await system.createList('session-a', 'Latest list', ['Latest task'])

    const marked = await system.markTask(
      'session-a',
      undefined,
      latest.tasks[0]!.id,
      true,
    )

    expect(marked.title).toBe('Latest list')
    expect(marked.tasks[0]?.completed).toBe(true)
  })

  test('serializes concurrent updates for the same session without losing changes', async () => {
    const system = await createSystem()
    const list = await system.createList(
      'session-a',
      'Concurrent',
      Array.from({ length: 7 }, (_, index) => `Task ${index + 1}`),
    )

    await Promise.all(
      list.tasks.map((task) =>
        system.markTask('session-a', list.id, task.id, true)
      ),
    )

    const saved = await system.getTaskList('session-a', list.id)
    expect(saved?.tasks.every((task) => task.completed)).toBe(true)
  })

  test('marks and reminds multiple tasks atomically', async () => {
    const system = await createSystem()
    const list = await system.createList('session-a', 'Batch', [
      'First',
      'Second',
      'Third',
    ])

    const marked = await system.markTasks('session-a', {
      list_id: list.id,
      tasks: [
        { task_id: 'task-1', checked: true },
        { task_id: 'task-2', status: 'pending' },
      ],
    })
    expect(marked.tasks.map((task) => [task.completed, task.pending])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ])

    const reminded = await system.remindTasks('session-a', list.id, [
      { task_id: 'task-2' },
      { task_id: 'task-3', reminder: true },
    ])
    expect(reminded.tasks.map((task) => task.reminder)).toEqual([
      false,
      true,
      true,
    ])
  })

  test('keeps batch updates atomic when one task is invalid', async () => {
    const system = await createSystem()
    const list = await system.createList('session-a', 'Atomic batch', [
      'First',
      'Second',
    ])

    expect(system.markTasks('session-a', {
      list_id: list.id,
      tasks: [
        { task_id: 'task-1', checked: true },
        { task_id: 'missing', checked: true },
      ],
    })).rejects.toThrow(
      `Task 'missing' not found. Current tasks in list '${list.id}':`,
    )

    const saved = await system.getTaskList('session-a', list.id)
    expect(saved?.tasks.map((task) => task.completed)).toEqual([false, false])
  })

  test('builds reminders from unfinished tasks and removes completed work', async () => {
    const system = await createSystem()
    const list = await system.createList('session-a', 'Reminder list', [
      'First task',
      'Second task',
    ])

    const initial = await system.getReminder('session-a')
    expect(initial).toContain('<reminder>')
    expect(initial).toContain(`list_id: ${list.id}`)
    expect(initial).toContain('task-1: First task')
    expect(initial).toContain('task-2: Second task')
    expect(initial).toContain(
      '<!-- task-reminder-meta: 1 lists, 2 total unfinished, 0 hidden (capped by MAX_REMINDER) -->',
    )

    await system.markTask('session-a', list.id, 'task-1', true)
    const partial = await system.getReminder('session-a')
    expect(partial).not.toContain('task-1: First task')
    expect(partial).toContain('task-2: Second task')

    await system.markTask('session-a', list.id, 'task-2', true)
    expect(await system.getReminder('session-a')).toBeUndefined()
  })

  test('reports reminder truncation metadata', async () => {
    const system = await createSystem()
    await system.createList(
      'session-a',
      'Large list',
      Array.from({ length: 25 }, (_, index) => `Task ${index + 1}`),
    )

    const reminder = await system.getReminder('session-a')
    expect(reminder).toContain('5 more unfinished tasks')
    expect(reminder).toContain(
      '<!-- task-reminder-meta: 1 lists, 25 total unfinished, 5 hidden (capped by MAX_REMINDER) -->',
    )
  })

  test('prioritizes user-selected reminders and clears them on completion', async () => {
    const system = await createSystem()
    const list = await system.createList('session-a', 'Human collaboration', [
      'Normal task',
      'User-selected task',
    ])

    const reminded = await system.remindTask('session-a', list.id, 'task-2')
    expect(reminded.tasks[1]?.reminder).toBe(true)

    const reminder = await system.getReminder('session-a')
    expect(reminder).toContain('User-selected priority tasks:')
    expect(reminder).toContain(
      `[!] task-2: User-selected task (list_id: ${list.id}, list: Human collaboration)`,
    )
    expect(reminder?.match(/task-2: User-selected task/g)).toHaveLength(1)
    expect(reminder).toContain('task-1: Normal task')

    const completed = await system.markTask(
      'session-a',
      list.id,
      'task-2',
      true,
    )
    expect(completed.tasks[1]?.reminder).toBe(false)
    expect(await system.getReminder('session-a')).not.toContain(
      'User-selected priority tasks:',
    )
  })

  test('does not allow completed tasks to be added as reminders', async () => {
    const system = await createSystem()
    const list = await system.createList('session-a', 'Completed list', ['Done'])
    await system.markTask('session-a', list.id, 'task-1', true)

    expect(system.remindTask('session-a', list.id, 'task-1')).rejects.toThrow(
      'Completed tasks cannot be added as reminders.',
    )
  })

  test('TaskTool returns only unfinished work when claiming', async () => {
    const system = await createSystem()
    const sessionId = 'tool-session'
    const persistence = {
      createTaskList: (title: string, tasks: readonly string[]) =>
        system.createList(sessionId, title, tasks),
      claimTaskList: (listId: string) => system.claimTaskList(sessionId, listId),
      markTask: (listId: string, taskId: string, completed: boolean) =>
        system.markTask(sessionId, listId, taskId, completed),
    }
    const tool = createTaskTool(process.cwd(), {
      getPersistence: () => persistence as any,
    })

    const written = await tool.execute('write', {
      action: 'write',
      title: 'Tool flow',
      tasks: ['First', 'Second'],
    })
    const list = written.details!.list
    await tool.execute('mark', {
      action: 'mark',
      list_id: list.id,
      task_id: list.tasks[0]!.id,
      completed: true,
    })
    const claimed = await tool.execute('claim', {
      action: 'claim',
      list_id: list.id,
    })

    expect(claimed.details!.list.tasks.map((task) => task.content)).toEqual(['Second'])
    expect(claimed.content[0]?.text).not.toContain('First')
    expect(claimed.content[0]?.text).toContain(
      'Total: 2 tasks, Completed: 1, In progress: 0, Remaining: 1',
    )
  })

  test('TaskTool marks tasks in one batch', async () => {
    const system = await createSystem()
    const sessionId = 'batch-tool-session'
    const tool = createTaskTool(process.cwd(), {
      getPersistence: () => ({
        createTaskList: (title: string, tasks: readonly string[]) =>
          system.createList(sessionId, title, tasks),
        claimTaskList: (listId: string) =>
          system.claimTaskList(sessionId, listId),
        markTask: (
          listId: string | undefined,
          taskId: string,
          completed: boolean,
          pending?: boolean,
        ) => system.markTask(sessionId, listId, taskId, completed, pending),
        markTasks: (input: Parameters<TaskSystem['markTasks']>[1]) =>
          system.markTasks(sessionId, input),
      }),
    })
    const written = await tool.execute('write', {
      action: 'write',
      title: 'Batch tool',
      tasks: ['First', 'Second'],
    })

    const result = await tool.execute('mark-batch', {
      action: 'mark_batch',
      list_id: written.details!.list.id,
      tasks: [
        { task_id: 'task-1', checked: true },
        { task_id: 'task-2', status: 'pending' },
      ],
    })

    expect(result.details?.list.tasks.map((task) => [
      task.completed,
      task.pending,
    ])).toEqual([
      [true, false],
      [false, true],
    ])
  })

  test('TaskTool accepts structured tasks and an omitted title', async () => {
    const system = await createSystem()
    const sessionId = 'structured-session'
    const tool = createTaskTool(process.cwd(), {
      getPersistence: () => ({
        createTaskList: (title: string, tasks: readonly string[]) =>
          system.createList(sessionId, title, tasks),
        claimTaskList: (listId: string) => system.claimTaskList(sessionId, listId),
        markTask: (listId: string, taskId: string, completed: boolean) =>
          system.markTask(sessionId, listId, taskId, completed),
      }) as any,
    })

    const result = await tool.execute('write-structured', {
      action: 'write',
      tasks: [
        { id: '1', status: 'pending', content: 'Collect account information' },
        { id: '2', status: 'pending', content: 'Summarize findings' },
      ],
    })

    expect(result.details?.list.title).toBe('Task list')
    expect(result.details?.list.tasks.map((task) => task.content)).toEqual([
      'Collect account information',
      'Summarize findings',
    ])
  })

  test('TaskTool accepts checked and an omitted list ID when marking', async () => {
    const system = await createSystem()
    const sessionId = 'mark-alias-session'
    const tool = createTaskTool(process.cwd(), {
      getPersistence: () => ({
        createTaskList: (title: string, tasks: readonly string[]) =>
          system.createList(sessionId, title, tasks),
        claimTaskList: (listId: string) => system.claimTaskList(sessionId, listId),
        markTask: (
          listId: string | undefined,
          taskId: string,
          completed: boolean,
        ) => system.markTask(sessionId, listId, taskId, completed),
      }) as any,
    })
    const written = await tool.execute('write', {
      action: 'write',
      title: 'Alias flow',
      tasks: ['First'],
    })

    const result = await tool.execute('mark', {
      action: 'mark',
      task_id: written.details!.list.tasks[0]!.id,
      checked: true,
    })

    expect(result.details?.list.tasks[0]?.completed).toBe(true)
  })

  test('TaskTool reports one action-specific error for missing fields', async () => {
    const tool = createTaskTool(process.cwd(), {
      getPersistence: () => ({
        createTaskList: async () => {
          throw new Error('should not execute')
        },
        claimTaskList: async () => {
          throw new Error('should not execute')
        },
        markTask: async () => {
          throw new Error('should not execute')
        },
      }) as any,
    })

    expect(tool.execute('missing-write-tasks', {
      action: 'write',
    })).rejects.toThrow('action="write" requires a non-empty tasks array.')
    expect(tool.execute('missing-claim-list', {
      action: 'claim',
    })).rejects.toThrow('action="claim" requires list_id.')
    expect(tool.execute('missing-mark-task', {
      action: 'mark',
      checked: true,
    })).rejects.toThrow('action="mark" requires task_id.')
  })
})
