/* 2026-08-05 下午三連修（使用者附截圖）：
   ① 陳麗娟：舊匯入團課（member_ids 空、學員在 member_id）已簽到卻畫成紅圈超約 ——
      grpSeatAttCount 的 seatKeys 看不到名額，加「退回看整筆狀態」的舊資料退路
   ② 潘詩榆：今天才用完的票當天就掉進歷史紀錄 —— 票券夾 state 加「當天保留持有中」
   ③ 共享票戳記：非自己使用的維持原大小、自己預約的放大（取代 08-04 縮小版） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 舊匯入團課的簽到判定（實跑）');
{
  const fn=new Function(`
    const bkIsGroup=b=>b.category==='小班肌力';
    ${grabFn('mids')}
    ${grabFn('seatKeys')}
    ${grabFn('seatMid')}
    ${grabFn('attObj')}
    ${grabFn('grpSeatAttCount')}
    return grpSeatAttCount;`)();
  eq('★ member_ids 空＋member_id 已簽到 → 算 1（陳麗娟 3/21）',
     fn({category:'小班肌力',member_ids:[],member_id:'M1',attendance:{},status:'checked_in'},'M1'), 1);
  eq('★ 同型但還沒簽到 → 0', fn({category:'小班肌力',member_ids:[],member_id:'M1',attendance:{},status:'booked'},'M1'), 0);
  eq('　　別人的課 → 0', fn({category:'小班肌力',member_ids:[],member_id:'M2',attendance:{},status:'checked_in'},'M1'), 0);
  eq('　　正常名單逐名額判定不變（有點名以名額為準）',
     fn({category:'小班肌力',member_ids:['M1','M1'],member_id:null,attendance:{'M1':'checked_in'},status:'checked_in'},'M1'), 1);
}

console.log('\n② 今天用完的票留在持有中');
/* 2026-08-06 延伸（李曉娟案例）：門檻由「＝今天」放寬成「今天或以後」——
   提前登記的請假會讓票當場用畢，課都還沒上就掉進歷史。 */
ok('★ 票券夾 state：全用完但最後一堂是今天或以後 → 仍是 active',
   /else if\(total>0 && used>=total && bks\.some\(b=>isAtt\(b\)&&String\(b\.date\|\|''\)\.slice\(0,10\)>=today\)\) state='active';/.test(src));
ok('　　過期判定仍優先（規則不變）',
   src.indexOf("state='expired'") < src.indexOf("bks.some(b=>isAtt(b)&&String(b.date||'').slice(0,10)>=today)"));

console.log('\n③ 圓形卡尺寸（二修：整體放大、共享人縮小）');
ok('★ 基準圓點放大到 35px（原共享票「自己那顆」的尺寸）',
   /\.mtk\{position:relative;width:35px;height:35px;/.test(src));
/* 2026-08-06 使用者指示（附截圖）：共享的非本人圓點改成「周邊加金色圓框」，不再靠大小區分 */
ok('★ 共享人的戳記外圈套金環（尺寸與本人一致）',
   /\.mtk-sh\{position:relative;opacity:\.96;box-shadow:0 0 0 2px var\(--gold,#B48A56\);\}/.test(src)
   && !/\.mtk-sh\{transform:scale/.test(src));
ok('★ 列表迷你卡維持 26px 不動', /\.tkm-dots \.mtk\{width:26px;height:26px;/.test(src));
ok('　　混有共享戳記的標記邏輯保留（_hasSh／mtk-own）',
   /const _hasSh=\[\.\.\.done,\.\.\.booked\]\.some\(b=>b&&b\._shBy\);/.test(src)
   && /const _ownCls=b=>\(_hasSh&&!\(b&&b\._shBy\)\)\?' mtk-own':'';/.test(src));

console.log('\n③b 會員列表索引：多名額不重複塞（游晴雅二修）');
/* 同一人佔兩個名額時 member_ids 重複同一 id，_memBkIdx 一個名額塞一筆 →
   票券夾把同一堂處理兩遍、戳記翻倍畫成假超約紅圈。改成一堂一筆。 */
ok('★ _memBkIdx 一堂只塞一筆（_seen 去重）',
   /const _seen=\{\};\n\s*ids\.forEach\(mid=>\{\n\s*if\(!_seen\[mid\]\)\{ _seen\[mid\]=1; \(_memBkIdx\[mid\]=_memBkIdx\[mid\]\|\|\[\]\)\.push\(b\); \}/.test(src)
   && /名額數由票券夾依 member_ids 自行展開/.test(src));

console.log('\n④ 發點課種保險（DB 端）migration 留檔');
ok('★ 摘要檔存在＋涵蓋三件事',
   (()=>{ try{ const m=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_checkin_reward_category_guard.sql','utf8');
     return /benefit_type 誤標 coaching_session/.test(m) && /作廢 3 張/.test(m) && /只有 私人教練\/體驗/.test(m); }catch(_){ return false; } })());

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
