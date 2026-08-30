/* 展延過的票要把時間軸攤在課卡上（2026-08-30 使用者指示）

   「幫我把有展延過的課程在課卡上顯示出來 起始日-到期日-展延日」

   兩種展延都只改 expire_date，卡片上看得到的只有「現在幾號到期」——
   看不出來延過，更看不出原本幾號到期。
   ⚠ 教練請假那條**刻意不寫** extended_from：那個欄位同時代表「已展延，不得退費」
     （合約〔展延規則〕），而教練請假是店家的補償，不該讓會員因此失去退費權。
     所以判斷「延過沒」不能看欄位，要看帳本。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const api=new Function('escH', grab('tkExtInfo')+'\n'+grab('tkExtLineHTML')
  +'\nreturn {tkExtInfo,tkExtLineHTML};')(x=>String(x==null?'':x));
const {tkExtInfo,tkExtLineHTML}=api;

console.log('① 從帳本反推（兩種展延都只留 note，欄位靠不住）');
{
  const T={id:'T1',start_date:'2026-08-01',expire_date:'2026-10-04'};
  /* 教練請假那條的實際格式（extendForCoachLeave 寫的，日期是斜線） */
  const clv=[{ticket_id:'T1',action:'adjust',delta:0,created_at:'2026-08-24T10:00:00Z',
    note:'2026-08-24 教練請假展延 7 天（2026/09/27 → 2026/10/04）'}];
  const e=tkExtInfo(T,clv);
  eq('★★★ 教練請假展延解析得出來', [e.n,e.from,e.to,e.at,e.why],
     [1,'2026-09-27','2026-10-04','2026-08-24','教練請假']);
  /* 櫃檯手動展延那條（tkExtend 寫的，日期是連字號） */
  const man=[{ticket_id:'T1',action:'adjust',delta:0,created_at:'2026-09-01T02:00:00Z',
    note:'展延一次：2026-10-04 → 2026-11-01（28 天，同原方案期限）；依合約展延之課程不得申請退費'}];
  const e2=tkExtInfo(T,man);
  eq('★★★ 櫃檯手動展延也解析得出來', [e2.n,e2.from,e2.to,e2.why],
     [1,'2026-10-04','2026-11-01','櫃檯展延']);
  /* 兩次都有：起點取第一次的、終點取最後一次的 */
  const both=tkExtInfo(T, clv.concat(man));
  eq('★★★ 延過兩次 → 起點取第一次、終點取最後一次', [both.n,both.from,both.to],
     [2,'2026-09-27','2026-11-01']);
  eq('★★ 順序打散也一樣（帳本不保證按時間回傳）',
     (x=>[x.n,x.from,x.to])(tkExtInfo(T, man.concat(clv))), [2,'2026-09-27','2026-11-01']);
}

console.log('\n② 沒展延過的票一個字都不變');
{
  const T={id:'T2',start_date:'2026-08-01',expire_date:'2026-10-04'};
  eq('★★★ 沒有展延紀錄 → 回 null', tkExtInfo(T,[]), null);
  eq('★★★ 卡片上不多印任何東西', tkExtLineHTML(T,[]), '');
  eq('　 別張票的展延紀錄不算', tkExtInfo(T,[{ticket_id:'X',note:'教練請假展延 7 天（2026/01/01 → 2026/01/08）'}]), null);
  eq('　 不含「展延」兩個字的 adjust 不算',
     tkExtInfo(T,[{ticket_id:'T2',action:'adjust',note:'⚠ 已阻擋：這一堂在這張票上已經扣過 1 堂'}]), null);
}

console.log('\n③ 卡片那一行：起始日 → 原到期日 → 展延至（使用者指定的三個日期）');
{
  const T={id:'T1',start_date:'2026-08-01',expire_date:'2026-10-04'};
  const h=tkExtLineHTML(T,[{ticket_id:'T1',action:'adjust',created_at:'2026-08-24T10:00:00Z',
    note:'2026-08-24 教練請假展延 7 天（2026/09/27 → 2026/10/04）'}]);
  ok('★★ 三個日期都在，而且照順序', /起始 2026\/08\/01[\s\S]*原到期 2026\/09\/27[\s\S]*展延至 2026\/10\/04/.test(h), h);
  ok('★★ 標出是哪一天延的、為什麼延', h.indexOf('2026/08/24・教練請假')>=0, h);
  ok('★ 延過兩次要標次數',
     tkExtLineHTML(T,[{ticket_id:'T1',created_at:'1',note:'展延（2026-09-01 → 2026-09-08）'},
                      {ticket_id:'T1',created_at:'2',note:'展延（2026-09-08 → 2026-09-15）'}]).indexOf('×2')>=0);
  ok('★ 沒有起始日就寫「—」，不要印 undefined',
     tkExtLineHTML({id:'T1',expire_date:'2026-10-04'},
       [{ticket_id:'T1',created_at:'1',note:'展延（2026-09-27 → 2026-10-04）'}]).indexOf('起始 —')>=0);
}

console.log('\n④ 接線與語彙');
{
  ok('★★ 掛在票券卡的 meta 那一行底下（會員資料 → 票券）',
     /\$\{tkExtLineHTML\(t, tkLogs\)\}/.test(src));
  /* 2026-08-30 使用者：「這種方案期限的內容 會員那邊也要能看到」 */
  ok('★★★ 會員端兩種票券卡（V2 與傳統）也都看得到',
     (src.match(/\$\{tkExtLineHTML\(t, logs\)\}/g)||[]).length===2
     && /效期被改過是會員最該知道的事/.test(src));
  /* 2026-08-30 使用者：「方案下方新增"教練展延"跟"展延\(不退費\)"」 */
  ok('★★★ 兩種展延各一枚標籤，而且是「兩枚」不是二選一（一張票可能兩種都有）',
     /const chips=\(e\.nClv\?`<b class="tkx tkx-clv">教練展延/.test(src)
     && /\+\(e\.nMan\?`<b class="tkx tkx-man">展延（不退費）/.test(src)
     && /一張票兩種都可能有（先被教練請假延過，之後櫃檯又展延一次），所以是兩枚不是二選一。/.test(src));
  {
    const two=tkExtLineHTML({id:'T1',start_date:'2026-08-01'},
      [{ticket_id:'T1',created_at:'1',note:'2026-08-24 教練請假展延 7 天（2026/08/30 → 2026/09/06）'},
       {ticket_id:'T1',created_at:'2',note:'展延一次：2026-09-06 → 2026-11-01（56 天）'}]);
    ok('★★★ 兩種都有時兩枚都出現', two.indexOf('教練展延')>=0 && two.indexOf('展延（不退費）')>=0, two);
    const only=tkExtLineHTML({id:'T1',start_date:'2026-08-01'},
      [{ticket_id:'T1',created_at:'1',note:'2026-08-24 教練請假展延 7 天（2026/08/30 → 2026/09/06）'}]);
    ok('★★ 只有教練展延時不會出現「不退費」那一枚', only.indexOf('展延（不退費）')<0, only);
    ok('★ 同一種延兩次要標次數',
       tkExtLineHTML({id:'T1'},[{ticket_id:'T1',created_at:'1',note:'2026-08-01 教練請假展延（a → b）'},
                                {ticket_id:'T1',created_at:'2',note:'2026-08-08 教練請假展延（c → d）'}])
         .indexOf('教練展延 ×2')>=0);
  }
  ok('★★★ 教練請假不寫 extended_from（那是「不得退費」的旗標）—— 理由寫在原地',
     /教練請假那條\*\*刻意不寫\*\* extended_from —— 那個欄位同時代表「已展延，不得退費」/.test(src)
     && !/extended_from/.test(grab('extendForCoachLeave')));
  ok('★ 櫃檯展延用金色（可以做但要知道），教練請假用綠（一般提示）',
     /\.md-tk-ext-to\{font-weight:800;color:var\(--gold-d,#9a7344\);\}/.test(src)
     && /\.md-tk-ext-clv>b\{color:var\(--green,#1F6F54\);background:var\(--sage-bg,#E4EAD9\);\}/.test(src));
  /* 2026-08-30 使用者定案：「如果是因為教練請假的展延 是可以退費的
     因為是教練的問題不應該影響會員權益」 */
  ok('★★★ 教練請假展延要寫明「不影響退費」，櫃檯展延才寫「依合約不得退費」',
     tkExtLineHTML({id:'T1',start_date:'2026-08-01'},
       [{ticket_id:'T1',created_at:'1',note:'2026-08-24 教練請假展延 7 天（2026/08/30 → 2026/09/06）'}])
         .indexOf('店家補償，<b>不影響退費</b>')>=0
     && tkExtLineHTML({id:'T1',start_date:'2026-08-01'},
       [{ticket_id:'T1',created_at:'1',note:'展延一次：2026-10-04 → 2026-11-01（28 天）'}])
         .indexOf('依合約不得退費')>=0);
  ok('★★★ 而且程式本來就沒把教練請假算成「已展延」（tkIsExtended 只看 extended_from）',
     /function tkIsExtended\(t\)\{ return !!\(t && t\.extended_from\); \}/.test(src)
     && !/extended_from/.test(grab('extendForCoachLeave')));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
