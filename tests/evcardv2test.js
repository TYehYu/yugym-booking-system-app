/* 行事曆課卡狀態語彙改版（2026-09-03 使用者連續五條指示）

   「行事曆課卡資訊 會員姓名 場地 教練姓名 時間 出席章移除
     當天課卡如果有簽到就在旁邊加上一個綠色的框 未出席就加一個金色的框
     目前金色框的定義是今日新增或調整的課卡改成右上角[New]」
   「過期(當天不算)或沒有待簽約的課卡就暗化」
   「移除課卡紅色框的提示 看到暗化的課卡就知道這張要注意了」
   「待繳費的課卡加一個標籤[PAY]」

   整理成三種互不重疊的通道，各自回答不同的問題：
     外框（只有當天）→「這堂上完了沒」：綠＝已簽到、金＝未出席、無框＝還沒發生
     暗化           →「這張要注意」：過期（不含今天）或待簽約
     右上角標籤      →「為什麼要注意」：[New] 今日新增或調整、[PAY] 錢還沒收 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 出席章移除（只在桌機，DOM 留著）');
ok('★★★ 桌機隱藏出席章', /\.cal-ev\.cal-ev-std \.evc-check\{ display:none; \}/.test(src));
ok('★★★ DOM 沒被拿掉（手機行事曆與管理員一日還在用同一份）',
   /<span class="evc-nmrow">.*?\$\{_stampOut\}<\/span>/.test(src)
   && /只在桌機隱藏，DOM 留著 —— 手機行事曆（\.cag-wk-col）與管理員一日（\.admcag）/.test(src));
ok('★★ 頂列預留高度跟著從 22px 收到 18px（章不見了就不必留那麼多）',
   /\.cal-ev\.cal-ev-std \.evc-txt\{ padding-top:18px !important; \}/.test(src));
ok('★★ 章與時間互相讓位那組規則一併移除（沒有章就沒有那個問題）',
   !/:not\(\.ev-onhour\) \.evc-check\{ left:9px/.test(src)
   && !/:not\(\.ev-onhour\) \.evc-check\{ left:50%/.test(src));

console.log('\n② 當天課卡的出席外框');
ok('★★★ 只有當天才掛（過去用暗化、未來還沒發生）',
   /const _isTodayCard = \(ds===ymd\(TODAY\)\);/.test(src)
   && /const _alertCls = !_isTodayCard \? ''/.test(src));
ok('★★★ 已簽到→綠、未出席→金',
   /\(\(_isCheckedIn\|\|_isMakeup\) \? ' cal-ev-mkin'/.test(src)
   && /\(\(b\.status!=='cancelled' && b\.no_show===true\) \? ' cal-ev-mkno' : ''\)\)/.test(src));
ok('★★★ 未出席看的是 no_show 旗標，不是「時間過了還沒簽到」',
   /未出席看的是 no_show 這個明確的旗標，不是「時間過了還沒簽到」——\s*\n?\s*後者在課上到一半時就會亮，等於誤報/.test(src));
ok('★★★ 基本樣式有這兩條（2px 實框＋1px inset，沿用原本紅框金框的量體）',
   /\.cal-ev\.cal-ev-std\.cal-ev-mkin \.evc-body\{\s*\n\s*border:2px solid var\(--green,#1f6f54\) !important;/.test(src)
   && /\.cal-ev\.cal-ev-std\.cal-ev-mkno \.evc-body\{\s*\n\s*border:2px solid var\(--gold-d,#b48a56\) !important;/.test(src));
/* ⚠ 第三次踩同一個坑：只寫 .cal-ev.cal-ev-std.X .evc-body（0,3,0）改不動畫面，
   因為 body.ink 那條基本樣式是 (0,3,1) 又寫在後面。 */
ok('★★★ Ink 也要接一次，否則畫面上等於沒改',
   /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-mkin \.evc-body\{/.test(src)
   && /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-mkno \.evc-body\{/.test(src)
   && /這一段是\*\*第三次\*\*踩同一個坑/.test(src));
/* ⚠ Ink 的 --green 是深褐（#4A3B2E，主題的墨色），不是綠 —— 照抄會畫出褐框。 */
ok('★★★ Ink 的綠框用 --olive，不是 --green',
   /body\.ink \.cal-ev\.cal-ev-std\.cal-ev-mkin \.evc-body\{\s*\n\s*border:2px solid var\(--olive,#556B45\) !important;/.test(src)
   && /Ink 的 --green 是\*\*深褐\*\*（#4A3B2E，主題的墨色），不是綠/.test(src));
ok('★★ 底色不動（0729 三修定的原則：只加外框，不改課程色）',
   /底色完全不動 —— 課卡維持自己的課程色（0729 三修定的原則，不要回頭改成填滿）/.test(src));

console.log('\n③ 紅框退場');
ok('★★★ 桌機不再產生 cal-ev-renew／cal-ev-newtoday',
   !/const _alertCls = _isUnpaid \? ' cal-ev-renew'/.test(src));
/* CSS 要留：renderCoachAgenda（手機教練行事曆）還在掛這兩個 class。 */
ok('★★★ CSS 留著但標明「現在只服務手機」',
   /\.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{/.test(src)
   && /這兩條現在\*\*只服務手機\*\*（renderCoachAgenda 仍會掛 cal-ev-renew／cal-ev-newtoday）/.test(src));
ok('★★ 手機那支沒被順手改掉',
   /const _mkAlert = _unpaidM \? ' cal-ev-renew' : \(_newM \? ' cal-ev-newtoday' : ''\);/.test(src));

console.log('\n④ 暗化＝這張要注意');
ok('★★★ 過期（當天不算）或待簽約 → 暗化',
   /const _pastCls = bkDarkNoTicket\(b\) \? 'cal-ev-dark'\s*\n\s*: \(_cardDate < _todayYmd \|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));
ok('★★★ 推翻 0801「未完成的過去課卡不淡化」這件事寫在原地',
   /這一條推翻了 0801 的「未完成的過去課卡不淡化」/.test(src)
   && /要恢復「沒處理的舊卡跳出來」，把 _settled 那組判斷接回來/.test(src));
ok('★★★ 刻意不用 _isPastCard（它含「今天但已結束」，使用者明說當天不算）',
   /_isPastCard 含「今天但已結束」，這裡刻意\*\*不用\*\*它 —— 使用者明說當天不算/.test(src));
/* 算了卻沒人讀的變數＝雜訊，這個專案為此吃過虧（0902 的「訓練架·兩台」防呆）。 */
ok('★★ 沒人用的 _isPastCard 整段移除，不留死變數',
   !/let _isPastCard = false;/.test(src)
   && /整段移除，\s*\n?\s*不留一個算了卻沒人讀的變數/.test(src));

console.log('\n⑤ 右上角兩個標籤');
ok('★★★ [New]＝今日新增**或調整**（靠 0903 補的 updated_at 欄位）',
   /const _isNewToday = String\(b\.created_at\|\|''\)\.slice\(0,10\)===ymd\(TODAY\)\s*\n\s*\|\| String\(b\.updated_at\|\|''\)\.slice\(0,10\)===ymd\(TODAY\);/.test(src));
ok('★★★ [PAY]＝待簽約卡位或分期本期最後一堂',
   /const _tagPay = \(!hideMember && \(_isUnpaid \|\| _payAlert\)\)/.test(src));
ok('★★★ 遮蔽卡不標（會洩漏別人的收款狀態）',
   /const _tagNew = \(!hideMember && _isNewToday\)/.test(src)
   && /遮蔽卡（教練看別人的課）不標：那會洩漏別人的收款狀態/.test(src));
ok('★★ 兩個都在時 New 最右、PAY 讓一格',
   /\.cal-ev\.cal-ev-std\.ev-has-new \.ev-tag-pay\{right:40px;\}/.test(src));
ok('★★ 時間跟著往左讓，讓不下就不印（標籤是要處理的事，優先於脈絡）',
   /\.cal-ev\.cal-ev-std\.ev-has-new\.ev-has-pay \.evc-time\{ right:74px; \}/.test(src)
   && /@container \(max-width:110px\)\{[\s\S]{0,200}?\.evc-time\{ display:none; \}/.test(src));
ok('★★ 極窄卡兩個掛不下時，[PAY]（錢）優先於 [New]（覆核）',
   /@container \(max-width:78px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.ev-has-new\.ev-has-pay \.ev-tag-new\{display:none;\}/.test(src));
ok('★★ 標籤不吃點擊（它是狀態不是按鈕）',
   /\.cal-ev\.cal-ev-std \.ev-tag2\{[\s\S]{0,120}?pointer-events:none;/.test(src));
ok('★★ 沒有 updated_at 的舊資料只會靠 created_at 判斷，這個限制寫在原地',
   /在那之前建立的預約沒有 updated_at，只會靠 created_at 判斷「今日新增」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
