import { NextResponse } from 'next/server'
import { verifyVoter } from '@/lib/supabase/repository'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const studentId = String(body?.studentId ?? '').trim()
    if (!studentId) {
      return NextResponse.json({ ok: false, reason: 'empty' }, { status: 400 })
    }
    const result = await verifyVoter(studentId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/verify', error)
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
