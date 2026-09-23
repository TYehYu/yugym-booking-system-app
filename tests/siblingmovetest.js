/* 影子卡不可以被單獨搬走（2026-09-23 李昭賜案例）

   使用者：「幫我查一下他怎麼可以在沒有票券的情況下又約了跑步機」

   ── 根因 ──
   一堂佔兩台在資料層是兩筆 booking：第二台 sibling_of 指回主預約、**不綁票不扣點**。
   櫃檯端的行事曆拖曳與「調整預約時間」完全沒處理 sibling，於是兩個方向都會生出幽靈：
     ・改到主卡   → 主卡走了，第二台還佔著**舊**時段
     ・改到影子卡 → 影子卡被搬到**新**時段，變成不綁票、不扣點、卻佔著位置、
                    而且畫面上有姓名的預約 —— 看起來就像那位會員沒票還多約了一堂

   實例 BK-1a0c3c8175f36bb：note 還留著「同行使用（跑步機）・不另外扣點」，
   venue_unit 卻是 multi_2、時間 21:00（主卡是 20:00 treadmill_1）—— 出生證明與現況打架。

   ⚠ 這是 2026-09-16「影子卡濾在來源」那次只修了一半的另一半：
     那次修的是**會員端**換時段清單（msbStart 的 futureSelf），櫃檯端沒擋。
   ⚠ 正式庫實查：全庫 5 張被搬走的影子卡，最早 2026-08-01（所以不是 0922 場租造成的）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 擋住「單獨搬影子卡」');
{
  const F=(src.match(/function bkMoveBlockReason\(b\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ bkMoveBlockReason 擋 sibling_of',
     /if\(b\.sibling_of\) return '這是同行的第 2 台，不能單獨改時間/.test(F));
  /* ⚠ 要擋在最前面：已取消／已簽到那幾條先回傳的話，影子卡在那些狀態下就漏出去了。
     實際上更重要的是「這條要在 status 檢查之前」——順序自己就是規則。 */
  ok('★★ 擋在狀態檢查之前（順序本身就是規則）',
     F.indexOf('b.sibling_of') < F.indexOf("b.status==='cancelled'"));
  ok('★★ 提示講得出「要改哪一筆」（不能只說不行）',
     /請改主預約那一筆，第 2 台會跟著走/.test(F));
  ok('　 根因與實例寫在原地', /BK-1a0c3c8175f36bb/.test(src) && /只修了一半的另一半/.test(src));
}

console.log('② 主卡改時間 → 第 2 台跟著走');
{
  const F=(src.match(/async function bkMoveSiblings\(b, nd, nt\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★★ 這支存在', !!F);
  ok('★★★ 只搬還活著的影子卡（已取消的不動）',
     /x\.sibling_of===b\.id && x\.status!=='cancelled'/.test(F));
  ok('★★★ 新時段那一台被別人佔走 → 取消第 2 台並明講（不要靜靜留在舊時段）',
     /if\(taken\[s\.venue_unit\]\)\{[\s\S]{0,200}status:'cancelled'/.test(F)
     && /在新時段已被約走，已取消/.test(F));
  ok('★★ 算「誰佔住了」時要排除自己這一組（否則自己擋自己）',
     /const mine=new Set\(\[b\.id\]\.concat\(sibs\.map\(x=>x\.id\)\)\);/.test(F)
     && /!mine\.has\(x\.id\)/.test(F));
  ok('★★ 只看時間真的重疊的（不是整天）',
     /const ov=x=>\{ const s0=timeToMin\(x\.start_time\), e0=s0\+\(Number\(x\.duration\)\|\|60\); return s0<ne && ns<e0; \};/.test(F));
  ok('★★ 第 2 台搬不動不讓主卡的改期看起來失敗（主卡已經寫進去了）',
     /\}catch\(e\)\{ console\.error\('同行第 2 台跟著改期失敗:', e\); \}/.test(F));
}

console.log('③ 四條改時間的路都要接上（漏一條就會再生一張幽靈）');
{
  const calls=(src.match(/await bkMoveSiblings\(/g)||[]).length;
  ok('★★★ 四條路都呼叫了（調整預約時間 ＋ 三條拖曳）', calls===4, calls);
  ok('★★ 調整預約時間（amvSave）',
     /b\.date=nd; b\.start_time=nt; await dbPut\('bookings',b\);\s*\n\s*showToast\('已更新預約時間'\);\s*\n\s*await bkMoveSiblings\(b, nd, nt\);/.test(src));
  ok('★★ 拖曳：wtlDropAt／wtlDropMove／cagDropMove',
     (src.match(/await bkMoveSiblings\(b, ds, ntime\);/g)||[]).length===3);
  /* 反例：這支測試自己要抓得到「少接一條」 */
  const broken=src.replace(/await bkMoveSiblings\(b, ds, ntime\);/,'');
  ok('★★ 反例：拿掉一條就檢查得出來',
     (broken.match(/await bkMoveSiblings\(/g)||[]).length===3);
}

console.log('④ 會員端那一半（2026-09-16 已修，不可回退）');
{
  ok('★★★ 換時段清單仍濾掉影子卡（msbStart 的 futureSelf）',
     /futureSelf=\(bks\|\|\[\]\)\.filter\(x=>x\.member_id===SESSION\.id&&bkIsSelf\(x\)&&x\.status==='booked'\s*\n\s*&& !x\.sibling_of/.test(src));
  ok('★★★ 我的預約清單仍濾掉影子卡（PAGES.mem_bookings 的 mine）',
     /const mine=bookings\.filter\(b=>bkHasMember\(b,SESSION\.id\)&&b\.status!=='cancelled' && !b\.sibling_of\)/.test(src));
}

console.log('④-2 資料庫那一道（會員手機唯一能改預約的路）');
{
  const mg=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260923_self_reschedule_sibling_guard.sql';
  const has=fs.existsSync(mg);
  ok('★★ migration 有進版控', has, mg);
  const t=has?fs.readFileSync(mg,'utf8'):'';
  ok('★★★ fn_member_self_reschedule 擋影子卡',
     /if b\.sibling_of is not null then\s*\n\s*return jsonb_build_object\('ok',false,'error_code','BOOKING\.IS_SIBLING'\);/.test(t));
  ok('★★★ 主卡搬動時第 2 台跟著搬（與前端 bkMoveSiblings 同一套行為）',
     /for s in select \* from bookings where sibling_of=b\.id and status::text<>'cancelled' for update loop/.test(t));
  ok('★★★ 新時段被佔走就取消第 2 台，不要留在舊時段',
     /status='cancelled',[\s\S]{0,120}同行第 2 台取消/.test(t));
  ok('★★ 順手修掉「自己擋自己」：重複與場地檢查要排除自己那一組的第 2 台',
     /x\.sibling_of is null\s+-- 自己那組的第 2 台不算「重複」/.test(t)
     && /x\.sibling_of is distinct from b\.id/.test(t));
  ok('★★ security definer 固定 search_path', /set search_path to 'public','pg_temp'/.test(t));
  ok('★★ 前端認得新錯誤碼（不要吐一串英文給客人）',
     (src.match(/'BOOKING\.IS_SIBLING':'這是同行的第 2 台，請改主預約那一筆'/g)||[]).length===2);
}

console.log('⑤ 影子卡的出生規則沒被動到（它本來就該跟主卡同時段）');
{
  const A=(src.match(/async function bkAddTreadmillUnits\(bk, want\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★ bkAddTreadmillUnits 抄主卡的日期與時間',
     /date:bk\.date, start_time:bk\.start_time,/.test(A));
  const B=(src.match(/async function _bkToggleVenueUnit\(id, unit\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★ bkToggleVenueUnit 也抄主卡的日期與時間',
     /date:b\.date, start_time:b\.start_time,/.test(B));
  ok('★★ 兩支都不綁票（ticket_id:null）',
     /ticket_id:null,[\s\S]{0,200}sibling_of:bk\.id/.test(A) && /ticket_id:null,[\s\S]{0,200}sibling_of:root/.test(B));
}

console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
