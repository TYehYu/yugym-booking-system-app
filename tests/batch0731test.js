/* 2026-07-31 這批（管理員手機版報表／教練唯讀課卡／團課明細排列）

   1) 管理員手機版「報表」打不開 —— PAGES.dashboard 用了 _tkLogs 卻沒宣告。
      這頁只有手機版底部導覽進得來（桌機管理員走 analytics），所以只有手機壞。
   2) 教練端的預約課卡「互動開啟，但不要圓形按鈕，只能看明細不能修改」。
   3) 團課預約明細排列：日期時間時長 → 教練 → 場地 → 名單 → 備註。 */
const fs=require('fs');
/* 2026-07-31：課種判斷抽成共用的 bkIsGroup／bkIsSelf／bkIsMassage（見 TK_POCKETS）——
   沙箱裡給等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const seg=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('管理員手機版報表打不開');
{
  const dash=seg('PAGES.dashboard=async function(){','\n};\n');
  ok('★ _tkLogs 有宣告了（原本整頁在 _grpDeduct 那裡拋 ReferenceError）',
     /let _tkLogs=\[\]; try\{ _tkLogs=await dbGetAll\('ticket_logs'\); \}catch\(_\)\{\}/.test(dash));
  ok('★ 宣告在用它之前', dash.indexOf('let _tkLogs=[]')>=0
     && dash.indexOf('let _tkLogs=[]') < dash.indexOf('(_tkLogs||[]).forEach'));
  ok('　　原因寫在程式裡（為什麼只有手機壞）', /這頁只有管理員手機版的「報表」進得來/.test(src));
  ok('　　手機底部導覽的「報表」確實指向這一頁', /\{key:'dashboard',  label:'報表', ic:'📊'\}/.test(src));
  ok('　　桌機管理員走的是另一頁（analytics），所以桌機一直沒事',
     /\{grp:'財務', label:'營運分析', page:'analytics'\}/.test(src));
  // 這頁沒有其他未宣告的區域變數（同一類錯誤的通用防線）
  const used=new Set(); const declared=new Set();
  for(const m of dash.matchAll(/(?:(?:const|let|var)\s+|,\s*)(_[A-Za-z][\w$]*)\s*=/g)) declared.add(m[1]);
  for(const m of dash.matchAll(/(?<![.\w$'"])(_[A-Za-z][\w$]*)/g)) used.add(m[1]);
  const globals=new Set(); const head=src.slice(0,src.indexOf('PAGES.dashboard='));
  for(const m of src.matchAll(/(?:^|\n)\s*(?:const|let|var|function)\s+(_[A-Za-z][\w$]*)/g)) globals.add(m[1]);
  const miss=[...used].filter(x=>!declared.has(x)&&!globals.has(x));
  ok('★ 這頁沒有其他「用了卻沒宣告」的區域變數', miss.length===0, miss);
}

console.log('\n教練端課卡：互動開啟，只能看明細');
ok('★ 桌機別人的課卡改標 cal-ev-view（不再 cal-ev-noint 整張不吃事件）',
   /const _viewOnly = SESSION\.role==='coach' && !SESSION\.is_manager && opts\.me && !isMine;/.test(src)
   && /\$\{_viewOnly\?' cal-ev-view':''\}/.test(src)
   && !/\$\{_noInt\?' cal-ev-noint':''\}/.test(src));
/* 2026-08-01 使用者指示定版：「非本人的課卡一樣正常顯示課卡內容，但要移除互動的功能，
   手機跟桌機都是」→ 0731 的「點得開唯讀明細」收回成純顯示。見 tests/coachviewtest.js。 */
ok('★ 別人的課卡完全不掛點擊（桌機）', /\$\{_viewOnly\?''/.test(src)
   && !/\$\{_viewOnly\?`onclick="openBookingDetail\('\$\{b\.id\}'\)"`/.test(src));
ok('★ 手機 agenda 同樣完全不掛點擊', /\$\{canClick\?'':' cag-view'\}/.test(src)
   && /\$\{canClick\?` onclick="wtlCardClick\('\$\{b\.id\}',this\)"`:''\}>/.test(src));
ok('★ 唯讀卡不能拖（互動放開後 pointer-events 回來了，不擋就拖得動別人的課改期）',
   /if\(ev\.classList\.contains\('cal-ev-view'\)\) return;/.test(src));
ok('★ 手動 tap 路徑（pointer capture 那條）也不彈圓形按鈕',
   (src.match(/&& !_card\.classList\.contains\('bk-masked'\) && !_card\.classList\.contains\('cal-ev-view'\)\)\{/g)||[]).length===1
   && /&& !el\.classList\.contains\('bk-masked'\) && !el\.classList\.contains\('cal-ev-view'\)\)\{/.test(src));
ok('★ 圓形按鈕面板本身：不是自己的課就改開明細（不再只跳 toast）',
   /if\(!coachOwnsBk\(b\)\)\{ openBookingDetail\(id\); return; \}/.test(src));
ok('★ 明細不再擋在門口（唯讀放行）',
   !/if\(b && !coachOwnsBk\(b\)\)\{ showToast\('這不是你的課，只能查看自己的課程明細'\); return; \}/.test(src));
ok('★ 但每個修改元件仍然關著：editable 綁 ownByCoach',
   /const editable=!window\._coachReadonly && !isMemberView && ownByCoach &&/.test(src));
ok('★ 取消預約鈕綁 ownByCoach', /\$\{canCancel&&ownByCoach\?\(isMemberView/.test(src));
ok('★ 簽到綁「自己主帶／代課」', /\|\| \(SESSION\.role==='coach' && \(bkIsCoach\(b,SESSION\.id\)\)\);/.test(src));
ok('★ 備註也只有自己的課能寫', /const can = !window\._coachReadonly && ownByCoach;/.test(src));
ok('　　純顯示卡：游標不再暗示可點，但仍不關 pointer-events（關了會攔手指、頁面滑不動）',
   /\.cal-ev\.cal-ev-view,\.cag-std\.cag-view\{cursor:default;\}/.test(src)
   && !/\.cag-std\.cag-view\{pointer-events:none/.test(src));
ok('　　原因寫在程式裡', /現在改成點得開「課程明細」，但不彈出那組圓形按鈕/.test(src));

console.log('\n團課明細排列：日期時間時長／教練／場地／名單／備註');
{
  const i=src.indexOf('    </div>`:((isGroupD||isTrialD)?`');
  const j=src.indexOf('</div>`:`\n    <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">',i);
  const g=src.slice(i,j);
  ok('★ 團課／體驗走自己一套版面（與其餘課種分開）', i>0 && j>i);
  const at=t=>g.indexOf(t);
  ok('★ 第一列＝日期・時間・時長', at('id="ed-date"')>0 && at('id="ed-dur"')>at('id="ed-date"'));
  ok('★ 第二列＝教練', at('>教練<')>at('id="ed-date"'));
  ok('★ 第三列＝場地', at('>場地<')>at('>教練<'));
  ok('★ 再來才是會員預約名單', at('${memberLine}')>at('>場地<'));
  const noteAt=src.indexOf('${bkNoteBlock(b, isMemberView, ownByCoach)}');
  ok('★ 備註在最後（整個版面之外、按鈕列之前）',
     noteAt>src.indexOf('${memberLine}')
     && noteAt<src.indexOf('<div class="modal-foot">', noteAt));
  ok('★ 下方的「調整時間」區塊對團課不再重複輸出（同樣的 ed-date/ed-time id 會撞）',
     /\$\{\(isPersonalPT\|\|isGroupD\|\|isTrialD\)\?'':\(editable\?/.test(src));
  ok('　　ed-date/ed-time/ed-dur 在團課明細裡各只出現一次',
     (g.match(/id="ed-date"/g)||[]).length===1 && (g.match(/id="ed-time"/g)||[]).length===1
     && (g.match(/id="ed-dur"/g)||[]).length===1);
  ok('　　代課下拉還在（團課也會換教練）', /id="ed-subcoach"/.test(g));
  ok('　　更換場地鈕還在', /openVenueChange\('\$\{b\.id\}'\)/.test(g));
  ok('　　原因寫在程式裡', /原本是「名單在最上面、時間掉到最下方那塊調整區」/.test(src));
}

console.log('\n體驗明細（2026-07-31 使用者指示）');
ok('★ 日期時間時長收斂成一列（與團課共用同一套版面）',
   /<\/div>`:\(\(isGroupD\|\|isTrialD\)\?`/.test(src));
ok('★ 下方那塊「調整時間」不再對體驗重複輸出',
   /\$\{\(isPersonalPT\|\|isGroupD\|\|isTrialD\)\?'':\(editable\?/.test(src));
ok('★ 場地只留一個（原本上面一列、下面又一塊）',
   /\$\{\(!isPersonalPT&&!isGroupD&&!isTrialD&&!isMemberView\)\?`<div style="margin-top:10px;/.test(src));
ok('　　體驗保留「類型」那一行（團課不需要，看名單就知道）',
   /\$\{isTrialD\?`<div><span style="color:var\(--t2\);">類型<\/span>/.test(src));
ok('　　原因寫在程式裡', /場地只留一個 —— 原本上面一列、下面那塊又一個，同樣的資訊講兩次/.test(src));

console.log('\n團課名單：同一人兩個名額，兩個都畫圓形卡');
ok('★ 不再只畫第一列', /const st = _gTk\[mid\];/.test(src) && !/seatNo\(sk\)===1 \? _gTk/.test(src));
ok('　　原因寫在程式裡', /同一個會員約了兩個名額，兩個名額都要顯示圓形卡/.test(src));

console.log('\n會員票券：已過期方案獨立成一區（2026-07-31 使用者指示）');
/* 2026-07-31 二修：三區的判定搬進票券夾（buildWallet 的 state），畫面只負責問 */
ok('★ 過期票不再和「用完的」混在歷史紀錄裡',
   /const act=WAL\.active\(tab\)\.map\(s=>s\.t\);/.test(src)
   && /const expd=WAL\.expired\(tab\)\.map\(s=>s\.t\);/.test(src)
   && /const hist=WAL\.history\(tab\)\.map\(s=>s\.t\);/.test(src)
   && /else if\(t\.expire_date && String\(t\.expire_date\)\.slice\(0,10\)<today\) state='expired';/.test(src));
ok('★ 兩區各自有標題與筆數', /<summary>已過期方案（\$\{expd\.length\}）/.test(src)
   && /<summary>歷史紀錄（\$\{hist\.length\}）<\/summary>/.test(src));
ok('★ 已過期方案排在歷史紀錄前面', /\$\{expdSec\}\$\{histSec\}<\/div>/.test(src));
ok('★ 展延按鈕跟著搬到已過期方案那一區（展延只對過期票有意義）',
   /const _extable=expd\.filter\(t=>isDeskLike\(\)&&tkCanExtend\(t,_tYmd\)\);/.test(src));
ok('　　有可展延的票時預設展開', /<details class="pp-hist"\$\{_extable\.length\?' open':''\}><summary>已過期方案/.test(src));
ok('　　「目前沒有可用票券」要把兩區都算進去', /\$\{!act\.length&&\(hist\.length\|\|expd\.length\)\?/.test(src));
ok('★ 教練端簡易名片同一套語意：過期就歸已過期，不看剩不剩堂數',
   /const _isExpiredTk=t=>\(\(WAL\.of\(t\.id\)\|\|\{\}\)\.state\)==='expired';/.test(src)
   && /const _canReactTk=t=>_isExpiredTk\(t\)&&\(Number\(t\.sessions_remaining\)\|\|0\)>0;/.test(src));
ok('★ 「重新啟用」仍只給還有剩餘堂數的票（用完的沒東西可啟用）',
   /expired\.map\(t=>renderTkCard\(t,\(_canReact&&_canReactTk\(t\)\)\?/.test(src));
ok('　　標題改成「已過期方案」', /<div class="md-tk-subhead">已過期方案<\/div>/.test(src));
ok('　　原因寫在程式裡', /限定方案這種有效期的票就找不到了/.test(src)
   && /否則限定方案這種有效期的票會掉進歷史摺疊區找不到（2026-07-31）/.test(src));

console.log('\n手機行事曆：待簽約的課要看得到名字（2026-07-31 使用者回報）');
/* 2026-07-31 重構：名稱與標籤改走共用的 bkName／bkTag（見 bkviewtest.js） */
{
  const i=src.indexOf('    let disp, dispTag=\'\';');
  const blk=src.slice(i, src.indexOf('\n    /* 卡片視覺改桌機版標準卡', i));
  ok('★ 非團課一律走共用層（體驗／待簽約／場租／待繳費都涵蓋）',
     /else \{ disp=bkName\(b,id=>memMap\[id\]\); dispTag=bkTag\(b\); if\(disp==='—'\) disp='課程'; \}/.test(blk));
  ok('★ 團課主行仍是人數（各畫面不同，維持各自處理）', /disp=n>0\?`團 \$\{n\}`:'團體課';/.test(blk));
  ok('　　沒有人的自主訓練仍顯示「自主訓練」', /bkIsSelf\(b\) && !b\.member_id && !b\.trial_name/.test(blk));
  ok('★ 標籤畫成第二列，與桌機一致', /\$\{dispTag\?`<span class="evc-sub">\$\{dispTag\}<\/span>`:''\}/.test(src));
}

console.log('\n課卡：體驗／待簽約另起一列放在姓名下面（2026-07-31 使用者指示）');
{
  const i=src.indexOf('      let memName;');
  const blk=src.slice(i, src.indexOf('const _stdTag', i)+400);
  ok('★ 純姓名與標籤分開存（memName 仍是含括號的完整字串，Hover 提示照舊）',
     /let _nameBase=null, _nameTag='';/.test(blk));
/* 2026-07-31 重構：姓名與標籤改走共用的 bkName／bkTag／bkNameFull（見 bkviewtest.js） */
  ok('★ 體驗／待簽約／待繳費／場租都走同一支',
     (blk.match(/_nameBase=bkName\(b,id=>memMap\[id\]\); _nameTag=bkTag\(b\); memName=bkNameFull\(b,id=>memMap\[id\]\);/g)||[]).length===4);
/* 2026-08-01：人數改用共用的 grpHeadLabel（有人請假就標「會來的/報名的」） */
  ok('★ 標準卡主行只放純姓名',
     /const _stdName = hideMember \? typeName : \(_grpCard \? \(gHeadsN>0\?grpHeadLabel\(b\):'團課'\) : \(_nameBase\|\|memName\)\);/.test(src));
  ok('★ 標籤畫成姓名下面那一列',
     /const _stdTag = \(!hideMember && !_grpCard && _nameTag\) \? `<span class="evc-sub">\$\{_nameTag\}<\/span>` : '';/.test(src)
     && /<span class="evc-name">\$\{_stdName\}<\/span>\$\{_stdTag\}/.test(src));
  ok('　　遮蔽卡與團課卡不掛（那兩種主行不是姓名）',
     /!hideMember && !_grpCard && _nameTag/.test(src));
  ok('　　小字樣式有定義，窄卡再縮一級',
     /\.cal-ev\.cal-ev-std \.evc-sub\{font-size:9\.5px;/.test(src)
     && /\.cal-ev\.cal-ev-std\.cal-ev-7d \.evc-sub,\.cal-ev\.cal-ev-std\.ev-w-tiny \.evc-sub\{font-size:9px;\}/.test(src));
  ok('　　原因寫在程式裡', /原本是接在名字後面（「程凱郁（體驗）」），窄卡會折行把名字擠掉/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
