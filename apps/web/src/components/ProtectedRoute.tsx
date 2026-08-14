import { Navigate, Outlet } from 'react-router-dom'
import { Role } from '../types'
import { useAuthStore } from '../store/authStore'
export function ProtectedRoute({ roles }: { roles?: Role[] }) { const { isAuthenticated, user } = useAuthStore(); if (!isAuthenticated || !user) return <Navigate to="/" replace />; if (user.mustChangePassword) return <Navigate to="/change-password" replace />; if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role.toLowerCase()}`} replace />; return <Outlet /> }
export function ChangePasswordRoute() { const { isAuthenticated, user } = useAuthStore(); if (!isAuthenticated || !user) return <Navigate to="/" replace />; return user.mustChangePassword ? <Outlet /> : <Navigate to={`/${user.role.toLowerCase()}`} replace /> }
