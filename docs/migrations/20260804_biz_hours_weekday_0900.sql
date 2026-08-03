-- 2026-08-04 使用者指示（已套用正式庫）：「營業時間也改成平日 9:00 開門」（原 10:00）。
-- 週六日不變（六 09–21、日 09–15）。前端 BUSINESS_HOURS 同步改（同版推送）。
-- 影響範圍：會員自助預約/改期的營業時間守門（fn_biz_hours）、前端自主訓練
-- 可選時段、排班空班檢查（findShiftGaps）、值班缺人提醒。
create or replace function public.fn_biz_hours(p_date date)
returns int[] language sql immutable as $$
  select case extract(dow from p_date)::int
    when 0 then array[540, 900]    -- 週日 09:00–15:00
    when 6 then array[540, 1260]   -- 週六 09:00–21:00
    else array[540, 1320]          -- 週一~五 09:00–22:00（2026-08-04 起，原 10:00）
  end;
$$;
