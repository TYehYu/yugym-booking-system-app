/* 分期第 N 期簽名「什麼時候送出的」（2026-10-03 使用者：
   「［分期繳費］發送後要有提示訊息在票券卡上　不然都要點進去才看到是不是有發送」）

   送出時間本來就有存 —— 在 contracts.installment_signs[].requested_at。
   但那一欄裡放的是 base64 簽名圖，所以它在 LEAN_DROP 裡（列表讀取不搬，
   contracts 56 列就有 1.1MB 幾乎全是簽名圖）。票券卡走的是 dbGetAll，撈不到。

   ⚠ 這就是 0922 已經用 pending_sign_n 解過一次的同一個問題：
     「要在列表上看得到的狀態」必須另外放一個**輕量欄位**，
     不能指望從 LEAN_DROP 的大欄位裡挖。
     pending_sign_n 只回答「第幾期在等簽」，這一欄補上「什麼時候送的」。

   ⚠ 兩欄一起寫、一起清（見 instSignRequest 與簽回那一段）——
     只清掉 n 而留著 at，畫面會變成「沒有待簽、卻有送出時間」。
   ⚠ 舊的待簽紀錄沒有這個值：畫面要能只寫「待簽名」而不寫日期，不可以印出空括號。 */

alter table public.contracts
  add column if not exists pending_sign_at timestamptz;

comment on column public.contracts.pending_sign_at is
  '分期第 pending_sign_n 期的簽名是何時送到會員手機的。與 pending_sign_n 成對寫入與清除，供票券卡（走 dbGetAll，讀不到 LEAN_DROP 裡的 installment_signs）顯示「已發送 MM/DD」。2026-10-03 新增。';

/* 簽回時兩欄一起清 —— fn_member_sign_installment 原本只清 pending_sign_n。
   ⚠ 兩個 case 都看 **舊的** pending_sign_n（同一句 UPDATE 裡 SET 互不影響），
     所以不可以把 pending_sign_at 那行寫成看 pending_sign_n 的新值。 */
create or replace function public.fn_member_sign_installment(p_contract_id text, p_n integer, p_signature text)
 returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare c contracts%rowtype; arr jsonb; idx int; hit jsonb;
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
   where (e->>'n')::int = p_n limit 1;
  if hit is null then return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_PENDING'); end if;
  if (hit->>'signature') is not null then return jsonb_build_object('ok',true,'already',true); end if;
  if coalesce(hit->>'sign_type','remote') <> 'remote' then
    return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_REMOTE');
  end if;
  arr := jsonb_set(arr, array[idx::text],
           hit || jsonb_build_object('signature',p_signature,'signed_at',to_jsonb(now())));
  update contracts
     set installment_signs=arr,
         pending_sign_n  = case when pending_sign_n = p_n then null else pending_sign_n end,
         pending_sign_at = case when pending_sign_n = p_n then null else pending_sign_at end
   where id=c.id;
  return jsonb_build_object('ok',true,'contract_id',c.id,'n',p_n);
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end $function$;
