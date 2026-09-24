/* training_logs 加排序欄位（2026-09-25）

   使用者：「現在上課寫訓練課表的時候　可以拖移調整順序嗎」
   情境：「紀錄的當下　已經寫完紀錄發現動作1跟2順序反了」
   —— 兩筆都已經存進 DB，但人還在課上，要能當場改掉。

   原本完全靠 created_at 排（0923 使用者定的「按照教練紀錄的順序」），
   時間戳不該為了排序被竄改（同一秒記兩筆就會打架、歷史也失真），所以另開一欄。

   ⚠ 回填之後**不會有 null**：新增紀錄時就帶 seq，拖曳時整堂重排成 1..N。
     保留 nullable 只是為了讓這支 migration 能分兩段跑，以及萬一有漏網的舊資料。
   ⚠ 分組鍵是 (booking_id, slot)：1V2 的第二位借掛在第一位的 member_id 上，
     兩位的紀錄在同一個 booking 裡各排各的（見記憶 yugym-1v2-slot）。
     slot 只有 1／2／null，null 與 1 是同一位（0915 的慣例）。 */

alter table training_logs add column if not exists seq smallint;

/* 舊資料回填：每一堂課（含 1V2 的每一位）照 created_at 給 1..N */
with ranked as (
  select id,
         row_number() over (
           partition by booking_id, coalesce(slot, 1)
           order by created_at, id
         ) as rn
  from training_logs
)
update training_logs t
set seq = r.rn
from ranked r
where t.id = r.id and t.seq is distinct from r.rn;

/* 讀取端一律 order by seq, created_at —— 加個索引省得每次排序 */
create index if not exists training_logs_bk_seq_idx
  on training_logs (booking_id, seq);
