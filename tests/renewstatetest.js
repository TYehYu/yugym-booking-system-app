/* 續約狀態四態（2026-07-29 使用者定案）：
   已續約 → 綠勾｜不續約 → 紅叉｜待續約／待分期繳費 → 紅字驚嘆＋課卡反紅。
   重點：已續約的「不從名單消失」，改標綠勾 —— 原本一買新票整列不見、隔天又跳回來，
   看起來像「消失又出現」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

// 徽章渲染
const i=src.indexOf('function bkRenewBadge(o){');
const j=src.indexOf('\n}', i)+2;
const badge=new Function(src.slice(i,j)+'\nreturn bkRenewBadge;')();

console.log('課卡右上角徽章');
ok('★ 已續約 → 綠勾', /ev-pa-ok/.test(badge({done:true})) && badge({done:true}).includes('✓'));
ok('★ 不續約 → 紅叉', /ev-pa-no/.test(badge({no:true})) && badge({no:true}).includes('✕'));
ok('★ 待續約 → 紅字提醒', /ev-pa-warn/.test(badge({renew:true})));
ok('★ 待分期繳費 → 紅字提醒', /ev-pa-warn/.test(badge({pay:true})));
eq('沒有狀態就不畫徽章', badge({}), '');
eq('null 不炸', badge(null), '');
ok('已續約優先於其他狀態（不會又綠又紅）',
   badge({done:true,renew:true,pay:true}).includes('✓'));
ok('不續約優先於待續約', badge({no:true,renew:true}).includes('✕'));

console.log('\n顏色定義');
ok('★ 綠勾用品牌綠', /\.ev-pa-ok\{background:var\(--green,#1f6f54\);color:#fff;\}/.test(src));
ok('★ 紅叉與紅字提醒用 danger', /\.ev-pa-no\{background:var\(--danger,#b5372e\)/.test(src)
   && /\.ev-pa-warn\{background:var\(--danger,#b5372e\)/.test(src));
// 2026-07-30 三修（使用者：金／紅不要淡化，色調不舒服）→ 底色完全不動，只加粗外框
/* ══ 2026-09-03：桌機行事曆的紅框整組退場 ══════════════════════════════
   使用者：「移除課卡紅色框的提示　看到暗化的課卡就知道這張要注意了」
   未繳費現在用「暗化＋右上角 [PAY] 標籤」表達（見 tests/evcardv2test.js）。
   ⚠ CSS 留著、手機那支（renderCoachAgenda）也照舊 —— 只有桌機不再掛這個 class。 */
ok('★ 紅框的 CSS 留著（手機教練行事曆還在用）',
   /\.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{[\s\S]{0,320}border:2px solid var\(--danger,#b5372e\) !important;/.test(src));
ok('★★★ 桌機不再掛紅框，改成暗化＋[PAY]',
   !/const _alertCls = _isUnpaid \? ' cal-ev-renew'/.test(src)
   && /const _tagPay = \(!hideMember && \(_isUnpaid \|\| _payAlert\)\)/.test(src)
   && /\(_cardDate < _todayYmd \|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));
ok('★ 最後一堂／分期繳費只留右上角驚嘆號，不整張反紅',
   !/_renewAlert\|\|_payAlert\) \? ' cal-ev-renew'/.test(src)
   && /if\(o\.renew\)return '<span class="ev-payalert ev-pa-warn"/.test(src));
ok('　　手機端同一套', /const _mkAlert = _unpaidM \? ' cal-ev-renew' : \(_newM \? ' cal-ev-newtoday' : ''\);/.test(src));

console.log('\n判定邏輯');
ok('★ 已續約＝同類別有「更晚買」的票（不是只看當天收款）',
   /\(_newestBuy\[tk\.member_id\+'\|'\+grp\]\|\|''\) > String\(tk\.purchase_date\|\|tk\.created_at\|\|''\)/.test(src));
ok('　　「最晚購買日」先建索引，不是每張票掃全表（2,478 票實測 226ms → 3ms）',
   /const _newestBuy=\{\};/.test(src) && !/allTickets\.some\(t2=>/.test(src));
ok('　　只比同一類（教練課／團體課各自算）', /function tkRenewGroup\(t, typeMap\)\{/.test(src));
ok('　　已退款的票不算續約', /if\(t2\.status==='refunded'\) return;/.test(src));
ok('★ 不續約＝票券上人工標記 declined', /tk\.renew_status==='declined'/.test(src));
ok('　　首頁自行算一份，不依賴行事曆頁的快取',
   /首頁自行判定一份，不依賴行事曆頁的快取/.test(src));

console.log('\n今日待簽約名單');
ok('★ 已續約不再從名單消失（拿掉「已買新票就跳過」）',
   !/if\(kind==='renew' && \(\(_memGrpLeft\[mid\]\|\|\{\}\)\[g\]\|\|0\)>0\) return;/.test(src));
ok('★ 名單顯示綠勾／紅叉', /renewed:\['✓ 已續約','ok'\]/.test(src) && /declined:\['✕ 不續約','no'\]/.test(src));
ok('　　待處理排最前，已續約／不續約排後面',
   /const w=x=>x\.rs==='renewed'\?2:\(x\.rs==='declined'\?3:\(x\.rs==='considering'\?1:0\)\);/.test(src));
ok('　　考慮中／不續約可手動標記與取消標記', /async function setRenewStatus\(tkid, st\)/.test(src)
   && /const next=\(t\.renew_status===st\)\?null:st;/.test(src));

console.log('\n課卡狀態提示（2026-09-03 改版：外框讓給出席，錢與覆核改用標籤）');
/* 舊版：紅框＝待付費、金框＝今日新增，紅 > 金。
   新版三條通道各管一件事（見 tests/evcardv2test.js）：
     外框（只有當天）＝出席　／　暗化＝這張要注意　／　右上角標籤＝為什麼要注意
   ⚠ 「紅 > 金」這個優先順序沒有消失，只是換了載體：
     兩個標籤都在、又擺不下時，[PAY]（錢）留下、[New]（覆核）讓位。 */
ok('★★★ 待付費 → 暗化 ＋ 右上角 [PAY]',
   /const _isUnpaid   = !!b\.pending_contract;/.test(src)
   && /const _tagPay = \(!hideMember && \(_isUnpaid \|\| _payAlert\)\)/.test(src)
   && /\(_cardDate < _todayYmd \|\| _isUnpaid\) \? 'cal-ev-past' : '';/.test(src));
ok('★★★ 今日新增**或調整** → 右上角 [New]（不再是金框）',
   /const _isNewToday = String\(b\.created_at\|\|''\)\.slice\(0,10\)===ymd\(TODAY\)\s*\n\s*\|\| String\(b\.updated_at\|\|''\)\.slice\(0,10\)===ymd\(TODAY\);/.test(src)
   && /const _tagNew = \(!hideMember && _isNewToday\)/.test(src));
ok('★★★ 「錢優先於覆核」改由標籤讓位表達',
   /@container \(max-width:78px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.ev-has-new\.ev-has-pay \.ev-tag-new\{display:none;\}/.test(src)
   && /極窄卡：兩個都掛不下，\[PAY\]（錢）優先於 \[New\]（覆核）/.test(src));
ok('　　金框／紅框的 CSS 都留著（手機教練行事曆還在用）',
   /\.cal-ev\.cal-ev-std\.cal-ev-newtoday \.evc-body\{[\s\S]{0,120}border:2px solid var\(--gold-d,#b48a56\)/.test(src)
   && /\.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{[\s\S]{0,320}border:2px solid var\(--danger,#b5372e\)/.test(src));
ok('　　手機端同一套（別人的課卡不標）',
   /const _vis=\(layer==='mine'\|\|isAdmin\);/.test(src)
   && /const _mkAlert = _unpaidM \? ' cal-ev-renew'/.test(src));

console.log('\n外框 CSS 必須壓過 .cal-ev-std 的 box-shadow:none');
{
  const iStd=src.indexOf('.cal-ev.cal-ev-std{padding:0 !important;');
  const iRenew=src.indexOf('.cal-ev.cal-ev-std.cal-ev-renew .evc-body{');
  const iNew=src.indexOf('.cal-ev.cal-ev-std.cal-ev-newtoday .evc-body{');
  ok('★ 紅框規則排在 .cal-ev-std 之後', iRenew>iStd, {iStd,iRenew});
  ok('★ 金框規則排在 .cal-ev-std 之後', iNew>iStd, {iStd,iNew});
  ok('★ 選擇器帶 .cal-ev-std（同分特異性下靠順序取勝）',
     iRenew>0 && iNew>0);
  ok('★ 外框畫在 .evc-body（色塊層），不會被它蓋住',
     /\.cal-ev\.cal-ev-std\.cal-ev-renew \.evc-body\{[\s\S]{0,200}border:2px solid var\(--danger/.test(src));
  ok('　　邊框用 !important 壓過後面的通用色塊規則',
     (src.slice(iRenew,iRenew+260).match(/!important/g)||[]).length>=2);
}

console.log('\n待簽約卡位的「轉正簽約」按鈕');
ok('★ 改名為「轉正簽約」', /<button class="btn btn-green bkd-signup"[^>]*>轉正簽約<\/button>/.test(src)
   && !/已簽約，轉正式預約/.test(src));
{
  const f=src.indexOf('<div class="modal-foot">', src.indexOf('bkNoteBlock(b, isMemberView, ownByCoach)'));
  const seg=src.slice(f, src.indexOf('</div>`);', f));
  ok('★ 放在明細最下方（footer 內排在取消預約之後）',
     seg.indexOf('bkd-signup') > seg.indexOf('取消預約'), 
     {sign:seg.indexOf('bkd-signup'), cancel:seg.indexOf('取消預約')});
}
ok('★ 獨佔一列', /\.modal-foot \.btn\.bkd-signup\{flex:1 0 100%;/.test(src));
ok('　　只有櫃檯／管理員、且還沒綁會員的卡位才出現',
   /b\.pending_contract&&!b\.ticket_id&&b\.status==='booked'&&\(isDeskLike\(\)\)&&!bkIsInstHold\(b\)/.test(src));   // 2026-08-04 已綁定會員的卡位也能轉正，分期保留除外

console.log('\n不做全自動取消');
ok('★ 沒有任何自動取消後續預約的排程／批次',
   !/自動取消後續/.test(src) && !/autoCancelOverdue/.test(src));
ok('★ 取消一律由櫃檯手動觸發，並可選只取消這堂或連同後面',
   /async function askSeriesCancel\(id, mode\)/.test(src)
   && /只取消這堂/.test(src) && /連同後面/.test(src));

/* ── 會員首頁課卡上方的提示（2026-07-29 使用者指示） ── */
console.log('\n會員首頁課卡提示');
ok('★ 有「開課前 30 分鐘開放簽到」的提示',
   /課程開始前 <b>30 分鐘<\/b>開放簽到（點課卡即可簽到）/.test(src));   /* 2026-08-13 團課開放自簽後改字 */
ok('★ 附課程顏色圖例', /const _MEM_LEGEND=\[\['pt','教練課'\]/.test(src)
   && /<span class="mem-lg"><i style="background:\$\{_colMap3\[k\]\}"><\/i>\$\{l\}<\/span>/.test(src));
ok('★ 不列體驗課（2026-07-29 使用者指示）', !/\['trial','體驗課'\]/.test(src));
ok('★ 圖例顏色與圓點同一份色表（不會兩邊對不上）',
   /_MEM_LEGEND\.map\(\(\[k,l\]\)=>[\s\S]{0,80}_colMap3\[k\]/.test(src));
ok('　　沒有課時不顯示提示', /const taskHint=_cardDots\?/.test(src));
ok('　　提示插在標題與圓點之間', /\$\{taskHint\}\s*\n\s*\$\{_cardDots\?/.test(src));
ok('　　圖例可換行、不撐破畫面', /\.mem-lgs\{display:flex;flex-wrap:wrap;/.test(src));


console.log('\n紅／金框不再讓課卡透明（2026-07-30 使用者回報）');
ok('★ 提示完全不動底色（課卡保留自己的課程色，沒有任何一層被沖淡）',
   !/background:color-mix\(in srgb,var\(--danger,#b5372e\)/.test(src)
   && !/background:color-mix\(in srgb,var\(--gold-d,#b48a56\)/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-body\{position:absolute;inset:0;[\s\S]{0,120}background:var\(--tk-soft,#EAF3EF\);\}/.test(src));
ok('★ 舊的半透明底色完全移除',
   !/background:rgba\(181,55,46,\.12\) !important/.test(src)
   && !/background:rgba\(180,138,86,\.14\) !important/.test(src));
ok('　　外框加粗到 2px、內圈用半透明同色勾邊，提示比原本更明顯',
   /box-shadow:inset 0 0 0 1px rgba\(181,55,46,\.45\) !important;/.test(src)
   && /box-shadow:inset 0 0 0 1px rgba\(180,138,86,\.45\) !important;/.test(src));
ok('　　三次修改的來由都寫在程式裡（透明 → 淡粉／淡米 → 只加框）',
   /一修用半透明底色（rgba \.12\/\.14）→ 卡片看起來變透明/.test(src)
   && /二修改成不透明的 color-mix 混白 → 變成一片淡粉／淡米色，把課程色蓋掉/.test(src))
ok('　　手機端共用同一組 class，一併生效', /const _mkAlert = _unpaidM \? ' cal-ev-renew'/.test(src));

console.log('\n折抵券不算續約（2026-08-14 陳秀蘭 8/18 案例）');
ok('★★ tkRenewGroup 先攔 voucher（$300 折抵券不是新約，不能觸發已續約綠勾）',
   /if\(tkClass5\(t,typeMap\)==='voucher'\) return '';/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
