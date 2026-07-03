import React from 'react'

interface ErrorBoundaryProps {
  children?: React.ReactNode
  resetKey?: unknown
}

interface ErrorBoundaryState {
  error?: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined })
    }
  }

  render() {
    if (this.state.error) {
      return React.createElement('div', { className: 'render-error', role: 'alert' },
        React.createElement('strong', null, '界面渲染出错'),
        React.createElement('span', null, this.state.error),
      )
    }
    return this.props.children
  }
}
