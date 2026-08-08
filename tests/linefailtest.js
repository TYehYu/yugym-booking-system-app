/* 2026-08-08 使用者回報：陳玟淂（原名陳瀚竣）的會員資料上掛著紅字「⚠ 提醒送不到」——
   「提醒不到」。

   查下來 LINE 回的是：
     400 The property, 'to', in the request body is invalid
   不是「沒加好友」（那是 403），而是「這組使用者代碼，官方帳號不認得」。
   他的代碼格式完全正確（U + 32 位十六進位、與 Auth 帳號一致、無隱藏字元），
   140 位綁定者裡只有他一個失敗 —— 所以不是系統設定壞掉，是這一組代碼對不上官方帳號。
   實務上最常見的是「用了另一個 LINE 帳號登入」或「當初綁到的代碼已失效」。

   原本畫面上只有一個紅標＋滑鼠提示：櫃檯看到了也不知道要做什麼，
   而原因其實有好幾種、處理方式各不相同。改成點得動。

   另外兩件同批的事（使用者指示）：
     ・「幫我新增管理員權限修改會員名字」
     ・「line 通知上課應該是通知上課的會員而不是通知擁有票券的會員，如果是票券共享」
       「自主訓練也是發給上課的會員而不是票券本人」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 把 LINE 的錯誤分類成櫃檯看得懂的幾種');
{
  const K=new Function(grabFn('linePushFailKind')+'\nreturn linePushFailKind;')();
  eq('★★ 陳玟淂那一種：代碼官方帳號不認得',
     K(`LINE 回應 400：{"message":"The property, 'to', in the request body is invalid (line: -, column: -)"}`), 'badid');
  eq('★★ 沒加好友（最常見）', K('會員尚未把官方帳號加為好友（或已封鎖）'), 'friend');
  eq('★ 金鑰失效（系統設定，不是會員的問題）', K('官方帳號金鑰失效，請管理員重新設定'), 'token');
  eq('★ 推播額度用完', K('LINE 推播次數已達上限'), 'quota');
  eq('　　認不出來就歸「其他」', K('LINE 回應 500：server error'), 'other');
  eq('　　沒有錯誤訊息也不會爆', K(null), 'other');
}
ok('★★ 每一種都有自己的下一步',
   /friend:\{ t:'會員沒有把官方帳號加為好友',/.test(src)
   && /badid:\{ t:'這組 LINE 代碼，官方帳號不認得',/.test(src)
   && /token:\{ t:'官方帳號金鑰失效',/.test(src)
   && /quota:\{ t:'LINE 推播次數已達上限',/.test(src));
ok('★ 只有「重新綁定能解決」的那幾種才給解除綁定的按鈕',
   /badid:\{[\s\S]{0,600}fix:true \}/.test(src)
   && /friend:\{[\s\S]{0,400}fix:false \}/.test(src)
   && /\$\{how\.fix\?`<button class="btn btn-red" onclick="lineUnbindMember/.test(src));

console.log('\n② 視窗內容');
{
  const F=grabFn('openLinePushFail');
  ok('★ 講出是哪一種、以及該怎麼做', /<b>\$\{how\.t\}<\/b><br><span style="color:#8a5e28;">\$\{how\.d\}<\/span>/.test(F));
  ok('★ 附上 LINE 的原始訊息（看不出來時可以回報）',
     /LINE 原始訊息：\$\{escH\(m\.line_push_error\|\|'—'\)\}/.test(F));
  ok('★ 標出最後一次失敗的時間', /最後一次失敗 \$\{when\|\|'—'\}/.test(F));
  ok('★★ 兩顆動作：清除警示（不動綁定）／解除綁定（請會員重新登入）',
     /onclick="lineFailClear\('\$\{mid\}'\)" title="只清掉這個紅標，不動綁定"/.test(F)
     && /解除綁定・請會員重新登入/.test(F));
}
{
  const F=grabFn('_doLineUnbind');
  ok('★★ 解除＝清掉代碼與警示，並在備註留痕',
     /m\.line_user_id=null; m\.line_push_failed_at=null; m\.line_push_error=null;/.test(F)
     && /解除 LINE 綁定（推播送不到，請會員重新登入）/.test(F));
  ok('★ 事前講清楚後果（收不到通知、也不能用 LINE 登入）',
     /解除後這位會員<b>暫時收不到任何 LINE 通知<\/b>，也<b>無法用 LINE 登入<\/b>/.test(src));
  ok('★ 提醒要用「平常在用的那個 LINE 帳號」（這正是 badid 的成因）',
     /記得用<b>平常在用的那個 LINE 帳號<\/b>/.test(src));
  ok('　　防連點', /async function doLineUnbind\(mid\)\{ return onceAct\('lineunbind:'\+mid, \(\)=>_doLineUnbind\(mid\)\); \}/.test(src));
}
ok('　　查到的事實寫在程式裡（免得下次又從頭查一遍）',
   /他的代碼格式完全正確（U \+ 32 位十六進位、與 Auth 帳號一致），140 位綁定者裡只有他一個\s*\n\s*失敗，所以不是設定壞掉/.test(src));

console.log('\n③ 管理員可以改會員姓名');
{
  const F=grabFn('ppEditName');
  ok('★★ 只有管理員（櫃檯不行 —— 改錯人是查帳時最難回溯的錯）',
     /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以修改姓名'\); return; \}/.test(F));
  ok('★★ 姓名變成可點的按鈕，也只有管理員看得到',
     /\$\{\(isM && SESSION && SESSION\.role==='admin'\)\n\s*\? `<button class="pp-name pp-name-edit"/.test(src));
  ok('★ 電話仍然鎖著（那是登入帳號）',
     /if\(fid==='phone'\)\{ showToast\('電話是登入帳號，不可在此修改'\); return; \}/.test(src));
  ok('★ 原本那條「姓名不可修改」改成導向改名視窗',
     /if\(fid==='name'\)\{ if\(SESSION&&SESSION\.role==='admin'\) return ppEditName\(\); showToast\('姓名只有管理員可以修改'\); return; \}/.test(src));
  ok('★★ 改名會在備註留痕（日後查帳找得到原因）',
     /const line=`\$\{ymd\(TODAY\)\} 姓名由「\$\{old\|\|'（空白）'\}」改為「\$\{nv\}」（管理員修改）`;/.test(src));
  ok('★ 空白擋下、沒改就不寫',
     /if\(!nv\)\{ showToast\('請輸入姓名'\); return; \}/.test(src)
     && /if\(old===nv\)\{ closeModal\(\); return; \}/.test(src));
  ok('　　視窗先講清楚「只改顯示用的姓名」',
     /改的只是顯示用的姓名 —— 登入帳號（電話）、票券、預約、合約都不受影響。/.test(src));
  ok('　　防連點', /async function doEditName\(\)\{ return onceAct\('pname:'\+PP\.id, \(\)=>_doEditName\(\)\); \}/.test(src));
}

console.log('\n④ 上課提醒發給「上課的人」');
{
  const fnPath=process.env.HOME+'/Projects/yugym-booking-system-app/docs/edge/line-push-daily.ts';
  ok('★ edge function 原始碼有進版控', fs.existsSync(fnPath));
  const ts=fs.readFileSync(fnPath,'utf8');
  ok('★★ 抓得到使用人（bookings 多帶 trial_name）',
     /member_ids,ticket_id,trial_name'\)/.test(ts));
  ok('★★ 找得出這張票可以給誰用（持有人＋共享者）',
     /const tkOwners: Record<string, string\[\]> = \{\}/.test(ts)
     && /await admin\.from\('member_tickets'\)\.select\('id,member_id,shared_with'\)/.test(ts));
  ok('★★ trial_name 對得上共享名單裡的真實會員 → 推給那一位',
     /const attendeeOf = \(b: any\): string \| null => \{/.test(ts)
     && /if \(m && String\(m\.name \|\| ''\)\.trim\(\) === nm\) return cand/.test(ts));
  ok('★★ 對不上（「爸爸」「媽媽」）→ 維持發給帳號本人',
     /對不上（「爸爸」「媽媽」這種家庭稱呼）→ 維持發給帳號本人，/.test(ts));
  ok('★ 單人課改推 attendee，團課的名額清單照舊',
     /const att = attendeeOf\(b\)/.test(ts)
     && /if \(Array\.isArray\(b\.member_ids\)\) for \(const m of b\.member_ids\) if \(m && !seen\.has\(m\)\) \{ seen\.add\(m\); ids\.push\(m\) \}/.test(ts));
  ok('★ 回報裡看得到「改推給上課的人」有幾筆（之後對得起來）',
     /redirected_to_attendee: redirected/.test(ts));
  ok('★ 收款提醒仍只看教練課的票（ptTkIds），沒有被共享票的查詢污染',
     /const ptTkIds = new Set<string>\(\)    \/\/ 收款提醒只看教練課/.test(ts)
     && /if \(ptTkIds\.size\) \{/.test(ts));
  ok('　　使用者的原話寫在原地',
     /「line 通知上課應該是通知上課的會員，而不是通知擁有票券的\s*\n\s*會員，如果是票券共享」「自主訓練也是發給上課的會員而不是票券本人」/.test(ts));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
