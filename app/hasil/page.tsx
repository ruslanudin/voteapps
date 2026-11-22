'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronRight, Gauge, LockKeyhole, Vote } from 'lucide-react'
import { Candidate, ElectionSettings, TallySummary, defaultElectionSettings } from '@/lib/election'

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

function parseDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateId(date: Date): string {
  return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`
}

function formatTimeId(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')} WIB`
}

// Inisial nama dipakai bila panitia belum mengunggah foto calon.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function HasilPage() {
  const [data, setData] = useState<{ settings: ElectionSettings; tally: TallySummary }>({
    settings: defaultElectionSettings,
    tally: { rows: [], totalVotes: 0, votedCount: 0, voterCount: 0, turnout: 0, participationByClass: [] },
  })
  // Waktu acuan hanya diisi di sisi klien agar tidak memicu hydration mismatch.
  const [now, setNow] = useState<Date | null>(null)
  // Selama pemilihan berlangsung hasil hanya terbuka untuk pemilih yang sudah
  // memilih; saat status ditutup API mengirim hasil final ke siapa saja.
  const [access, setAccess] = useState<'checking' | 'locked' | 'ready'>('checking')
  const [identity, setIdentity] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [lockMessage, setLockMessage] = useState('')
  const [themeName, setThemeName] = useState<ElectionSettings['theme']>(defaultElectionSettings.theme)
  // Foto calon diambil sekali saja; polling 3 detik berikutnya berjalan tanpa foto.
  const [photos, setPhotos] = useState<Record<string, { photo?: string; vicePhoto?: string }>>({})
  const photosLoaded = useRef(false)
  // Status "closed" membuat hasil final terbuka untuk umum, jadi polling tidak
  // perlu secepat saat suara masih berjalan.
  const pollDelay = data.settings.status === 'closed' ? 15000 : 3000

  async function load() {
    try {
      const withPhotos = !photosLoaded.current
      const response = await fetch(`/api/results${withPhotos ? '?photos=1' : ''}`)
      if (response.status === 403) {
        setAccess('locked')
        return
      }
      if (!response.ok) throw new Error('Gagal memuat hasil.')
      const json = await response.json()
      if (!json?.settings || !json?.tally) return
      setData(json)
      setThemeName(json.settings.theme)
      setAccess('ready')
      setNow(new Date())
      if (withPhotos) {
        photosLoaded.current = true
        const next: Record<string, { photo?: string; vicePhoto?: string }> = {}
        for (const row of json.tally.rows as { candidate: Candidate }[]) {
          next[row.candidate.number] = { photo: row.candidate.photo, vicePhoto: row.candidate.vicePhoto }
        }
        setPhotos(next)
      }
    } catch {
      // Tampilan terakhir dibiarkan tetap tampil bila hanya gangguan jaringan.
      setAccess((current) => (current === 'ready' ? current : 'locked'))
    }
  }

  useEffect(() => {
    load()
    // Saat hasil sudah final, polling diperlambat: hasil tidak berubah lagi dan
    // halaman hasil sering dibuka bersamaan di banyak perangkat.
    const interval = window.setInterval(load, pollDelay)
    return () => window.clearInterval(interval)
  }, [pollDelay])

  // Saat hasil masih terkunci, data publik pemilihan dipakai agar nama sekolah,
  // judul acara, dan tema warna tetap sesuai pengaturan admin.
  useEffect(() => {
    fetch('/api/election')
      .then((response) => response.json())
      .then((json) => {
        if (!json?.settings) return
        setThemeName(json.settings.theme)
        setData((current) => ({ ...current, settings: json.settings }))
      })
      .catch(() => {})
  }, [])

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = identity.trim()
    if (!value) {
      setLockMessage('Masukkan nomor identitas terlebih dahulu.')
      return
    }
    setUnlocking(true)
    setLockMessage('')
    try {
      const response = await fetch('/api/results/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: value }),
      })
      const result = await response.json()
      if (result.ok) {
        setIdentity('')
        setAccess('checking')
        await load()
        return
      }
      setLockMessage(
        result.reason === 'not_voted'
          ? 'Nomor ini belum tercatat memilih. Selesaikan pemilihan dulu, lalu buka kembali halaman ini.'
          : result.reason === 'not_found'
            ? 'Nomor identitas tidak ditemukan dalam daftar pemilih.'
            : result.reason === 'empty'
              ? 'Masukkan nomor identitas terlebih dahulu.'
              : 'Gagal membuka hasil. Coba lagi.',
      )
    } catch {
      setLockMessage('Gagal membuka hasil. Periksa koneksi lalu coba lagi.')
    } finally {
      setUnlocking(false)
    }
  }

  useEffect(() => {
    const themes = {
      violet: { primary: '#7054e8', accent: '#d2f277', background: '#241d3c' },
      emerald: { primary: '#168664', accent: '#a7e8d1', background: '#123c30' },
      sunset: { primary: '#ed7758', accent: '#ffd166', background: '#5a2b2b' },
      ocean: { primary: '#2683a9', accent: '#77d6dc', background: '#123848' },
      midnight: { primary: '#8b6fcb', accent: '#c4b5fd', background: '#17132b' },
    }
    const theme = themes[themeName] || themes.violet
    document.documentElement.style.setProperty('--app-primary', theme.primary)
    document.documentElement.style.setProperty('--app-accent', theme.accent)
    document.documentElement.style.setProperty('--app-background', theme.background)
  }, [themeName])

  const { settings, tally } = data
  const isFinal = settings.status === 'closed'
  const leader = tally.rows[0]
  const topVotes = leader?.votes ?? 0
  const hasClearLeader = topVotes > 0 && (!tally.rows[1] || tally.rows[1].votes < topVotes)
  const leaderNumber = hasClearLeader ? leader?.candidate.number : undefined
  const maxPercent = tally.rows.reduce((max, row) => Math.max(max, row.percent), 0)
  // Tinggi bar proporsional terhadap perolehan tertinggi (maks 78% tinggi track agar ada ruang angka), minimal 4%.
  const barHeight = (percent: number) => (maxPercent > 0 ? Math.max((percent / maxPercent) * 78, 4) : 4)
  const noVotesYet = tally.totalVotes === 0
  const stamp = (isFinal ? parseDate(settings.endDate) : null) ?? now
  const statusLabel =
    settings.status === 'closed'
      ? 'PEMILIHAN DITUTUP'
      : settings.status === 'draft'
        ? 'DRAFT · BELUM DIMULAI'
        : 'SEDANG BERLANGSUNG'

  return (
    <main className="election-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Suara Kita beranda"><span className="brand-mark"><Vote size={19} /></span><span>suara<span className="brand-light">kita</span><small>PEMILIHAN OSIS</small></span></a>
        <nav className="top-nav" aria-label="Navigasi utama"><a href="/">Pemilihan</a><a className="active" href="/hasil">Hasil</a><a href="/admin">Admin</a></nav>
        <div className="school-chip"><span className="school-dot" />{settings.schoolName.toUpperCase()} <ChevronRight size={14} /></div>
      </header>

      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="live-pulse" />{settings.eventTitle}</div><h1>Realcount<br /><em>{isFinal ? 'hasil final.' : 'suara sementara.'}</em></h1><p>{isFinal ? 'Pemilihan telah ditutup. Berikut hasil akhir perolehan suara.' : 'Perolehan suara diperbarui otomatis setiap ada suara masuk.'}</p><div className="hero-meta"><span><Vote size={15} /> {isFinal ? 'Hasil final' : 'Suara tercatat'}</span><span><LockKeyhole size={15} /> {isFinal ? 'Ditetapkan panitia' : 'Hasil resmi setelah ditutup'}</span></div></div>
        <aside className="results-status-card"><div className="countdown-label"><Gauge size={15} /> STATUS PEMILIHAN</div><div className="results-status-value">{statusLabel}</div><div className="countdown-foot"><span>{isFinal ? 'Hasil final' : 'Diperbarui otomatis'}</span><span>{settings.schoolName}</span></div></aside>
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
      </section>

      {access === 'ready' && (
        <section className="realcount-spotlight">
        <div className="rk-board">
          <div className="rk-head">
            <div>
              <h2 className="rk-title">
                Real count
                <span>{settings.eventTitle}</span>
              </h2>
              <p className="rk-meta">
                *Per {stamp ? `${formatDateId(stamp)} (Pukul ${formatTimeId(stamp)})` : '—'}
              </p>
            </div>
            <span className={`rk-badge ${isFinal ? 'final' : 'live'}`}>
              <span className="rk-badge-dot" />
              {isFinal ? 'HASIL FINAL' : 'LIVE · OTOMATIS'}
            </span>
          </div>

          {tally.rows.length > 0 ? (
            <>
              {noVotesYet && (
                <p className="rk-empty-note">Belum ada suara masuk. Grafik akan terisi otomatis saat suara mulai tercatat.</p>
              )}
              <div className={`rk-chart ${noVotesYet ? 'is-empty' : ''}`} role="img" aria-label={`Grafik perolehan suara dari ${tally.totalVotes} suara`}>
                {tally.rows.map((row) => {
                  const isLeader = row.candidate.number === leaderNumber
                  return (
                    <div className={`rk-col ${isLeader ? 'is-leader' : ''}`} key={row.candidate.number}>
                      <div className="rk-track">
                        <div className="rk-bar" style={{ height: `${noVotesYet ? 0 : barHeight(row.percent)}%` }}>
                          {!noVotesYet && <span className="rk-bar-num">{row.candidate.number}</span>}
                          <div className="rk-value">
                            <strong>{row.percent}%</strong>
                            <span>{row.votes} Total Suara</span>
                          </div>
                        </div>
                      </div>
                      <div className="rk-label">
                        <span className="rk-label-num">{row.candidate.number}</span>
                        <span className="rk-label-name">
                          {row.candidate.president}
                          <small>&amp; {row.candidate.vice}</small>
                        </span>
                      </div>
                      <div className="rk-figures">
                        <figure className="rk-figure">
                          <span className="rk-avatar">
                            {photos[row.candidate.number]?.photo ? (
                              <img
                                src={photos[row.candidate.number]?.photo}
                                alt={`Foto calon ketua paslon ${row.candidate.number}`}
                              />
                            ) : (
                              initialsOf(row.candidate.president)
                            )}
                          </span>
                          <figcaption>KETUA</figcaption>
                        </figure>
                        <figure className="rk-figure">
                          <span className="rk-avatar">
                            {photos[row.candidate.number]?.vicePhoto ? (
                              <img
                                src={photos[row.candidate.number]?.vicePhoto}
                                alt={`Foto calon wakil ketua paslon ${row.candidate.number}`}
                              />
                            ) : (
                              initialsOf(row.candidate.vice)
                            )}
                          </span>
                          <figcaption>WAKIL</figcaption>
                        </figure>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="rk-foot">
                <span><Vote size={13} /> {tally.totalVotes} suara masuk</span>
                <span><Gauge size={13} /> Partisipasi {tally.turnout}%</span>
                <span>{tally.votedCount} dari {tally.voterCount} pemilih</span>
              </div>
            </>
          ) : (
            <p className="rk-empty">Belum ada pasangan calon yang terdaftar.</p>
          )}
        </div>
        </section>
      )}

      {access !== 'ready' && (
        <section className="realcount-spotlight">
          <div className="rk-lock">
            <span className="rk-lock-icon"><LockKeyhole size={22} /></span>
            <span className="rk-lock-eyebrow">
              {access === 'checking' ? 'MEMERIKSA AKSES' : 'HASIL TERKUNCI'}
            </span>
            <h2>{access === 'checking' ? 'Memeriksa akses realcount…' : 'Buka hasil dengan identitas pemilih'}</h2>
            <p>
              Selama pemilihan masih berlangsung, perolehan suara hanya bisa dilihat oleh pemilih yang sudah
              menggunakan hak suara. Dengan begitu, pilihanmu tidak terpengaruh suara yang sudah masuk dari pemilih
              lain. Setelah panitia menutup pemilihan, hasil final terbuka untuk siapa saja tanpa perlu identitas.
            </p>
            {access === 'locked' && (
              <form className="rk-lock-form" onSubmit={unlock}>
                <input
                  value={identity}
                  onChange={(event) => setIdentity(event.target.value)}
                  placeholder="NISN / nomor identitas pemilih"
                  aria-label="Nomor identitas pemilih"
                  autoComplete="off"
                  required
                />
                <button type="submit" disabled={unlocking}>
                  {unlocking ? 'Memeriksa…' : <>Buka hasil <ArrowRight size={14} /></>}
                </button>
              </form>
            )}
            {lockMessage && <p className="rk-lock-note" role="status">{lockMessage}</p>}
            <a className="rk-lock-back" href="/">Belum memilih? Selesaikan pemilihan dulu</a>
          </div>
        </section>
      )}

      {access === 'ready' && (
        <>
          <section className="results-summary">
            <div className="summary-stat"><span>SUARA MASUK</span><strong>{tally.totalVotes}</strong><small>surat suara tercatat</small></div>
            <div className="summary-stat"><span>PARTISIPASI</span><strong>{tally.turnout}%</strong><small>{tally.votedCount} dari {tally.voterCount} pemilih</small></div>
            <div className="summary-stat"><span>PASANGAN CALON</span><strong>{tally.rows.length}</strong><small>berlaga dalam pemilihan</small></div>
          </section>

          <section className="results-note"><LockKeyhole size={15} /><p>{isFinal ? 'Pemilihan telah ditutup. Hasil final ini terbuka untuk umum dan ditetapkan oleh panitia. Berita acara resmi dicetak oleh panitia dari dashboard admin.' : 'Realcount ini bersifat sementara dan hanya untuk transparansi. Hasil resmi ditetapkan oleh panitia setelah pemilihan ditutup.'}</p><a className="results-back" href="/">Kembali ke pemilihan <ArrowRight size={13} /></a></section>
        </>
      )}

      <footer className="footer"><a className="brand footer-brand" href="/"><span className="brand-mark"><Vote size={17} /></span><span>suara<span className="brand-light">kita</span></span></a><span>Demokrasi dimulai dari suara kita.</span><span>© 2026 OSIS {settings.schoolName}</span></footer>
    </main>
  )
}
