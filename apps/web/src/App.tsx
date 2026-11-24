import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './Frontend/landing-page/LandingPage';
import { ErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary';
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
import AssessmentCalendar from './pages/student/AssessmentCalendar';
import ProgressAnalytics from './pages/student/ProgressAnalytics';
import ExamResult from './pages/student/ExamResult';

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
import ItemAnalysis from './pages/teacher/ItemAnalysis';
import Messages from './pages/teacher/Messages';
import QuestionBank from './pages/teacher/QuestionBank';

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
import { TeacherPermissionGate } from './components/TeacherPermissionGate';

const teacherGate = (
  permission: string,
  pageTitle: string,
  children: React.ReactNode
) => (
  <TeacherPermissionGate permission={permission} pageTitle={pageTitle}>
    {children}
  </TeacherPermissionGate>
);

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
    if (!isAuthenticated || !user) {
      notificationSocket.disconnect();
      return;
    }
    notificationSocket.connect();
    if (user.role !== Role.STUDENT)
      return () => notificationSocket.disconnect();
    const heartbeat = () => {
      void api.post('/auth/heartbeat').catch((error: unknown) => {
        const status =
          typeof error === 'object' &&
          error !== null &&
          'response' in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        // 401/403 means the login was revoked or expired. Transient network,
        // database, and 5xx failures must not log a student out.
        if (status === 401 || status === 403) {
          signOut();
          notificationSocket.disconnect();
        }
      });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => {
      window.clearInterval(timer);
      notificationSocket.disconnect();
    };
  }, [isAuthenticated, signOut, user?.role]);
  useEffect(() => {
    if (!isAuthenticated || user?.role !== Role.TEACHER) return;
    const refreshPermissions = () => {
      void api.get('/auth/me').then(({ data }) => setAuth(data));
    };
    const timer = window.setInterval(refreshPermissions, 30_000);
    window.addEventListener('focus', refreshPermissions);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshPermissions);
    };
  }, [isAuthenticated, setAuth, user?.role]);
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
        <RouteErrorBoundary>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/get-started" element={<GetStartedPage />} />
          <Route element={<ChangePasswordRoute />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={[Role.STUDENT]} />}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route
              path="/student/join"
              element={
                <ErrorBoundary variant="exam">
                  <JoinSession />
                </ErrorBoundary>
              }
            />
            <Route path="/student/sessions" element={<MySessions />} />
            <Route path="/student/sessions/:sessionId/result" element={<ExamResult />} />
            <Route path="/student/calendar" element={<AssessmentCalendar />} />
            <Route path="/student/progress" element={<ProgressAnalytics />} />
            <Route path="/student/notifications" element={<Notifications />} />
            <Route path="/student/profile" element={<StudentProfile />} />
          </Route>

          <Route element={<ProtectedRoute roles={[Role.TEACHER]} />}>
            <Route path="/teacher" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Dashboard', <TeacherDashboard />)} />
            <Route path="/teacher/monitoring" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Live Monitoring', <LiveMonitoring />)} />
            <Route path="/teacher/live" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Live Monitoring', <LiveMonitoring />)} />
            <Route path="/teacher/sessions" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Sessions', <Sessions />)} />
            <Route path="/teacher/recordings" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Recordings', <Recordings />)} />
            <Route path="/teacher/incidents" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Incidents', <Incidents />)} />
            <Route path="/teacher/correlation" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Correlation', <Correlation />)} />
            <Route path="/teacher/classes" element={<Classes />} />
            <Route path="/teacher/class-sections" element={<ClassSections />} />
            <Route path="/teacher/rosters" element={teacherGate('VIEW_STUDENT_ROSTERS', 'Student Rosters', <StudentRosters />)} />
            <Route path="/teacher/submitted-exams" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Submitted Exams', <SubmittedExams />)} />
            <Route path="/teacher/messages" element={<Messages />} />
            <Route path="/teacher/question-bank" element={teacherGate('CREATE_EXAM', 'Question Bank', <QuestionBank />)} />
            <Route path="/teacher/item-analysis" element={teacherGate('VIEW_OWN_CLASS_SESSIONS', 'Item Analysis', <ItemAnalysis />)} />
            <Route path="/teacher/profile" element={<TeacherProfile />} />
            <Route
              path="/teacher/students"
              element={teacherGate('VIEW_STUDENT_ROSTERS', 'Student Lists', <StudentLists role="teacher" />)}
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
        </RouteErrorBoundary>
      </SessionBootstrap>
    </BrowserRouter>
  );
}
