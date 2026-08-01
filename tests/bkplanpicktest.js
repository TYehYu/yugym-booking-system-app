/* 2026-08-01 使用者指示（兩件）：
   ①「新增預約的方案卡 點了以後會員名單要篩選有該方案的會員 方便預約」
   ②「手機版在輸入會員姓名的時候選單會被遮擋」（附截圖：iOS 鍵盤蓋住往下開的選單） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('① 點方案卡 → 會員名單依「有沒有這個方案」分組');
ok('★ 點卡片時會重算名單', /bkRefreshPlanFilter\(\);   \/\/ 2026-08-01：點方案卡/.test(src));
ok('★ 判定用 tkFitsBooking（與步驟 2 挑票、送出防呆同一支）',
   /if\(mid && !set\[mid\] && tkFitsBooking\(tk,mid,tid,d,tm,cnt\)\) set\[mid\]=1;/.test(src));
ok('★ 共享票的共享者也要算得到',
   /const cands=\[tk\.member_id\]\.concat\(tkSharedIds\(tk\)\|\|\[\]\);/.test(src));
ok('★ 體驗課不綁票券 → 不篩（篩了會變空名單）',
   /t\.category!=='體驗'/.test(src) && /tid!=='__facility'/.test(src));
ok('★ 日期／時間改了要重算（限時段票與效期會變）',
   /id="bk-date"[^>]*onchange="bkRefreshPlanFilter\(\)"/.test(src)
   && /id="bk-time" onchange="bkRefreshPlanFilter\(\)"/.test(src));
ok('★ 每次開窗歸零，不留上一次的名單',
   /window\._bkPlanIds=null; window\._bkPlanName='';   \/\/ 每次開窗/.test(src));
ok('　　超約／分期未開通／過期／限時段都算進去（因為走 tkFitsBooking）',
   /if\(tkOverBooked\(t,bkCntByTicket\)\) return false;/.test(src)
   && /if\(!\(tkUnlockedLeft\(t\)>0\)\) return false;/.test(src));
ok('　　教練連動仍在（有方案的那組內部把該教練的會員提前，且是穩定排序）',
   /\.sort\(\(x,y\)=>\(x\.default_coach_id===cid\?0:1\)-\(y\.default_coach_id===cid\?0:1\)\)/.test(src));
ok('　　沒選教練就不重排（維持名單原順序，不順手改成依姓名排）',
   /沒選教練就維持名單原本的順序/.test(src));
ok('　　是「排序＋標示」不是硬篩掉，理由寫在程式裡',
   /不會做出讓人選不到人的死路/.test(src));

{
  /* 實跑分組：把 bkMemberOptsHTML 抽出來，注入假的相依 */
  const mk=(members, planIds, planName, coachSel)=>{
    global.window={_bkAllMembers:members,_bkPlanIds:planIds,_bkPlanName:planName,_bkCoachSel:coachSel||'',_bkCoaches:[{id:'C1',name:'教練甲'}]};
    return new Function('normPhone','fmtPhone','coachDisp','BK_MEM_CAP',
      g('function bkMemberOptsHTML(q, keepId){','\n}\n')+'\nreturn bkMemberOptsHTML;')(
      x=>String(x||''), x=>String(x||''), c=>c.name||'', 40);
  };
  const M=(id,name,coach)=>({id,name,phone:'0900',default_coach_id:coach||null});
  const mem=[M('a','甲','C1'),M('b','乙'),M('c','丙','C1'),M('d','丁')];
  const grpLabels=h=>[...String(h).matchAll(/<optgroup label="([^"]+)"/g)].map(m=>m[1]);
  const idsIn=(h,label)=>{
    const i=String(h).indexOf(`label="${label}"`); if(i<0) return [];
    const seg=String(h).slice(i, String(h).indexOf('</optgroup>', i));
    return [...seg.matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
  };

  console.log('\n  分組實跑');
  {
    const h=mk(mem,{a:1,d:1},'教練課')('');
    eq('★ 分成「有方案」與「其他」兩組',
       grpLabels(h), ['有「教練課」可用的會員（2）','其他會員（2）']);
    eq('★ 有方案的那兩位在第一組（維持原順序）', idsIn(h,'有「教練課」可用的會員（2）'), ['a','d']);
    eq('　　其他人仍找得到（不是硬篩掉）', idsIn(h,'其他會員（2）'), ['b','c']);
  }
  {
    const h=mk(mem,{},'運動按摩')('');
    ok('★ 沒有人持有 → 明講而不是空白',
       /沒有會員持有「運動按摩」的可用票券/.test(h) && grpLabels(h).length===1, grpLabels(h));
  }
  {
    // 甲(a) 掛 C1、乙(b) 與 丁(d) 沒掛 → a 提前，b/d 維持原順序
    const h2=mk(mem,{a:1,b:1,d:1},'教練課','C1')('');
    eq('★ 有方案那組內部：該教練的會員排前面', idsIn(h2,'有「教練課」可用的會員（3）'), ['a','b','d']);
  }
  {
    const h=mk(mem,null,'')('');
    eq('　　沒選方案 → 維持原本的全名單（不分組）', grpLabels(h), []);
  }
  {
    const h=mk(mem,{a:1,d:1},'教練課')('甲');
    eq('★ 搜尋仍然有效（搜尋後只剩甲，且他有方案）',
       idsIn(h,'有「教練課」可用的會員（1）'), ['a']);
  }
}

console.log('\n② 自訂選單畫出分組標題（否則分組只剩排序，看不出來）');
ok('★ 走 sel.children 逐一處理 OPTGROUP', /if\(ch\.tagName==='OPTGROUP'\) html\+=`<div class="mpk-grp">/.test(src));
ok('★ data-i 仍是 sel.options 的索引（mpkChoose 靠它取值）', /data-i="\$\{opts\.indexOf\(o\)\}"/.test(src));
ok('★ 停用的提示列點不到（給 mpk-none）', /\$\{o\.disabled\?' mpk-none':''\}/.test(src));
ok('　　分組標題有樣式', /\.mpk-grp\{padding:8px 11px 3px;/.test(src));

console.log('\n③ 手機鍵盤擋住選單');
ok('★ 用 visualViewport.height 算真正看得到的高度（鍵盤高度沒有 API）',
   /const vv=window\.visualViewport;/.test(src) && /const vh=\(vv&&vv\.height\)\|\|window\.innerHeight\|\|0;/.test(src));
ok('★ 下方放不下且上方比較寬 → 選單往上開',
   /const up = below<180 && above>below;/.test(src) && /row\.classList\.toggle\('mpk-up', up\);/.test(src));
ok('★ 往上開的樣式（改用 bottom 定位）',
   /\.mem-pick-row\.mpk-up \.mpk-menu\{top:auto;bottom:calc\(100% \+ 4px\);\}/.test(src));
ok('★ 兩邊都窄 → 把輸入框捲到可視區中間',
   /if\(Math\.max\(below,above\)<180\)\{ try\{ inp\.scrollIntoView\(\{block:'center'\}\); \}catch\(_\)\{\} \}/.test(src));
ok('★ 選單高度跟著可用空間縮，不會撐破畫面',
   /menu\.style\.maxHeight=Math\.max\(120,Math\.min\(300,\(up\?above:below\)-8\)\)\+'px';/.test(src));
ok('★ 鍵盤升起／收合／捲動時重算', /window\.visualViewport\.addEventListener\('resize', refit\);/.test(src)
   && /window\.visualViewport\.addEventListener\('scroll', refit\);/.test(src));
ok('　　開啟選單時就先算一次', /function mpkOpen\(row\)\{ row\.classList\.add\('mpk-open'\); mpkRender\(row\); mpkFit\(row\); \}/.test(src));
ok('　　打字讓清單變短時也重算（input 走 mpkOpen）',
   /inp\.addEventListener\('input',\(\)=>\{ mpkOpen\(row\); \}\);   \/\/ mpkOpen 內含 mpkFit/.test(src));
ok('　　整段包 try —— 量不到尺寸不能讓選單開不起來', /function mpkFit\(row\)\{\s*\n\s*try\{/.test(src));

{
  // 實跑翻轉判定
  const decide=(vh, top, bottom)=>{
    const below=vh-bottom-12, above=top-12;
    return { up: below<180 && above>below, maxH: Math.max(120,Math.min(300,((below<180&&above>below)?above:below)-8)) };
  };
  console.log('\n  翻轉實跑');
  eq('★ 截圖情境：鍵盤升起後下方只剩約 20px → 往上開', decide(1150,1050,1130).up, true);
  eq('　　桌機／沒鍵盤：下方很寬 → 維持往下開', decide(900,300,340).up, false);
  eq('　　上下都很窄 → 仍選比較寬的那邊', decide(400,150,190).up, false);
  eq('　　選單高度封頂 300', decide(2000,100,140).maxH, 300);
  eq('　　空間很小時仍取比較寬的那一邊（上方 238 → 230）', decide(300,250,280).maxH, 230);
  eq('　　真的兩邊都極窄時保底 120', decide(200,80,120).maxH, 120);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
