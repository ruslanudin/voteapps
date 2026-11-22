import { NextResponse } from 'next/server'
import { verifyVoter } from '@/lib/supabase/repository'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const studentId = String(body?.studentId ?? '').trim()
    // Token dari surat undangan wajib dikirim bersama NISN/NIS.
    const token = String(body?.token ?? '').trim()
    if (!studentId || !token) {
      return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 })
    }
    const result = await verifyVoter(studentId, token)
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/verify', error)
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
