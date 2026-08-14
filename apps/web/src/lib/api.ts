import axios from 'axios'
import { useAuthStore } from '../store/authStore'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  withCredentials: true,
})

api.interceptors.request.use((config) => { const token = useAuthStore.getState().token; if (token) config.headers.Authorization = `Bearer ${token}`; return config })
