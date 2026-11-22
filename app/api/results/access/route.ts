import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getVoterStatus } from '@/lib/supabase/repository'
import { VOTER_COOKIE, signVoterToken, voterCookieOptions } from '@/lib/voter-auth'

export const dynamic = 'force-dynamic'

// Membuka akses realcount untuk pemilih yang sudah menggunakan hak suara.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const studentId = String(body?.studentId ?? '').trim()
    if (!studentId) {
      return NextResponse.json({ ok: false, reason: 'empty' }, { status: 400 })
    }

    const status = await getVoterStatus(studentId)
    if (!status.found) {
      return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
    }
    if (!status.hasVoted) {
      return NextResponse.json({ ok: false, reason: 'not_voted' }, { status: 403 })
    }

    const cookieStore = await cookies()
    cookieStore.set({
      name: VOTER_COOKIE,
      value: signVoterToken(studentId),
      ...voterCookieOptions,
    })

    return NextResponse.json({ ok: true, name: status.name })
  } catch (error) {
    console.error('POST /api/results/access', error)
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
