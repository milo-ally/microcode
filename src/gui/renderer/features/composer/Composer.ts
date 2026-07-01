import React, { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { COMMANDS } from '../../commands/catalog.ts'
import { cx } from '../../lib/cx.ts'
import type { GuiRuntimeSnapshot } from '../../../shared/types.ts'

export function Composer({ busy, snapshot }: { busy: boolean; snapshot?: GuiRuntimeSnapshot }) {
  const [text, setText] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [localBusy, setLocalBusy] = useState(false)
  const matches = text.startsWith('/') ? COMMANDS.filter((cmd) => cmd.startsWith(text.trim())) : []
  const effectiveBusy = busy || localBusy
  const currentModel = snapshot?.models.find((model) => model.current)

  useEffect(() => {
    if (!busy) setLocalBusy(false)
  }, [busy])

  useEffect(() => {
    setSelectedSuggestion(0)
  }, [text])

  const submit = () => {
    const value = text.trim()
    if (!value && attachments.length === 0) return
    setText('')
    const imagePaths = attachments
    setAttachments([])
    setSuggestionsOpen(false)
    setLocalBusy(true)
    if (value.startsWith('/')) void window.microcode.command(value).finally(() => setLocalBusy(false))
    else void window.microcode.prompt({ text: value, imagePaths }).finally(() => setLocalBusy(false))
  }

  const pickImages = async () => {
    setAttachOpen(false)
    if (!currentModel?.vision) {
      window.alert('当前模型不支持图片输入，请先切换到多模态模型。')
      return
    }
    const paths = await window.microcode.pickImages()
    if (paths.length > 0) setAttachments((prev) => [...prev, ...paths])
  }

  return React.createElement('div', { className: 'composer-wrap' },
    attachOpen && React.createElement('div', { className: 'attach-menu' },
      React.createElement('button', { onClick: pickImages }, '上传图片'),
      React.createElement('button', {
        onClick: () => {
          setAttachOpen(false)
          window.alert('文件上传即将支持。')
        },
      }, '上传文件'),
    ),
    attachments.length > 0 && React.createElement('div', { className: 'attachment-strip' },
      attachments.map((path) => React.createElement('button', {
        key: path,
        onClick: () => setAttachments((prev) => prev.filter((item) => item !== path)),
        title: 'Click to remove',
      }, path.split(/[\\/]/).at(-1) ?? path)),
    ),
    React.createElement('div', { className: 'composer-stack' },
      suggestionsOpen && matches.length > 0 && React.createElement('div', { className: 'slash-menu' },
        matches.map((cmd, index) => React.createElement('button', {
          key: cmd,
          className: cx(index === selectedSuggestion && 'selected'),
          onMouseEnter: () => setSelectedSuggestion(index),
          onClick: () => {
            setText(cmd)
            setSuggestionsOpen(false)
          },
        }, cmd)),
      ),
      React.createElement('div', { className: cx('composer', text.trimStart().startsWith('!') && 'shell-mode') },
        React.createElement('button', {
          className: 'composer-plus',
          title: 'Attach',
          onClick: () => setAttachOpen((open) => !open),
        }, '+'),
        React.createElement('textarea', {
          value: text,
          placeholder: '有问题，尽管问',
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setText(event.currentTarget.value)
            setSuggestionsOpen(event.currentTarget.value.startsWith('/'))
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (suggestionsOpen && matches.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedSuggestion((current) => (current + 1) % matches.length)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedSuggestion((current) => (current - 1 + matches.length) % matches.length)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setSuggestionsOpen(false)
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                setText(matches[selectedSuggestion] ?? matches[0])
                setSuggestionsOpen(false)
                return
              }
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          },
        }),
        React.createElement('div', { className: 'composer-actions' },
          effectiveBusy
            ? React.createElement('button', {
                className: 'icon-button loading',
                title: 'Stop',
                onClick: () => {
                  setLocalBusy(false)
                  void window.microcode.abort()
                },
              }, React.createElement('span', { className: 'spinner' }))
            : React.createElement('button', { className: 'icon-button primary send-button', title: 'Send', onClick: submit }, React.createElement(Send, { size: 18 })),
        ),
      ),
    ),
  )
}
