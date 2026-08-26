import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes/AppRoutes';
import { AppProviders } from './providers';
import { registerNativeBackButton } from './lib/nativeApp';

export default function App() {
  useEffect(() => registerNativeBackButton(), []);

  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}