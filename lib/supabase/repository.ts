import { getSupabaseAdmin } from './server'
import {
  Candidate,
  ElectionData,
  ElectionSettings,
  ReportSettings,
  TallySummary,
  Voter,
  defaultElectionSettings,
  defaultReportSettings,
  isVotingOpen,
} from '@/lib/election'

type SettingsRow = {
  school_name: string
  event_title: string
  start_date: string
  end_date: string
  status: ElectionSettings['status']
  theme: ElectionSettings['theme']
  // Kolom berita acara bersifat opsional agar tetap aman bila migrasi
  // supabase/report-settings.sql belum dijalankan.
  logo?: string | null
  report_number?: string | null
  report_place?: string | null
  report_date?: string | null
  report_chair?: string | null
  report_chair_nip?: string | null
  report_secretary?: string | null
  report_secretary_nip?: string | null
  report_principal?: string | null
  report_principal_nip?: string | null
  report_include_classes?: boolean | null
}

type CandidateRow = {
  number: string
  president: string
  vice: string
  color: Candidate['color']
  initials: string
  photo: string | null
  vice_photo: string | null
  profile: string
  vision: string
  program: string
  position: number
}

type VoterRow = {
  id: string
  name: string
  class_name: string
  has_voted: boolean
}

function mapSettings(row: SettingsRow | null): ElectionSettings {
  if (!row) return defaultElectionSettings
  return {
    schoolName: row.school_name,
    eventTitle: row.event_title,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    theme: row.theme,
  }
}

function mapReportSettings(row: SettingsRow | null | undefined): ReportSettings {
  if (!row) return { ...defaultReportSettings }
  return {
    logo: row.logo ?? '',
    number: row.report_number ?? '',
    place: row.report_place ?? '',
    date: row.report_date ?? '',
    chair: row.report_chair ?? '',
    chairNip: row.report_chair_nip ?? '',
    secretary: row.report_secretary ?? '',
    secretaryNip: row.report_secretary_nip ?? '',
    principal: row.report_principal ?? '',
    principalNip: row.report_principal_nip ?? '',
    includeClasses: Boolean(row.report_include_classes),
  }
}

function mapCandidate(row: CandidateRow): Candidate {
  return {
    number: row.number,
    president: row.president,
    vice: row.vice,
    color: row.color,
    initials: row.initials,
    photo: row.photo ?? undefined,
    vicePhoto: row.vice_photo ?? undefined,
    profile: row.profile,
    vision: row.vision,
    program: row.program,
  }
}

function mapVoter(row: VoterRow): Voter {
  return {
    id: row.id,
    name: row.name,
    className: row.class_name,
    hasVoted: row.has_voted,
  }
}

// Data publik untuk halaman pemilihan (tanpa daftar pemilih & suara).
export async function getPublicElection(): Promise<{
  settings: ElectionSettings
  candidates: Candidate[]
}> {
  const db = getSupabaseAdmin()
  const [{ data: settings }, { data: candidates }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).maybeSingle<SettingsRow>(),
    db.from('candidates').select('*').order('position', { ascending: true }).returns<CandidateRow[]>(),
  ])

  return {
    settings: mapSettings(settings),
    candidates: (candidates ?? []).map(mapCandidate),
  }
}

// Data lengkap untuk dashboard admin.
export async function getFullElection(): Promise<ElectionData> {
  const db = getSupabaseAdmin()
  const [settingsResult, candidatesResult, votersResult] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).maybeSingle<SettingsRow>(),
    db.from('candidates').select('*').order('position', { ascending: true }).returns<CandidateRow[]>(),
    db.from('voters').select('*').order('id', { ascending: true }).returns<VoterRow[]>(),
  ])

  // Jangan diam-diam mengembalikan daftar kosong: dashboard admin akan
  // menampilkan data "hilang" lalu menimpa database dengan daftar kosong.
  if (settingsResult.error) throw new Error(`Gagal memuat pengaturan: ${settingsResult.error.message}`)
  if (candidatesResult.error) throw new Error(`Gagal memuat pasangan calon: ${candidatesResult.error.message}`)
  if (votersResult.error) throw new Error(`Gagal memuat daftar pemilih: ${votersResult.error.message}`)

  const settings = settingsResult.data
  return {
    settings: mapSettings(settings),
    candidates: (candidatesResult.data ?? []).map(mapCandidate),
    voters: (votersResult.data ?? []).map(mapVoter),
    report: mapReportSettings(settings),
  }
}

// Kesalahan validasi ditampilkan sebagai 400 dengan pesan yang bisa dibaca admin.
export class ElectionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElectionValidationError'
  }
}

type CandidateRowInput = {
  number: string
  president: string
  vice: string
  color: Candidate['color']
  initials: string
  photo: string | null
  vice_photo: string | null
  profile: string
  vision: string
  program: string
  position: number
}

type VoterRowInput = {
  id: string
  name: string
  class_name: string
}

const DELETE_CHUNK_SIZE = 100

function normalizeCandidates(candidates: Candidate[] | undefined): CandidateRowInput[] {
  const list = candidates ?? []
  if (!list.length) {
    throw new ElectionValidationError('Minimal harus ada satu pasangan calon.')
  }

  const numbers = new Set<string>()
  return list.map((candidate, index) => {
    const number = String(candidate?.number ?? '').trim()
    if (!number) {
      throw new ElectionValidationError(`Nomor paslon ke-${index + 1} masih kosong.`)
    }
    if (numbers.has(number)) {
      throw new ElectionValidationError(`Nomor paslon ${number} dipakai lebih dari satu paslon.`)
    }
    numbers.add(number)

    return {
      number,
      president: candidate.president ?? '',
      vice: candidate.vice ?? '',
      color: candidate.color ?? 'sage',
      initials: candidate.initials ?? '',
      photo: candidate.photo ?? null,
      vice_photo: candidate.vicePhoto ?? null,
      profile: candidate.profile ?? '',
      vision: candidate.vision ?? '',
      program: candidate.program ?? '',
      position: index + 1,
    }
  })
}

function normalizeVoters(voters: Voter[] | undefined): VoterRowInput[] {
  const ids = new Set<string>()
  return (voters ?? []).map((voter, index) => {
    const id = String(voter?.id ?? '').trim()
    if (!id) {
      throw new ElectionValidationError(
        `NIS/NISN pemilih baris ke-${index + 1} masih kosong. Isi nomor identitas atau hapus barisnya.`,
      )
    }
    if (ids.has(id)) {
      throw new ElectionValidationError(`NIS/NISN ${id} dipakai lebih dari satu pemilih.`)
    }
    ids.add(id)

    return { id, name: voter.name ?? '', class_name: voter.className ?? '' }
  })
}

async function deleteMissingRows(
  table: 'candidates' | 'voters',
  column: 'number' | 'id',
  values: string[],
): Promise<void> {
  if (!values.length) return
  const db = getSupabaseAdmin()
  for (let start = 0; start < values.length; start += DELETE_CHUNK_SIZE) {
    const chunk = values.slice(start, start + DELETE_CHUNK_SIZE)
    const { error } = await db.from(table).delete().in(column, chunk)
    if (error) throw new Error(`Gagal menghapus data ${table} yang lama: ${error.message}`)
  }
}

// Simpan seluruh data pemilihan (dipakai tombol "Simpan semua" di admin).
// Strategi: upsert dulu, baru hapus baris yang tidak lagi ada di daftar.
// Dengan begitu kegagalan insert tidak pernah meninggalkan tabel kosong
// seperti pada pola lama "delete semua lalu insert".
export async function saveFullElection(data: ElectionData): Promise<void> {
  const db = getSupabaseAdmin()
  const { settings } = data
  const candidates = normalizeCandidates(data.candidates)
  const voters = normalizeVoters(data.voters)

  const { error: settingsError } = await db.from('settings').upsert({
    id: 1,
    school_name: settings.schoolName,
    event_title: settings.eventTitle,
    start_date: settings.startDate,
    end_date: settings.endDate,
    status: settings.status,
    theme: settings.theme,
  })
  if (settingsError) throw new Error(`Gagal menyimpan pengaturan: ${settingsError.message}`)

  // Pasangan calon: upsert berdasarkan nomor paslon (unik), lalu hapus sisanya.
  const { error: candidateUpsertError } = await db
    .from('candidates')
    .upsert(candidates, { onConflict: 'number' })
  if (candidateUpsertError) {
    throw new Error(`Gagal menyimpan pasangan calon: ${candidateUpsertError.message}`)
  }

  const { data: existingCandidateRows, error: candidateReadError } = await db
    .from('candidates')
    .select('number')
    .returns<{ number: string }[]>()
  if (candidateReadError) throw new Error(`Gagal membaca data paslon: ${candidateReadError.message}`)

  const keptNumbers = new Set(candidates.map((candidate) => candidate.number))
  await deleteMissingRows(
    'candidates',
    'number',
    (existingCandidateRows ?? [])
      .map((row) => row.number)
      .filter((number) => !keptNumbers.has(number)),
  )

  // Pemilih: upsert tanpa kolom has_voted agar status pemilih yang sudah
  // memilih tidak ikut ter-reset oleh data dashboard yang usang.
  const { error: voterUpsertError } = await db.from('voters').upsert(voters, { onConflict: 'id' })
  if (voterUpsertError) {
    throw new Error(`Gagal menyimpan daftar pemilih: ${voterUpsertError.message}`)
  }

  const { data: existingVoterRows, error: voterReadError } = await db
    .from('voters')
    .select('id')
    .returns<{ id: string }[]>()
  if (voterReadError) throw new Error(`Gagal membaca daftar pemilih: ${voterReadError.message}`)

  const keptIds = new Set(voters.map((voter) => voter.id))
  await deleteMissingRows(
    'voters',
    'id',
    (existingVoterRows ?? []).map((row) => row.id).filter((id) => !keptIds.has(id)),
  )

  // Status "sudah memilih" hanya ditulis untuk pemilih yang statusnya
  // benar-benar diubah admin di dashboard.
  const statusEdits = (data.voterStatusEdits ?? [])
    .filter((edit) => keptIds.has(String(edit.id ?? '').trim()))
    .map((edit) => ({ id: String(edit.id).trim(), has_voted: Boolean(edit.hasVoted) }))
  if (statusEdits.length) {
    const { error: statusError } = await db.from('voters').upsert(statusEdits, { onConflict: 'id' })
    if (statusError) throw new Error(`Gagal menyimpan status pemilih: ${statusError.message}`)
  }
}

// Gerbang status pemilihan. Server selalu memeriksa ulang status terbaru dari
// database agar pemilih yang halaman surat suaranya masih terbuka tidak bisa
// mengirim suara setelah panitia menutup pemilihan.
async function getVotingGate(): Promise<{ open: boolean; status: ElectionSettings['status'] }> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('settings')
    .select('status')
    .eq('id', 1)
    .maybeSingle<{ status: ElectionSettings['status'] }>()
  // Gagal membaca status = jangan menerima suara (fail closed).
  if (error) throw new Error(`Gagal membaca status pemilihan: ${error.message}`)
  const status = data?.status ?? 'draft'
  return { open: isVotingOpen(status), status }
}

export async function verifyVoter(
  studentId: string,
): Promise<{ ok: boolean; name?: string; reason?: string; status?: ElectionSettings['status'] }> {
  const gate = await getVotingGate()
  if (!gate.open) return { ok: false, reason: 'not_open', status: gate.status }

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('voters')
    .select('name, has_voted')
    .eq('id', studentId)
    .maybeSingle<{ name: string; has_voted: boolean }>()

  if (!data) return { ok: false, reason: 'not_found', status: gate.status }
  if (data.has_voted) return { ok: false, reason: 'already_voted', status: gate.status }
  return { ok: true, name: data.name, status: gate.status }
}

// Status pemilih tanpa menyiratkan hak memilih: dipakai untuk membuka (atau
// menolak) akses realcount sesuai syarat "sudah memilih".
export async function getVoterStatus(
  studentId: string,
): Promise<{ found: boolean; hasVoted: boolean; name?: string }> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('voters')
    .select('name, has_voted')
    .eq('id', studentId)
    .maybeSingle<{ name: string; has_voted: boolean }>()

  if (!data) return { found: false, hasVoted: false }
  return { found: true, hasVoted: Boolean(data.has_voted), name: data.name }
}

export async function castVote(
  studentId: string,
  candidateNumber: string,
): Promise<{ ok: boolean; reason?: string; status?: ElectionSettings['status'] }> {
  const gate = await getVotingGate()
  if (!gate.open) return { ok: false, reason: 'not_open', status: gate.status }

  const db = getSupabaseAdmin()

  const { error } = await db.rpc('cast_vote', {
    p_voter_id: studentId,
    p_candidate_number: candidateNumber,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('already_voted')) return { ok: false, reason: 'already_voted' }
    if (message.includes('voter_not_found')) return { ok: false, reason: 'not_found' }
    if (message.includes('invalid_candidate')) return { ok: false, reason: 'invalid_candidate' }
    // Dilempar oleh fungsi database bila status berubah menjadi bukan
    // "active" di antara pemeriksaan di atas dan penulisan suara.
    if (message.includes('election_not_open')) {
      const latest = await getVotingGate()
      return { ok: false, reason: 'not_open', status: latest.status }
    }
    return { ok: false, reason: 'update_failed' }
  }

  return { ok: true }
}

// Reset pemilihan: hapus semua surat suara anonim dan kembalikan status pemilih.
export async function resetElection(): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db.rpc('reset_votes')
  if (error) throw new Error(error.message)
}

// Data lengkap berita acara (khusus admin): hasil + rincian per kelas + identitas dokumen.
export async function getReportData(): Promise<{
  settings: ElectionSettings
  tally: TallySummary
  report: ReportSettings
}> {
  const { settings, tally } = await getResults({ includeClassBreakdown: true })
  const db = getSupabaseAdmin()
  const { data: row } = await db.from('settings').select('*').eq('id', 1).maybeSingle<SettingsRow>()

  return { settings, tally, report: mapReportSettings(row) }
}

// Simpan identitas berita acara saja. Bila kolom belum ada di database,
// penyimpanan data pemilihan tetap berhasil dan admin diberi tahu.
export async function saveReportSettings(report: ReportSettings): Promise<{ persisted: boolean }> {
  const db = getSupabaseAdmin()
  const { error } = await db.from('settings').upsert({
    id: 1,
    logo: report.logo || null,
    report_number: report.number,
    report_place: report.place,
    report_date: report.date,
    report_chair: report.chair,
    report_chair_nip: report.chairNip,
    report_secretary: report.secretary,
    report_secretary_nip: report.secretaryNip,
    report_principal: report.principal,
    report_principal_nip: report.principalNip,
    report_include_classes: report.includeClasses,
  })

  if (error) {
    console.error('saveReportSettings', error.message)
    return { persisted: false }
  }

  return { persisted: true }
}
// Rincian partisipasi per kelas hanya diambil saat dibutuhkan (berita acara),
// agar endpoint realcount yang di-polling tetap ringan.
export async function getResults(
  options: { includeClassBreakdown?: boolean } = {},
): Promise<{
  settings: ElectionSettings
  tally: TallySummary
}> {
  const db = getSupabaseAdmin()
  const classBreakdownQuery = options.includeClassBreakdown
    ? db.from('voters').select('class_name, has_voted').returns<{ class_name: string; has_voted: boolean }[]>()
    : Promise.resolve({ data: [] as { class_name: string; has_voted: boolean }[] })

  const [
    { data: settings },
    { data: candidates },
    { count: voterCount },
    { count: votedCount },
    { data: votes },
    { data: voters },
  ] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).maybeSingle<SettingsRow>(),
    db.from('candidates').select('*').order('position', { ascending: true }).returns<CandidateRow[]>(),
    db.from('voters').select('id', { count: 'exact', head: true }),
    db.from('voters').select('id', { count: 'exact', head: true }).eq('has_voted', true),
    db.from('votes').select('candidate_number').returns<{ candidate_number: string }[]>(),
    classBreakdownQuery,
  ])

  const counts = new Map<string, number>()
  let totalVotes = 0
  for (const row of votes ?? []) {
    counts.set(row.candidate_number, (counts.get(row.candidate_number) ?? 0) + 1)
    totalVotes += 1
  }

  const rows = (candidates ?? []).map((candidate) => {
    const votesForCandidate = counts.get(candidate.number) ?? 0
    return {
      candidate: mapCandidate(candidate),
      votes: votesForCandidate,
      percent: totalVotes ? Math.round((votesForCandidate / totalVotes) * 1000) / 10 : 0,
    }
  })

  rows.sort((a, b) => b.votes - a.votes)

  const classCounts = new Map<string, { voterCount: number; votedCount: number }>()
  for (const voter of voters ?? []) {
    const className = voter.class_name?.trim() || 'Tanpa kelas'
    const entry = classCounts.get(className) ?? { voterCount: 0, votedCount: 0 }
    entry.voterCount += 1
    if (voter.has_voted) entry.votedCount += 1
    classCounts.set(className, entry)
  }

  const participationByClass = [...classCounts.entries()]
    .map(([className, entry]) => ({
      className,
      voterCount: entry.voterCount,
      votedCount: entry.votedCount,
      turnout: entry.voterCount ? Math.round((entry.votedCount / entry.voterCount) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.className.localeCompare(b.className, 'id', { numeric: true, sensitivity: 'base' }))

  return {
    settings: mapSettings(settings),
    tally: {
      rows,
      totalVotes,
      votedCount: votedCount ?? 0,
      voterCount: voterCount ?? 0,
      turnout: voterCount ? Math.round(((votedCount ?? 0) / voterCount) * 1000) / 10 : 0,
      participationByClass,
    },
  }
}
