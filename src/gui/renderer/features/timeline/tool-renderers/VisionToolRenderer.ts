import React from 'react'
import { Image } from 'lucide-react'
import { MetricRow, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function VisionToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const source = typeof item.details?.source === 'string'
    ? item.details.source
    : typeof item.args.image_source === 'string'
      ? item.args.image_source
      : 'image'
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Image, { size: 16 }),
    title: 'vision',
    subtitle: preview(source, 100),
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        typeof item.details?.sourceType === 'string' ? item.details.sourceType : undefined,
        typeof item.details?.mimeType === 'string' ? item.details.mimeType : undefined,
      ],
    }),
  )
}

