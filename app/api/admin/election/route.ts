import { NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/admin-auth'
import {
  ElectionValidationError,
  getFullElection,
  resetElection,
  saveFullElection,
} from '@/lib/supabase/repository'
import type { ElectionData } from '@/lib/election'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return verifyAdminToken(token)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await getFullElection()
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/admin/election', error)
    return NextResponse.json({ error: 'Gagal memuat data.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = (await request.json()) as ElectionData
    await saveFullElection(data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ElectionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('PUT /api/admin/election', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menyimpan data.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await resetElection()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/admin/election', error)
    return NextResponse.json({ error: 'Gagal mereset pemilihan.' }, { status: 500 })
  }
}
