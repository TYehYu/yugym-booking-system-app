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

console.log('\n③ 改期確認：實際產生畫面與確認行為');
(async()=>{
  let html='',writes=0,series=0,back=0;
  const win={};
  const env={window:win,showModal:h=>{html=h;},calMoveWho:()=>'<示範會員> · 教練',
    escH:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    fmtRange:new Function('parseYmd','timeToMin','minToTime','WD',grabFn('fmtRange')+'\nreturn fmtRange;')(parseYmd,timeToMin,n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),['日','一','二','三','四','五','六']),
    calMoveDiff:()=> '往後 1 天、延後 1 小時',venueMoveNote:()=>'<aside>場地變更：教室</aside>',
    bizOffHoursNote:()=>'',bkOffHoursAsk:()=>'',bkOfferSeriesMove:async()=>{series++;},navTo:()=>{back++;},CUR_PAGE:'calendar'};
  const render=new Function(...Object.keys(env),grabFn('calMoveRangeHtml')+'\n'+grabFn('confirmCalMove')+'\nreturn confirmCalMove;')(...Object.values(env));
  render({id:'B'},'2026-11-24','19:00',60,'2026-11-25','20:00',90,async()=>{writes++;});
  ok('會員姓名保留且安全顯示',html.includes('&lt;示範會員&gt; · 教練'));
  ok('原日期與完整時段仍在',html.includes('2026-11-24（二）')&&html.includes('19:00–20:00'));
  ok('新日期與九十分鐘結束時間正確',html.includes('2026-11-25（三）')&&html.includes('20:00–21:30'));
  ok('原時段、新時段有明確文字，不只靠顏色',html.includes('原時間（將空出）')&&html.includes('新時間（改成這個）'));
  ok('原時段紅色與刪除線',src.includes('.cm-old .cm-label{color:var(--danger')&&src.includes('.cm-old .cm-time{text-decoration:line-through'));
  ok('新時段綠色、時間放大',src.includes('.cm-new .cm-label,.cm-new .cm-time{color:var(--green);}')&&src.includes('font-size:29px;font-weight:800'));
  ok('保留移動差異與場地變更提醒',html.includes('往後 1 天、延後 1 小時')&&html.includes('場地變更：教室'));
  ok('操作按鈕明確',html.includes('>返回</button>')&&html.includes('>確認改期</button>'));
  ok('開窗尚未寫入或處理整串',writes===0&&series===0);
  win._calNo();ok('返回不寫入',back===1&&writes===0&&series===0);
  await win._calYes();ok('確認先套用這堂再詢問後續',writes===1&&series===1);
  env.bizOffHoursNote=()=> '超出營業時間';env.bkOffHoursAsk=()=> '請填寫原因';
  const warned=new Function(...Object.keys(env),grabFn('calMoveRangeHtml')+'\n'+grabFn('confirmCalMove')+'\nreturn confirmCalMove;')(...Object.values(env));
  warned({},'2026-11-24','19:00',60,'2026-11-25','23:00',60,()=>{});
  ok('營業時間外提醒與原因要求仍在',html.includes('超出營業時間')&&html.includes('請填寫原因'));
  console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
