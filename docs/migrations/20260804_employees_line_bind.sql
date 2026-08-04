-- 2026-08-04 員工 LINE 綁定（使用者指示：「教練綁定 line 通知，製作一個 QRCode 在
-- 管理員員工資料[綁定 line]，點開讓員工用 line 的掃描後點授權」）
--
-- 教練不從 LINE 登入系統（登入走員工帳號密碼），所以拿不到 LINE userId。
-- 改由管理員在員工資料產一次性 line_bind_token → QR（#staff-line-bind=TOKEN）→
-- 員工用 LINE 掃描並授權 → Edge Function line-member-auth（action='staff_bind'）
-- 驗完 LINE ID token 後，憑 token 找到這一位員工，把 LINE userId 寫進 line_user_id
-- 並清掉 token（用完即失效）。
--
-- 綁定後 line-push-daily v7 會在會員快上完票（剩 ≤2 堂）或分期已開通堂數用到
-- 最後一堂時，同步推一則收款提醒給該教練本人。
--
-- 安全性：line_bind_token 是一次性隨機碼，寫入與清除都由 service_role 進行；
-- employees 的 RLS 維持原樣（櫃檯以上或本人可 update），不需新增策略。
alter table public.employees
  add column if not exists line_user_id text,
  add column if not exists line_bind_token text;
