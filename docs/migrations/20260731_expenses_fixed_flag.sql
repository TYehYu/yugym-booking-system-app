/* 財務「其他支出」分頁要分開列固定支出與其他支出（2026-07-31 使用者指示）
   固定＝每月都會發生（房租、水電、網路、清潔）；其他＝一次性（耗材、設備、稅務規費…）。 */
alter table public.expenses add column if not exists is_fixed boolean not null default false;
