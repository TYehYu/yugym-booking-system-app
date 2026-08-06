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
    const live = !canceled && nowMin>=startMin && nowMin<startMin+dur && !done;
    const _miss = !canceled && !done && !live && nowMin>=startMin+dur;
    return [canceled?'cancel':'', live?'live':'', done?'done':'', _miss?'miss':''].filter(Boolean);
  };
  eq('★ 上課時間內、未簽到 → live', mk(600,60,610,false,false), ['live']);
  eq('★ 上課時間內、已簽到 → done（不再閃流星）', mk(600,60,610,true,false), ['done']);
  eq('★ 課已結束、有簽到 → done', mk(600,60,700,true,false), ['done']);
  eq('★ 課已結束、沒簽到 → miss（金框提醒補簽）', mk(600,60,700,false,false), ['miss']);
  eq('★ 還沒開始 → 沒有任何狀態框', mk(600,60,500,false,false), []);
  eq('　　已取消 → 只有 cancel（不會同時 miss）', mk(600,60,700,false,true), ['cancel']);
}

console.log('\n② 樣式接線');
ok('★ 卡片帶上 tcard-miss（其餘旗標不變）',
   /\$\{_miss\?' tcard-miss':''\}/.test(src)
   && /const _miss = !canceled && !done && !live && nowMin>=mn\+\(Number\(b\.duration\)\|\|60\);/.test(src));
ok('★ 完成／已簽到：綠框＋霧化外暈',
   /\.tcard-std\.tcard-done \.tcard-body\{border-color:var\(--green,#1f6f54\);/.test(src)
   && /box-shadow:0 0 0 2px rgba\(31,111,84,\.16\), 0 0 10px 2px rgba\(31,111,84,\.18\);\}/.test(src));
ok('★ 逾時未簽：金框', /\.tcard-std\.tcard-miss \.tcard-body\{border-color:var\(--gold,#B48A56\);/.test(src));
ok('★ 上課中：流星尾巴（conic＋遮罩成細框）＋頭部圓點，兩層同一組動畫',
   /\.tcard-std\.tcard-live::before,\.tcard-std\.tcard-live::after\{content:'';position:absolute;inset:-2px;/.test(src)
   && /mask-composite:exclude; padding:2\.5px;\n\s*animation:tcardComet 1\.8s linear infinite;\}/.test(src)
   && /radial-gradient\(circle 5px at 50% 0,[\s\S]{0,160}?animation:tcardComet 1\.8s linear infinite;\}/.test(src)
   && /@keyframes tcardComet\{ from\{transform:rotate\(0deg\);\} to\{transform:rotate\(360deg\);\} \}/.test(src));
ok('　　只有 CSS，沒有多讀資料（沒有新的 dbGetAll）',
   !/tcard-live[\s\S]{0,200}dbGetAll/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
