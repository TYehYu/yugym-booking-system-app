/* 教練手機行事曆（coachCalV2）切換日期/週時重複抓 ticket_types／member_tickets（2026-11-08）

   背景：Mango 回報切換日期/週時桌機與手機都可能黑畫面，iPhone Safari 顯示
   「網頁重複發生問題」（iOS 記憶體被撐爆的典型訊息）。追出 coachCalV2() 原本
   每次切換（admCalPick → navTo → coachCalV2 整頁重跑）都會重新 await 一次
   dbGetAll('ticket_types')／dbGetAll('member_tickets')，純日期導覽用不到更新的
   票券資料，這兩輪 await（含 tableSigs 簽章 RPC＋整份陣列 .slice() 複製）完全多餘。

   修法：套用桌機 renderCalendar 已經在用的「stepping 快取窗口」同一招
   （window._calDataCache，120000ms）——這裡用 window._mtCacheAt 記錄上次真正
   抓到資料的時間，_calStepping 且在 120 秒窗口內就直接沿用 window._ttCache／
   window._allTkCache，不呼叫 dbGetAll；窗口外或非 stepping（例如從別頁真正
   切換進來）一律照舊整段 await。

   2026-11-08 複查追加兩個修正（審查意見：票券異動後是否正確失效／連續切換會不會
   舊請求蓋掉新畫面／離開重進是否正常）：
     a) 手機路徑原本從沒清過 window._calStepping——PAGES.coach_calendar 手機分支
        一進來就 return coachCalV2()，從沒走到桌機那條「先讀值、立刻清掉」
        （約67672行），_calStepping 一旦被 admCalPick 設成 true 就永遠停在 true。
        這個洞原本沒人讀過這個旗標所以沒有後果，但這次改用它判斷「是不是單純
        翻頁」就會被卡死──離開行事曆、過一陣子真正重新進入，也會被誤判成
        「還在翻頁」而沿用舊資料。修法：coachCalV2 進來第一件事就比照桌機
        同一招「讀值＋立刻清掉」，只有「這次呼叫真的是從 admCalPick 翻頁觸發」
        才會讀到 true。
     b) 連點「上一週/下一週」會讓兩個 coachCalV2() 並行，較慢的舊呼叫若晚收尾，
        會把新畫面的 C.innerHTML 蓋掉——navTo 外層既有的「切頁重入保護」
        （window._navSeqNo）只擋得到它自己的收尾步驟，擋不到 coachCalV2 這種
        自己直接寫 C.innerHTML 的頁面函式本體。修法：進函式時記下
        window._navSeqNo，寫 C.innerHTML 前再比對一次，序號被更新的呼叫蓋過
        就直接放棄這次渲染。

   這支測試用 grabFn 逐字抽出真正的 coachCalV2 原始碼去跑（不是重寫一份），
   模擬 dbGetAll 計次與並行呼叫，驗證：
     ① 連續快速切換時查詢次數確實下降（只有首次兩次）
     ② 超過 120 秒視窗會重新查詢
     ③ 非 stepping（真正重新進入）永遠正常查詢，不會被快取卡住
     ④ 視窗到期後票券異動能夠被抓到最新值（不會卡死在舊資料）
     ⑤ 離開行事曆、_calStepping 已被清掉後重新進入，即使還在 120 秒窗口內也要
        正常重新取得資料（不能只靠時間視窗碰運氣擋住）
     ⑥ 連續快速切換（模擬連點）時，較慢的舊呼叫不能蓋掉較快的新呼叫畫面 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

function grabFn(name) {
  const i = src.indexOf('async function ' + name + '(') >= 0 ? src.indexOf('async function ' + name + '(') : src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const SRC_coachCalV2 = grabFn('coachCalV2');

ok('★★★ 修法用同一套「stepping + 120 秒窗口」機制（跟桌機 renderCalendar 同招）',
  /_mtFresh\s*=\s*window\._allTkCache\s*&&\s*window\._ttCache\s*&&\s*window\._mtCacheAt!=null\s*\n\s*&&\s*\(Date\.now\(\)-window\._mtCacheAt<120000\)\s*&&\s*_stepping;/.test(SRC_coachCalV2));
ok('★ _mtCacheAt 用 !=null 判斷，不是單純 truthy（Date.now() 理論上不會是 0，但判斷式本身要經得起邊界值）',
  /window\._mtCacheAt!=null/.test(SRC_coachCalV2));
ok('★★★ 進函式第一件事就讀值＋清掉 window._calStepping（比照桌機 PAGES.coach_calendar 同一招）',
  /async function coachCalV2\(\)\{\s*\n\s*_calDiag\('coachCalV2:enter'\);[\s\S]{0,600}const _stepping=!!window\._calStepping; window\._calStepping=false;/.test(SRC_coachCalV2));
ok('★★★ 記下 window._navSeqNo 當作本次呼叫序號（連點保護用）',
  /const _mySeq=window\._navSeqNo;/.test(SRC_coachCalV2));
ok('★★ 週檢視寫 C.innerHTML 前會比對序號，序號不符就放棄這次渲染',
  /if\(_mySeq!==window\._navSeqNo\)\{ _calDiag\('coachCalV2:stale-skip-multi'\); return; \}\s*\n\s*C\.innerHTML=`<div class="cag-wrap"/.test(SRC_coachCalV2));
ok('★★ 日檢視進入前也有同一道序號檢查', /if\(_mySeq!==window\._navSeqNo\)\{ _calDiag\('coachCalV2:stale-skip-agenda-pre'\); return; \}/.test(SRC_coachCalV2));
ok('★★ 窗口內直接沿用，不呼叫 dbGetAll（沒有背景補抓，跟桌機一樣簡單）',
  (() => {
    const i = SRC_coachCalV2.indexOf('if(_mtFresh){');
    const j = SRC_coachCalV2.indexOf('}else{', i);
    const block = SRC_coachCalV2.slice(i, j);
    return /_calDiag\('coachCalV2:ticketCache-reused'/.test(block) && !/dbGetAll\(/.test(block);
  })());
ok('★★ 窗口外／非 stepping 仍是原本的 await 正常抓取', /\}else\{\s*\n\s*_t0=performance\.now\(\);\s*\n\s*try\{ window\._ttCache=await dbGetAll\('ticket_types'\)/.test(SRC_coachCalV2));
ok('★ 每次真正抓取都更新 window._mtCacheAt（下次才量得出經過幾秒）', /window\._mtCacheAt=Date\.now\(\);/.test(SRC_coachCalV2));

function buildEnv(now, calls, behavior, opts) {
  opts = opts || {};
  const env = {
    _calDiag: () => {},
    startCalPoll: () => {},
    SESSION: { id: 'c-test' },
    dbGet: async (table, id) => ({ id }),
    dbGetAll: async (table) => {
      calls.push({ table, t: now() });
      if (opts.delayMember && table === 'member_tickets') await opts.delayMember();
      return behavior[table] ? behavior[table]() : [];
    },
    performance: { now: () => now() },
    Date: { now: () => now() },   // 修法用 Date.now() 量「上次抓取距今多久」，測試的模擬時鐘也要蓋掉這個全域參照，不然永遠量到真實毫秒（幾乎是0），120秒視窗測不出來
    ymd: () => '2026-11-08',
    TODAY: new Date('2026-11-08'),
    admCalHeaderHTML: async () => '<hdr/>',
    admCalMultiHTML: async () => `<multi date="${env.window._cagSelDate || ''}"/>`,
    renderCoachAgenda: async () => {},
    cagPositionWrap: () => {},
    C: { innerHTML: '' },
    window: { _navSeqNo: 0 },
  };
  return env;
}
function makeFn(env) {
  const names = Object.keys(env);
  return new Function(...names, SRC_coachCalV2 + '\nreturn coachCalV2;')(...names.map(k => env[k]));
}

(async () => {
  console.log('\n① 連續快速切換 5 次（間隔 1 秒，遠小於 120 秒窗口）');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    const env = buildEnv(now, calls, { ticket_types: () => [{ id: 't1' }], member_tickets: () => [{ id: 'm1' }] });
    const fn = makeFn(env);
    for (const step of [{ t: 0, stepping: false }, { t: 1000, stepping: true }, { t: 2000, stepping: true }, { t: 3000, stepping: true }, { t: 4000, stepping: true }]) {
      clock = step.t; env.window._admCalDays = 7; env.window._calStepping = step.stepping;
      await fn();
    }
    ok('★★★ 5 次切換只有首次真正查詢（2 次，不是 10 次）', calls.length === 2, calls);
  }

  console.log('\n② 超過 120 秒視窗應重新查詢');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    const env = buildEnv(now, calls, { ticket_types: () => [{ id: 't1' }], member_tickets: () => [{ id: 'm1' }] });
    const fn = makeFn(env);
    for (const step of [{ t: 0, stepping: false }, { t: 1000, stepping: true }, { t: 200000, stepping: true }]) {
      clock = step.t; env.window._admCalDays = 7; env.window._calStepping = step.stepping;
      await fn();
    }
    ok('★★ 超過窗口那一次有重新查詢（共 4 次：首次 2 次＋過期後 2 次）', calls.length === 4, calls);
  }

  console.log('\n③ 非 stepping（真正重新進入）永遠正常查詢');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    const env = buildEnv(now, calls, { ticket_types: () => [{ id: 't1' }], member_tickets: () => [{ id: 'm1' }] });
    const fn = makeFn(env);
    for (const step of [{ t: 0, stepping: false }, { t: 1000, stepping: false }]) {
      clock = step.t; env.window._admCalDays = 7; env.window._calStepping = step.stepping;
      await fn();
    }
    ok('★★ 兩次都不是 stepping，各自正常查詢（共 4 次）', calls.length === 4, calls);
  }

  console.log('\n④ 視窗到期後，票券異動要能抓到最新值（不會卡死在舊資料）');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    let afterChange = false;
    const behavior = {
      ticket_types: () => [{ id: 't1' }],
      member_tickets: () => afterChange ? [{ id: 'm1', sessions_remaining: 4 }] : [{ id: 'm1', sessions_remaining: 5 }],
    };
    const env = buildEnv(now, calls, behavior);
    const fn = makeFn(env);
    env.window._admCalDays = 7;
    clock = 0; env.window._calStepping = false; await fn();
    const first = JSON.stringify(env.window._allTkCache);
    afterChange = true;
    clock = 5000; env.window._calStepping = true; await fn();
    const within = JSON.stringify(env.window._allTkCache);
    clock = 130000; env.window._calStepping = true; await fn();
    const after = JSON.stringify(env.window._allTkCache);
    ok('★★★ 窗口內（5 秒後）沿用舊值，不會因為切換就立刻看到別的資料', within === first, { first, within });
    ok('★★★ 窗口到期（130 秒後）確實抓到異動後的新值', after === JSON.stringify([{ id: 'm1', sessions_remaining: 4 }]), { after });
  }

  console.log('\n⑤ 離開行事曆後重新進入（_calStepping 已被清掉），即使還在 120 秒窗口內也要正常重抓');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    const env = buildEnv(now, calls, { ticket_types: () => [{ id: 't1' }], member_tickets: () => [{ id: 'm1' }] });
    const fn = makeFn(env);
    env.window._admCalDays = 7;
    // 第一次：真正進入（admCalPick 之前，非 stepping）
    clock = 0; env.window._calStepping = false; await fn();
    // 第二次：admCalPick 觸發的翻頁（stepping=true），應沿用快取
    clock = 1000; env.window._calStepping = true; await fn();
    const afterStep = calls.length;
    // 第三次：模擬「離開行事曆去別頁、再點回來」——這一步刻意不設 _calStepping，
    // 沿用 coachCalV2 上一次呼叫結束時留下的值（應該已經被自己清成 false）。
    clock = 2000; await fn();   // 注意：沒有設 env.window._calStepping = true
    ok('★★★ 翻頁那次沿用快取，沒有多查（afterStep 應該還是 2 次）', afterStep === 2, { afterStep });
    ok('★★★ 離開重進那次（_calStepping 已被清掉）即使在 120 秒窗口內也重新查詢了', calls.length === 4, calls);
  }

  console.log('\n⑥ 連點保護：較慢的舊呼叫不能蓋掉較快的新呼叫畫面');
  {
    let clock = 0; const now = () => clock;
    const calls = [];
    let resolveSlow;
    const slowGate = new Promise(r => { resolveSlow = r; });
    let mtCallCount = 0;
    const env = buildEnv(now, calls,
      { ticket_types: () => [{ id: 't1' }], member_tickets: () => [{ id: 'm1' }] },
      { delayMember: () => { mtCallCount++; return mtCallCount === 1 ? slowGate : Promise.resolve(); } });
    const fn = makeFn(env);
    env.window._admCalDays = 7;
    // 呼叫 A（模擬第一次點「下一週」，選到 2026-11-09）：navTo 會先把 _navSeqNo+1 才呼叫頁面函式。
    env.window._navSeqNo = 1;
    env.window._calStepping = false;   // 第一次，正常抓取，但 member_tickets 這次會卡住（slowGate）
    env.window._cagSelDate = '2026-11-09';
    const pA = fn();                   // 不 await，模擬使用者還沒等到 A 畫完就又點了一次
    // 呼叫 B（模擬緊接著又點一次「下一週」，選到 2026-11-16，navTo 再把序號 +1）：
    env.window._navSeqNo = 2;
    env.window._calStepping = false;
    env.window._cagSelDate = '2026-11-16';
    const pB = fn();
    await pB;                          // B 沒有被卡住，先畫完
    const afterB = env.C.innerHTML;
    resolveSlow();                     // 現在才放行 A 卡住的那次 dbGetAll
    await pA;                          // A 終於跑完
    const afterA = env.C.innerHTML;
    ok('★★★ B（較新、11/16 那次）先畫完，畫面顯示 11/16', /2026-11-16/.test(afterB), { afterB });
    ok('★★★ A（較舊、11/09 那次）較慢跑完之後，沒有把畫面蓋回 11/09（舊請求沒蓋掉新畫面）',
      afterA === afterB && !/2026-11-09/.test(afterA), { afterB, afterA });
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通過 / ' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試中止：', e.message, e.stack); process.exit(1); });
