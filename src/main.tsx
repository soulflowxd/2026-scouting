import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { AuthGate } from '@/app/auth-gate'
import { AppProviders } from '@/app/providers'
import { router } from '@/router'
import { DeviceNotificationsProvider } from '@/components/device-notifications'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <DeviceNotificationsProvider>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
      </DeviceNotificationsProvider>
    </AppProviders>
  </StrictMode>,
)
