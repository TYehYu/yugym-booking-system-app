/* 教練只能動自己的課卡（2026-08-22 使用者定案：不論桌機或手機；
   別人的課只能點開來看，不能進一步互動；店長以上不受限） */
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };

// ── 桌機行事曆：別人的課標成唯讀卡 ──
const vo=src.slice(src.indexOf('const _viewOnly = SESSION.role==='), src.indexOf('const _isCheckedIn'));
t('★★ 唯讀判斷直接問「這堂是不是我帶的」，不依賴 opts.me',
  /!\(typeof bkIsCoach==='function' \? bkIsCoach\(b, SESSION\.id\) : isMine\)/.test(vo)
  && !/opts\.me/.test(vo));
t('　（0821 把教練桌機的 opts.me 拿掉之後，舊寫法整條失效 —— 這是這次補的洞）',
  /把教練桌機行事曆的 opts\.me/.test(src));
t('★ 店長不受限', /!SESSION\.is_manager/.test(vo));
t('★ 代課的課算自己的（bkIsCoach 含 substitute_coach_id）',
  /function bkIsCoach\(/.test(src) && /substitute_coach_id/.test(src));

// ── 拖曳：唯讀卡拖不動 ──
t('★★ pointerdown 擋掉唯讀卡（不然拖得動別人的課改期）',
  /if\(ev\.classList\.contains\('cal-ev-view'\)\) return;/.test(src));
t('　CSS 也不給它 touch-action（觸控裝置一併擋）',
  /\.cal-drag-on \.cal-ev:not\(\.readonly\):not\(\.cal-ev-view\)\{touch-action:none;\}/.test(src));

// ── 點擊：點得開，但只到唯讀明細 ──
const ck=src.slice(src.indexOf('${opts.allMode || bkIsMasked(b) ?'), src.indexOf('${bkRenewBadge('));
/* 0822 二修（使用者）：「可以點開其他人的課卡 可以看簡易課卡的內容 但僅此而已」 */
t('★★ 唯讀卡照樣走 onEvClick（開簡易課卡，不是明細視窗）',
  /onclick="onEvClick\(event,'\$\{b\.id\}'\)"/.test(ck)
  && !/openBookingDetail/.test(ck));
t('★★ expandBkCard 不再把別人的課退回明細視窗',
  !/if\(!coachOwnsBk\(b\)\)\{ openBookingDetail\(id\); return; \}/.test(src));
t('★ 簡易課卡裡每一顆動作鈕都綁 staff／own／_editable／coachCk',
  /if\(\(!_ashMode \|\| !isGroup\) && canCancel && \(isGroup \? staff : own\)\)\{/.test(src)
  && /if\(!_ashMode && staff && !closed && b\.date>=ymd\(TODAY\)/.test(src)
  && /if\(staff && _editable && isGroup\)/.test(src)
  && /const coachCk = SESSION\.role==='coach' && own;/.test(src));
t('　全店模式與遮蔽卡仍然不可點', /opts\.allMode \|\| bkIsMasked\(b\) \? ''/.test(ck));

// ── 明細視窗內：所有修改元件對別人的課一律關閉 ──
t('★★ ownByCoach：教練只有自己的課為 true',
  /const ownByCoach = SESSION\.role!=='coach' \|\| !!SESSION\.is_manager \|\| bkIsCoach\(b,SESSION\.id\);/.test(src));
t('★ editable 綁 ownByCoach 與 _coachReadonly',
  /const editable=!window\._coachReadonly && !isMemberView && ownByCoach &&/.test(src));
t('★ 簽到（含團課逐名額）也綁自己的課',
  /const staffCanCheckin = SESSION\.role==='admin' \|\| SESSION\.role==='front_desk' \|\| !!SESSION\.is_manager\s*\n\s*\|\| \(SESSION\.role==='coach' && \(bkIsCoach\(b,SESSION\.id\)\)\);/.test(src)
  && /const groupCkOK = staffCanCheckin && !isMemberView && !window\._coachReadonly/.test(src));

// ── 手機：開卡前現算 _coachReadonly（兩個入口都要有）──
t('★★ 手機兩個入口都在開卡前算 _coachReadonly',
  (src.match(/try\{ window\._coachReadonly = !bkIsCoach\(b, SESSION\.id\); \}catch\(_\)\{ window\._coachReadonly=true; \}/g)||[]).length===2);
t('　簡易課卡的動作也吃 own（別人的課 own 為 false）',
  /const own = SESSION\.role!=='coach' \|\| !!SESSION\.is_manager \|\| bkIsCoach\(b,SESSION\.id\);/.test(src));

// ── 會員端：只能動自己的自主訓練與團課；團課只取消自己的名額 ──
/* 2026-08-24 使用者指示：會員端課卡改成簡易課卡（標題卡＋會員卡＋圓形按鈕）。
   ⚠ **規則一條都沒動**，只換呈現 —— 底下這幾條守的就是「規則沒被順手改掉」。 */
t('★★ 只有自主訓練能改時間', /\(selfServe && _isSelfBk && b\.member_id===SESSION\.id\)[\s\S]{0,140}改時間/.test(src));
t('★★ 團課的按鈕寫「取消名額」（不是整堂）',
  /st\.isGrp\?'取消名額':'取消'/.test(src));
t('★★ 不能自己動的課也給一顆「洽櫃檯」（0821 定案：留下訊息，不要一張空卡）',
  /orb\('off','✕','洽櫃檯'/.test(src)
  && /這類課程由櫃檯協助取消/.test(src));
t('★ 團課取消只退自己那一堂，整堂課照常開',
  /只取消您的名額，這堂課照常開課/.test(src));
t('★ 教練課只看得到簽到（沒有取消／改時間）',
  /const selfServe=\(!st\.done && !st\.past\) && \(st\.isGrp \|\| _isSelfBk\);/.test(src));
t('★ 會員端從來沒有「刪除整堂團課」或「改團課時間」的入口',
  !/memh2[A-Za-z]*\(['"]?deleteClass/.test(src));

// ── 資料庫層：會員動不到「後台開課的團課」（2026-08-22 使用者確認後補的洞）──
const mig=fs.existsSync(__dirname+'/../docs/migrations/20260822_cancel_booking_member_guard.sql')
  ? fs.readFileSync(__dirname+'/../docs/migrations/20260822_cancel_booking_member_guard.sql','utf8') : '';
t('★★ migration 存檔（fn_cancel_booking 的身分把關改 NULL-safe）',
  /b\.member_id is null or current_member_id\(\) is distinct from b\.member_id/.test(mig));
t('★ 成因寫清楚：<> 對 NULL 得到 NULL，if 不成立 → 團課整條靜默跳過',
  /得到的是 NULL，不是 true/.test(mig) && /整條把關被靜默跳過/.test(mig));
t('★ 影響範圍寫清楚（套用當下 57 堂空名單團課）', /57 堂符合/.test(mig));
t('★ 字串沒對上就 raise，不會靜靜地什麼都沒改', /raise exception '把關字串沒對上/.test(mig));
t('　舊資料的一列一人團課不受影響（member_id 有值，身分那道本來就過得了）',
  /member_id 有值的一列一人團課.*照舊放行|照舊放行/.test(mig));

// ── 2026-08-22 使用者逐格確認後定案（別再「順手收緊」）──
/* 「教練可以自己取消掛自己名字的待簽約沒問題　取消自己的體驗課 也沒問題」
   刪除的判斷是 (A.staff || (A.own && !A.isGroup))：
   ・待簽約與體驗課都不是團課 → own 成立就給，符合使用者定案
   ・改期／場地／代課對待簽約仍然關著（那條是刻意的，見 pending_contract 分支）
   ・團課仍然只有 staff 能整堂刪 */
t('★ 教練刪自己的課只排除團課（待簽約、體驗課照給）',
  /const _canDelBk = A\.canCancel && !A\.closed && \(A\.staff \|\| \(A\.own && !A\.isGroup\)\);/.test(src)
  && !/pending_contract[^\n]{0,80}_canDelBk/.test(src)
  && !/體驗[^\n]{0,40}_canDelBk/.test(src));
t('★ 待簽約仍然不給改期／場地／代課（與「可刪除」是兩件事）',
  /還沒收款的卡位談不上簽到、代課、場地/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
