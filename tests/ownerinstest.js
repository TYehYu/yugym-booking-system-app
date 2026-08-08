/* 2026-08-08 使用者指正：「公司負擔勞健保，余東曄是雇主，這邊應該沒有金額吧？
   健保 2,171 是雇主自負額」

   對的。負責人（雇主本人）：
     ・健保是以投保金額<b>全額自付</b>（42,000 × 5.17% ＝ 2,171，就是他說的那個數字），
       系統本來就用 NHI_RATE_OWNER 算對了，只是畫面上叫它「員工負擔」，說法不對。
     ・勞保雇主本人不在受僱者的投保範圍裡（他的 labor_insurance_status 也是空的）。
     → 公司沒有替他負擔的部分，「公司負擔」應該是 0。

   但原本的算法只要查得到投保級距就套 co_total —— 而 co_total 是「受僱者」的雇主分擔，
   套在負責人身上會憑空多出一筆 $8,284 的人事成本，而且那筆錢直接吃掉淨利。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 公司負擔：負責人 0');
{
  /* 把那一段判斷抽出來跑：identity / 投保狀態 / 級距 三個變數的組合 */
  const seg=/const insCoCost   = \(insIdentity==='owner'\)[\s\S]*?: 0\);/.exec(src)[0];
  const F=new Function('insIdentity','lvl','laborOn','healthOn','insLaborCo','insHealthCo',
    seg+'\nreturn insCoCost;');
  const LV={co_total:8284};
  eq('★★ 負責人 → 0（就算級距填了、健保也投保中）', F('owner',LV,false,true,0,0), 0);
  eq('★★ 受僱者投保中 → 照級距表的三合一負擔', F('employee',LV,true,true,0,0), 8284);
  eq('★ 填了級距但兩種都沒投保 → 0', F('employee',LV,false,false,0,0), 0);
  eq('★ 查不到級距 → 0', F('employee',null,true,true,0,0), 0);
  eq('　　沒有 co_total 時退回舊欄位加總', F('employee',{co_total:0},true,true,5000,1200), 6200);
  eq('　　只投保其中一種也算（級距表只給合計，無法拆分）', F('employee',LV,true,false,0,0), 8284);
}
ok('★★ 為什麼負責人是 0，寫在原地',
   /負責人的健保是以投保金額<b>全額自付<\/b>（上面 insHealthEmp 已用 NHI_RATE_OWNER 算），/.test(src)
   && /級距表的 co_total 是「受僱者」的雇主分擔，套在負責人身上會憑空多出一筆成本。/.test(src));
ok('★ 使用者的原話寫在程式裡',
   /「余東曄是雇主，這邊應該沒有金額，\s*\n\s*健保 2,171 是雇主自負額」/.test(src));

console.log('\n② 健保自付額本來就算對了（只是說法要改）');
{
  ok('★ 負責人用全額費率（NHI_RATE_OWNER）',
     /const NHI_RATE_OWNER=0\.0517; \/\/ 2026 健保一般保險費率；負責人自付全額時用/.test(src)
     && /insHealthEmp = Math\.round\(insAmt \* NHI_RATE_OWNER\);/.test(src));
  eq('★★ 42,000 × 5.17% ＝ 2,171（就是使用者說的那個數字）', Math.round(42000*0.0517), 2171);
}

console.log('\n③ 畫面上的說法');
ok('★★ 薪資單：負責人顯示「健保（雇主自負額）」，受僱者維持「員工負擔」',
   /rows\+=row\(sal\.insIdentity==='owner'\?'健保（雇主自負額）':'健保（員工負擔）',/.test(src));
ok('★ 並附算式（投保金額 × 5.17%・負責人全額自付）',
   /投保金額 \$\{Number\(sal\.insGrade\|\|0\)\.toLocaleString\(\)\} × 5\.17%（負責人全額自付）/.test(src));
ok('★ 薪資彙總卡也跟著改',
   /\$\{s\.insIdentity==='owner'\?'健保（雇主自負額）':'健保（員工負擔）'\}/.test(src));
ok('★★ calcSalary 把 insIdentity 帶出來（畫面才判斷得了）',
   /insIdentity,   \/\* 'owner'＝負責人：健保全額自付、公司不負擔/.test(src));
ok('★★ 損益表的薪資明細：勞保／健保欄名改用共通說法',
   /\{k:'labor', t:'勞保',     s:'自付・非公司負擔', kind:'cut'\}/.test(src)
   && /\{k:'health',t:'健保',     s:'自付・非公司負擔', kind:'cut'\}/.test(src));
ok('★ 表下方明說「負責人的公司負擔為 0」',
   /<b>負責人為 0<\/b>，公司沒有替雇主本人負擔的部分。/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
