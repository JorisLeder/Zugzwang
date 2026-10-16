/**
 * Application root: services, query client, toasts and the data router. Frozen (WP-00).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AppServices } from '@/core/services';
import { ToastProvider } from '@/ui/primitives';
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
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  const [router] = useState(() => createBrowserRouter(buildRoutes()));
  return (
    <ServicesProvider services={appServices}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
