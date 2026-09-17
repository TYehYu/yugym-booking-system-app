/* 2026-08-05 使用者指示：「會員端可以自己更新的資料 性別 生日 緊急聯絡人 載具」

   性別/生日：表頭原地編輯對「會員本人」開放（原本僅櫃檯）。
   緊急聯絡人：原本就開放（2026-07-27），不動。
   載具：members.invoice_carrier 新欄位＋編輯小視窗（手機條碼，發票功能會用）。
   DB 端 members 加欄位級守門（fn_members_guard）：白名單外的欄位僅櫃檯以上。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
/* 2026-09-15 補：這支原本只有 ok，實跑比對（分期期數回推）要用 eq。
   寫法照全系統最通行的那一版（192 支測試檔在用），不自創格式。 */
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 表頭：性別/生日 會員本人可點');
ok('★ _canSelf＝會員本人看自己的資料',
   /const _canSelf = !!\(SESSION&&SESSION\.role==='member'&&isM&&String\(r\.id\)===String\(SESSION\.id\)\);/.test(src));
ok('★ 生日與性別用 _canBG（櫃檯或本人）',
   /const _canBG = _canBase\|\|_canSelf;/.test(src)
   && /pp-meta-i\$\{_canBG\?' pp-f-click':''\}[\s\S]{0,60}?ppInlineEdit\(event,'birthday'\)/.test(src)
   && /pp-meta-i\$\{_canBG\?' pp-f-click':''\}[\s\S]{0,60}?ppInlineEdit\(event,'gender'\)/.test(src));
/* 0823 使用者定案：修改會員資料收成只有管理員；會員本人改自己的照舊 */
/* 2026-09-15 使用者定案：生日統一成三格下拉＋民國年對照。
   ⚠ 生日改走跳視窗（ppBirthdayEdit），不再是行內 <input type="date"> ——
     行內 save() 讀的是單一 el.value，三個 select 接不上；
     而且行內浮動下拉整套已退場，新挑選欄位一律跳視窗。 */
ok('★★★ 生日改走跳視窗的三格下拉（不再是行內 date input）',
   /if\(fid==='birthday'\)\{ ppBirthdayEdit\(\); return; \}/.test(src)
   && /function ppBirthdayEdit\(\)\{/.test(src)
   && /\$\{birthdaySelects\('ppb'\)\}/.test(src));
ok('★★★ 視窗的權限與 ppInlineEdit 同一條（櫃檯以上或本人）',
   /function ppBirthdayEdit\(\)\{[\s\S]{0,260}?if\(!\(canEditMemberData\(\)\|\|_selfM\)\)/.test(src));
ok('★★ 存的是西元 YYYY-MM-DD（民國年只是選單上的對照字）',
   /const nv=readBirthday\('ppb'\);/.test(src)
   && /rec\.birthday=nv;/.test(src));
ok('★★ 三格都不選＝清空（readBirthday 回 null）',
   /任一格沒選 → null（＝清空）/.test(src));
ok('★★★ 民國年對照：民國年 = 西元 − 1911，1911 以前不顯示',
   /function rocLabel\(y\)\{ const r=Number\(y\)-1911; return r>=1\?`\$\{y\}（民\$\{r\}）`:String\(y\); \}/.test(src)
   && /years\+=`<option value="\$\{y\}">\$\{rocLabel\(y\)\}<\/option>`/.test(src));
ok('★★ 申請表的生日也統一成三格（原本是 input type=date）',
   /<label>出生日期 \*<\/label>\$\{birthdaySelects\('ap'\)\}/.test(src)
   && /birth=readBirthday\('ap'\)/.test(src)
   && !/id="ap-birth"/.test(src));
ok('★ ppInlineEdit 放行會員本人（主教練與生日性別改為管理員限定）',
   /if\(fid==='default_coach_id' && !canEditMemberData\(\)\)/.test(src)
   && /if\(\(fid==='birthday'\|\|fid==='gender'\) && !\(canEditMemberData\(\)\|\|_selfM\)\)/.test(src));
ok('　　緊急聯絡人維持開放（2026-07-27 既有）', /onclick="ppEmergencyEdit\(event\)"/.test(src));

console.log('\n② 載具 →（2026-09-14 擴充成「發票」：Email／載具／統編／抬頭一整組）');
/* ⚠ 0914 改動：ppCarrierEdit／ppCarrierSave 換成共用的 invPrefModal／invPrefSave ——
   櫃檯的會員資料頁與會員端首頁的提醒卡共用同一份實作（0914 才因為「兩支長得一樣的
   預約視窗」付過代價，見 yugym-member-v2）。ppCarrierEdit 留成薄包裝，因為表頭那一列的
   onclick 仍寫 ppCarrierEdit(event)。
   ⚠ 規則一條都沒放寬：本人可改、存前轉大寫、格式相同、留空＝清除。 */
ok('★ 表頭有載具欄（櫃檯或本人可點）',
   /* ⚠ 2026-09-15：統編不再存會員資料之後，這一格只剩載具一個值，
      原本為了組「統編・載具」而寫的 IIFE 沒有必要了，簡化成單行三元。 */
   /const carrierItem = isM\s*\n\s*\? `<div class="pp-meta-i/.test(src)
   && !/const carrierItem = isM \? \(\(\)=>\{/.test(src)
   /* ⚠ 2026-09-15 使用者：「發票改為載具」—— 統編已不存會員資料，
      這一格只會是手機條碼，叫「發票」名不符實（旁邊 Email 也是發票用的）。 */
   && /<span class="pp-meta-l">載具<\/span>/.test(src)
   && !/<span class="pp-meta-l">發票<\/span>/.test(src)
   && /onclick="ppCarrierEdit\(event\)"/.test(src)
   /* 2026-09-14 二修：發票與 Email 從詳細資料搬到頂列姓名區（.pp-idinv）。
      橫向表頭（員工／合約列印用的 meta）維持原順序，那條路 isM 才有這兩格。 */
   && /<div class="pp-meta pp-idinv">\$\{carrierItem\}\$\{emailItem\}<\/div>/.test(src));
/* 2026-09-14（使用者截圖問「會員資料不是從這邊輸入嗎　email 載具」）——
   「發票」那列只講買受人身份（統編／載具），Email 獨立一列。
   ⚠ 第一版寫成「有載具就 else if 不顯示 email」，有載具的人只看得到載具，
     而表頭又沒有 email 欄 → 看起來像 email 根本沒地方填（其實點進去就有）。 */
ok('★★★ Email 自己一列，不再被載具吃掉',
   /const emailItem = isM \? `<div class="pp-meta-i/.test(src)
   && /<span class="pp-meta-l">Email<\/span>/.test(src)
   && !/else if\(r\.email\) _b\.push/.test(src));
/* 2026-09-17：class 那串中間多了 ${_invMiss?' pp-warn':''}（兩格都空時轉提醒色），
   所以不再一字不差比對整組 class 組合。
   ⚠ 這一條守的本意是「Email 那列點下去開的是同一個發票設定視窗」——
     釘的應該是那個 onclick，不是它前面有哪些 class。 */
ok('★★ Email 那列點下去也是同一個發票設定視窗（不另做一套）',
   /const emailItem = isM \? `<div class="pp-meta-i[^"]*"\$\{_canBG\?` onclick="ppCarrierEdit\(event\)"/.test(src));
ok('★★ 舊入口保留成薄包裝（那一列的 onclick 一個字沒改）',
   /function ppCarrierEdit\(ev\)\{[\s\S]{0,220}?invPrefModal\(PP\.id/.test(src));
{
  const f=grabFn('invPrefSave');
  ok('★ 寫回 members.invoice_carrier（留空＝清除）', /rec\.invoice_carrier=car\|\|null;/.test(f));
  ok('★ 存前轉大寫＋驗格式', /g\('ip-car'\)\.toUpperCase\(\)/.test(f) && /\^\\\/\[0-9A-Z\+\.\\-\]\{7\}\$/.test(f));
  /* ⚠ 2026-09-15 使用者定案：「統編應該要每次手動輸入」「不用存在會員資料裡面」——
     這推翻 0914 的「開統編的客人存進會員資料自動帶入」。
     理由：同一個人這次開公司、下次開個人，自動帶出來反而容易誤開成公司發票。
     ⚠ Email 與載具照舊存（那是固定的通知管道，不會每次變）。 */
  ok('★★★ Email 與載具照存，統編／抬頭**不存**',
     /rec\.email=email\|\|null;/.test(f)
     && /rec\.invoice_carrier=car\|\|null;/.test(f)
     && !/rec\.invoice_ubn=/.test(f)
     && !/rec\.invoice_title=/.test(f));
  ok('★★★ 會員資料頁不再有統編／抬頭欄位',
     !/id="ip-ubn"/.test(src) && !/id="ip-title"/.test(src));
  ok('★★★ 三選一必填：Email 或手機條碼至少一項（沒有通知管道的發票等於沒開）',
     /if\(!email && !car\)\{ showToast\('Email 或手機條碼至少填一項'\); return; \}/.test(f));
  /* ⚠ 2026-09-15：抬頭改選填，與收款畫面同一套標準 ——
     綠界 B2C 的 CustomerName 只有 Print=1 才必填，我們走 Print=0＋載具。
     兩邊標準不一致的話，會員資料頁存得下、收款卻被擋，櫃檯會以為系統壞了。 */
  ok('★★★ 抬頭不強制（與 invCheckFields 同一套標準）', !/if\(ubn && !title\)/.test(f));
  /* 統編已不在這個視窗裡，所以這裡不再驗它 —— 收款畫面那一格仍有 8 碼驗證（invCheckFields）。 */
  ok('★★ 統編的格式驗證移到收款畫面（這裡不再有）',
     !/if\(ubn && !\/\^\\d\{8\}\$\/\.test\(ubn\)\)/.test(f)
     && /if\(!\/\^\\d\{8\}\$\/\.test\(f\.ubn\|\|''\)\) return '統一編號要 8 碼數字';/.test(src));
  ok('★★ 權限仍是「櫃檯以上或會員本人」',
     /const isSelf = !!\(SESSION && SESSION\.role==='member' && String\(SESSION\.id\)===String\(mid\)\);/.test(src)
     && /if\(!\(canEditMemberData\(\)\|\|isSelf\)\)\{ showToast\('修改會員資料需要櫃檯以上權限'\); return; \}/.test(src));
  // 手機條碼格式實跑：斜線開頭共 8 碼
  const re=/^\/[0-9A-Z+.\-]{7}$/;
  ok('★ 實跑：/ABC+123 ✓、/ABC1234 ✓', re.test('/ABC+123') && re.test('/ABC1234'));
  ok('★ 實跑：小寫、7碼、9碼、無斜線 ✗',
     !re.test('/abc1234') && !re.test('/ABC123') && !re.test('/ABC12345') && !re.test('ABC12345'));
}

console.log('\n③ DB 守門 migration 留檔');
ok('★ migration 檔存在', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_members_invoice_carrier_guard.sql'));
{
  const m=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_members_invoice_carrier_guard.sql','utf8');
  ok('★ 白名單涵蓋既有會員自寫流程（首次設定/簽約回寫/家庭成員）',
     /'name','phone','email','gender','birthday','birth_date',/.test(m)
     && /'emergency_name','emergency_phone','emergency_relation',/.test(m)
     && /'line_id','line_notify','family_members','must_setup','invoice_carrier'/.test(m));
  ok('　　櫃檯以上不受限', /if is_staff_desk\(\) then return new; end if;/.test(m));
}

console.log('\n列印消費明細（2026-09-15 使用者：「製作一個列印明細吧」＋「我現場再蓋公司章」）');
/* ⚠⚠ 這不是統一發票 —— 版面上一定要寫清楚，否則客人拿去報帳會被退件。
   報帳的正解是結帳時打統編（印有統編的電子發票證明聯才是會計憑證）。 */
{
  const F=(()=>{let i=src.indexOf('function printMemberStatement(');
    let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}})();
  /* 2026-09-15 使用者：「後面這句移除」—— 第二行那句拿掉了；
     免責那句**保留**（客人拿去報帳被退件時，紙上有寫過）。
     ⚠⚠ 比對前一定要**剝掉註解**：這個函式的註解裡會引用被移除的句子（說明為什麼拿掉），
       直接掃整個函式原文的話，「已移除」這條永遠是紅的 —— 畫面早就對了，
       是斷言命中自己寫的註解。同一個坑 0914 踩過兩次、0915 第三次，
       所以這裡一律先 stripC() 再比對。 */
  const stripC=s=>String(s||'').replace(/\/\*[\s\S]*?\*\//g,'');
  const Fv=stripC(F);
  /* 2026-09-15 使用者兩次指示，最終只留「本明細僅供查詢與核對之用，並非統一發票。」
     ⚠ 「並非統一發票」是底線 —— 沒有它，蓋了公司章的明細看起來就像正式憑證。 */
  ok('★★★ 版面仍明講「並非統一發票」（這是底線）',
     /本明細僅供查詢與核對之用，並非統一發票。/.test(Fv));
  ok('★★ 第二行的報帳說明已移除（使用者指示）',
     !/報帳請使用結帳時開立之電子發票/.test(Fv));
  ok('★★ 「不得作為報帳或扣抵憑證」也已移除（使用者第二次指示）',
     !/不得作為報帳或扣抵憑證/.test(Fv));
  ok('★★★ 賣方用公司登記名「筋實堂」不是品牌名（發票與明細的法律主體）',
     /name:'筋實堂', brand:'YUGYM 有肌訓練', ubn:'91788490',/.test(src)
     && /\$\{BIZ_INFO\.name\}/.test(F) && /統一編號 \$\{BIZ_INFO\.ubn\}/.test(F));
  ok('★★ 有蓋章區（使用者要現場蓋公司章）', /stmt-seal/.test(F) && /本公司蓋章/.test(F));
  ok('★★ 只有櫃檯以上能列印', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可列印'\); return; \}/.test(F));
  /* 2026-09-15 改單筆後，$0 的排除從「組清單時 filter」移到**按鈕層**
     （沒有鈕就印不出那一張），由下方「$0 的抽獎登記不給列印鈕」那條守著。 */
  ok('★★ 單筆版是用 id 指名那一筆（不再組整份清單）',
     /function stmtFind\(mid, purId\)/.test(src)
     && /\.find\(p=>p&&String\(p\.id\)===String\(purId\)\)/.test(src));
  ok('★★ 姓名與品項有跳脫（資料裡的角括號不會弄壞版面）',
     /const esc=t=>String\(t==null\?'':t\)\.replace\(\/&\/g,'&amp;'\)/.test(F));
  /* ⚠ 合約那套會把內容硬「收進兩頁」（ctFitPages），那是為固定長度的合約設計的；
     明細的筆數由消費次數決定，硬收會縮到 0.62 倍、字小到看不清。 */
  ok('★★★ 明細跳過「收進兩頁」（有幾頁印幾頁）',
     /if\(document\.querySelector\('\.stmt-doc'\)\) return;/.test(src)
     && /class="stmt-doc"/.test(F));
  /* ⚠⚠ 2026-09-15 使用者回報「沒有看到椰」——交易分頁有**兩個 return**：
     卡片版（if(_m2)）與表格版。而 _m2 就是 isDeskLike()，所以櫃檯一律走卡片版；
     第一版只把鈕加在表格版，結果誰都看不到。
     這條改成**數兩處**，正是為了讓同樣的疏漏下次會被擋下來。 */
  /* 2026-09-15 改版（使用者：「我不要全部的明細　我要每一筆單獨明細」）——
     標題列那顆「全部明細」撤掉，改成每一列各自一顆，所以數的是 _pr 那個變數。
     兩個 return（卡片版／表格版）都要有，否則櫃檯看不到（上一版就是只加在表格版）。 */
  ok('★★★ 兩個 return（卡片版／表格版）的每一列都有單筆列印鈕',
     (src.match(/printMemberStatement\('\$\{PP\.id\}','\$\{p\.id\}'\)/g)||[]).length===2);
  ok('★★★ 標題列那顆「全部明細」已撤（使用者不要整份清單）',
     !/printMemberStatement\('\$\{PP\.id\}'\)/.test(src));
  ok('★★ $0 的抽獎登記不給列印鈕（那不是消費，印出來是 $0 收據）',
     (src.match(/isDeskLike\(\)&&p\.id&&\(Number\(p\.deal_amount\)\|\|0\)>0/g)||[]).length===2);
  ok('★★ 把「_m2 其實是 isDeskLike 不是手機」寫在原地（這次就是被名字騙了）',
     /_m2 就是 isDeskLike\(\)（47929），名字看起來像「手機」但其實是「櫃檯以上」/.test(src));

  /* 分期（2026-09-15 使用者：「可是如果遇到分期呢」）——
     一張票券對應多筆收款，明細是「這一期的付款證明」，不是整個方案。
     ⚠ 不印期別的話，公司只看到「友善一般 1V1 $5,600」，看不出是 12 堂分 3 期的第 2 期。
     ⚠ 堂數要印「本期開通 4 堂」而不是票券總堂數 12 —— 印 12 堂但只收 1/3 的錢會誤導。
     ⚠ 為什麼不做在票券頁：票券頁只印得出方案總額 $16,800，但客人可能只付了 $11,200，
       那張紙給對方公司會出事。報帳報的是已付的錢。 */
  ok('★★★ 分期要印期別與方案總額',
     /row\('付款期別', `第 \$\{inst\.no\|\|'—'\} 期／共 \$\{inst\.cnt\} 期`/.test(F)
     && /方案總額 \$\$\{inst\.totalAmt\.toLocaleString\(\)\}/.test(F));
  ok('★★★ 分期時堂數印「本期開通」，不是票券總堂數',
     /const sess=inst\?inst\.segN:stmtSessions\(p\);/.test(F)
     && /row\(inst\?'本期開通':'堂數'/.test(F));
  ok('★★ 分期時金額標示為「本期實收金額」',
     /\$\{inst\?'本期實收金額':'金額'\}/.test(F));
  ok('★★ 舊系統匯入的交易也帶了 id（否則那些列指名不到、印不出來）',
     /id:'IMP-'\+t\.id,/.test(src) && /_sessions:Number\(t\.sessions_total\)\|\|0/.test(src));

  /* 期數回推：首期看 note 的「分期第N期」；後續期沒寫期數，
     用「累計 N/M」的 N 去對 segments 的累積和。已用真實資料實跑驗過：
     首期→{no:1,cnt:3,totalAmt:16800,segN:4}、第二期→{no:2,...}、非分期→null。 */
  {
    const grab=n=>{const i=src.indexOf('function '+n+'(');let d=0;
      for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
    const ticket={id:'T1', sessions_total:12,
      installment:{paid:[true,true,false],count:3,amounts:[5600,5600,5600],current:2,segments:[4,4,4]}};
    const fn=new Function('PP', grab('stmtInstall')+'\nreturn stmtInstall;')({ctx:{myTk:[ticket]}});
    const first=fn({source:'backoffice',deal_amount:5600,list_price:16800,ticket_id:'T1',
      note:'（分期第1期／總額 $16,800）'});
    const second=fn({source:'installment',deal_amount:5600,ticket_id:'T1',installment_count:3,
      note:'分期收款・開通 4 堂（累計 8/12）'});
    eq('★★★ 首期：第 1 期／共 3 期、總額 16800、本期 4 堂',
       [first.no,first.cnt,first.totalAmt,first.segN], [1,3,16800,4]);
    eq('★★★ 後續期：靠「累計 8/12」對上 segments 得出第 2 期',
       [second.no,second.cnt,second.totalAmt,second.segN], [2,3,16800,4]);
    eq('★★ 非分期回 null（不印那一段）',
       fn({source:'backoffice',deal_amount:10400,ticket_id:null,note:''}), null);
  }
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
