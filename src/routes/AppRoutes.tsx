import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/Home/HomePage';
import { HospitalsPage } from '../pages/Hospitals/HospitalsPage';
import { PharmaciesPage } from '../pages/Pharmacies/PharmaciesPage';
import { LabsPage } from '../pages/Labs/LabsPage';
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
import { AboutPage } from '../pages/About/AboutPage';
import { HelpPage } from '../pages/Help/HelpPage';
import { ContactPage } from '../pages/Contact/ContactPage';
import { AIChatPage } from '../features/health-agent';
import { ROUTES } from './routeConstants';
import { PublicLayout } from './PublicLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AdminRoute } from '../components/AdminRoute';
import {
  AdminAppointmentsPage,
  AdminDashboardPage,
  AdminLayout,
  AdminNotificationsPage,
  AdminProvidersPage,
  AdminReportsPage,
  AdminReviewsPage,
  AdminSecurityPage,
  AdminUsersPage,
} from '../pages/Admin';

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
        <Route path={ROUTES.pharmacies} element={<PharmaciesPage />} />
        <Route path={ROUTES.labs} element={<LabsPage />} />
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
        {/* Admin console — server-role gated; /admin/* requires admin or
            super_admin (AdminRoute),and there is no separate admin login
            path — authentication rides the normal Supabase session. */}
        <Route path={ROUTES.admin} element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="providers" element={<AdminProvidersPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="appointments" element={<AdminAppointmentsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
          <Route path="security" element={<AdminSecurityPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}
