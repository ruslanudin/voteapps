import * as XLSX from 'xlsx'
import { makeRandomToken, normalizeToken, type Voter } from '@/lib/election'

// Panjang nomor identitas acak yang dibuat saat file hanya berisi nama.
// Nomor ini dipakai sebagai NISN/NIS sementara: 10 digit angka, tanpa nol di
// depan, dan kolomnya tetap bisa diedit admin kapan saja.
export const RANDOM_VOTER_ID_LENGTH = 10

// Kolom yang dikenali. Urutan menentukan prioritas bila satu sheet punya
// beberapa kolom sejenis (mis. "Nama" dan "Nama Lengkap" -> pilih Nama Lengkap).
const NAME_HEADERS = [
  'namalengkap',
  'namalengkapsiswa',
  'nama',
  'namasiswa',
  'namesiswa',
  'namapeserta',
  'fullname',
  'name',
  'siswa',
]
const ID_HEADERS = [
  'nisn',
  'nis',
  'nisnnis',
  'nisnisn',
  'nisnniss',
  'nisnis',
  'nomoridentitas',
  'noidentitas',
  'nomorinduksiswa',
  'nomorinduk',
  'noinduk',
  'nomorid',
  'idpemilih',
  'kodepemilih',
  'nomorpeserta',
  'identitas',
  'id',
  'kode',
]
const CLASS_HEADERS = [
  'kelas',
  'kelastingkat',
  'kelasrombel',
  'rombelkelas',
  'rombel',
  'classname',
  'class',
  'tingkat',
]

// Baris judul (header) dicari di beberapa baris pertama karena banyak file
// sekolah menaruh judul/nama kegiatan di baris paling atas.
const HEADER_SCAN_ROWS = 15
const HEADER_SCORE = { name: 4, id: 2, className: 1 }

type HeaderCell = { index: number; header: string; priority: number }

type SheetColumns = {
  headerRow: number
  name: HeaderCell & { index: number }
  id?: HeaderCell
  className?: HeaderCell
}

export type VoterImportSummary = {
  voters: Voter[]
  sheetName: string
  sheetCount: number
  usedActiveSheet: boolean
  columns: { id?: string; name: string; className?: string }
  // Nomor acak yang dibuat untuk baris tanpa NISN/NIS (10 digit).
  generatedIds: string[]
  // Token undangan yang dibuat otomatis untuk setiap pemilih baru.
  tokensGenerated: number
  skippedRows: number
  duplicateIds: number
}

export type VoterImportOutcome =
  | { ok: true; summary: VoterImportSummary }
  | { ok: false; reason: 'no_sheet' | 'empty'; sheetNames: string[] }

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

// Header "NIS/NISN", "Nama Lengkap", "Kelas XI" disamakan menjadi huruf kecil
// tanpa spasi/tanda baca agar mudah dicocokkan.
function headerKey(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findHeader(row: unknown[], candidates: string[]): HeaderCell | undefined {
  let found: HeaderCell | undefined
  row.forEach((cell, index) => {
    const key = headerKey(cell)
    if (!key) return
    const priority = candidates.indexOf(key)
    if (priority === -1) return
    if (!found || priority < found.priority) found = { index, header: text(cell), priority }
  })
  return found
}

// Nomor identitas dari sel Excel: buang desimal ".0" sisa sel numerik.
function idText(value: unknown): string {
  return text(value).replace(/\.0+$/, '')
}

function readRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: true,
    raw: false,
  })
}

// Sheet dianggap bisa diimpor bila punya kolom Nama. Kolom NISN/NIS dan Kelas
// bersifat opsional: tanpa NISN/NIS nomor dibuat acak 10 digit, tanpa Kelas diisi '-'.
function analyzeSheet(sheet: XLSX.WorkSheet): { columns: SheetColumns; rows: unknown[][] } | null {
  const rows = readRows(sheet)
  let best: { columns: SheetColumns; score: number } | null = null

  for (let index = 0; index < Math.min(rows.length, HEADER_SCAN_ROWS); index += 1) {
    const row = rows[index] ?? []
    const name = findHeader(row, NAME_HEADERS)
    if (!name) continue

    const id = findHeader(row, ID_HEADERS)
    const className = findHeader(row, CLASS_HEADERS)
    const score =
      HEADER_SCORE.name + (id ? HEADER_SCORE.id : 0) + (className ? HEADER_SCORE.className : 0)
    if (!best || score > best.score) {
      best = { columns: { headerRow: index, name, id, className }, score }
    }
  }

  return best ? { columns: best.columns, rows } : null
}

// Sheet yang dibuka saat file diklik di Excel. xlsx membacanya dari
// <workbookView activeTab="..."> ke workbook.Workbook.WBView. Tidak tersedia
// pada file CSV, sehingga pemanggil memakai sheet pertama yang memuat kolom.
function activeSheetName(workbook: XLSX.WorkBook): string | undefined {
  const views = (workbook as unknown as { Workbook?: { WBView?: { activeTab?: number }[] } }).Workbook
    ?.WBView
  const index = views?.[0]?.activeTab
  if (typeof index !== 'number' || index < 0 || index >= workbook.SheetNames.length) return undefined
  return workbook.SheetNames[index]
}

// Angka acak 0..max-1. Memakai crypto.getRandomValues bila tersedia (browser
// dan Node modern), jika tidak jatuh ke Math.random. Cukup untuk NISN
// sementara, bukan untuk keperluan kriptografi.
function randomInt(max: number): number {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1)
    cryptoApi.getRandomValues(buffer)
    return buffer[0] % max
  }
  return Math.floor(Math.random() * max)
}

// Nomor identitas acak sepanjang RANDOM_VOTER_ID_LENGTH digit. Digit pertama
// 1-9 supaya tetap terbaca sebagai 10 angka (tanpa nol di depan), dan nilainya
// dijamin belum dipakai pada daftar "taken".
export function makeRandomVoterId(taken: Iterable<string> = []): string {
  const used = taken instanceof Set ? taken : new Set(taken)
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let candidate = String(1 + randomInt(9))
    while (candidate.length < RANDOM_VOTER_ID_LENGTH) candidate += String(randomInt(10))
    if (!used.has(candidate)) return candidate
  }
  // Praktis tidak pernah tercapai; pakai nomor berbasis waktu yang masih unik.
  let fallback = Number(String(Date.now()).slice(-RANDOM_VOTER_ID_LENGTH))
  while (used.has(String(fallback))) fallback += 1
  return String(fallback)
}

// Ubah workbook menjadi daftar pemilih. Aturan:
// - Hanya satu sheet yang dibaca: sheet aktif bila memuat kolom yang dikenali,
//   jika tidak (mis. sheet aktif berupa sampul) sheet pertama yang memuat kolom
//   Nama. Beberapa sheet tidak pernah digabung.
// - Kolom Nama wajib ada; NISN/NIS dan Kelas opsional.
// - NISN/NIS kosong -> dibuat nomor acak 10 digit (tetap bisa diedit admin di
//   tab Pemilih sebelum pemilihan dibuka).
// - NISN/NIS yang sudah ada (di file maupun di daftar pemilih) dilewati.
// - Setiap pemilih baru mendapat token undangan 6 karakter yang unik.
export function importVotersFromWorkbook(
  workbook: XLSX.WorkBook,
  existingIds: Iterable<string> = [],
  existingTokens: Iterable<string> = [],
): VoterImportOutcome {
  const sheetNames = [...workbook.SheetNames]
  const analyzed = sheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return []
    const analysis = analyzeSheet(sheet)
    return analysis ? [{ sheetName, analysis }] : []
  })

  if (!analyzed.length) return { ok: false, reason: 'no_sheet', sheetNames }

  const activeName = activeSheetName(workbook)
  const chosen = analyzed.find((entry) => entry.sheetName === activeName) ?? analyzed[0]
  const { columns, rows } = chosen.analysis

  const taken = new Set<string>()
  for (const id of existingIds) {
    const value = text(id)
    if (value) taken.add(value)
  }

  // Token undangan juga harus unik, termasuk terhadap pemilih yang sudah ada.
  const takenTokens = new Set<string>()
  for (const token of existingTokens) {
    const value = normalizeToken(token)
    if (value) takenTokens.add(value)
  }

  const voters: Voter[] = []
  const generatedIds: string[] = []
  let skippedRows = 0
  let duplicateIds = 0

  for (let index = columns.headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const name = text(row[columns.name.index])
    if (!name) {
      if (row.some((cell) => text(cell))) skippedRows += 1
      continue
    }

    const className = columns.className ? text(row[columns.className.index]) || '-' : '-'
    const rawId = columns.id ? idText(row[columns.id.index]) : ''

    if (rawId) {
      if (taken.has(rawId)) {
        duplicateIds += 1
        continue
      }
      taken.add(rawId)
      const token = makeRandomToken(takenTokens)
      takenTokens.add(token)
      voters.push({ id: rawId, name, className, hasVoted: false, token })
      continue
    }

    const autoId = makeRandomVoterId(taken)
    taken.add(autoId)
    generatedIds.push(autoId)
    const token = makeRandomToken(takenTokens)
    takenTokens.add(token)
    voters.push({ id: autoId, name, className, hasVoted: false, token })
  }

  // Semua baris duplikat tetap dianggap berhasil dibaca (voters kosong), agar
  // dashboard bisa memberi tahu "sudah terdaftar" alih-alih "sheet kosong".
  if (!voters.length && duplicateIds === 0) return { ok: false, reason: 'empty', sheetNames }

  return {
    ok: true,
    summary: {
      voters,
      sheetName: chosen.sheetName,
      sheetCount: sheetNames.length,
      usedActiveSheet: chosen.sheetName === activeName,
      columns: {
        id: columns.id?.header,
        name: columns.name.header,
        className: columns.className?.header,
      },
      generatedIds,
      tokensGenerated: voters.length,
      skippedRows,
      duplicateIds,
    },
  }
}

// Nomor identitas hasil generate tidak lagi bisa dikenali dari polanya (10
// digit angka sama seperti NISN asli), jadi dashboard menandai baris yang baru
// dibuat lewat daftar id dari summary impor (lihat tab Pemilih di dashboard).
