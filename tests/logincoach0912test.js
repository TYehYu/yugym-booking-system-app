/* 2026-09-12 兩件事：
   ① 曾邦宏「登不進去」—— 首頁那張表單是會員專用（{手機}@member...），而正式庫 197 個會員帳號
      全部是 LINE 帳號，員工在那裡輸入自己的手機密碼永遠失敗。改成：會員這條走不通時自動改試員工帳號。
   ② 9/18 團課「先改成 BARRY 再改成石頭　應該就不會出現代課」—— 代課選單永遠濾掉主責教練本人，
      所以畫面上做不到「換主責」。新增「更換主責教練」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 會員表單登入失敗 → 自動改試員工帳號');
const DL=fnBody('doLogin');
ok('★★★ 會員這條失敗後先試員工，成功就直接進去', /if\(await staffSignIn\(acct, pw, err, \{quiet:true\}\)\) return;/.test(DL));
ok('★★★ 兩條都不行才報錯，而且告訴他有「員工登入」', /員工請改用下方的「員工登入」/.test(DL));
ok('★★ 成因寫在原地（197 個會員帳號全是 LINE 帳號）', /正式庫 197 個會員帳號\*\*全部是 LINE 帳號\*\*/.test(DL));
const SS=fnBody('staffSignIn');
ok('★★★ 員工表單也走同一支（不是抄兩份）', /if\(!\(await staffSignIn\(acct, pw, err\)\)\) \{ err\.textContent='帳號或密碼錯誤'/.test(fnBody('doLoginStaff'))
   && /await sb\.auth\.signInWithPassword\(\{email:toEmail\('staff',acct\),password:pw\}\)/.test(SS));
ok('★★★ 帳密不對回 false（由呼叫端講），其餘都自己講完回 true',
   /if\(error\) return false;/.test(SS) && /查無員工資料/.test(SS) && /帳號尚未啟用，請聯繫管理員/.test(SS));
ok('★★★ 被擋下來一定要 signOut（不然留著看不到資料的半殘登入）',
   (SS.match(/await sb\.auth\.signOut\(\);/g)||[]).length>=2);
ok('★★ 停用／查無員工不受 quiet 影響（那是真的找到人了）',
   SS.indexOf('查無員工資料') < SS.indexOf('void _quiet'));

console.log('\n② 更換主責教練');
ok('★★★ 代課面板多一個入口，副標講清楚跟代課的差別',
   /bkOrbitOwnerAsk\('\$\{id\}'\)">更換主責教練<i>這堂以後就是他的課，不是代課<\/i>/.test(src));
const ASK=fnBody('bkOrbitOwnerAsk'), SET=fnBody('_bkOrbitOwnerSet');
/* 用語照 0912 定案：畫面上講「主管」，不講「店長」（見 emptabstest） */
ok('★★★ 權限同代課（櫃檯／主管以上），而且兩支都擋',
   /if\(!bkCanSub\(\)\)\{ showToast\('只有櫃檯與主管以上可以更換主責教練'\); return; \}/.test(ASK)
   && /if\(!bkCanSub\(\)\)\{ showToast\('只有櫃檯與主管以上可以更換主責教練'\); return; \}/.test(SET));
ok('★★ 確認視窗把三個後果列出來', /這堂的業績、堂數與薪資改算在新的主責教練身上/.test(ASK)
   && /原本的代課標記會一起清掉/.test(ASK) && /名單與票券不動/.test(ASK));
ok('★ 清單不列目前的主責（換成自己沒有意義）', /c\.id!==b\.coach_id/.test(ASK));
{
  const run=(bk, all, session)=>{
    let toast='', put=null, painted=0;
    /* fnBody 是從 function 那個字切的，async 掉在前面 —— 要自己補回去（裡面有 await） */
    const env=new Function('dbGet','dbGetAll','dbPut','showToast','closeModal','navTo','bkCanSub','timeToMin','CUR_PAGE','onceAct',
      'async '+fnBody('_bkOrbitOwnerSet')+'\nreturn _bkOrbitOwnerSet;')(
      async()=>bk, async()=>all, async(t,o)=>{put=JSON.parse(JSON.stringify(o));}, t=>{toast=t;}, ()=>{}, ()=>{painted++;},
      ()=>session!=='coach', s=>Number(String(s).split(':')[0])*60+Number(String(s).split(':')[1]), 'calendar', (k,f)=>f());
    return env(bk.id,'C-NEW').then(()=>({toast,put,painted}));
  };
  const base={id:'B1',date:'2026-09-18',start_time:'20:00',duration:60,coach_id:'C-OLD',substitute_coach_id:'C-SUB'};
  return run(base,[base],'admin').then(async r=>{
    eq('★★★ 換主責＝寫 coach_id 並清掉代課', [r.put.coach_id, r.put.substitute_coach_id], ['C-NEW', null]);
    eq('★★ 換完重畫畫面', r.painted, 1);
    const busy={id:'B2',date:'2026-09-18',start_time:'20:30',duration:60,coach_id:'C-NEW'};
    const r2=await run(base,[base,busy],'admin');
    eq('★★★ 新教練同時段已有課 → 擋下來、不寫入', [r2.put, r2.toast], [null,'該教練此時段已有課程']);
    const r3=await run(base,[base],'coach');
    eq('★★★ 教練自己按不動（權限同代課）', [r3.put, r3.toast], [null,'只有櫃檯與主管以上可以更換主責教練']);
    console.log('\n'+pass+' 通過 / '+fail+' 失敗');
    process.exit(fail?1:0);
  });
}
