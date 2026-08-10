import { BrowserRouter } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppRoutes } from './routes/AppRoutes';
import { AppProviders } from './providers';

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
      <SpeedInsights />
    </BrowserRouter>
  );
}