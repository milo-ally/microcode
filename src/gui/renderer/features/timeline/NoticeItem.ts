import React from 'react'
import { cx } from '../../lib/cx.ts'
import type { GuiChatItem } from '../../../shared/types.ts'

export function NoticeItem({ item }: { item: Extract<GuiChatItem, { kind: 'notice' }> }) {
  return React.createElement('div', { className: cx('notice-item', item.level) }, item.text)
}
