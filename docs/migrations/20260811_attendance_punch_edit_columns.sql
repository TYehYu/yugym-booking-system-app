-- 2026-08-11（已於當日套用正式庫）：櫃檯「補登／修改打卡」跳錯誤
-- openPunchEdit／savePunchEdit（2026-08-02 上線）寫入 note（備註）、fixed_by、fixed_at（補登留痕），
-- 但當時漏了 migration，attendance 沒有這三個欄位 → PostgREST 拒絕整筆 upsert。
-- 只寫既有欄位的「補登下班」（fixPunchOut）不受影響，所以拖到 2026-08-10 翁立安整天補登才爆。
alter table public.attendance
  add column if not exists note text,
  add column if not exists fixed_by text,
  add column if not exists fixed_at timestamptz;
