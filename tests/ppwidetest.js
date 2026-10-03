/* 編輯員工資料視窗三處版面調整（2026-10-03）

   ① 地址併進基本資料 —— 原本「地址」自己一張卡，裡面只有一個欄位，
      卡標題＋留白＋邊框比欄位本身還高。
   ② 固定休、預設班別跨兩欄 —— 這兩個是一整排可點的格子（七天／四種班別），
      不是一個輸入框，擠在半欄會折行或被切掉右邊那幾格。
   ③ 拿掉「薪資規則 ›」那張跳轉卡 —— 員工資料本身就是浮動視窗，
      按下去 openHrSalary 再開一個 modal，兩個疊在一起，
      關掉上面那個會連底下的一起關，回不到原本的分頁。

   ⚠ 三處都只動版面：欄位 id、儲存邏輯、算薪程式一個字都沒碰（④ 段守住）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('找不到 '+n);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}throw new Error('括號不成對 '+n);};
/* ⚠ 斷言「某句已移除」要先剝註解 —— 說明文字裡一定會提到被移除的東西（踩過六次） */
const bare=src.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/^\s*\/\/.*$/gm,' ');

console.log('① 地址併進基本資料');
{
  /* 員工那一份 schema（會員有自己的一份，不要動到） */
  const E=src.slice(src.indexOf('  employee:{'));
  const B=E.slice(E.indexOf("basic:[{ title:'基本資料'"), E.indexOf("{ title:'緊急聯絡人'"));
  ok('★★★ 戶籍地址在基本資料卡裡', /\{ id:'address_registered', label:'戶籍地址', wide:true/.test(B));
  ok('★★★ 獨立那張「地址」卡已經收掉', !/\{ title:'地址', one:true/.test(bare));
  ok('★★★ 地址跨兩欄（一整行字，半欄會被截斷）', /label:'戶籍地址', wide:true/.test(B));
  ok('★★ 欄位 id 沒變（儲存是照 id 讀的）', /id:'address_registered'/.test(src));
  ok('★★ 空的時候仍然收進「＋ 補充」（addLabel 留著）', /wide:true, addLabel:'新增地址'/.test(B));
  /* ⚠ 會員那一份有自己的地址區塊，不在這次範圍 */
  ok('★★ 沒有動到會員那一份 schema',
     src.indexOf("  member:{") < src.indexOf("  employee:{"));
}

console.log('\n② 固定休、預設班別跨兩欄');
{
  ok('★★★ 兩個都標了 wide',
     /\{ id:'fixed_off_days', label:'固定休', custom:'offDays', wide:true \}/.test(src)
     && /\{ id:'default_shift',  label:'預設班別', custom:'shiftRadio', wide:true \}/.test(src));
  ok('★★ 同一張卡裡的「可代課」維持半欄（它就是一個勾選）',
     /\{ id:'can_substitute', label:'可代課', type:'checkbox'/.test(src)
     && !/id:'can_substitute'[^}]*wide:true/.test(src));
  /* ⚠ 1/-1 不是 1/3：手機上這個 grid 會變單欄，寫死 3 會溢位 */
  ok('★★★ CSS 用 grid-column:1/-1（手機變單欄也不會溢位）',
     /\.pp-f-wide\{grid-column:1\/-1;\}/.test(src));
  ok('★★★ 理由寫在原地', /1\/-1 不是 1\/3：手機上這個 grid 會變單欄，寫死 3 會溢位/.test(src));
}

console.log('\n③ 補 class 的做法');
{
  const C=grabFn('ppCardHtml');
  /* ⚠ ppFieldEdit／ppFieldView 各有七八個 return，一個一個加遲早漏掉一個 ——
       漏掉的症狀是「只有某一種欄位沒變寬」，很難對上原因。 */
  ok('★★★ 在 ppCardHtml 統一補，不是在每個 return 分支改',
     /return \(h && f\.wide\) \? h\.replace\('class="pp-f"','class="pp-f pp-f-wide"'\) : h;/.test(C));
  ok('★★★ 檢視與編輯兩種模式都吃得到',
     /const h = PP\.editing\?ppFieldEdit\(f\):ppFieldView\(f\);/.test(C));
  /* replace 只換第一個，也就是最外層那個 div；裡面的 pp-f-l／pp-f-v 不受影響 */
  ok('★★ 只換最外層（replace 不帶 g）', !/replace\(\/class="pp-f"\/g/.test(C));
  /* 空字串＝這個欄位被收進「＋ 補充」，不要補 class（會補到空字串上） */
  ok('★★★ 空欄位（收進＋補充的）不處理', /\(h && f\.wide\)/.test(C));
  ok('★★ 收斂成「＋ 補充」那一段沒被改壞',
     /const emptyFs = PP\.editing \? \[\] : sec\.fields\.filter\(\(f,i\)=>views\[i\]===''\);/.test(C));

  /* 實跑一次：wide 的那個要多一個 class，沒標的不可以被動到 */
  const run=(editing)=>{
    const F=new Function('PP','ppFieldEdit','ppFieldView','ppSecTitle','return '+grabFn('ppCardHtml'))(
      {editing:editing, id:'E1'},
      f=>`<div class="pp-f"><span class="pp-f-l">${f.label}</span><span class="pp-f-v">E</span></div>`,
      f=>`<div class="pp-f"><span class="pp-f-l">${f.label}</span><span class="pp-f-v">V</span></div>`,
      t=>`<div class="pp-card-t">${t}</div>`);
    return F({title:'排班規則', fields:[
      {id:'can_substitute',label:'可代課'},
      {id:'fixed_off_days',label:'固定休',wide:true}]});
  };
  for(const [nm,ed] of [['編輯模式',true],['檢視模式',false]]){
    const h=run(ed);
    eq(`★★★ ${nm}：wide 的那個補到 class`, (h.match(/class="pp-f pp-f-wide"/g)||[]).length, 1);
    eq(`★★★ ${nm}：沒標的維持原樣`, (h.match(/class="pp-f"/g)||[]).length, 1);
    ok(`★★ ${nm}：欄位內容沒被動到`, h.indexOf('可代課')>0 && h.indexOf('固定休')>0);
  }
}

console.log('\n④ 跳轉卡拿掉了，但入口沒有少');
{
  ok('★★★ schema 裡的「值班與薪資制度」那一段已移除',
     !/\{ title:'值班與薪資制度', link:true, fields:\[\] \}/.test(bare));
  ok('★★★ ppCardHtml 的 sec.link 分支也一起拆掉（留著是死碼）',
     !/if\(sec\.link\)\{/.test(bare));
  ok('★★★ 全檔沒有第二個 openHrSalary 的視窗內入口',
     !/ppRecCard\('money','薪資規則'/.test(bare));
  /* ⚠ 入口不能少：薪資分頁右上角那顆（2026-09-30 加的）必須還在 */
  ok('★★★ 員工卡薪資分頁右上角那顆還在',
     /<button class="btn btn-ghost btn-sm pp-rulebtn" onclick="openHrSalary\('\$\{PP\.id\}'\)">薪資規則<\/button>/.test(src));
  ok('★★★ 為什麼拿掉寫在原地（兩個 modal 疊在一起）',
     /按下去 openHrSalary 再開一個 modal，\s*\n\s*兩個視窗疊在一起/.test(src));
  /* ppRecCard 現在沒有呼叫點，但刻意留著當語彙範本 —— 要留就要寫清楚 */
  ok('★★ ppRecCard 留著並註明已無呼叫點', /全檔沒有呼叫點了/.test(src));
  ok('★★ 其他區塊都還在（職務與到職／排班規則／特休／銀行帳戶）',
     ["{ title:'職務與到職'","{ title:'排班規則'","{ title:'特休'","{ title:'銀行帳戶'"]
       .every(s=>src.indexOf(s)>0));
}

console.log('\n⑤ 薪資與儲存完全沒被動到');
{
  ok('★★★ 算薪那幾支一個字都沒改',
     /const ptPay=ptDone\*\(emp\.pt_rate\|\|0\);/.test(src)
     && /function calcPtBonus\(cfg, ptDone\)\{/.test(src)
     && /function isPtPayClass\(b\)\{ return !!b && b\.category==='私人教練'; \}/.test(src));
  ok('★★★ wide 只是版面旗標，沒有任何地方拿它判斷資料',
     !/wide[\s\S]{0,80}(dbPut|PAY_RULE_KEYS|calcSalary)/.test(src));
  ok('★★ 固定休與預設班別的存檔仍走原本那兩支',
     /if\(f\.custom==='offDays'\)\{/.test(src) && /if\(f\.custom==='shiftRadio'\)\{/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
