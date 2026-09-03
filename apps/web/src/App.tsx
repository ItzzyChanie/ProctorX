import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './Frontend/landing-page/LandingPage';
import {
  ChangePasswordRoute,
  ProtectedRoute,
} from './components/ProtectedRoute';
import ChangePasswordPage from './pages/auth/ChangePasswordPage';
import GetStartedPage from './pages/public/GetStartedPage';

import StudentDashboard from './pages/student/StudentDashboard';
import JoinSession from './pages/student/JoinSession';
import MySessions from './pages/student/MySessions';
import Notifications from './pages/student/Notifications';
import StudentProfile from './pages/student/Profile';

import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherProfile from './pages/teacher/Profile';
import LiveMonitoring from './pages/teacher/LiveMonitoring';
import Sessions from './pages/teacher/Sessions';
import Recordings from './pages/teacher/Recordings';
import Incidents from './pages/teacher/Incidents';
import Correlation from './pages/teacher/Correlation';
import Classes from './pages/teacher/Classes';
import ClassSections from './pages/teacher/ClassSections';
import StudentRosters from './pages/teacher/StudentRosters';
import SubmittedExams from './pages/teacher/SubmittedExams';
import Messages from './pages/teacher/Messages';

import DeanDashboard from './pages/dean/DeanDashboard';
import DeanProfile from './pages/dean/Profile';
import Analytics from './pages/dean/Analytics';
import AcademicSemesters from './pages/dean/AcademicSemesters';
import Departments from './pages/dean/Departments';
import Reports from './pages/dean/Reports';
import AuditLogs from './pages/dean/AuditLogs';
import Security from './pages/dean/Security';
import StudentLists from './pages/shared/StudentLists';

import { Role } from './types';
import { api } from './lib/api';
import { useAuthStore } from './store/authStore';
import { notificationSocket } from './lib/socket';

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { setAuth, finishSessionCheck, user, isAuthenticated, signOut } =
    useAuthStore();
  useEffect(() => {
    // Remove the legacy localStorage bearer token after upgrading to cookies.
    window.localStorage.removeItem('proctorx-auth');
    void api
      .get('/auth/me')
      .then(({ data }) => setAuth(data))
      .catch(() => undefined)
      .finally(finishSessionCheck);
  }, [finishSessionCheck, setAuth]);
  useEffect(() => {
    if (!isAuthenticated || user?.role !== Role.STUDENT) {
      notificationSocket.disconnect();
      return;
    }
    notificationSocket.connect();
    const heartbeat = () => {
      void api.post('/auth/heartbeat').catch(() => {
        signOut();
        notificationSocket.disconnect();
      });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => {
      window.clearInterval(timer);
      notificationSocket.disconnect();
    };
  }, [isAuthenticated, signOut, user?.role]);
  return <>{children}</>;
}

function HomeRoute() {
  const { isSessionLoading, isAuthenticated, user } = useAuthStore();
  if (isSessionLoading) return null;
  if (!isAuthenticated || !user) return <LandingPage />;
  return (
    <Navigate
      to={
        user.mustChangePassword
          ? '/change-password'
          : `/${user.role.toLowerCase()}`
      }
      replace
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionBootstrap>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/get-started" element={<GetStartedPage />} />
          <Route element={<ChangePasswordRoute />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={[Role.STUDENT]} />}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/join" element={<JoinSession />} />
            <Route path="/student/sessions" element={<MySessions />} />
            <Route path="/student/notifications" element={<Notifications />} />
            <Route path="/student/profile" element={<StudentProfile />} />
          </Route>

          <Route element={<ProtectedRoute roles={[Role.TEACHER]} />}>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/monitoring" element={<LiveMonitoring />} />
            <Route path="/teacher/live" element={<LiveMonitoring />} />
            <Route path="/teacher/sessions" element={<Sessions />} />
            <Route path="/teacher/recordings" element={<Recordings />} />
            <Route path="/teacher/incidents" element={<Incidents />} />
            <Route path="/teacher/correlation" element={<Correlation />} />
            <Route path="/teacher/classes" element={<Classes />} />
            <Route path="/teacher/class-sections" element={<ClassSections />} />
            <Route path="/teacher/rosters" element={<StudentRosters />} />
            <Route path="/teacher/submitted-exams" element={<SubmittedExams />} />
            <Route path="/teacher/messages" element={<Messages />} />
            <Route path="/teacher/profile" element={<TeacherProfile />} />
            <Route
              path="/teacher/students"
              element={<StudentLists role="teacher" />}
            />
          </Route>

          <Route element={<ProtectedRoute roles={[Role.DEAN]} />}>
            <Route path="/dean" element={<DeanDashboard />} />
            <Route path="/dean/analytics" element={<Analytics />} />
            <Route path="/dean/academic-semesters" element={<AcademicSemesters />} />
            <Route path="/dean/departments" element={<Departments />} />
            <Route path="/dean/reports" element={<Reports />} />
            <Route path="/dean/audit" element={<AuditLogs />} />
            <Route path="/dean/security" element={<Security />} />
            <Route path="/dean/profile" element={<DeanProfile />} />
            <Route
              path="/dean/students"
              element={<StudentLists role="dean" />}
            />
          </Route>
        </Routes>
      </SessionBootstrap>
    </BrowserRouter>
  );
}
