/**
 * Application root: services, toasts and the data router. Frozen (WP-00).
 */
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AppServices } from '@/core/services';
import { ToastProvider } from '@/ui/primitives/Toast';
import { readAppConfig } from './config';
import { buildRoutes } from './routes';
import { createAppServices, ServicesProvider } from './services';

/** Props of `App` (tests may inject services). */
export interface AppProps {
  services?: AppServices;
}

/** The app. */
export function App({ services }: AppProps) {
  const [appServices] = useState(() => services ?? createAppServices(readAppConfig()));
  const [router] = useState(() => createBrowserRouter(buildRoutes()));
  return (
    <ServicesProvider services={appServices}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ServicesProvider>
  );
}
