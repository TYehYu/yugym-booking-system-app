/* 今日備註（2026-10-14 使用者：「右上角新增一個備註方便教練紀錄今天訓練狀況」）——
   一堂課一則的狀況紀錄，存 bookings.training_note（jsonb，鍵是 slot）。
   與「某個動作的備註」（training_logs.note）是兩回事。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('存在哪裡');
ok('★★★ 存 bookings.training_note，鍵是 slot（1V2 兩位各一則）',
   /const _memo=String\(\(b\.training_note&&b\.training_note\[String\(_slot\)\]\)\|\|''\);/.test(src));
ok('★★★ 不借用 bookings.note（那一欄是系統在寫的）',
   /不要借用 bookings\.note/.test(src));
ok('★★ 也不是動作的備註', /這堂課的「狀況」跟動作的備註是兩回事/.test(src));
ok('★★ migration 有進 docs/migrations', fs.existsSync(root+'docs/migrations/20261014_booking_training_note.sql'));
{
  const m=fs.readFileSync(root+'docs/migrations/20261014_booking_training_note.sql','utf8');
  ok('　　用 add column if not exists（重跑不會壞）', /add column if not exists training_note jsonb/.test(m));
  ok('　　既有表不必重下 GRANT，理由寫在原地', /只管「新建立的 table」/.test(m));
}

console.log('\n畫面');
ok('★ 鈕在標題列右上角，寫過會變金色',
   /<button type="button" class="tl-memo-btn\$\{_memo\?' on':''\}" onclick="tlMemoEdit\(\)"/.test(src)
   && /\.tl-memo-btn\.on\{background:#fbf3e4;border-color:#e8d9b8;color:#6b4517;\}/.test(src));
ok('★★ 唯讀身分不給按（會員／別人的課）', /\$\{_tlEditable\(\)/.test(src)
   && /\? `<button type="button" class="tl-memo-btn/.test(src));
/* 2026-10-15 使用者：「因為加了備註　左邊的副標被壓縮了」——量過手機 390（面板內縮 12px）：
   「✎ 今日備註」87px → 副標 2 行；「✎ 備註」62px → 1 行。 */
ok('★★★ 鈕的文字縮成「✎ 備註」，副標才回得到一行',
   />✎ 備註<\/button>/.test(src) && !/>✎ 今日備註<\/button>/.test(src));
ok('★★ 視窗標題仍寫「今日備註」（縮的只有鈕）',
   /<div class="modal-title">今日備註<\/div>/.test(src));
ok('★★★ 「第 N\/M 堂」包成不可斷的一塊（票券名最長 20 字，再縮按鈕也會折行）',
   /<span style="white-space:nowrap;">\$\{escH\(t\.slice\(i\+1\)\)\}<\/span>/.test(src)
   && /中文預設任兩字之間都能斷/.test(src));
ok('★ 寫過的話在最上面變成一條紙條，點一下再改',
   /class="tl-memo"\$\{_tlEditable\(\)\?' onclick="tlMemoEdit\(\)"':' style="cursor:default;"'\}/.test(src));
ok('　　紙條排在「今日訓練紀錄」標題之前',
   src.indexOf('class="tl-memo"')<src.indexOf('<div class="tlh-label">今日訓練紀錄'));
ok('　　換行要畫得出來', /escH\(_memo\)\.replace\(\/\\n\/g,'<br>'\)/.test(src));
ok('　　金色不是紅色（這是要記得的事，不是警示）', /金色不是紅色：這是「要記得的事」，不是警示/.test(src));

ok('★★ 標題列兩顆鈕永遠同一列，而且規則不綁外層 class',
   /\.tl-headr\{display:flex;align-items:center;flex:none;flex-wrap:nowrap;gap:2px;\}/.test(src)
   && /版面規則綁在自己身上，才不會因為「誰包著它」而壞掉/.test(src));
ok('★★ 這顆鈕不佔額外高度：副標拿掉年份，量過回到 72px',
   /\$\{String\(b\.date\|\|''\)\.slice\(5\)\.replace\(\/-\/g,'\/'\)\} \$\{b\.start_time\}/.test(src)
   && /量過：拿掉「2026\/」剛好回到 72px/.test(src));

console.log('\n權限與寫入');
ok('★★★ 能不能改＝能不能記這堂課的課表（沿用既有兩道，不另發明）',
   /function _tlEditable\(\)\{[\s\S]{0,220}return !!\(tlCanLog\(\) && tlOwnsBk\(b\)\);/.test(src));
ok('★★★ 寫之前重讀一次（1V2 另一格可能剛被別台改過，整個 jsonb 覆寫會蓋掉對方）',
   /let b;\s*\n\s*try\{ b=await dbGet\('bookings', b0\.id\); \}catch\(_\)\{ b=null; \}/.test(src)
   && /training_note 是整個 jsonb 覆寫，拿畫面上那份舊的寫回去會把對方的那則蓋掉/.test(src));
ok('★★ 只動自己那一格', /if\(txt\) note\[slot\]=txt; else delete note\[slot\];/.test(src));
ok('★★ 兩格都空就寫回 null，不要留一個空物件',
   /b\.training_note = Object\.keys\(note\)\.length \? note : null;/.test(src));
ok('★★ 防連點', /return onceAct\('tlmemo:'\+\(\(window\._tlBooking\|\|\{\}\)\.id\|\|''\), \(\)=>_tlMemoSave\(clear\)\);/.test(src));
ok('★★ 存不進去要講（不要靜靜失敗）', /showToast\('存不進去：'\+\(\(e&&e\.message\)\|\|e\)\); return;/.test(src));
ok('　　有「清除」而且只在原本就有字時出現', /\$\{cur\?'<button class="btn btn-ghost" onclick="tlMemoSave\(1\)">清除<\/button>':''\}/.test(src));

console.log('\n實跑：只動自己那一格');
{
  const i=src.indexOf('async function _tlMemoSave(clear){');
  let d=0,end=-1; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){end=k+1;break;} } }
  const body=src.slice(i,end);
  const run=async (before, slot, txt, clear)=>{
    let saved=null;
    const fn=new Function('window','document','dbGet','dbPut','showToast','closeModal','renderTrainingLogSheet','Object',
      body+'\nreturn _tlMemoSave;')(
      {_tlBooking:{id:'B1'}, _tlMemoSlot:slot},
      {getElementById:()=>({value:txt})},
      async()=>({id:'B1', training_note: before?JSON.parse(JSON.stringify(before)):null}),
      async(t,row)=>{ saved=row.training_note; },
      ()=>{}, ()=>{}, ()=>{}, Object);
    await fn(clear);
    return saved;
  };
  (async()=>{
    eq('★★★ 寫 slot 2 不會動到 slot 1',
       await run({'1':'A 的狀況'}, 2, 'B 的狀況'), {'1':'A 的狀況','2':'B 的狀況'});
    eq('★★ 清除 slot 2 之後 slot 1 還在',
       await run({'1':'A 的狀況','2':'B 的狀況'}, 2, '', 1), {'1':'A 的狀況'});
    eq('★★ 兩格都清掉 → null（不留空物件）',
       await run({'2':'只有 B'}, 2, '', 1), null);
    eq('　 前後空白會去掉', await run(null, 1, '  今天狀況好  '), {'1':'今天狀況好'});
    eq('　 只打空白＝等於沒寫', await run(null, 1, '   '), null);
    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    if(fail) process.exit(1);
  })();
}
