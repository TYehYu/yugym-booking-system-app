/* 主管展延：天數自己填（2026-09-29）

   使用者：「有教練或客人因為出國要手動展延有辦法嗎」→「要放寬 但是只給主管以上帳號權限」
   四個選擇（使用者逐項勾）：天數自己填 ／ 不限次數 ／ 要填原因 ／ 不影響退費。

   ⚠⚠ 這一支守的重點是「**不要**寫 extended_from 與 no_refund」——
     那兩個欄位是舊展延「一次為限＋不得退費」的旗標，寫下去就同時違反
     「不限次數」與「不影響退費」兩條。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 權限：主管以上，櫃檯沒有');
ok('★★★ isManagerUp＝管理員 或 is_manager（不含 front_desk）',
   /function isManagerUp\(\)\{ return !!\(SESSION && \(SESSION\.role==='admin' \|\| SESSION\.is_manager\)\); \}/.test(src));
{
  const F=grab('isManagerUp');
  const run=ses=>new Function('SESSION', F+'\nreturn isManagerUp();')(ses);
  eq('★★★ 管理員 ✓', run({role:'admin'}), true);
  eq('★★★ 主管（店長）✓', run({role:'coach',is_manager:true}), true);
  eq('★★★ 一般櫃檯 ✗', run({role:'front_desk'}), false);
  eq('★★★ 一般教練 ✗', run({role:'coach'}), false);
  eq('★★★ 會員 ✗', run({role:'member'}), false);
  eq('　 沒登入不會爆', run(null), false);
}
ok('★★★ 開窗與寫入**兩道**都擋（只擋開窗＝改 onclick 就能繞過）',
   (src.match(/if\(!isManagerUp\(\)\)\{ showToast\('自訂天數的展延只有管理員或主管可以操作'\); return; \}/g)||[]).length===2);
ok('★★ 按鈕只有主管以上看得到（兩張票券卡都是）',
   (src.match(/\$\{\(isManagerUp\(\)&&[^}]*openTicketExtendMgr/g)||[]).length===2);

console.log('\n② 四條規則');
{
  const D=grab('doTicketExtendMgr');
  const clean=D.replace(/\/\*[\s\S]*?\*\//g,' ');
  ok('★★★ 天數自己填（1～730，夾住避免打錯字變成十年）',
     /Math\.max\(1, Math\.min\(730, Number\(st\.days\)\|\|0\)\)/.test(D));
  ok('★★★⚠ 不寫 extended_from（那是「一次為限」的旗標，寫了第二次就按不動）',
     !/extended_from/.test(clean));
  ok('★★★⚠ 不寫 no_refund（不影響退費）', !/no_refund/.test(clean));
  ok('★★★ 原因必填', /if\(!why\)\{ showToast\('請填展延原因'\); return; \}/.test(D));
  ok('★★★ 原因寫進帳本，連同天數與前後日期',
     /`主管展延：\$\{from\} → \$\{to\}（\$\{days\} 天）｜原因：\$\{why\}`/.test(D));
  ok('★★ 展延完把過期的票收回可用（堂數本來就還在）',
     /if\(t\.status==='expired'\) t\.status='usable';/.test(D));
  ok('★★ 通知會員（他會想知道延到哪天）',
     /pushNotification\(t\.member_id,'announce','票券已展延'/.test(D));
  ok('★★ 已作廢／已退費的票擋在開窗那一步',
     /if\(\['refunded','void','cancelled'\]\.includes\(t\.status\)\)\{ showToast\('已作廢／已退費的票不能展延'\); return; \}/.test(grab('openTicketExtendMgr')));
}

console.log('\n③ 新到期日怎麼算');
{
  const F=grab('tkMgrExtTo');
  const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
  const TODAY=new Date(2026,8,29);   // 2026-09-29
  const run=(t,d)=>new Function('ymd','parseYmd','TODAY', F+'\nreturn tkMgrExtTo('+JSON.stringify(t)+','+d+');')(ymd,parseYmd,TODAY);
  eq('★★★ 還沒到期：從原到期日往後加', run({expire_date:'2026-12-31'},60), '2027-03-01');
  /* ⚠ 已經過期的票要從**今天**起算 —— 從舊到期日加 60 天，對一張去年到期的票等於沒延。 */
  eq('★★★ 已過期：從今天起算', run({expire_date:'2025-08-01'},60), '2026-11-28');
  eq('★★ 剛好今天到期：從今天起算', run({expire_date:'2026-09-29'},30), '2026-10-29');
  eq('★★ 沒有到期日（永久）也算得出來', run({},30), '2026-10-29');
  eq('　 跨月跨年不會錯', run({expire_date:'2026-12-20'},30), '2027-01-19');
}

console.log('\n④ 票券卡顯示：認得出這是哪一種展延');
{
  const I=grab('tkExtInfo');
  ok('★★★ 帳本認第三種格式（主管展延）', /x\.indexOf\('主管展延'\)>=0/.test(I));
  ok('★★★ 三種分開數：教練請假／主管／櫃檯',
     /nClv:mine\.filter\(isClv\)\.length,/.test(I)
     && /nMgr:mine\.filter\(isMgr\)\.length,/.test(I)
     && /nMan:mine\.filter\(l=>!isClv\(l\)&&!isMgr\(l\)\)\.length,/.test(I));
  /* ⚠ 不影響退費，所以用綠（品牌色強度：紅>金>綠），不是櫃檯展延那一枚金色的「不退費」。 */
  ok('★★★ 主管展延用綠標籤，不掛「不退費」',
     /\+\(e\.nMgr\?`　·　<b class="tkx tkx-clv">展延/.test(src)
     && /\+\(e\.nMan\?`　·　<b class="tkx tkx-man">展延（不退費）/.test(src));
  ok('★★ 效期那一段的 title 把三種列出來',
     /const _who=\[e\.nClv\?'教練請假展延':'', e\.nMgr\?'主管展延':'', e\.nMan\?'櫃檯展延':''\]/.test(src));
  ok('★★ 「不退費」那一枚仍然只跟著櫃檯展延',
     /\+\(e\.nMan\?` <b class="tkx tkx-man"\$\{_ti\}>不退費<\/b>`:''\)/.test(src));
}

console.log('\n⑤ 舊的那支一個字都沒動（兩條路各自的規則不能混）');
{
  const O=grab('doTicketExtend');
  ok('★★★ 舊展延仍然寫 extended_from ＋ no_refund（一次為限、不得退費）',
     /t\.extended_from=from;/.test(O) && /t\.no_refund=true;/.test(O));
  ok('★★★ 舊展延的天數仍然是原方案期限（不是自填）',
     /const to=tkExtendTo\(t\), days=tkPlanDays\(t\)/.test(O));
  ok('★★ 舊展延仍然一次為限', /if\(tkIsExtended\(t\)\)\{ showToast\('這張票券已經展延過了'\); return; \}/.test(O));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
