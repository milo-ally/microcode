import { describe, expect, test } from 'bun:test'
import { TaskToolUI } from '../../src/tools/TaskTool/UI.tsx'

function renderText(component: TaskToolUI): string {
  return component.render(100).join('\n').replace(/\x1b\[[0-9;]*m/g, '')
}

describe('TaskToolUI', () => {
  test('handles a result arriving before details', () => {
    const component = new TaskToolUI('task-call', {
      action: 'write',
      title: 'Regression',
      tasks: ['Render safely'],
    })

    expect(() => {
      component.markExecutionStarted()
      component.updateResult({
        content: [{ type: 'text', text: 'created' }],
        isError: false,
      })
      component.updateDetails({})
    }).not.toThrow()
  })

  test('handles partial claim arguments without a task list', () => {
    expect(() => {
      const component = new TaskToolUI('task-call', { action: 'claim' })
      component.updateArgs({ action: 'claim', list_id: 'partial' })
      component.updateDetails({ action: 'claim' })
    }).not.toThrow()
  })

  test('renders structured write arguments without stringifying objects', () => {
    const component = new TaskToolUI('task-call', {
      action: 'write',
      tasks: [
        { id: '1', status: 'pending', content: 'Collect user information' },
      ],
    })
    component.markExecutionStarted()

    const rendered = renderText(component)
    expect(rendered).toContain('Collect user information')
    expect(rendered).not.toContain('[object Object]')
    expect(rendered).not.toContain('✕')
  })

  test('shows a concise error instead of raw validation diagnostics', () => {
    const component = new TaskToolUI('task-call', {
      action: 'mark',
      task_id: 'task-1',
    })
    component.updateResult({
      content: [{
        type: 'text',
        text: 'Validation failed for tool "task":\n- list_id: required\nReceived arguments: {}',
      }],
      isError: true,
    })

    const rendered = renderText(component)
    expect(rendered).toContain('Could not update task list')
    expect(rendered).toContain('incomplete or used an unsupported field')
    expect(rendered).not.toContain('Received arguments')
  })

  test('shows a lightweight updating state for mark calls', () => {
    const component = new TaskToolUI('task-call', {
      action: 'mark',
      task_id: 'task-1',
      checked: true,
    })
    component.markExecutionStarted()

    const rendered = renderText(component)
    expect(rendered).toContain('Updating task-1')
    expect(rendered).not.toContain('✓ task-1')
  })
})
