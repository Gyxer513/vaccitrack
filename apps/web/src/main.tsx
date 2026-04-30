import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { trpc, trpcClient } from './lib/trpc'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { ConfirmProvider, ToastProvider } from './components/ui/Dialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DepartmentProvider } from './components/DepartmentProvider'
import './index.css'
import './styles/vt.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <DepartmentProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <App />
                  </ConfirmProvider>
                </ToastProvider>
              </DepartmentProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </trpc.Provider>
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
)
