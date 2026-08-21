/* 2026-08-01 使用者回報（江俊輝）：「剛剛簽到約了自主訓練又取消，結果就被系統吃掉了一堂」，
   並指示「把會扣課的警示明顯一點」。

   查證：他 10:02:12 自行預約 8/02 13:00 的自主訓練，10:02:30（18 秒後）自行取消，
   DB 端一律套「開課前 24 小時內取消不退」→ 點數被吃掉。
   那條規則是為了保護「教練的時間」，自主訓練不佔教練；而 18 秒內取消明顯是按錯要改。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('會員端：自主訓練不再嚇人（DB 端已改成一律退點）');
ok('★ 自主訓練的取消說明改成「會退回 1 點」', /<b>會退回 1 點<\/b>　自主訓練不佔教練時間，取消不扣點。/.test(src));
ok('★ 不再有「視同使用，恕不退回點數」那段', !/視同使用，恕不退回點數/.test(src));
ok('　　仍提醒點數有 7 天效期（那才是真正會損失的地方）', /點數本身有 7 天效期，過期就不能用了/.test(src));
ok('　　成因與對應的 migration 寫在程式裡',
   /24 小時規則是為了保護「教練的時間」，自主訓練不佔教練/.test(src)
   && /20260801_self_cancel_grace_and_training_pass/.test(src));

/* 2026-08-20 使用者定案：「24 小時內取消課程 會員端 教練端 要關掉權限，
   跳提醒請他們通知櫃檯」——2026-08-01 那版「紅底橫幅警告一下就放行扣課」整套退場。
   下面三項原本是在驗那個舊設計，改成驗現在的行為（不是把斷言刪掉湊綠燈）。 */
console.log('\n會員端／教練端：24 小時內擋下，請聯繫櫃檯（2026-08-20）');
ok('★ 舊的「扣課放行」設計已完全退場',
   !/<div class="cx-warn-t">這一堂會被扣掉<\/div>/.test(src)
   && !/>確定取消並扣掉這一堂</.test(src)
   && !/const box=\(within24 && !_justBooked\)/.test(src));
/* 2026-08-21：會員端連「24 小時以外」都不給取消教練課了（見下方「會員自助的界線」），
   這條 24 小時檢查在會員端已無用武之地，只剩教練端那一份。
   會員端剩下的兩條自助路徑各自有自己的 24 小時界線（團課、自主訓練）。 */
ok('★ 會員端的團課退出仍走同一條 24 小時界線',
   /if\(hoursUntilStart\(b\) < 24\)\{ cancelTooLateModal\(\); return; \}/.test(src));
/* 2026-08-21 使用者定案推翻此條：「所以其實讓教練可以自行取消 24 小時內的課程其實比較實務」。
   理由是他自己想通的 —— 教練本來就能改時間、而且改時間不受 24 小時限制，
   「挪到 24 小時之後再取消」兩步就繞過去了，擋牆只擋得住老實人。
   會員端不變（會員不能改時間，沒有同樣的漏洞）。 */
ok('★ 教練端的 24 小時擋牆已拿掉',
   !/if\(!isAdmin && within24 && !cancelIsExempt\(b\)\)\{ cancelTooLateModal\(\); return; \}/.test(src)
   && /教練本來就能改時間，而且改時間不受 24 小時限制/.test(src));
ok('★ 會員端仍然擋（memCancelTap 只放行團課與自主訓練，其餘一律櫃檯）',
   /return cancelDeskOnlyModal\(\);/.test(src)
   && /if\(hoursUntilStart\(b\) < 24\)\{ cancelTooLateModal\(\); return; \}/.test(src));
ok('★ 提示簡單清楚：一句找櫃檯＋一句不講會扣票',
   /<div class="cx-warn-t">請聯繫櫃檯<\/div>/.test(src)
   && /距離開課不到 24 小時，這堂課要由櫃檯協助取消。/.test(src)
   && /沒有通知櫃檯又沒到場，票券會視同已使用扣除。/.test(src));
ok('★ 兩個例外與 DB 同一組：剛約完 10 分鐘內、自主訓練',
   /function cancelIsExempt\(b\)\{/.test(src)
   && /b\.benefit_type==='training_pass' \|\| bkIsSelf\(b\)/.test(src)
   && /\(Date\.now\(\)-new Date\(b\.created_at\)\.getTime\(\)\) <= 10\*60\*1000/.test(src));
ok('★ DB 擋下時前端不得回退舊的直寫路徑（否則規則等於沒有）',
   /if\(_code==='CANCEL\.TOO_LATE'\)\{ if\(!_silent\) cancelTooLateModal\(\); return; \}/.test(src));
ok('★ 團課退出也用同一條 24 小時界線（原本只擋開課當天）',
   /if\(hoursUntilStart\(b\) < 24\)\{ cancelTooLateModal\(\); return; \}/.test(src)
   && !/開課當天無法自行取消報名/.test(src));
ok('　　會退回的維持低調綠框（自主訓練那張仍在，教練課那張隨流程退場）',
   /<div class="cx-note cx-note-ok"><b>會退回 1 點<\/b>/.test(src)
   && !/<div class="cx-note cx-note-ok"><b>會退回 1 堂票券<\/b>/.test(src));

console.log('\n櫃檯端：兩顆按鈕分得開');
ok('★ 「扣掉這一堂」是紅底實心並加底線（2026-08-06 三修：btn-danger 淡粉底 → btn-red 實心紅）',
   /<button class="btn btn-red cx-btn-eat" onclick="askSeriesCancel\('\$\{id\}','none'\)">取消・<b>扣掉這一堂<\/b><\/button>/.test(src)
   && /\.cx-btn-eat b\{text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:2px;\}/.test(src));
/* 2026-08-06 二修（使用者：「確認是否扣票的地方要用顏色標示，綠色票券返回、紅色票券扣除」）
   —— 退回那顆改綠底，與色標同一個語彙；扣課那顆維持紅底實心。 */
/* 2026-08-06 三修（使用者指示：「會扣票券的這個改成紅底按鈕」）——
   退回是實心綠、扣除卻只有淡粉底＋紅字，最該停下來看的那顆反而輕。 */
ok('★ 「退回票券」＝實心綠、「扣掉這一堂」＝實心紅（份量對等）',
   /<button class="btn btn-green" onclick="askSeriesCancel\('\$\{id\}','force'\)">取消・退回票券<\/button>/.test(src)
   && /<button class="btn btn-red cx-btn-eat" onclick="askSeriesCancel\('\$\{id\}','none'\)">取消・<b>扣掉這一堂<\/b><\/button>/.test(src)
   && /\.btn-red\{background:var\(--danger,#b5372e\);color:#fff;box-shadow:var\(--shadow-xs\);\}/.test(src));
/* 2026-08-21：會員端教練課的取消流程整段退場（只能團課與自主訓練），
   所以「會員端的確定取消按鈕」這條斷言連同 doMemCancelBooking 一起收掉，
   改由下方「會員自助的界線」那一段把關。 */
ok('★ 會員端教練課的取消流程已無殘留路徑',
   !/doMemCancelBooking/.test(src.replace(/不會落到已經沒有的 doMemCancelBooking 上。/,'')));
ok('★ 兩種結果各掛一枚色標（綠＝退回／紅＝扣除）',
   /\$\{tkChip\('back', `加回 \$\{_grpNetDeduct>0\?`\$\{_grpNetDeduct\} 堂/.test(src)
   && /\$\{tkChip\('eat', '不加回'\)\}/.test(src));
ok('★ 教練端只有一種結果（一律退回票券）→ 按鈕也是綠的',
   /<button class="btn \$\{isTrial\?'btn-danger':'btn-green'\}" onclick="askSeriesCancel\('\$\{id\}','auto'\)">確定取消<\/button>/.test(src));
ok('　　色標本身有顏色（綠底綠字／紅底紅字）',
   /\.tkchip-back\{background:#e8f3ec;color:#1f6f54;/.test(src)
   && /\.tkchip-eat\{background:#fbeceb;color:#b5372e;/.test(src));
ok('　　按錯的代價寫在程式裡', /按錯就是直接吃掉客人的堂數/.test(src));

console.log('\n樣式');
ok('★ 警示橫幅用實心紅底（不是淡色框）', /\.cx-warn\{background:#b5372e;color:#fff;/.test(src));
ok('　　標題夠大（19px、900 字重）', /\.cx-warn-t\{font-size:19px;font-weight:900;/.test(src));
ok('　　重點字用金色在紅底上仍看得清楚', /\.cx-warn-s b\{color:#ffe08a;\}/.test(src));

/* 2026-08-20 改版後這裡模擬的不再是「退不退」，而是「擋不擋」——
   非櫃檯只要過得了 24 小時這關就一律退，過不了就根本不讓取消。
   對應 migration 20260820_cancel_24h_desk_only 的 fn_cancel_booking。
   actor：desk＝管理員／櫃檯／店長教練（is_staff_desk）；coach＝一般教練；member＝會員 */
console.log('\n會員自助的界線（2026-08-21 使用者定案）');
/* 使用者原話：「會員只能自行調整團課跟自主訓練 其他課程留下訊息 一律透過櫃檯處理」。
   起因是陳苓汶 8/21 10:39 自行取消了 9/16 20:00 的私人教練 —— 26 天前，
   8/20 的 24 小時規則管不到。那條管「多久以前」，這條管「哪些課」。 */
ok('★ 分流只留兩條自助路徑，其餘只給訊息',
   /if\(bkIsGroup\(b\)\) return memLeaveGroup\(id\);\s*\n\s*if\(bkIsSelf\(b\)\) return memCancelSelf\(id\);[\s\S]{0,120}?return cancelDeskOnlyModal\(\);/.test(src));
ok('★ 會員端教練課的取消流程整段退場（不是藏起來按鈕而已）',
   /async function memCancelBooking\(id\)\{ return cancelDeskOnlyModal\(\); \}/.test(src)
   && !/確定取消<\/button>`\);\n\}\nasync function doMemCancelBooking/.test(src));
ok('★ 訊息講清楚為什麼與去哪裡',
   /<div class="cx-warn-t">請聯繫櫃檯<\/div>\s*\n\s*<div class="cx-warn-s">這類課程的取消與改期，一律由櫃檯協助處理。<\/div>/.test(src)
   && /自主訓練與團體課可以在這裡自己調整。/.test(src));
ok('　　按鈕直說「洽櫃檯」，但還是點得下去（使用者要的是留訊息，不是把鈕藏掉）',
   /orb\('off','✕','洽櫃檯',`memCancelTap\('\$\{b\.id\}'\)`,'這類課程由櫃檯協助取消'\)/.test(src));
ok('★ DB 擋下時前端不得回退舊路徑（與 CANCEL.TOO_LATE 同一套）',
   /if\(_code==='CANCEL\.DESK_ONLY'\)\{ if\(!_silent\) cancelDeskOnlyModal\(\); return; \}/.test(src));
ok('　　自助範圍寫成一支共用判斷（團課／自主訓練／點數）',
   /function memSelfServe\(b\)\{ return !!\(b && \(bkIsGroup\(b\) \|\| bkIsSelf\(b\) \|\| b\.benefit_type==='training_pass'\)\); \}/.test(src));
ok('　　起因與 migration 寫在程式裡',
   /20260821_member_cancel_desk_only/.test(src)
   && /陳苓汶 8\/21 10:39 自行取消了 9\/16 20:00 的私人教練/.test(src));

console.log('\nSQL 三值邏輯：benefit_type 為 NULL 會讓整條規則失效（2026-08-21 驗證時挖到）');
{
  /* plpgsql：`NULL = 'training_pass'` → NULL，`NULL or false` → NULL，
     `not NULL` → NULL，而 `if <NULL> then` 等於 false ⇒ 規則不會觸發。
     全庫 6,323/6,926 筆 benefit_type 是 NULL，等於 0820 的 24 小時規則在 DB 端一直沒真正擋過。
     （前端 cancelIsExempt 是 JS，=== 比較不會變 NULL，所以畫面上一直是擋的。） */
  const sqlNot = v => (v===null ? null : !v);
  const sqlAnd = (...xs) => xs.some(x=>x===false) ? false : (xs.some(x=>x===null) ? null : true);
  const sqlEq  = (a,b) => (a===null||b===null) ? null : a===b;
  const ifFires = v => v===true;   // plpgsql 的 if：只有 true 才進去

  const selfTrainingOld = (bt,cat)=>{ const l=sqlEq(bt,'training_pass'), r=sqlEq(cat,'自主訓練');
    return l===true||r===true ? true : (l===null||r===null ? null : false); };
  const selfTrainingNew = (bt,cat)=>(sqlEq(bt,'training_pass')===true)||(sqlEq(cat,'自主訓練')===true);

  eq('★ 舊寫法：benefit_type 為 NULL 的私人教練 → v_self_training 是 NULL',
     selfTrainingOld(null,'私人教練'), null);
  eq('★ 舊寫法：24 小時規則整條變 NULL → if 不觸發 ⇒ 沒擋到',
     ifFires(sqlAnd(true, true, true, sqlNot(selfTrainingOld(null,'私人教練')))), false);
  eq('★ 新寫法（coalesce）：同一筆 → false，規則正常觸發',
     ifFires(sqlAnd(true, true, true, sqlNot(selfTrainingNew(null,'私人教練')))), true);
  eq('　　自主訓練仍然是例外，不會被 coalesce 誤傷',
     selfTrainingNew(null,'自主訓練'), true);
  eq('　　benefit_type 有值時新舊一致',
     [selfTrainingOld('training_pass','自主訓練'), selfTrainingNew('training_pass','自主訓練')], [true,true]);
}

console.log('\n擋不擋、退不退（與 20260820_cancel_24h_desk_only 同一套規則）');
{
  const decide=(o)=>{
    const grace = o.minutesSinceBooked!=null && o.minutesSinceBooked<=10;
    const selfTraining = o.category==='自主訓練';
    /* 2026-08-21 使用者定案：會員只能自行調整團課與自主訓練，其他一律櫃檯。
       這一關在 24 小時之前——不管多早，教練課就是不讓會員自己取消。 */
    const legacyGroup = o.category==='小班肌力' && !o.hasSeats;
    if(o.actor==='member' && !selfTraining && !legacyGroup) return 'desk_only';
    /* 2026-08-21：24 小時只擋會員（教練可改時間，擋了也繞得過） */
    if(o.actor==='member' && o.hoursBefore<24 && !grace && !selfTraining) return 'blocked';
    if(o.actor==='desk') return o.staffChoice===false ? 'forfeited' : 'refunded';
    return 'refunded';
  };
  eq('★ 會員・教練課 → 一律請櫃檯（2026-08-21 起連 24 小時以外也不給）',
     decide({actor:'member',category:'私人教練',hoursBefore:5,minutesSinceBooked:600}), 'desk_only');
  eq('★ 教練・自己的課・不到 24 小時 → 2026-08-21 起放行（擋了也能靠改時間繞過）',
     decide({actor:'coach',category:'私人教練',hoursBefore:5,minutesSinceBooked:600}), 'refunded');
  eq('★ 櫃檯・不到 24 小時 → 可取消（預設退回票券）',
     decide({actor:'desk',category:'私人教練',hoursBefore:1,minutesSinceBooked:600}), 'refunded');
  eq('★ 櫃檯・當天也能取消並選擇扣課不退',
     decide({actor:'desk',staffChoice:false,category:'私人教練',hoursBefore:1}), 'forfeited');
  eq('★ 陳苓汶案例：會員・教練課・26 天前 → 現在也擋（8/21 之前這裡是 refunded）',
     decide({actor:'member',category:'私人教練',hoursBefore:24*26,minutesSinceBooked:600}), 'desk_only');
  eq('★ 教練・自己的課・24 小時以上 → 可自行取消並退回',
     decide({actor:'coach',category:'私人教練',hoursBefore:30,minutesSinceBooked:600}), 'refunded');
  /* 10 分鐘補救期是為了「按錯要改」，而會員本來就約不到教練課（只能約自主訓練），
     所以這組例外現在只在教練身上有意義。 */
  eq('★ 例外一：教練剛約完 3 分鐘（按錯要改）→ 放行並退回',
     decide({actor:'coach',category:'私人教練',hoursBefore:5,minutesSinceBooked:3}), 'refunded');
  eq('　　剛好 10 分鐘 → 還在補救期內',
     decide({actor:'coach',category:'私人教練',hoursBefore:5,minutesSinceBooked:10}), 'refunded');
  eq('　　11 分鐘 → 教練仍然放行（24 小時只擋會員）',
     decide({actor:'coach',category:'私人教練',hoursBefore:5,minutesSinceBooked:11}), 'refunded');
  eq('★ 例外二：自主訓練不佔教練時間，1 小時前取消照樣退（江俊輝案例的結論不變）',
     decide({actor:'member',category:'自主訓練',hoursBefore:1,minutesSinceBooked:600}), 'refunded');
  eq('　　江俊輝案例：自主訓練、19 小時前、18 秒後取消 → 退',
     decide({actor:'member',category:'自主訓練',hoursBefore:19,minutesSinceBooked:0.3}), 'refunded');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
