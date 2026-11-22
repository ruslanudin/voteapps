'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, FileText, GraduationCap, LockKeyhole, LogOut, Palette, RotateCcw, Save, School, Trash2, Upload, UserPlus, Users, Vote } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Candidate, ElectionData, ElectionSettings, ReportSettings, Voter, defaultCandidates, defaultElectionSettings, defaultReportSettings, defaultVoters } from '@/lib/election'
import { importVotersFromWorkbook } from '@/lib/voter-import'

type AdminVoter = Voter & { statusDirty?: boolean }

// Validasi sisi klien supaya tombol simpan tidak pernah mengirim daftar yang
// akan ditolak database (mis. NIS ganda) setelah data lama terhapus.
function validateElection(value: ElectionData): string | null {
  if (!value.candidates.length) {
    return 'minimal harus ada satu pasangan calon.'
  }

  const numbers = new Set<string>()
  for (const [index, candidate] of value.candidates.entries()) {
    const number = String(candidate.number ?? '').trim()
    if (!number) return `nomor paslon ke-${index + 1} masih kosong.`
    if (numbers.has(number)) return `nomor paslon ${number} dipakai lebih dari satu paslon.`
    numbers.add(number)
  }

  const ids = new Set<string>()
  for (const [index, voter] of value.voters.entries()) {
    const id = String(voter.id ?? '').trim()
    if (!id) {
      return `NIS/NISN pemilih baris ke-${index + 1} masih kosong. Isi nomor identitas atau hapus barisnya.`
    }
    if (ids.has(id)) return `NIS/NISN ${id} dipakai lebih dari satu pemilih.`
    ids.add(id)
  }

  return null
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<'event' | 'school' | 'voters' | 'candidates' | 'theme' | 'report'>('event')
  const [data, setData] = useState<ElectionData>({
    settings: defaultElectionSettings,
    candidates: defaultCandidates,
    voters: defaultVoters,
  })
  const [notice, setNotice] = useState('')
  const [resetting, setResetting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reportDirty, setReportDirty] = useState(false)
  // Nomor identitas yang baru dibuat acak oleh impor (belum disimpan). Dipakai
  // untuk menyorot kolom NIS/NISN yang perlu diperiksa; sorotan hilang sendiri
  // begitu nilainya diedit.
  const [generatedIds, setGeneratedIds] = useState<Set<string>>(() => new Set())
  // Indeks pemilih yang dicentang untuk aksi massal (hapus/ubah kelas/status).
  const [selectedVoters, setSelectedVoters] = useState<Set<number>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  // Hanya satu permintaan muat awal yang boleh berjalan, dan respons yang
  // datang terlambat (mis. setelah admin menambah/mengimpor pemilih) tidak
  // boleh menimpa perubahan yang belum disimpan.
  const initialLoadRef = useRef(false)
  const loadSeqRef = useRef(0)

  // Muat data dari server. Dashboard tidak boleh menyimpan sebelum data
  // benar-benar termuat, agar data default/contoh tidak menimpa database.
  async function loadElection(token: string | null): Promise<boolean> {
    const seq = ++loadSeqRef.current
    try {
      const response = await fetch('/api/admin/election', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        logout()
        return false
      }
      // Respons usang: sudah ada permintaan yang lebih baru atau data sudah
      // diubah admin, jadi jangan timpa state lokal.
      if (seq !== loadSeqRef.current) return false
      if (!response.ok) {
        setLoaded(false)
        setNotice('Gagal memuat data pemilihan dari server. Muat ulang halaman sebelum menyimpan.')
        return false
      }
      const json = await response.json()
      if (seq !== loadSeqRef.current) return false
      if (!json?.settings || !Array.isArray(json.candidates) || !Array.isArray(json.voters)) {
        setLoaded(false)
        setNotice('Data pemilihan dari server tidak lengkap. Muat ulang halaman sebelum menyimpan.')
        return false
      }
      setData(json)
      setLoaded(true)
      return true
    } catch {
      setLoaded(false)
      setNotice('Gagal memuat data pemilihan dari server. Periksa koneksi lalu muat ulang halaman.')
      return false
    }
  }

  useEffect(() => {
    if (initialLoadRef.current) return
    initialLoadRef.current = true
    const token = window.sessionStorage.getItem('suarakita-admin')
    if (!token) return
    setLoggedIn(true)
    void loadElection(token)
  }, [])

  // Tandai kotak "pilih semua" sebagai setengah-tercentang bila hanya sebagian
  // baris yang dipilih.
  useEffect(() => {
    const checkbox = selectAllRef.current
    if (!checkbox) return
    checkbox.indeterminate = selectedVoters.size > 0 && selectedVoters.size < data.voters.length
  }, [selectedVoters, data.voters.length])

  async function login(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (response.ok) {
      const json = await response.json()
      window.sessionStorage.setItem('suarakita-admin', json.token)
      setLoggedIn(true)
      setLoginError('')
      void loadElection(json.token)
      return
    }
    setLoginError('Username atau password salah.')
  }

  async function persistReport(value: ReportSettings, token: string | null): Promise<'ok' | 'missing' | 'error'> {
    try {
      const response = await fetch('/api/admin/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(value),
      })
      if (response.status === 401) {
        logout()
        return 'error'
      }
      if (!response.ok) return 'error'
      const json = await response.json()
      return json?.persisted === false ? 'missing' : 'ok'
    } catch {
      return 'error'
    }
  }

  async function saveData(next: ElectionData = data) {
    if (!loaded) {
      setNotice('Data pemilihan belum termuat dari server. Muat ulang halaman sebelum menyimpan.')
      window.setTimeout(() => setNotice(''), 4600)
      return
    }

    const problem = validateElection(next)
    if (problem) {
      setNotice(`Belum disimpan: ${problem}`)
      window.setTimeout(() => setNotice(''), 5200)
      return
    }

    // Menutup pemilihan memutus akses surat suara untuk semua pemilih, jadi
    // admin dikonfirmasi lebih dulu bila masih ada yang belum memilih.
    const pendingVoters = next.voters.filter((voter) => !voter.hasVoted).length
    if (next.settings.status === 'closed' && data.settings.status !== 'closed' && pendingVoters > 0) {
      const confirmed = window.confirm(
        `Tutup pemilihan sekarang? ${pendingVoters} pemilih terdaftar belum memakai hak suaranya dan tidak akan bisa memilih setelah status Ditutup disimpan.`,
      )
      if (!confirmed) return
    }

    const token = window.sessionStorage.getItem('suarakita-admin')
    const pendingReport = next.report ?? data.report ?? defaultReportSettings
    const voterStatusEdits = next.voters
      .filter((voter) => Boolean((voter as AdminVoter).statusDirty))
      .map((voter) => ({ id: voter.id.trim(), hasVoted: voter.hasVoted }))
    const payload: ElectionData = {
      ...next,
      voters: next.voters.map((voter) => ({
        id: voter.id,
        name: voter.name,
        className: voter.className,
        hasVoted: voter.hasVoted,
      })),
      voterStatusEdits,
    }

    setData(next)
    setSaving(true)
    try {
      const response = await fetch('/api/admin/election', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (response.status === 401) {
        logout()
        return
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setNotice(body?.error ? `Gagal menyimpan: ${body.error}` : 'Gagal menyimpan perubahan.')
      } else {
        const refreshed = await loadElection(token)
        if (refreshed && reportDirty) {
          setData((current) => ({ ...current, report: pendingReport }))
        }
        if (reportDirty) {
          const result = await persistReport(pendingReport, token)
          if (result === 'ok') {
            setReportDirty(false)
            setNotice('Perubahan berhasil disimpan, termasuk identitas berita acara.')
          } else if (result === 'missing') {
            setNotice('Data pemilihan tersimpan, tetapi identitas berita acara belum: jalankan supabase/report-settings.sql di Supabase.')
          } else {
            setNotice('Data pemilihan tersimpan, tetapi identitas berita acara gagal disimpan.')
          }
        } else if (refreshed) {
          setNotice('Perubahan berhasil disimpan.')
        }
      }
    } catch {
      setNotice('Gagal menyimpan perubahan.')
    } finally {
      setSaving(false)
      window.setTimeout(() => setNotice(''), 4600)
    }
  }

  async function saveReport(value: ReportSettings = data.report ?? defaultReportSettings) {
    const token = window.sessionStorage.getItem('suarakita-admin')
    const result = await persistReport(value, token)
    if (result === 'ok') {
      setReportDirty(false)
      setNotice('Identitas berita acara berhasil disimpan.')
    } else if (result === 'missing') {
      setNotice('Identitas berita acara belum tersimpan: jalankan supabase/report-settings.sql di Supabase SQL Editor.')
    } else {
      setNotice('Gagal menyimpan identitas berita acara.')
    }
    window.setTimeout(() => setNotice(''), 4600)
  }

  function updateReport<K extends keyof ReportSettings>(field: K, value: ReportSettings[K]) {
    setReportDirty(true)
    setData((current) => ({
      ...current,
      report: { ...(current.report ?? defaultReportSettings), [field]: value },
    }))
  }

  function uploadLogo(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Logo sekolah harus berupa gambar.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice('Ukuran logo maksimal 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateReport('logo', String(reader.result))
      setNotice('Logo berhasil dipilih. Tekan Simpan pengaturan.')
    }
    reader.readAsDataURL(file)
  }

  async function openReport() {
    if (reportDirty) await saveReport()
    window.location.href = '/admin/berita-acara'
  }

  async function handleReset() {
    const confirmed = window.confirm(
      'Reset pemilihan? Semua surat suara anonim akan dihapus dan seluruh pemilih kembali berstatus "Belum memilih". Daftar pemilih TETAP tersimpan (untuk mengosongkannya gunakan tombol Hapus semua di tab Pemilih). Tindakan ini tidak bisa dibatalkan.',
    )
    if (!confirmed) return
    const token = window.sessionStorage.getItem('suarakita-admin')
    setResetting(true)
    try {
      const response = await fetch('/api/admin/election', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        logout()
        return
      }
      if (response.ok) {
        const refreshed = await loadElection(token)
        if (refreshed) {
          setNotice('Pemilihan berhasil direset. Semua surat suara dihapus dan status pemilih dikembalikan.')
        }
      } else {
        setNotice('Gagal mereset pemilihan.')
      }
    } catch {
      setNotice('Gagal mereset pemilihan.')
    } finally {
      setResetting(false)
      window.setTimeout(() => setNotice(''), 3400)
    }
  }

  function updateSettings(field: keyof ElectionSettings, value: string) {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, [field]: value },
    }))
  }

  function updateCandidate(index: number, field: keyof Candidate, value: string) {
    setData((current) => ({
      ...current,
      candidates: current.candidates.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, [field]: value } : candidate,
      ),
    }))
  }

  function addCandidate() {
    const number = String(data.candidates.length + 1).padStart(2, '0')
    setData((current) => ({
      ...current,
      candidates: [
        ...current.candidates,
        { number, president: '', vice: '', profile: '', vision: '', program: '', color: 'sage', initials: 'PA' },
      ],
    }))
  }

  function removeCandidate(index: number) {
    setData((current) => ({
      ...current,
      candidates: current.candidates.filter((_, candidateIndex) => candidateIndex !== index),
    }))
  }

  function addVoter() {
    setData((current) => ({
      ...current,
      voters: [...current.voters, { id: '', name: '', className: '', hasVoted: false }],
    }))
  }

  function updateVoter(index: number, field: keyof Voter, value: string | boolean) {
    setData((current) => ({
      ...current,
      voters: current.voters.map((voter, voterIndex) =>
        voterIndex === index ? { ...voter, [field]: value } : voter,
      ),
    }))
  }

  // Tandai bahwa status pemilih ini diubah admin, agar hanya perubahan yang
  // disengaja tersebut yang ditulis ke database saat menyimpan.
  function toggleVoterStatus(index: number, hasVoted: boolean) {
    setData((current) => ({
      ...current,
      voters: current.voters.map((voter, voterIndex) =>
        voterIndex === index ? ({ ...voter, hasVoted, statusDirty: true } as AdminVoter) : voter,
      ),
    }))
  }

  function removeVoter(index: number) {
    setData((current) => ({
      ...current,
      voters: current.voters.filter((_, voterIndex) => voterIndex !== index),
    }))
    // Indeks bergeser setelah penghapusan, jadi pilihan dibersihkan.
    setSelectedVoters(new Set())
  }

  function toggleVoterSelected(index: number) {
    setSelectedVoters((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleSelectAllVoters() {
    setSelectedVoters((current) =>
      current.size === data.voters.length ? new Set() : new Set(data.voters.map((_, index) => index)),
    )
  }

  function bulkSetClass() {
    const kelas = window.prompt(`Kelas baru untuk ${selectedVoters.size} pemilih terpilih:`, '')
    if (kelas === null) return
    setData((current) => ({
      ...current,
      voters: current.voters.map((voter, index) =>
        selectedVoters.has(index) ? { ...voter, className: kelas } : voter,
      ),
    }))
  }

  function bulkSetVoted(hasVoted: boolean) {
    setData((current) => ({
      ...current,
      voters: current.voters.map((voter, index) =>
        selectedVoters.has(index) ? ({ ...voter, hasVoted, statusDirty: true } as AdminVoter) : voter,
      ),
    }))
  }

  function deleteSelectedVoters() {
    const count = selectedVoters.size
    if (!count) return
    if (!window.confirm(`Hapus ${count} pemilih terpilih dari daftar? Perubahan diterapkan setelah menekan Simpan semua.`)) return
    setData((current) => ({
      ...current,
      voters: current.voters.filter((_, index) => !selectedVoters.has(index)),
    }))
    setSelectedVoters(new Set())
    setNotice(`${count} pemilih dihapus dari daftar. Tekan Simpan semua untuk menerapkan.`)
    window.setTimeout(() => setNotice(''), 4200)
  }

  function clearAllVoters() {
    if (!data.voters.length) return
    if (!window.confirm(`Kosongkan seluruh daftar pemilih (${data.voters.length} pemilih)? Perubahan diterapkan setelah menekan Simpan semua.`)) return
    setData((current) => ({ ...current, voters: [] }))
    setSelectedVoters(new Set())
    setNotice('Daftar pemilih dikosongkan. Tekan Simpan semua untuk menerapkan.')
    window.setTimeout(() => setNotice(''), 4200)
  }

  async function importVoters(file?: File) {
    if (!file) return
    if (!loaded) {
      setNotice('Data pemilihan belum termuat dari server. Tunggu sebentar lalu impor ulang.')
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const existingIds = data.voters.map((voter) => voter.id.trim()).filter(Boolean)
      const outcome = importVotersFromWorkbook(workbook, existingIds)

      if (!outcome.ok) {
        setNotice(
          outcome.reason === 'no_sheet'
            ? `Kolom Nama tidak ditemukan pada sheet: ${outcome.sheetNames.join(', ') || '(kosong)'}. Pastikan ada kolom Nama (NISN/NIS dan Kelas opsional).`
            : 'Sheet terpilih tidak berisi baris nama pemilih. Periksa kembali isi file.',
        )
        return
      }

      const { summary } = outcome
      setData((current) => ({ ...current, voters: [...current.voters, ...summary.voters] }))
      if (summary.generatedIds.length) {
        setGeneratedIds((current) => new Set([...current, ...summary.generatedIds]))
      }

      const parts = [
        summary.voters.length > 0
          ? `${summary.voters.length} pemilih diimpor dari sheet "${summary.sheetName}"`
          : `Tidak ada pemilih baru dari sheet "${summary.sheetName}"`,
      ]
      if (summary.generatedIds.length > 0) {
        parts.push(
          `${summary.generatedIds.length} baris tanpa NISN/NIS diberi nomor acak 10 digit (mis. ${summary.generatedIds[0]}) — kolomnya tetap bisa diedit di tabel`,
        )
      }
      if (summary.duplicateIds > 0) parts.push(`${summary.duplicateIds} baris dilewati karena NIS/NISN sudah terdaftar`)
      if (summary.skippedRows > 0) parts.push(`${summary.skippedRows} baris tanpa nama dilewati`)
      if (summary.sheetCount > 1) {
        parts.push(
          summary.usedActiveSheet
            ? `${summary.sheetCount} sheet terdeteksi, hanya sheet aktif yang dibaca`
            : `${summary.sheetCount} sheet terdeteksi, dipakai sheet pertama yang memuat kolom pemilih`,
        )
      }
      setNotice(`${parts.join('. ')}. Tekan Simpan semua untuk menerapkan.`)
    } catch {
      setNotice('File tidak dapat dibaca. Gunakan format CSV, XLS, atau XLSX.')
    }
  }

  function uploadCandidatePhoto(index: number, field: 'photo' | 'vicePhoto', file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Foto calon harus berupa gambar.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice('Ukuran foto maksimal 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateCandidate(index, field, String(reader.result))
      setNotice('Foto berhasil dipilih. Tekan Simpan semua.')
    }
    reader.readAsDataURL(file)
  }

  function logout() {
    window.sessionStorage.removeItem('suarakita-admin')
    setLoggedIn(false)
  }

  const allVotersSelected = data.voters.length > 0 && selectedVoters.size === data.voters.length

  if (!loggedIn) {
    return (
      <main className="admin-login-shell">
        <form className="admin-login-card" onSubmit={login}>
          <div className="admin-login-mark"><LockKeyhole size={24} /></div>
          <div>
            <span className="admin-kicker">SUARAKITA</span>
            <h1>Masuk Admin</h1>
            <p>Kelola event, sekolah, daftar pemilih, dan pasangan calon.</p>
          </div>
          <label>USERNAME<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>PASSWORD<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {loginError && <p className="admin-error" role="alert">{loginError}</p>}
          <button className="admin-primary" type="submit">Masuk dashboard</button>
          <div className="demo-credentials"><strong>Kredensial dari .env.local</strong><span>Username: ADMIN_USERNAME</span><span>Password: ADMIN_PASSWORD</span></div>
          <a className="admin-back" href="/"><ArrowLeft size={15} /> Kembali ke pemilihan</a>
        </form>
      </main>
    )
  }

  const votedCount = data.voters.filter((voter) => voter.hasVoted).length
  const pendingCount = data.voters.length - votedCount
  const report = data.report ?? defaultReportSettings

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/"><span className="brand-mark"><Vote size={18} /></span><span>suara<span>kita</span><small>ADMIN PANEL</small></span></a>
        <nav className="admin-nav" aria-label="Menu admin">
          <button className={tab === 'event' ? 'active' : ''} onClick={() => setTab('event')}><CalendarDays size={17} /> Event</button>
          <button className={tab === 'school' ? 'active' : ''} onClick={() => setTab('school')}><School size={17} /> Sekolah</button>
          <button className={tab === 'voters' ? 'active' : ''} onClick={() => setTab('voters')}><Users size={17} /> Pemilih</button>
          <button className={tab === 'candidates' ? 'active' : ''} onClick={() => setTab('candidates')}><GraduationCap size={17} /> Pasangan Calon</button>
          <button className={tab === 'theme' ? 'active' : ''} onClick={() => setTab('theme')}><Palette size={17} /> Tema Warna</button>
          <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}><FileText size={17} /> Berita Acara</button>
        </nav>
        <button className="admin-logout" onClick={logout}><LogOut size={16} /> Keluar</button>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div><span className="admin-kicker">DASHBOARD PEMILIHAN</span><h1>{tab === 'event' ? 'Pengaturan event' : tab === 'school' ? 'Data sekolah' : tab === 'voters' ? 'Daftar pemilih' : tab === 'candidates' ? 'Pasangan calon' : tab === 'theme' ? 'Tema warna aplikasi' : 'Berita acara & PDF'}</h1></div>
          <div className="admin-header-actions">
            {data.settings.status === 'closed' && (
              <button className="admin-report" onClick={openReport}><FileText size={15} /> Berita acara PDF</button>
            )}
            <button className="admin-reset" onClick={handleReset} disabled={resetting}><RotateCcw size={15} /> {resetting ? 'Mereset…' : 'Reset pemilihan'}</button>
            <button className="admin-primary compact" onClick={() => saveData()} disabled={saving || !loaded}><Save size={15} /> {saving ? 'Menyimpan…' : 'Simpan semua'}</button>
          </div>
        </header>

        {notice && <div className="admin-notice" role="status">{notice}</div>}

        {tab === 'event' && (
          <div className="admin-content-grid">
            <section className="admin-card">
              <h2>Informasi pemilihan</h2>
              <div className="admin-form-grid">
                <label className="span-2">JUDUL EVENT<input value={data.settings.eventTitle} onChange={(event) => updateSettings('eventTitle', event.target.value)} /></label>
                <label>MULAI<input type="datetime-local" value={data.settings.startDate} onChange={(event) => updateSettings('startDate', event.target.value)} /></label>
                <label>SELESAI<input type="datetime-local" value={data.settings.endDate} onChange={(event) => updateSettings('endDate', event.target.value)} /></label>
                <label className="span-2">STATUS<select value={data.settings.status} onChange={(event) => updateSettings('status', event.target.value)}><option value="draft">Draft</option><option value="active">Berlangsung</option><option value="closed">Ditutup</option></select></label>
                <p className="admin-helper">Surat suara hanya terbuka saat status <strong>Berlangsung</strong>. Saat status diubah menjadi <strong>Ditutup</strong> dan disimpan, pemilihan berhenti untuk semua pemilih (termasuk yang terdaftar dan belum memilih), hasil final terbuka untuk siapa saja, serta tombol <strong>Berita acara PDF</strong> aktif di kanan atas. Identitas dokumen (logo sekolah, nomor, penanda tangan, dan NIP) diatur pada tab <strong>Berita Acara</strong>.</p>
                {data.settings.status === 'closed' && pendingCount > 0 && (
                  <p className="admin-helper admin-helper-warning">Status <strong>Ditutup</strong> aktif: {pendingCount} pemilih terdaftar belum memakai hak suaranya dan tidak bisa memilih lagi. Ubah kembali ke <strong>Berlangsung</strong> bila mereka masih perlu memilih, atau gunakan status pemilih di tab <strong>Pemilih</strong> untuk pencatatan manual.</p>
                )}
              </div>
            </section>
            <section className="admin-card admin-stat-card"><span>PEMILIH TERDAFTAR</span><strong>{data.voters.length}</strong><div><b>{votedCount}</b> sudah memilih</div></section>
          </div>
        )}

        {tab === 'school' && (
          <section className="admin-card">
            <h2>Identitas sekolah</h2>
            <div className="admin-form-grid">
              <label className="span-2">NAMA SEKOLAH<input value={data.settings.schoolName} onChange={(event) => updateSettings('schoolName', event.target.value)} /></label>
            </div>
          </section>
        )}

        {tab === 'voters' && (
          <section className="admin-card">
            <div className="admin-card-heading"><div><h2>Daftar pemilih</h2><p>NIS/NISN menjadi identitas untuk masuk surat suara.</p></div><div className="admin-card-actions"><label className="admin-secondary import-button"><Upload size={15} /> Impor CSV/XLS<input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => { importVoters(event.target.files?.[0]); event.target.value = '' }} /></label><button className="admin-secondary" onClick={addVoter}><UserPlus size={15} /> Tambah pemilih</button><button className="admin-reset" onClick={clearAllVoters} disabled={!data.voters.length}><Trash2 size={15} /> Hapus semua</button></div></div>
            <p className="admin-helper">Impor mencari kolom <strong>Nama</strong> (wajib), <strong>NISN/NIS</strong>, dan <strong>Kelas</strong> pada baris judul — urutan kolom bebas. Bila NISN/NIS tidak ada, nomor dibuat <strong>acak 10 digit</strong> (mis. <strong>4821093375</strong>) dan ditandai kuning sebagai pengingat — semua kolom NIS/NISN tetap bisa diedit kapan saja. Bila file memiliki beberapa sheet, hanya <strong>sheet aktif</strong> yang dibaca; NISN/NIS yang sudah terdaftar dilewati. <strong>Reset pemilihan tidak menghapus daftar ini</strong> — untuk mengosongkannya pakai tombol <strong>Hapus semua</strong> lalu <strong>Simpan semua</strong>.</p>
            {selectedVoters.size > 0 && (
              <div className="admin-table-toolbar">
                <span><strong>{selectedVoters.size}</strong> pemilih dipilih</span>
                <div className="admin-table-toolbar-actions">
                  <button className="admin-secondary" onClick={bulkSetClass}>Ubah kelas</button>
                  <button className="admin-secondary" onClick={() => bulkSetVoted(true)}>Tandai sudah memilih</button>
                  <button className="admin-secondary" onClick={() => bulkSetVoted(false)}>Tandai belum memilih</button>
                  <button className="admin-reset" onClick={deleteSelectedVoters}><Trash2 size={15} /> Hapus terpilih</button>
                </div>
              </div>
            )}
            <div className="admin-table">
              <div className="admin-table-head"><span className="admin-select-cell"><input type="checkbox" ref={selectAllRef} checked={allVotersSelected} onChange={toggleSelectAllVoters} aria-label="Pilih semua pemilih" /></span><span>NIS/NISN</span><span>NAMA</span><span>KELAS</span><span>STATUS</span><span /></div>
              {data.voters.map((voter, index) => (
                <div className="admin-table-row" key={index}>
                  <span className="admin-select-cell"><input type="checkbox" checked={selectedVoters.has(index)} onChange={() => toggleVoterSelected(index)} aria-label={`Pilih ${voter.name || voter.id || 'pemilih'}`} /></span>
                  <input value={voter.id} className={generatedIds.has(voter.id.trim()) ? 'auto-id' : undefined} title={generatedIds.has(voter.id.trim()) ? 'Nomor ini dibuat acak (10 digit) karena file tidak memuat NISN/NIS. Boleh dipakai apa adanya atau diganti dengan nomor asli — kolom tetap bisa diedit.' : undefined} onChange={(event) => updateVoter(index, 'id', event.target.value)} placeholder="Nomor identitas" />
                  <input value={voter.name} onChange={(event) => updateVoter(index, 'name', event.target.value)} placeholder="Nama siswa" />
                  <input value={voter.className} onChange={(event) => updateVoter(index, 'className', event.target.value)} placeholder="Kelas" />
                  <label className="admin-status-toggle"><input type="checkbox" checked={voter.hasVoted} onChange={(event) => toggleVoterStatus(index, event.target.checked)} /><span>{voter.hasVoted ? 'Sudah' : 'Belum'}</span></label>
                  <button className="admin-icon-button" aria-label="Hapus pemilih" onClick={() => removeVoter(index)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'candidates' && (
          <section className="admin-card">
            <div className="admin-card-heading"><div><h2>Pasangan calon</h2><p>Isi nama, profil singkat, visi, dan program unggulan. Unggah foto ketua dan foto wakil secara terpisah, bukan foto gabungan.</p></div><button className="admin-secondary" onClick={addCandidate}><UserPlus size={15} /> Tambah paslon</button></div>
            <div className="candidate-admin-list">
              {data.candidates.map((candidate, index) => (
                <div className="candidate-admin-card" key={index}>
                  <div className="candidate-admin-number"><span>PASLON</span><input value={candidate.number} onChange={(event) => updateCandidate(index, 'number', event.target.value)} /><label className="candidate-photo-upload">{candidate.photo ? <img src={candidate.photo} alt={`Foto calon ketua paslon ${candidate.number}`} /> : <Upload size={16} />}<span>{candidate.photo ? 'Ganti foto ketua' : 'Foto ketua'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadCandidatePhoto(index, 'photo', event.target.files?.[0])} /></label><label className="candidate-photo-upload">{candidate.vicePhoto ? <img src={candidate.vicePhoto} alt={`Foto wakil ketua paslon ${candidate.number}`} /> : <Upload size={16} />}<span>{candidate.vicePhoto ? 'Ganti foto wakil' : 'Foto wakil'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadCandidatePhoto(index, 'vicePhoto', event.target.files?.[0])} /></label></div>
                  <div className="admin-form-grid candidate-fields">
                    <label>CALON KETUA<input value={candidate.president} onChange={(event) => updateCandidate(index, 'president', event.target.value)} /></label>
                    <label>CALON WAKIL KETUA<input value={candidate.vice} onChange={(event) => updateCandidate(index, 'vice', event.target.value)} /></label>
                    <label className="span-2">PROFIL<textarea value={candidate.profile} onChange={(event) => updateCandidate(index, 'profile', event.target.value)} /></label>
                    <label className="span-2">VISI<textarea value={candidate.vision} onChange={(event) => updateCandidate(index, 'vision', event.target.value)} /></label>
                    <label className="span-2">PROGRAM UNGGULAN<textarea value={candidate.program} onChange={(event) => updateCandidate(index, 'program', event.target.value)} /></label>
                  </div>
                  <button className="admin-icon-button candidate-remove" aria-label="Hapus pasangan calon" onClick={() => removeCandidate(index)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'theme' && (
          <section className="admin-card">
            <h2>Pilih tema aplikasi</h2>
            <p className="theme-description">Tema diterapkan pada halaman pemilihan setelah perubahan disimpan.</p>
            <div className="theme-grid">
              {[
                { id: 'violet', name: 'Violet Modern', colors: ['#7054e8', '#d2f277', '#241d3c'] },
                { id: 'emerald', name: 'Emerald Fresh', colors: ['#168664', '#a7e8d1', '#123c30'] },
                { id: 'sunset', name: 'Sunset Warm', colors: ['#ed7758', '#ffd166', '#5a2b2b'] },
                { id: 'ocean', name: 'Ocean Blue', colors: ['#2683a9', '#77d6dc', '#123848'] },
                { id: 'midnight', name: 'Midnight Glow', colors: ['#8b6fcb', '#c4b5fd', '#17132b'] },
              ].map((theme) => (
                <button
                  type="button"
                  className={`theme-option ${data.settings.theme === theme.id ? 'selected' : ''}`}
                  key={theme.id}
                  onClick={() => setData((current) => ({ ...current, settings: { ...current.settings, theme: theme.id as ElectionSettings['theme'] } }))}
                >
                  <span className="theme-preview" style={{ background: theme.colors[2] }}>
                    <i style={{ background: theme.colors[0] }} />
                    <i style={{ background: theme.colors[1] }} />
                  </span>
                  <span><strong>{theme.name}</strong><small>{data.settings.theme === theme.id ? 'Tema aktif' : 'Pilih tema'}</small></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === 'report' && (
          <section className="admin-card">
            <div className="admin-card-heading">
              <div>
                <h2>Berita acara &amp; PDF</h2>
                <p>Identitas dokumen resmi yang dicetak dari dashboard admin.</p>
              </div>
              <div className="admin-card-actions">
                <button className="admin-secondary" onClick={() => saveReport()}><Save size={15} /> Simpan pengaturan</button>
                <button className="admin-primary compact" onClick={openReport} disabled={data.settings.status !== 'closed'}><FileText size={15} /> Buka berita acara</button>
              </div>
            </div>
            <div className="admin-form-grid">
              <div className="span-2 report-logo-field">
                <span className="report-field-label">LOGO SEKOLAH</span>
                <div className="report-logo-row">
                  <label className="report-logo-upload">
                    {report.logo ? <img src={report.logo} alt="Logo sekolah" /> : <Upload size={18} />}
                    <span>{report.logo ? 'Ganti logo' : 'Unggah logo'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                  </label>
                  <div className="report-logo-meta">
                    <p>Logo tampil di kop berita acara. Gunakan PNG, JPG, atau SVG (latar transparan lebih baik), maksimal 2 MB.</p>
                    {report.logo && (
                      <button className="admin-secondary" onClick={() => updateReport('logo', '')}><Trash2 size={14} /> Hapus logo</button>
                    )}
                  </div>
                </div>
              </div>
              <label className="span-2">NOMOR BERITA ACARA<input value={report.number} onChange={(event) => updateReport('number', event.target.value)} placeholder="01/BA-PANPUS/OSIS/2026" /></label>
              <label>TEMPAT<input value={report.place} onChange={(event) => updateReport('place', event.target.value)} placeholder="Contoh: Bandung" /></label>
              <label>TANGGAL<input type="date" value={report.date} onChange={(event) => updateReport('date', event.target.value)} /></label>
              <label>KETUA PANITIA<input value={report.chair} onChange={(event) => updateReport('chair', event.target.value)} placeholder="Nama ketua panitia" /></label>
              <label>NIP KETUA<input value={report.chairNip} onChange={(event) => updateReport('chairNip', event.target.value)} placeholder="NIP ketua panitia" /></label>
              <label>SEKRETARIS PANITIA<input value={report.secretary} onChange={(event) => updateReport('secretary', event.target.value)} placeholder="Nama sekretaris panitia" /></label>
              <label>NIP SEKRETARIS<input value={report.secretaryNip} onChange={(event) => updateReport('secretaryNip', event.target.value)} placeholder="NIP sekretaris panitia" /></label>
              <label>KEPALA SEKOLAH<input value={report.principal} onChange={(event) => updateReport('principal', event.target.value)} placeholder="Nama kepala sekolah" /></label>
              <label>NIP KEPALA SEKOLAH<input value={report.principalNip} onChange={(event) => updateReport('principalNip', event.target.value)} placeholder="NIP kepala sekolah" /></label>
              <div className="span-2 report-switch">
                <label className="admin-status-toggle">
                  <input type="checkbox" checked={report.includeClasses} onChange={(event) => updateReport('includeClasses', event.target.checked)} />
                  <span>{report.includeClasses ? 'Per kelas' : 'Keseluruhan'}</span>
                </label>
                <p>Sertakan tabel rekapitulasi partisipasi pemilih per kelas. Jika dimatikan, berita acara hanya menampilkan rekapitulasi suara secara keseluruhan.</p>
              </div>
              <p className="admin-helper span-2">Perolehan suara selalu diringkas sebagai total dan tidak dirinci menurut kelas untuk menjaga kerahasiaan surat suara. Pilihan di atas hanya mengatur tabel partisipasi pemilih.</p>
              {data.settings.status !== 'closed' && (
                <p className="admin-helper span-2">Berita acara baru dapat dicetak setelah STATUS pemilihan diubah menjadi <strong>Ditutup</strong> dan disimpan.</p>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
