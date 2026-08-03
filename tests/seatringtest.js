/* 2026-08-03 使用者指示（許佳慈 #13 團課 4 週優惠的截圖）：
   「第一名額跟第二名額圓課卡要分開來圈」

   同一人佔兩個名額 → 這張票上同一堂（8/3）有兩顆圓點；「本堂」圈選原本只比
   b.id===curId，兩顆都命中 → 兩列（第 1、第 2 個名額）各圈了兩顆。
   改成 ticketTokens 多收 seatN：第 N 個名額的列只圈第 N 顆命中的圓點。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

const deps={ tkVisual:()=>({accent:'#0a5044'}), bkIsSelf:()=>false, bkIsGroup:()=>true,
  grpSeatAttCount:()=>0, parseYmd, bkSelfBooked:()=>false };
const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));

/* 使用者的場景：4 堂票，B 堂（8/3）佔兩個名額、另約 8/7、8/11 */
const B={id:'B',date:'2026-08-03',start_time:'19:00',status:'booked'};
const T={id:'tk13',sessions_total:4};
const stamps=[B,B,{id:'C',date:'2026-08-07',status:'booked'},{id:'D',date:'2026-08-11',status:'booked'}];
const rings=h=>(h.match(/mtk-cur/g)||[]).length;
const ringAt=h=>[...h.matchAll(/<span class="mtk ([^"]*)"/g)].map(m=>/mtk-cur/.test(m[1])?1:0);

console.log('① 使用者的場景（兩個名額各自的列）');
{
  const r1=TT(T,stamps,{},0,'B','M',null,1);
  const r2=TT(T,stamps,{},0,'B','M',null,2);
  eq('★ 第 1 個名額的列：只圈第 1 顆 8/3', ringAt(r1), [1,0,0,0]);
  eq('★ 第 2 個名額的列：只圈第 2 顆 8/3', ringAt(r2), [0,1,0,0]);
  ok('　　其他日期（8/7、8/11）都不圈', rings(r1)===1 && rings(r2)===1);
}

console.log('\n② 相容性');
{
  const r0=TT(T,stamps,{},0,'B','M',null);
  eq('★ 沒帶 seatN 的呼叫端維持原樣（兩顆都圈；單人課同堂只有一顆不受影響）', ringAt(r0), [1,1,0,0]);
  const single=TT(T,[B,{id:'C',date:'2026-08-07',status:'booked'}],{},0,'B','M',null,1);
  eq('　　單名額＋seatN=1 圈那唯一一顆', ringAt(single), [1,0,0,0]);
  const rC=TT(T,stamps,{},0,'C','M',null,1);
  eq('　　curId 是別堂時照常只圈那堂', ringAt(rC), [0,0,1,0]);
}

console.log('\n③ 接線');
ok('★ 團課名單每列帶入自己的名額序', /ticketTokens\(_sl\.t,_sl\.stamps,st\.typeMap,_sl\.used,b\.id,mid,_sl\.selfBk,seatNo\(sk\)\)/.test(src));
ok('★ 三種圓點（已上/已預約/超額）都走同一支 _isCur',
   (src.match(/const cur=_isCur\(b\)\?' mtk-cur':'';/g)||[]).length===3);
ok('　　使用者的指示寫在程式裡', /「第一名額跟第二名額圓課卡要分開來圈」/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
