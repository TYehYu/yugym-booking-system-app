/* 「更新畫面」要能真的換到新版（2026-08-26 使用者：「我都重新登入了怎麼還沒更新」）

   真因不是部署失敗 —— 線上當時已經是新版。是兩件事疊在一起：
   ① GitHub Pages 給 index.html 的是 `cache-control: max-age=600`，
      所以按重新整理、甚至重新登入，10 分鐘內拿到的都還是同一份舊檔
      （登入只換 session，不會重抓頁面檔）。
   ② 而「更新畫面」那顆鈕原本只 dbCacheClear()＋navTo()，清的是**資料**快取，
      永遠換不了版。使用者按下去的期待是「給我最新的」，它卻做不到。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const SEG=src.slice(src.indexOf('async function verUpApplyIfNew()'), src.indexOf('/* 遠端變更簽章'));
function mk(serverVer){
  const log={toast:[], replaced:null, nav:0, cleared:0};
  const env={
    fetch:async()=>({ text:async()=>`x\nconst APP_VERSION = '${serverVer}';\ny` }),
    _verUpProbe:()=>'/app/?_vc=1',
    APP_VERSION:'260826.2254',
    showToast:t=>log.toast.push(t),
    location:{pathname:'/app/', replace:u=>{log.replaced=u;}},
    window:{}, dbCacheClear:()=>{log.cleared++;}, navTo:()=>{log.nav++;}, CUR_PAGE:'g_dashboard',
  };
  const o=new Function(...Object.keys(env), SEG+'\nreturn {verUpApplyIfNew,dashManualRefresh};')(...Object.values(env));
  return {o, log};
}

(async()=>{
console.log('① verUpApplyIfNew：伺服器版本不一樣才換頁');
{
  let {o,log}=mk('260826.2300');
  eq('★★ 伺服器是新版 → 回 true 並帶版本號重新載入（穿過 HTML 快取）',
     [await o.verUpApplyIfNew(), log.replaced], [true, '/app/?v=260826.2300']);
  ok('★ 換頁前先講一聲是第幾版', /有新版 260826\.2300，重新載入…/.test(log.toast.join('|')), log.toast);

  ({o,log}=mk('260826.2254'));
  eq('★★ 版本相同 → 不換頁（不要沒事就把頁面重載）',
     [await o.verUpApplyIfNew(), log.replaced], [false, null]);

  ({o,log}=mk(''));
  eq('　 讀不到版本號 → 當作沒有新版，不換頁', [await o.verUpApplyIfNew(), log.replaced], [false, null]);
}

console.log('\n② 更新畫面那顆鈕：清資料快取之外，也要能換版');
{
  let {o,log}=mk('260826.2300');
  await o.dashManualRefresh();
  eq('★★ 有新版 → 換頁，而且不再多跑一次 navTo（頁面正在卸載）',
     [log.replaced, log.nav], ['/app/?v=260826.2300', 0]);
  ok('　 資料快取照樣清（換頁前後都不吃虧）', log.cleared===1);
  ok('　 沒有印出「已更新」（那會讓人以為只是重畫）', !log.toast.includes('已更新'));

  ({o,log}=mk('260826.2254'));
  await o.dashManualRefresh();
  eq('★★ 沒有新版 → 維持原本行為：清快取、重畫、說「已更新」',
     [log.replaced, log.nav, log.cleared, log.toast.includes('已更新')], [null, 1, 1, true]);
}

console.log('\n③ 抓不到伺服器（離線）也不能把按鈕弄壞');
{
  const log={toast:[], nav:0, cleared:0, replaced:null};
  const env={
    fetch:async()=>{ throw new Error('offline'); },
    _verUpProbe:()=>'/app/', APP_VERSION:'260826.2254',
    showToast:t=>log.toast.push(t),
    location:{pathname:'/app/', replace:u=>{log.replaced=u;}},
    window:{}, dbCacheClear:()=>{log.cleared++;}, navTo:()=>{log.nav++;}, CUR_PAGE:'g_dashboard',
  };
  const o=new Function(...Object.keys(env), SEG+'\nreturn {verUpApplyIfNew,dashManualRefresh};')(...Object.values(env));
  await o.dashManualRefresh();
  eq('★★ 版本查詢失敗 → 吞掉錯誤，照舊清快取＋重畫',
     [log.replaced, log.nav, log.cleared, log.toast.includes('已更新')], [null, 1, 1, true]);
  ok('★ try/catch 包住，不讓網路問題把整顆鈕炸掉',
     /let jumped=false;\s*\n\s*try\{ jumped=await verUpApplyIfNew\(\); \}catch\(_\)\{\}/.test(src));
}

console.log('\n④ 原因寫在原地');
ok('★★ 使用者原話與真因（max-age=600 ＋ 登入不重抓頁面檔）',
   /我都重新登入了怎麼還沒更新/.test(src)
   && /GitHub Pages 給 index\.html 的是 `cache-control: max-age=600`/.test(src)
   && /登入只換 session，不會重抓頁面檔/.test(src));
ok('★★ 「這顆鈕原本永遠換不了版」寫出來',
   /而這顆鈕原本只清資料快取＋重畫，永遠換不了版/.test(src));
ok('★ 換頁時直接 return 的理由寫出來',
   /換頁時直接 return：後面的 navTo 會在卸載中的頁面上白跑一趟/.test(src));
ok('　 背景的版本提醒橫幅仍在（5 分鐘一次，HEAD 比 ETag）',
   /const VERUP_MS=300000;/.test(src) && /async function verUpCheck\(\)\{/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
