/* 2026-08-06 使用者指示：「首頁的課卡也可以加入剛剛的流星功能嗎？
   完成的課卡周邊給霧化的綠框、正在上課的給流星、有簽到的給綠色、沒有簽到的給金色」

   四種狀態都只靠 CSS（不多讀任何資料）：
     tcard-done ＝已簽到/完成 → 綠框＋霧化外暈
     tcard-live ＝上課中       → 流星繞圈（尾巴＋頭部圓點，與本堂圓形卡同一套）
     tcard-miss ＝時間過了還沒簽到 → 金框（提醒補簽）
     tcard-cancel ＝已取消（原本就有） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 狀態判定（實跑那段條件）');
{
  /* 課卡上的四個旗標：canceled / live / done / _miss —— 這裡把判定式抽出來跑，
     確認同一時間只會落在一種狀態（不會又是上課中又是逾時未簽）。 */
  const mk=(startMin,dur,nowMin,doneFlag,cancelFlag)=>{
    const canceled=!!cancelFlag, done=!!doneFlag;
    const live = !canceled && nowMin>=startMin && nowMin<startMin+dur;
    const _miss = !canceled && !done && !live && nowMin>=startMin+dur;
    return [canceled?'cancel':'', live?'live':'', done?'done':'', _miss?'miss':''].filter(Boolean);
  };
  eq('★ 上課時間內、未簽到 → live', mk(600,60,610,false,false), ['live']);
  /* 2026-08-06 二修（使用者回報「還是沒看到流星」）：櫃檯通常一上課就簽到，
     若要求「未簽到」才算上課中，進行中的課永遠不會亮 → 改成純看時間。 */
  eq('★ 上課時間內、已簽到 → 仍是 live（流星照跑）', mk(600,60,610,true,false), ['live','done']);
  eq('★ 課已結束、有簽到 → done', mk(600,60,700,true,false), ['done']);
  eq('★ 課已結束、沒簽到 → miss（金框提醒補簽）', mk(600,60,700,false,false), ['miss']);
  eq('★ 還沒開始 → 沒有任何狀態框', mk(600,60,500,false,false), []);
  eq('　　已取消 → 只有 cancel（不會同時 miss）', mk(600,60,700,false,true), ['cancel']);
}

console.log('\n② 樣式接線');
ok('★ 卡片帶上 tcard-miss（其餘旗標不變）',
   /\$\{_miss\?' tcard-miss':''\}/.test(src)
   && /const _miss = !canceled && !done && !live && nowMin>=mn\+\(Number\(b\.duration\)\|\|60\);/.test(src));
/* 2026-08-06 定版（使用者三次回饋後撤回 offset-path 版）：框固定不動、只掃漸層角度，
   亮帶含前端白光沿四邊與圓角走；不另加頭部圓點（加了反而對不齊）。 */
ok('★ 上課中：框不動、只掃漸層角度（不另加頭部圓點）',
   /@property --tcAng\{ syntax:'<angle>'; inherits:false; initial-value:0deg; \}/.test(src)
   && /background:conic-gradient\(from var\(--tcAng\),/.test(src)
   && /@keyframes tcardComet\{ from\{--tcAng:0deg;\} to\{--tcAng:360deg;\} \}/.test(src)
   && !/offset-path:border-box/.test(src)
   && !/\.tcard-std\.tcard-live::after\{/.test(src));
ok('★ 上課中／逾時未簽仍疊在左側教練欄之上（框不被切掉）',
   /\.tcard-std\.tcard-live,\.tcard-std\.tcard-miss\{z-index:5;\}/.test(src)
   && /\.tcard-coach\{width:118px;flex-shrink:0;padding-top:4px;position:sticky;left:0;z-index:4;/.test(src));
ok('　　卡片容器留出光暈空間（padding 10 ／ margin -10）',
   /\.tcard-list\{padding:10px;margin:-10px;\}/.test(src));
/* 2026-08-06 使用者指示：完成（有簽到、時間也過了）→ 流星停下來、整圈保持全亮 */
ok('★ 完成的課卡：整圈全亮（同一圈遮罩、不動、整圈同色）',
   /\.tcard-std\.tcard-done:not\(\.tcard-live\)::before\{content:'';position:absolute;inset:-2px;/.test(src)
   && /background:linear-gradient\(#2f9c74,#2f9c74\);/.test(src)
   && /mask-composite:exclude; padding:3px;\n\s*filter:drop-shadow\(0 0 3px rgba\(47,156,116,\.55\)\);\}/.test(src));
ok('　　上課中優先（同時 done＋live 時跑流星，不是全亮）',
   /\.tcard-std\.tcard-done:not\(\.tcard-live\)::before/.test(src));
ok('★ 逾時未簽：金框', /\.tcard-std\.tcard-miss \.tcard-body\{border-color:var\(--gold,#B48A56\);/.test(src));
/* 2026-08-06 二修（使用者回報：「流星繞著圓形了，可是課卡是方形」）——
   方形卡不能用「旋轉的圓點」當頭（那顆走圓形軌跡會切過角落）；
   改成只留沿邊框跑的尾巴，前端加白光當頭（conic 掃角度 × 方框環狀遮罩＝沿著邊緣走）。 */
/* 2026-08-06 三修（使用者回報「還在轉圈圈」）：transform:rotate 轉的是方框本身 →
   看起來是方塊在轉。改成框不動、只動 conic 的起始角度（@property 才能對角度做動畫）。 */
ok('　　只有 CSS，沒有多讀資料（沒有新的 dbGetAll）',
   !/tcard-live[\s\S]{0,200}dbGetAll/.test(src));

console.log('\n③ 時間到了自動換狀態（2026-08-06 使用者回報「首頁的流星還沒看到」）');
/* 課卡是畫的當下算 live/miss，時間跨過開課或下課就過期了 —— 每 30 秒就地換 class，不重抓資料 */
{
  const cls=new Set(['tcard','tcard-std']);
  const el={classList:{contains:c=>cls.has(c),toggle:(c,on)=>{ on?cls.add(c):cls.delete(c); }},dataset:{st:'720',du:'60'}};
  const fn=new Function('document',
    src.slice(src.indexOf('function tcardStateTick('), src.indexOf('/* ══════ 現場抽獎登記'))
    +'\nreturn tcardStateTick;')({querySelectorAll:()=>[el]});
  fn(700); ok('★ 還沒開始：兩種狀態都不掛', !cls.has('tcard-live') && !cls.has('tcard-miss'));
  fn(730); ok('★ 12:00 的課到了 12:10 → 掛上 tcard-live（流星開始跑）', cls.has('tcard-live') && !cls.has('tcard-miss'));
  {
    const c3=new Set(['tcard','tcard-std','tcard-done']);
    const e3={classList:{contains:c=>c3.has(c),toggle:(c,on)=>{ on?c3.add(c):c3.delete(c); }},dataset:{st:'720',du:'60'}};
    new Function('document', src.slice(src.indexOf('function tcardStateTick('), src.indexOf('/* ══════ 現場抽獎登記'))
      +'\nreturn tcardStateTick;')({querySelectorAll:()=>[e3]})(730);
    ok('★ 已簽到但還在上課時間內 → 也要跑流星', c3.has('tcard-live'));
  }
  fn(800); ok('★ 下課後沒簽到 → 換成 tcard-miss（金框）', !cls.has('tcard-live') && cls.has('tcard-miss'));
  const cls2=new Set(['tcard','tcard-std','tcard-done']);
  const el2={classList:{contains:c=>cls2.has(c),toggle:(c,on)=>{ on?cls2.add(c):cls2.delete(c); }},dataset:{st:'720',du:'60'}};
  new Function('document', src.slice(src.indexOf('function tcardStateTick('), src.indexOf('/* ══════ 現場抽獎登記'))
    +'\nreturn tcardStateTick;')({querySelectorAll:()=>[el2]})(800);
  ok('　　已簽到的不動它（不會被改成逾時未簽）', cls2.has('tcard-done') && !cls2.has('tcard-miss'));
}
ok('★ 課卡帶開始時間與時長（供 tick 使用）', /data-st="\$\{mn\}" data-du="\$\{Number\(b\.duration\)\|\|60\}"/.test(src));
ok('★ 每 30 秒的現在線 tick 會順便更新課卡狀態', /tcardStateTick\(nm\);/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
