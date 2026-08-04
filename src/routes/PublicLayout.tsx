import { Outlet } from 'react-router-dom';
import { GlobalLayout } from '../components/layout/GlobalLayout';

export function PublicLayout() {
  return (
    <GlobalLayout>
      <Outlet />
    </GlobalLayout>
  );
}
