import { type Component } from '@earendil-works/pi-tui'
import { getMarkdownTheme, theme } from '../theme.ts'
import { Markdown } from './markdown.ts'

const RESULT_LINE_LIMIT = 30

export class AgentResult implements Component {
  private readonly markdown: Markdown
  private readonly omittedLines: number

  constructor(
    result: string,
    private readonly hasFollowingError: boolean,
  ) {
    const lines = result.split('\n')
    const preview = lines.slice(0, RESULT_LINE_LIMIT).join('\n')
    this.omittedLines = Math.max(0, lines.length - RESULT_LINE_LIMIT)
    this.markdown = new Markdown(preview, 3, 0, getMarkdownTheme())
  }

  invalidate(): void {
    this.markdown.invalidate()
  }

  render(width: number): string[] {
    const branch = this.hasFollowingError ? '├─' : '└─'
    const header = `${branch} ${theme.fg('accent', 'Result')} ${theme.dim('─'.repeat(Math.max(0, Math.min(39, width - 12))))}`
    const lines = [header, ...this.markdown.render(width)]

    if (this.omittedLines > 0) {
      lines.push(`   ${theme.dim(`…and ${this.omittedLines} more lines`)}`)
    }

    return lines
  }
}
