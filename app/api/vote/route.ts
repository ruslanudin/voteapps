import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { castVote } from '@/lib/supabase/repository'
import { VOTER_COOKIE, signVoterToken, voterCookieOptions } from '@/lib/voter-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const studentId = String(body?.studentId ?? '').trim()
    const candidateNumber = String(body?.candidateNumber ?? '').trim()
    // Token undangan divalidasi ulang di server, bukan hanya saat verifikasi.
    const token = String(body?.token ?? '').trim()
    if (!studentId || !candidateNumber || !token) {
      return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 })
    }
    const result = await castVote(studentId, candidateNumber, token)
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 })
    }
    // Setelah memilih, pemilih langsung berhak membuka halaman realcount.
    const cookieStore = await cookies()
    cookieStore.set({
      name: VOTER_COOKIE,
      value: signVoterToken(studentId),
      ...voterCookieOptions,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/vote', error)
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
