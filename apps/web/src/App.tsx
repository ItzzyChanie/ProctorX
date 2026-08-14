import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LandingPage from './Frontend/landing-page/LandingPage'
import { ChangePasswordRoute, ProtectedRoute } from './components/ProtectedRoute'
import ChangePasswordPage from './pages/auth/ChangePasswordPage'
import StudentDashboard from './pages/student/StudentDashboard'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import DeanDashboard from './pages/dean/DeanDashboard'
import { Role } from './types'

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<LandingPage />} /><Route element={<ChangePasswordRoute />}><Route path="/change-password" element={<ChangePasswordPage />} /></Route><Route element={<ProtectedRoute roles={[Role.STUDENT]} />}><Route path="/student" element={<StudentDashboard />} /></Route><Route element={<ProtectedRoute roles={[Role.TEACHER]} />}><Route path="/teacher" element={<TeacherDashboard />} /></Route><Route element={<ProtectedRoute roles={[Role.DEAN]} />}><Route path="/dean" element={<DeanDashboard />} /></Route></Routes></BrowserRouter>
}
