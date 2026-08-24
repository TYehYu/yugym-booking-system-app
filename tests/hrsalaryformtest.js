/* 薪資規則視窗的版面（2026-08-24 使用者定案）
   ・「排序可以整理一下」→ 照「錢怎麼來」由大到小：
     固定薪資 → 課堂薪資制度 → 團課費 → 達標獎金 → 管理職津貼 → 值班（附加項，最後）
     原本第一列就是「需要值班」＋值班時薪：用最小的項目開場，還把底薪擠到看不見的地方。
   ・「如果改成課堂抽成、不是底薪的時候，底薪這欄就不要白色底框」→ 填 0 就淡化。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const i=src.indexOf('function hrSalaryBodyHtml(c,et){');
let d=0,k=src.indexOf('{',i);
for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) break;} }
const F=src.slice(i,k+1);
/* 只看 return 出去的那段樣板（上面是各區塊的字串組裝，順序不代表畫面順序） */
const T=F.slice(F.lastIndexOf('return `'));

console.log('① 區塊順序＝錢怎麼來');
{
  const at=s=>T.indexOf(s);
  const 固定=at('>固定薪資<'), 課堂=at('>課堂薪資制度<'), 團課=at('團課費（每人次）'),
        獎金=at('啟用達標獎金'), 管理=at('>管理職津貼<'), 值班=at('>值班<');
  ok('★★ 六個區塊都在，且順序正確',
     [固定,課堂,團課,獎金,管理,值班].every(x=>x>0)
     && 固定<課堂 && 課堂<團課 && 團課<獎金 && 獎金<管理 && 管理<值班,
     {固定,課堂,團課,獎金,管理,值班});
  ok('★★ 值班排最後（它是附加項，金額通常最小）',
     /值班排最後：它是附加項，金額通常最小/.test(F));
  /* ⚠ hr-needduty 是組在 dutyRows 這個變數裡的，樣板上只看得到 ${dutyRows}。 */
  ok('★ 「需要值班」的勾選跟著值班區走，不再是第一列',
     T.indexOf('${dutyRows}')>管理
     && /const dutyRows=`\s*\n\s*<label class="hr-check"[^>]*><input type="checkbox" id="hr-needduty"/.test(F));
}

console.log('\n② 底薪：填 0（課堂抽成制）就淡化');
ok('★★ 值一改就跟著（不是只有開窗時算一次）',
   /oninput="hrBaseSync\(\)"/.test(F)
   && /function hrBaseSync\(\)\{/.test(src)
   && /row\.classList\.toggle\('hr-off', !\(\(Number\(el\.value\)\|\|0\)>0\)\)/.test(src));
ok('★★ 開窗時就依現值決定', /hr-basewrap\$\{_baseVal>0\?'':' hr-off'\}/.test(F));
ok('★★ 淡化＋寫原因，不是藏起來（藏了就沒地方改回月薪制）',
   /\.hr-basewrap\.hr-off input\{background:transparent;border-style:dashed;/.test(src)
   && /填 0 ＝ 這位是課堂抽成制，底薪不計入/.test(F)
   && /藏了就沒有地方把它改回月薪制/.test(F));
ok('★ 合作教練沒有底薪那一欄，直接寫清楚薪資從哪來',
   /合作教練<b>沒有底薪<\/b>，薪資全部來自下面的課堂與獎金。/.test(F));

console.log('\n③ 欄位 id 沒有動（儲存是照 id 讀的，改版面不能改 id）');
['hr-wwd','hr-wmsd','hr-base','hr-dutyrate2','hr-needduty','hr-ptmode','hr-grouprate']
  .forEach(x=>ok('　　'+x, F.indexOf('id="'+x+'"')>0));

console.log('\n④ 新風格：每一區收進白底卡（2026-08-24 使用者：「這邊還是舊風格」）');
{
  const R=F.slice(F.lastIndexOf('return `'));
  ok('★★ 五區各一張白卡（固定薪資／課堂／達標獎金／管理職／值班）',
     (R.match(/<div class="hr-card">/g)||[]).length===5);
  ok('★★ 區標退成卡上方的小標，不再是整條分隔線',
     /\.hr-sec\{font-size:11px;font-weight:800;color:var\(--t3\);letter-spacing:\.08em;/.test(src)
     && !/\.hr-sec\{[^}]*border-bottom/.test(src));
  ok('★★ 卡在米底上才看得出邊界；輸入框改吃米底，白底疊白底會糊成一片',
     /\.hr-card\{background:#fff;border:1px solid var\(--bd\);border-radius:14px;/.test(src)
     && /\.hr-card input,\.hr-card select,\.hr-card textarea\{background:var\(--card2\);\}/.test(src));
  ok('　　外層「適用月份」「聘僱類型」兩區也包了卡',
     (src.match(/<div class="hr-card">/g)||[]).length>=7);
}

console.log('\n⑤ 唯讀那張摘要要跟編輯視窗講同一件事');
{
  const i2=src.indexOf("const modeLb={tier:");
  const S=src.slice(i2-600, i2+1800);
  ok('★★ 欄位名要跟儲存時一致（原本讀 work_days／group_rate，永遠是空的）',
     /const _wwd=c\.weekly_work_days!=null\?c\.weekly_work_days:c\.work_days;/.test(S)
     && /const _grp=c\.group_per_head!=null\?c\.group_per_head:c\.group_rate;/.test(S));
  ok('★★ 級距制的鍵是 tier（原本對照表沒有，累進制會顯示成原始字串 "tier"）',
     /modeLb=\{tier:'累進制（依堂數級距）'/.test(S));
  ok('★ 順序與編輯視窗對齊（值班排最後）',
     S.indexOf("row('底薪'") < S.indexOf("row('課堂薪資制度'")
     && S.indexOf("row('課堂薪資制度'") < S.indexOf("row('需要值班'"));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
