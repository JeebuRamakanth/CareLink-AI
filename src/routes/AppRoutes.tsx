import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
// Home stays eager: it is the landing route and drives LCP.
import { HomePage } from '../pages/Home/HomePage';
import { ROUTES } from './routeConstants';
import { PublicLayout } from './PublicLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';

// Route-level code splitting (Step 14 §23): every non-landing page loads on
// demand so the initial bundle stays small. The shared Suspense fallback is a
// minimal accessible loading state (never a blank screen).
const HospitalsPage = lazy(() => import('../pages/Hospitals/HospitalsPage').then((m) => ({ default: m.HospitalsPage })));
const DoctorsPage = lazy(() => import('../pages/Doctors/DoctorsPage').then((m) => ({ default: m.DoctorsPage })));
const DoctorProfilePage = lazy(() => import('../pages/Doctors/DoctorProfilePage').then((m) => ({ default: m.DoctorProfilePage })));
const ReviewsPage = lazy(() => import('../pages/Reviews/ReviewsPage').then((m) => ({ default: m.ReviewsPage })));
const HospitalDetailsPage = lazy(() => import('../pages/Hospitals/HospitalDetailsPage').then((m) => ({ default: m.HospitalDetailsPage })));
const AppointmentsPage = lazy(() => import('../pages/Appointments/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })));
const AppointmentDetailPage = lazy(() => import('../pages/Appointments/AppointmentDetailPage').then((m) => ({ default: m.AppointmentDetailPage })));
const AgentCommandCenterPage = lazy(() => import('../pages/Agent/AgentCommandCenterPage').then((m) => ({ default: m.AgentCommandCenterPage })));
const LoginPage = lazy(() => import('../pages/Auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../pages/Auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ProfilePage = lazy(() => import('../pages/Auth/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DocumentsLibraryPage = lazy(() => import('../pages/Documents/DocumentsLibraryPage').then((m) => ({ default: m.DocumentsLibraryPage })));
const AboutPage = lazy(() => import('../pages/About/AboutPage').then((m) => ({ default: m.AboutPage })));
const HelpPage = lazy(() => import('../pages/Help/HelpPage').then((m) => ({ default: m.HelpPage })));
const ContactPage = lazy(() => import('../pages/Contact/ContactPage').then((m) => ({ default: m.ContactPage })));
const AIChatPage = lazy(() => import('../features/health-agent').then((m) => ({ default: m.AIChatPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path={ROUTES.about} element={<AboutPage />} />
        <Route path={ROUTES.help} element={<HelpPage />} />
        <Route path={ROUTES.contact} element={<ContactPage />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
    </Suspense>
  );
}
