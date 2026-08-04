import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/Home/HomePage';
import { HospitalsPage } from '../pages/Hospitals/HospitalsPage';
import { DoctorsPage } from '../pages/Doctors/DoctorsPage';
import { ROUTES } from './routeConstants';
import { PublicLayout } from './PublicLayout';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-6 py-20 text-center text-ink-300">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand-200">Coming soon</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.hospitals} element={<HospitalsPage />} />
        <Route path={ROUTES.doctors} element={<DoctorsPage />} />
        <Route path={ROUTES.about} element={<PlaceholderPage title="About" />} />
        <Route path={ROUTES.help} element={<PlaceholderPage title="Help" />} />
        <Route path={ROUTES.contact} element={<PlaceholderPage title="Contact" />} />
        <Route path={ROUTES.reviews} element={<PlaceholderPage title="Reviews" />} />
        <Route path={ROUTES.login} element={<PlaceholderPage title="Login" />} />
        <Route path={ROUTES.register} element={<PlaceholderPage title="Register" />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}
