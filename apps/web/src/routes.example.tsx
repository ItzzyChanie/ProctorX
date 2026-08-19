/**
 * EXAMPLE ONLY — shows how these pages map onto react-router-dom routes.
 * Merge this into your actual App.tsx / router file; don't import this file directly.
 * Wrap each role's routes in your existing <ProtectedRoute role="..."> guard.
 */
import { Route, Routes } from "react-router-dom";

import StudentDashboard from "./pages/student/StudentDashboard";
import JoinSession from "./pages/student/JoinSession";
import MySessions from "./pages/student/MySessions";
import Notifications from "./pages/student/Notifications";
import StudentProfile from "./pages/student/Profile";

import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import LiveMonitoring from "./pages/teacher/LiveMonitoring";
import Sessions from "./pages/teacher/Sessions";
import Recordings from "./pages/teacher/Recordings";
import Incidents from "./pages/teacher/Incidents";
import Correlation from "./pages/teacher/Correlation";
import Classes from "./pages/teacher/Classes";
import Messages from "./pages/teacher/Messages";

import DeanDashboard from "./pages/dean/DeanDashboard";
import Analytics from "./pages/dean/Analytics";
import Departments from "./pages/dean/Departments";
import Reports from "./pages/dean/Reports";
import AuditLogs from "./pages/dean/AuditLogs";
import Security from "./pages/dean/Security";

export function ExampleAppRoutes() {
  return (
    <Routes>
      {/* <Route element={<ProtectedRoute role="student" />}> */}
      <Route path="/student" element={<StudentDashboard />} />
      <Route path="/student/join" element={<JoinSession />} />
      <Route path="/student/sessions" element={<MySessions />} />
      <Route path="/student/notifications" element={<Notifications />} />
      <Route path="/student/profile" element={<StudentProfile />} />
      {/* </Route> */}

      {/* <Route element={<ProtectedRoute role="teacher" />}> */}
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/teacher/live" element={<LiveMonitoring />} />
      <Route path="/teacher/sessions" element={<Sessions />} />
      <Route path="/teacher/recordings" element={<Recordings />} />
      <Route path="/teacher/incidents" element={<Incidents />} />
      <Route path="/teacher/correlation" element={<Correlation />} />
      <Route path="/teacher/classes" element={<Classes />} />
      <Route path="/teacher/messages" element={<Messages />} />
      {/* </Route> */}

      {/* <Route element={<ProtectedRoute role="dean" />}> */}
      <Route path="/dean" element={<DeanDashboard />} />
      <Route path="/dean/analytics" element={<Analytics />} />
      <Route path="/dean/departments" element={<Departments />} />
      <Route path="/dean/reports" element={<Reports />} />
      <Route path="/dean/audit" element={<AuditLogs />} />
      <Route path="/dean/security" element={<Security />} />
      {/* </Route> */}
    </Routes>
  );
}
