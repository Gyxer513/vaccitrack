import { Link } from 'react-router-dom'

type Props = {
  /** Маленький код в бейдже сверху: «404», «500», «OFFLINE» и т.п. */
  code?: string
  /** Крупный заголовок */
  title: string
  /** Подпись с описанием */
  message?: string
  /** Опциональные действия снизу (кнопки/ссылки) */
  actions?: React.ReactNode
  /** Подробности ошибки для разработчиков (показываются в <details>) */
  details?: string
}

export function ErrorPage({ code, title, message, actions, details }: Props) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 200px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        className="vt-card"
        style={{
          padding: 40,
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
          display: 'grid',
          gap: 14,
        }}
      >
        {code && (
          <div
            style={{
              fontFamily: 'var(--vt-font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'var(--vt-hint)',
              textTransform: 'uppercase',
            }}
          >
            {code}
          </div>
        )}

        <h1
          style={{
            fontFamily: 'var(--vt-font-display)',
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--vt-text)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {title}
        </h1>

        {message && (
          <p
            style={{
              fontSize: 14,
              color: 'var(--vt-muted)',
              lineHeight: 1.55,
              margin: 0,
              maxWidth: 400,
              marginInline: 'auto',
            }}
          >
            {message}
          </p>
        )}

        {details && (
          <details style={{ textAlign: 'left', marginTop: 8 }}>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--vt-hint)',
                userSelect: 'none',
              }}
            >
              Подробности ошибки
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--vt-bg-warm)',
                border: '1px solid var(--vt-border)',
                borderRadius: 8,
                fontSize: 11,
                fontFamily: 'var(--vt-font-mono)',
                color: 'var(--vt-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {details}
            </pre>
          </details>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
          {actions ?? (
            <Link to="/patients" className="vt-btn vt-btn-primary">
              На главную
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
