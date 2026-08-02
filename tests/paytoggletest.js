/* 2026-08-02 使用者回報與指示：
   「員工余東翰的底薪是 35000，為什麼 8 月薪資是 0」→ 查出 count_salary=false，
   「把開關給我，放在員工列表，我自己開」

   count_salary 原本只在員工明細的人資設定裡（一個藏在表單中段的勾選框）。
   關掉的效果卻很大：computeMonthlyPayroll 與員工列表的實領欄都直接記 0，
   而列表上的 $0 跟「這個月真的沒領到錢」長得一模一樣，看不出是設定造成的。
   → 拉到列表右邊那排開關，跟其他權限一起，關著的時候亮金燈。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i, src.indexOf('\n];', i)+3);};

console.log('① 開關出現在員工列表那一排');
{
  const code=grabConst('ST_SWITCHES')+'\n'+grabFn('ppEmpSwitchOn')+'\n'+grabFn('stSwitchRow');
  const run=(c, role)=>new Function('SESSION', code+'\nreturn stSwitchRow;')({id:'ME',role})(c);
  const labels=h=>[...h.matchAll(/<span class="st-swd"><\/span>([^<]+)</g)].map(m=>m[1]);

  const admin=run({id:'E1',name:'余東翰',count_salary:false}, 'admin');
  ok('★ 管理員看得到「計薪」開關', labels(admin).indexOf('計薪')>=0, labels(admin));
  eq('★ 順序：夾在「開課」與「停用」之間（權限在前、狀態在後）',
     labels(admin), ['管理員','店長','主管','打卡','開課','計薪','停用']);
  ok('★ 點下去切換的是計薪這一項', /onclick="stCardToggle\('E1','pay'\)"/.test(admin));

  const desk=run({id:'E1',count_salary:false}, 'front_desk');
  eq('★ 櫃台／教練看不到這個開關（金額本來就只有管理員看得到）',
     labels(desk), ['管理員','店長','主管','打卡','開課','停用']);
  ok('　　也不會留下可點的痕跡', desk.indexOf("'pay'")<0);
}

console.log('\n② 關著的時候看得出來');
{
  const code=grabConst('ST_SWITCHES')+'\n'+grabFn('ppEmpSwitchOn')+'\n'+grabFn('stSwitchRow');
  const run=(c)=>new Function('SESSION', code+'\nreturn stSwitchRow;')({id:'ME',role:'admin'})(c);
  const whole=h=>{ const i=h.indexOf("stCardToggle('E1','pay')"); return h.slice(h.lastIndexOf('<button',i), i); };
  const cls=h=>(whole(h).match(/class="([^"]*)"/)||['',''])[1].split(/\s+/);

  const off=whole(run({id:'E1',count_salary:false}));
  ok('★ 不計薪 → 金燈（實領被記成 0，要看得出來是設定造成的）', /st-swb-note/.test(off), off);
  eq('　　不是亮綠燈（綠＝開啟，會看成正常）',
     cls(run({id:'E1',count_salary:false})), ['st-swb','st-swb-note']);
  ok('★ 滑過去講清楚後果', /不計薪的員工，實領一律顯示 0/.test(run({id:'E1',count_salary:false})));

  const on=whole(run({id:'E1',count_salary:true}));
  eq('★ 有計薪 → 一般的綠燈，不加提示', cls(run({id:'E1',count_salary:true})), ['st-swb','on']);
  eq('★ 沒設過這個欄位 → 當成有計薪（跟薪資計算同一個預設）',
     cls(run({id:'E1'})), ['st-swb','on']);
  ok('　　跟薪資計算的預設寫法一致（!==false）',
     /if\(key==='pay'\)\s+return r\.count_salary!==false;/.test(src)
     && /const countSalary=emp\.count_salary!==false;/.test(src));
  ok('　　金燈樣式存在（品牌強度：這是提醒不是錯誤，所以用金不用紅）',
     /\.st-swb\.st-swb-note\{background:#fbf5ea;border-color:var\(--gold-d,#b48a56\);color:var\(--gold-d,#b48a56\);\}/.test(src));
  ok('　　為什麼用金不用紅，寫在程式裡',
     /新進員工建檔時先關著是正常流程，是提醒不是錯誤。/.test(src));
}

console.log('\n③ 實跑：切換會寫進資料');
{
  const body='async '+grabFn('stCardToggle');
  const code=grabConst('ST_SWITCHES')+'\n'+grabFn('ppEmpSwitchOn')+'\n'+body;
  const run=async(rec,key)=>{
    const put=[], toasts=[];
    const env={ dbGet:async()=>JSON.parse(JSON.stringify(rec)),
      dbPut:async(_t,o)=>{put.push(JSON.parse(JSON.stringify(o)));},
      showToast:t=>toasts.push(t), stReload:()=>{} };
    const f=new Function(...Object.keys(env), code+'\nreturn stCardToggle;')(...Object.values(env));
    await f('E1',key);
    return {rec:put[0], toasts:toasts.join('')};
  };
  (async()=>{
    let r=await run({id:'E1',name:'余東翰',count_salary:false},'pay');
    eq('★ 關著 → 點一下打開（余東翰那筆就是這樣修）', r.rec.count_salary, true);
    ok('　　吐司說得清楚', /余東翰　已納入薪資計算/.test(r.toasts), r.toasts);

    r=await run({id:'E1',name:'余東翰',count_salary:true},'pay');
    eq('★ 開著 → 點一下關掉', r.rec.count_salary, false);
    ok('★ 關掉時把後果講出來（不是只回一句「已關閉」）',
       /已排除薪資計算（實領會顯示 0）/.test(r.toasts), r.toasts);

    r=await run({id:'E1',name:'余東翰'},'pay');
    eq('　　沒設過 → 視為開著，點一下變成關（不會反過來）', r.rec.count_salary, false);

    r=await run({id:'E1',name:'余東翰',count_salary:false,need_punch:false},'punch');
    eq('★ 切別的開關不會順手動到計薪', [r.rec.need_punch, r.rec.count_salary], [true,false]);

    console.log('\n④ 這個開關真的會影響金額（不是只改顯示）');
    ok('★ 月結：不計薪的應發記 0', /const total=countSalary\?sal\.grossPay:0;/.test(src));
    ok('★ 員工列表的實領欄：不計薪的記 0',
       /if\(id && _stat\[id\]\) _stat\[id\]\.net = r\.countSalary \? \(Number\(r\.sal\.netPay\)\|\|0\) : 0;/.test(src));
    ok('　　員工明細裡原本那個勾選框留著（兩邊改的是同一個欄位）',
       /<input type="checkbox" id="hr-countsalary"/.test(src) && /c\.count_salary=ck\('hr-countsalary'\);/.test(src));
    ok('　　為什麼要拉到列表上，寫在程式裡',
       /\$0 跟「這個月真的沒領」\n\s*長得一模一樣/.test(src));

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
