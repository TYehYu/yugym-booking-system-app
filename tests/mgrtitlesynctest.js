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

console.log('\n② 員工列表姓名格底色');
ok('★★★ 管理員一個底色、主管另一個（管理員優先）',
   /class="st-l-who\$\{c\.role==='admin'\?' st-who-adm':\(c\.is_manager\?' st-who-mgr':''\)\}"/.test(src));
ok('★★★ 用中性墨色，不借紅／金（那兩色是警示與次要提示，標常態身分會讀成有事發生）',
   /\.st-l-who\.st-who-adm\{background:color-mix\(in srgb,var\(--text-primary,#2b2b2b\) 10%,transparent\);\}/.test(src)
   && /\.st-l-who\.st-who-mgr\{background:color-mix\(in srgb,var\(--text-primary,#2b2b2b\) 5%,transparent\);\}/.test(src)
   && /不用紅或金/.test(src));
ok('★★★ 用負邊距把底色往外撐 —— 直接加 padding 會把名字往內推、整欄對不齊',
   /\.st-l-who\.st-who-adm,\.st-l-who\.st-who-mgr\{border-radius:9px;padding:3px 9px;margin:-3px -9px;\}/.test(src));
ok('★★ 左邊那條色帶仍是聘僱類型，沒有被搶走',
   /border-left:4px solid var\(--pc,#8a8478\);/.test(src)
   && /style="--pc:\$\{etc\};"/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
