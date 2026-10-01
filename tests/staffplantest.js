/* 員工限定方案：教練培訓 1V1／1V2（2026-10-01 使用者：
   「我要新增一個員工才能購買的方案 教練培訓1v1跟1v2 12堂 單價1500/1700 可分期」）

   兩個決定（使用者選的）：
   ・授課教練**照拿課費**，跟一般教練課一樣 → 票種直接用現有的「教練課」，不另立 category
   ・「只有員工能買」＝**賣票時選到非員工就擋下來**（看得到但用不了，與 VIP／主顧客同一套）

   ⚠ 使用者同時交代「記得檢查不要影響到現有薪資狀況」——⑤ 整段在守這件事。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const sql=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20261001_course_plans_staff_only.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 資料：兩個方案與旗標');
{
  ok('★★★ 旗標 staff_only，預設 false（既有方案不受影響、不必回填）',
     /add column if not exists staff_only boolean not null default false;/.test(sql));
  ok('★★★ 票種用現有的「教練課」tt-mqdt435bbizd（授課教練照拿課費）',
     (sql.match(/'tt-mqdt435bbizd'/g)||[]).length===2);
  ok('★★★ 12 堂、1500／1700、可分期',
     /'教練培訓 1V1', 'tt-mqdt435bbizd', '1v1', 1500, 12, 0/.test(sql)
     && /'教練培訓 1V2', 'tt-mqdt435bbizd', '1v2', 1700, 12, 0/.test(sql)
     && (sql.match(/365, 'staff', true, false, true, false, true\)/g)||[]).length===2);
  ok('★★ 會員端不能自助申請（member_applyable=false）', /'staff', true, false, true/.test(sql));
  ok('★★ 重跑不會壞（on conflict do update）', /on conflict \(id\) do update set/.test(sql));
  ok('★★★ 為什麼不另立 category 寫在原地',
     /多一個 category 就要在 isPtPayClass、bkCounts、/.test(sql));
}

console.log('\n② 擋法：與 VIP／主顧客同一套 blockOf');
{
  const B=g('  const blockOf=p=>{','  };');
  ok('★★★ staff_only → 非員工回「限員工購買」',
     /if\(p\.staff_only\) return memberIsStaff\(mSel\)\?null:'限員工購買';/.test(B));
  ok('★★★ VIP 與主顧客那兩條沒被動到',
     /if\(isVipPlan\(p\)\) return \(mSel&&effTier\(mSel\)==='vip'\)\?null:'需 VIP 等級';/.test(B)
     && /if\(p\.plan_type==='loyal'\) return memberCanUseLoyal\(mSel\)\?null:'需主顧客以上';/.test(B));
  /* 「不能用就寫原因，別藏按鈕」—— 卡片照畫、淡化、把原因寫上去 */
  ok('★★★ 是淡化不是隱藏（卡片照畫，原因寫在上面）',
     /理由寫在原地|看得到才知道有這個方案/.test(src));
}

console.log('\n③ memberIsStaff：靠電話對');
{
  const F=new Function('window','return '+g('function memberIsStaff(m){','\n}'));
  const run=(phones,m)=>F({_staffPhones:phones==null?null:new Set(phones)})(m);
  eq('★★★ 電話對得上在職員工 → 是員工',
     run(['0933007990'], {phone:'0933007990'}), true);
  /* ⚠ 兩張表的格式不保證一致（0912-345-678 vs 0912345678） */
  eq('★★★ 格式不同也認得（只比數字）',
     [run(['0933007990'], {phone:'0933-007-990'}), run(['0933-007-990'.replace(/\D/g,'')], {phone:'0933 007 990'})],
     [true,true]);
  eq('★★ 一般客人 → 不是員工', run(['0933007990'], {phone:'0912345678'}), false);
  /* ⚠ 集合還沒備好時一律 false：寧可多問一句，也不要在資料沒載好時賣錯人 */
  eq('★★★ 名單還沒載好 → 一律當成不是員工（擋住）',
     [run(null, {phone:'0933007990'}), run([], {phone:'0933007990'})], [false,false]);
  eq('★★ 沒選會員也不會爆', [run(['0933007990'], null), run(['0933007990'], {})], [false,false]);
}

console.log('\n④ 名單在開賣票視窗時備好');
{
  ok('★★★ openGrantModal 撈員工電話存成集合',
     /window\._staffPhones=new Set\(\(_st\|\|\[\]\)/.test(src));
  ok('★★★ 只收在職的（離職的不該還買得到員工方案）',
     /\.filter\(e=>e && e\.status!=='inactive' && e\.status!=='resigned'\)/.test(src));
  ok('★★ 電話正規化成只有數字', /\.map\(e=>String\(e\.phone\|\|''\)\.replace\(\/\\D\/g,''\)\)\.filter\(Boolean\)\)/.test(src));
  ok('★★ 撈失敗也有空集合（不會讓整張視窗壞掉）', /catch\(_\)\{ window\._staffPhones=new Set\(\); \}/.test(src));
  ok('★★ 為什麼要先備好（blockOf 是同步的）寫在原地',
     /不能在裡面 await/.test(src));
}

console.log('\n⑤ 薪資完全沒被動到（使用者：「記得檢查不要影響到現有薪資狀況」）');
{
  /* 教練培訓用的就是 category='私人教練'，所以算薪那幾支一個字都不用改 ——
     也正因如此，這一段要確認它們真的沒被改。 */
  ok('★★★ isPtPayClass 還是只認 category（沒有為了這個方案加例外）',
     /function isPtPayClass\(b\)\{ return !!b && b\.category==='私人教練'; \}/.test(src));
  ok('★★★ calcSalary 的課費仍只看堂數與費率',
     /const ptPay=ptDone\*\(emp\.pt_rate\|\|0\);/.test(src));
  ok('★★★ 達標獎金仍只看 ptDone', /function calcPtBonus\(cfg, ptDone\)\{/.test(src));
  ok('★★★ 全檔沒有任何算薪的地方讀 staff_only',
     !/staff_only[\s\S]{0,120}(ptPay|ptDone|calcSalary|pt_rate|bonus)/.test(src)
     && !/(ptPay|ptDone|calcSalary|pt_rate)[\s\S]{0,120}staff_only/.test(src));
  ok('★★★ 也沒有任何堂數統計讀它（總堂數、報表、員工卡都不受影響）',
     !/staff_only[\s\S]{0,160}(bkCounts|isPtPayClass|bkIsGroup)/.test(src));
  /* staff_only 只出現在三個地方：擋人、方案編輯視窗的欄位、存檔 */
  eq('★★★ staff_only 只用在「擋人」與「方案設定」，沒有第四處',
     (src.match(/staff_only/g)||[]).length, 4);
}

console.log('\n⑥ 方案設定裡改得動（不必再開 SQL）');
{
  ok('★★★ 編輯視窗有「限員工購買」', /<label>限員工購買<\/label><select id="pl-staffonly">/.test(src));
  ok('★★★ 存得進去', /staff_only:document\.getElementById\('pl-staffonly'\)\.value==='1'\}\);/.test(src));
  ok('★★★ 方案類型下拉有「員工培訓方案」', /\['staff','員工培訓方案'\]\];/.test(src));
  ok('★★ 五處方案類型對照表都補上（不然會顯示成「一般」或空白）',
     (src.match(/vip:'VIP',staff:'員工培訓'\}/g)||[]).length===4
     && /vip:'VIP方案',staff:'員工培訓方案'\}/.test(src));
  ok('★★ 方案牆的分組標籤與排序也有（不然落到看不出是什麼的「其他」）',
     /single:'單堂',staff:'員工培訓'\}/.test(src)
     && /if\(p\.plan_type==='staff'\) return 7;/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
