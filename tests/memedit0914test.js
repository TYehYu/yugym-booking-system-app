/* 課卡動作鈕收成三顆＋「更改」二選一（2026-09-14 銀髮友善第三組）
   使用者：「三、課卡的動作列 副標題可以靠右」「也要檢查一下 如果在不同規格的手機頁面
   會不會造成段落問題」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 四顆併成三顆');
ok('★★★ 兩支課卡都只剩 簽到／更改／取消', (src.match(/<div class="mtp-orbs">\$\{ckBtn\}\$\{edBtn\}\$\{cxBtn\}<\/div>/g)||[]).length===2
   && !/\$\{rsBtn\}\$\{vnBtn\}/.test(src));
ok('★★★ 顯示條件一個字都沒放寬（與原本的改時間／場地相同）',
   /let edBtn=\(selfServe && _isSelfBk && b\.member_id===SESSION\.id\)/.test(src)
   && /let edBtn=\(!done && !past && bkIsSelf\(b\) && b\.member_id===SESSION\.id\)/.test(src));
ok('★★ 成因寫在原地（四顆會擠、「場地」對長輩是陌生詞）',
   /0911 加了「場地」之後變四顆/.test(src) && /「場地」對長輩是陌生詞/.test(src));

console.log('\n② 「更改」點開後的二選一');
const ASK=fnBody('memEditAsk');
ok('★★★ 兩列：更改時間／換器材，各自帶回原本那條路',
   /onclick="closeModal\(\);msbStart\('\$\{b\.id\}'\)">\s*\n?\s*<b>更改時間<\/b>/.test(ASK)
   && /onclick="closeModal\(\);memVenueOpen\('\$\{b\.id\}'\)">\s*\n?\s*<b>換器材<\/b>/.test(ASK));
ok('★★★ 副標靠右，而且寫出「目前是什麼」',
   /<span>目前是 \$\{memWhenText\(b\.date,b\.start_time\)\}<\/span>/.test(ASK)
   && /<span>目前是 \$\{escH\(unitTxt\|\|'—'\)\}<\/span>/.test(ASK)
   && /\.mcx-row span\{font-size:13px;color:var\(--t3\);text-align:right;/.test(src));
ok('★★ 跑步機要連人數一起寫（1 人也寫）', /selfVenueLabel\(b\)==='跑步機'\)\?`\$\{venueDisplay\(b\)\|\|'跑步機'\}・\$\{await bkUnitCount\(b\)\} 人`/.test(ASK));
ok('★★ 沿用取消視窗那套放大語彙（.mcx）', /<div class="mcx"><\/div><div class="modal-title">要更改什麼？<\/div>/.test(ASK));
ok('★★ 只帶路、不自己判規則（寫入仍在 msbStart／memVenueOpen）',
   /這支只負責帶路，真正的規則與寫入都還在原本那兩條路/.test(src)
   && !/fn_member_self_venue/.test(ASK));

console.log('\n③ 「場地」改叫「換器材」');
ok('★★★ 視窗標題改了', /<div class="modal-title">換器材<\/div>/.test(src) && !/<div class="modal-title">更改場地<\/div>/.test(src));

console.log('\n④ 不同規格手機不會折行（使用者特別交代）');
ok('★★★ 七格日期一律不折行', /#msb-sheet \.msb-date span,#msb-sheet \.msb-date b\{white-space:nowrap;\}/.test(src));
ok('★★★ 380／360 兩段各縮一階（沿用系統既有斷點，不自創）',
   /@media\(max-width:380px\)\{\s*\n\s*#msb-sheet \.msb-dates\{gap:3px;/.test(src)
   && /@media\(max-width:360px\)\{\s*\n\s*#msb-sheet \.msb-date b\{font-size:11\.5px;\}/.test(src));
ok('★★ 取消視窗的大字在窄機降一階、整句平衡換行',
   /\.mcx-when\{text-wrap:balance;\}/.test(src)
   && /@media\(max-width:360px\)\{ \.mcx-when\{font-size:19px;\} \.modal:has\(\.mcx\) \.modal-title\{font-size:20px;\} \}/.test(src));
ok('★★ 三顆圓鈕在 360px 也放得下（72×3＋gap 20×2＝256px）',
   /#mem-task-pop \.mtp-orbs\{display:flex;justify-content:center;gap:20px;\}/.test(src)
   && /#mem-task-pop \.mtp-orb\{width:72px;height:72px;/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
