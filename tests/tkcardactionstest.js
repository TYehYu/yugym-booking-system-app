/* 票券卡右下角的動作列定版（2026-08-30 使用者指示）

   「展延的按鈕觸發的條件是該課程尚未用完 但已經到期限的方案 但這功能會不會觸發的太慢?
     還是其實可以直接顯示在右下方 [校正][展延][作廢] 校正只有管理員會出現
     然後把[共享]·共享人改到右上角 剩餘課堂左邊」

   ⚠ 「觸發太慢」是真的：展延鈕原本只長在「已過期方案」那一區，票還沒過期時
     櫃檯根本不知道有這個功能。改成常駐右下角，不能按時淡化並寫原因（0823 語彙）。
   ⚠ 條件一條都沒放寬 —— 只是把「看不到」換成「看得到但按不下去，而且知道為什麼」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 展延：常駐，不能按時寫原因');
{
  const why=new Function('tkPocketNow','ymd','TODAY','tkIsExtended','tkExtendTo',
    grab('tkExtWhyNot')+'\nreturn tkExtWhyNot;')(
    ()=>({canExtend:true}), d=>'2026-08-30', null,
    t=>!!(t&&t.extended_from), t=>t&&t.expire_date?'2026-12-01':null);
  const base={status:'usable',sessions_remaining:3,expire_date:'2026-08-01'};
  eq('★★★ 已過期＋還有堂數 → 可以按（回空字串）', why(base,'2026-08-30'), '');
  ok('★★★ 還沒到期 → 擋，而且講得出哪一天到期',
     /還沒到期（2026\/12\/31），到期後才能展延/.test(why({...base,expire_date:'2026-12-31'},'2026-08-30')));
  eq('★★ 堂數用完 → 沒有東西可以延',
     why({...base,sessions_remaining:0},'2026-08-30'), '堂數已經用完了，沒有東西可以延');
  eq('★★ 已經延過（一次為限）',
     why({...base,extended_from:'2026-07-01'},'2026-08-30'), '已經展延過了（一次為限）');
  eq('★★ 沒有到期日的票不會過期，也就不需要延',
     why({...base,expire_date:null},'2026-08-30'), '這張票沒有到期日，不會過期');
  eq('★★ 已作廢／已退費不能延',
     why({...base,status:'refunded'},'2026-08-30'), '已作廢／已退費的票不能展延');
  const why2=new Function('tkPocketNow','ymd','TODAY','tkIsExtended','tkExtendTo',
    grab('tkExtWhyNot')+'\nreturn tkExtWhyNot;')(
    ()=>({canExtend:false}), d=>'2026-08-30', null, ()=>false, ()=>'x');
  eq('★★ 自主訓練點數本來就不給展延（規則寫在口袋）',
     why2({status:'usable',sessions_remaining:3,expire_date:'2026-08-01'},'2026-08-30'), '這種票券不提供展延');
}

console.log('\n② 三顆按鈕的順序與權限');
{
  ok('★★★ 校正只有管理員（不是 isDeskLike —— 那是改帳的入口）',
     /\$\{\(SESSION&&SESSION\.role==='admin'\)\?`<button[^`]*onclick="tkTidyOpen\('\$\{t\.id\}'\)">校正<\/button>`:''\}/.test(src));
  ok('★★★ 展延常駐、不能按時淡化並把原因寫進 title',
     /const _w=tkExtWhyNot\(t,ymd\(TODAY\)\);/.test(src)
     && /opacity:\.45;cursor:not-allowed;" disabled title="\$\{escH\(_w\)\}">展延<\/button>/.test(src)
     && /onclick="openTicketExtend\('\$\{t\.id\}'\)">展延<\/button>/.test(src));
  ok('★★ 順序是 校正 → 展延 → 作廢',
     src.indexOf(`onclick="tkTidyOpen('\${t.id}')">校正`) < src.indexOf(`onclick="openTicketExtend('\${t.id}')">展延`)
     && src.indexOf(`onclick="openTicketExtend('\${t.id}')">展延`) < src.indexOf(`onclick="voidTicketAsk('\${t.id}')">作廢`));
  ok('　 原因寫在原地（下一個人不要又把它藏回「已過期」那一區）',
     /展延鈕原本只在票券「已經過期」之後才長出來|按鈕只在票券「已經過期」之後才長出來/.test(src));
}

console.log('\n③ 共享搬到右上角、剩餘堂數左邊');
{
  /* 比對的是「同一張卡裡」的先後，不是全檔第一個 prog（別張卡也有 prog）。 */
  ok('★★★ 共享標與「設為共享」都在 head 那一列、剩餘堂數之前',
     /<span class="bkd-tkcard-share">\$\{shrTag\|\|''\}[\s\S]{0,260}?<span class="bkd-tkcard-prog"><b class="num">\$\{used\}<\/b> \/ \$\{total\}<\/span><\/div>/.test(src));
  ok('★★ 名稱列不再重複掛共享標（同一件事不講兩次）',
     !/\$\{_m2\?stTag:''\}\$\{shrTag\}/.test(src));
  ok('★★ 動作列裡的「設為共享」已移走',
     !/\$\{\(_canShare&&!_shN\)\?`<button class="btn btn-ghost btn-sm" style="padding:2px 10px;font-size:11px;" onclick="ppShareTk/.test(src));
  ok('★ 沒有共享時整格不佔位', /\.bkd-tkcard-share:empty\{display:none;\}/.test(src));
  ok('★ 點共享不會連帶觸發卡片本身', /onclick="event\.stopPropagation\(\);ppShareTk/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
