/* 分期第 2 期起要再簽一次名（2026-09-22）
   使用者：「今天黃柏瑜要收第二期　應該要讓他簽第二次」
   定版：「紙本第二期還是在紙本　就不用待簽　電子要等待簽才開通」

   做法（B 案，使用者選的）：不另開一份合約，在原合約補一格簽名欄
     contracts.installment_signs = [{n, sign_type, requested_at, amount, signature, signed_at}]
     contracts.pending_sign_n    = 第幾期正在等會員簽（null＝沒有）

   ⚠ 為什麼要兩個欄位：installment_signs 裡是 base64 簽名圖，那一欄在 LEAN_DROP 裡
     （列表讀取不搬）；而會員端的票券頁走 dbGetAll，只有輕量的 pending_sign_n 讀得到。
     這支測試盯住的就是這個分工 —— 把 pending_sign_n 也丟進 LEAN_DROP 的話，
     會員端的簽名欄會整個不出現（而且不會報錯，只是安靜地不見）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 把閘門照抄成可以跑的版本 —— 改了 index.html 要同步改這裡。 */
const instSignsOf=c=>{ const a=c&&c.installment_signs; return Array.isArray(a)?a:[]; };
const instSignFind=(c,n)=>instSignsOf(c).find(x=>x&&Number(x.n)===Number(n))||null;
const instNeedsSign=c=>!!(c&&String(c.sign_type||'')==='remote');
/* 回傳櫃檯按下〔分期繳費〕後會走到哪一步 */
function gate(ct,cur){
  const n=cur+1;
  if(instNeedsSign(ct)){
    const s=instSignFind(ct,n);
    if(!s) return 'ask';                                   // 還沒送出待簽
    if(!s.signature && s.sign_type!=='paper') return 'wait';// 送出了、還沒簽
  }
  return 'pay';                                             // 進收款開通畫面
}

console.log('① 黃柏瑜那一筆（電子簽・3 期・已收第 1 期）');
{
  const c={id:'CT1',sign_type:'remote',signed_at:'2026-08-01',installment_signs:[]};
  ok('★★ 第一次按〔分期繳費〕→ 先送簽名到會員手機，不會直接收錢', gate(c,1)==='ask', gate(c,1));
  c.installment_signs=[{n:2,sign_type:'remote',requested_at:'2026-09-22T12:00:00Z',signature:null}];
  ok('★★ 送出待簽後再按 → 擋在「等待會員簽名」', gate(c,1)==='wait', gate(c,1));
  c.installment_signs=[{n:2,sign_type:'remote',signature:'data:image/png;base64,AAA',signed_at:'2026-09-22T13:00:00Z'}];
  ok('★★ 會員簽完再按 → 照常進收款開通（同一個動作，不必多按一次）', gate(c,1)==='pay', gate(c,1));
}

console.log('② 紙本不受影響（使用者：「紙本第二期還是在紙本　就不用待簽」）');
{
  ok('★★ 紙本合約直接進收款，一次都不擋', gate({sign_type:'paper',installment_signs:[]},1)==='pay');
  ok('★ 現場平板電子簽（electronic）也不擋 —— 客人就在眼前，沒有「等」這件事',
     gate({sign_type:'electronic',installment_signs:[]},1)==='pay');
  ok('★ 還沒決定簽署方式（undecided）也不擋', gate({sign_type:'undecided',installment_signs:[]},1)==='pay');
  ok('　 根本沒有合約的票券不擋', gate(null,1)==='pay');
}

console.log('③ 閘門的容錯：別把櫃檯鎖死');
{
  const c={id:'CT1',sign_type:'remote',
    installment_signs:[{n:2,sign_type:'remote',signature:'data:image/png;base64,AAA',signed_at:'2026-09-22T13:00:00Z'}],
    pending_sign_n:null};
  ok('★★ 簽完就放行', gate(c,1)==='pay');
  ok('★ 整份合約的 sign_type 沒被改掉', c.sign_type==='remote');
  /* ⚠ paper 那一格的容忍留著：萬一日後真的有人手動補紙本紀錄，閘門不該把人鎖死。 */
  ok('　 舊資料若有 paper 那一格，閘門仍然放行（不把櫃檯鎖死）',
     gate({sign_type:'remote',installment_signs:[{n:2,sign_type:'paper',signed_at:'x'}]},1)==='pay');
}

console.log('④ 期數要對得上（不能用「有沒有簽過」含糊帶過）');
{
  const c={sign_type:'remote',installment_signs:[{n:2,signature:'x',signed_at:'a'}]};
  ok('★★ 第 2 期簽過了，收第 3 期時照樣要簽', gate(c,2)==='ask', gate(c,2));
  ok('　 找得到第 2 期', !!instSignFind(c,2));
  ok('　 字串期數也認得（DOM 傳回來的常是字串）', !!instSignFind(c,'2'));
  ok('　 沒有的期數回 null', instSignFind(c,5)===null);
  ok('　 欄位是 null／沒有時不炸', instSignsOf({installment_signs:null}).length===0 && instSignsOf(null).length===0);
}

console.log('⑤ 兩個欄位的分工（這支測試真正要守的東西）');
{
  ok('★★ 簽名本體 installment_signs 在 LEAN_DROP 裡（base64 圖，列表不搬）',
     /contracts:\['body_snapshot','fill_snapshot','signature','installment_signs'\] \};/.test(src));
  ok('★★ 輕量旗標 pending_sign_n 沒有被丟進 LEAN_DROP —— 丟進去會員端簽名欄會安靜消失',
     !/pending_sign_n/.test((src.match(/const LEAN_DROP=\{[\s\S]*?\]\s*\};/)||[''])[0]));
  ok('★★ 會員端的票券頁用 pending_sign_n 判斷（那一頁走 dbGetAll，讀不到簽名本體）',
     /window\._ctInstSignByTicket=Object\.fromEntries\(window\._memContracts\s*\n\s*\.filter\(c=>c\.ticket_id && c\.pending_sign_n\)/.test(src));
  ok('★★ 櫃檯端讀合約用單筆 dbGet 補一次（dbGetAll 拿不到 installment_signs）',
     /async function instCtOfTicket\(ticket_id\)\{[\s\S]*?return await dbGet\('contracts',hit\[0\]\.id\)/.test(src));
  ok('　 為什麼要兩個欄位，寫在註解裡', /輕量欄位 `contracts\.pending_sign_n`/.test(src));
}

console.log('⑥ 閘門真的裝在 openInstallNext 上（三個入口共用這一支）');
{
  const g=(src.match(/async function openInstallNext\(ticket_id\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★ 收款畫面出現之前就擋', g.indexOf('instNeedsSign(_ct)')>0 && g.indexOf('instNeedsSign(_ct)')<g.indexOf('showModal'));
  ok('★★ 擋的是「下一期」而不是目前這期', /const _sn=cur\+1;/.test(g));
  ok('★ 三個入口都是呼叫 openInstallNext（票券頁／會員頁／今日收款提醒）',
     (src.match(/openInstallNext\('\$\{(t|r)\.(id|tid)\}'\)/g)||[]).length>=3);
  ok('★ 已簽的那一期會顯示在收款畫面上（櫃檯看得到自己在收什麼）',
     /第 \$\{_sn\} 期 已簽/.test(g));
}

console.log('⑦ 會員端簽名板');
{
  const f=(src.match(/async function memSignContract\(id, n\)\{[\s\S]*?setTimeout\(signPadInit,60\);\n\}/)||[''])[0];
  ok('★★ 分期補簽時不拿 signed_at 當擋門 —— 整份合約本來就早簽完了',
     /if\(_n\)\{ const _s=instSignFind\(c,_n\);[\s\S]*?else if\(c\.signed_at\)\{/.test(f));
  ok('★ 已經簽過的那一期不讓再簽一次', /if\(!_s \|\| _s\.signature\)\{ showToast\('這一期不需要簽名'\)/.test(f));
  ok('★ 標題講清楚是第幾期', /合約簽署・第 \$\{_n\} 期/.test(f));
  ok('★ 合約全文上方有一條說明（會員不會以為自己在重簽整份）', /這是<b>第 \$\{_n\} 期<\/b>的簽名/.test(f));
  const d=(src.match(/async function memSignContractDo\(id, n\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★ 分期走 fn_member_sign_installment，整份簽走原本那一支',
     /_n\s*\n?\s*\? await sb\.rpc\('fn_member_sign_installment',\{p_contract_id:id,p_n:_n,p_signature:sig\}\)\s*\n\s*: await sb\.rpc\('fn_member_sign_contract'/.test(d));
  ok('★★ 分期簽完就結束，不會接著跳「還有 N 份合約待簽」（那是另一回事）',
     d.indexOf("showToast(`第 ${_n} 期已完成簽署")>0 && d.indexOf("showToast(`第 ${_n} 期已完成簽署")<d.indexOf('還有 ${rest.length} 份'));
  ok('★ 寫完清快取', /dbCacheClear\(\['contracts'\]\);\s*\n\s*if\(_n\)\{/.test(d));
}

console.log('⑦-2 只有一條路：送到會員手機（2026-09-22 使用者連續兩次指正）');
{
  /* ① 「他就算在現場　也只有電子簽約　因為第一次電子簽約就已經沒有紙本了」
     ② 「電子簽名都是在會員手機端」
     所以「改用紙本」與「現場在櫃檯裝置上簽」兩顆都不該存在。
     這兩條反面斷言就是擋著別人（包含我自己）再把逃生門加回來。 */
  ok('★★ 沒有「改用紙本」那顆（第一次電子簽的會員手上根本沒有紙）', !/instSignPaper/.test(src));
  ok('★★ 沒有「現場在櫃檯裝置上簽」那顆（電子簽一律在會員自己的手機）', !/instSignHere/.test(src));
  ok('★★ 送出待簽是唯一出口', (src.match(/onclick="instSignRequest\(/g)||[]).length===1);
  ok('★ 等待視窗講清楚人在現場也是用他自己的手機', /人在現場也一樣用他自己的手機簽/.test(src));
  ok('　 為什麼沒有逃生門，寫在註解裡', /刻意\*\*沒有\*\*「現場簽」或「改用紙本」的逃生門/.test(src));
}

console.log('⑦-3 紙本：不擋，只在收款畫面多一行提醒');
{
  /* 2026-09-22：我本來做了一道紙本確認視窗（使用者「避免誤觸」），
     使用者接著問「會不會多此一舉」—— 一起收掉了，理由：
     ① 收款畫面本身不扣錢，誤觸只是開一張表單；真正動錢的是〔確認收款並開通〕
     ② 「櫃檯按一下表示紙本已簽」那種註記，紙在會員手上，沒有證明力，只是假紀錄
     留下這幾條反面斷言，擋著日後又把那道門加回來。 */
  ok('★★ 紙本沒有額外的確認視窗', !/openInstPaperAsk|instPaperOk/.test(src));
  ok('★★ openInstallNext 沒有「第二趟放行」的旗標（那是確認視窗才需要的）',
     /async function openInstallNext\(ticket_id\)\{/.test(src) && !/_paperOk/.test(src));
  const g=(src.match(/async function openInstallNext\(ticket_id\)\{[\s\S]*?\n\}/)||[''])[0];
  ok('★★ 改成收款畫面上的一行金色提醒',
     /const _paper=!!\(_ct && String\(_ct\.sign_type\|\|''\)==='paper'\);/.test(g)
     && /\$\{_paper\?`<div style="color:var\(--gold\);">紙本合約・記得請會員在紙本上補簽第 \$\{_sn\} 期<\/div>`:''\}/.test(g));
  ok('★ 只有紙本會出現那一行（電子與沒合約的都不會）',
     /String\(_ct\.sign_type\|\|''\)==='paper'/.test(g));
  ok('　 為什麼收掉那道門，寫在註解裡', /誤觸只是開了一張表單/.test(src));
}

console.log('⑧ 送出待簽只動合約，不碰錢也不開通');
{
  const f=(src.match(/async function instSignRequest\([\s\S]*?\n\}/)||[''])[0];
  ok('★★ 沒有碰 member_tickets', !/member_tickets/.test(f));
  ok('★★ 沒有寫收款／發票', !/purchases|invIssue|logTicket/.test(f));
  ok('★ 只有櫃檯以上能送', /if\(!\(isDeskLike\(\)\)\) return;/.test(f));
  ok('★ 同一期重送會覆蓋、不會長出兩格', /instSignsOf\(c\)\.filter\(x=>x&&Number\(x\.n\)!==Number\(n\)\)/.test(f));
  ok('★ 寫完清快取（不然櫃檯自己看不到剛送出的狀態）', /dbCacheClear\(\['contracts'\]\);/.test(f));
}

console.log('⑨ 資料庫那一半');
{
  const mg=fs.readdirSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations')
    .filter(f=>/pending_sign_n|installment_sign/.test(f));
  ok('★ migration 有進版控', mg.length>0, mg);
  const raw=mg.map(f=>fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/'+f,'utf8')).join('\n');
  /* ⚠ 先把 -- 註解剝掉再驗「沒有做某件事」—— 否則會命中我自己的註解
     （踩過三次了，見記憶 yugym-assert-hits-comment）。 */
  const t=raw.split('\n').map(l=>l.replace(/--.*$/,'')).join('\n');
  ok('★★ RPC 固定 search_path（security definer 的基本功）', /set search_path to 'public','pg_temp'/.test(t));
  ok('★★ 只認本人（current_member_id）', /current_member_id\(\)/.test(t));
  ok('★★ 簽完會把 pending_sign_n 清掉', /pending_sign_n = case when pending_sign_n = p_n then null/.test(t));
  ok('★★ 刻意不在 SQL 裡開通堂數 —— 開通整套住在前端 _confirmInstallNext，寫兩份會分岔',
     !/unlocked_sessions/.test(t));
  ok('★ 撤掉 public、只給 authenticated', /revoke all on function[\s\S]*?grant execute on function[\s\S]*?to authenticated/.test(t));
}

console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
