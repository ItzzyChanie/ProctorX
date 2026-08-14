/** For two-word names, use first initial + last initial; for three or more, first + first middle + last. */
export function generateDefaultPassword(fullName: string, year = new Date().getFullYear()): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) throw new Error('full_name must contain at least a first and last name')
  const first = parts[0]!, middle = parts[1]!, last = parts.at(-1)!
  const initials = parts.length === 2 ? `${first[0]!}${last[0]!}` : `${first[0]!}${middle[0]!}${last[0]!}`
  return `${initials[0]!.toUpperCase()}${initials.slice(1).toLowerCase()}@${year}`
}
