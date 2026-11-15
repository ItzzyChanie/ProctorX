export type Policy = { mode: 'BLACKLIST' | 'WHITELIST'; list: string[] }

export const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\.exe$/u, '').replace(/\.app$/u, '')

// OS shell / helper processes that own visible windows but are not
// third-party applications. Matched as substrings of the process name.
const SHELL_ALLOW_LIST = [
  'proctorx',
  'electron',
  // macOS
  'finder',
  'dock',
  'windowserver',
  'systemuiserver',
  'controlcenter',
  'notificationcenter',
  // Windows
  'explorer',
  'applicationframehost',
  'textinputhost',
  'shellexperiencehost',
  'startmenuexperiencehost',
  'searchhost',
  'searchapp',
  'lockapp',
  'systemsettings',
]

/** Accepts only a well-formed policy; anything else disables inspection. */
export function sanitizePolicy(value: unknown): Policy | null {
  const candidate = value as Partial<Policy> | null
  if (
    !candidate ||
    (candidate.mode !== 'BLACKLIST' && candidate.mode !== 'WHITELIST') ||
    !Array.isArray(candidate.list)
  )
    return null
  return {
    mode: candidate.mode,
    list: candidate.list.filter((entry): entry is string => typeof entry === 'string'),
  }
}

export function prohibitedApps(openApps: string[], activePolicy: Policy) {
  const configured = activePolicy.list.map(normalize).filter(Boolean)
  // '*' means "every application" (teacher's "block third-party apps").
  const wildcard = configured.includes('*')
  const entries = configured.filter((entry) => entry !== '*')
  return openApps.filter((openApp) => {
    if (SHELL_ALLOW_LIST.some((allowed) => openApp.includes(allowed))) return false
    const configuredMatch =
      wildcard ||
      entries.some((entry) => openApp.includes(entry) || entry.includes(openApp))
    return activePolicy.mode === 'BLACKLIST' ? configuredMatch : !configuredMatch
  })
}
