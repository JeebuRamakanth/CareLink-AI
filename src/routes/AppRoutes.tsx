import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/Home/HomePage';
import { HospitalsPage } from '../pages/Hospitals/HospitalsPage';
import { DoctorsPage } from '../pages/Doctors/DoctorsPage';
import { DoctorProfilePage } from '../pages/Doctors/DoctorProfilePage';
import { ReviewsPage } from '../pages/Reviews/ReviewsPage';
import { HospitalDetailsPage } from '../pages/Hospitals/HospitalDetailsPage';
import { AppointmentsPage } from '../pages/Appointments/AppointmentsPage';
import { AppointmentDetailPage } from '../pages/Appointments/AppointmentDetailPage';
import { AgentCommandCenterPage } from '../pages/Agent/AgentCommandCenterPage';
import { LoginPage } from '../pages/Auth/LoginPage';
import { RegisterPage } from '../pages/Auth/RegisterPage';
import { ProfilePage } from '../pages/Auth/ProfilePage';
import { DocumentsLibraryPage } from '../pages/Documents/DocumentsLibraryPage';
import { AIChatPage } from '../features/health-agent';
import { ROUTES } from './routeConstants';
import { PublicLayout } from './PublicLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';

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
      {/* Dedicated AI chat experience — full-screen, own chrome. */}
      <Route path={ROUTES.ai} element={<AIChatPage />} />
      {/* Agent command center is a full-screen workspace with its own chrome. */}
      <Route path={ROUTES.agent} element={<AgentCommandCenterPage />} />
      <Route element={<PublicLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.hospitals} element={<HospitalsPage />} />
        <Route path={ROUTES.doctors} element={<DoctorsPage />} />
        <Route path={ROUTES.doctorDetail} element={<DoctorProfilePage />} />
        <Route path={ROUTES.reviews} element={<ReviewsPage />} />
        <Route path={ROUTES.hospitalDetail} element={<HospitalDetailsPage />} />
        <Route path={ROUTES.appointments} element={<AppointmentsPage />} />
        <Route path={ROUTES.appointmentDetail} element={<AppointmentDetailPage />} />
        <Route path={ROUTES.documents} element={<DocumentsLibraryPage />} />
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.register} element={<RegisterPage />} />
        {/* Protected — requires an authenticated user. */}
        <Route path={ROUTES.profile} element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path={ROUTES.about} element={<PlaceholderPage title="About" />} />
        <Route path={ROUTES.help} element={<PlaceholderPage title="Help" />} />
        <Route path={ROUTES.contact} element={<PlaceholderPage title="Contact" />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}
