/* 取消・扣課不退也畫在行事曆上、蓋「未」章
   （2026-09-11 使用者：「扣課不退 一樣要畫在行事曆上 出席章用[未]」；江旻季 9/10 案例） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const line=name=>{ const i=src.indexOf('function '+name+'('); return src.slice(i, src.indexOf('\n',i)); };

const env=new Function('bkIsGroup', [line('bkShowsCancelled'), line('bkEatenCancel'), line('bkCalKeepsCancelled')].join('\n')
  +'\nreturn {bkShowsCancelled,bkEatenCancel,bkCalKeepsCancelled};')(b=>b.category==='小班肌力');
const keep=b=>env.bkCalKeepsCancelled(b);

console.log('① 哪些已取消的卡留在行事曆');
ok('★★★ 取消・扣課不退 → 留著（江旻季 9/10）', keep({status:'cancelled',refund_waived:true,category:'私人教練'})===true);
ok('★★★ 一般取消（有退票）→ 照舊不畫', keep({status:'cancelled',category:'私人教練'})===false);
ok('★★ 教練請假整堂取消的團課 → 照舊留著', keep({status:'cancelled',coach_leave:true,category:'小班肌力'})===true);
ok('★★ 櫃檯收起來（card_hidden）的扣課不退 → 不畫', keep({status:'cancelled',refund_waived:true,card_hidden:true})===false);
ok('★ 扣課不退不併進 bkShowsCancelled（那支也管暗化）', env.bkShowsCancelled({status:'cancelled',refund_waived:true,category:'私人教練'})===false);

console.log('\n② 行事曆兩道濾網都換成 bkCalKeepsCancelled');
ok('★★★ 撐時間軸那一道', src.includes("if(b.status==='cancelled' && !bkCalKeepsCancelled(b)) return;"));
ok('★★★ 畫卡那一道', src.includes("if(b.status==='cancelled' && !bkCalKeepsCancelled(b)) return false;"));
ok('★ 兩道都不再直接問 bkShowsCancelled', !src.includes("if(b.status==='cancelled' && !bkShowsCancelled(b)) return"));

console.log('\n③ 出席章');
ok('★★★ 扣課不退蓋金色「未」章（跟未到課同一個章）',
   /: \(bkEatenCancel\(b\) && !hideMember\)[^\n]*\n\s*\? `<span class="evc-check evc-noshow" title="取消・扣課不退">未<\/span>`/.test(src));
ok('★★ 排在未到課之前（取消的課 no_show 判斷會被 status 擋掉）',
   src.indexOf('title="取消・扣課不退">未') < src.indexOf('title="未到課">未'));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
