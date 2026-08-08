import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AppRoutes } from './routes/AppRoutes';
import { AppProviders } from './providers';

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
      <Analytics />
    </BrowserRouter>
  );
}