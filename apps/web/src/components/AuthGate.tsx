import { type ReactNode, useEffect, useState } from 'react'
import { initKeycloak } from '../lib/keycloak'

type AuthState = 'loading' | 'authenticated' | 'error'

export function AuthGate({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading')

  useEffect(() => {
    let cancelled = false

    initKeycloak()
      .then((authenticated) => {
        if (!cancelled) {
          setAuthState(authenticated ? 'authenticated' : 'loading')
        }
      })
      .catch((error) => {
        console.error('Keycloak initialization failed', error)
        if (!cancelled) {
          setAuthState('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (authState === 'authenticated') {
    return <>{children}</>
  }

  if (authState === 'error') {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <div className="mx-auto max-w-xl rounded border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Authentication unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check Keycloak availability and reload the page.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-700">
      <div className="text-sm font-medium">Connecting to Keycloak...</div>
    </main>
  )
}
