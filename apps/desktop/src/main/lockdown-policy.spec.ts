import assert from 'node:assert/strict'
import test from 'node:test'
import { prohibitedApps, sanitizePolicy } from './lockdown-policy.ts'

const open = ['chrome', 'discord', 'explorer', 'proctorx', 'applicationframehost']

test('a missing or malformed policy disables inspection', () => {
  assert.equal(sanitizePolicy(undefined), null)
  assert.equal(sanitizePolicy({ mode: undefined, list: [] }), null)
  assert.equal(sanitizePolicy({ mode: 'BLACKLIST', list: 'chrome' }), null)
})

test("'*' in blacklist mode blocks every third-party app but not the OS shell", () => {
  const policy = sanitizePolicy({ mode: 'BLACKLIST', list: ['*'] })!
  assert.deepEqual(prohibitedApps(open, policy), ['chrome', 'discord'])
})

test('an empty blacklist blocks nothing', () => {
  const policy = sanitizePolicy({ mode: 'BLACKLIST', list: [] })!
  assert.deepEqual(prohibitedApps(open, policy), [])
})

test('a named blacklist blocks only the listed apps', () => {
  const policy = sanitizePolicy({ mode: 'BLACKLIST', list: ['Discord.exe'] })!
  assert.deepEqual(prohibitedApps(open, policy), ['discord'])
})

test('a whitelist blocks everything that is not listed', () => {
  const policy = sanitizePolicy({ mode: 'WHITELIST', list: ['chrome'] })!
  assert.deepEqual(prohibitedApps(open, policy), ['discord'])
})
