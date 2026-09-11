/* 團課不給課表鈕（2026-09-11 使用者：「課表按鈕的部分 團課就不用了」） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

const i=src.indexOf('function tlLoggable(');
const tlLoggable=new Function('bkIsSelf','bkIsGroup', src.slice(i, src.indexOf('\n',i))+'\nreturn tlLoggable;')(
  b=>b.category==='自主訓練', b=>b.category==='小班肌力');
ok('★★★ 團課不記課表', tlLoggable({category:'小班肌力'})===false);
ok('★★★ 自主訓練照舊不記', tlLoggable({category:'自主訓練'})===false);
ok('★★★ 一對一教練課照常記', tlLoggable({category:'一對一'})===true);
ok('★ 沒有課卡 → false', tlLoggable(null)===false);

ok('★★★ 兩處課表鈕都走 tlLoggable',
   /if\(!_calCtx && tlOwnsBk\(b\) && tlLoggable\(b\) && tlCanLog\(\)\)/.test(src)
   && /const _tlOk=tlLoggable\(b\) && tlCanLog\(\) && tlOwnsBk\(b\);/.test(src));
ok('★★ 進入點也擋（繞過畫面也開不了）', /if\(!tlLoggable\(b\)\)\{ showToast\('團課與自主訓練不記課表'\); return; \}/.test(src));
ok('★ 判團課用共用的 bkIsGroup，不自己比 category', /function tlLoggable\(b\)\{ return !!b && !bkIsSelf\(b\) && !bkIsGroup\(b\); \}/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
