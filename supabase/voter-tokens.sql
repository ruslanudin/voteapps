-- =====================================================================
-- SuaraKita — Token undangan pemilihan
-- Jalankan sekali di Supabase: Dashboard → SQL Editor → New query.
-- (Idempotent: aman dijalankan berulang kali.)
--
-- Setiap pemilih mendapat token 6 karakter yang tercetak pada surat
-- undangan. Saat memilih, siswa memasukkan NISN/NIS + token tersebut.
-- =====================================================================

alter table public.voters
  add column if not exists token text not null default '';

-- Satu token hanya boleh dipakai satu pemilih.
create unique index if not exists voters_token_unique
  on public.voters (token)
  where token <> '';

-- Isi token untuk pemilih yang belum punya. Alfabet sama dengan aplikasi:
-- tanpa 0/O, 1/I/L agar mudah diketik ulang dari kertas undangan.
do $$
declare
  voter record;
  candidate text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for voter in select id from public.voters where coalesce(token, '') = '' loop
    loop
      candidate := '';
      for i in 1..6 loop
        candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
      end loop;
      exit when not exists (
        select 1 from public.voters where token = candidate
      );
    end loop;

    update public.voters set token = candidate where id = voter.id;
  end loop;
end $$;
