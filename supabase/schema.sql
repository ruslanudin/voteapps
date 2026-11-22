-- =====================================================================
-- SuaraKita — Schema Supabase (PostgreSQL)
-- Jalankan file ini di Supabase: Dashboard → SQL Editor → New query.
-- (Idempotent: aman dijalankan ulang.)
-- =====================================================================

-- 1) Pengaturan pemilihan (single row)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  school_name text not null default 'SMA Nusantara',
  event_title text not null default 'PEMILIHAN KETUA & WAKIL KETUA OSIS 2026',
  start_date text not null default '2026-11-25T08:00',
  end_date text not null default '2026-11-25T15:00',
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  theme text not null default 'violet' check (theme in ('violet', 'emerald', 'sunset', 'ocean', 'midnight')),
  updated_at timestamptz not null default now()
);

-- 2) Pasangan calon
create table if not exists public.candidates (
  id bigint generated always as identity primary key,
  number text not null unique,
  president text not null default '',
  vice text not null default '',
  color text not null default 'sage' check (color in ('coral', 'sage', 'blue')),
  initials text not null default '',
  photo text,
  vice_photo text,
  profile text not null default '',
  vision text not null default '',
  program text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) Daftar pemilih & status suara
create table if not exists public.voters (
  id text primary key,
  name text not null default '',
  class_name text not null default '',
  has_voted boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Surat suara anonim (tidak ada voter_id agar pilihan tidak bisa
-- dilacak kembali ke identitas pemilih).
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  candidate_number text not null,
  created_at timestamptz not null default now()
);

-- Keamanan: semua akses dilakukan dari server (service role), jadi
-- anon key tidak boleh membaca/menulis langsung. RLS dikunci penuh.
alter table public.settings enable row level security;
alter table public.candidates enable row level security;
alter table public.voters enable row level security;
alter table public.votes enable row level security;

-- 4) Identitas berita acara (logo sekolah, nomor, penanda tangan & NIP)
--    Ditambahkan setelah tabel awal dibuat agar aman dijalankan ulang.
alter table public.settings
  add column if not exists logo text,
  add column if not exists report_number text not null default '',
  add column if not exists report_place text not null default '',
  add column if not exists report_date text not null default '',
  add column if not exists report_chair text not null default '',
  add column if not exists report_chair_nip text not null default '',
  add column if not exists report_secretary text not null default '',
  add column if not exists report_secretary_nip text not null default '',
  add column if not exists report_principal text not null default '',
  add column if not exists report_principal_nip text not null default '',
  add column if not exists report_include_classes boolean not null default false;

-- =====================================================================
-- Seed data awal
-- =====================================================================
insert into public.settings (id, school_name, event_title, start_date, end_date, status, theme)
values (1, 'SMA Nusantara', 'PEMILIHAN KETUA & WAKIL KETUA OSIS 2026', '2026-11-25T08:00', '2026-11-25T15:00', 'active', 'violet')
on conflict (id) do nothing;

insert into public.candidates (number, president, vice, color, initials, profile, vision, program, position)
values
  ('01', 'Nadia Putri Ramadhani', 'Raka Aditya Pratama', 'coral', 'NP', 'Ketua kelas XI IPA 1 yang aktif di ekstrakurikuler debat dan pernah memimpin kegiatan sosial sekolah.', 'Mewujudkan sekolah yang aktif, inklusif, dan menjadi ruang bertumbuh bagi semua.', 'Ruang aspirasi siswa · Jumat berkarya · Pekan olahraga bersama', 1),
  ('02', 'Farhan Maulana', 'Alya Safitri N.', 'sage', 'FM', 'Pengurus OSIS bidang lingkungan yang berpengalaman mengelola proyek kebersihan dan kegiatan berbagi.', 'Membangun OSIS yang dekat, tanggap, dan membawa perubahan nyata.', 'OSIS mendengar · Kelas berbagi · Sekolah minim sampah', 2),
  ('03', 'Keisha Anindya', 'Bima Arya Wijaya', 'blue', 'KA', 'Aktif di teater sekolah dan komunitas literasi; terbiasa membangun kolaborasi lintas kelas.', 'Bersama menciptakan lingkungan sekolah yang kreatif dan berprestasi.', 'Festival kreativitas · Teman belajar · Panggung ekspresi', 3)
on conflict (number) do nothing;

insert into public.voters (id, name, class_name, has_voted)
values
  ('0012345678', 'Siswa Contoh 1', 'XI IPA 1', false),
  ('0087654321', 'Siswa Contoh 2', 'XI IPS 2', false)
on conflict (id) do nothing;

-- =====================================================================
-- Fungsi transaksional: mencatat suara secara atomik & anonim
-- =====================================================================
create or replace function public.cast_vote(p_voter_id text, p_candidate_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pemilihan harus berstatus "active". Status "draft"/"closed" menolak semua
  -- suara, termasuk dari pemilih terdaftar yang belum memakai hak suaranya.
  if not exists (select 1 from public.settings where id = 1 and status = 'active') then
    raise exception 'election_not_open';
  end if;

  if not exists (select 1 from public.voters where id = p_voter_id) then
    raise exception 'voter_not_found';
  end if;

  if not exists (select 1 from public.candidates where number = p_candidate_number) then
    raise exception 'invalid_candidate';
  end if;

  update public.voters
     set has_voted = true, updated_at = now()
   where id = p_voter_id
     and has_voted = false;

  if not found then
    raise exception 'already_voted';
  end if;

  insert into public.votes (candidate_number)
  values (p_candidate_number);
end;
$$;

grant all privileges on public.votes to service_role;
grant execute on function public.cast_vote(text, text) to service_role;

-- Reset pemilihan: hapus semua surat suara anonim & kembalikan status pemilih.
-- Klausa WHERE wajib agar lolos proteksi safe-update Supabase.
create or replace function public.reset_votes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.votes where true;
  update public.voters set has_voted = false where has_voted = true;
end;
$$;

grant execute on function public.reset_votes() to service_role;
