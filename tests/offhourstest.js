/* 非營業時間的預約（2026-08-23 使用者提問與定案）

   起因：「桌機行事曆 我剛剛點 21:30 可以設定預約，這個時間是櫃檯以上桌機才可以使用嗎？
   應該沒有開放在其他地方可以預約吧？因為這時間上完課都 22:30，已經超過營業時間」

   查下來不是權限設計，是兩個漏洞：
   ① 行事曆的「已打烊」判斷是 min>=打烊 —— 只比開始時間，每天都多開放半小時；
   ② validateBooking 與後端 fn_create_booking 完全沒有營業時間規則 ——
      能把時間送進表單就一定建得成（教練端、七日、一週、連續預約、拖曳改期全部通）。

   使用者定案三句話：
   ・「員工可越線但要說明原因」
   ・「限制自主訓練不能預約非營業時間使用，除非是櫃檯以上幫忙預約」
   ・「團體課跟教練課都可以在有條件的情況下預約非營業時間上課」
   ・二修講明理由：「如果讓會員自己預約非營業時間，那誰要來開門？可是如果教練有特別
     原因自己願意提早來幫學員開門，可以通融」→ 線畫在「有沒有人會到場開門」，不是職級。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 判斷：整堂課要落在營業時間內');
ok('★★ 比的是「開始 ≥ 開店 且 結束 ≤ 打烊」，不是只看開始時間（那正是這次的漏洞成因）',
   /if\(st>=open && en<=close\) return '';/.test(src)
   && /const st=timeToMin\(t\), en=st\+\(Number\(dur\)\|\|60\);/.test(src));
ok('★ 早於開店與晚於打烊分開講（原因不一樣，處理也不一樣）',
   /這堂 \$\{t\} 開始，早於開店時間/.test(src)
   && /這堂會上到 \$\{minToTime\(en\)\}，超過營業時間/.test(src));
ok('★★ 營業時間仍只有一份來源（BUSINESS_HOURS → bizOpenMin／bizCloseMin）',
   /function bizHoursLabel\(ds\)\{[\s\S]*?bizOpenMin\(ds\)[\s\S]*?bizCloseMin\(ds\)/.test(src));

console.log('\n② 自主訓練：擋的是「沒有人會來開門」，不是職級');
const B=grabFn('bkSelfOffHoursBlock');
ok('★★ 只有會員自己約才擋；員工（含教練）代排＝有人會到場，放行',
   /if\(!\(SESSION && SESSION\.role==='member'\)\) return '';/.test(B)
   && /員工代排＝有人會到場，放行/.test(B));
ok('★★ 課別歸屬問口袋，不自己寫字串比較（TK_POCKETS.self.businessHoursOnly）',
   /function bkOffHoursSelfOnly\(cat\)\{[\s\S]*?bkPocket\(\{category:String\(cat\|\|''\)\}, typeMapNow\(\)\)[\s\S]*?p\.businessHoursOnly/.test(src)
   && !/==='自主訓練'/.test(B));
ok('★ 使用者的理由寫在程式裡（下一個人才知道這條線為什麼這樣畫）',
   /那誰要來開門？可是如果教練有特別原因/.test(src));

console.log('\n③ 硬擋放在 validateBooking —— 所有入口唯一的共同關卡');
const V=grabFn('validateBooking');
ok('★★ 建立／連續／卡位／拖曳改期／改課種全都經過這裡',
   /const _selfBlk=bkSelfOffHoursBlock\(bk\.category, date, time, dur\); if\(_selfBlk\) return _selfBlk;/.test(V));
ok('　　順序在票券限時段（0b）之後、抓當日預約（衝堂／場地）之前 —— 不必為了擋它去撈整天的課',
   V.indexOf('endsBy18')<V.indexOf('_selfBlk')
   && V.indexOf('_selfBlk')<V.indexOf('fetchDayOccupancy'));
ok('★ 教練課與團體課不在這裡擋（使用者：「都可以在有條件的情況下預約」）',
   /只擋「會員自己約的自主訓練」/.test(V));

console.log('\n④ 其餘課別：說明原因＋確認，不藏也不擋');
ok('★★ 建立預約送出前問一次（體驗／團課／教練課共用 _submitBookingInner 這一個入口）',
   /if\(!\(await confirmOffHours\(date, time, 60, '取消預約', t&&t\.category\)\)\) return;/.test(src));
ok('★ 教練手機「快速預約」不經 _submitBookingInner，自己問一次',
   /if\(!\(await confirmOffHours\(f\.date, f\.time, 60, '取消預約'\)\)\) return;/.test(src));
ok('★ 待簽約卡位也是建立預約的一種',
   /if\(!\(await confirmOffHours\(date, time, 60, '取消卡位'\)\)\) return;/.test(src));
ok('★★ 改時間不另跳一層：那張確認卡本來就要按「確認修改」，原因直接寫在卡上',
   /const _oh=bizOffHoursNote\(nd,nt,ndur\); return _oh/.test(src)
   && /這張卡本來就要按「確認修改」，所以不再多跳一層/.test(src));
ok('★★ 自主訓練的確認多問一句「誰來開門」——那是這條規則的真正理由',
   /這個時間店裡沒有人。要排的話，請先確認有教練或櫃檯會到場幫學員開門。/.test(src));
ok('★ 提示用金色不用紅色（可以做但要知道；紅色留給不能做）',
   /\.adp-warnnote\{font-size:11\.5px;line-height:1\.7;color:var\(--gold-d,#9a6a1e\)/.test(src)
   && /紅色留給「不能做」，金色是次要提示/.test(src));
ok('★★ 表單即時提示：選到營業時間外，時間欄底下就寫原因（不必等到按送出）',
   /function bkOffHoursWarn\(\)\{/.test(src)
   && /tip\.textContent=hard\?hard:`\$\{note\}　\$\{bkOffHoursAsk\(t&&t\.category\)\}`/.test(src));
ok('★★ 超過上限＝不能做 → 轉紅並把欄位標紅；界內＝可以做但要知道 → 金色',
   /tip\.className=hard\?'adp-badnote':'adp-warnnote';/.test(src)
   && /btn\.classList\.toggle\('adp-field-bad', !!hard\);/.test(src));
ok('　　日期／時間改動與換課種都會重寫那句話',
   /try\{ bkOffHoursWarn\(\); \}catch\(_\)\{\}\s*\n\s*const tid=\(document\.getElementById\('bk-type'\)\|\|\{\}\)\.value\|\|'';/.test(src)
   && /try\{ bkOffHoursWarn\(\); \}catch\(_\)\{\}   \/\* 換課種也要重寫那句話/.test(src));

console.log('\n④-2 越線的上限：營業時間前後各 1 小時（0823 三修定案）');
/* 使用者：「頂多也就營業時間前後多一個小時，且只能由教練以上建立預約
   （教練／櫃檯／店長／管理員），只是預約的時候要有提醒這是非營業時間」 */
ok('★★ 超過前後各 1 小時一律擋 —— 連櫃檯與管理員都擋（上限是營業型態，不是權限大小）',
   /const OFFHOURS_GRACE_MIN=60;/.test(src)
   && /if\(st>=lo && en<=hi\) return '';/.test(src)
   && /const lo=open-OFFHOURS_GRACE_MIN, hi=close\+OFFHOURS_GRACE_MIN;/.test(src)
   && /這一條連櫃檯與管理員都擋 —— 上限是門市的營業型態，不是誰的權限大小/.test(src));
ok('　　恰好 1 小時要放行（平日 08:00 開始、22:00 開始下課 23:00 都在界內＝現行清單兩端）',
   /恰好 1 小時要放行（open-60 \/ close\+60 皆為合法邊界）/.test(src));
ok('★★ 上限也擋在 validateBooking（與自主訓練那條同一格，所有入口共用）',
   /const _ohBlk=bizOffHoursHardBlock\(date, time, dur\); if\(_ohBlk\) return _ohBlk;/.test(V));
ok('　　建立預約在送出時先講一次（不要讓人填完整張表才被退）',
   /const _ohBlk=bizOffHoursHardBlock\(date, time, 60\);\s*\n\s*if\(_ohBlk\)\{ showToast\(_ohBlk, 6000\); return; \}/.test(src));
ok('★★ 會員自己建立的預約一律不給越線（不再只擋自主訓練）',
   /if\(!\(SESSION && SESSION\.role==='member'\)\) return '';/.test(src)
   && /不再只擋自主訓練 —— 使用者定案「只能由教練以上建立預約/.test(src));
ok('　　團課報名走 fn_member_join_group（RPC），不經 validateBooking，不受影響',
   /團課報名走 fn_member_join_group（RPC），不經過 validateBooking，不受影響/.test(src));

console.log('\n⑤ 順手修掉查出來的另一個寫死');
ok('★★ 一週檢視點格的上限原本寫死 21:00、不分星期（週日 15:00 打烊照樣點得到 21:00）',
   /mm=Math\.max\(S,Math\.min\(quickBookLastMin\(ds\),mm\)\);/.test(src)
   && /上限原本寫死 21:00，不分星期/.test(src));
ok('　　那只是「點到哪裡」的收斂，不是限制（表單裡照樣選得到，送出前會問）',
   /只是「點到哪裡」的收斂，不是限制/.test(src));

console.log('\n⑥ 同批：指派代課教練收給櫃檯以上');
ok('★★ 教練端不畫「指派代課教練」（權限層級＝這個身分根本沒有這個功能，整組不畫）',
   /function bkCanSub\(\)\{ return isDeskLike\(\); \}/.test(src)
   && /這一個不套「淡化＋寫原因」那一套語彙/.test(src));
ok('★★ 桌機展開卡與明細視窗的教練下拉也一起收（不是只收簡易課卡那一列）',
   /\$\{bkCanSub\(\)\?`<label>教練<select id="ed-subcoach">\$\{subOpts\}<\/select><\/label>`:''\}/.test(src)
   && (src.match(/\$\{\(editable&&bkCanSub\(\)\)\?/g)||[]).length===3);
ok('　　寫入端沒有下拉時沿用原本的代課設定（不會被清成 null）',
   /const nsub=document\.getElementById\('ed-subcoach'\)\?document\.getElementById\('ed-subcoach'\)\.value\|\|null:b\.substitute_coach_id\|\|null;/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
