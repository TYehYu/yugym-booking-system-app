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

  eq('★ 跑步機一台 → 標「跑步機 · 1 人」',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1'})), '場地：跑步機　·　1 人');
  eq('★ 跑步機兩台（合併卡的 _units）→ 標「2 人」',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1',_units:2})), '場地：跑步機　·　2 人');
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
     txt(fn({category:'自主訓練',venue_unit:null,note:'舊系統匯入｜教室:跑步機2'})), '場地：跑步機　·　1 人');
  eq('　　_units 是壞值時當 1 人，不會印出 NaN',
     txt(fn({category:'自主訓練',venue_unit:'treadmill_1',_units:'x'})), '場地：跑步機　·　1 人');
}
ok('★ 一般（顯示會員名）與遮蔽（教練看別人的課）兩種提示都掛上',
   (src.match(/\$\{bkVenueTipLine\(b\)\}/g)||[]).length===2);
/* 2026-08-01 二修（使用者回報「滑鼠提示也還沒成功」）：課卡有兩種提示 ——
   舊的 .ev-tip 懸浮卡，與真正看得到的、跟著游標跑的白底浮框（data-tip）。
   只加前者等於沒加。 */
ok('★ 跟著游標的那個浮框（data-tip）也要有場地那一行',
   /const _tipStr = _tipEsc\(\[`\$\{b\.start_time\}–\$\{_endT\}`, _tipMem, _tipCoach, _tipVenue\]\.filter\(Boolean\)\.join\('\\n'\)\);/.test(src));
ok('　　它同樣是「教室／跑步機才標、跑步機附人數」',
   /const _tipVenue = \(function\(\)\{ const v=selfVenueLabel\(b\); if\(!v\) return '';[\s\S]{0,160}v==='跑步機'\?`　·　\$\{n\} 人`:''/.test(src));
ok('　　兩種提示的存在寫在程式裡（下次不會又只改一邊）',
   /實際看得到的是後者，只加前者等於沒加（使用者回報/.test(src));
ok('　　場地不是隱私、正是排課要看的 —— 理由寫在程式裡',
   /遮蔽卡（教練看別人的課）也要有：場地不是隱私，而且那正是排課要看的。/.test(src));
ok('　　台數來源是合併卡的 _units（一堂佔兩台是兩筆預約）',
   /台數記在合併後的 _units 上；沒有合併資訊時就是 1 台。/.test(src));

console.log('\n② 新增預約多一個「幾台」的選項');
ok('★ 只有自主訓練會出現這個欄位', /function bkTreadmillRow\(t\)\{\s*\n\s*if\(!t \|\| t\.category!=='自主訓練'\) return '';/.test(src));
/* 2026-08-20：連續預約的開關搬到步驟 1，步驟 2 這個位置改成唯讀覆述；
   「幾台」仍在票券資訊之後、連續預約覆述之前，相對位置沒變。 */
ok('★ 掛在步驟 2 的票券資訊與連續預約之間', /\$\{bkTreadmillRow\(t\)\}\s*\n\s*\$\{\/\*[\s\S]*?\*\/''\}\s*\n\s*\$\{bkRecurRecap\(preSum\)\}/.test(src));
ok('★ 台數選項依場地設定的容量產生（不寫死 2）',   /* 2026-08-18 多功能也開放多台：按鈕畫到各多台場地的最大容量 */
   /const maxCap=Math\.max\(\.\.\.\(window\.VENUES\|\|\[\{capacity:2\}\]\)\.filter\(v=>venueAllowsMultiUnit\(v\.id\)\)\.map\(v=>v\.capacity\|\|2\), 2\);/.test(src));
/* 0824：場地已在視窗一選好，這個下拉改成「預設帶上那個選擇」——
   不然使用者會看到剛選過的東西又問一次，而且預設值不是他選的那個。仍然可以改。 */
ok('★ 預設值跟著視窗一選的場地走（沒選過就是多功能訓練架）',
   /const _wv=\(typeof bkWizVenue==='function'&&bkWizVenue\(\)\)\|\|'';/.test(src)
   && /const _sel=\{treadmill:'t', group:'g', multi:'0'\}\[_wv\]\|\|'0';/.test(src)
   && /<option value="0"\$\{_sel==='0'\?' selected':''\}>\$\{venueName\('multi'\)\}<\/option>/.test(src));
/* 2026-08-04：選單多了「團課教室」，讀值收斂到 bkVenueChoice（'treadmill'＋台數／'group'／null） */
ok('★ 選了台數＝指定用跑步機、選團課教室＝指定 group（venue_pref）',
   /if\(el\.value==='g'\) return \{pref:'group', units:0\};/.test(src)
   && /return \{pref:n>0\?'treadmill':null, units:n\};/.test(src)
   /* 0824：視窗一硬指定的場地當底，跑步機台數（更細）仍可覆蓋 */
   && /const _venuePref=_vc\.pref \|\| bkWizVenue\(\);/.test(src)
   && /venue_pref:o\.venue_pref\|\|null,/.test(src));
ok('★ 選單有「團課教室」選項',
   /<option value="g"\$\{_sel==='g'\?' selected':''\}>\$\{venueName\('group'\)\}<\/option>/.test(src));   // 2026-08-10 場地名稱改吃設定值
/* 2026-08-03 家庭成員：vbkChk 多帶 member_id 與使用人 */
ok('★ 單筆預約的場地預驗證也帶上指定（否則會先被判成多功能區可用）',
   /const vbkChk=\{id:null,coach_id,category:t\.category,ticket_type_id:type_id,venue_pref:_venuePref,\n\s*member_id, trial_name:\(window\._bkFamUser!=null\?window\._bkFamUser:null\)\};/.test(src));   // 2026-08-04 '' 哨兵不塌成 null
ok('★ 兩人只扣 1 點，第 2 人是同行使用', /兩人以上＝同行使用，<b>只扣 1 點<\/b>/.test(src)   // 2026-08-18 多功能也開放多台後的文案
   && /note:`同行使用（\$\{venueName\(vid\)\}）・不另外扣點`/.test(src));
ok('★ 第 2 台用 sibling_of 指回主預約（行事曆才會併成一張卡）',
   /sibling_of:bk\.id,/.test(src));
ok('★ 指定跑步機時走原路徑，不走 DB 的 fn_create_booking',
   /&&!o\.venue_pref&&!bkIsSelf\(bk\)\)\{/.test(src)   // 2026-08-04 自主訓練也排除
   && /跑步機是「一個場地兩台＋同行第 2 台不扣點」的獨立流程，還沒進那支 RPC/.test(src));
ok('　　venue_pref 只是配置提示，不入庫', /delete bk\.venue_pref;                    \/\/ 只是配置提示，不入庫/.test(src));
ok('　　建立成功的吐司講清楚開了幾人、第 2 人不扣點',
   /（\$\{venueName\(_venuePref\)\|\|'場地'\} \$\{_tmN\} 人，第 2 人起不扣點）/.test(src));   /* 2026-08-18 場地名稱跟著指定場地 */

console.log('\n③ 會員自己從手機約也要能選台數');
/* 2026-08-02 使用者指示：「只要會連動上行事曆、影響其他人預約場地的地方，
   都要補上要預約幾台」—— 會員端的自主訓練訂位同樣會佔住跑步機。 */
/* 2026-09-16 使用者回報：「確認預約介面 只剩下一台跑步機的時候 沒有顯示1台2台
   這樣會以為約了兩台」—— 原本 tmFree<=1 整列隱藏，客人看不到自己約了幾台。
   ⚠ 但不能改回「只有一顆『1 人』的選擇列」：2026-08-06 使用者反對過那個
     （假的選擇列，點了也沒有別的可選）。
   ⚠ 折法：列本身只要選了跑步機就出現；「剩幾台」只決定**內容** ——
     兩台以上＝可選的按鈕列，只剩一台＝純文字並寫明原因。 */
ok('★ 確認視窗的「人數」列：選了跑步機就出現（不再因為只剩一台而整列消失）',
   /<div id="msb-tmrow" style="display:\$\{\(s\.pickVenue==='treadmill'\)\?'flex':'none'\}/.test(src)
   && /\(s\.tmFree=Math\.max\(0,_tmCap-_tmUsed\), ''\)/.test(src)
   && /onclick="msbChooseUnits\(\$\{n\}\)"/.test(src));
/* ⚠⚠ 2026-09-16 使用者糾正：「我記得有一個規則 如果選項不能選 要用暗化的然後提示 不要隱藏」
   —— 這是 0823 就定案的做法（不能用就寫原因、別藏按鈕）。
   我一度把「只剩一台」做成純文字，等於把「2 人」整個藏掉，正是那條規則要避免的。
   ⚠ 沿用同一張視窗裡現成的語彙：場地按鈕的 .msb-vbtn.off + disabled + title。
     不要再為這一列另做一套樣式。 */
ok('★★★ 只剩一台時「2 人」暗化不可選並寫出原因（不是隱藏、也不是換成純文字）',
   /: `<button class="msb-vbtn off" disabled title="這個時段只剩 \$\{s\.tmFree\} 台">\$\{n\} 人<\/button>`/.test(src)
   && /另一台這個時段已被預約/.test(src));
ok('★★ 沿用場地按鈕那套暗化語彙，沒有另做一套',
   !/msb-tmone/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
/* 「跑步機的數量有辦法顯示在快速預約介面嗎」——挑時段那一頁就要看得到剩幾台。
   ⚠⚠ 挑時段有**兩支各自畫的 UI**：msbLoadSlots（slotPanelHTML 的 tagFn）與
     memh2SelfSlots（自己拼 cells，會員端 V2 走這支）。兩邊都要帶，只改一支客人看不到。
   ⚠ 算不出來時退回只寫「跑步機」，不可印出「剩 undefined 台」。 */
ok('★★★ 快速預約的時段標籤帶「剩 N 台」（兩支挑時段 UI 都要有）',
   /return \(_n==null\)\?'跑步機':`跑步機 剩 \$\{_n\} 台`;/.test(src)
   && /const tag=\(r\.vids\[m\]==='treadmill' && _tmn!=null\) \? `\$\{_vnm\} 剩 \$\{_tmn\} 台` : _vnm;/.test(src));
ok('★★ 剩餘台數在探測階段一起算好，且不多送一次請求（同一支有快取的當日佔用 RPC）',
   /const _rows=await fetchDayOccupancy\(s\.date\)\.catch\(\(\)=>\[\]\);/.test(src)
   && /return \{free,vids,tmFree,bh:_bh\};/.test(src)
   && /改期時不把自己那一筆算進去，否則原時段會少算一台/.test(src));

/* 2026-09-16 使用者：「這個確認預約的視窗 來個優化建議 讓客人清楚 日期 時間 場地」。
   ⚠ 原本「類型／日期／時間」拆三列、和「使用票卡」一樣大，最該看的反而不突出。
   ⚠ 大字沿用會員端課卡現成的 .mcx-when，不自創樣式（記憶：優先用既有語彙）。 */
ok('★★★ 日期時間是大字主視覺，沿用課卡現成的 .mcx-when',
   /<p class="mcx-when" style="margin:2px 0 12px;">\$\{memWhenText\(s\.date,t\)\}/.test(src));
ok('★★ 原本拆成三列的「類型／日期／時間」已收進大字那一行（資訊沒少，只是不再拆散）',
   !/<span style="color:var\(--t2\);">時間<\/span>　\$\{t\}（60 分鐘）/.test(src));
ok('★★★ 場地是三顆等寬大按鈕，未選退到米底、選中深綠（主從分得出）',
   /<span id="msb-vbtns" class="msb-vbig">/.test(src)
   && /\.msb-vbig \.msb-vbtn\{flex:1;/.test(src)
   && /\.msb-vbig \.msb-vbtn\.on\{background:var\(--green\)/.test(src));
ok('★★ 只放大場地那一組，人數維持小膠囊（都放大就沒有主從）',
   !/id="msb-tmbtns" class="msb-vbig"/.test(src));
ok('★★ 單張票不再寫「剩 N 點」；多張票的下拉保留（那是區分兩張票的依據）',
   /使用票卡<\/span>　\$\{msbNo\(cur\.id\)\}\$\{nm\(cur\)\}<\/div>/.test(src)
   && /剩 \$\{t\.sessions_remaining\} 點/.test(src));
/* 2026-09-16 改法翻面：原本「只畫還空著的那幾顆」，現在**畫滿場地容量**、
   超過可用的那幾顆暗化不可選 —— 客人要看得出「這裡本來有 2 台，只是另一台被約走了」。
   只畫一顆的話，看起來像系統只支援一台。 */
ok('★ 畫滿場地容量的顆數，超過還空著的那幾顆暗化（不是不畫出來）',
   /Array\.from\(\{length:_tmCap\},\(_,i\)=>i\+1\)\.map\(n=> n<=s\.tmFree/.test(src));
ok('★ 換場地時台數重置回 1；只有跑步機才顯示人數列（剩幾台只決定內容，不決定顯不顯示）',
   /function msbChooseUnits\(n\)\{/.test(src)
   && /s\.pickUnits=1;\n\s*const row=document\.getElementById\('msb-tmrow'\);/.test(src)
   && /row\.style\.display = \(vid==='treadmill'\) \? 'flex' : 'none';/.test(src));
ok('★ 台數帶給 RPC（p_units），且只有真的排到跑步機才帶',
   /p_units:Math\.max\(1,Number\(units\)\|\|1\)/.test(src)
   && /const _units=\(String\(vbk\.venue_unit\|\|''\)\.split\('_'\)\[0\]==='treadmill'\)\?\(s\.pickUnits\|\|1\):1;/.test(src));
ok('★ 實際開成幾台以 DB 回傳為準，被別人搶走時照實說（不謊報）',
   /const _got=Number\(r\.units\)\|\|1;/.test(src)
   && /沒有多的跑步機，只保留 1 人/.test(src));
ok('　　標明第 2 人不扣點', /<span style="font-size:11px;color:var\(--t3\);">第 2 人不扣點<\/span>/.test(src));
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
      venueAllowsMultiUnit:v=>['treadmill','multi'].indexOf(String(v||''))>=0,   /* 2026-08-18 多功能也開放多台 */
      venueName:v=>({treadmill:'跑步機',multi:'多功能訓練架'})[v]||v,
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
        uid:p=>p+'-1', SESSION:{id:'E1'},
        venueAllowsMultiUnit:v=>['treadmill','multi'].indexOf(String(v||''))>=0,   /* 2026-08-18 多功能也開放多台 */
        venueName:v=>({treadmill:'跑步機',multi:'多功能訓練架',group:'團課教室'})[v]||v,
        window:{VENUES:[{id:'treadmill',capacity:2}]} };
      const f=new Function(...Object.keys(env), body+'\nreturn bkAddTreadmillUnits;')(...Object.values(env));
      /* 2026-08-18 規則更新：multi 也可多台（見 multiunittest）；「不可多台」的案例改用團課教室 */
      const n=await f({id:'BK-2',date:'2026-08-05',start_time:'10:00',duration:60,venue_unit:'group_1'},2);
      eq('★ 主預約在不可多台的場地（教室）→ 不補開', [n, put.length], [1,0]);
      const n2=await f({id:'BK-3',date:'2026-08-05',start_time:'10:00',duration:60,venue_unit:null},2);
      eq('　　沒有場地資訊也不會爆', [n2, put.length], [1,0]);
    }

    console.log('\n⑦ 被約走一台之後，下一位選不到兩台（2026-08-03 使用者確認規則）');
/* ⚠⚠ 2026-09-16 使用者推翻 0803／0806 這兩條：
     「如果跑步機只剩下一台的時候 1台 2台(暗化處理)」
     「我記得有一個規則 如果選項不能選 要用暗化的然後提示 不要隱藏」
   ——「沒得選就不用問」看似合理，但客人看不到「這裡本來有 2 台」，
     就分不出是系統只支援一台、還是另一台剛好被約走。
   ⚠ 這是 0823 就定案的通則（記憶 yugym-disabled-with-reason）：
     不能用就暗化＋寫原因，不要隱藏。這裡當初做成隱藏是特例，現在收回特例。
   ⚠ 沿用同一張視窗裡現成的語彙 .msb-vbtn.off + disabled + title（場地按鈕就在隔壁用）。 */
ok('★★★ 畫滿場地容量的顆數，超過還空著的那幾顆暗化（不是只畫空著的）',
   /Array\.from\(\{length:_tmCap\},\(_,i\)=>i\+1\)\.map\(n=> n<=s\.tmFree/.test(src));
ok('★★★ 只剩 1 台時**不隱藏**整列：2 人暗化並寫出原因（切換場地後也一樣）',
   /id="msb-tmrow" style="display:\$\{\(s\.pickVenue==='treadmill'\)\?'flex':'none'\}/.test(src)
   && /row\.style\.display = \(vid==='treadmill'\) \? 'flex' : 'none';/.test(src)
   && /disabled title="這個時段只剩 \$\{s\.tmFree\} 台"/.test(src));
ok('★ 上一個時段選的 2 台不會漏到只剩 1 台的時段（pickUnits 夾回上限）',
   /s\.pickUnits=Math\.min\(s\.pickUnits\|\|1, Math\.max\(1,_tmCap-_tmUsed\)\);/.test(src));
ok('★ 台數列不得疊寫 display（2026-08-10 使用者回報：選教室/多功能仍看到 1台2台——display:none;display:flex 後者蓋前者，初始永遠顯示）',
   !/style="display:none;display:flex/.test(src) && !/'display:none;'\}display:flex/.test(src));
ok('　　為什麼要夾，寫在程式裡',
   /但 s\.pickUnits 還留著 2 —— 送出時就會带 2。/.test(src));
ok('★ 佔用數用「筆數」算並以容量封頂（舊資料有不帶編號的 treadmill）',
   /_tmUsed=Math\.min\(_tmUsed,_tmCap\);/.test(src));
ok('★ 就算前端被繞過，DB 也只開得成剩下的台數（migration 記載不信任前端）',
   fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260802_member_self_book_treadmill_units.sql','utf8')
     .includes('台數不信任前端'));
ok('　　開不成兩人時吐司照實說', /沒有多的跑步機，只保留 1 人/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
