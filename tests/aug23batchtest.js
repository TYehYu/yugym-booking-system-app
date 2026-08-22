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

console.log('\n⑥ 桌機行事曆底色');
ok('★★ 整片底色白→米（使用者：「不要用白色，因為卡片就白色了」）',
   /\.cal-body\{display:flex;overflow:auto;flex:1;min-height:0;background:var\(--bg\);/.test(src)
   && /課卡是 #FBFAF5 的白，鋪在白底上等於沒有邊界/.test(src));
ok('★★ 兩個 sticky 圖層要一起改，否則捲動時露出白柱／白條',
   /\.cal-timecol\{[^}]*background:var\(--bg\);\}/.test(src)
   && /\.cal-daycol-head\{[^}]*background:var\(--bg\);/.test(src));
ok('　　今天那一欄的欄頭仍是自己的淡金底（不被統一底色蓋掉）',
   /\.cal-daycol-head\.today\{background:#f3efe2;\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
