import type React from 'react'
import type { GuiToolItem } from '../../../../shared/types.ts'

export interface ToolRendererProps {
  item: GuiToolItem
  expanded: boolean
  onToggleExpanded: () => void
}

export type ToolRenderer = (props: ToolRendererProps) => React.ReactElement

