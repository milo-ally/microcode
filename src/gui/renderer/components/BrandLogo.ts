import React from 'react'

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return React.createElement('span', { className: 'brand-logo' },
    React.createElement('img', {
      src: './assets/microcode-logo.svg',
      alt: '',
      width: compact ? 24 : 28,
      height: compact ? 24 : 28,
      draggable: false,
    }),
    !compact && React.createElement('span', null, 'Microcode'),
  )
}
