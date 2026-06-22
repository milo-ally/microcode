import { Container, Text, Box } from '@earendil-works/pi-tui'
import type { ToolUIComponent, ToolResult } from '../registry.ts'
import type { GitWorktreeInput } from './GitWorktreeTool.ts'

export class GitWorktreeToolUI extends Container implements ToolUIComponent {
  private executionStarted = false
  private result?: ToolResult
  private readonly contentBox: Box

  constructor(_toolCallId: string, private args: GitWorktreeInput) {
    super()
    this.contentBox = new Box({ paddingLeft: 2 })
    this.addChild(this.contentBox)
    this.rebuild()
  }

  setExpanded(_expanded: boolean): void {}
  markExecutionStarted(): void { this.executionStarted = true; this.rebuild() }
  updateArgs(args: Record<string, unknown>): void { this.args = args as GitWorktreeInput; this.rebuild() }
  updateElapsed(_elapsedMs: number): void {}
  updateResult(result: ToolResult, _isPartial?: boolean): void { this.result = result; this.rebuild() }

  private rebuild(): void {
    this.contentBox.clear()
    const action = this.args?.action ?? 'status'
    if (this.result?.isError) {
      const errText = this.result.content.map(c => c.text).join('\n')
      this.contentBox.addChild(new Text(`✗ worktree ${action} failed: ${errText.slice(0, 200)}`, 1, 0))
    } else if (this.result) {
      const text = this.result.content.map(c => c.text).join('\n')
      this.contentBox.addChild(new Text(`✓ worktree ${action}: ${text.slice(0, 200)}`, 1, 0))
    } else if (this.executionStarted) {
      this.contentBox.addChild(new Text(`● worktree ${action}`, 1, 0))
    } else {
      this.contentBox.addChild(new Text(`○ worktree ${action}`, 1, 0))
    }
  }
}
