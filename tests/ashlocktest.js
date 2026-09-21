/* 2026-09-21 使用者：「標題卡裡面是不是有被隱藏的選項 就算不能選也要顯示 在副標說明」

   「調整課程」那張清單原本有四項會**整列消失**：
     ・更換場地／指派代課 —— A.venue／A.sub 是從 _editable 推出來的，
       課程日一過就變成 null，整列不見
     ・更換課程 —— 條件不符就不畫
     ・補簽 —— 課程日還沒到就不畫
   使用者看到的是「這裡沒有這個功能」，不知道是因為過期、沒權限，還是已經綁票。
   「調整日期／時間」早就做對了（不能改時淡化＋原因寫副標），這支守的是其餘四項跟上。

   ⚠ 這支把 rows 的組裝真的跑起來，不是比對字串：
     「哪一列會出現、是不是淡化的、副標寫什麼」三件事只有實跑才看得準。
   ⚠ 反例同樣重要：自主訓練沒有教練，代課那列**本來就不該出現**——
     「不要隱藏」不等於「什麼都要列」，屬於別種課的選項列出來只是雜訊。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const i=src.indexOf('  const row=(onclick,label,sub,cls)=>`<button class="ash-eirow ash-ei-r');
const j=src.indexOf('  const _canDelBk =', i);
if(i<0||j<0) throw new Error('切不到「調整課程」清單的組裝段');
const body=src.slice(i,j);

/* 沙箱：只餵這一段用得到的東西。
   ⚠ 在 index.html 幫這一段加新依賴時，記得回來補 —— 少餵一個就 ReferenceError。 */
function run(b, A, opts){
  opts=opts||{};
  const fn=new Function('b','A','mids','bkIsCoachLeave','bkMoveBlockReason','ymd','TODAY',
    'bookingTypeName','bkDatePast','canCoachLeave','bkCoachLeaveSub','bkIsSelf','window',
    'fmtRange','bkUndoNoShow','grpMaxStep',
    body+'\nreturn rows;');
  return fn(b, A,
    x=>x.member_ids||[],
    x=>!!x.coach_leave,
    ()=>opts.mvBlk||'',
    d=>typeof d==='string'?d:'2026-09-21',
    '2026-09-21',
    x=>x.category||'課程',
    x=>String(x.date)<'2026-09-21',
    ()=>true, ()=>'', x=>x.category==='自主訓練',
    {}, (d,t)=>`${d} ${t}`, ()=>'', ()=>'');
}
// 解析出「每一列的標籤／副標／是不是淡化」
function rowsOf(html){
  return [...html.matchAll(/<button class="ash-eirow ash-ei-r([^"]*)"[\s\S]*?<span class="ash-eilb">([^<]+)<\/span>(?:\s*<span class="ash-eisub">([^<]*)<\/span>)?/g)]
    .map(m=>({label:m[2], sub:m[3]||'', off:/ash-ei-off/.test(m[1])}));
}
const find=(rs,l)=>rs.find(r=>r.label===l);

const BASE={id:'BK-1',date:'2026-09-23',start_time:'15:00',duration:60,
  category:'私人教練',status:'booked',member_ids:[],member_id:'MEM-1'};
const AFULL={staff:true,own:true,coachCk:true,closed:false,canCancel:true,isGroup:false,
  editable:true,venue:'any',sub:'sub',subLeave:null};

console.log('① 一般教練課・未來・已綁票（使用者回報的那張）');
{
  const rs=rowsOf(run(Object.assign({},BASE,{ticket_id:'TK-1'}), AFULL));
  ok('★★★ 更換課程不再消失，淡化並說明「已綁票券」',
     !!find(rs,'更換課程') && find(rs,'更換課程').off
     && /已綁票券/.test(find(rs,'更換課程').sub), find(rs,'更換課程'));
  ok('★★★ 補簽不再消失，淡化並說明「課程日還沒到」',
     !!find(rs,'補簽') && find(rs,'補簽').off
     && /課程日還沒到/.test(find(rs,'補簽').sub), find(rs,'補簽'));
  ok('★★ 可以用的那幾項維持可按（沒有被一起淡化）',
     ['調整日期／時間','更換場地','指派代課教練'].every(l=>find(rs,l) && !find(rs,l).off));
}

console.log('\n② 待簽約（沒綁票）→ 更換課程要可以按');
{
  const rs=rowsOf(run(Object.assign({},BASE,{pending_contract:true}), AFULL));
  const c=find(rs,'更換課程');
  ok('★★★ 可按，而且副標寫的是「還沒收款綁票」', !!c && !c.off && /還沒收款綁票/.test(c.sub), c);
}

console.log('\n③ 課程日已過（_editable=false → venue／sub 變 null）');
{
  const rs=rowsOf(run(Object.assign({},BASE,{date:'2026-09-10',ticket_id:'TK-1'}),
    Object.assign({},AFULL,{editable:false,venue:null,sub:null,subLeave:null}),
    {mvBlk:'已過期的預約無法調整'}));
  ok('★★★ 更換場地不再消失，寫出「課程日已過」',
     !!find(rs,'更換場地') && find(rs,'更換場地').off
     && /課程日已過/.test(find(rs,'更換場地').sub), find(rs,'更換場地'));
  ok('★★★ 指派代課不再消失，寫出「課程日已過」',
     !!find(rs,'指派代課教練') && find(rs,'指派代課教練').off
     && /課程日已過/.test(find(rs,'指派代課教練').sub), find(rs,'指派代課教練'));
  ok('★★ 補簽反而變成可按（過期的課才有補簽可言）',
     !!find(rs,'補簽') && !find(rs,'補簽').off);
  ok('★ 原因由 _lockWhy 統一產生（_editable 把四個理由揉成一個布林，印不出人話）',
     /const _lockWhy = \(\(\)=>\{/.test(src)
     && /if\(A\.closed\) return '這堂已經結束，不能再調整';/.test(src)
     && /if\(!\(A\.staff\|\|A\.own\)\) return '只有櫃檯以上或這堂的教練可以調整';/.test(src));
}

console.log('\n④ 反例：屬於別種課的選項不該列出來');
{
  const rs=rowsOf(run(Object.assign({},BASE,{category:'自主訓練',ticket_id:'TK-1'}),
    Object.assign({},AFULL,{venue:'self',sub:null,subLeave:null})));
  ok('★★★ 自主訓練沒有教練 → 代課那列完全不出現（不是淡化）',
     !find(rs,'指派代課教練'), rs.map(r=>r.label));
  ok('★ 場地那列給的是自主訓練的版本（可以改跑步機人數）',
     !!find(rs,'更換場地') && /跑步機/.test(find(rs,'更換場地').sub));
}

console.log('\n⑤ 淡化的那一列要真的按不動');
{
  const html=run(Object.assign({},BASE,{ticket_id:'TK-1'}), AFULL);
  const offBtns=[...html.matchAll(/<button class="ash-eirow ash-ei-r ash-ei-off" onclick="([^"]*)"/g)].map(m=>m[1]);
  ok('★★★ 淡化列的 onclick 是空的（不會點了沒反應、也不會誤觸）',
     offBtns.length>0 && offBtns.every(x=>x===''), offBtns);
  ok('★ .ash-ei-off 有對應的樣式（看起來就不像按鈕）', /\.ash-ei-off\{/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
