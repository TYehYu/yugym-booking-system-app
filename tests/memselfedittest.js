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

console.log('\n② 載具');
ok('★ 表頭有載具欄（櫃檯或本人可點）',
   /const carrierItem = isM \? `<div class="pp-meta-i\$\{_canBG\?' pp-f-click':''\}"\$\{_canBG\?` onclick="ppCarrierEdit\(event\)"`:''\}><span class="pp-meta-l">載具<\/span>/.test(src)
   && /\+ ecItem \+ lineItem \+ carrierItem/.test(src));
{
  const f=grabFn('ppCarrierSave');
  ok('★ 寫回 members.invoice_carrier（留空＝清除）', /rec\.invoice_carrier=v\|\|null;/.test(f));
  ok('★ 存前轉大寫＋驗格式', /\.trim\(\)\.toUpperCase\(\)/.test(f) && /\^\\\/\[0-9A-Z\+\.\\-\]\{7\}\$/.test(f));
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
