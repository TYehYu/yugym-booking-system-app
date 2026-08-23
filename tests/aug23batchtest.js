/* 2026-08-23 連續指示批次
   ① 教練薪資單：移除特休卡、明細每一項一個白框、移除「實領薪資」列、四格 KPI 一列
   ② 會員的「修改密碼」在角色預覽下也要消失
   ③ 頂欄字標依身分分色：店長以上＝紅、教練（含櫃檯）＝金、會員＝綠
   ④ 一日行事曆：整點刻度壓在線上（仿七日）、課卡去掉時間、改放教練名
   ⑤ 桌機首頁：課卡收窄到 165px、月曆移除每日課堂數
   （日期列「放開才換頁」由 weeksnaptest／admh2test 守著，不重複。） */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('① 教練薪資單');
ok('★★ 特休卡整組移除（使用者：「特休在個人資料這邊就有顯示」）',
   !/特休 · \$\{TODAY\.getFullYear\(\)\} 年度/.test(src)
   && /特休卡片已移除（2026-08-23 使用者指示/.test(src));
ok('　　個人資料那一份特休帳還在（移除的是重複的那一份，不是功能）',
   /🌴 我的特休（\$\{yr\} 年度）/.test(src)
   && /function annualLeaveAccount/.test(src));
ok('★ 明細不再列「實領薪資」（最上方 .sal-hero 已經是同一個數字）',
   !/h\+=row\('實領薪資'/.test(src)
   && /實領薪資這邊可以移除，最上方就有了/.test(src));
ok('　　「應領合計」留著（那個不是重複的）',
   /h\+=row\('應領合計'/.test(src));
ok('★★ 明細每一項一個白框：外圈米底、每列白底圓角',
   /\.sal-details-card \.sal-rows\{background:var\(--card2\);border:1px solid var\(--bd\);border-radius:12px;/.test(src)
   && /\.sal-details-card \.sal-row\{background:#fff;border:1px solid var\(--bd\);border-radius:10px;/.test(src));
ok('　　註解列（.sal-note）不給框，留在米底上當附註',
   /\.sal-details-card \.sal-note\{padding:0 4px 2px 18px;/.test(src));
ok('★ 四格 KPI 一律四個一列（.dash-sum 在窄螢幕本來會落成兩欄）',
   /<div class="dash-sum sal-kpi4" style="margin-bottom:14px;">/.test(src)
   && /\.dash-sum\.sal-kpi4\{grid-template-columns:repeat\(4,1fr\);gap:6px;\}/.test(src));
ok('　　四個一列要縮字級才塞得下（.ds-num 24→20px、標籤不換行）',
   /\.dash-sum\.sal-kpi4 \.ds-num\{font-size:20px;\}/.test(src)
   && /\.dash-sum\.sal-kpi4 \.ds-lb\{font-size:10\.5px;[^}]*white-space:nowrap;\}/.test(src));
ok('　　其他用到 .dash-sum 的地方（教練首頁今日摘要）不受影響',
   /\.dash-sum\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(0,1fr\)\);/.test(src));

console.log('\n② 會員的「修改密碼」在角色預覽下也要消失');
ok('★★ 改在 syncAcctMenuItems 每次開選單重算（原本只在登入流程設一次）',
   /const pw=document\.getElementById\('acct-changepw'\);\s*\n\s*if\(pw\) pw\.style\.display = \(role==='member'\)\?'none':'';/.test(src));
ok('　　「個人資料」同一個毛病，一起搬過來',
   /const prof=document\.getElementById\('acct-profile'\);\s*\n\s*if\(prof\) prof\.style\.display = \(role==='member'\|\|role==='coach'\|\|isDeskLike\(\)\)\?'':'none';/.test(src));
ok('　　成因寫在註解裡（角色預覽換了 SESSION.role，卻沒重算這兩項）',
   /管理員用「角色預覽」切成會員時 SESSION\.role 換了、/.test(src));

console.log('\n③ 頂欄字標依身分分色');
ok('★★ 顏色收斂成一個變數 --lgc，不在各外框各寫一份',
   /#app-screen\.lgtier-red\{--lgc:var\(--red,#7A2E28\);\}/.test(src)
   && /#app-screen\.lgtier-gold\{--lgc:var\(--gold\);\}/.test(src)
   && /#app-screen\.lgtier-green\{--lgc:var\(--green\);\}/.test(src)
   && /\.topbar \.tb-mark\{[^}]*color:var\(--lgc,var\(--gold\)\);\}/.test(src));
ok('★ 店長以上＝紅、會員＝綠、其餘（教練／櫃檯）＝金',
   /const boss = SESSION\.role==='admin' \|\| !!SESSION\.is_manager;/.test(src)
   && /const tier = boss \? 'red' : \(SESSION\.role==='member' \? 'green' : 'gold'\);/.test(src));
ok('★ 登入與角色預覽兩處都要套（預覽切過去顏色要跟著換）',
   (src.match(/applyLogoTier\(\);/g)||[]).length>=2);
ok('★★ 三個淺色頂欄各自把 !important 的顏色換成 var(--lgc)',
   /body\.chv2-shell \.topbar \.tb-mark span\{color:var\(--lgc,var\(--gold\)\) !important;\}/.test(src)
   && /body\.memh2-shell \.topbar \.tb-mark span\{color:var\(--lgc,var\(--green\)\) !important;\}/.test(src)
   && /\.role-admin \.topbar \.tb-mark span\{color:var\(--lgc,var\(--gold\)\) !important;\}/.test(src));
ok('★★ 綠底頂欄（櫃檯、走舊版頁的教練/會員）字標必須維持米白 —— 那條 !important 沒被動到',
   /\.topbar \.tb-mark span\{color:#F4F1E8 !important;\}/.test(src)
   && /深紅深金落在深綠底上會看不見/.test(src));

console.log('\n④ 一日行事曆');
ok('★★ 整點刻度從「格子正中央」移到「整點那條線上」（仿七日檢視）',
   /gtop\+=`<div class="cag-gline-label" style="top:\$\{top\}px;">\$\{String\(h\)\.padStart\(2,'0'\)\}:00<\/div>`;/.test(src)
   && !/if\(h<endH\) gbg\+=`<div class="cag-gline-label" style="top:\$\{top\+HOUR_H\/2\}px;"/.test(src));
ok('★★ 刻度要另開一層蓋在課卡之上 —— 背景層是 z-index:0、課卡是 2，留在背景層會被蓋掉',
   /<div class="cag-gtop">\$\{gtop\}<\/div>/.test(src)
   && /\.cag-gtop\{position:absolute;left:10px;right:10px;top:0;bottom:0;pointer-events:none;z-index:5;\}/.test(src));
ok('　　線上的字不能有底色（會變成擋住課卡的白板）→ 用四向白色描邊',
   /\.cag-gtop \.cag-gline-label\{opacity:1;background:transparent;padding:0;/.test(src)
   && /text-shadow:0 0 3px #fff,0 0 3px #fff,1px 1px 0 #fff/.test(src));
ok('　　pointer-events:none：點擊照樣落在底下的課卡',
   /\.cag-gtop\{[^}]*pointer-events:none/.test(src));
ok('★★ 刻度落在「自己的課／其他人的課」中間那條分隔線上，不是整條線的正中央'
   +'（使用者：「時間線改到左邊課卡分隔線這一欄」）',
   /\.cag-gtop \.cag-gline-label\{left:calc\(\(100% - 5px\) \* var\(--cagsplit,0\.3333\) \+ 2\.5px\);\}/.test(src));

console.log('\n④-2 一日行事曆欄寬 4:3:3');
/* 沿革：0726 mine 2 : rest 4 → 0823 一修 mine 1 : rest maxLanes（跟教練等寬，但別人課一多
   我的就被壓縮）→ 0823 定版 4:6 兩個都是常數，我的課卡寬度完全不隨張數變。 */
ok('★★ mine 與 rest 都是常數（我的課卡維持固定大小，不隨當天張數變）',
   /const CAG_MINE_F=4, CAG_REST_F=6;/.test(src)
   && /style="height:\$\{gridH\}px;flex:\$\{CAG_MINE_F\} 1 0;"/.test(src)
   && /style="height:\$\{gridH\}px;flex:\$\{CAG_REST_F\} 1 0;"/.test(src));
ok('　　CSS 保底值與行內值一致（4:6），不要一邊改一邊沒改',
   /\.cag-wk-col\.cag-col-mine\{flex:4 1 0;\}/.test(src)
   && /\.cag-wk-col\.cag-col-rest\{flex:6 1 0;\}/.test(src));
ok('★★ 右側那 6 格由 N 條 lane 均分 → 兩張就是 4:3:3、張數愈多愈窄',
   /let maxLanes=0;/.test(src)
   && /if\(unit>maxLanes\) maxLanes=unit;/.test(src)
   && /2 張＝3 格（＝標題說的 4:3:3）/.test(src));
ok('★★ 分隔線比例跟著欄寬（0.4）寫成 --cagsplit 掛在 .cag-weekgrid 上',
   /const _cagSplit=0\.4;/.test(src)
   && /--cagsplit:\$\{_cagSplit\};/.test(src)
   && /\.cag-weekgrid\{position:relative;display:flex;gap:5px;padding:0 10px;\}/.test(src));
ok('★★ 窄到放不下橫排姓名 → 直書、只留姓名',
   /@container \(max-width: 62px\)\{/.test(src)
   && /writing-mode:vertical-rl;text-orientation:upright;/.test(src)
   && /\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-sub,\s*\n\s*\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}/.test(src));
ok('★★ 用 @container 不是 @media —— 決定要不要轉的是這張卡多寬，不是螢幕多寬',
   /⚠ 用 @container 而不是 @media：決定要不要轉的是\*\*這張卡多寬\*\*，不是螢幕多寬。/.test(src)
   && /\.cal-ev\.cal-ev-std\{container-type:size;\}/.test(src));
ok('★★ 管理員專屬的欄寬覆蓋退場（管理員跟教練統一），分隔線改成兩邊共用',
   !/\.role-admin \.cag-wk-col\.cag-col-mine\{flex:1\.5 1 0;/.test(src)
   && /\.cag-wk-col\.cag-col-mine\{border-right:1\.5px solid rgba\(120,110,95,\.35\);padding-right:4px;\}/.test(src));
/* showTime 這個名字別處（.wkx-* 那組週檢視）也有，只查一日檢視 renderCard 那一段 */
const _dayCard=src.slice(src.indexOf("  const renderCard=(b,layer,dim,pos)=>{"),
                         src.indexOf("  // 每欄整點槽背景（淡化方塊，標示每個整點時段範圍）"));
ok('★★ 課卡拿掉時間（showTime／.evc-time 都不畫了）',
   _dayCard.length>500 && !/showTime/.test(_dayCard) && !/evc-time/.test(_dayCard)
   && /<div class="evc-txt"><span class="evc-name">\$\{disp\}<\/span>/.test(_dayCard));
ok('★ 右下角標籤改放教練名；沒有教練的課（自主訓練／場租）才退回場地',
   /const _coNm = _co \? coachDisp\(_co\) : '';/.test(src)
   && /:\(_venue\?`<span class="evc-coach" style="background:\$\{_ccol\.bg\};color:\$\{_ccol\.fg\};">\$\{_venue\}<\/span>`:''\)\);/.test(src));
ok('★★ 手機不能用桌機那組 .co-fl／.co-ab 雙寫法 —— 那兩條 display 規則在 @media(min-width:601px) 裡，'
   +'手機會兩個都顯示成「RANDY RA」',
   /那兩條 display 規則寫在\s*\n?\s*@media\(min-width:601px\) 裡，手機兩個都會顯示成「RANDY RA」/.test(src));
ok('　　教練請假紅標仍在（那是狀態，不是時間）',
   /bkIsCoachLeave\(b\) \? `<span class="evc-coach" style="background:#7A2E28;color:#F4F1E8;">請假<\/span>`/.test(src));

console.log('\n⑤ 桌機首頁');
ok('★ 課卡從 190px 收窄到 165px',
   /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src));
ok('　　內距與欄距一起收（10\\/9\\/10\\/11→9\\/7\\/9\\/10、7→6）',
   /gap:0 6px;align-items:center;padding:9px 7px 9px 10px;\}/.test(src));
ok('★★ 收窄的底線寫進註解：中欄要留 ~76px 給「多功能訓練架」，再窄就先切到場地那一列',
   /場地「多功能訓練架」六個字 ×11px ≒ 66px 剛好不截斷/.test(src)
   && /再往下收就會先切到場地那一列/.test(src));
ok('　　會員姓名折兩行的規則還在（「蔡美芬 吳吉琇」「蕭育筑（媽媽）」要放得下）',
   /word-break:keep-all; line-break:strict; overflow-wrap:anywhere;\}/.test(src)
   && /-webkit-line-clamp:2/.test(src));
ok('★ 月曆每一格底下的課堂數膠囊移除，只留日期',
   /<span class="mc-d">\$\{d2\}<\/span><\/div>`\);/.test(src)
   && !/<span class="mc-d">\$\{d2\}<\/span><span class="mc-dot/.test(src));
ok('　　課種明細仍留在 title（滑鼠停留看得到）',
   /title="\$\{ds\}\$\{_tipOf\(ds\)\?'　'\+_tipOf\(ds\):'　沒有預約'\}"/.test(src));

console.log('\n⑦ 通知設定：內嵌開關，管理員也有');
ok('★★ 跳視窗那一套整組移除（openNotifSettings／saveNotifSettings）',
   !/function openNotifSettings/.test(src) && !/function saveNotifSettings/.test(src)
   && /通知設定視窗（openNotifSettings／saveNotifSettings）於 2026-08-23 整組移除/.test(src));
ok('★ 按鈕本身不再帶 onclick（整列不開視窗）',
   /<button class="tb-acct-item" id="acct-notif" style="display:none;">/.test(src));
ok('★★ 管理員也要有（使用者：「第一列是通知設定，管理員應該也要有」）',
   /if\(notif\) notif\.style\.display = \(role==='coach'\|\|role==='member'\|\|role==='admin'\)\?'':'none';/.test(src));
ok('　　櫃檯沒加：兩支 Edge Function 都不推給櫃檯，給他關不到東西的開關只是誤會',
   /櫃檯沒有加進來：/.test(src));
ok('★★ 三種身分共用同一顆內嵌開關（不再只判 role===member）',
   /if\(notif && notif\.style\.display!=='none'\)\{/.test(src)
   && /acctQuickNotifToggle\(sw\)/.test(src));
ok('★★ 目前值：會員讀 _meMember、員工讀 _meStaff，兩邊都是 opt-out（沒有值＝開著）',
   /const _me = \(role==='member'\) \? window\._meMember : window\._meStaff;/.test(src)
   && /const on=!\(_me && _me\.line_notify===false\);/.test(src));
ok('★★ 寫入改走 fn_set_line_notify（那支同時認員工與會員），不再前端自己決定寫哪張表',
   /const \{data,error\}=await sb\.rpc\('fn_set_line_notify',\{p_on:next\}\);/.test(src)
   && /dbCacheClear\(\[isMem\?'members':'employees'\]\);/.test(src));
ok('　　失敗要把開關扳回去（不要讓畫面說謊）',
   /sw\.classList\.toggle\('on', !next\); sw\.setAttribute\('aria-checked', String\(!next\)\);/.test(src));

console.log('\n⑥ 桌機行事曆底色');
ok('★★ 整片底色白→米（使用者：「不要用白色，因為卡片就白色了」）',
   /\.cal-body\{display:flex;overflow:auto;flex:1;min-height:0;background:var\(--bg\);/.test(src)
   && /課卡是 #FBFAF5 的白，鋪在白底上等於沒有邊界/.test(src));
ok('★★ 兩個 sticky 圖層要一起改，否則捲動時露出白柱／白條',
   /\.cal-timecol\{[^}]*background:var\(--bg\);\}/.test(src)
   && /\.cal-daycol-head\{[^}]*background:var\(--bg\);/.test(src));
ok('　　今天那一欄的欄頭仍是自己的淡金底（不被統一底色蓋掉）',
   /\.cal-daycol-head\.today\{background:#f3efe2;\}/.test(src));

console.log('\n⑧ 桌機行事曆「營業前」列收斂成一顆金色 [+]');
ok('★★ 每欄不再重複寫「營業前 ＋」，只留一顆置中的金色加號',
   /\.cal-early-add\{display:flex;align-items:center;justify-content:center;gap:0;padding:0;\s*\n\s*font-size:11px;color:var\(--gold,#B48A56\);/.test(src));
ok('★★ 文字用 CSS 藏（不是從 HTML 拿掉）—— 讀屏還要念得出這顆加號是什麼',
   /\.cal-early-add \.cea-label\{position:absolute;width:1px;height:1px;overflow:hidden;/.test(src)
   && /<span class="cea-label">營業前<\/span><span class="cea-plus">＋<\/span>/.test(src));
ok('　　點擊行為沒變（照樣開 08:30、可改 08:00）',
   /onclick="quickBookAt\('\$\{ds\}','08:30'\)"/.test(src));

console.log('\n⑨ 營運分析');
ok('★★ 移除頁面標題（使用者：「太佔畫面空間了」）',
   /移除上方標題 營運分析，太佔畫面空間了/.test(src)
   && !/C\.innerHTML=head\('ANALYTICS','營運分析',''\)\+\s*\n\s*`<div class="filter-row"/.test(src));
ok('　　非管理員那一頁的標題保留（那頁只有一句話，沒標題會變沒頭沒尾）',
   /if\(!canSeeReports\(\)\)\{ C\.innerHTML=head\('ANALYTICS','營運分析',''\)\+/.test(src));
ok('★★ 下方列表每列一個白框（外圈米底、每列白底圓角）',
   /\.ov-list\{display:flex;flex-direction:column;gap:6px;background:var\(--card2\);/.test(src)
   && /\.ov-i\{display:flex;align-items:center;gap:10px;padding:10px 11px;\s*\n\s*background:#fff;border:1px solid var\(--bd\);border-radius:10px;\}/.test(src));

console.log('\n⑨-3 員工表現：白框列＋欄間分隔線');
ok('★★ 每位員工一個白框（外圈米底），與上方營運速覽同一套語彙',
   /\.perf-m\{background:var\(--card2\);border:1px solid var\(--bd\);border-radius:12px;padding:8px;\}/.test(src)
   && /\.perf-m \.perf-m-row\{gap:0;padding:10px 12px;margin-bottom:6px;font-size:12\.5px;\s*\n\s*background:#fff;border:1px solid var\(--bd\);border-radius:10px;/.test(src));
ok('★★ 欄與欄之間細分隔線（畫在第 2～5 格的 border-left，姓名左邊不畫）',
   /\.perf-m \.perf-m-row span\+span\{border-left:1px solid var\(--bd2\);padding-left:6px;\}/.test(src));
ok('★★ gap 要歸零改用內距 —— 留著 6px 的縫，線會浮在兩格中間看起來歪一邊',
   /gap 從 6px 拉到 0、改用內距撐開，不然線會浮在兩格中間的縫裡/.test(src)
   && /\.perf-m \.perf-m-head\{gap:0;/.test(src));
ok('★★ 白框版要自己補 hover —— .perf-clickable:hover 的權重比 .perf-m .perf-m-row 低',
   /\.perf-m \.perf-m-row\.perf-clickable:hover\{background:var\(--sage-bg\);border-color:var\(--green\);\}/.test(src));

console.log('\n⑩ 支出登記入口');
ok('★★ 期間控制列裡一顆紅底 [＋ 支出]，月份跟著翻頁走',
   /<button type="button" class="btn btn-sm dash-exp" onclick="openExpensePick\('\$\{ym\}'\)">＋ 支出<\/button>/.test(src)
   && /\.dash-exp\{flex:0 0 auto;height:28px;[^}]*background:var\(--red,#7A2E28\);color:#fff;/.test(src));
ok('　　搬進控制列後不能再留 margin-left:auto（會在列裡撐出一段空白）',
   !/\.dash-exp\{flex:0 0 auto;margin-left:auto;/.test(src)
   && /那是它獨佔一列時把自己推到最右用的/.test(src));
ok('　　挑選視窗的兩顆按鈕是白底（米底彈窗上再鋪米底＝看不出來能按）',
   /\.exp-pick\{[^}]*background:#fff;/.test(src)
   && /彈窗本身就是米底，按鈕再用 var\(--card2\) 等於米底疊米底/.test(src));
ok('★★ 手機上「其他支出」一列拆兩行：第一列日期＋品項，第二列金額整排',
   /\.fx-3 \.fx-row\{grid-template-columns:96px 1fr;row-gap:6px;padding:9px 10px;\}/.test(src)
   && /\.fx-3 \.fx-row>:nth-child\(3\)\{grid-column:1 \/ 3;grid-row:2;\}   \/\* 金額整列 \*\//.test(src)
   && /\.fx-3 \.fx-head\{display:none;\}/.test(src)
   && /連標題「項目」都被折成兩行/.test(src));
ok('　　日期只寫 月/日 之後 96px 就夠（原生 date input 的「2026年8月8日」要 130px）',
   /日期（只寫 月\/日，96px 夠）/.test(src));
ok('★★ 底部「取消」改「返回」，回到固定／其他的挑選視窗（方便來回對照）',
   /<button class="btn btn-ghost" onclick="fxBack\(\)">返回<\/button>/.test(src)
   && /function fxBack\(\)\{/.test(src)
   && /openExpensePick\(m\);/.test(src));
ok('　　返回一樣不寫入，草稿丟掉（沒按儲存就不算數）',
   /window\._fxDraft=null;\s*\n\s*closeModal\(\);\s*\n\s*openExpensePick\(m\);/.test(src));
ok('★★ 跳一個視窗先挑固定／其他，再進既有的 openExpenseEditor（不另開一份資料）',
   /function openExpensePick\(ym\)\{/.test(src)
   && /openExpenseEditor\('\$\{month\}',true\)/.test(src)
   && /openExpenseEditor\('\$\{month\}',false\)/.test(src));
ok('　　權限與既有編輯器一致（櫃檯以上）',
   /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可登記支出'\); return; \}/.test(src));
ok('　　兩顆按鈕是整列可點的大區塊（手機拇指按得準）',
   /\.exp-pick\{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;/.test(src));

ok('★★ 中間資料段自己捲（項目一多整張彈窗會比螢幕高，合計與儲存鈕被推出畫面外）',
   /\.fx-list\{border:1px solid var\(--bd\);border-radius:10px;overflow-x:hidden;overflow-y:auto;\s*\n\s*max-height:46vh;/.test(src)
   && /\.fx-head\{position:sticky;top:0;z-index:1;\}/.test(src));
ok('　　overflow-x 要留 hidden（只改 overflow-y 的話 iOS 會多出一條可橫拉的縫）',
   /原本 overflow:hidden 是為了讓子列的直角被圓角裁掉/.test(src));
ok('★★ 按「＋ 新增一項」要捲到新的那一列並把游標放進「項目」欄',
   /list\.scrollTop=list\.scrollHeight;/.test(src)
   && /const inp=last\.querySelector\('input\.fx-in:not\(\.num\)'\);/.test(src)
   && /inp\.focus\(\{preventScroll:true\}\)/.test(src));
ok('★★ 選擇器一定要寫 input.fx-in —— 日期欄改成 <span class="fx-in"> 包按鈕，只寫 .fx-in 會選到 span',
   /只寫 \.fx-in 會先選到那個 span，focus\(\) 在 span 上什麼都不會發生/.test(src));

console.log('\n⑨-2 營運分析期間控制列');
/* 沿革：0823 三修收成「[今日] ‹ 期間 ›」（期間那格兼切模式），四修使用者要回
   「模式是模式、期間是期間」→ [月][日] ‹ 日期 ›，字縮成一個字省寬度。 */
ok('★★ [本月][今日] 那組舊 seg-btn 退場，改成 [月][日] ‹ 日期 ›',
   /const _dashPeriod=`<span class="dashctl">/.test(src)
   && /<span class="dashctl-seg">/.test(src)
   && /onclick="dashSetRange\('month'\)">月<\/button>/.test(src)
   && /onclick="dashSetRange\('today'\)">日<\/button>/.test(src)
   && !/<button class="seg-btn \$\{_dashRange==='month'\?'active':''\}" onclick="dashSetRange\('month'\)">本月<\/button>/.test(src));
ok('★★ 期間控制列在「◯◯總覽」那一列右邊',
   /<div class="ovh-bar"><span class="ovh-title">\$\{periodLabel\}總覽<\/span>\$\{_dashPeriod\}<\/div>/.test(src)
   && /\.ovh-bar\{display:flex;align-items:center;justify-content:space-between;gap:8px;/.test(src));
ok('★★ 頂列在手機完全空掉（[＋ 支出] 已移進下方列表的「支出」那一列）',
   /<span class="dashctl-desk">\$\{_dashPeriod\}\$\{_dashExp\}<\/span>/.test(src)
   && /\.dash-toprow\{justify-content:flex-end;margin-bottom:18px;\}/.test(src)
   && /@media\(max-width:600px\)\{ \.dashctl-desk\{display:none;\} \}/.test(src));
ok('★★ 「支出」那一列整列可點＝開登記視窗，金額＝本月已登錄的固定＋其他支出',
   /ovRow\(OV_IC\.exp,'支出',fmtNT\(otherExp\),'',otherExp>0\?'':'尚未登錄，點這裡新增',\{red:true,tap:`openExpensePick\('\$\{ym\}'\)`\}\)/.test(src)
   && /\.ov-i-tap\{width:100%;text-align:left;font-family:inherit;cursor:pointer;/.test(src));
ok('　　可點的那一列要用 <button>（鍵盤與讀屏才認得），不是給 <div> 掛 onclick',
   /const tag=tap\?'button':'div', extra=tap\?` type="button" onclick="\$\{opt\.tap\}"`:'';/.test(src));
ok('★ 利潤下方那排說明文字移除（每次都佔兩行，算法沒變）',
   !/與經營報表損益表同一套算法（含營業稅、公司負擔勞健保/.test(src)
   && /只在第一次看的時候有用，之後每次都佔兩行/.test(src));
ok('★★ 不能用 .desktop-only 藏 —— 同權重的 .filter-row{display:flex} 寫在後面會贏（重複的成因）',
   !/<div class="filter-row desktop-only"/.test(src)
   && /寫在後面會贏，手機照樣顯示（那正是重複的成因）/.test(src));
ok('★★ 期間那格只負責「回本月／回今天」；當期時 disabled（dashCtlMain 已退場）',
   !/function dashCtlMain\(\)\{/.test(src)
   && /\$\{_atNow\?' disabled':` onclick="_dashAnchor=null;navTo\('dashboard'\)"`\}/.test(src)
   && /dashCtlMain 於 2026-08-23 四修移除/.test(src));
ok('　　窄螢幕塞不下就整組換行，不要硬擠',
   /\.ovh-bar\{[^}]*flex-wrap:wrap;/.test(src)
   && /@media\(max-width:380px\)\{\s*\n\s*\.dashctl\{gap:4px;\}/.test(src));

console.log('\n⑪ 手機行事曆課卡');
ok('★★ 不再標示簽到；「假」留著（那是課的狀態，不是簽到與否）',
   /return k==='leave'\?'<span class="evc-check evc-leave" title="全員請假">假<\/span>':'';/.test(src));
ok('★★ 會員姓名靠左置中、教練名稱靠右靠下',
   /\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-txt\{align-items:flex-start;justify-content:center;\s*\n\s*text-align:left;padding:2px 4px 2px 6px;\}/.test(src)
   && /\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-coach\{position:absolute;right:4px;bottom:3px;/.test(src));
ok('★★ 姓名要落在整張卡的正中央 —— 下內距不能替教練名預留（會變成偏上）',
   /拿掉預留 → 姓名落在整張卡的正中央/.test(src));
ok('★★ 直式時姓名貼左緣、垂直置中（align-items:flex-start＝水平靠左）',
   /\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-txt\{align-items:flex-start;justify-content:center;\s*\n\s*text-align:left;padding:3px 2px;\}/.test(src)
   && /直書時 align-items 管的是水平位置/.test(src));
ok('★★ 「額滿／教室」背景帶寬度跟著欄寬（--cagsplit）走，不再寫死 25%',
   /\.cag-vrow,\.cag-vlab\{left:10px;right:auto;width:calc\(\(100% - 25px\) \* var\(--cagsplit,0\.4\)\);\}/.test(src)
   && !/\.role-admin \.cag-vrow\{/.test(src)
   && /left:0 是 \.cag-weekgrid 的 padding box 外緣，比內容區左緣多 10px/.test(src));
ok('★★ 教練名要脫離文字流才能「姓名置中」＋「教練靠下」並存 —— 理由寫在原地',
   /要嘛用 margin-top:auto\s*\n\s*把姓名擠到頂端（就不是「置中」了），要嘛姓名置中就壓不到底部/.test(src));
ok('　　只作用在手機行事曆課卡（.cag-wk-col 底下），不牽動桌機與手機首頁',
   /只作用在手機一日／週檢視的課卡（\.cag-wk-col 底下）/.test(src));

console.log('\n⑫ 教練端快速預約比照管理員');
ok('★★ 背景暗化與兩欄寬度不再限管理員',
   /\.cag-addlayer\{background:rgba\(30,27,22,\.24\);\}/.test(src)
   && /\.cag-addbtn\{width:45%;\}/.test(src)
   && !/\.role-admin \.cag-addlayer\{/.test(src)
   && !/\.role-admin \.cag-addbtn\{/.test(src));
ok('　　左整點／右 30 分交錯本來就是共用的（由 mm%60 決定），不必再寫一份',
   /\$\{mm%60===0\?'left:5%;':'left:51%;'\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
