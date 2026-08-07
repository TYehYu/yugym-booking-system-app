/* 2026-08-07 使用者指示：「調整課卡時間的視窗 內容要清楚一點 前後的時間用顏色標明」

   原本的確認框只有兩塊：灰色的「原時間」與金色的「新時間」，各一行日期時間。
   拖錯卡片看不出來（沒寫是誰的課），差多久也要自己比對兩行數字。
   改成：① 標題下一行寫清楚是誰的哪一堂 ② 原時間紅（要空出的）、新時間綠（改成的）
   ③ 中間金色一行講差異 —— 品牌色強度 紅>金>綠。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const timeToMin=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?(+m[1])*60+(+m[2]):0;};

console.log('① 差在哪：一句話講白');
{
  const diff=new Function('parseYmd','timeToMin', grabFn('calMoveDiff')+'\nreturn calMoveDiff;')(parseYmd,timeToMin);
  eq('★ 同一天、晚半小時', diff('2026-08-08','11:00','2026-08-08','11:30'), '延後 30 分');
  eq('★ 同一天、早一小時', diff('2026-08-08','11:00','2026-08-08','10:00'), '提前 1 小時');
  eq('★ 整整往後一週（連續預約最常見）', diff('2026-08-08','11:00','2026-08-15','11:00'), '往後 1 週');
  eq('★ 往後兩天又晚 90 分', diff('2026-08-08','11:00','2026-08-10','12:30'), '往後 2 天、延後 1 小時 30 分');
  eq('　　往前一週', diff('2026-08-15','11:00','2026-08-08','11:00'), '往前 1 週');
  eq('　　完全沒動（理論上不會走到這）', diff('2026-08-08','11:00','2026-08-08','11:00'), '時間不變');
}

console.log('\n② 這是誰的哪一堂課');
{
  const env={
    /* dbPeek 內部走 tbl() 別名，coaches → employees（TABLE_ALIAS）；替身直接兩個鍵都收 */
    dbPeek:t=>({members:{data:[{id:'M1',name:'林紫錡'}]},
                coaches:{data:[{id:'C1',name:'曾邦宏'}]},
                employees:{data:[{id:'C1',name:'曾邦宏'}]}})[t]||null,
    bkIsGroup:b=>b.category==='小班肌力',
    mids:b=>Array.isArray(b.member_ids)?b.member_ids:[],
    bkCoachId:b=>b.coach_id,
    coachDisp:c=>c.name,
  };
  const who=new Function(...Object.keys(env), grabFn('calMoveWho')+'\nreturn calMoveWho;')(...Object.values(env));
  eq('★ 私教：課別・會員・教練', who({category:'私人教練',member_id:'M1',coach_id:'C1'}),
     '私人教練　·　林紫錡　·　曾邦宏教練');
  eq('★ 團課：改講人數（一堂多人，寫名字擠不下）',
     who({category:'小班肌力',member_ids:['M1','M2','M3'],coach_id:'C1'}), '小班肌力　·　3 人　·　曾邦宏教練');
  eq('　　體驗課沒有會員 id → 用留的姓名',
     who({category:'體驗課',trial_name:'王小明',coach_id:'C1'}), '體驗課　·　王小明　·　曾邦宏教練');
  eq('　　名字查不到就只寫課別（不擋確認框）', who({category:'自主訓練',member_id:'M9'}), '自主訓練');
  eq('　　沒有課卡時回空字串', who(null), '');
  ok('★ 用 dbPeek（同步讀快取）—— 不為了一行字讓確認框變成非同步',
     /const _mem=\(dbPeek\('members'\)\|\|\{\}\)\.data\|\|\[\];/.test(src));
}

console.log('\n③ 前後用顏色標明（紅 > 金 > 綠）');
{
  const box=grabFn('confirmCalMove');
  ok('★ 原時間＝紅（這個時段要空出來）',
     /原時間（將空出）/.test(box) && /color:var\(--danger,#b5372e\);font-size:11px;font-weight:700/.test(box));
  ok('★ 原時間加刪除線（一眼看出是舊的）', /text-decoration:line-through/.test(box));
  ok('★ 新時間＝綠（改成的正式時間）、字放大加粗',
     /新時間（改成這個）/.test(box) && /border:1\.5px solid var\(--green\)/.test(box)
     && /font-size:15px;font-weight:800/.test(box));
  ok('★ 中間的差異說明＝金（次要提示）', /color:var\(--gold-d\);font-size:12px;font-weight:700/.test(box)
     && /calMoveDiff\(od,ot,nd,nt\)/.test(box));
  ok('★ 標題下一行寫清楚是誰的課', /\$\{who\?`<div style="font-size:12\.5px;color:var\(--t2\)/.test(box));
  ok('　　日期時間用等寬數字（兩行對得齊）', (box.match(/font-family:var\(--num\)/g)||[]).length>=2);
  ok('　　場地被擠到次選的提示仍在（原本就有）', /\$\{venueMoveNote\(b\)\}/.test(box));
  ok('　　按鈕講清楚在確認什麼', /確認修改<\/button>/.test(box));
  ok('　　品牌色強度的理由寫在程式裡', /品牌色強度 紅>金>綠/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
