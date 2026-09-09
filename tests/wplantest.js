/* 訓練方案（2026-09-09 使用者需求，尚未上線）：
   「讓教練自己各自設計自己的訓練動作　可以儲存成方案」
   「[動作x次數x組數x重量]當作入口　點進去跳視窗調整…旁邊有個[-][+]」
   「重量不是必填　有時候會有徒手訓練」「lb 只有+5」「自建的只有自己看得到」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const fn=(sig,end)=>new Function('WP_UNITS','WP_STEPS','SESSION','return '+g(sig,end))
  (['kg','lb'],{kg:[1,0.5],lb:[5]},{id:'C1',role:'coach'});

console.log('① 重量可以留空（徒手）');
{
  const unitOf=fn('function wpUnitOf(x){','\n}');
  const wTxt=new Function('wpUnitOf','return '+g('function wpWeightTxt(w,u){','\n}'))(unitOf);
  eq('★★★ 留空不畫（不要印成 0kg，那會被讀成空槓）', [wTxt('','kg'), wTxt(null,'kg'), wTxt(0,'kg')], ['','','']);
  eq('★★ 有值就帶單位', [wTxt(40,'kg'), wTxt(45,'lb')], ['40 kg','45 lb']);
  eq('★★ kg 的小數只留一位、不補零（40 不寫成 40.0）', [wTxt(40.0,'kg'), wTxt(42.5,'kg')], ['40 kg','42.5 kg']);
  eq('★★ 單位打錯一律當 kg（資料是人填的）', [unitOf('KG'), unitOf(''), unitOf(null), unitOf('lb')], ['kg','kg','kg','lb']);
}

console.log('\n② 一行的樣子＝使用者指定的入口形式');
{
  const unitOf=fn('function wpUnitOf(x){','\n}');
  const wTxt=new Function('wpUnitOf','return '+g('function wpWeightTxt(w,u){','\n}'))(unitOf);
  const line=new Function('wpWeightTxt','return '+g('function wpItemLine(it){','\n}'))(wTxt);
  eq('★★★ 動作 × 次數 × 組數 × 重量', line({name:'深蹲',reps:12,sets:3,weight:40,unit:'kg'}), '深蹲 × 12 次 × 3 組 × 40 kg');
  eq('★★★ 徒手就少最後一段（不留一個空的 ×）', line({name:'棒式',reps:30,sets:3,weight:''}), '棒式 × 30 次 × 3 組');
  eq('★★ 只有名字也畫得出來', line({name:'貓牛式'}), '貓牛式');
  eq('★★ 沒名字不會變成空字串（看得出是還沒設定）', line({reps:10}), '（未命名） × 10 次');
  eq('　　null 不會爆', line(null), '');
}

console.log('\n③ [-][+] 的級距（使用者定案）');
ok('★★★ 次數與組數 ±1、kg 兩排（±1／±0.5）、lb 只有 ±5',
   /const WP_STEPS=\{kg:\[1,0\.5\], lb:\[5\]\};/.test(src)
   && /\$\{stepRow\('reps','次數','次',\[1\]\)\}/.test(src)
   && /\$\{stepRow\('sets','組數','組',\[1\]\)\}/.test(src)
   && /\$\{stepRow\('weight','',u,WP_STEPS\[u\]\)\}/.test(src));
{
  const S={items:[{reps:12,sets:3,weight:40,unit:'kg'}]};
  const step=new Function('window','document','return '+g('function wpStep(f,d){','\n}'))
    ({_wp:S,_wpI:0},{getElementById:()=>null});
  step('weight',0.5); eq('★★★ 小數相加要收斂（40+0.5 不能變成 40.300000000000004 那種）', S.items[0].weight, 40.5);
  step('weight',-1);  eq('★★ 兩排可以混著按', S.items[0].weight, 39.5);
  S.items[0].weight=0.5; step('weight',-1);
  eq('★★★ 減到 0 以下＝徒手（留空），不會出現負重量', S.items[0].weight, '');
  step('weight',5);   eq('★★ 從徒手加回來是從 0 起算', S.items[0].weight, 5);
  S.items[0].sets=1; step('sets',-1);
  eq('★★★ 次數／組數最少 1（0 組的動作沒有意義）', S.items[0].sets, 1);
  S.items[0].reps=''; step('reps',1);
  eq('★★ 空的次數加一下變 1', S.items[0].reps, 1);
}

console.log('\n④ 誰看得到（使用者：自建的只有自己看得到）');
{
  const vis=who=>new Function('SESSION','return '+g('function exVisible(list){','\n}'))(who);
  const L=[{name:'深蹲',is_custom:false,active:true},
           {name:'我的動作',is_custom:true,created_by:'C1',active:true},
           {name:'別人的',is_custom:true,created_by:'C2',active:true},
           {name:'停用的',is_custom:false,active:false}];
  eq('★★★ 預設動作全店共用、自建的只有自己', vis({id:'C1',role:'coach'})(L).map(x=>x.name), ['深蹲','我的動作']);
  eq('★★★ 別人自建的看不到', vis({id:'C2',role:'coach'})(L).map(x=>x.name), ['深蹲','別人的']);
  eq('★★ 管理員看全部（動作庫本來就是他在維護）', vis({id:'A',role:'admin'})(L).map(x=>x.name), ['深蹲','我的動作','別人的']);
  eq('★★ 停用的一律不畫', vis({id:'A',role:'admin'})(L).filter(x=>x.name==='停用的').length, 0);
}
ok('★★ 現有 22 個動作全是預設（is_custom=false），這條規則上線不會讓任何人少看到東西',
   /正式庫現有 22 個動作全是預設/.test(src));

console.log('\n⑤ 方案是誰的');
{
  const mk=n=>new Function('SESSION','return '+g('function '+n+'(list){','\n}'))({id:'C1'});
  const L=[{id:'p1',coach_id:'C1',active:true},
           {id:'p2',coach_id:'C2',active:true,shared_with:['C1']},
           {id:'p3',coach_id:'C2',active:true,shared_with:['C3']},
           {id:'p4',coach_id:'C1',active:false}];
  eq('★★★ 自己的方案', mk('wpMine')(L).map(x=>x.id), ['p1']);
  eq('★★★ 分享給我的（挑人分享，不是全店）', mk('wpShared')(L).map(x=>x.id), ['p2']);
  eq('★★ 停用的不列', mk('wpMine')(L).filter(x=>x.id==='p4').length, 0);
}
ok('★★★ 分享的人只能看與複製，改不到原本',
   /別人分享的方案只能看。要調整請先複製一份。/.test(src)
   && /function wpCopy\(id\)\{/.test(src)
   && /if\(String\(p\.coach_id\)!==String\(SESSION\.id\)\)\{ return wpView\(id\); \}/.test(src));

/* 2026-09-09 使用者：「分享的按鈕做在外面另外開一個視窗　不要放在訓練方案裡面」 */
ok('★★★ 分享是方案卡上獨立的一顆，不在編輯視窗裡',
   /onclick="event\.stopPropagation\(\);wpShareOpen\('\$\{p\.id\}'\)"/.test(src)
   && /async function wpShareOpen\(id\)\{/.test(src)
   && !/<div id="wp-share"><\/div>/.test(src));
/* 2026-09-09 使用者：「分享的按鈕做在這邊右上角」「[分享0]也要顯示分享幾個人了」 */
ok('★★★ 分享鈕在卡片右上角（名稱那一列），不在底列',
   /<div class="wp-card-h"><span class="wp-card-n">\$\{escH\(p\.name\|\|'未命名方案'\)\}<\/span>\s*\n\s*\$\{own/.test(src)
   && /<div class="wp-card-f"><span class="wp-card-c">\$\{n\} 個動作<\/span>/.test(src));
ok('★★★ 數字一律顯示（含 0）—— 不顯示的話「還沒分享」跟「沒有這個功能」長得一樣',
   />分享 \$\{shN\}<\/button>/.test(src)
   && /數字一律顯示（含 0）/.test(src));
ok('★★★ 那一段是函式本體不是範本字串，註解不能用 \$\{…\}（0828 白畫面的同一個坑）',
   /這裡是函式本體、不是範本字串 —— 註解要用純/.test(src));
ok('★★★ 要 stopPropagation —— 整張卡本來就會開編輯',
   /⚠ 要 stopPropagation：整張卡本來就會開編輯。/.test(src));
ok('★★★ 分享視窗直接存資料庫，不跟編輯視窗共用暫存',
   /window\._wpShare=\{ id:p\.id/.test(src)
   && /async function _wpShareSave\(\)\{/.test(src)
   && /直接存資料庫，不跟編輯視窗共用暫存/.test(src));
ok('★★★ 存分享名單前重新讀一次，免得蓋掉別處剛改好的內容',
   /const rec=await dbGet\('workout_plans',S\.id\);\s*\n\s*if\(!rec\)\{ showToast\('找不到方案'\); return; \}\s*\n\s*rec\.shared_with=/.test(src));
ok('★★★ 反過來也要：存方案時分享名單以資料庫為準（編輯視窗不碰它，手上那份可能是舊的）',
   /if\(_cur\) rec\.shared_with=\(Array\.isArray\(_cur\.shared_with\)\?_cur\.shared_with:\[\]\)\.map\(String\);/.test(src));
ok('★★ 只能分享自己的方案', /if\(String\(p\.coach_id\)!==String\(SESSION\.id\)\)\{ showToast\('只能分享自己的方案'\); return; \}/.test(src));
ok('★★ 防連點', /return onceAct\('wpshare', _wpShareSave\);/.test(src));
/* ⚠ 這裡**不能**寫成「比對一段自己寫死的 SQL 字串」—— 那會永遠成立，是假的檢查。
   RLS 在資料庫端，這支測試看不到；改成釘住「程式裡有記著這件事」，
   真正的驗證是 migration 20260909_workout_plans（wp_select / wp_write 兩條 policy）。 */
ok('★★ 程式裡記著「資料庫也擋一道」，不是只靠畫面',
   /方案掛在\*\*教練自己\*\*身上（workout_plans\.coach_id）/.test(src));

console.log('\n⑥ 分頁掛在三份導覽上（使用者：手機下方、桌機上方）');
ok('★★★ 手機底部、手機側邊、桌機上方都有',
   /\{key:'coach_plans',   label:'訓練方案'\}/.test(src)
   && /\{key:'coach_plans',label:'訓練方案'\}/.test(src)
   && /\{key:'coach_plans',label:'訓練方案'\},   \/\* 2026-09-09 使用者指示：桌機上方也要 \*\//.test(src));
ok('★★★ 不能開課的人看不到（跟行事曆同一條線）',
   (src.match(/return canTeach \? base : base\.filter\(n=>n\.key!=='coach_calendar'\);/g)||[]).length===2);
ok('★★ 底部導覽的圖示有補（沒有的話那一顆是空的）', /  coach_plans:'<svg viewBox="0 0 24 24"/.test(src));

console.log('\n⑦ 存檔');
{
  const SV=g('async function _wpSave(){','\n}');
  ok('★★★ 名稱與動作都不能空', /if\(!name\)\{ showToast\('請填方案名稱'\); return; \}/.test(SV)
     && /if\(!items\.length\)\{ showToast\('至少要有一個動作'\); return; \}/.test(SV));
  ok('★★★ 空重量存 null，不存 0（0 會被讀成空槓）',
     /weight:\(it\.weight===''\|\|it\.weight==null\)\?null:Number\(it\.weight\)/.test(SV));
  ok('★★★ 打字打出來的新動作自動進**自己的**動作庫（is_custom:true、created_by:自己）',
     /is_custom:true,\s*\n\s*created_by:SESSION\.id/.test(SV));
  ok('★★ 動作庫存不進去不擋方案（那只是方便，方案存的是名字字串）',
     /\}catch\(e\)\{ console\.warn\('新動作沒進動作庫',e\); \}/.test(SV));
  ok('★★ 防連點', /return onceAct\('wpsave', _wpSave\);/.test(src));
  ok('★★ 刪方案不動已經套用出去的訓練紀錄',
     /已經套用到課堂上的訓練紀錄不受影響（那是各堂課自己的資料）/.test(src));
}
/* 2026-09-09 使用者：「動作小卡下方的方案備註移除」—— 每個動作自己就有備註欄，
   方案層級再一個很少人填，只是把視窗拉長。欄位留著、存檔照樣帶回去。 */
ok('★★★ 方案備註那一欄拿掉了，但舊方案填過的字不會被清掉',
   !/id="wp-note"/.test(src)
   && /note:String\(S\.note\|\|''\)\.trim\(\)\|\|null/.test(src)
   && /舊方案填過的字不會被清掉/.test(src));
ok('★★★ 名稱放在重畫範圍外（打到一半被清掉是踩過的坑）',
   /輸入框如果在裡面，打到一半會被清掉、游標也會跳走（校正視窗踩過同一個坑）/.test(src)
   && /function wpPaint\(\)\{/.test(src));

console.log('\n⑧ Phase 2：套用方案到課堂');
{
  const g2=(a,b)=>{const i=src.indexOf(a); return src.slice(i, src.indexOf(b,i)+b.length);};
  const AP=g2('async function _tlPlanApply(pid,useLast){','\n}');
  const NUM=new Function('wpUnitOf','return '+g('function tlLogNums(l){','\n}'))(x=>['kg','lb'].indexOf(String(x||''))>=0?String(x):'kg');
  eq('★★★ 舊紀錄沒有 weight 欄位時，退回逐組明細取最重那一組（一律當 kg，當時畫面就寫死 kg）',
     NUM({reps:10,sets:3,sets_detail:'[{"reps":10,"weight":40},{"reps":8,"weight":45}]'}),
     {reps:10,sets:3,weight:45,unit:'kg'});
  eq('★★★ 新欄位優先', NUM({reps:12,sets:4,weight:50,weight_unit:'lb',sets_detail:'[{"reps":1,"weight":9}]'}),
     {reps:12,sets:4,weight:50,unit:'lb'});
  eq('★★ 徒手的舊紀錄不會被讀成有重量',
     NUM({reps:30,sets:3,sets_detail:'[{"reps":30,"weight":""}]'}), {reps:30,sets:3,weight:'',unit:'kg'});
  eq('★★ 壞掉的 JSON 不會爆', NUM({reps:5,sets:1,sets_detail:'{壞的'}), {reps:5,sets:1,weight:'',unit:'kg'});
  eq('　　null 不會爆', NUM(null), null);
  ok('★★★ 沿用的是「同一個動作」上一次的數字，不是整堂照抄',
     /沿用的是「這位會員上一次做\*\*同一個動作\*\*的數字」，不是整堂課照抄/.test(src)
     && /const L=useLast\?tlLogNums\(last\[it\.name\]\):null;/.test(AP));
  ok('★★★ 沿用時逐項退回方案的值（他只做過其中兩個，就只有那兩個換掉）',
     /const reps  =L&&L\.reps!==''   \? Number\(L\.reps\)   : \(it\.reps==null\?null:Number\(it\.reps\)\);/.test(AP));
  ok('★★★ 重量 0／空一律存 null，單位也跟著不存（不要留一個沒有重量的單位）',
     /weight:\(weight!=null&&isFinite\(weight\)&&weight>0\)\?weight:null,/.test(AP)
     && /weight_unit:\(weight!=null&&isFinite\(weight\)&&weight>0\)\?unit:null,/.test(AP));
  ok('★★★ 現場改的數字不回寫方案（方案是範本）',
     /現場改的數字\*\*不回寫方案\*\*（方案是範本，當天的數字歸當天）/.test(src));
  ok('★★ 一個動作都沒做過就不問（少一個沒有意義的步驟）',
     /if\(!hits\.length\) return tlPlanApply\(pid,false\);/.test(src));
  ok('★★ 沒有方案時給的是指路，不是一句吐司',
     /到「訓練方案」那一頁先把常用的菜單存起來，之後在這裡一鍵套用。/.test(src));
  ok('★★ 防連點', /return onceAct\('tlplan:'\+pid, \(\)=>_tlPlanApply\(pid,useLast\)\);/.test(src));
  /* 2026-09-09 Phase 3：那三份抄來抄去的 setLine 收成一支 tlSetLine ——
     Phase 3 要再加兩處（會員課卡、會員訓練紀錄頁），不收就變成五份。 */
  ok('★★★ 顯示那一段收成一支共用的，全檔只有一份',
     (src.match(/if\(l\.weight!=null&&l\.weight!==''\)\{/g)||[]).length===1
     && /function tlSetLine\(l\)\{/.test(src)
     && (src.match(/const setLine=tlSetLine;/g)||[]).length===3);
  ok('★★★ 手動逐組記錄也把重量落一份到新欄位 —— 兩條路要讀得到同一個地方',
     /weight:\(function\(\)\{ const w=valid\.map\(x=>Number\(x\.weight\)\)/.test(src));
}

console.log('\n⑨ 管理員也用得到（2026-09-09 使用者：「先把這個功能開放到管理員端」）');
/* 2026-09-09 使用者：「桌機要放在上方分頁　手機放在下方分頁」——
   原本桌機收在「管理員 → 環境設定」、手機收在「其他」選單，兩個都看不見。 */
ok('★★★ 桌機在頂欄自己一組（只有一個子項目，點頂欄直接進頁）',
   /\{key:'g_train', label:'訓練方案', sub:\[\s*\n\s*\{label:'訓練方案', page:'coach_plans'\},\s*\n\s*\]\},/.test(src)
   && /g_train:'<svg viewBox="0 0 24 24"/.test(src));
ok('★★★ 手機在底部導覽（不是收在「其他」選單裡）',
   /\{key:'coach_plans', label:'訓練方案'\},/.test(src)
   && !/navTo\('coach_plans'\)\">\$\{moreIc/.test(src));
ok('★★ 不給櫃檯（沒有課要上，方案對他沒有用）',
   /⚠ 不給 fd:true：櫃檯沒有課要上，方案對他沒有用。/.test(src));
ok('★★ 動作資料庫留在環境設定（它是材料庫），沒有被一起搬走',
   /\{grp:'環境設定', label:'動作資料庫', page:'exercise_db'\},/.test(src));
ok('★★ 管理員看到的是自己那份（老闆本身也是教練，isCoachable 含 admin）',
   /管理員看到的是\*\*自己那份\*\*（頁面吃 SESSION\.id）/.test(src));

console.log('\n⑩ Phase 3：會員看得到自己的訓練紀錄');
{
  const g3=(a,b)=>{const i=src.indexOf(a); return src.slice(i, src.indexOf(b,i)+b.length);};
  const SESS=new Function('escH','tlSetLine','tlLogRowsHtml','return '+g3('function tlSessionsHtml(logs, limit){','\n}'))
    (x=>String(x), l=>'x', ls=>'<rows n="'+ls.length+'">');
  const L=[{booking_id:'B1',created_at:'2026-09-01T03:00'},
           {booking_id:'B1',created_at:'2026-09-01T03:05'},
           {booking_id:'B2',created_at:'2026-09-08T03:00'},
           {booking_id:null,created_at:'2026-09-09'}];
  const h=SESS(L,30);
  ok('★★★ 依課堂分組、最近的在前', h.indexOf('2026/09/08')<h.indexOf('2026/09/01'));
  /* 四筆裡有一筆沒有 booking_id → 只該分出兩堂（B1 兩個動作、B2 一個），那一筆整個不進來 */
  eq('★★★ 沒有 booking_id 的不畫（那筆掛不到任何一堂課）',
     [(h.match(/tlv-sess/g)||[]).length, /<rows n="2">/.test(h), /<rows n="1">/.test(h), /2026\/09\/09/.test(h)],
     [2,true,true,false]);
  eq('★★ 空清單回空字串（呼叫端才好接空狀態）', SESS([],30), '');
  eq('　　null 不會爆', SESS(null,30), '');
  ok('★★ limit 收得住', SESS(L,1).match(/tlv-sess/g).length===1);
}
ok('★★★ 會員課卡看得到當天（沒記過就整塊不畫，不要留空盒子）',
   /const _tl=\(await dbGetAll\('training_logs'\)\)\.filter\(l=>l&&l\.booking_id===b\.id\);/.test(src)
   && /if\(_tl\.length\)\{/.test(src)
   && /撈不到就整塊不畫，不要在課卡上留一個「載入失敗」的空盒子/.test(src));
ok('★★★ 會員多一頁「訓練紀錄」看歷史', /\{key:'mem_training', label:'訓練紀錄'\},/.test(src)
   && /PAGES\.mem_training=async function\(\)\{/.test(src));
ok('★★★ 會員只讀自己的（RLS 也有一條，這裡是畫面）',
   /\.filter\(l=>l&&l\.member_id===SESSION\.id\)/.test(src)
   && /這裡只讀不寫 —— 會員不能改教練記的東西/.test(src));
ok('★★★ 櫃檯那張「功能開發中」的空頁換成真的內容',
   !/功能開發中，敬請期待/.test(src)
   && /<div class="pp-card-t">訓練紀錄（\$\{_tl\.length\}）<\/div>/.test(src));
ok('★★ 訓練紀錄那一張表只有真的要看時才撈（每開一位會員都組一次 ctx）',
   /if\(PP\.recView==='training'\)\{/.test(src)
   && /訓練紀錄是四個分頁裡最少人點的那個/.test(src));

console.log('\n⑪ 先只開放給管理員（2026-09-09 使用者：「訓練方案可以先套在管理員權限了嗎」）');
{
  const E=who=>new Function('SESSION','return '+g('function wpEnabled(){','\n}'))(who)();
  eq('★★★ 管理員開、教練關', [E({role:'admin'}), E({role:'coach'})], [true,false]);
  eq('★★ 櫃檯／會員也關', [E({role:'front_desk'}), E({role:'member'}), E(null)], [false,false,false]);
}
ok('★★★ 只有一支判準，教練端要開放時改那一支就好',
   /只有這一支判準，教練端要開放時改這裡就好/.test(src)
   && (src.match(/wpEnabled\(\)/g)||[]).length>=5);
ok('★★★ 教練的三份導覽都吃這一支（少一份就是「點得到但不該點」的破口）',
   (src.match(/n\.key!=='coach_plans'\|\|wpEnabled\(\)/g)||[]).length===3);
ok('★★★ 課卡抽屜的「套用方案」也跟著關',
   /\$\{wpEnabled\(\)\?'<button class="btn btn-ghost" onclick="tlOpenPlanPick\(\)">套用方案<\/button>':''\}/.test(src));
ok('★★ 少一顆按鈕時「新增動作」要撐滿整列（不然是半條孤零零的按鈕）',
   /<div class="tl-acts\$\{wpEnabled\(\)\?'':' tl-acts-one'\}">/.test(src)
   && /\.tl-acts\.tl-acts-one\{grid-template-columns:1fr;\}/.test(src));
ok('★★ 管理員那兩個入口不受影響（頂欄一組、手機底部一顆）',
   /\{key:'g_train', label:'訓練方案', sub:\[/.test(src)
   && /\{key:'coach_plans', label:'訓練方案'\},/.test(src));
ok('★★ 頁面本身不另外擋，理由寫在原地（到不了就是到不了；RLS 才是真的防線）',
   /導覽列沒有入口、課卡上沒有按鈕，就到不了/.test(src));

console.log('\n⑫ 重量單位做成有顏色的標籤（2026-09-09 使用者指示）');
{
  const unitOf=fn('function wpUnitOf(x){','\n}');
  const wTxt=new Function('wpUnitOf','return '+g('function wpWeightTxt(w,u){','\n}'))(unitOf);
  const H=new Function('wpWeightTxt','wpUnitOf','return '+g('function wpWeightHtml(w,u){','\n}'))(wTxt,unitOf);
  eq('★★★ kg 與 lb 各自一個 class（顏色分開）',
     [H(40,'kg'), H(45,'lb')],
     ['<b class="wp-w">40</b><i class="wp-u wp-u-kg">kg</i>',
      '<b class="wp-w">45</b><i class="wp-u wp-u-lb">lb</i>']);
  eq('★★★ 徒手（留空）不畫標籤，不要出現一個沒有數字的單位', [H('','kg'), H(0,'lb'), H(null,'kg')], ['','','']);
  eq('★★ 小數照樣只留一位', H(42.5,'kg'), '<b class="wp-w">42.5</b><i class="wp-u wp-u-kg">kg</i>');
}
ok('★★★ 顏色不借紅／金（那兩色是警示與次要提示），kg 綠、lb 藍',
   /\.wp-u-kg\{background:rgba\(31,111,84,\.12\);color:var\(--green,#1f6f54\);\}/.test(src)
   && /\.wp-u-lb\{background:rgba\(35,80,138,\.13\);color:#23508a;\}/.test(src)
   && /不借紅／金：那兩色是警示與次要提示/.test(src));
ok('★★★ 深淺也分得開，不是只靠色相（有色覺差異的人也認得出）',
   /兩色的深淺也分得開，不是只靠色相/.test(src));
ok('★★★ 回 HTML 的那幾支呼叫端不能再 escH（escH 會把標籤變成字面文字）',
   /<span class="tlv-n">\$\{tlSetLine\(l\)\}<\/span>/.test(src)
   && !/escH\(tlSetLine\(l\)\)/.test(src)
   && /不能再 escH —— escH 會把標籤變成字面文字/.test(src));
ok('★★ 動作名稱那一段仍然有跳脫（那是人打的字）',
   /return \[escH\(it\.name\|\|'（未命名）'\)/.test(src));
ok('★★ 純文字版 wpItemLine 留著（title 屬性那類地方不能塞 HTML）',
   /function wpItemLine\(it\)\{/.test(src) && /function wpItemLineHtml\(it\)\{/.test(src));

console.log('\n⑬ 動作用「長按拖移」調順序（2026-09-09 四修）');
/* 沿革：拖移把手＋上下鍵常駐 →〔順序〕開關＋左右上下鍵 → 使用者：「動作順序移動還是
   改回久按拖移　但是剛剛拖移的時候卡片會變小　卡片大小不要變」。 */
{
  const LP=g('function wpLpStart(e,i){','\n}');
  ok('★★★ 長按 400ms 才進拖移（整列本來就要能點開編輯，直接可拖會打架）',
     /\},400\);/.test(LP) && /用長按（400ms）而不是 HTML5 draggable/.test(src));
  ok('★★★ 還沒滿 400ms 就移動超過 8px＝在捲畫面，取消',
     /if\(Math\.abs\(ev\.clientY-startY\)>8\)\{ clearTimeout\(timer\); finish\(false\); \}/.test(LP));
  ok('★★★ 拖曳中不改尺寸也不改內距（使用者：卡片大小不要變）',
     /不要 transform、不要改內距 —— 使用者明確要求卡片大小不要變/.test(src)
     && !/\.wp-item\.wp-item-ord\{padding-left:40px/.test(src));
  /* 2026-09-09 五修（使用者：「我剛剛拖移動作小卡　卡片沒有浮起來黏在手上的感覺」） */
  ok('★★★ 做一個原尺寸的分身跟著手指跑，原本那一列留在原位當佔位',
     /ghost=el\.cloneNode\(true\);/.test(LP)
     && /if\(ghost\) ghost\.style\.top=\(y-offY\)\+'px';/.test(LP)
     && /\.wp-item\.wp-dragging\{opacity:\.35;border-style:dashed;background:transparent;\}/.test(src));
  ok('★★★ 分身不縮放，只加陰影（先前明確要求過卡片大小不要變）',
     /\.wp-item\.wp-ghost\{background:#fff;border-color:var\(--brand,#1f6f54\);opacity:1;\s*\n\s*box-shadow:/.test(src)
     && !/wp-ghost[^}]*scale\(/.test(src));
  ok('★★★ 分身掛在 body、脫離清單，所以清單裡怎麼搬都不影響它',
     /掛在 body 上、脫離清單，所以清單裡怎麼搬都不影響它/.test(src));
  ok('★★★ z-index 要高過彈窗（這一頁本來就開在彈窗裡）',
     /z-index:10200;/.test(LP) && /\.modal-bg 是 9750/.test(src));
  ok('★★ 放開要把分身收掉，不然會留一張浮在畫面上',
     /if\(ghost\)\{ try\{ ghost\.remove\(\); \}catch\(_\)\{\} ghost=null; \}/.test(LP));
  ok('★★★ 長按不能選到文字 —— body 那條要 armed 之後才加，那 400ms 正好是選字的時間',
     /user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;\}/.test(src)
     && /那 400ms 正好就是\s*\n\s*瀏覽器開始選字的時間/.test(src));
/* 2026-09-09 六修（使用者：「動作小卡滑不動了　浮起來只有一下子」）——
   長按成立時重畫清單會把收到 pointerdown 的節點銷毀，瀏覽器隨即送 pointercancel，
   拖移在浮起來的下一刻就結束。改成全程只搬 DOM，放開才重排陣列。 */
  ok('★★★ 拖移全程不重畫清單（重畫＝節點被銷毀＝pointercancel＝拖移中斷）',
     /拖移全程只搬 DOM，絕對不重畫清單 —— 重畫會把收到 pointerdown 的節點/.test(src)
     && /那也會觸發 pointercancel（v1805 就是這樣「浮起來一下子」）/.test(src));
  ok('★★★ 拖移中用 insertBefore 搬節點（那是「移動」，節點物件還活著）',
     /box\.insertBefore\(el, before\)/.test(LP) && /box\.appendChild\(el\)/.test(LP));
  ok('★★★ 放開之後才依 DOM 順序重排陣列（data-i 是原本的位置）',
     /const order=rowsNow\(\)\.map\(r=>Number\(r\.dataset\.i\)\)\.filter\(n=>!isNaN\(n\)\);/.test(LP)
     && /if\(order\.length===orig\.length\) S\.items=order\.map\(k=>orig\[k\]\);/.test(LP));
  /* 2026-09-09 七修（使用者 v1813：「拖拉動作小卡的時候都會拉到整個視窗」「卡片都不動」）——
     觸控上瀏覽器在手指一動就決定要捲畫面，然後送 pointercancel，pointermove 從此不進來。 */
  ok('★★★ ① pointerdown 當下就關掉這一列的 touch-action',
     /try\{ el\.style\.touchAction='none'; \}catch\(_\)\{\}/.test(LP));
  ok('★★★ ② non-passive 的 touchmove，成立後每次 preventDefault（唯一保證停得住捲動的做法）',
     /const tmove=\(ev\)=>\{ if\(armed\) ev\.preventDefault\(\); \};/.test(LP)
     && /window\.addEventListener\('touchmove',tmove,\{passive:false\}\);/.test(LP)
     && /光靠 touch-action 改在半路沒有用/.test(src));
  ok('★★★ ③ 成立之後不再把 pointercancel 當結束，改等 pointerup／touchend',
     /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \};/.test(LP)
     && /window\.addEventListener\('touchend',up\);/.test(LP)
     && /window\.addEventListener\('touchcancel',up\);/.test(LP));
  ok('★★ 結束只跑一次（三種結束事件都可能一起來）',
     /if\(ended\) return; ended=true;/.test(LP));
  ok('★★ 收尾要把那一列的 touch-action 還原',
     /try\{ el\.style\.touchAction=''; \}catch\(_\)\{\}/.test(LP));
  ok('★★★ 放開後那一次 click 要吃掉，不然會跳出編輯視窗',
     /window\._wpDragged=1;/.test(LP)
     && /if\(window\._wpDragged\)\{ window\._wpDragged=0; return; \}/.test(src));
  ok('★★ 外框留在被移動的那一列（0909 三修的那個回報）',
     /S\._ordSel=rowsNow\(\)\.indexOf\(el\);/.test(LP));
  /* 2026-09-09 八修（使用者：「為什麼拖拉動作卡片的時候　會有一個自己被框起來
     下面那個分腿蹲我沒有按他」）—— 那是上一次拖完留下的標記。 */
  ok('★★★ 新的一次拖移開始時，先把上一次留下的外框清掉',
     /S\._ordSel=null;\s*\n\s*document\.querySelectorAll\('#wp-items \.wp-item-sel'\)\.forEach\(x=>x\.classList\.remove\('wp-item-sel'\)\);/.test(LP)
     && /畫面上會同時有兩個被框起來的，看起來就像框在沒碰過的卡片上/.test(src));
  ok('★★★ 清的時候只能改 class，不能呼叫 wpPaint（拖移中重畫會中斷拖移）',
     /直接改 class，不能呼叫 wpPaint（拖移中重畫＝節點被銷毀＝pointercancel）/.test(src));
  /* 2026-09-09 九修（使用者：「2號 還是會自己被選取」）—— 會畫出框的有兩個來源，兩個都處理。 */
  ok('★★★ ①「剛移動」的標記 1.6 秒後自己退掉（標記是暫時的，就該有壽命）',
     /\},1600\);/.test(LP) && /標記是暫時的，就該有壽命/.test(src));
  ok('★★★ 退掉時要確認還是同一份方案（中途換方案就不要亂清別人的）',
     /if\(!window\._wp \|\| window\._wp!==S\) return;/.test(LP));
  ok('★★★ ② 列的 hover 外框整條移除 —— 放開後滑鼠停在哪一列就框哪一列，看起來像被選取',
     !/\.wp-item:hover\{border-color:var\(--brand,#1f6f54\);\}/.test(src)
     && /hover 描框給不了什麼資訊，卻兩次被誤認成選取狀態/.test(src));
  ok('★★ ✕ 不進拖移（不然想刪卻變成拖）',
     /if\(e\.target && e\.target\.closest && e\.target\.closest\('\.wp-item-x'\)\) return;/.test(LP));
  ok('★★ 拖移中整頁不跟著捲', /body\.wp-dragging-on\{touch-action:none;user-select:none;\}/.test(src));
  ok('★★★ 舊那一套（上下鍵＋HTML5 draggable）整組移除，不留死碼',
     !/function wpMove\(/.test(src) && !/function wpDragStart\(/.test(src)
     && !/wp-ordbtn/.test(src) && !/window\._wpDragI/.test(src)
     && /〔已移除〕wpMove／wpDragStart/.test(src));
  ok('★★ 為什麼不用 HTML5 draggable，理由寫在原地',
     /HTML5 draggable 在手機上根本不會觸發/.test(src));
  /* 2026-09-09 使用者：「動作小卡在名稱旁邊加上順序編號」 */
  ok('★★★ 名稱旁邊有順序編號，用當下位置算（拖移之後自然跟著重排，不另外存）',
     /<i class="wp-item-no">\$\{i\+1\}<\/i>/.test(src)
     && /編號是「第幾個做」，拖移之後會跟著重排，所以直接用當下的位置算，不另外存/.test(src));
  ok('★★ 編號是位置不是內容，樣式上不跟動作名稱搶',
     /\.wp-item-no\{flex:none;font-style:normal;font-family:var\(--num\);/.test(src)
     && /它是位置不是內容，不要跟動作名稱搶/.test(src));
}

console.log('\n⑬b 一列拆兩行：動作靠左、次數×組數×重量靠右');
{
  const NH=new Function('wpWeightHtml','Number','return '+g('function wpItemNumsHtml(it){','\n}'))
    ((w,u)=>w?('<b>'+w+'</b><i>'+(u||'kg')+'</i>'):'', Number);
  eq('★★★ 只回數字那一段（名稱在上面一行）', NH({name:'深蹲',reps:12,sets:3,weight:40,unit:'kg'}),
     '12 次 × 3 組 × <b>40</b><i>kg</i>');
  eq('★★ 徒手就只有次數與組數', NH({name:'棒式',reps:30,sets:3,weight:''}), '30 次 × 3 組');
  eq('★★ 什麼都沒填就回空字串（呼叫端才好整行不畫）', NH({name:'X'}), '');
  eq('　　null 不會爆', NH(null), '');
}
ok('★★★ 第一列動作靠左、第二列數字靠右',
   /\.wp-item-nm\{[^}]*text-align:left;/.test(src)
   && /\.wp-item-num\{[^}]*text-align:right;/.test(src)
   && /<div class="wp-item-nm">/.test(src) && /<div class="wp-item-num">/.test(src));
ok('★★ 數字整段空的時候不畫那一行（不要留一條空的）',
   /const _n=wpItemNumsHtml\(it\); return _n\?`<div class="wp-item-num">/.test(src));

console.log('\n⑭ 教練手機首頁的課卡加「課表」圓鈕（2026-09-09 使用者指示）');
ok('★★★ 圓鈕直接開訓練課表，不用先點開課卡（上課現場少一層）',
   /onclick="event\.stopPropagation\(\);openTrainingLog\('\$\{b\.id\}'\)"/.test(src)
   && /上課現場最常做的就是記訓練，原本要點開課卡再點一次訓練紀錄，兩層/.test(src));
ok('★★★ 要 stopPropagation：整張卡本來就會開課卡明細',
   /class="a2-tlbtn[\s\S]{0,200}event\.stopPropagation\(\);openTrainingLog/.test(src));
ok('★★★ 自主訓練不畫（會員自己來、教練不在場，沒有訓練要記）',
   /const _tlOk=!bkIsSelf\(b\);/.test(src)
   && /自主訓練不畫：那是會員自己來、教練不在場，沒有訓練要記/.test(src));
ok('★★ 記過的實心綠、沒記的外框（看得出哪幾堂還沒記）',
   /const _tlHas=\(window\._tlogBids\|\|new Set\(\)\)\.has\(b\.id\);/.test(src)
   && /\.chv2 \.admh2-card \.a2-tlbtn\.on\{background:var\(--green,#1f6f54\);color:#fff;/.test(src));
ok('★★★ 只在教練首頁畫（管理員首頁與會員端用的是同一個 .admh2-card）',
   /\.chv2 \.admh2-card\{grid-template-columns:auto minmax\(0,1fr\) auto auto;\}/.test(src)
   && /只在教練首頁（\.chv2）畫：管理員首頁與會員端用的是同一個 \.admh2-card/.test(src));
ok('★★ 卡片多一欄放它（原本是三欄，硬塞會把中間那欄壓掉）',
   /grid-template-columns:auto minmax\(0,1fr\) auto auto;/.test(src));

console.log('\n⑮ 課卡的圓形「課表」鈕（2026-09-09 使用者：「點這邊的課卡多一顆圓形按鈕[課表]」）');
/* 2026-09-09 二修：櫃檯不畫這顆鈕（見 tests/grprepofftest.js） */
ok('★★★ 課卡圓鈕多一顆課表，直接開訓練課表（櫃檯除外）',
   /if\(!_calCtx && own && !bkIsSelf\(b\) && !\(SESSION&&SESSION\.role==='front_desk'\)\)\s*\n\s*btns \+= evoBtn\('evo-t2','',`collapseBkCard\(\);openTrainingLog\('\$\{id\}'\)`,'plan','課表'\);/.test(src));
ok('★★★ 自主訓練不畫（會員自己來、教練不在場，沒有訓練要記）',
   /⚠ 自主訓練不畫：那是會員自己來、教練不在場，沒有訓練要記。\s*\n\s*⚠ 行事曆情境/.test(src));
ok('★★★ 行事曆情境不畫（那邊的圓鈕只做「預約與調整」，0819 定案）',
   /⚠ 行事曆情境（_calCtx）不畫：那邊的圓鈕只做「預約與調整」（0819 定案）/.test(src));
ok('★★ 別人的課不畫（訓練紀錄掛在帶課教練身上）',
   /⚠ 別人的課也不畫（own）—— 訓練紀錄是掛在帶課教練身上的。/.test(src));
ok('★★ 圖示與底部導覽的訓練方案同一個造型（同一件事不要兩種圖示）',
   /plan:`<svg viewBox="0 0 24 24" \$\{EVO_C\}><rect x="4" y="3\.5" width="16" height="17" rx="2\.5"\/>/.test(src));

console.log('\n⑯ 管理員手機首頁的教練列（使用者：「名稱靠左　課堂數靠右」）');
ok('★★★ 名字釘左、堂數釘右（原本兩段緊貼，名字長短不一堂數就浮動）',
   /\.mtc-r2-name\{[^}]*justify-content:space-between;gap:6px;/.test(src)
   && /名字釘左、堂數釘右，一整欄的堂數才對得齊/.test(src));

console.log('\n⑰ 訓練課表抽屜的兩個回報（2026-09-09）');
ok('★★★ 從抽屜開出來的彈窗要蓋在抽屜上面（抽屜 9999 > 彈窗 9750）',
   /body:has\(#tl-sheet\) \.modal-bg,/.test(src)
   && /body:has\(#bk-mem-sheet\) \.modal-bg\{z-index:10050;\}/.test(src)
   && /從抽屜裡開出來的\s*\n\s*彈窗會躲在抽屜後面/.test(src));
ok('★★★ 用 10050 不用更高 —— 挑選視窗 #adp-sheet 是 10090，那一層要能蓋在彈窗上面',
   /用 10050 不用更高：挑選視窗 #adp-sheet 是 10090/.test(src)
   && /#adp-sheet\{position:fixed;inset:0;z-index:10090;\}/.test(src));
ok('★★★ 動作名稱長就截斷，不要把右邊的數字擠出去（flex 子項預設 min-width:auto）',
   /\.tlh-ex\{font-size:14\.5px;font-weight:700;color:var\(--text\);\s*\n\s*min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}/.test(src)
   && /flex 子項預設 min-width:auto，長字串不會縮/.test(src));
ok('★★ 右邊那段不折行、不被壓縮',
   /\.tlh-sets\{[^}]*flex:none;white-space:nowrap;\}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
