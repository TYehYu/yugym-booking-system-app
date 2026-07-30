/* 今日收款提醒（2026-07-30 使用者指示，原「今日待簽約名單」）：
   櫃檯要一眼知道今天有哪些人要收款 —— 含團體課、含今天要簽約的新客戶，並標上課時間。

   團體課原本從來沒進過這份名單：判定是以「票券 → 綁到的預約」為主軸，但團課預約的
   ticket_id 一律 null（一筆多位學員，欄位放不下），索引裡撈不到，_lastBk 永遠是空的。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('改名（2026-07-30 二修：定名為「今日收款提醒」）');
ok('★ 首頁待辦列改成「今日收款提醒」', /'今日收款提醒',_l,_signByTime\.length,'ok',"openTodoList\('sign'\)"/.test(src)
   && !/'今日待簽約名單',_l,/.test(src));
ok('★ 展開的視窗標題也改了', /sign:\{title:'今日收款提醒'/.test(src));
ok('　　空狀態文案一致（兩處都是「今日無人待收款」）',
   (src.match(/今日無人待收款/g)||[]).length===2 && !/'今日無待簽約'/.test(src));
ok('　　說明講清楚收款對象與時間', /今天要向這些人收款[\s\S]{0,120}名字後面是上課時間/.test(src));

console.log('\n團體課要進名單（原本完全撈不到）');
ok('★ 團課改用會員層判定，不靠 ticket_id', /團課預約不綁 ticket_id（一筆多位學員，欄位放不下）/.test(src)
   && /if\(!kind && isGrp\)\{/.test(src));
ok('★ 條件＝團課餘額 0 且今天之後沒有別的團課預約',
   /const left=\(\(_memGrpLeft\[mid\]\|\|\{\}\)\.grp\)\|\|0;/.test(src)
   && /if\(left===0 && !\(_futGrpByMem\[mid\]>0\)\) kind='renew';/.test(src));
ok('　　未來的團課預約有先建索引（不是每人掃全表）', /const _futGrpByMem=\{\};/.test(src)
   && /if\(\(b\.date\|\|''\)\.slice\(0,10\)<=date\) return;/.test(src));
ok('　　同一筆團課多位學員各自判定（member_ids 展開）',
   /\(\(Array\.isArray\(b\.member_ids\)&&b\.member_ids\.length\)\?b\.member_ids:\(b\.member_id\?\[b\.member_id\]:\[\]\)\)\s*\n\s*\.forEach\(mid=>\{ _futGrpByMem/.test(src));
ok('　　標籤分得出是教練課還是團體課', /e\.tags\.add\(\(isGrp\?'團體課・':'教練課・'\)\+\(kind==='install'\?'分期繳費':'續課'\)\);/.test(src));

console.log('\n今天要簽約的新客戶');
ok('★ 待簽約卡位與分期待繳費保留都算', /if\(!b\.pending_contract\) return;/.test(src)
   && /'分期待繳費・':'新客戶簽約・'/.test(src));
ok('　　沒綁會員時用卡位填的客戶姓名', /\(b\.trial_name\|\|'客戶'\)/.test(src));
ok('　　已取消的不算', /if\(\(b\.date\|\|''\)\.slice\(0,10\)!==date \|\| b\.status==='cancelled'\) return;/.test(src));
ok('　　沒有會員 id 時該列不可點（走 tdl-static）', /\? `<div class="tdl-row tdl-row2">[\s\S]{0,200}: `<div class="tdl-row tdl-static">/.test(src));

console.log('\n時間標示');
ok('★ 名字旁邊標上課時間', /const tm=\(it\)=>it\.time\?`<span class="tdl-tm\$\{it\.pay\?' tdl-tm-pay':''\}">\$\{it\.time\}<\/span>`:'';/.test(src)
   && /\$\{it\.name\|\|'—'\}\$\{tm\(it\)\}\$\{tag\(it\)\}/.test(src));
ok('★ 待付費用品牌紅、一般續課用品牌金（紅 > 金 色階）',
   /\.tdl-tm\{[^}]*color:var\(--gold-d,#b48a56\);\}/.test(src)
   && /\.tdl-tm-pay\{[^}]*color:var\(--danger,#b5372e\);\}/.test(src));
ok('　　同一人同一天多堂 → 時間都列出來', /e\.times\.add\(String\(b\.start_time\)\.slice\(0,5\)\);/.test(src)
   && /time:\[\.\.\.e\.times\]\.sort\(\)\.join\('、'\)/.test(src));
ok('　　首頁摘要改成一個名字一列、時間在前（見 paygridtest）',
   /<span class="mc-td-line"><b>\$\{x\.time\|\|'—'\}<\/b>\$\{x\.name\}/.test(src));
ok('　　時間用等寬數字排版', /\.tdl-tm\{[^}]*font-family:var\(--num\),inherit;/.test(src));

console.log('\n排序：待處理在前，然後照上課時間');
ok('★ 已續約／不續約排後面，其餘依時間再依姓名',
   /const w=x=>x\.rs==='renewed'\?2:\(x\.rs==='declined'\?3:\(x\.rs==='considering'\?1:0\)\);/.test(src)
   && /String\(a\.time\|\|'99:99'\)\.localeCompare\(String\(b\.time\|\|'99:99'\)\)/.test(src));
ok('　　沒有時間的排最後（99:99）', /'99:99'/.test(src));

/* ── 用真實情境跑一次判定邏輯 ───────────────────────────── */
console.log('\n判定邏輯實跑');
{
  const date='2026-07-30';
  const mk=(id,d,ids,cat)=>({id,date:d,start_time:'11:00',status:'booked',category:cat||'小班肌力',member_ids:ids});
  const build=(bookings,memGrpLeft)=>{
    const futGrp={};
    bookings.forEach(b=>{
      if(b.category!=='小班肌力'||b.status==='cancelled') return;
      if((b.date||'').slice(0,10)<=date) return;
      (b.member_ids||[]).forEach(mid=>{ futGrp[mid]=(futGrp[mid]||0)+1; });
    });
    const out=[];
    bookings.forEach(b=>{
      if((b.date||'').slice(0,10)!==date||b.status==='cancelled') return;
      if(b.category!=='小班肌力') return;
      (b.member_ids||[]).forEach(mid=>{
        const left=((memGrpLeft[mid]||{}).grp)||0;
        if(left===0 && !(futGrp[mid]>0)) out.push(mid);
      });
    });
    return out;
  };
  eq('★ 餘額 0、之後沒課 → 今天是最後一堂，要收款',
     build([mk('a',date,['M'])],{}), ['M']);
  eq('★ 餘額 0 但下週還有課 → 還沒到最後一堂，不列',
     build([mk('a',date,['M']),mk('b','2026-08-06',['M'])],{}), []);
  eq('★ 還有餘額 → 不列', build([mk('a',date,['M'])],{M:{grp:2}}), []);
  eq('　　下週的課取消了就照樣算最後一堂',
     build([mk('a',date,['M']),{...mk('b','2026-08-06',['M']),status:'cancelled'}],{}), ['M']);
  eq('　　同一堂多位學員各自判定（另一位還有餘額）',
     build([mk('a',date,['M','N'])],{N:{grp:3}}), ['M']);
  eq('　　同一人佔兩個名額只會被列出對應次數（去重交給 _signBy）',
     build([mk('a',date,['M','M'])],{}), ['M','M']);
  eq('　　教練課不走這條（由票券判定）', build([mk('a',date,['M'],'私人教練')],{}), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
