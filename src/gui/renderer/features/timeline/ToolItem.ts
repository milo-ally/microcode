import React, { useState } from 'react'
import type { GuiToolItem } from '../../../shared/types.ts'
import { getToolRenderer } from './tool-renderers/registry.ts'

export function ToolItem({ item }: { item: GuiToolItem }) {
  const [expanded, setExpanded] = useState(false)
  const Renderer = getToolRenderer(item.toolName)
  return React.createElement(Renderer, {
    item,
    expanded,
    onToggleExpanded: () => setExpanded((value) => !value),
  })
}
