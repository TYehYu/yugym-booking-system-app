/* ══ 新表的 migration 範本（2026-09-25 建立）═══════════════════════════════
   起因：Supabase 公告 —— 自 2026/10/30 起，public schema 中**新建立的 table**
   不再自動取得 Data API 的存取權限。之後才建的表（含 migration 建立、
   preview branch、本機 supabase db reset 重建）都必須明確 GRANT，
   否則 Data API 存取時會 permission denied。

   ⚠⚠ 現有的表不受影響，既有 grants 會保留 —— **不要為了這次更新去動它們**。
     （0812 就是被一次大範圍 REVOKE 害到：service_role 在 30 張表只剩
       REFERENCES/TRIGGER/TRUNCATE，Edge Function 讀寫悄悄失效，
       而失敗通知也被 catch 吞掉，完全無跡可循。見 20260812_restore_service_role_grants.sql）

   ══ 照抄這一份，把 <新表> 換掉 ═══════════════════════════════════════════

   -- ① 建表
   create table if not exists public.<新表> (
     id text primary key,
     ...
     created_at timestamptz not null default now()
   );

   -- ② RLS（一定要開；沒開 RLS 的表等於門戶大開）
   alter table public.<新表> enable row level security;

   -- ③ GRANT ← 2026/10/30 之後**不寫就是不能用**
   grant select, insert, update, delete on public.<新表> to authenticated;
   grant select, insert, update, delete on public.<新表> to service_role;

   -- ④ Policy：真正的權限在這裡，GRANT 只是「能不能碰到這張表」
   create policy <表>_staff on public.<新表>
     for all using (is_staff_desk()) with check (is_staff_desk());

   ══ 三個角色怎麼分 ═════════════════════════════════════════════════════

   authenticated  登入後的所有人（會員／教練／櫃檯／管理員都是這一個）。
                  ⚠ YUGYM 的身分判斷**全部靠 RLS policy**（is_admin()／
                    is_staff_desk()／current_member_id() 那一組），
                    不是靠 Postgres role —— 所以這裡一律給四個權限，
                    誰能看到哪幾列由 policy 決定。
   service_role   Edge Function 用（line-push-daily、create-staff-account…）。
                  ⚠ **一定要給**，而且它繞過 RLS。漏掉的症狀很難認：
                    SELECT 失敗會被 dbGetAll 的 catch 吞掉（回空陣列），
                    畫面只是「還沒有資料」，一直到 INSERT 才爆權限不足。
   anon           **未登入**的人。預設一律不給。
                  ⚠ 公告第 3 點明講「請勿直接把所有 table 全部開放給 anon」。
                  ⚠ 目前 22 張舊表 anon 有四個權限，那是 baseline 時代
                    （Supabase 預設就給）留下來的，靠 RLS policy 的
                    `auth.uid() IS NOT NULL` 擋著。**歷史照舊、新表不要跟進。**
                  真的需要「未登入就要讀」時才給，而且只給 select、
                  並在這裡寫清楚為什麼（目前全庫沒有這種表）。

   ══ 檢查 ═══════════════════════════════════════════════════════════════
   tests/migrationgranttest.js 會掃 docs/migrations/*.sql：
   只要有 create table 就必須有對應的 grant，漏了會紅。
*/
