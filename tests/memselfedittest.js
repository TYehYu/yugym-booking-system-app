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
ok('★ 表頭有發票欄（櫃檯或本人可點）',
   /const carrierItem = isM \? \(\(\)=>\{/.test(src)
   && /<span class="pp-meta-l">發票<\/span>/.test(src)
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
  ok('★★ Email 與統編抬頭也一起存（0914 新增，開統編的客人不必每次重打）',
     /rec\.email=email\|\|null;/.test(f)
     && /rec\.invoice_ubn=ubn\|\|null;/.test(f)
     && /rec\.invoice_title=title\|\|null;/.test(f));
  ok('★★★ 三選一必填：Email 或手機條碼至少一項（沒有通知管道的發票等於沒開）',
     /if\(!email && !car\)\{ showToast\('Email 或手機條碼至少填一項'\); return; \}/.test(f));
  ok('★★ 打統編一定要抬頭', /if\(ubn && !title\)/.test(f));
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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
