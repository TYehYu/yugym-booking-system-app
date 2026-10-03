/* 薪資規則視窗三處調整（2026-10-03）

   ① 範本來源標示 —— 視窗上的金額有兩種出身：這個人自己設的，與薪資模板的預設值
      （empPayConfig 在欄位空白時退回 SALARY_TPL[聘僱類型]）。兩種長得一模一樣，
      所以會有「改了模板才發現連他一起動到」與「改了模板他卻沒變」兩種誤會。
   ② 管理職那一塊框成金色「全店共用」—— 它畫在某一位員工的視窗裡，
      改的卻是全店設定（門檻、名單、主管津貼都存 SALARY_GLOBAL）。
   ③ 生日禮金開關搬進來（使用者：「生日禮金這個開關可以做在薪資設定這邊嗎」）——
      原本只在「人事 → 工作規則 → 編輯」裡，使用者找不到。

   ⚠ 三處都只動畫面與既有欄位的讀寫，**算薪的程式一行沒碰** —— ⑤ 段在守這件事。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('找不到 '+n);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}throw new Error('括號不成對 '+n);};

/* 沙箱：hrTplFallbacks 只用到 window.SALARY_TPL 與 normEmp */
function mkFallbacks(tpl){
  return new Function('window','normEmp',
    'return '+grabFn('hrTplFallbacks'))(
      {SALARY_TPL:tpl},
      v=>{const s=String(v||'');return s||'full_time';});
}
/* 正職範本：底薪、每堂、團課費、值班時薪、達標獎金五樣都有值 */
const TPL={full_time:{base_salary:29500, pt_mode:'flat', pt_rate:625,
  pt_bonus:[{threshold:80,amount:4000}], group_per_head:150, duty_hourly:200}};

console.log('① 哪幾項是跟著範本走的');
{
  const F=mkFallbacks(TPL);
  eq('★★★ 什麼都沒設 → 五項全部跟著範本',
     F({}, 'full_time'), ['底薪','課堂薪資','達標獎金','團課費','值班時薪']);
  eq('★★★ 全部自訂 → 一項都不剩（這時畫綠章）',
     F({base_salary:32000, pt_mode:'flat', pt_rate:700, pt_bonus:[],
        group_rate:200, duty_hourly:180}, 'full_time'), []);
  /* ⚠ 判斷的是「有沒有自己的值」，不是「數字跟範本一不一樣」——
       設成跟範本同樣的數字仍然是自訂，日後改範本不會動到他。 */
  eq('★★★ 自己設成跟範本一樣的數字，仍然算自訂',
     F({base_salary:29500, pt_rate:625, pt_bonus:[], group_rate:150, duty_hourly:200}, 'full_time'), []);
  eq('★★ 只設了底薪 → 其餘四項跟著範本',
     F({base_salary:32000}, 'full_time'), ['課堂薪資','達標獎金','團課費','值班時薪']);
  /* ⚠ 底薪只有正職畫得出來，兼職／合作／工讀不要列（畫面上根本沒有那一欄） */
  eq('★★★ 兼職不列底薪（那一欄畫都沒畫出來）',
     mkFallbacks({part_time:Object.assign({},TPL.full_time)})({}, 'part_time'),
     ['課堂薪資','達標獎金','團課費','值班時薪']);
  eq('★★ 級距制也算有自己的課堂設定',
     F({pt_tiers:[{min:1,max:59,rate:625}]}, 'full_time').includes('課堂薪資'), false);
  eq('★★ 空的 pt_bonus 陣列＝自己設定「沒有獎金」，不是沒設',
     F({pt_bonus:[]}, 'full_time').includes('達標獎金'), false);
  /* ⚠ 範本自己也是空的時候不要說「跟著範本」—— 那等於什麼都沒有 */
  eq('★★★ 範本沒設的欄位不列（說了也沒意義）',
     mkFallbacks({full_time:{}})({}, 'full_time'), []);
  eq('★★ 0 不算有值（與 empPayConfig 的 has() 一致：0 會退回範本）',
     F({duty_hourly:0}, 'full_time').includes('值班時薪'), false);
}

console.log('\n② 章怎麼畫');
{
  const H=grabFn('hrTplSrcHtml');
  ok('★★★ 有跟著範本的 → 金章，寫出是哪幾項', /hr-vtag-tpl">沿用 \$\{lb\} 範本/.test(H)
     && /\$\{miss\.join\('、'\)\}/.test(H));
  ok('★★★ 全部自訂 → 綠章，寫明「改範本不會動到他」',
     /hr-vtag-own2">全部自訂/.test(H) && /改<b>\$\{lb\}<\/b>薪資模板不會動到他/.test(H));
  ok('★★★ 畫在「適用範圍」卡裡，與月份版本章並排成兩行',
     /<div id="hr-tplsrc">\$\{hrTplSrcHtml\(c, HR_SAL_ET\)\}<\/div>/.test(src));
  /* ⚠ 換聘僱類型＝換一份範本，「沿用正職範本」那句話當場就不對了 */
  ok('★★★ 換聘僱類型時這枚章要跟著重畫',
     /const sb=document\.getElementById\('hr-tplsrc'\);\s*\n\s*if\(sb\) sb\.innerHTML=hrTplSrcHtml\(src, et\);/.test(src));
  ok('★★ 月份版本章沒被動到（那枚講的是「改的是哪個月」，兩件事）',
     /hr-vtag\$\{_past\?' hr-vtag-past':' hr-vtag-own'\}">\$\{_ymLb\} 專屬/.test(src)
     && /hr-vtag hr-vtag-inherit">/.test(src));
}

console.log('\n③ 管理職的全店共用框');
{
  ok('★★★ 團隊獎金那一塊包在金框裡', /<div class="hr-shared">\s*\n\s*<div class="hr-shared-h"><span class="hr-shared-b">全店共用<\/span>/.test(src));
  ok('★★★ 框裡寫明「不是只改這一位」', /以下三項改的是<b>全店設定<\/b>，不是只改這一位/.test(src));
  ok('★★★ 內容還是原本那一支（沒有複製一份出來）', /<\/div>\s*\n\s*\$\{hrTeamBoxHtml\(\)\}/.test(src));
  ok('★★ 金色＝次要警示（紅 > 金 > 綠）', /\.hr-shared\{border:1\.5px solid var\(--gold,#B48A56\)/.test(src));
  ok('★★ 框內的輸入框改白底（框底是淡金，米底框會糊掉）',
     /\.hr-shared \.hr-note,\.hr-shared input\{background:#fff;\}/.test(src));
  ok('★★ 開關仍然控制整塊的顯示', /<div id="hr-mgr-box" style="display:\$\{c\.is_manager\?'block':'none'\};">/.test(src));
}

console.log('\n④ 生日禮金那張卡');
{
  const B=grabFn('hrSalaryBodyHtml');
  ok('★★★ 有這張卡、有勾選框', /<div class="hr-ct">生日禮金<\/div>/.test(B)
     && /<input type="checkbox" id="hr-bday" \$\{c\.birthday_bonus_off\?'':'checked'\}>發生日禮金/.test(B));
  /* ⚠ 欄位存的是「關掉」，所以讀寫都要反過來 —— 寫反了就是全店一起開或一起關 */
  ok('★★★ 存檔時反過來寫（勾著＝照發）',
     /\{ const el=document\.getElementById\('hr-bday'\); if\(el\) c\.birthday_bonus_off=!el\.checked; \}/.test(src));
  ok('★★★ 抓不到元素就不要動它（這張卡哪天被藏起來，不可以把設定洗掉）',
     /if\(el\) c\.birthday_bonus_off=!el\.checked;/.test(src));
  /* 禮金掛在「生日月的前一個月」那張薪資單，光看開關看不出來 */
  const F=new Function('c','G','return (function(){'
    + grabFn('hrSalaryBodyHtml').slice(grabFn('hrSalaryBodyHtml').indexOf('const _bd=String('),
        grabFn('hrSalaryBodyHtml').indexOf('const mode=cfg.pt_mode'))
    + 'return _bdLine;})();');
  ok('★★★ 10 月生日 → 講明隨 9 月薪資於 10/5 發放',
     /隨 <b>9 月<\/b>的薪資於 <b>10\/5<\/b> 發放/.test(F({birthday:'1991-10-17'})));
  ok('★★★ 1 月生日 → 前一個月是 12 月（不要變成 0 月）',
     /隨 <b>12 月<\/b>的薪資於 <b>1\/5<\/b> 發放/.test(F({birthday:'1990-01-08'})));
  ok('★★★ 關掉時寫「目前不發」', /目前<b>不發<\/b>/.test(F({birthday:'1991-10-17',birthday_bonus_off:true})));
  /* ⚠ 沒填生日就一定不會發（算薪那支要 birthday 長度 ≥7），不要讓人以為勾著就會發 */
  ok('★★★ 沒填生日 → 講明勾著也不會發', /還沒有填生日<\/b>，勾著也不會發/.test(F({})));
  ok('★★ 金額讀全域設定（不要寫死 1000）',
     /Number\(\(window\.SALARY_GLOBAL\|\|\{\}\)\.birthday_bonus\|\|1000\)\.toLocaleString\(\)/.test(B));
  /* 換聘僱類型時 src 會換成類型預設值，生日那幾欄要留著，否則卡片當場變成「沒填生日」 */
  ok('★★★ 換聘僱類型時生日與開關要帶過去',
     /birthday:c\.birthday, birth_date:c\.birth_date,\s*\n\s*birthday_bonus_off:c\.birthday_bonus_off/.test(src));
}

console.log('\n⑤ 薪資完全沒被動到');
{
  /* 生日禮金的算法、兩個入口共用同一個欄位、以及刻意不做成按月快照 */
  ok('★★★ 算薪那一行沒變（仍然只看生日月與這個開關）',
     /const isBday=!!\(_payMM && _bd\.length>=7 && _bd\.slice\(5,7\)===_payMM\) && !\(emp&&emp\.birthday_bonus_off\);/.test(src));
  ok('★★★ 工作規則那個入口還在（兩個入口同一個欄位，不是兩份設定）',
     /c\.birthday_bonus_off=!document\.getElementById\('sch-bday'\)\.checked;/.test(src));
  /* ⚠⚠ 進了 PAY_RULE_KEYS 就會變成按月快照，與「工作規則」那個存現值的入口打架 */
  ok('★★★ 沒有混進 PAY_RULE_KEYS（不做按月快照）',
     !/PAY_RULE_KEYS=[\s\S]{0,400}birthday_bonus_off/.test(src));
  ok('★★★ 理由寫在原地', /刻意\*\*不\*\*放進 PAY_RULE_KEYS（不做成按月快照）/.test(src));
  ok('★★★ 課費、達標獎金、值班費那幾支一個字都沒改',
     /const ptPay=ptDone\*\(emp\.pt_rate\|\|0\);/.test(src)
     && /function calcPtBonus\(cfg, ptDone\)\{/.test(src)
     && /function isPtPayClass\(b\)\{ return !!b && b\.category==='私人教練'; \}/.test(src));
  /* 範本來源章只是「標示」，不可以反過來改變實際取值 */
  ok('★★★ hrTplFallbacks 只讀不寫（沒有任何賦值到 c 或 cfg）',
     !/hrTplFallbacks[\s\S]{0,900}(c\.\w+\s*=|cfg\.\w+\s*=)/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
