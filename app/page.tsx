'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, BarChart3, Check, ChevronRight, Clock3, Fingerprint, LockKeyhole, ShieldCheck, Users, Vote, X } from 'lucide-react'
import {
  Candidate,
  ElectionSettings,
  defaultCandidates,
  defaultElectionSettings,
  isVotingOpen,
  votingUnavailableMessage,
  votingUnavailableTitle,
} from '@/lib/election'

// Status pemilihan bisa berubah dari dashboard admin (mis. ditutup lebih awal),
// jadi halaman pemilih menyegarkan statusnya secara berkala.
const STATUS_POLL_INTERVAL = 30000

// Inisial nama dipakai sebagai pengganti foto bila panitia belum mengunggahnya.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Data publik pemilihan (termasuk status buka/tutup). Null bila jaringan
// bermasalah; server tetap menjadi penentu terakhir boleh/tidaknya memilih.
async function fetchElectionData(): Promise<{ settings: ElectionSettings; candidates: Candidate[] } | null> {
  try {
    const response = await fetch('/api/election')
    if (!response.ok) return null
    const data = await response.json()
    return data?.settings ? data : null
  } catch {
    return null
  }
}

export default function Page() {
  const [studentId, setStudentId] = useState('')
  const [idType, setIdType] = useState('NISN')
  const [verified, setVerified] = useState(false)
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [cast, setCast] = useState(false)
  const [message, setMessage] = useState('')
  const [election, setElection] = useState<{ settings: ElectionSettings; candidates: Candidate[] }>({
    settings: defaultElectionSettings,
    candidates: defaultCandidates,
  })

  // Menyegarkan data publik pemilihan tanpa menunggu halaman dimuat ulang.
  async function refreshElection() {
    const data = await fetchElectionData()
    if (data) setElection(data)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      const data = await fetchElectionData()
      if (active && data) setElection(data)
    }
    void load()
    // Panel pemilih ikut terkunci sendiri bila panitia menutup pemilihan saat
    // surat suara masih terbuka di perangkat siswa.
    const interval = window.setInterval(load, STATUS_POLL_INTERVAL)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const themes = {
      violet: { primary: '#7054e8', accent: '#d2f277', background: '#241d3c' },
      emerald: { primary: '#168664', accent: '#a7e8d1', background: '#123c30' },
      sunset: { primary: '#ed7758', accent: '#ffd166', background: '#5a2b2b' },
      ocean: { primary: '#2683a9', accent: '#77d6dc', background: '#123848' },
      midnight: { primary: '#8b6fcb', accent: '#c4b5fd', background: '#17132b' },
    }
    const theme = themes[election.settings.theme] || themes.violet
    document.documentElement.style.setProperty('--app-primary', theme.primary)
    document.documentElement.style.setProperty('--app-accent', theme.accent)
    document.documentElement.style.setProperty('--app-background', theme.background)
  }, [election.settings.theme])

  const candidates = election.candidates
  const status = election.settings.status
  // Surat suara hanya terbuka saat status "Berlangsung"; "Draft" dan "Ditutup"
  // sama-sama menolak pemilih, walau sudah terdaftar dan belum memilih.
  const votingOpen = isVotingOpen(status)
  const unavailableMessage = votingUnavailableMessage(status)

  async function verifyStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId.trim() }),
    })
    const result = await response.json()
    if (result.ok) {
      setVerified(true)
      setMessage(`Identitas ${result.name} siap untuk pemilihan.`)
    } else if (result.reason === 'not_open') {
      setVerified(false)
      setMessage(votingUnavailableMessage(result.status))
      void refreshElection()
    } else if (result.reason === 'already_voted') {
      setVerified(false)
      setMessage('Pemilih ini sudah menggunakan hak suaranya.')
    } else {
      setVerified(false)
      setMessage('Identitas tidak ditemukan dalam daftar pemilih.')
    }
  }

  async function submitVote() {
    if (!selected || !votingOpen) return
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId.trim(), candidateNumber: selected.number }),
    })
    const result = await response.json()
    if (result.ok) {
      setCast(true)
      setSelected(null)
      setMessage('Pilihan berhasil dicatat.')
    } else if (result.reason === 'not_open') {
      setVerified(false)
      setSelected(null)
      setMessage(votingUnavailableMessage(result.status))
      void refreshElection()
    } else if (result.reason === 'already_voted') {
      setVerified(false)
      setMessage('Pemilih ini sudah menggunakan hak suaranya.')
    } else {
      setMessage('Gagal mencatat suara. Coba lagi.')
    }
  }

  return (
    <main className="election-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Suara Kita beranda"><span className="brand-mark"><Vote size={19} /></span><span>suara<span className="brand-light">kita</span><small>PEMILIHAN OSIS</small></span></a>
        <nav className="top-nav" aria-label="Navigasi utama"><a className="active" href="#pemilihan">Pemilihan</a><a href="/hasil">Hasil</a><a href="#tentang">Tentang</a><a href="/admin">Admin</a></nav>
        <div className="school-chip"><span className="school-dot" />{election.settings.schoolName.toUpperCase()} <ChevronRight size={14} /></div>
      </header>

      <div className="prototype-note"><span className="note-dot" /><span><strong>Mode pratinjau</strong> — data siswa dan suara belum disimpan atau diverifikasi sungguhan.</span><a href="#keamanan">Pelajari batasan <ArrowRight size={13} /></a></div>

      <section className="hero" id="home">
        <div className="hero-copy"><div className="eyebrow"><span className="live-pulse" />{election.settings.eventTitle}</div><h1>Satu suara untuk<br /><em>masa depan kita.</em></h1><p>Pilih pasangan calon yang paling mewakili harapanmu. Suaramu adalah bagian dari perubahan.</p><div className="hero-meta"><span><Users size={15} /> Seluruh siswa</span><span><ShieldCheck size={15} /> Pilihan dirahasiakan</span></div></div>
        <aside className="countdown-card"><div className="countdown-label"><Clock3 size={15} /> {votingOpen ? 'PEMILIHAN DITUTUP DALAM' : status === 'closed' ? 'PEMILIHAN SUDAH DITUTUP' : 'PEMILIHAN BELUM DIBUKA'}</div>{votingOpen ? <div className="countdown"><div><strong>05</strong><small>HARI</small></div><span>:</span><div><strong>12</strong><small>JAM</small></div><span>:</span><div><strong>48</strong><small>MENIT</small></div></div> : <p className="countdown-note">{unavailableMessage}</p>}<div className="countdown-foot"><span className={`status-pill ${votingOpen ? '' : 'is-closed'}`}><span />{votingOpen ? 'SEDANG BERLANGSUNG' : status === 'closed' ? 'SUDAH DITUTUP' : 'BELUM DIBUKA'}</span><span>25 Nov 2026 · 15.00 WIB</span></div></aside>
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
      </section>

      <section className="content-grid" id="pemilihan">
        <div className="candidates-section"><div className="section-heading"><div><div className="eyebrow muted">KENALI PILIHANMU</div><h2>Pasangan calon</h2></div><span className="candidate-count">{candidates.length} PASLON</span></div>
          <div className="candidate-list">{candidates.map((candidate) => <article className={`candidate-card ${selected?.number === candidate.number ? 'is-selected' : ''}`} key={candidate.number}>
            <div className={`candidate-art ${candidate.color}`}><span className="candidate-number">{candidate.number}</span><div className="portrait-pair"><div className="portrait-cell"><div className="portrait portrait-a">{candidate.photo ? <img className="portrait-photo" src={candidate.photo} alt={`Foto calon ketua paslon ${candidate.number}`} /> : <span>{candidate.initials || initialsOf(candidate.president)}</span>}</div><span className="portrait-role">KETUA</span></div><div className="portrait-cell"><div className="portrait portrait-b">{candidate.vicePhoto ? <img className="portrait-photo" src={candidate.vicePhoto} alt={`Foto calon wakil ketua paslon ${candidate.number}`} /> : <span>{initialsOf(candidate.vice)}</span>}</div><span className="portrait-role">WAKIL</span></div></div><span className="portrait-caption">FOTO KETUA &amp; WAKIL KETUA</span></div>
            <div className="candidate-info"><div className="candidate-names"><div><span className="role-label">CALON KETUA</span><h3>{candidate.president}</h3></div><div><span className="role-label">CALON WAKIL KETUA</span><h3>{candidate.vice}</h3></div></div><div className="candidate-profile"><span className="vision-label">PROFIL</span><p>{candidate.profile}</p></div><div className="candidate-vision"><span className="vision-label">VISI</span><p>{candidate.vision}</p></div><div className="programs"><span className="vision-label">PROGRAM UNGGULAN</span><p>{candidate.program}</p></div><button className={`choose-button ${selected?.number === candidate.number ? 'chosen' : ''}`} onClick={() => { if (!votingOpen) { setMessage(unavailableMessage); return } setSelected(candidate); setMessage('') }} disabled={!verified || cast || !votingOpen} aria-pressed={selected?.number === candidate.number}>{selected?.number === candidate.number ? <><Check size={16} /> Terpilih</> : <>Pilih pasangan <ArrowRight size={16} /></>}</button></div>
          </article>)}</div>
        </div>

        <aside className="voting-panel"><div className="panel-heading"><span className="panel-icon"><Fingerprint size={18} /></span><div><h2>Hak pilihmu</h2><p>Verifikasi sebelum memilih</p></div></div>
          {cast ? <div className="success-state"><div className="success-icon"><Check size={24} /></div><h3>Terima kasih sudah memilih!</h3><p>Suaramu sudah tercatat dalam simulasi ini. Pilihanmu bersifat rahasia.</p><div className="receipt"><span><BadgeCheck size={16} /> STATUS</span><strong>SUDAH MEMILIH</strong></div><a className="success-results" href="/hasil">Lihat realcount <ArrowRight size={14} /></a></div> : !votingOpen ? <div className="vote-closed" role="status"><div className="vote-closed-icon"><LockKeyhole size={20} /></div><h3>{votingUnavailableTitle(status)}</h3><p>{unavailableMessage}</p><a className="vote-closed-link" href="/hasil">Lihat hasil <ArrowRight size={13} /></a></div> : verified ? <div className="verified-state"><div className="verified-banner"><BadgeCheck size={17} /><span>Identitas siap</span></div><div className="student-summary"><span className="summary-label">NOMOR IDENTITAS</span><strong>{studentId.replace(/.(?=.{3})/g, '•')}</strong><small>Pastikan pasangan pilihanmu sudah benar.</small></div><div className="vote-selection"><span className="summary-label">PILIHANMU</span>{selected ? <div className="selection-value"><span className="selection-number">{selected.number}</span><strong>{selected.president}<small> & {selected.vice}</small></strong></div> : <div className="selection-empty">Pilih salah satu pasangan calon</div>}</div><button className="submit-vote" onClick={submitVote} disabled={!selected}>Kirim suara <ArrowRight size={16} /></button><button className="change-student" onClick={() => { setVerified(false); setStudentId(''); setMessage('') }}>Ganti identitas</button></div> : <form className="verify-form" onSubmit={verifyStudent}><p className="form-intro">Masukkan identitas sekolah untuk membuka surat suara.</p><label htmlFor="id-number">JENIS IDENTITAS</label><div className="id-toggle" role="group" aria-label="Pilih jenis identitas"><button type="button" className={idType === 'NISN' ? 'selected' : ''} onClick={() => setIdType('NISN')}>NISN</button><button type="button" className={idType === 'NIS' ? 'selected' : ''} onClick={() => setIdType('NIS')}>NIS</button><button type="button" className={idType === 'Manual' ? 'selected' : ''} onClick={() => setIdType('Manual')}>Manual</button></div><label htmlFor="id-number">{idType === 'Manual' ? 'NAMA / KODE PEMILIH' : `NOMOR ${idType}`}</label><input id="id-number" value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder={idType === 'NISN' ? 'Masukkan 10 digit NISN' : idType === 'NIS' ? 'Masukkan nomor induk siswa' : 'Nama atau kode dari panitia'} required autoComplete="off" /><div className="privacy-hint"><LockKeyhole size={15} /><span>Identitas hanya dipakai memverifikasi hak pilih dan tidak ditampilkan ke publik.</span></div><button className="verify-button" type="submit">Lanjutkan <ArrowRight size={16} /></button>{message && <p className="form-message" role="status">{message}</p>}</form>}
          <div className="panel-footer"><LockKeyhole size={14} /><span>Realcount hanya untuk pemilih yang sudah memilih selama pemilihan berlangsung, dan terbuka untuk umum setelah pemilihan ditutup.</span></div>
        </aside>
      </section>

      <section className="closing-banner" id="keamanan"><div className="closing-symbol"><LockKeyhole size={19} /></div><div><h3>Hasil akhir diumumkan setelah pemilihan ditutup.</h3><p>Selama pemilihan berlangsung, realcount hanya untuk pemilih yang sudah memilih. Setelah ditutup, hasil final terbuka untuk siapa saja.</p></div><a className="results-hidden" href="/hasil"><BarChart3 size={13} /> LIHAT REALCOUNT</a></section>
      <footer className="footer" id="tentang"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Vote size={17} /></span><span>suara<span className="brand-light">kita</span></span></a><span>Demokrasi dimulai dari suara kita.</span><span>© 2026 OSIS {election.settings.schoolName}</span></footer>

      {selected && !cast && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" aria-label="Tutup" onClick={() => setSelected(null)}><X size={18} /></button><div className="dialog-icon"><Vote size={22} /></div><span className="eyebrow muted">KONFIRMASI PILIHAN</span><h2 id="dialog-title">Yakin memilih paslon {selected.number}?</h2><p>{selected.president} & {selected.vice}</p><div className="dialog-warning"><LockKeyhole size={16} /> Setelah dikirim, pilihan tidak dapat diubah.</div><div className="dialog-actions"><button className="cancel-button" onClick={() => setSelected(null)}>Kembali</button><button className="submit-vote" onClick={submitVote}>Ya, kirim suara <ArrowRight size={16} /></button></div></section></div>}
    </main>
  )
}
