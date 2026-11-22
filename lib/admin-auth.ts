import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_TTL_MS = 1000 * 60 * 60 * 8 // 8 jam

function secret(): string {
  return process.env.ADMIN_SECRET ?? ''
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? ''
  const expectedPass = process.env.ADMIN_PASSWORD ?? ''
  return Boolean(expectedUser) && username === expectedUser && password === expectedPass
}

export function signAdminToken(): string {
  const expires = Date.now() + TOKEN_TTL_MS
  const payload = String(expires)
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, sig] = parts
  const expires = Number(payload)
  if (!Number.isFinite(expires) || expires < Date.now()) return false

  const expected = createHmac('sha256', secret()).update(payload).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
