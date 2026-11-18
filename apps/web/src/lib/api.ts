import axios from 'axios'

const defaultApiUrl = `${window.location.protocol}//${window.location.hostname}:4000`
const apiBaseUrl: string = import.meta.env.VITE_API_URL ?? defaultApiUrl

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
})

/**
 * Resolves an image value from the API for use in <img src>. Profile pictures
 * are stored server-side and returned as "avatars/<file>"; data:/blob: URLs
 * (fresh uploads in a form) and absolute URLs are used as-is.
 */
export function assetSrc(value?: string | null): string | undefined {
  if (!value) return undefined
  if (/^(data:|blob:|https?:)/i.test(value)) return value
  return `${apiBaseUrl.replace(/\/+$/, '')}/${value.replace(/^\/+/, '')}`
}
