import { createHmac, timingSafeEqual } from 'node:crypto'

// Cookie penanda bahwa pemilih sudah menggunakan hak suara. Dipakai untuk
// membuka halaman realcount (/hasil) hanya bagi pemilih yang sudah memilih.
export const VOTER_COOKIE = 'suarakita-voter'

// Sesi berlaku 12 jam agar pemilih tidak perlu memverifikasi ulang saat jam
// pemilihan berlangsung, tetapi tetap kedaluwarsa setelahnya.
export const VOTER_SESSION_TTL_SECONDS = 60 * 60 * 12

function secret(): string {
  // VOTER_SECRET opsional; bila kosong memakai ADMIN_SECRET yang sudah ada
  // sehingga tidak ada konfigurasi tambahan yang wajib diisi.
  return process.env.VOTER_SECRET ?? process.env.ADMIN_SECRET ?? ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function signVoterToken(voterId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: voterId, exp: Date.now() + VOTER_SESSION_TTL_SECONDS * 1000 }),
  ).toString('base64url')
  return `v1.${payload}.${sign(payload)}`
}

export function verifyVoterToken(token: string | null | undefined): string | null {
  if (!token) return null
  const [version, payload, signature] = token.split('.')
  if (version !== 'v1' || !payload || !signature) return null

  const expected = sign(payload)
  const given = Buffer.from(signature)
  const target = Buffer.from(expected)
  if (given.length !== target.length || !timingSafeEqual(given, target)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof data.sub !== 'string' || !data.sub) return null
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return data.sub
  } catch {
    return null
  }
}

export const voterCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: VOTER_SESSION_TTL_SECONDS,
}
