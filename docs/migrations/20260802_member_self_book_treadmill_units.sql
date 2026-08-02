/* 會員自助預約跑步機可以選要幾台（2026-08-02 使用者指示：
   「只要會連動上行事曆、影響其他人預約場地的地方，都要補上要預約幾台」）
   已套用到正式庫；完整內容見 Supabase migration
   20260802_member_self_book_treadmill_units。

   重點：
   ・fn_member_self_book 多一個 p_units（預設 1，舊呼叫端不受影響）
   ・第 2 台起以 sibling_of 指回主預約、不另外扣點（與櫃檯端 bkAddTreadmillUnits 同規則）
   ・台數不信任前端：DB 自己查該時段還空著哪幾台，只開得成幾台就幾台，
     回傳 units 讓前端照實告知（想約兩台但被別人搶走時不會謊報）
   ・櫃檯通知的內容會標「（跑步機 N 台）」
*/
