import { create } from 'zustand'
import type { User } from '@proctorx/shared-types'

type AuthStore = {
  isAuthenticated: boolean
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  updateUser: (user: User) => void
  signOut: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  token: null,
  user: null,
  setAuth: (token, user) => set({ isAuthenticated: true, token, user }),
  updateUser: (user) => set({ user }),
  signOut: () => set({ isAuthenticated: false, token: null, user: null }),
}))
