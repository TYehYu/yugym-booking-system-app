-- ══ 分期第 2 期起要再簽一次名（2026-09-22）══════════════════════════════════════
-- 使用者：「今天黃柏瑜要收第二期　應該要讓他簽第二次」
-- 定版：「紙本第二期還是在紙本　就不用待簽　電子要等待簽才開通」
--
-- 做法（B 案，使用者選的）：不另開一份合約，在**原合約上補一格簽名欄**。
-- 另開合約的話，一位分期三期的會員在「我的合約」會看到三份幾乎一樣的東西，
-- 而且票券只綁得住一份（contracts.ticket_id），對帳與檢視都會分岔。

alter table contracts
  add column if not exists installment_signs jsonb not null default '[]'::jsonb;

comment on column contracts.installment_signs is
  '分期第 2 期起的簽名：[{n,sign_type,requested_at,requested_by,amount,signature,signed_at,by}]。'
  '⚠ 裡面是 base64 簽名圖，前端 LEAN_DROP 會把這一欄排除在列表讀取之外。';

-- 「這份合約現在有第幾期在等簽」的輕量旗標。
-- ⚠ 為什麼不直接讀 installment_signs：那一欄在 LEAN_DROP 裡（contracts 光簽名圖就 1.1MB），
--   而會員端的票券頁走 dbGetAll，撈不到它。列表只需要知道「有沒有、第幾期」。
-- null＝沒有待簽；N＝第 N 期等會員簽。
alter table contracts
  add column if not exists pending_sign_n int;

comment on column contracts.pending_sign_n is
  '第幾期分期簽名正在等會員簽（null=無）。簽名本體在 installment_signs，那一欄走精簡讀取不搬。';

-- ⚠ 刻意只記簽名，**不開通堂數**。開通那一整套（installment.current／unlocked_sessions／
--   回補分期保留預約）住在前端 _confirmInstallNext；在 SQL 再寫一份就會分岔。
create or replace function public.fn_member_sign_installment(
  p_contract_id text, p_n int, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  c contracts%rowtype;
  arr jsonb;
  idx int;
  hit jsonb;
begin
  select * into c from contracts where id=p_contract_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','CONTRACT.NOT_FOUND'); end if;
  if current_member_id() is null or c.member_id <> current_member_id() then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
  end if;
  if p_signature is null or length(p_signature) < 200 then
    return jsonb_build_object('ok',false,'error_code','SIGNATURE.INVALID');
  end if;

  arr := coalesce(c.installment_signs,'[]'::jsonb);
  select i, e into idx, hit
    from jsonb_array_elements(arr) with ordinality t(e,ord), lateral (select ord-1) s(i)
   where (e->>'n')::int = p_n
   limit 1;

  -- 櫃檯沒按過〔送出待簽〕就簽不了：期數與金額由櫃檯決定，不讓會員端自己開一格。
  if hit is null then return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_PENDING'); end if;
  if (hit->>'signature') is not null then return jsonb_build_object('ok',true,'already',true); end if;
  if coalesce(hit->>'sign_type','remote') <> 'remote' then
    return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_REMOTE');
  end if;

  arr := jsonb_set(arr, array[idx::text],
           hit || jsonb_build_object('signature',p_signature,'signed_at',to_jsonb(now())));
  update contracts
     set installment_signs=arr,
         pending_sign_n = case when pending_sign_n = p_n then null else pending_sign_n end
   where id=c.id;
  return jsonb_build_object('ok',true,'contract_id',c.id,'n',p_n);
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end $$;

revoke all on function public.fn_member_sign_installment(text,int,text) from public;
grant execute on function public.fn_member_sign_installment(text,int,text) to authenticated;
