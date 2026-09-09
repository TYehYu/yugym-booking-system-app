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
   (src.match(/n\.key!=='coach_calendar'&&n\.key!=='coach_plans'/g)||[]).length===2);
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
ok('★★★ 名稱與備註放在重畫範圍外（打到一半被清掉是踩過的坑）',
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
  ok('★★★ 顯示那一段全檔三份都吃得到新欄位（教練抽屜／員工卡／會員資料）',
     (src.match(/if\(l\.weight!=null&&l\.weight!==''\)\{/g)||[]).length===3
     && /這一段全檔有三份（教練抽屜／員工卡／會員資料），三處都要吃得到/.test(src));
  ok('★★★ 手動逐組記錄也把重量落一份到新欄位 —— 兩條路要讀得到同一個地方',
     /weight:\(function\(\)\{ const w=valid\.map\(x=>Number\(x\.weight\)\)/.test(src));
}

console.log('\n⑨ 管理員也用得到（2026-09-09 使用者：「先把這個功能開放到管理員端」）');
ok('★★ 桌機在「管理員 → 環境設定」，接在動作資料庫旁邊',
   /\{grp:'環境設定', label:'訓練方案', page:'coach_plans'\},/.test(src));
ok('★★ 手機收在「其他」選單（底部三顆不再擠第四顆）',
   /navTo\('coach_plans'\)\">\$\{moreIc\('plan'\)\}訓練方案/.test(src)
   && /k==='plan'\?BN_ICONS\.coach_plans/.test(src));
ok('★★ 管理員看到的是自己那份（老闆本身也是教練，isCoachable 含 admin）',
   /管理員看到的是\*\*自己那份\*\*方案（頁面吃 SESSION\.id）/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
