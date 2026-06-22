import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { AuthGate } from '@/app/auth-gate'
import { AppProviders } from '@/app/providers'
import { router } from '@/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </AppProviders>
  </StrictMode>,
)
