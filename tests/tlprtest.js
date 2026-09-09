/* 訓練課表 2026-09-09 四件事：
   ① 教練只能看／設定自己課的課表，代課看得到該會員的歷史
   ②「剩餘 自訂方案 0/10」被讀成第 0 堂 → 改寫第幾堂
   ③「最近訓練」那一格沒有置中
   ④ 三大項歷史紀錄（深蹲／硬舉／臥推），超過就自動換、舊的留著 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 教練只進得去自己的課');
ok('★★★ 教練（非主管）不是這堂的教練就擋下',
   /if\(SESSION && SESSION\.role==='coach' && !SESSION\.is_manager && !bkIsCoach\(b,SESSION\.id\)\)\{\s*\n\s*showToast\('這不是你的課，看不到課表'\); return;/.test(src));
ok('★★★ 代課算自己的課 —— bkIsCoach 兩欄都認',
   /return String\(b\.coach_id\|\|''\)===String\(cid\) \|\| String\(b\.substitute_coach_id\|\|''\)===String\(cid\);/.test(src));
ok('★★★ 前端這道只是為了給訊息，真正的把關寫明在資料庫',
   /真正的把關在資料庫的\s*\n\s*training_logs \/ tlog_select_scoped/.test(src));
ok('★★ 主管不受限（他要看全店）', /!SESSION\.is_manager && !bkIsCoach/.test(src));

console.log('\n② 第幾堂');
ok('★★★ 不再直接印 sessions_remaining/total',
   !/tkText=`\$\{tk\.plan_name\|\|'票券'\}　\$\{tk\.sessions_remaining\}\/\$\{tk\.sessions_total\}`/.test(src));
ok('★★★ 沿用 2026-08-19 定版的算法：已用 −「排在本堂之後」的有效預約',
   /_seq=\(_tot-_rem\)-_after;/.test(src)
   && /第N ＝ 帳面已用（總−剩餘）−「排在本堂之後」的有效預約數/.test(src));
ok('★★★ 只算這張票、排除取消與 sibling（重複扣的第二個名額）',
   /String\(x\.ticket_id\|\|''\)===String\(tk\.id\)\s*\n?\s*&& x\.status!=='cancelled' && !x\.sibling_of/.test(src));
ok('★★★ 之後 = 日期＋時間都比本堂晚（同日多堂不能只比日期）',
   /const _key=x=>String\(x\.date\|\|''\)\+' '\+String\(x\.start_time\|\|''\);/.test(src)
   && /_mine\.filter\(x=>_key\(x\)>_key\(b\)\)\.length/.test(src));
ok('★★★ 算不出合理值就退回舊寫法，不硬印一個錯的堂數',
   /\(_seq>=1 && _tot>0 && _seq<=_tot\)/.test(src)
   && /剩餘 \$\{_rem\}\/\$\{_tot\}/.test(src));
ok('★★ 「剩餘」兩個字不再重複（外層已經拿掉）',
   !/`　·　剩餘 \$\{window\._tlTkText\}`/.test(src));
ok('★★ 誤讀的原因寫在原地（預扣型票券帳面剩餘早早歸 0）',
   /預扣型票券的帳面剩餘很早就歸 0/.test(src));

console.log('\n③ 最近訓練那格置中');
ok('★★★ 兩格改直向置中（原本只有 text-align，內容矮的那格貼上緣）',
   /\.tlh-ov-cell\{[^}]*display:flex;flex-direction:column;align-items:center;justify-content:center;\}/.test(src));
ok('★★ 原因寫在原地', /只靠 text-align\s*\n?\s*只有水平置中/.test(src));

console.log('\n④ 三大項歷史紀錄');
{
  /* 把算法整段挖出來實跑，不只比對字串 */
  const F=new Function(`
    ${g('const TL_LB2KG=','return [reps*sets*kg, kg];\n}')}
    ${g('function tlPrBetter(a,b){','比重量；完全一樣不算破紀錄\n}')}
    ${g('function tlPrChain(logs){','  return chain;\n}')}
    ${g('const TL_PR_LIFTS=','.filter(Boolean);\n}')}
    return {tlPrChain,tlPrByExercise,tlPrScore,tlPrBetter,TL_PR_LIFTS};`)();

  eq('★★★ 只追這三項', F.TL_PR_LIFTS, ['深蹲','硬舉','臥推']);

  const L=(d,ex,reps,sets,w,u)=>({created_at:d,exercise_name:ex,reps,sets,weight:w,weight_unit:u||'kg'});
  const logs=[
    L('2026-07-07','槓鈴深蹲',10,3,60),
    L('2026-07-21','槓鈴深蹲',8,3,55),      // 比較輕 → 不算破紀錄
    L('2026-08-04','史密斯深蹲',10,3,70),   // 換動作但一樣是深蹲 → 破了
    L('2026-08-18','槓鈴深蹲',12,3,70),     // 同重量、次數更多 → 破了
    L('2026-08-25','槓鈴深蹲',12,3,70),     // 完全一樣 → 不算破
    L('2026-08-11','相撲硬舉',5,5,100),
    L('2026-09-01','上斜臥推',10,3,40),
    L('2026-09-02','保加利亞分腿蹲',12,3,200), // 不含關鍵字 → 不入三大項
    L('2026-09-03','徒手深蹲',20,3,null),      // 沒重量 → 不進紀錄
  ];
  const r=F.tlPrByExercise(logs);
  eq('★★★ 三項各一列，沒練過的不出現', r.map(x=>x.lift), ['深蹲','硬舉','臥推']);
  const sq=r.find(x=>x.lift==='深蹲');
  eq('★★★ 深蹲目前紀錄＝總量最高那筆（70×12×3=2520）',
     [sq.best.weight,sq.best.reps,sq.best.sets,sq.best.exercise_name], [70,12,3,'槓鈴深蹲']);
  eq('★★★ 留下歷程：總量一路往上（1800 → 2100 → 2520），變低、打平的都不列',
     sq.chain.map(l=>l.created_at), ['2026-07-07','2026-08-04','2026-08-18']);
  ok('★★★ 換動作照樣歸戶（史密斯深蹲也算深蹲），但列出破紀錄當下的動作名',
     sq.chain[1].exercise_name==='史密斯深蹲');
  ok('★★★ 名稱不含關鍵字的不會混進來（保加利亞分腿蹲沒有變成深蹲紀錄）',
     sq.best.exercise_name==='槓鈴深蹲');
  ok('★★★ 沒填重量的不進紀錄（徒手訓練）', F.tlPrScore(L('2026-09-03','徒手深蹲',20,3,null))===null);

  console.log('  —— 比較方式＝訓練總量（2026-09-09 使用者原話的那組數字）');
  const vol=l=>F.tlPrScore(l)[0];
  eq('★★★ 10×3×60 ＝ 1800', vol(L('d','深蹲',10,3,60)), 1800);
  eq('★★★ 6×4×80 ＝ 1920', vol(L('d','深蹲',6,4,80)), 1920);
  ok('★★★ 1920 > 1800 → 更新紀錄（重量比較輕也算，這正是使用者要的）',
     F.tlPrBetter(F.tlPrScore(L('d','深蹲',6,4,80)), F.tlPrScore(L('d','深蹲',10,3,60)))===true);
  ok('★★★ 反過來不算（1800 破不了 1920）',
     F.tlPrBetter(F.tlPrScore(L('d','深蹲',10,3,60)), F.tlPrScore(L('d','深蹲',6,4,80)))===false);
  ok('★★★ 不是比最大重量 —— 80kg 那筆贏，不是因為它比較重，是總量比較大',
     vol(L('d','深蹲',1,1,200))===200
     && F.tlPrBetter(F.tlPrScore(L('d','深蹲',1,1,200)), F.tlPrScore(L('d','深蹲',10,3,60)))===false);
  ok('★★★ lb 先換算成公斤再乘（10×3×100lb ≈ 1361，輸給 1800）',
     Math.round(vol(L('d','深蹲',10,3,100,'lb')))===1361
     && F.tlPrBetter(F.tlPrScore(L('d','深蹲',10,3,100,'lb')), F.tlPrScore(L('d','深蹲',10,3,60)))===false);
  ok('★★★ 次數／組數沒填當 1，不能當 0（當 0 總量歸零、永遠破不了紀錄）',
     vol(L('d','深蹲',null,null,60))===60);
  ok('★★★ 打平不算破紀錄（否則每次做一樣的都多一列）',
     F.tlPrBetter([1800,60],[1800,60])===false);
  ok('★★ 同總量比重量（1800 用 90kg 做 vs 60kg 做 → 重的贏）',
     F.tlPrBetter(F.tlPrScore(L('d','深蹲',10,2,90)), F.tlPrScore(L('d','深蹲',10,3,60)))===true);
}
ok('★★★ 不另開資料表 —— 紀錄由 training_logs 推導，所以「自動更新」不用寫同步',
   /沒有另開一張表：紀錄本來就是 training_logs 算得出來的/.test(src));
ok('★★★ 總覽露出三大項＋「全部紀錄」入口',
   /<button class="tlh-hq-btn" onclick="tlOpenPrHistory\(\)">全部紀錄 ›<\/button>/.test(src));
ok('★★★ 視窗列出每一項的完整歷程，最新那列標起來',
   /function tlOpenPrHistory\(\)\{/.test(src)
   && /r\.chain\.slice\(\)\.reverse\(\)\.map\(\(l,i\)=>`<div class="prh-row\$\{i\?'':' on'\}">/.test(src)
   && /\.prh-row\.on\{background:#e3efe9;/.test(src));
ok('★★ 沒紀錄時講得出「還沒有」，不是空白',
   /還沒有深蹲／硬舉／臥推的紀錄。/.test(src));
ok('★★★ 紀錄列要看得到總量（判準就是這個數字，不列出來看不出為什麼這筆贏）',
   /<em class="prh-vol">\$\{tlPrVol\(l\)\}<\/em>/.test(src)
   && /<em class="prh-vol">\$\{tlPrVol\(r\.best\)\}<\/em>/.test(src)
   && /\.prh-vol\{/.test(src));
ok('★★★ 次數與組數本來就在紀錄列上（tlSetLine 就是「12 次 × 3 組 × 70kg」）',
   /\(l\.reps!=null\?l\.reps\+' 次':null\),\(l\.sets\?l\.sets\+' 組':null\)/.test(src));
ok('★★ 會員自己命名的動作名要跳脫（tlSetLine 回 HTML，動作名不在裡面）',
   /<span class="prh-x">\$\{escH\(l\.exercise_name\|\|''\)\}<\/span>/.test(src)
   && /<span class="tlh-pr-ex">\$\{escH\(r\.lift\)\}<\/span>/.test(src));
ok('★★ 這張視窗是從抽屜裡開的 —— 靠 body:has 那條規則才蓋得住抽屜',
   /body:has\(#tl-sheet\) \.modal-bg/.test(src));

console.log('\n⑤ 抽屜不要蓋住頂列（2026-09-09：「上面表頭logo要露出」）');
ok('★★★ mc-mode 下抽屜從頂列下方開始（桌機 60px、平板 56px）',
   /body\.mc-mode #tl-sheet,body\.mc-mode #tl-add-sheet\{top:60px;\}/.test(src)
   && /@media\(max-width:1080px\)\{ body\.mc-mode #tl-sheet,body\.mc-mode #tl-add-sheet\{top:56px;\} \}/.test(src));
ok('★★★ 數字對得上頂列本身的高度（不是隨手抓的）',
   /body\.mc-mode \.mc-sidebar\{[\s\S]{0,200}height:60px;/.test(src)
   && /body\.mc-mode \.mc-sidebar\{width:100%;padding:0 12px;height:56px;\}/.test(src));
ok('★★★ 手機不套（.topbar 是 sticky、沒有 fixed 頂列要讓）',
   /手機沒有 fixed 頂列（\.topbar 是 sticky、會跟著捲），維持整片蓋滿/.test(src)
   && /\.topbar-fixed\{position:sticky;top:0;/.test(src));
ok('★★★ 頂列露出來就點得到 → 換頁要把抽屜收掉，否則浮在新頁面上',
   /if\(document\.getElementById\('tl-sheet'\)\)\{ try\{ closeTrainingLog\(\); \}catch\(_\)\{\} \}/.test(src)
   && /function navTo\(key, gkey\)\{\s*\n\s*inkApply\(\);\s*\n\s*\/\* 課表抽屜的頂列是露出來的/.test(src));
ok('★★ 只改 top，面板置中靠 top:50% 自己重算（沒有第二處要跟著改）',
   /\.ms-panel\{position:absolute;left:0;right:0;top:0;/.test(src)
   && /只改 top，不動 inset 其餘三邊/.test(src));

console.log('\n⑥ 「點下方新增動作開始記錄」卡在奇怪的位子（2026-09-09）');
ok('★★★ 根因：值班時間軸的 .tl-empty 是絕對定位、又排在最後 → 蓋掉抽屜的同名規則',
   /\.tl-track \.tl-empty\{position:absolute;top:50%;left:50%;/.test(src)
   && !/^\.tl-empty\{position:absolute/m.test(src));
ok('★★★ 抽屜的空狀態改用自己的名字，不再被同名規則波及',
   /\.tls-empty\{text-align:center;/.test(src)
   && /\? '<div class="tls-empty">尚無訓練紀錄/.test(src));
ok('★★★ 抽屜面板也改名 —— .tl-panel 是時間軸那張卡，padding／背景／overflow-x 會整組蓋過來',
   /\.tls-panel\{padding-bottom:16px;\}/.test(src)
   && /<div class="ms-panel tls-panel">/.test(src));
ok('★★★ 抽屜裡不再留任何 tl-panel／tl-empty 的用法',
   !/class="ms-panel tl-panel"/.test(src)
   && !/<div class="tl-empty">尚無訓練紀錄/.test(src));
ok('★★ 時間軸那邊照舊（🌙 今日無課 仍在 .tl-track 裡，仍是釘在長條中央）',
   /<div class="tl-track">/.test(src) && /<div class="tl-empty">🌙 今日無課<\/div>/.test(src));
ok('★★ 陷阱寫在原地：tl- 前綴被兩個不相干的東西共用',
   /tl- 這個前綴被兩個不相干的東西共用（值班時間軸／訓練課表）/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
