import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getResults, getVoterStatus } from '@/lib/supabase/repository'
import { VOTER_COOKIE, verifyVoterToken } from '@/lib/voter-auth'

export const dynamic = 'force-dynamic'

// Aturan akses realcount:
// - Pemilihan masih berlangsung (draft/active): hanya pemilih yang sudah
//   memilih. Akses dibuka lewat /api/results/access atau otomatis setelah
//   /api/vote berhasil, agar pilihan pemilih lain tidak memengaruhi suara.
// - Pemilihan sudah ditutup (closed): hasil final terbuka untuk siapa saja,
//   tanpa cookie maupun nomor identitas.
const LOCKED_MESSAGE = 'Hasil hanya bisa dilihat setelah pemilihan ditutup atau oleh pemilih yang sudah memilih.'

export async function GET(request: Request) {
  try {
    const data = await getResults()

    if (data.settings.status !== 'closed') {
      const cookieStore = await cookies()
      const voterId = verifyVoterToken(cookieStore.get(VOTER_COOKIE)?.value)
      if (!voterId) {
        return NextResponse.json({ error: LOCKED_MESSAGE, reason: 'locked' }, { status: 403 })
      }

      const status = await getVoterStatus(voterId)
      if (!status.found || !status.hasVoted) {
        return NextResponse.json({ error: LOCKED_MESSAGE, reason: 'locked' }, { status: 403 })
      }
    }

    // Foto calon hanya dikirim sekali (saat halaman pertama kali dibuka) agar
    // polling 3 detik tidak terus mengunduh data gambar berukuran besar.
    const withPhotos = new URL(request.url).searchParams.get('photos') === '1'

    if (!withPhotos) {
      data.tally.rows = data.tally.rows.map((row) => ({
        ...row,
        candidate: { ...row.candidate, photo: undefined, vicePhoto: undefined },
      }))
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/results', error)
    return NextResponse.json({ error: 'Gagal memuat hasil.' }, { status: 500 })
  }
}
