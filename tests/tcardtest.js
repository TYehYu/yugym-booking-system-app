/* 首頁任務課卡（2026-07-30 使用者回報）
   ① 7/31 11:00 團課顯示「蔡票阿姨」——她根本不在名單裡。團課的學員在 member_ids，
      member_id 應該是 null，但匯入資料有殘留，卡片先看 member_id 就把它秀出來。
   ② 待簽約（還沒收款）的課卡也要標紅框，與行事曆同一套提示。
   ③ 教練薪資單下方的「本月月曆」移除。 */
const fs=require('fs');
/* 2026-07-31：「是不是團課」抽成共用的 bkIsGroup（見 TK_POCKETS.group）——
   沙箱裡給一個等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('團課課卡的名稱');
/* 2026-08-01：人數改用共用的 grpHeadLabel（有人請假就標「會來的/報名的」） */
ok('★ 團課一律顯示人數，不再掉回 member_id',
   /const _isGrp = bkIsGroup\(b\) \|\| \(Array\.isArray\(b\.member_ids\)&&b\.member_ids\.length>0\);/.test(src)
   && /const nm = _isGrp \? grpHeadLabel\(b\) : bkName\(b,_nameOf\);/.test(src));
ok('★ 滑過細條的提示也一起修', /\? `團課 \$\{grpHeadLabel\(b\)\}`/.test(src));
ok('　　體驗／待簽約／場租仍顯示客戶姓名', /\(b\.trial_name\?bkGuestName\(b\):'—'\)\)/.test(src));
ok('　　原因寫在程式裡', /她根本沒上這堂/.test(src));

console.log('\n待簽約紅框');
ok('★ 待簽約的任務課卡加 tcard-pend', /const _pend = !!b\.pending_contract;/.test(src)
   && /\$\{_pend\?' tcard-pend':''\}/.test(src));
ok('★ 樣式與行事曆同一套：只加粗外框、不覆蓋課程底色',
   /\.tcard\.tcard-std\.tcard-pend \.tcard-body\{\s*\n\s*border:2px solid var\(--danger,#b5372e\) !important;\s*\n\s*box-shadow:inset 0 0 0 1px rgba\(181,55,46,\.45\) !important;\}/.test(src));
/* 2026-07-31：標籤改成姓名下面一列，title 用 _nmFull（已含「（待簽約）」）＋尚未收款 */
/* 0824：空堂與待簽約分開講 —— 空堂是「還沒安排會員」，不是「尚未收款」。 */
ok('　　滑鼠提示分得清空堂與待簽約',
   /\$\{_nmFull\}\$\{_pend\?\(_openHold\?'・尚未安排會員':'・尚未收款'\):''\}/.test(src));
ok('　　空堂的課卡加 tcard-open（收掉紅框、保留暗化）',
   /const _openHold = _pend && \(typeof bkIsOpenHold==='function'\) && bkIsOpenHold\(b\);/.test(src)
   && /\$\{_openHold\?' tcard-open':''\}/.test(src)
   && /\.tcard\.tcard-std\.tcard-pend\.tcard-open \.tcard-body\{/.test(src));

console.log('\n體驗／待簽約放在姓名下面一列（2026-07-31 使用者指示）');
ok('★ 卡片主行只放純姓名', /: \(b\.trial_name\|\|'—'\)\);/.test(src));
/* 2026-08-21：出席章改成姓名之後自己一列，標籤順延到章後面——
   仍然是獨立一列，只是中間多了出席章那一列。 */
ok('★ 標籤仍走 _tagOut（0822 起跟教練標籤一起放在右下角那一欄）',
   /const _tagOut = _tag \? `<span class="tcard-sub">\$\{_tag\}<\/span>` : '';/.test(src)
   && /<span class="t3-co">\$\{_tagOut\}\$\{coTag\}<\/span>/.test(src));
/* 2026-07-31 重構：標籤走共用的 bkTag（待簽約／待繳費由有沒有綁會員決定） */
ok('★ 待簽約／待繳費分得開（有沒有綁會員）',
   /if\(b\.pending_contract\) return bkIsInstHold\(b\) \? '待繳費' : '待簽約';/.test(src)   // 2026-08-04 純綁定仍是待簽約
   && /const _tag = _isGrp \? '' : bkTag\(b\);/.test(src));
ok('　　體驗與場租沿用 bkGuestLabel（與行事曆同一套判定）',
   /if\(b\.category==='體驗'\) return '體驗';/.test(src));
ok('　　團課不掛（主行是人數，不是姓名）', /_isGrp \? '' :/.test(src));
ok('　　小字樣式有定義', /\.tcard-sub\{font-size:10px;font-weight:700;opacity:\.72;/.test(src));
ok('　　原因寫在程式裡', /原本是「程凱郁（體驗）」接在名字後面，窄卡會折行把名字擠掉/.test(src));

console.log('\n薪資單移除月曆');
ok('★ 薪資單不再組月曆區塊', !/<div class="card"><div class="card-title">本月月曆 /.test(src));
ok('★ 排班明細保留', /<div class="card-title">本月排班 /.test(src));
ok('　　沒有呼叫端的 salaryCalendar 有註明暫留',
   /salaryCalendar\(\)／salaryCalDay\(\) 因此沒有呼叫端了，函式暫留未刪/.test(src));
ok('　　salaryCalendar 確實已無呼叫端（只剩定義與註記）',
   (src.match(/salaryCalendar\(/g)||[]).length===2
   && /function salaryCalendar\(month, bookings, shifts, dayResult\)\{/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
