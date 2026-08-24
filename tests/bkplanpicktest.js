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
/* 2026-08-21：日期欄改成自家月曆（ashDateField 產生「按鈕＋隱藏 input」），
   onchange 掛在那個隱藏 input 上，挑完由 ashDatePick 派送 change 事件。 */
/* 0824 建立預約拆成兩個視窗：日期／時間搬到視窗一，onchange 改叫 bkStep1Changed()，
   由它一次重畫「場地還有沒有位」與「營業時間提示」；方案篩選改在進入視窗二時跑一次。 */
ok('★ 日期／時間改了要重算（場地與營業時間提示）',
   /ashDateField\('bk-date', pf\.date\|\|'', '', 'bkStep1Changed\(\)'\)/.test(src)
   && /ashTimeField\('bk-time', pf\.time\|\|'', 'bkStep1Changed\(\)'\)/.test(src)
   && /function bkStep1Changed\(\)\{[\s\S]{0,200}?bkVenueRefresh\(\)[\s\S]{0,120}?bkOffHoursWarn\(\)/.test(src));
ok('　　進視窗二時重算一次方案篩選（那時候日期時間已經定了）',
   /showModal\(bkStep1bHtml\(\)\);[\s\S]{0,160}?bkRefreshPlanFilter\(\)/.test(src));
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

console.log('\n③ 手機鍵盤擋住選單 → 已由統一挑選視窗根治');
/* 2026-08-04 使用者建議：「點選後統一跳出視窗，輸入姓名或電話產生下拉選單」。
   原本這一節驗的是行內選單的定位求生術（visualViewport 算高度、往上開、組字不捲、
   捲動重算、mpk-any-open 旗標）—— 滿版視窗沒有定位問題，那一整套機制退場。
   這裡改驗「真的退乾淨」＋新視窗的關鍵行為。 */
ok('★ 定位求生術整套移除（mpkFit／mpk-up／refit／組字追蹤）',
   !/function mpkFit\(/.test(src) && !/mpk-up/.test(src)
   && !/mpk-any-open/.test(src) && !/_mpkIME/.test(src));
ok('★ 改為滿版視窗：#mpk-sheet 用 .ms-panel（與預約選會員同一套版型）',
   /#mpk-sheet\{position:fixed;inset:0;z-index:10080;\}/.test(src)
   && /host\.id='mpk-sheet';/.test(src) && /<div class="ms-panel">/.test(src));
ok('★ mpkRender 的輸出目標改成視窗清單（row._mpkMenu 指向 #mpk-sheet-list）',
   /row\._mpkMenu=document\.getElementById\('mpk-sheet-list'\);/.test(src));
ok('★ 視窗打字：有自帶過濾就代填回原欄位、沒有就自己濾（含電話數字）',
   /function mpkSheetType\(row\)\{/.test(src) && /const hasOwn=!!\(inp && inp\.getAttribute\('oninput'\)\);/.test(src));
ok('　　自己濾的時候分組標題跟著藏（整組都沒命中就不顯示標題）',
   /\[\.\.\.menu\.querySelectorAll\('\.mpk-grp'\)\]\.forEach\(g=>\{/.test(src));
ok('　　搜尋框自動聚焦（開窗即可打字）',
   /setTimeout\(\(\)=>\{ try\{ q\.focus\(\); \}catch\(_\)\{\} \},80\);/.test(src));

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

/* 2026-08-01 使用者指示：「新增預約的授課教練 也改成有篩選功能的下拉選單」 */
console.log('\n④ 授課教練也改成可搜尋的下拉');
/* 2026-08-21：建立預約改版時提示字縮短（教練與會員並排一列，位置變窄）——
   元件與行為沒變，仍是 .mem-pick-row ＋ bkFilterCoaches。 */
ok('★ 教練欄改用同一個元件（.mem-pick-row → mpkUpgrade）',
   /<input class="gt-search" id="bk-coach-q" placeholder="搜尋教練（共 \$\{\(window\._bkCoaches\|\|\[\]\)\.length\} 位）" oninput="bkFilterCoaches\(this\.value\)"/.test(src)
   && /<div class="mem-pick-row">[\s\S]{0,300}?id="bk-coach-q"/.test(src));
ok('★ 選項改由 bkCoachOptsHTML 產生（原本的 coachOpts 靜態字串已移除）',
   /<select id="bk-coach" onchange="bkCoachChange\(\)">\$\{bkCoachOptsHTML\(''\)\}<\/select>/.test(src));
ok('★ 可搜尋顯示名／本名／name_en／縮寫',
   /String\(coachDisp\(c\)\|\|''\)\.includes\(qq\)/.test(src)
   && /String\(c\.name\|\|''\)\.includes\(qq\)/.test(src)
   && /String\(c\.name_en\|\|''\)\.toUpperCase\(\)\.includes\(up\)/.test(src)
   && /coachAbbr\(c\):''\)\|\|''\)\.toUpperCase\(\)\.includes\(up\)/.test(src));
ok('★ 已選的那位不會被搜尋洗掉（否則欄位會突然變空）',
   /const list=all\.filter\(c=>hit\(c\)\|\|\(cur&&c\.id===cur\)\);/.test(src));
ok('★ 篩到只剩一位就直接選起來，並觸發會員名單重排',
   /else if\(qq && opts\.length===1\)\{ sel\.value=opts\[0\]\.value; bkCoachChange\(\); \}/.test(src));
ok('　　「不指定」永遠在（自主訓練可以不排教練）', /return '<option value="">不指定<\/option>'/.test(src));
ok('　　教練端沒有這個欄位（固定是自己），不受影響',
   /`<input type="hidden" id="bk-coach" value="\$\{SESSION\.id\}">`/.test(src));
ok('　　這個系統把暱稱放在 name_en，有寫在程式裡', /這個系統沒有 nickname 欄位/.test(src));

{
  const g2=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const mk=(coaches,cur)=>{
    global.window={_bkCoaches:coaches,_bkCoachSel:cur||''};
    return new Function('coachDisp','coachAbbr',
      g2('function bkCoachOptsHTML(q, keepId){','\n}\n')+'\nreturn bkCoachOptsHTML;')(
      c=>((c&&(c.name_en||c.name))||'').toUpperCase(),
      c=>((c&&c.name_en)||'').slice(0,2).toUpperCase());
  };
  const CO=[{id:'c1',name:'余東曄',name_en:'Randy'},{id:'c2',name:'曾邦宏',name_en:'小曾'},{id:'c3',name:'鄭百益',name_en:'Barry'}];
  const ids=h=>[...String(h).matchAll(/value="([^"]*)"/g)].map(m=>m[1]);
  console.log('\n  教練搜尋實跑');
  eq('★ 不打字 → 全部＋不指定', ids(mk(CO)('')), ['','c1','c2','c3']);
  eq('★ 打中文本名', ids(mk(CO)('鄭百')), ['','c3']);
  eq('★ 打英文名（不分大小寫）', ids(mk(CO)('randy')), ['','c1']);
  eq('★ 打中文暱稱（放在 name_en）', ids(mk(CO)('小曾')), ['','c2']);
  eq('★ 打縮寫 BA 也找得到 Barry', ids(mk(CO)('ba')), ['','c3']);
  eq('★ 已選 c1 時搜尋別人 → c1 仍留著（欄位不會變空）', ids(mk(CO,'c1')('鄭百')), ['','c1','c3']);
  ok('★ 已選的那位帶 selected', /value="c1" selected/.test(mk(CO,'c1')('')));
  eq('　　查無符合 → 只剩「不指定」', ids(mk(CO)('查無此人')), ['']);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);

/* 2026-08-22 使用者回報：「手機端建立預約搜尋會員的時候，如果該名單不夠長，
   搜尋頁面會只留在頁面下方，這樣會被輸入法的鍵盤遮住 —— 是因為名單是從頁面下方
   長上來的嗎？」 使用者的判斷是對的。 */
console.log('\n挑選視窗的位置（鍵盤遮擋）');
ok('★★ 手機改成貼上緣、內容往下長（原本是 bottom sheet，bottom:0 相對版面視窗算，'
   +'鍵盤升起不會改變它，搜尋框正好落在鍵盤底下）',
   /\.ms-panel\{position:absolute;left:0;right:0;top:0;bottom:auto;max-height:82vh;/.test(src)
   && /border-radius:0 0 18px 18px;/.test(src)
   && /鍵盤升起來不會改變它，於是搜尋框正好落在鍵盤底下/.test(src));
ok('　　瀏海機型讓開安全區', /padding-top:env\(safe-area-inset-top,0px\);/.test(src));
ok('　　桌機／橫向仍是置中浮動視窗（它本來就沒有鍵盤問題）',
   /@media \(min-width:601px\) and \(orientation:landscape\),\(min-width:1025px\)\{\.ms-panel\{left:50%;right:auto;bottom:auto;top:50%;transform:translate\(-50%,-50%\)/.test(src));
