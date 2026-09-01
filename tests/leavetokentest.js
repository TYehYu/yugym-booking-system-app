/* 2026-08-04 使用者指示（徐翎娟 #1 團體課卡截圖）：「這兩堂超約要不要就收在那兩個打勾裡」

   請假政策＝本堂照扣、另發補課券 → 票上那一堂確實用掉了。圓形卡的逐名額判定
   原本只認「已簽到」，請假名額掉進「已預約」，票又已扣滿 → 畫成超約紅圈＋
   兩顆無日期的 ✓。改成請假名額也算已使用：實心、帶日期、紅圈消失。 */
const fs=require('fs');
require('./_bkenv.js');   // 教練請假退堂那條判準（0830 收斂成一支，見 _bkenv.js）
/* 2026-09-01：ticketTokens 的 md() 開始用 TODAY 判斷「這一堂是不是今年的」
   （跨年的圓點要多一行年份）—— 沙箱補上假時鐘，與各檔既有的測資年份一致。 */
if(typeof globalThis.TODAY==='undefined') globalThis.TODAY=new Date(2026,8,1);   // 2026-09-01
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

console.log('① 實跑 ticketTokens：請假名額收進實心');
{
  const MID='M1';
  const mids=b=>Array.isArray(b.member_ids)?b.member_ids:(b.member_id?[b.member_id]:[]);
  const deps={
    tkVisual:()=>({accent:'#1f6f54'}), bkIsSelf:()=>false, bkIsGroup:b=>!!b._grp,
    parseYmd, bkSelfBooked:()=>false, selfVenueLabel:()=>'',
    attObj:b=>b.attendance||{},
    seatKeys:b=>{ const c={}; return mids(b).map(id=>{ c[id]=(c[id]||0)+1; return c[id]>1?id+'#'+c[id]:id; }); },
    seatMid:k=>{ const s=String(k), i=s.indexOf('#'); return i<0?s:s.slice(0,i); },
    grpSeatAttCount:(b,mid)=>{ const att=b.attendance||{}; const c={}; let n=0;
      mids(b).forEach(id=>{ c[id]=(c[id]||0)+1; const k=c[id]>1?id+'#'+c[id]:id;
        if(String(id)===String(mid)&&att[k]==='checked_in') n++; }); return n; },
    /* 2026-08-06：請假的名額數抽成共用函式（票券夾與圓形卡吃同一支） */
    grpSeatLeaveCount:(b,mid)=>{ const att=b.attendance||{}; const c={}; let n=0;
      mids(b).forEach(id=>{ c[id]=(c[id]||0)+1; const k=c[id]>1?id+'#'+c[id]:id;
        if(String(id)===String(mid)&&att[k]==='leave') n++; }); return n; },
  };
  const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));
  // 徐翎娟情境：4 堂票、已扣滿（used=4）；7/3、7/18 已簽到，7/24、7/31 請假
  const T={id:'tk',sessions_total:4};
  const B=(id,d,att)=>({id,date:d,status:'checked_in',ticket_id:'tk',_grp:true,member_ids:[MID],attendance:{[MID]:att}});
  const stamps=[B('a','2026-07-03','checked_in'),B('b','2026-07-18','checked_in'),
                B('c','2026-07-24','leave'),B('d','2026-07-31','leave')];
  const h=TT(T,stamps,{},4,null,MID,null);
  eq('★ 沒有超約紅圈', (h.match(/mtk-over/g)||[]).length, 0);
  eq('★ 四顆實心', (h.match(/mtk-used/g)||[]).length, 4);
  ok('★ 請假的兩堂帶日期（不是無名的 ✓）', /7\/24/.test(h) && /7\/31/.test(h) && !/>✓</.test(h));
  /* 2026-08-06 使用者指示：「團課的請假，對會員來說算一堂簽到，圓形卡要填滿用紅色標示」 */
  eq('★ 請假那兩顆是紅色（mtk-leave），已簽到的兩顆不是', (h.match(/mtk-leave/g)||[]).length, 2);
  ok('★ 紅色那兩顆標的是請假的日期（7/24、7/31）',
     /mtk-used mtk-leave[^>]*title="請假（本堂照扣，另發補課券） 2026-07-24/.test(h)
     && /mtk-used mtk-leave[^>]*title="請假（本堂照扣，另發補課券） 2026-07-31/.test(h));
}

console.log('\n② 已簽到的行為不變（2026-08-03 逐名額實心）');
{
  ok('★ 逐名額判定仍在（簽到與請假各自計數，其他名額不跟著實心）',
     /_grpLeft\[b\.id\]=\{ok:grpSeatAttCount\(b, _mid\), lv:_lv\};/.test(src)
     && /if\(_q\.ok>0\)\{ _q\.ok--; return 'att'; \}/.test(src)
     && /if\(_q\.lv>0\)\{ _q\.lv--; return 'leave'; \}/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
