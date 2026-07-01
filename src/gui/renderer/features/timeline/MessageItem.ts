import React from 'react'
import { Bot, MessageSquare, Sparkles } from 'lucide-react'
import { Markdown } from '../../components/Markdown.ts'
import { cx } from '../../lib/cx.ts'
import type { GuiChatItem } from '../../../shared/types.ts'

export function MessageItem({ item }: { item: Extract<GuiChatItem, { kind: 'message' }> }) {
  return React.createElement('article', { className: cx('chat-item', item.role) },
    React.createElement('div', { className: 'avatar' }, item.role === 'assistant' ? React.createElement(Bot, { size: 16 }) : React.createElement(MessageSquare, { size: 16 })),
    React.createElement('div', { className: 'bubble' },
      React.createElement('div', { className: 'bubble-head' },
        React.createElement('span', null, item.role === 'assistant' ? 'Microcode' : 'You'),
        item.streaming && React.createElement('span', { className: 'streaming' }, 'streaming'),
      ),
      item.blocks.length === 0
        ? React.createElement('div', { className: 'muted' }, '...')
        : item.blocks.map((block, index) => {
            if (block.type === 'thinking') {
              return React.createElement('div', { className: 'thinking-block', key: index },
                React.createElement('div', { className: 'thinking-label' }, React.createElement(Sparkles, { size: 14 }), 'thinking'),
                React.createElement('pre', null, block.thinking),
              )
            }
            if (block.type === 'image') {
              return React.createElement('div', { className: 'image-pill', key: index }, block.label)
            }
            return React.createElement(Markdown, { key: index, text: block.text })
          }),
      item.errorMessage && React.createElement('div', { className: 'error-line' }, item.errorMessage),
    ),
  )
}
