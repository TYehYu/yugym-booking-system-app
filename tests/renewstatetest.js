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
ok('★ 待處理的課卡整張反紅', /\.cal-ev\.cal-ev-renew\{box-shadow:inset 0 0 0 1\.5px var\(--danger/.test(src));
ok('　　已續約／不續約不反紅（只有待處理才反紅）',
   /const _alertCls = \(_renewAlert\|\|_payAlert\) \? ' cal-ev-renew' : '';/.test(src));

console.log('\n判定邏輯');
ok('★ 已續約＝同類別有「更晚買」的票（不是只看當天收款）',
   /String\(t2\.purchase_date\|\|t2\.created_at\|\|''\) > String\(tk\.purchase_date\|\|tk\.created_at\|\|''\)/.test(src));
ok('　　只比同一類（教練課／團體課各自算）', /function tkRenewGroup\(t, typeMap\)\{/.test(src));
ok('　　已退款的票不算續約', /t2\.status!=='refunded'/.test(src));
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

console.log('\n不做全自動取消');
ok('★ 沒有任何自動取消後續預約的排程／批次',
   !/自動取消後續/.test(src) && !/autoCancelOverdue/.test(src));
ok('★ 取消一律由櫃檯手動觸發，並可選只取消這堂或連同後面',
   /async function askSeriesCancel\(id, mode\)/.test(src)
   && /只取消這堂/.test(src) && /連同後面/.test(src));

/* ── 會員首頁課卡上方的提示（2026-07-29 使用者指示） ── */
console.log('\n會員首頁課卡提示');
ok('★ 有「開課前 30 分鐘開放簽到」的提示',
   /課程開始前 <b>30 分鐘<\/b>開放簽到（團體課由教練點名）/.test(src));
ok('★ 附課程顏色圖例', /const _MEM_LEGEND=\[\['pt','教練課'\]/.test(src)
   && /<span class="mem-lg"><i style="background:\$\{_colMap3\[k\]\}"><\/i>\$\{l\}<\/span>/.test(src));
ok('★ 圖例顏色與圓點同一份色表（不會兩邊對不上）',
   /_MEM_LEGEND\.map\(\(\[k,l\]\)=>[\s\S]{0,80}_colMap3\[k\]/.test(src));
ok('　　沒有課時不顯示提示', /const taskHint=_cardDots\?/.test(src));
ok('　　提示插在標題與圓點之間', /\$\{taskHint\}\s*\n\s*\$\{_cardDots\?/.test(src));
ok('　　圖例可換行、不撐破畫面', /\.mem-lgs\{display:flex;flex-wrap:wrap;/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
