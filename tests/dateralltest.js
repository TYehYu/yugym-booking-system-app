/* 2026-08-06 使用者回報：「會員施佳靜，我電腦這邊看得到她 8/6 有預約，
   但她手機端首頁卻沒看到今日預約的圓形卡，導致她不能自己簽到。」

   查證：資料與權限都沒問題 —— 以她的 JWT 實測，那筆 8/6 19:00 的預約看得到，
   狀態是 booked，時間也還沒過。問題出在**前端的「今天」是死的**：
   TODAY 是頁面載入當下算好的 const，手機把 App／PWA 開著過夜（很常見），
   隔天整個系統仍以為是昨天 → 今天的課不會被標成今天，
   而預約明細的自簽按鈕條件是 b.date===ymd(TODAY)，於是按鈕根本不出現。

   兩道修補：
   ① TODAY 改成會跨日更新（每分鐘＋回到前景時檢查）
   ② 會員首頁「今天的課」整天都留著，不再因為結束時間過了就消失 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① TODAY 會跨日更新（實跑 dateRollCheck）');
{
  const mk=(now, opts)=>{
    const o=Object.assign({modal:false, page:'mem_bookings'}, opts||{});
    const nav=[];
    const env={
      Date:class extends Date{ constructor(...a){ if(!a.length) super(now); else super(...a); } },
      navTo:(p,g)=>nav.push([p,g]),
      CUR_PAGE:o.page, CUR_GROUP:'g_dashboard',
      document:{getElementById:id=>(id==='modal-bg'&&o.modal)?{}:null},
      setInterval:()=>{},
    };
    const fn=new Function(...Object.keys(env),
      'let TODAY=new Date(2026,7,5);\n'+grabFn('dateRollCheck')
      +'\nreturn {run:dateRollCheck, get:()=>TODAY};')(...Object.values(env));
    return {fn,nav};
  };
  {
    const {fn,nav}=mk(new Date(2026,7,5,23,50));
    eq('★ 還是同一天 → 不動（也不重畫）', [fn.run(), nav.length], [false,0]);
  }
  {
    const {fn,nav}=mk(new Date(2026,7,6,0,3));
    eq('★ 過了午夜 → TODAY 換成新的一天', [fn.run(), fn.get().getDate()], [true,6]);
    eq('★ 並且重畫目前這一頁（今天的課才會標成今天）', nav, [['mem_bookings','g_dashboard']]);
  }
  {
    const {fn,nav}=mk(new Date(2026,7,6,0,3), {modal:true});
    eq('★ 有彈窗開著（可能正在編輯）→ 只更新日期，不打斷畫面',
       [fn.run(), fn.get().getDate(), nav.length], [true,6,0]);
  }
}

console.log('\n② 接線');
ok('★ TODAY 改成可更新（let，不再是死的 const）',
   /^let TODAY=\(function\(\)\{const n=new Date\(\);/m.test(src)
   && !/^const TODAY=/m.test(src));
ok('★ 每分鐘檢查一次，回到前景也立刻檢查',
   /setInterval\(dateRollCheck, 60000\);/.test(src)
   && /document\.addEventListener\('visibilitychange',\(\)=>\{ if\(!document\.hidden\) dateRollCheck\(\); \}\)/.test(src));
ok('　　成因寫在程式裡（下次有人看到這段就知道為什麼）',
   /手機把 App／PWA 開著過夜（很常見）/.test(src)
   && /預約明細的自簽按鈕條件是 b\.date===ymd\(TODAY\)/.test(src));

console.log('\n③ 會員首頁：今天的課整天都在');
{
  const _mToday='2026-08-06';
  const _nowMin3=21*60;                         // 晚上 9 點：19:00 那堂早就「結束」了
  const timeToMin=t=>{const[h,m]=String(t).split(':').map(Number);return h*60+(m||0);};
  const _notPast=b=>(b.date>_mToday || (b.date===_mToday && timeToMin(b.start_time||'0:0')+(Number(b.duration)||60)>_nowMin3));
  const mine=[
    {id:'today19',date:'2026-08-06',start_time:'19:00',duration:60,status:'booked'},
    {id:'today10',date:'2026-08-06',start_time:'10:00',duration:60,status:'checked_in'},
    {id:'next',date:'2026-08-13',start_time:'19:00',duration:60,status:'booked'},
    {id:'past',date:'2026-08-01',start_time:'19:00',duration:60,status:'booked'},
  ];
  const dotList=mine.filter(b=>
    (b.status==='booked' && (b.date===_mToday || _notPast(b))) ||
    (b.status==='checked_in' && b.date===_mToday));
  eq('★ 今天 19:00 那堂晚上 9 點仍在（遲到／漏簽的人還點得到簽到）',
     dotList.map(b=>b.id), ['today19','today10','next']);
  ok('　　昨天以前沒簽到的不列（不然會愈積愈多）', !dotList.some(b=>b.id==='past'));
  ok('★ 程式碼就是這個判定', /\(b\.status==='booked' && \(b\.date===_mToday \|\| _notPast\(b\)\)\) \|\|\n\s*\(b\.status==='checked_in' && b\.date===_mToday\)\);/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
