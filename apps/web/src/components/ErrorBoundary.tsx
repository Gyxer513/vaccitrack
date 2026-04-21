import { Component, type ReactNode } from 'react'
import { ErrorPage } from '../pages/ErrorPage'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <ErrorPage
        code="500"
        title="Что-то пошло не так"
        message="Приложение упало на этом действии. Попробуй перезагрузить страницу или вернуться на главную."
        details={error.stack ?? error.message}
        actions={
          <>
            <button
              className="vt-btn vt-btn-ghost"
              onClick={() => { this.reset(); window.location.reload() }}
            >
              Перезагрузить
            </button>
            <a href="/patients" className="vt-btn vt-btn-primary">
              На главную
            </a>
          </>
        }
      />
    )
  }
}
