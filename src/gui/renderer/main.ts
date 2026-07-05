import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import 'katex/dist/katex.min.css'
import './styles.css'
import './styles/overrides.css'

const root = createRoot(document.getElementById('root')!)
root.render(React.createElement(App))
