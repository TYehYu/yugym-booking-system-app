-- 回復：團課取消單一名額原子化（只移除三個函式；不動任何資料。回復前前端必須已退回舊版，否則「取消名額」會失敗）
drop function if exists public.fn_cancel_group_seat(text, text, text, text);
drop function if exists public.fn_group_seat_rev(text);
drop function if exists public.fn_seat_map_reindex(jsonb, text[], text[], integer);
