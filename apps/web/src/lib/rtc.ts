import { api } from './api';

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let cached: { config: RTCConfiguration; expiresAt: number } | null = null;

/**
 * ICE servers (STUN + TURN) issued by the backend. TURN credentials are
 * short-lived, so the result is cached for a limited time only.
 */
export async function getRtcConfig(): Promise<RTCConfiguration> {
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  try {
    const { data } = await api.get<RTCConfiguration>('/sessions/rtc-config');
    const config = data?.iceServers?.length ? data : DEFAULT_RTC_CONFIG;
    cached = { config, expiresAt: Date.now() + 30 * 60_000 };
    return config;
  } catch {
    return DEFAULT_RTC_CONFIG;
  }
}
