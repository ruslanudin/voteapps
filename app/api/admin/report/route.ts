import { NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/admin-auth'
import { getReportData, saveReportSettings } from '@/lib/supabase/repository'
import type { ReportSettings } from '@/lib/election'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return verifyAdminToken(token)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Batas aman agar payload PDF (logo base64) tidak membengkak.
const MAX_LOGO_LENGTH = 4_000_000

// Berita acara hanya dapat dibuka admin (PDF tidak tersedia di halaman publik).
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await getReportData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/admin/report', error)
    return NextResponse.json({ error: 'Gagal memuat berita acara.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as Partial<ReportSettings>
    const report: ReportSettings = {
      logo: text(body.logo),
      number: text(body.number),
      place: text(body.place),
      date: text(body.date),
      chair: text(body.chair),
      chairNip: text(body.chairNip),
      secretary: text(body.secretary),
      secretaryNip: text(body.secretaryNip),
      principal: text(body.principal),
      principalNip: text(body.principalNip),
      includeClasses: body.includeClasses === true,
    }

    if (report.logo.length > MAX_LOGO_LENGTH) {
      return NextResponse.json({ error: 'Ukuran logo terlalu besar (maksimal 2 MB).' }, { status: 413 })
    }

    const { persisted } = await saveReportSettings(report)
    return NextResponse.json({ ok: true, persisted })
  } catch (error) {
    console.error('PUT /api/admin/report', error)
    return NextResponse.json({ error: 'Gagal menyimpan data berita acara.' }, { status: 500 })
  }
}
