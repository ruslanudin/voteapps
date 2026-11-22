'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, LockKeyhole, Mail, Printer, ShieldCheck } from 'lucide-react'
import { ElectionData, ElectionSettings, ReportSettings, defaultReportSettings } from '@/lib/election'

type ViewState = 'loading' | 'ready' | 'unauthorized' | 'error'

function parseDate(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatClock(value: string): string {
  const date = parseDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
}

// Hari dan waktu pemungutan suara diambil dari jadwal event, sehingga undangan
// selalu mengikuti tanggal yang diatur panitia di tab Event.
function electionDay(settings: ElectionSettings): { date: string; time: string } {
  const start = parseDate(settings.startDate)
  const end = parseDate(settings.endDate)
  const day = end ?? start
  const date = day
    ? day.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '....................'

  let time = '....................'
  if (start && end) time = `${formatClock(settings.startDate)}–${formatClock(settings.endDate)} WIB`
  else if (end) time = `${formatClock(settings.endDate)} WIB`

  return { date, time }
}

export default function AdminSuratUndanganPage() {
  const [state, setState] = useState<ViewState>('loading')
  const [data, setData] = useState<ElectionData | null>(null)
  const [className, setClassName] = useState('')
  const [studentKey, setStudentKey] = useState('')

  useEffect(() => {
    const token = window.sessionStorage.getItem('suarakita-admin')
    if (!token) {
      setState('unauthorized')
      return
    }

    let active = true
    fetch('/api/admin/election', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((response) => {
        if (response.status === 401) {
          window.sessionStorage.removeItem('suarakita-admin')
          throw new Error('unauthorized')
        }
        if (!response.ok) throw new Error('failed')
        return response.json() as Promise<ElectionData>
      })
      .then((json) => {
        if (!active) return
        setData(json)
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
    const slug = `Surat-Undangan-${data.settings.eventTitle || data.settings.schoolName}`
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    document.title = slug || 'Surat-Undangan'
    return () => {
      document.title = previous
    }
  }, [data])

  // Daftar kelas diambil dari data pemilih; kelas kosong tampil "Tanpa kelas".
  const classes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.voters.map((voter) => voter.className.trim() || 'Tanpa kelas'))].sort(
      (a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }),
    )
  }, [data])

  const classVoters = useMemo(() => {
    if (!data) return []
    const filtered = className
      ? data.voters.filter((voter) => (voter.className.trim() || 'Tanpa kelas') === className)
      : data.voters
    return [...filtered].sort((a, b) => {
      const byClass = (a.className || '').localeCompare(b.className || '', 'id', {
        numeric: true,
        sensitivity: 'base',
      })
      if (byClass !== 0) return byClass
      return (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
    })
  }, [data, className])

  if (state !== 'ready' || !data) {
    return (
      <main className="inv-shell">
        <section className="report-sheet report-locked">
          <div className="report-lock-icon">
            {state === 'unauthorized' ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}
          </div>
          {state === 'unauthorized' ? (
            <>
              <h1>Surat undangan khusus admin</h1>
              <p>Halaman cetak surat undangan hanya dapat dibuka dari dashboard admin yang sudah masuk.</p>
              <div className="report-lock-actions">
                <a className="admin-primary compact" href="/admin">Masuk dashboard admin</a>
                <a className="report-back" href="/">Kembali ke pemilihan</a>
              </div>
            </>
          ) : state === 'error' ? (
            <>
              <h1>Surat undangan tidak dapat dimuat</h1>
              <p>Daftar pemilih gagal diambil dari server. Muat ulang halaman ini beberapa saat lagi.</p>
              <div className="report-lock-actions">
                <a className="admin-primary compact" href="/admin/surat-undangan">Muat ulang</a>
                <a className="report-back" href="/admin">Kembali ke dashboard</a>
              </div>
            </>
          ) : (
            <>
              <h1>Memuat surat undangan…</h1>
              <p>Menyiapkan data pemilih dan token undangan.</p>
            </>
          )}
        </section>
      </main>
    )
  }

  const { settings, voters } = data
  const report: ReportSettings = data.report ?? defaultReportSettings
  const day = electionDay(settings)
  const selectedStudent = classVoters.find((voter) => voter.id === studentKey)
  const cards = selectedStudent ? [selectedStudent] : classVoters

  return (
    <main className="inv-shell">
      <div className="inv-toolbar no-print">
        <a className="report-back" href="/admin"><ArrowLeft size={15} /> Kembali ke dashboard</a>
        <div className="inv-controls">
          <label className="inv-control">
            KELAS
            <select
              value={className}
              onChange={(event) => {
                setClassName(event.target.value)
                setStudentKey('')
              }}
            >
              <option value="">Semua kelas ({voters.length} siswa)</option>
              {classes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="inv-control">
            SISWA
            <select value={studentKey} onChange={(event) => setStudentKey(event.target.value)}>
              <option value="">Semua siswa ({classVoters.length})</option>
              {classVoters.map((voter) => (
                <option key={voter.id} value={voter.id}>
                  {voter.name || voter.id} — {voter.id}
                </option>
              ))}
            </select>
          </label>
          <span className="report-hint">{cards.length} undangan siap dicetak.</span>
          <button className="admin-primary compact" onClick={() => window.print()} disabled={!cards.length}>
            <Printer size={15} /> Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <section className="report-sheet report-locked">
          <div className="report-lock-icon"><Mail size={26} /></div>
          <h1>Belum ada pemilih</h1>
          <p>Tambahkan atau impor daftar pemilih di tab Pemilih, lalu simpan sebelum mencetak surat undangan.</p>
          <div className="report-lock-actions">
            <a className="admin-primary compact" href="/admin">Buka dashboard admin</a>
          </div>
        </section>
      ) : (
        <div className={`inv-grid ${cards.length === 1 ? 'is-single' : ''}`}>
          {cards.map((voter) => (
            <article className="inv-card" key={voter.id}>
              <header className="inv-kop">
                {report.logo ? (
                  <img className="inv-logo" src={report.logo} alt={`Logo ${settings.schoolName}`} />
                ) : (
                  <span className="inv-seal"><Mail size={16} /></span>
                )}
                <div className="inv-kop-text">
                  <strong>{settings.schoolName}</strong>
                  <span>{settings.eventTitle}</span>
                  <small>PANITIA PEMUNGUTAN SUARA</small>
                </div>
              </header>

              <h2 className="inv-title">Surat Undangan Pemilihan</h2>
              <p className="inv-lead">
                Dengan hormat, kami mengundang <strong>{voter.name || '-'}</strong> untuk hadir dan
                menggunakan hak suara pada pemilihan yang diselenggarakan oleh {settings.schoolName}.
              </p>

              <table className="inv-table">
                <tbody>
                  <tr><th>Nama</th><td>{voter.name || '-'}</td></tr>
                  <tr><th>Kelas</th><td>{voter.className || '-'}</td></tr>
                  <tr><th>NISN/NIS</th><td className="inv-mono">{voter.id || '-'}</td></tr>
                  <tr><th>Token</th><td className="inv-token">{voter.token || '(belum dibuat)'}</td></tr>
                  <tr><th>Hari/Tanggal</th><td>{day.date}</td></tr>
                  <tr><th>Waktu</th><td>{day.time}</td></tr>
                  <tr><th>Tempat</th><td>{settings.schoolName}</td></tr>
                </tbody>
              </table>

              <p className="inv-note">
                Tunjukkan undangan ini kepada panitia. Di halaman pemilihan, masukkan <strong>NISN/NIS</strong>{' '}
                dan <strong>token</strong> di atas untuk membuka surat suara. Token bersifat rahasia — jangan
                dibagikan kepada orang lain.
              </p>

              <footer className="inv-sign">
                <span>Ketua Panitia Pemungutan Suara</span>
                <div className="inv-sign-space" />
                <strong>{report.chair || '....................'}</strong>
                <small>NIP. {report.chairNip || '....................'}</small>
              </footer>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}

