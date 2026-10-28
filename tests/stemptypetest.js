/* 員工列表改「職務下拉＋可排到下個月生效」（2026-10-28）

   使用者原話：「移除休假日　改成職務[正職][兼職][合作][支援]用下拉選單調整
   這種調整可以先做　然後下個月生效」。

   ── 為什麼不用寫排程 ──────────────────────────────────────────────
   薪資端本來就是「一個月一份快照」：`empRuleAt(emp, ym)` 取**不晚於那個月**
   的最後一份 pay_rules 快照。所以把新身分寫進 `pay_rules['2026-11']`，
   10 月薪資照樣吃 10 月（或更早）那份、11 月自動換過去 —— 不需要任何 cron。

   ⚠ 只有資料列上的**即時欄位** `employment_type` 要等月初才翻（勞健保頁、
     班表讀的是它）。所以列表那一格顯示的是 stEtNow()（吃快照），不是即時欄位，
     列表本身不會延遲。

   ── 這支在守什麼 ──────────────────────────────────────────────────
   **「排到下個月」絕對不可以動到這個月的薪資。** 這是會直接影響發薪金額的事，
   所以用實跑比對：同一份資料，排程前後算出來的「10 月適用身分」必須一模一樣。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
const grab=n=>{let i=src.indexOf('async function '+n+'(');
 if(i<0) i=src.indexOf('function '+n+'(');
 let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 介面：工讀整個改叫「支援」');
ok('★★★ 中央對照表改了（employment_type 仍然是 intern）',
   /intern:'支援'/.test(src) && !/intern:'工讀'/.test(src));
ok('★★ 四個選項：正職／兼職／合作／支援',
   /const ST_ET_OPTS=\[\['full_time','正職'\],\['part_time','兼職'\],\['contractor','合作'\],\['intern','支援'\]\];/.test(src));
/* ⚠ 「職稱」那個下拉（教練／行政／工讀／其他）是另一回事，刻意沒有跟著改。 */
ok('★★ 職稱下拉的「工讀」沒有被順手改掉（那是職稱不是僱用別）',
   /\['工讀','工讀'\]/.test(src));

console.log('\n② 四項控制都寫出「現在的值」');
ok('★★★ 權限三選一（管理員／主管／無）',
   /const ST_ROLE_OPTS=\[\['admin','管理員'\],\['manager','主管'\],\['none','無'\]\];/.test(src)
   && /function stRoleOf\(c\)\{ return c\.role==='admin' \? 'admin' : \(c\.is_manager \? 'manager' : 'none'\); \}/.test(src));
ok('★★★ 值班／開課寫出現在的值，不是暗著的開關',
   /stPill\(c\.id,'punch','值班',c\.need_punch\?'需打卡':'不需打卡',c\.need_punch\?'on':'off'\)/.test(src)
   && /stPill\(c\.id,'teach','開課',c\.can_teach\?'可':'否',c\.can_teach\?'on':'off'\)/.test(src));
/* 2026-10-28 三修（使用者：「可以用顏色區分可以/不可以嗎？」）——
   開著＝綠、關著＝灰、管理員＝金。 */
ok('★★★ 用顏色分「可以／不可以」：開著綠、關著灰、管理員金',
   /\.st-pl-on\{border-color:#cfe3d8;background:#eef5f1;color:var\(--green,#1f6f54\);\}/.test(src)
   && /\.st-pl-off\{color:var\(--t3\);background:var\(--card2\);\}/.test(src)
   && /\.st-pl-adm\{border-color:#e8d9b8;background:#f7efe0;color:var\(--gold-d,#8a5e28\);\}/.test(src));
/* ⚠ 紅色在這套系統是「有事要處理」（紅>金>綠）。「不需打卡」「不開課」是
   合作教練的正常設定，不是錯誤 —— 標紅會讓人以為要去修它。 */
ok('★★★ 關著的那一側不可以用紅色（紅＝要處理，見品牌色階）',
   !/\.st-pl-off\{[^}]*danger/.test(src) && /\*\*不用紅色\*\*/.test(src));
ok('★★ 職務吃聘僱類型色（--pc，跟左邊色條同一個值），不另外發明一組',
   /\.st-pl-et\{color:var\(--pc,var\(--text\)\);/.test(src));
ok('★★★ LINE 退成燈號、不可點（綁定移到齒輪）',
   /<span class="st-lamp\$\{_line\?' on':''\}"/.test(src)
   && /綁定與解除在齒輪裡的員工資料/.test(src));
ok('★★ 〔停用〕維持原本的開關（它是反向開關、紅燈）',
   /\$\{g\('danger'\)\}/.test(src));
ok('　　為什麼不用行內下拉（0908 那一套已退場）',
   /不用行內浮動下拉（那一套 0908 已經整組退場）/.test(src));

console.log('\n③ 排到下個月：絕對不可以動到這個月');
const env={
  normEmp:v=>({fulltime:'full_time',parttime:'part_time',partner:'contractor',workstudy:'intern'})[v]||v||'full_time',
  PAY_RULE_KEYS:['employment_type','need_duty','base_salary','duty_hourly','pt_mode','pt_rate',
    'pt_tiers','group_rate','pt_bonus_enabled','pt_bonus','custom_salary','is_manager',
    'weekly_work_days','weekly_min_shift_days','pt_bonus_mode','is_supervisor','supervisor_bonus'],
};
const F=(n,extra)=>new Function(...Object.keys(env),...Object.keys(extra||{}),
  grab(n)+';return '+n+';')(...Object.values(env),...Object.values(extra||{}));
const payRulesMap=F('payRulesMap');
const empRuleAt=F('empRuleAt',{payRulesMap});
const empAtMonth=F('empAtMonth',{empRuleAt, PAY_RULE_KEYS:env.PAY_RULE_KEYS});
const payRuleSnapshot=F('payRuleSnapshot',{PAY_RULE_KEYS:env.PAY_RULE_KEYS});
const prevYm=F('prevYm');

/* 黃美蓉的實際形狀：正職、10 月底排程 11/1 轉合作教練 */
const MANGO={id:'E1',name:'黃美蓉',employment_type:'full_time',need_duty:true,
  base_salary:29500,duty_hourly:0,pt_mode:'tier',pt_rate:0,pt_tiers:[1,2,3,4],
  group_rate:200,pt_bonus_enabled:true,pt_bonus:[1],custom_salary:true,is_manager:false};
const TPL={contractor:{base_salary:0,duty_hourly:200,pt_mode:'flat',pt_rate:600,
  group_per_head:200,pt_tiers:[],pt_bonus:[]}};

/* stApplyEmpType 會 await dbPut，所以把 dbPut 換成「把結果留下來」 */
let SAVED=null;
const apply=new Function('stCurYm','stNextYm','stEtNow','stEtPending','payRulesMap',
  'payRuleSnapshot','prevYm','PAY_RULE_KEYS','dbPut','showToast','PAY_LABEL','window',
  grab('stApplyEmpType')+';return stApplyEmpType;')(
  ()=>'2026-10', ()=>'2026-11',
  c=>env.normEmp((empAtMonth(c,'2026-10')||c).employment_type),
  ()=>null, payRulesMap, payRuleSnapshot, prevYm, env.PAY_RULE_KEYS,
  /* ⚠ dbPut 是 (表名, 物件) 兩個參數 —— 只收一個的話接到的是字串 'coaches'。 */
  async (_t,c)=>{ SAVED=JSON.parse(JSON.stringify(c)); }, ()=>{},
  {full_time:'正職',contractor:'合作'}, {SALARY_TPL:TPL});

(async()=>{
  const c=JSON.parse(JSON.stringify(MANGO));
  await apply(c,'contractor','next');
  const after=SAVED;
  eq('★★★ 10 月適用身分沒有變（排程不動當月）',
     env.normEmp(empAtMonth(after,'2026-10').employment_type), 'full_time');
  eq('★★★ 11 月起換成合作', env.normEmp(empAtMonth(after,'2026-11').employment_type), 'contractor');
  eq('★★★ 12 月沿用 11 月（取不晚於該月的最後一份）',
     env.normEmp(empAtMonth(after,'2026-12').employment_type), 'contractor');
  /* ⚠ 最重要的一條：10 月的**薪資數字**也要原封不動，不只是身分字串。 */
  const oct=empAtMonth(after,'2026-10');
  eq('★★★ 10 月的底薪／課費級距全部沒動', [oct.base_salary,oct.pt_mode,oct.pt_bonus_enabled],
     [29500,'tier',true]);
  const nov=empAtMonth(after,'2026-11');
  eq('★★★ 11 月吃合作教練的模板（底薪 0、值班時薪 200、課費 600 單一費率）',
     [nov.base_salary,nov.duty_hourly,nov.pt_mode,nov.pt_rate,nov.pt_bonus_enabled],
     [0,200,'flat',600,false]);
  eq('★★★ 合作教練不排值班', nov.need_duty, false);
  /* ⚠ 即時欄位不可以被「排到下個月」提前翻掉 —— 勞健保頁與班表讀的是它。 */
  eq('★★★ 排程不動即時欄位（勞健保頁與班表讀的是它）', after.employment_type, 'full_time');

  /* 「這個月就改」才翻即時欄位 */
  const c2=JSON.parse(JSON.stringify(MANGO));
  await apply(c2,'contractor','now');
  eq('★★★ 選「這個月就改」才翻即時欄位', SAVED.employment_type, 'contractor');
  eq('★★★ 這個月就改 → 10 月適用身分跟著變',
     env.normEmp(empAtMonth(SAVED,'2026-10').employment_type), 'contractor');
  /* ⚠ 改當月時要先把「更早的月份」凍結起來，否則 9 月以前的薪資單會跟著新身分跑。 */
  ok('★★★ 改當月會先凍結上個月（9 月的薪資單不受影響）',
     !!(SAVED.pay_rules && SAVED.pay_rules['2026-09']
        && SAVED.pay_rules['2026-09'].employment_type==='full_time'), SAVED.pay_rules);

  console.log('\n④ 列表顯示的是快照不是即時欄位');
  ok('★★★ stEtNow 吃 empAtMonth（排程中的人列表仍顯示當月身分）',
     /function stEtNow\(c\)\{ return normEmp\(\(empAtMonth\(c, stCurYm\(\)\)\|\|c\)\.employment_type\); \}/.test(src));
  ok('★★★ 有排程就在職務下面標出來（金色＝可以做但要知道）',
     /class="st-et-pend"/.test(src) && /\.st-et-pend\{[\s\S]{0,120}color:var\(--gold-d/.test(src));
  ok('　　為什麼不需要排程器，寫在原地',
     /薪資端不需要任何排程：empRuleAt 取「不晚於該月的最後一份快照」/.test(src));

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})();
