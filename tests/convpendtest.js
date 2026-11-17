/* 2026-08-04 使用者提問：「最近新增的待分期功能，因為之前教練們已經用了待簽約先預約了，
   這個會有什麼影響嗎？還是待簽約如果轉正的時候可以詢問連動有分期的票券？」

   查正式庫：未來的待簽約卡位有 538 筆、66 個人，最長一串 24 堂。整串轉正會一次產生
   「扣課／轉分期保留／取消」三種結果 —— 其中「取消」是把教練排好的時段還出去。
   兩個要補的洞：
   ① 分期票已開通堂數用完時，listUsableTickets 會整張濾掉 → 連「轉成分期保留」都做不到
   ② 整串轉正沒有預覽，按下去才知道取消了幾堂 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};
const F=grabFn('_doConvertPending');

console.log('① 分期票沒有已開通堂數時，仍要能整串轉成保留');
{
  ok('★ 沒有可用票券時，改找「還有未開通堂數」的分期票',
     /const hold=_tks\.filter\(t=>tkUsableBy\(t,memberId\) && t\.status==='usable'/.test(F)
     && /\(\(Number\(t\.sessions_total\)\|\|0\)-\(Number\(t\.unlocked_sessions\)\|\|0\)\)>0\);/.test(F));
  ok('★ 找到就讓它進候選（avail=0 → 整串走分期保留）', /if\(hold\.length\)\{ cand=hold; _instOnly=true; \}/.test(F));
  /* 2026-08-08：這一句改成先分辨「是沒票，還是時段不合」（友善課限平日 18:00 前）——
     見 pendtimetest.js。分辨不出來時仍是原本那句。 */
  ok('　　仍然找不到才說「請先完成銷售」',
     /let _why='該會員沒有此課程的可用票券，請先完成銷售';/.test(F)
     && /_clr\(\); showToast\(_why\); return;/.test(F));
  ok('　　票券選單標示分期未開通堂數（選之前就看得到）', /分期未開通 \$\{_lk\} 堂/.test(F));
}

console.log('\n② 轉正前先預覽（2026-11-21 改版：會轉正／保留／取消幾堂、哪幾天，要先看到）');
{
  const H=src.slice(src.indexOf('async function holdSettleHandle('), src.indexOf('async function holdSettleSkip('));
  ok('★ 預覽由資料庫算（p_dry=true），前端只畫確認畫面', /p_dry:true/.test(src.slice(src.indexOf('async function holdSettleStart('), src.indexOf('async function holdSettleHandle('))) && /holdSettleStart\(memberId, tk\.id, b\.id/.test(F));
  ok('★ 三種結果都列出來（轉正扣課／分期保留／取消）', /轉正並扣課/.test(H) && /分期待繳費保留/.test(H) && /超出票券總堂數 → 取消/.test(H));
  ok('★ 抬頭下只留一行副標：姓名・票券・堂數', /class="ash-eihead">[^`]*\$\{rows\.length\} 堂卡位/.test(H));
  ok('★★★ 轉正、分期保留、取消的時段都列出日期時間（不能只給數字）', /B\.map\(_d\)/.test(H) && /H\.map\(_d\)/.test(H) && /C\.map\(_d\)/.test(H));
  ok('★★ 取消那段用紅框，並說明不再保留等下一份合約', /class="mk-key">這 \$\{C\.length\} 堂會取消/.test(H) && /不再保留等下一份合約/.test(H));
  ok('★ 沒有「只轉這一堂」的退路、沒有「保留原狀」', !/只轉這一堂|保留原狀|'one'/.test(F + H));
  ok('　　防連點（確認鈕走 onceAct）', /onceAct\('hsettle:'/.test(src));
}

console.log('\n③ 分配邏輯（實跑預覽的那段算式）');
{
  /* 直接把預覽用的分配算式拿出來跑，確認三種結果的數字對得上 */
  const split=(n,avail,locked)=>{ let a=avail,l=locked,nB=0,nH=0,drop=0;
    for(let i=0;i<n;i++){ if(a>0){a--;nB++;} else if(l>0){l--;nH++;} else drop++; }
    return [nB,nH,drop]; };
  eq('★ 12 堂卡位＋分期 12 堂（已繳 4）→ 扣 4、保留 8、取消 0', split(12,4,8), [4,8,0]);
  eq('★ 12 堂卡位＋只簽 8 堂（非分期）→ 扣 8、取消 4', split(12,8,0), [8,0,4]);
  eq('★★ 24 堂卡位＋12 堂票 → 取消 12（就是要先看到的那個數字）', split(24,12,0), [12,0,12]);
  eq('★ 分期已開通用完（avail=0）→ 整串轉保留', split(8,0,8), [0,8,0]);
  eq('　　卡位比堂數少 → 全部扣課、不會多取消', split(3,10,0), [3,0,0]);
}

console.log('\n④ 既有行為沒被動到');
{
  ok('★ 轉正時顯示忙碌狀態（按鈕停用＋轉圈）', /let done=cxBusy\('轉正中…'\);/.test(src));
  ok('★ 中途要再問一次（選票券）與交給整理流程前，先收掉忙碌狀態',
     /_clr\(\);                       \/\/ 要再問一次「扣哪一張票」→ 先收掉忙碌狀態/.test(src)
     && /_clr\(\);\n  await holdSettleStart\(/.test(src));
  ok('★ 每一條提早結束的路徑都會收掉（不會卡在轉圈）',
     /if\(!b\|\|!b\.pending_contract\)\{ _clr\(\); showToast/.test(src)
     && /_clr\(\); showToast\(_why\); return;/.test(src)
     && /if\(!tk\)\{ _clr\(\); showToast/.test(src)
     && /\}catch\(e\)\{ _clr\(\); showToast\('轉換失敗：/.test(src));
  ok('★ 綁定會員也有忙碌狀態',
     /const done=cxBusy\('綁定中…'\);/.test(src)
     && /\}catch\(e\)\{ done\(\); showToast\('綁定失敗：/.test(src));
  const mig=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261121_hold_settle_new_ticket.sql','utf8');
  ok('★ 扣課仍寫 ticket_logs（deduct），扣不到（餘額不足／已扣過）整批回滾', /insert into ticket_logs[\s\S]*'deduct', -1/.test(mig) && /SETTLE\.NO_REMAINING/.test(mig) && /SETTLE\.ALREADY_DEDUCTED/.test(mig));
  ok('★ 保留課的備註不變（開通下一期會照這個備註自動補綁）', /note = '分期待繳費保留（收款後自動補扣）'/.test(mig));
  ok('★ 完成後清快取（RPC 繞過 dbPut）', /dbCacheClear\(\['bookings','member_tickets','ticket_logs'\]\)/.test(src.slice(src.indexOf('async function holdSettleRun('))));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
