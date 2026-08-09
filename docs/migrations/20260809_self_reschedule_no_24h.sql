-- 2026-08-09 使用者說明會員自助的規則：
--   「會員只能自己修改團體課跟自主訓練。自主訓練取消不扣課，反正使用期限只有七天。
--     團體課 24 小時前可以取消跟請假，24 小時內只能選擇請假（補課券）。」
--
-- 對照之下，自主訓練「改期」還綁著開課前 24 小時 —— 那條規則本來是保護教練的時間，
-- 自主訓練不佔教練（2026-08-01 就是為了這個理由把「取消」的 24 小時拿掉的）。
-- 結果變成：**取消再重約隨時可以，改期反而要 24 小時前** —— 同樣的結果，
-- 寬鬆的那條路開著、嚴格的那條路擋著，而改期其實更好（時段直接換過去，
-- 不會在取消到重約之間被別人搶走）。
--
-- 改成與「取消」同一條界線：原時段還沒開始就可以改。
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_member_self_reschedule';
  if position('< interval ''24 hours''' in d) = 0 then
    raise exception 'fn_member_self_reschedule 的時間限制已不是預期的樣子，請人工確認';
  end if;
  d := replace(d,
    'if ((b.date || '' '' || b.start_time)::timestamp at time zone ''Asia/Taipei'') - now() < interval ''24 hours'' then',
    'if ((b.date || '' '' || b.start_time)::timestamp at time zone ''Asia/Taipei'') <= now() then');
  execute d;
end $do$;
