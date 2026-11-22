import { NextResponse } from 'next/server'
import { signAdminToken, verifyAdminCredentials } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const username = String(body?.username ?? '')
    const password = String(body?.password ?? '')

    if (!verifyAdminCredentials(username, password)) {
      return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 })
    }

    return NextResponse.json({ token: signAdminToken() })
  } catch (error) {
    console.error('POST /api/admin/login', error)
    return NextResponse.json({ error: 'Terjadi kesalahan.' }, { status: 500 })
  }
}
