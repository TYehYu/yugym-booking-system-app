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
t('★★ 唯讀卡點得開，但走 openBookingDetail（不是 onEvClick 那組圓鈕）',
  /_viewOnly \? `onclick="event\.stopPropagation\(\);openBookingDetail\('\$\{b\.id\}'\)"/.test(ck)
  && /: `onclick="onEvClick\(event,'\$\{b\.id\}'\)"`/.test(ck));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
