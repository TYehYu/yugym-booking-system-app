/* LINE 通知範本（2026-08-23 使用者指示：
   「可以把 line 發通知設定這個設計在桌機管理員導覽列裡面嗎 我可以自行調整內容」）

   守的重點：
   ① 範本只是「內容」—— 收件人、發送時機、扣課判斷都不歸它管，那些仍在 Edge Function 裡。
   ② 讀不到範本要退回內建文字（通知不能因為一張表出事就整組停掉）。
   ③ 停用＝那一種通知根本不發，不是發一封空的。
   ④ 抬頭與「自動發送」註解固定不給改 —— 那是「這是系統發的」的識別。 */
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pd=fs.readFileSync(path.join(root,'docs/edge/line-push-daily.ts'),'utf8');
const dr=fs.readFileSync(path.join(root,'docs/edge/line-daily-report.ts'),'utf8');
const mig=fs.readFileSync(path.join(root,'docs/migrations/20260823_line_templates.sql'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('① 入口與權限');
ok('★ 掛在桌機管理員導覽列「環境設定」底下',
   /\{grp:'環境設定', label:'通知範本', page:'settings_line'\}/.test(src));
ok('★★ 只有管理員進得去（其他人看到一句話，不是一個改得動的表單）',
   /PAGES\.settings_line=async function\(\)\{\s*\n\s*if\(SESSION\.role!=='admin'\)\{/.test(src));
ok('　　資料庫層也只給管理員寫（前端擋不住直接打 API）',
   /create policy line_templates_admin on public\.line_templates\s*\n\s*for all using \(\(select is_admin\(\)\)\) with check \(\(select is_admin\(\)\)\);/.test(mig));

console.log('\n② 四種通知各一張卡');
['LT-CLASS','LT-PAY','LT-REPORT','LT-COACHDAY'].forEach(id=>{
  ok('　　'+id+' 有變數清單與說明', !!/LINE_TPL_VARS/.test(src)
     && new RegExp("'"+id+"':\\[").test(src) && new RegExp("'"+id+"':'").test(src));
});
ok('★ 種子＝現行文字，所以套用當下行為完全不變',
   /種子＝現行的文字，所以套用當下行為完全不變/.test(mig)
   && /on conflict \(id\) do nothing;/.test(mig));

console.log('\n③ 編輯體驗');
ok('★ 點標籤插入變數（沿用合約範本那一支的作法）',
   /function ltInsertVar\(id,v\)\{/.test(src)
   && /ta\.value=ta\.value\.slice\(0,s\)\+tag\+ta\.value\.slice\(e\);/.test(src));
ok('★★ 預覽要連抬頭一起畫，不然看不出實際長相',
   /const txt=\['【有肌訓練 自動訊息】',kind,'',ltFill\(body,id\)\]\.join\('\\n'\);/.test(src));
ok('　　預覽用範例資料填一遍（與 Edge Function 同一套純字串取代）',
   /function ltFill\(body, id\)\{/.test(src)
   && /s=s\.split\('\{\{'\+k\+'\}\}'\)\.join\(demo\);/.test(src));
ok('★★ 啟用中的通知不能存空白內容（存了就是發一封空訊息）',
   /if\(on && !body\.trim\(\)\)\{ showToast\('啟用中的通知不能留空白內容'\); return; \}/.test(src));
ok('　　停用的卡整張淡化，但內容仍讀得到、改得動',
   /\.lt-off\{opacity:\.55;\}/.test(src) && /\.lt-off \.lt-sw\{opacity:1;\}/.test(src));

console.log('\n④ Edge Function：line-push-daily');
ok('★★ 讀範本失敗要退回內建文字（通知不能因為一張表出事就整組停掉）',
   /\} catch \(_\) \{ \/\* 沒有範本就用內建的 \*\/ \}/.test(pd)
   && /const clsBody = \(_cls && _cls\.body\.trim\(\)\)/.test(pd));
ok('★★ 停用＝根本不發（上課提醒與收款提醒各自獨立）',
   /for \(const mid of \(tplOff\('LT-CLASS'\) \? \[\] : ids\)\) \{/.test(pd)
   && /if \(coachAlert && !tplOff\('LT-PAY'\)\) \{/.test(pd));
ok('★★ venue／renew 兩個變數自己帶前導換行 —— 沒有值時整行要消失，不留空行',
   /venue: venue \? `\\n📍 場地：\$\{venue\}` : '',/.test(pd)
   && /renew: renewLine \? `\\n\\n\$\{renewLine\}` : '',/.test(pd));
ok('★ 抬頭與「自動發送」註解不進範本（固定不給改）',
   /const text = \[HEAD, \(_cls && _cls\.kind_label\) \|\| '上課提醒', '', clsBody, '', AUTO_NOTE\]\.join\('\\n'\)/.test(pd));
ok('　　找不到的變數留原樣（比換成空字串好，一眼看得出範本打錯字）',
   /找不到的變數留原樣 —— 留原樣比換成空字串好/.test(pd));

console.log('\n⑤ Edge Function：line-daily-report');
ok('★★ 戰報與教練當日各自吃自己的範本，沒有就用內建那一版',
   /const bossBody = \(_rep && _rep\.body\.trim\(\)\)/.test(dr)
   && /const cdBody = \(_cd && _cd\.body\.trim\(\)\)/.test(dr));
ok('★★ 停用的種類整組不進收件人清單',
   /for \(const e of \(tplOff\('LT-REPORT'\) \? \[\] : bosses\)\) \{/.test(dr)
   && /for \(const cid of \(tplOff\('LT-COACHDAY'\) \? \[\] : Object\.keys\(perCoach\)\)\) \{/.test(dr));
ok('★ debug 模式回傳目前的範本開關（試算時看得出來哪一種被關掉）',
   /templates: Object\.keys\(tpl\)\.map\(k => \(\{ id: k, enabled: tpl\[k\]\.enabled \}\)\)/.test(dr)
   && /templates: Object\.keys\(tpl\)\.map\(k => \(\{ id: k, enabled: tpl\[k\]\.enabled \}\)\)/.test(pd));

console.log('\n⑥ 新表該做的事（見 CLAUDE.md）');
ok('★★ 掛 change_log 觸發器（不然前端增量同步看不到它的變動）',
   /create trigger trg_change_log after insert or delete or update\s*\n\s*on public\.line_templates for each row execute function fn_log_change\(\);/.test(mig));
ok('★★ 列進 fn_table_sigs（不然快取的簽章校驗看不到它）',
   /d := replace\(d, '''ticket_grant_requests''', '''ticket_grant_requests'',''line_templates'''\);/.test(mig));
ok('★★ 光有 RLS policy 不夠，還要 grant（0812 service_role 權限破洞的教訓）',
   /grant all on public\.line_templates to service_role;/.test(mig)
   && /0812 service_role 權限破洞的教訓/.test(mig));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
