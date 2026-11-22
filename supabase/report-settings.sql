-- =====================================================================
-- SuaraKita — Pengaturan berita acara (logo, nomor, penanda tangan, NIP)
-- Jalankan sekali di Supabase: Dashboard → SQL Editor → New query.
-- (Idempotent: aman dijalankan berulang kali.)
-- =====================================================================

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
