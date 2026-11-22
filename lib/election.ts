export type Candidate = {
  number: string
  president: string
  vice: string
  color: 'coral' | 'sage' | 'blue'
  initials: string
  photo?: string
  vicePhoto?: string
  profile: string
  vision: string
  program: string
}

export type Voter = {
  id: string
  name: string
  className: string
  hasVoted: boolean
}

export type ElectionSettings = {
  schoolName: string
  eventTitle: string
  startDate: string
  endDate: string
  status: 'draft' | 'active' | 'closed'
  theme: 'violet' | 'emerald' | 'sunset' | 'ocean' | 'midnight'
}

export const electionStorageKey = 'suarakita-election'

// Surat suara hanya menerima suara saat status "active". Status "draft"
// (belum dibuka) dan "closed" (sudah ditutup) sama-sama menutup pemilihan,
// termasuk untuk pemilih terdaftar yang belum memakai hak suaranya.
export function isVotingOpen(status: ElectionSettings['status'] | undefined | null): boolean {
  return status === 'active'
}

export function votingUnavailableTitle(status: ElectionSettings['status'] | undefined | null): string {
  return status === 'closed' ? 'Pemilihan sudah ditutup' : 'Pemilihan belum dibuka'
}

// Pesan yang sama dipakai halaman pemilih dan notifikasi admin agar tidak
// berbeda penjelasan antara keduanya.
export function votingUnavailableMessage(status: ElectionSettings['status'] | undefined | null): string {
  return status === 'closed'
    ? 'Pemilihan sudah ditutup oleh panitia. Surat suara tidak dapat dibuka lagi, termasuk untuk pemilih terdaftar yang belum memakai hak suaranya.'
    : 'Pemilihan belum dibuka oleh panitia. Surat suara dapat dibuka setelah panitia mengubah status pemilihan menjadi berlangsung.'
}

export const defaultElectionSettings: ElectionSettings = {
  schoolName: 'SMA Nusantara',
  eventTitle: 'PEMILIHAN KETUA & WAKIL KETUA OSIS 2026',
  startDate: '2026-11-25T08:00',
  endDate: '2026-11-25T15:00',
  status: 'active',
  theme: 'violet',
}

export const defaultCandidates: Candidate[] = [
  { number: '01', president: 'Nadia Putri Ramadhani', vice: 'Raka Aditya Pratama', color: 'coral', initials: 'NP', profile: 'Ketua kelas XI IPA 1 yang aktif di ekstrakurikuler debat dan pernah memimpin kegiatan sosial sekolah.', vision: 'Mewujudkan sekolah yang aktif, inklusif, dan menjadi ruang bertumbuh bagi semua.', program: 'Ruang aspirasi siswa · Jumat berkarya · Pekan olahraga bersama' },
  { number: '02', president: 'Farhan Maulana', vice: 'Alya Safitri N.', color: 'sage', initials: 'FM', profile: 'Pengurus OSIS bidang lingkungan yang berpengalaman mengelola proyek kebersihan dan kegiatan berbagi.', vision: 'Membangun OSIS yang dekat, tanggap, dan membawa perubahan nyata.', program: 'OSIS mendengar · Kelas berbagi · Sekolah minim sampah' },
  { number: '03', president: 'Keisha Anindya', vice: 'Bima Arya Wijaya', color: 'blue', initials: 'KA', profile: 'Aktif di teater sekolah dan komunitas literasi; terbiasa membangun kolaborasi lintas kelas.', vision: 'Bersama menciptakan lingkungan sekolah yang kreatif dan berprestasi.', program: 'Festival kreativitas · Teman belajar · Panggung ekspresi' },
]

export const defaultVoters: Voter[] = [
  { id: '0012345678', name: 'Siswa Contoh 1', className: 'XI IPA 1', hasVoted: false },
  { id: '0087654321', name: 'Siswa Contoh 2', className: 'XI IPS 2', hasVoted: false },
]

export type ReportSettings = {
  logo: string
  number: string
  place: string
  date: string
  chair: string
  chairNip: string
  secretary: string
  secretaryNip: string
  principal: string
  principalNip: string
  includeClasses: boolean
}

export const defaultReportSettings: ReportSettings = {
  logo: '',
  number: '',
  place: '',
  date: '',
  chair: '',
  chairNip: '',
  secretary: '',
  secretaryNip: '',
  principal: '',
  principalNip: '',
  includeClasses: false,
}

export type ElectionData = {
  settings: ElectionSettings
  candidates: Candidate[]
  voters: Voter[]
  report?: ReportSettings
  // Perubahan status "sudah memilih" yang dilakukan admin secara eksplisit.
  // Status pemilih lain dipertahankan apa adanya di database.
  voterStatusEdits?: { id: string; hasVoted: boolean }[]
}

export type TallyRow = {
  candidate: Candidate
  votes: number
  percent: number
}

export type ClassParticipation = {
  className: string
  voterCount: number
  votedCount: number
  turnout: number
}

export type TallySummary = {
  rows: TallyRow[]
  totalVotes: number
  votedCount: number
  voterCount: number
  turnout: number
  participationByClass: ClassParticipation[]
}


