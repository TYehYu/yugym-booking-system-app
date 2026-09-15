/* 2026-08-05 使用者指示：「會員端可以自己更新的資料 性別 生日 緊急聯絡人 載具」

   性別/生日：表頭原地編輯對「會員本人」開放（原本僅櫃檯）。
   緊急聯絡人：原本就開放（2026-07-27），不動。
   載具：members.invoice_carrier 新欄位＋編輯小視窗（手機條碼，發票功能會用）。
   DB 端 members 加欄位級守門（fn_members_guard）：白名單外的欄位僅櫃檯以上。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
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
ok('★★ Email 那列點下去也是同一個發票設定視窗（不另做一套）',
   /const emailItem = isM \? `<div class="pp-meta-i\$\{_canBG\?' pp-f-click':''\}"\$\{_canBG\?` onclick="ppCarrierEdit\(event\)"/.test(src));
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
  ok('★★★ 版面明講「並非統一發票，不得作為報帳或扣抵憑證」',
     /本明細僅供查詢與核對之用，並非統一發票，不得作為報帳或扣抵憑證。/.test(F)
     && /報帳請使用結帳時開立之電子發票；如需打統編，請於消費當下告知櫃檯。/.test(F));
  ok('★★★ 賣方用公司登記名「筋實堂」不是品牌名（發票與明細的法律主體）',
     /name:'筋實堂', brand:'YUGYM 有肌訓練', ubn:'91788490',/.test(src)
     && /\$\{BIZ_INFO\.name\}/.test(F) && /統一編號 \$\{BIZ_INFO\.ubn\}/.test(F));
  ok('★★ 有蓋章區（使用者要現場蓋公司章）', /stmt-seal/.test(F) && /本公司蓋章/.test(F));
  ok('★★ 只有櫃檯以上能列印', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可列印'\); return; \}/.test(F));
  ok('★★ $0 的抽獎登記不列進明細（那不是消費）',
     /\.filter\(p=>p && \(Number\(p\.deal_amount\)\|\|0\)>0\)/.test(src));
  ok('★★ 姓名與品項有跳脫（資料裡的角括號不會弄壞版面）',
     /const esc=t=>String\(t==null\?'':t\)\.replace\(\/&\/g,'&amp;'\)/.test(F));
  /* ⚠ 合約那套會把內容硬「收進兩頁」（ctFitPages），那是為固定長度的合約設計的；
     明細的筆數由消費次數決定，硬收會縮到 0.62 倍、字小到看不清。 */
  ok('★★★ 明細跳過「收進兩頁」（有幾頁印幾頁）',
     /if\(document\.querySelector\('\.stmt-doc'\)\) return;/.test(src)
     && /class="stmt-doc"/.test(F));
  ok('★★ 交易分頁才有入口，且沒有交易就不畫那顆鈕',
     /\(isDeskLike\(\)&&txAll\.length\)\?`<button[^`]*printMemberStatement/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
