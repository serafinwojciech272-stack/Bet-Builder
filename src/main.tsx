import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bet Builder render failure', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-[#07090d] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b7cff]">Bet Builder · runtime guard</p>
          <h1 className="mt-3 text-2xl font-semibold">Application failed to render</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            The UI hit a client-side error. Your data and browser session were not modified.
          </p>
          <pre className="mt-5 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/70">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-[#8b7cff] px-4 py-2.5 text-sm font-semibold text-[#07090d] transition hover:opacity-90"
          >
            Reload application
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
