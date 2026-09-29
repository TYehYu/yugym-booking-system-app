/* 主管權限開關連動職稱 ＋ 員工列表姓名格底色（2026-09-09 使用者指示）：
   「你剛剛說的把沛瀞手動改成主管　這一個動作跟權限開關沒有連動嗎」→「權限開關要連動」
   「員工列表姓名這邊　管理員跟主管是不是可以加個底色方便區分」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 連動只有單向：開關 → 職稱');
{
  const F=new Function('_MGR_TITLES','return '+g('function stSyncMgrTitle(c, on){','\n}'))(['','主管','店長']);
  const t=(job,on)=>{ const c={job_title:job}; F(c,on); return c.job_title; };
  eq('★★★ 打開 → 職稱寫「主管」（原本是空的）', t('',true), '主管');
  eq('★★★ 打開 → 舊稱「店長」一併正名（黃沛瀞就是這個狀況）', t('店長',true), '主管');
  eq('★★★ 刻意填的職稱不動：老闆／行政／教練／工讀',
     ['老闆','行政','教練','工讀'].map(x=>t(x,true)), ['老闆','行政','教練','工讀']);
  eq('★★ 關掉 → 只清掉我們寫進去的那兩種', [t('主管',false), t('店長',false)], ['','']);
  eq('★★ 關掉時一樣不動別的職稱', t('行政',false), '行政');
  eq('★★ 沒有 c 也不會爆', (()=>{ try{ F(null,true); return 'ok'; }catch(e){ return String(e); } })(), 'ok');
}
ok('★★★ **不做**反向（改職稱就給權限）—— is_manager 給的是排班權限、津貼與獎金池',
   /\*\*只單向\*\*：開關 → 職稱。反過來（改職稱就給權限）不做/.test(src)
   && !/job_title==='主管'[\s\S]{0,80}is_manager\s*=\s*true/.test(src));
ok('★★★ 兩個入口都接上（列表的開關、薪資規則的勾）',
   /else if\(key==='manager'\)\{ c\.is_manager = on; stSyncMgrTitle\(c, on\); \}/.test(src)
   && /c\.is_manager=ck\('hr-ismgr'\);\s*\n\s*stSyncMgrTitle\(c, c\.is_manager\);/.test(src));
ok('★★ 只有兩處寫 is_manager，都同步到了（沒有第三條漏網的路）',
   (src.match(/c\.is_manager\s*=\s*/g)||[]).length===2);
ok('★★ 職稱下拉仍留著「店長（舊稱）」，舊資料看得到',
   /\['店長','店長（舊稱）'\]/.test(src));

console.log('\n② 員工列表的職等標示');
/* 2026-09-29：姓名格底色（0909）→ 姓名前一枚章（六種樣式裡使用者選了「只有一枚章」）。
   ⚠ 整列底色改成聘僱類型 20% 之後，姓名格再加一塊底色就變成色塊疊色塊。 */
ok('★★★ 管理員與主管各一枚章（管理員優先）',
   /const _lv=c\.role==='admin'\?'adm':\(c\.is_manager\?'mgr':''\);/.test(src)
   && /<span class="st-lv st-lv-\$\{_lv\}">/.test(src));
/* ⚠ 章上的字用職稱（老闆／主管），判準仍是權限 —— 職稱給人看、權限給系統認 */
ok('★★★ 章上寫職稱，沒填才退回權限名稱',
   /escH\(c\.job_title\|\|\(_lv==='adm'\?'管理員':'主管'\)\)/.test(src));
ok('★★★ 兩階同一枚章、只差質感（老闆加漸層與陰影，不換色）',
   /\.st-lv\{[\s\S]{0,200}?background:var\(--gold-d,#8A6E42\);\}/.test(src)
   && /\.st-lv-adm\{background:linear-gradient\(135deg,#C9A227,var\(--gold-d,#8A6E42\)\);/.test(src));
ok('★★ 舊的姓名格底色已經收掉（不留死 class）',
   !/st-who-adm|st-who-mgr/.test(src.replace(/\/\*[\s\S]*?\*\//g,' ')));
ok('★★ 章不會把名字擠掉（只佔幾個字寬，margin-right 6px）',
   /\.st-lv\{[\s\S]{0,160}?margin-right:6px;/.test(src));
ok('★★ 左邊那條色帶仍是聘僱類型，沒有被搶走',
   /border-left:4px solid var\(--pc,#8a8478\);/.test(src)
   && /style="--pc:\$\{etc\};"/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
