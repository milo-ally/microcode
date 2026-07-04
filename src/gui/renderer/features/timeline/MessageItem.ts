import React from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Markdown } from '../../components/Markdown.ts'
import { cx } from '../../lib/cx.ts'
import type { GuiChatItem } from '../../../shared/types.ts'

function LoadingDots() {
  return React.createElement('span', { className: 'loading-dots', 'aria-label': '正在思考' },
    React.createElement('span', null),
    React.createElement('span', null),
    React.createElement('span', null),
  )
}

export function MessageItem({ item }: { item: Extract<GuiChatItem, { kind: 'message' }> }) {
  if (item.blocks.length === 0 && !item.streaming && !item.errorMessage) {
    return null
  }

  const isThinkingPlaceholder =
    item.role === 'assistant' &&
    item.streaming === true &&
    item.blocks.length === 1 &&
    item.blocks[0]?.type === 'text' &&
    item.blocks[0].text === '正在思考...'
  return React.createElement('article', { className: cx('chat-item', item.role) },
    item.role === 'assistant'
      ? React.createElement('div', { className: 'avatar' }, React.createElement(Bot, { size: 16 }))
      : null,
    React.createElement('div', { className: 'bubble' },
      React.createElement('div', { className: 'bubble-head' },
        React.createElement('span', null, item.role === 'assistant' ? 'Microcode' : 'You'),
        item.streaming && React.createElement('span', { className: 'streaming' }, 'streaming'),
      ),
      isThinkingPlaceholder
        ? React.createElement('div', { className: 'thinking-placeholder' },
            React.createElement(LoadingDots),
          )
        : item.blocks.length === 0
        ? null
        : item.blocks.map((block, index) => {
            if (block.type === 'thinking') {
              return React.createElement('div', { className: 'thinking-block', key: index },
                React.createElement('div', { className: 'thinking-label' },
                  React.createElement(Sparkles, { size: 14 }),
                  React.createElement('span', null, 'thinking'),
                  item.streaming && React.createElement('span', { className: 'mini-spinner' }),
                ),
                React.createElement('div', { className: 'thinking-content' }, block.thinking || '正在思考...'),
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
