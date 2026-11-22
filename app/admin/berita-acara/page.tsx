'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, LockKeyhole, Printer, ShieldCheck } from 'lucide-react'
import { ElectionSettings, ReportSettings, TallySummary } from '@/lib/election'

type ReportData = {
  settings: ElectionSettings
  tally: TallySummary
  report: ReportSettings
}

type ViewState = 'loading' | 'ready' | 'unauthorized' | 'error'

function parseDate(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLongDate(value: string): string {
  const date = parseDate(value)
  if (!date) return value || '....................'
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatClock(value: string): string {
  const date = parseDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
}

// Nilai dari <input type="date"> berbentuk YYYY-MM-DD; tampilkan dalam bentuk panjang.
function formatReportDate(value: string): string {
  const text = value.trim()
  if (!text) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? formatLongDate(`${text}T00:00`) : text
}

function dotted(value: string, width = 26): string {
  const text = value.trim()
  return text || '.'.repeat(width)
}

export default function AdminBeritaAcaraPage() {
  const [state, setState] = useState<ViewState>('loading')
  const [data, setData] = useState<ReportData | null>(null)
  const [includeClasses, setIncludeClasses] = useState(false)
  const [printedAt, setPrintedAt] = useState('')

  useEffect(() => {
    setPrintedAt(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }))
  }, [])

  useEffect(() => {
    const token = window.sessionStorage.getItem('suarakita-admin')
    if (!token) {
      setState('unauthorized')
      return
    }

    let active = true
    fetch('/api/admin/report', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((response) => {
        if (response.status === 401) {
          window.sessionStorage.removeItem('suarakita-admin')
          throw new Error('unauthorized')
        }
        if (!response.ok) throw new Error('failed')
        return response.json() as Promise<ReportData>
      })
      .then((json) => {
        if (!active) return
        setData(json)
        setIncludeClasses(Boolean(json.report?.includeClasses))
        setState('ready')
      })
      .catch((error: Error) => {
        if (!active) return
        setState(error.message === 'unauthorized' ? 'unauthorized' : 'error')
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!data) return
    const previous = document.title
    const slug = `Berita-Acara-${data.settings.eventTitle || data.settings.schoolName}`
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    document.title = slug || 'Berita-Acara'
    return () => {
      document.title = previous
    }
  }, [data])

  if (state !== 'ready' || !data) {
    return (
      <main className="report-shell">
        <section className="report-sheet report-locked">
          <div className="report-lock-icon">
            {state === 'unauthorized' ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}
          </div>
          {state === 'unauthorized' ? (
            <>
              <h1>Berita acara khusus admin</h1>
              <p>Halaman cetak berita acara hanya dapat dibuka dari dashboard admin yang sudah masuk.</p>
              <div className="report-lock-actions">
                <a className="admin-primary compact" href="/admin">Masuk dashboard admin</a>
                <a className="report-back" href="/">Kembali ke pemilihan</a>
              </div>
            </>
          ) : state === 'error' ? (
            <>
              <h1>Berita acara tidak dapat dimuat</h1>
              <p>Data hasil pemilihan gagal diambil dari server. Muat ulang halaman ini beberapa saat lagi.</p>
              <div className="report-lock-actions">
                <a className="admin-primary compact" href="/admin/berita-acara">Muat ulang</a>
                <a className="report-back" href="/admin">Kembali ke dashboard</a>
              </div>
            </>
          ) : (
            <>
              <h1>Memuat berita acara…</h1>
              <p>Menyiapkan rekapitulasi hasil pemungutan suara.</p>
            </>
          )}
        </section>
      </main>
    )
  }

  const { settings, tally, report } = data
  const isClosed = settings.status === 'closed'
  const statusText =
    settings.status === 'closed' ? 'Ditutup' : settings.status === 'active' ? 'Berlangsung' : 'Draft'

  if (!isClosed) {
    return (
      <main className="report-shell">
        <section className="report-sheet report-locked">
          <div className="report-lock-icon"><ShieldCheck size={26} /></div>
          <h1>Berita acara belum tersedia</h1>
          <p>Berita acara rekapitulasi dan berkas PDF baru dapat dibuat setelah panitia menutup pemilihan.</p>
          <p className="report-lock-note">
            Status pemilihan saat ini: <strong>{statusText}</strong>. Buka <a href="/admin">dashboard admin</a> → tab Event → ubah STATUS menjadi “Ditutup”, lalu simpan.
          </p>
          <div className="report-lock-actions">
            <a className="admin-primary compact" href="/admin">Buka dashboard admin</a>
          </div>
        </section>
      </main>
    )
  }

  const orderedRows = [...tally.rows].sort((a, b) =>
    a.candidate.number.localeCompare(b.candidate.number, undefined, { numeric: true }),
  )
  const participation = tally.participationByClass ?? []
  const maxVotes = tally.rows.reduce((max, row) => Math.max(max, row.votes), 0)
  const topCount = tally.rows.filter((row) => row.votes === maxVotes).length
  const winner = maxVotes > 0 && topCount === 1 ? tally.rows.find((row) => row.votes === maxVotes) : undefined
  const dateText = formatReportDate(report.date) || formatLongDate(settings.endDate)
  const clockText = formatClock(settings.endDate)
  const showClassTable = includeClasses && participation.length > 0

  return (
    <main className="report-shell">
      <div className="report-toolbar no-print">
        <a className="report-back" href="/admin"><ArrowLeft size={15} /> Kembali ke dashboard</a>
        <div className="report-actions">
          <label className="report-toggle">
            <input
              type="checkbox"
              checked={includeClasses}
              onChange={(event) => setIncludeClasses(event.target.checked)}
            />
            Rincian per kelas
          </label>
          <span className="report-hint">Pada dialog cetak pilih “Simpan sebagai PDF”.</span>
          <button className="admin-primary compact" onClick={() => window.print()}>
            <Printer size={15} /> Cetak / Simpan PDF
          </button>
        </div>
      </div>

      <article className="report-sheet">
        <header className="report-kop">
          {report.logo ? (
            <img className="report-logo" src={report.logo} alt={`Logo ${settings.schoolName}`} />
          ) : (
            <div className="report-seal"><ShieldCheck size={26} /></div>
          )}
          <div className="report-kop-text">
            <h1>{settings.schoolName}</h1>
            <p>{settings.eventTitle}</p>
            <p>PANITIA PEMUNGUTAN SUARA</p>
          </div>
        </header>

        <h2 className="report-title">Berita Acara Rekapitulasi Hasil Pemungutan Suara</h2>
        <p className="report-number">Nomor: {dotted(report.number, 30)}</p>

        <p className="report-body">
          Pada hari ini, <strong>{dateText}</strong>{clockText ? ` pukul ${clockText}` : ''}, bertempat di {dotted(report.place, 24)}, Panitia Pemungutan Suara {settings.schoolName} telah melaksanakan rapat rekapitulasi hasil pemungutan suara dalam rangka <em>{settings.eventTitle}</em> dengan hasil sebagai berikut:
        </p>

        <table className="report-table">
          <thead>
            <tr>
              <th className="num">No</th>
              <th className="num">Nomor Paslon</th>
              <th>Nama Calon Ketua</th>
              <th>Nama Calon Wakil Ketua</th>
              <th className="num">Perolehan Suara</th>
              <th className="num">Persentase</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row, index) => (
              <tr key={row.candidate.number}>
                <td className="num">{index + 1}</td>
                <td className="num">{row.candidate.number}</td>
                <td>{row.candidate.president || '-'}</td>
                <td>{row.candidate.vice || '-'}</td>
                <td className="num">{row.votes}</td>
                <td className="num">{row.percent}%</td>
              </tr>
            ))}
            {orderedRows.length === 0 && (
              <tr>
                <td className="num" colSpan={6}>Belum ada pasangan calon yang terdaftar.</td>
              </tr>
            )}
            {orderedRows.length > 0 && (
              <tr className="report-table-total">
                <td className="num" colSpan={4}>Jumlah suara sah</td>
                <td className="num">{tally.totalVotes}</td>
                <td className="num">{tally.totalVotes > 0 ? '100%' : '0%'}</td>
              </tr>
            )}
          </tbody>
        </table>

        {winner && (
          <p className="report-body report-lead">
            Perolehan suara terbanyak diraih oleh Pasangan Calon Nomor {winner.candidate.number} ({winner.candidate.president} &amp; {winner.candidate.vice}) dengan {winner.votes} suara atau {winner.percent}% dari total suara sah.
          </p>
        )}


        <dl className="report-facts">
          <dt>Jumlah pemilih terdaftar</dt><dd>{tally.voterCount} orang</dd>
          <dt>Pemilih yang menggunakan hak suara</dt><dd>{tally.votedCount} orang</dd>
          <dt>Surat suara sah</dt><dd>{tally.totalVotes} suara</dd>
          <dt>Surat suara tidak sah</dt><dd>0 suara</dd>
          <dt>Tingkat partisipasi pemilih</dt><dd>{tally.turnout}%</dd>
        </dl>

        {showClassTable && (
          <>
            <h3 className="report-subhead">Rekapitulasi partisipasi pemilih per kelas</h3>
            <table className="report-table report-table-compact">
              <thead>
                <tr>
                  <th className="num">No</th>
                  <th>Kelas</th>
                  <th className="num">Pemilih Terdaftar</th>
                  <th className="num">Menggunakan Hak Suara</th>
                  <th className="num">Partisipasi</th>
                </tr>
              </thead>
              <tbody>
                {participation.map((row, index) => (
                  <tr key={row.className}>
                    <td className="num">{index + 1}</td>
                    <td>{row.className}</td>
                    <td className="num">{row.voterCount}</td>
                    <td className="num">{row.votedCount}</td>
                    <td className="num">{row.turnout}%</td>
                  </tr>
                ))}
                <tr className="report-table-total">
                  <td className="num" colSpan={2}>Jumlah</td>
                  <td className="num">{tally.voterCount}</td>
                  <td className="num">{tally.votedCount}</td>
                  <td className="num">{tally.turnout}%</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <p className="report-body">
          Demikian Berita Acara Rekapitulasi Hasil Pemungutan Suara ini dibuat dengan sebenarnya dan penuh tanggung jawab untuk dipergunakan sebagaimana mestinya.{' '}
          {showClassTable
            ? 'Rekapitulasi partisipasi pemilih disajikan per kelas sebagaimana tabel di atas, sedangkan perolehan suara tidak diuraikan menurut kelas karena surat suara bersifat anonim sesuai asas kerahasiaan pemungutan suara.'
            : 'Rekapitulasi disajikan secara keseluruhan tanpa uraian per kelas, sedangkan perolehan suara bersifat anonim sesuai asas kerahasiaan pemungutan suara.'}
        </p>

        <p className="report-place">
          {report.place.trim() ? `${report.place.trim()}, ` : ''}{dateText}
        </p>

        <div className="report-sign">
          <div className="report-sign-block">
            <span className="report-sign-role">Panitia Pemungutan Suara</span>
            <strong>Ketua</strong>
            <div className="report-sign-space" />
            <span className="report-sign-name">{dotted(report.chair, 22)}</span>
            <span className="report-sign-nip">NIP. {dotted(report.chairNip, 18)}</span>
          </div>
          <div className="report-sign-block">
            <span className="report-sign-role">Panitia Pemungutan Suara</span>
            <strong>Sekretaris</strong>
            <div className="report-sign-space" />
            <span className="report-sign-name">{dotted(report.secretary, 22)}</span>
            <span className="report-sign-nip">NIP. {dotted(report.secretaryNip, 18)}</span>
          </div>
          <div className="report-sign-block">
            <span className="report-sign-role">Mengetahui,</span>
            <strong>Kepala Sekolah</strong>
            <div className="report-sign-space" />
            <span className="report-sign-name">{dotted(report.principal, 22)}</span>
            <span className="report-sign-nip">NIP. {dotted(report.principalNip, 18)}</span>
          </div>
        </div>

        <p className="report-footnote">
          {printedAt ? `Dicetak dari sistem SuaraKita pada ${printedAt}. ` : ''}Dokumen ini dinyatakan sah setelah ditandatangani oleh panitia pemungutan suara dan diketahui kepala sekolah. Sistem hanya mencatat surat suara sah karena setiap pilihan divalidasi terhadap nomor pasangan calon.
        </p>
      </article>
    </main>
  )
}

