import { NextResponse } from 'next/server'
import { getPublicElection } from '@/lib/supabase/repository'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await getPublicElection()
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/election', error)
    return NextResponse.json({ error: 'Gagal memuat data pemilihan.' }, { status: 500 })
  }
}
