import { create } from 'zustand'
import type { User } from '@proctorx/shared-types'

type AuthStore = {
  isSessionLoading: boolean
  isAuthenticated: boolean
  user: User | null
  setAuth: (user: User) => void
  finishSessionCheck: () => void
  updateUser: (user: User) => void
  signOut: () => void
}

export const useAuthStore = create<AuthStore>()(
  (set) => ({
      isSessionLoading: true,
      isAuthenticated: false,
      user: null,
      setAuth: (user) => set({ isAuthenticated: true, user }),
      finishSessionCheck: () => set({ isSessionLoading: false }),
      updateUser: (user) => set({ user }),
      signOut: () => set({ isAuthenticated: false, user: null }),
    }),
)
