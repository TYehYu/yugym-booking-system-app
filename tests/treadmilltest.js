/* 2026-08-01 使用者指示（跑步機兩件事）：
   ①「課卡的滑鼠提示 如果是教室或跑步機要顯示使用場地 尤其是跑步機要知道用了幾台」
   ②「所以在預約跑步機的時候 要多一個選項 要預約幾台」

   跑步機是「一個場地兩台」，一對二的客人一次會佔掉兩台。資料結構是「一台一筆預約」
   （venue_unit 一筆只存得下一台），第 2 台以 sibling_of 指回主預約、不另外扣點
   —— 與預約明細裡的燈號開關 bkToggleVenueUnit 同一套規則。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 滑鼠提示顯示場地與台數');
{
  const fn=new Function('bkIsGroup',
    grabFn('selfVenueLabel')+'\n'+grabFn('bkVenueTipLine')+'\nreturn bkVenueTipLine;')(b=>b&&b.category==='小班肌力');
  const txt=h=>String(h).replace(/<[^>]*>/g,'').trim();

  eq('★ 跑步機一台 → 標「跑步機 · 1 台」',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1'})), '場地：跑步機　·　1 台');
  eq('★ 跑步機兩台（合併卡的 _units）→ 標「2 台」',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1',_units:2})), '場地：跑步機　·　2 台');
  eq('★ 團課教室 → 標場地，不標台數（教室不是以台計）',
     txt(fn({category:'自主訓練',venue_unit:'group_1'})), '場地：教室');
  eq('★ 教練課排到教室也要標（不是只有自主訓練）',
     txt(fn({category:'私人教練',venue_unit:'group_1'})), '場地：教室');
  eq('★ 預設的多功能訓練區不標（標了等於每張卡都有，就沒有提示作用）',
     fn({category:'自主訓練',venue_unit:'multi_2'}), '');
  eq('　　沒有場地資訊 → 不標', fn({category:'私人教練',venue_unit:null}), '');
  eq('　　團體課本來就在團課教室 → 不標', fn({category:'小班肌力',venue_unit:'group_1'}), '');
  eq('　　場租不標', fn({category:'場租',venue_unit:'group_1'}), '');
  eq('★ 舊系統匯入（只有 note 帶「教室:跑步機2」）也讀得到',
     txt(fn({category:'自主訓練',venue_unit:null,note:'舊系統匯入｜教室:跑步機2'})), '場地：跑步機　·　1 台');
  eq('　　_units 是壞值時當 1 台，不會印出 NaN',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1',_units:'x'})), '場地：跑步機　·　1 台');
}
ok('★ 一般（顯示會員名）與遮蔽（教練看別人的課）兩種提示都掛上',
   (src.match(/\$\{bkVenueTipLine\(b\)\}/g)||[]).length===2);
/* 2026-08-01 二修（使用者回報「滑鼠提示也還沒成功」）：課卡有兩種提示 ——
   舊的 .ev-tip 懸浮卡，與真正看得到的、跟著游標跑的白底浮框（data-tip）。
   只加前者等於沒加。 */
ok('★ 跟著游標的那個浮框（data-tip）也要有場地那一行',
   /const _tipStr = _tipEsc\(\[`\$\{b\.start_time\}–\$\{_endT\}`, _tipMem, _tipCoach, _tipVenue\]\.filter\(Boolean\)\.join\('\\n'\)\);/.test(src));
ok('　　它同樣是「教室／跑步機才標、跑步機附台數」',
   /const _tipVenue = \(function\(\)\{ const v=selfVenueLabel\(b\); if\(!v\) return '';[\s\S]{0,160}v==='跑步機'\?`　·　\$\{n\} 台`:''/.test(src));
ok('　　兩種提示的存在寫在程式裡（下次不會又只改一邊）',
   /實際看得到的是後者，只加前者等於沒加（使用者回報/.test(src));
ok('　　場地不是隱私、正是排課要看的 —— 理由寫在程式裡',
   /遮蔽卡（教練看別人的課）也要有：場地不是隱私，而且那正是排課要看的。/.test(src));
ok('　　台數來源是合併卡的 _units（一堂佔兩台是兩筆預約）',
   /台數記在合併後的 _units 上；沒有合併資訊時就是 1 台。/.test(src));

console.log('\n② 新增預約多一個「幾台」的選項');
ok('★ 只有自主訓練會出現這個欄位', /function bkTreadmillRow\(t\)\{\s*\n\s*if\(!t \|\| t\.category!=='自主訓練'\) return '';/.test(src));
ok('★ 掛在步驟 2 的票券資訊與連續預約之間', /\$\{bkTreadmillRow\(t\)\}\s*\n\s*\$\{recurBoxHtml\('bk', preSum\)\}/.test(src));
ok('★ 台數選項依場地設定的容量產生（不寫死 2）',
   /const cap=\(\(window\.VENUES\|\|\[\]\)\.find\(v=>v\.id==='treadmill'\)\|\|\{\}\)\.capacity\|\|2;/.test(src));
ok('★ 有「自動配置」這一項（預設不指定場地，行為與改版前一致）',
   /<option value="0">自動配置（多功能訓練區優先）<\/option>/.test(src));
/* 2026-08-04：選單多了「團課教室」，讀值收斂到 bkVenueChoice（'treadmill'＋台數／'group'／null） */
ok('★ 選了台數＝指定用跑步機、選團課教室＝指定 group（venue_pref）',
   /if\(el\.value==='g'\) return \{pref:'group', units:0\};/.test(src)
   && /return \{pref:n>0\?'treadmill':null, units:n\};/.test(src)
   && /const _venuePref=_vc\.pref;/.test(src)
   && /venue_pref:o\.venue_pref\|\|null,/.test(src));
ok('★ 選單有「團課教室」選項', /<option value="g">團課教室<\/option>/.test(src));
/* 2026-08-03 家庭成員：vbkChk 多帶 member_id 與使用人 */
ok('★ 單筆預約的場地預驗證也帶上指定（否則會先被判成多功能區可用）',
   /const vbkChk=\{id:null,coach_id,category:t\.category,ticket_type_id:type_id,venue_pref:_venuePref,\n\s*member_id, trial_name:\(window\._bkFamUser!=null\?window\._bkFamUser:null\)\};/.test(src));   // 2026-08-04 '' 哨兵不塌成 null
ok('★ 兩台只扣 1 點，第 2 台是同行使用', /只扣 1 點<\/b>，第 2 台不另外扣/.test(src)
   && /note:'同行使用（跑步機）・不另外扣點'/.test(src));
ok('★ 第 2 台用 sibling_of 指回主預約（行事曆才會併成一張卡）',
   /sibling_of:bk\.id,/.test(src));
ok('★ 指定跑步機時走原路徑，不走 DB 的 fn_create_booking',
   /&&!o\.venue_pref&&!bkIsSelf\(bk\)\)\{/.test(src)   // 2026-08-04 自主訓練也排除
   && /跑步機是「一個場地兩台＋同行第 2 台不扣點」的獨立流程，還沒進那支 RPC/.test(src));
ok('　　venue_pref 只是配置提示，不入庫', /delete bk\.venue_pref;                    \/\/ 只是配置提示，不入庫/.test(src));
ok('　　建立成功的吐司講清楚開了幾台、第 2 台不扣點',
   /（跑步機 \$\{_tmN\} 台，第 2 台不扣點）/.test(src));

console.log('\n③ 會員自己從手機約也要能選台數');
/* 2026-08-02 使用者指示：「只要會連動上行事曆、影響其他人預約場地的地方，
   都要補上要預約幾台」—— 會員端的自主訓練訂位同樣會佔住跑步機。 */
ok('★ 確認視窗多一列「台數」，只在選了跑步機且真的還空著兩台以上時出現',
   /<div id="msb-tmrow" style="\$\{\(s\.pickVenue==='treadmill'&&_tmCap-_tmUsed>1\)\?'':'display:none;'\}/.test(src)
   && /onclick="msbChooseUnits\(\$\{n\}\)"/.test(src));
ok('★ 可選的台數＝該時段實際還空著的數量（不會讓人選到已被約走的）',
   /Array\.from\(\{length:Math\.max\(1,_tmCap-_tmUsed\)\},\(_,i\)=>i\+1\)/.test(src));
ok('★ 換場地時台數重置回 1（只有跑步機有台數的概念）',
   /function msbChooseUnits\(n\)\{/.test(src)
   && /s\.pickUnits=1;\s*\n\s*const row=document\.getElementById\('msb-tmrow'\);/.test(src));
ok('★ 台數帶給 RPC（p_units），且只有真的排到跑步機才帶',
   /p_units:Math\.max\(1,Number\(units\)\|\|1\)/.test(src)
   && /const _units=\(String\(vbk\.venue_unit\|\|''\)\.split\('_'\)\[0\]==='treadmill'\)\?\(s\.pickUnits\|\|1\):1;/.test(src));
ok('★ 實際開成幾台以 DB 回傳為準，被別人搶走時照實說（不謊報）',
   /const _got=Number\(r\.units\)\|\|1;/.test(src)
   && /第 2 台剛被約走，只保留 1 台/.test(src));
ok('　　標明第 2 台不扣點', /<span style="font-size:11px;color:var\(--t3\);">第 2 台不扣點<\/span>/.test(src));
ok('　　台數不信任前端，理由寫在程式裡',
   /台數由 DB 端自己查還空著哪幾台，不信任這裡傳的數字/.test(src));

console.log('\n④ 實跑：補開第 2 台');
{
  const i=src.indexOf('async function bkAddTreadmillUnits(bk, want){');
  const body=src.slice(i, src.indexOf('\n}\n', i)+3);
  const timeToMin=t=>{const[h,m]=String(t).split(':').map(Number);return h*60+m;};
  const run=async(want, existing)=>{
    const put=[];
    const env={ dbGetAll:async()=>existing, dbPut:async(_t,o)=>{put.push(o);},
      timeToMin, uid:p=>p+'-'+(put.length+1), SESSION:{id:'E1'},
      window:{VENUES:[{id:'treadmill',name:'跑步機',capacity:2,active:true}]} };
    const f=new Function(...Object.keys(env), body+'\nreturn bkAddTreadmillUnits;')(...Object.values(env));
    const bk={id:'BK-1',member_id:'M1',category:'自主訓練',ticket_type_id:'tt-self',
      date:'2026-08-05',start_time:'10:00',duration:60,venue_unit:'treadmill_1'};
    const n=await f(bk,want);
    return {n, put};
  };
  const OTHER=(unit,st)=>({id:'X'+unit,date:'2026-08-05',start_time:'10:00',duration:60,status:st||'booked',venue_unit:unit});

  (async()=>{
    let r=await run(2,[OTHER('treadmill_1')]);
    eq('★ 想要 2 台、另一台空著 → 補開 1 筆，總共 2 台', [r.n, r.put.length], [2,1]);
    eq('★ 補開的那筆：treadmill_2、指回主預約、不綁票不扣點',
       [r.put[0].venue_unit, r.put[0].sibling_of, r.put[0].ticket_id, r.put[0].coach_id],
       ['treadmill_2','BK-1',null,null]);
    ok('　　標明是同行使用', /同行使用（跑步機）/.test(r.put[0].note));

    r=await run(1,[OTHER('treadmill_1')]);
    eq('★ 只要 1 台 → 什麼都不補', [r.n, r.put.length], [1,0]);

    r=await run(2,[OTHER('treadmill_1'),OTHER('treadmill_2')]);
    eq('★ 第 2 台已被別人約走 → 只開成 1 台，不硬塞（也不讓整筆失敗）',
       [r.n, r.put.length], [1,0]);

    r=await run(2,[OTHER('treadmill_1'),OTHER('treadmill_2','cancelled')]);
    eq('　　已取消的不算佔用', [r.n, r.put.length], [2,1]);

    r=await run(2,[{id:'Y',date:'2026-08-05',start_time:'11:30',duration:60,status:'booked',venue_unit:'treadmill_2'}]);
    eq('　　時間不重疊的不算佔用', [r.n, r.put.length], [2,1]);

    // 主預約不是跑步機 → 不補（例如系統把它配到多功能區）
    {
      const put=[];
      const env={ dbGetAll:async()=>[], dbPut:async(_t,o)=>{put.push(o);}, timeToMin,
        uid:p=>p+'-1', SESSION:{id:'E1'}, window:{VENUES:[{id:'treadmill',capacity:2}]} };
      const f=new Function(...Object.keys(env), body+'\nreturn bkAddTreadmillUnits;')(...Object.values(env));
      const n=await f({id:'BK-2',date:'2026-08-05',start_time:'10:00',duration:60,venue_unit:'multi_1'},2);
      eq('★ 主預約沒配到跑步機 → 不補開（不會憑空多出一筆跑步機）', [n, put.length], [1,0]);
      const n2=await f({id:'BK-3',date:'2026-08-05',start_time:'10:00',duration:60,venue_unit:null},2);
      eq('　　沒有場地資訊也不會爆', [n2, put.length], [1,0]);
    }

    console.log('\n⑦ 被約走一台之後，下一位選不到兩台（2026-08-03 使用者確認規則）');
ok('★ 台數按鈕只長到「還空著的台數」（1 台被約走 → 只剩「1 台」可選）',
   /Array\.from\(\{length:Math\.max\(1,_tmCap-_tmUsed\)\},\(_,i\)=>i\+1\)/.test(src));
ok('★ 只剩 1 台時整列台數選擇隱藏（沒得選就不用問）',
   /id="msb-tmrow" style="\$\{\(s\.pickVenue==='treadmill'&&_tmCap-_tmUsed>1\)\?'':'display:none;'\}/.test(src));
ok('★ 上一個時段選的 2 台不會漏到只剩 1 台的時段（pickUnits 夾回上限）',
   /s\.pickUnits=Math\.min\(s\.pickUnits\|\|1, Math\.max\(1,_tmCap-_tmUsed\)\);/.test(src));
ok('　　為什麼要夾，寫在程式裡',
   /但 s\.pickUnits 還留著 2 —— 送出時就會带 2。/.test(src));
ok('★ 佔用數用「筆數」算並以容量封頂（舊資料有不帶編號的 treadmill）',
   /_tmUsed=Math\.min\(_tmUsed,_tmCap\);/.test(src));
ok('★ 就算前端被繞過，DB 也只開得成剩下的台數（migration 記載不信任前端）',
   fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260802_member_self_book_treadmill_units.sql','utf8')
     .includes('台數不信任前端'));
ok('　　開不成兩台時吐司照實說', /第 2 台剛被約走，只保留 1 台/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
