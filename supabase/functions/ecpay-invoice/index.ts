/* 綠界電子發票（B2C）—— Supabase Edge Function
   2026-09-02 建立。使用者定案：不串金流、只串發票；POS 不用（不要兩套帳）。

   ⚠ 為什麼一定要放後端：index.html 是 GitHub Pages 上的公開檔案，
     任何人按「檢視原始碼」都看得到。HashKey／HashIV 等於「用你的統編開發票」
     的權限，只能存在 Supabase 的 secrets 裡。前端只呼叫這一支。

   ⚠ 這份是**線上那一支的副本**（2026-10-20 建）。Edge Function 的版本會漂
     （見 yugym-edge-deploy-drift）—— 改之前一定要先抓線上原始碼比對，
     不要假設這個檔就是線上跑的那一版。

   金鑰（supabase secrets）：
     ECPAY_MID / ECPAY_HASHKEY / ECPAY_HASHIV / ECPAY_ENV（stage 預設、prod 正式）
     字軌通知還用到 LINE_CHANNEL_ACCESS_TOKEN 與 SERVICE_ROLE_KEY。

   綠界 API 的加密：JSON → URLEncode(.NET 風格) → AES-128-CBC/PKCS7 → Base64
   回應反過來：Base64 → AES 解密 → URLDecode → JSON
   ⚠ URLEncode 要模仿 .NET 的 HttpUtility.UrlEncode：
     ・空白是 `+`（不是 %20）・十六進位小寫（%e4 不是 %E4）・不編碼 - _ . ! * ( )
     這幾條只要錯一條，綠界就會回「解密失敗」而且訊息很不明確。 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENV   = Deno.env.get('ECPAY_ENV') || 'stage';
/* 測試環境的預設值＝綠界官方公開給所有開發者的共用測試帳號（文件上就有，不是誰的祕密）。
   ⚠ 只在 stage 生效；ECPAY_ENV=prod 時一定要自己設 secrets，設不齊就直接擋下來，
     不會偷偷用測試帳號去開正式發票。 */
const STAGE_MID = '2000132', STAGE_KEY = 'ejCk326UnaZWKisg', STAGE_IV = 'q9jcZX8Ib9LM8wYk';
const _def = (v: string | undefined, d: string) => v || (ENV === 'prod' ? '' : d);
const MID  = _def(Deno.env.get('ECPAY_MID'),     STAGE_MID);
const HKEY = _def(Deno.env.get('ECPAY_HASHKEY'), STAGE_KEY);
const HIV  = _def(Deno.env.get('ECPAY_HASHIV'),  STAGE_IV);
const BASE = ENV === 'prod'
  ? 'https://einvoice.ecpay.com.tw/B2CInvoice'
  : 'https://einvoice-stage.ecpay.com.tw/B2CInvoice';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* .NET HttpUtility.UrlEncode 相容編碼（見檔頭的三條規則） */
const SAFE = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!*()'.split(''));
function netUrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (b < 128 && SAFE.has(ch)) out += ch;
    else if (ch === ' ') out += '+';
    else out += '%' + b.toString(16).padStart(2, '0');
  }
  return out;
}
function netUrlDecode(s: string): string {
  const t = s.replace(/\+/g, ' ');
  const bytes: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '%' && i + 2 < t.length) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(t.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

async function aesKey() {
  return await crypto.subtle.importKey('raw', new TextEncoder().encode(HKEY),
    { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}
async function encData(obj: unknown): Promise<string> {
  const plain = netUrlEncode(JSON.stringify(obj));
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(HIV) },
    await aesKey(), new TextEncoder().encode(plain));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
async function decData(b64: string): Promise<any> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(HIV) }, await aesKey(), raw);
  return JSON.parse(netUrlDecode(new TextDecoder().decode(new Uint8Array(buf))));
}

async function callEcpay(path: string, data: Record<string, unknown>) {
  /* ⚠ Timestamp 只有 10 分鐘有效。Unix 秒與時區無關，綠界文件寫「GMT+8」
     指的是他們那端的判讀，不是要我們加 8 小時。 */
  const body = {
    MerchantID: MID,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: await encData({ MerchantID: MID, ...data }),
  };
  const r = await fetch(BASE + '/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  /* TransCode 是「這包有沒有被綠界收下」，RtnCode 才是「這張發票成不成立」——
     兩個都要看，只看一個會把「收下了但開立失敗」當成成功。 */
  if (Number(j.TransCode) !== 1) {
    return { ok: false, stage: 'transport', code: j.TransCode, msg: j.TransMsg || '綠界未受理', raw: j };
  }
  const d = await decData(j.Data);
  return { ok: Number(d.RtnCode) === 1, stage: 'invoice', code: d.RtnCode, msg: d.RtnMsg, data: d };
}

/* ══ 字軌自動同步（2026-10-10 使用者：「每兩個月我要上傳號碼　這個有辦法自動化嗎」）══
   流程就是人工在綠界後台做的那三步，改成程式做：
     ① GetGovInvoiceWordSetting  財政部這一年配給本統編哪幾段號碼
     ② AddInvoiceWordSetting     把還沒建的那幾段建進綠界（回傳 TrackID）
     ③ UpdateInvoiceWordStatus   把它設成啟用（InvoiceStatus=2）
   10/10 查過：財政部配號查得到（取號時有授權給綠界），所以②③才有意義。

   ⚠ 2026-10-10 使用者：「使用 FS 的這個系統在 9 月底就結束合作了　之後可以把所有的
     配號都給綠界」—— 原本只同步 FX（FS 是舊系統在用的），現在改成**財政部配什麼就建什麼**。
     白名單留 null 代表全部；要再限縮就改這一行，不要讓前端傳進來 ——
     字軌是稅務的東西，不給外面決定。

   ⚠ WORD_SKIP 是**唯一的例外清單**，格式 `民國年/期別/字軌`：
     115/5/FS（115 年 9-10 月的 FS）＝舊系統在 9 月用掉過一部分號碼，
     綠界這邊不知道用到哪裡，建進去會從頭開始發 → 重號。
     那一段的空白發票由使用者自己在財政部平台處理，不走這支。
     11-12 月起沒有這個問題（舊系統已經結束合作，整段都是乾淨的）。 */
const WORD_HEADERS: string[] | null = null;
const WORD_SKIP = ['115/5/FS'];
/* 取清單：綠界這兩支都包在 InvoiceInfo 裡，但留退路免得哪天改名 */
function wordList(r: any): any[] {
  const d = (r && r.data) || {};
  const a = d.InvoiceInfo || d.InvoiceWordSetting || [];
  return Array.isArray(a) ? a : [];
}
/* 已經建過了沒？用「同字軌＋同期別＋號碼區間有重疊」判斷，不是比對頭尾一模一樣——
   綠界那邊可能被人工拆成兩段建，比全等會重建一次變成重號。 */
function wordCovered(g: any, mine: any[]): boolean {
  const gs = Number(g.InvoiceStart), ge = Number(g.InvoiceEnd);
  return mine.some(m => String(m.InvoiceHeader) === String(g.InvoiceHeader)
    && Number(m.InvoiceTerm) === Number(g.InvoiceTerm)
    && Number(m.InvoiceStart) <= ge && gs <= Number(m.InvoiceEnd));
}
/* 這一年的字軌清單（啟用狀態也在裡面）。UseStatus 2＝啟用。 */
async function wordMine(roc: string) {
  const r = await callEcpay('GetInvoiceWordSetting',
    { InvoiceYear: roc, InvoiceTerm: 0, UseStatus: 0, InvoiceCategory: 1 });
  return wordList(r);
}
/* ══ 寫完回查（2026-10-20 使用者收到假警報）═══════════════════════════════
   10/19 那次：UpdateInvoiceWordStatus 回「資料檢查有誤」，但綠界那邊
   TrackID 471787 其實已經是 UseStatus=2。只信 API 的回覆，就在半夜發了一封
   「字軌建立失敗，發票可能開不出來」給人在國外的老闆 —— 而且什麼事都沒有。
   ⚠ 這支的事實來源是**查出來的狀態**，不是 API 說成功還是失敗。
     兩個方向都要防：說失敗其實成功（假警報）、說成功其實沒生效（更糟）。 */
async function wordActive(roc: string, trackId: string): Promise<boolean> {
  try {
    return (await wordMine(roc)).some(m =>
      String(m.TrackID) === String(trackId) && Number(m.UseStatus) === 2);
  } catch { return false; }
}
/* 只管「現在以後」的期別：過去那幾期沒啟用是正常的（用完就停掉）。 */
function termFloor(roc: string): number {
  const d = tpeNow();
  const curRoc = d.getUTCFullYear() - 1911, curTerm = Math.ceil((d.getUTCMonth() + 1) / 2);
  if (Number(roc) < curRoc) return 99;
  if (Number(roc) > curRoc) return 1;
  return curTerm;
}
async function syncWordsYear(roc: string, dryRun: boolean) {
  const gov = await callEcpay('GetGovInvoiceWordSetting', { InvoiceYear: roc });
  if (!gov.ok) return { year: roc, ok: false, msg: gov.msg || '查不到財政部配號', plan: [], done: [], stale: [], mine: [] };
  const mine = await wordMine(roc);
  const plan = wordList(gov)
    .filter(g => !WORD_HEADERS || WORD_HEADERS.includes(String(g.InvoiceHeader || '')))
    .filter(g => !WORD_SKIP.includes(`${roc}/${Number(g.InvoiceTerm)}/${g.InvoiceHeader}`))
    .filter(g => !wordCovered(g, mine))
    .map(g => ({
      InvoiceYear: roc, InvoiceTerm: Number(g.InvoiceTerm),
      InvType: String(g.InvType || '07'), InvoiceHeader: String(g.InvoiceHeader),
      InvoiceStart: String(g.InvoiceStart), InvoiceEnd: String(g.InvoiceEnd),
    }));
  /* ══ 建立了卻沒啟用的（2026-10-20）══════════════════════════════════════
     wordCovered 會把「綠界已經有這一段」整段濾掉 —— 所以一旦建立成功、啟用失敗，
     隔天的同步**不會再碰它**：不重試、也不通知，要等到該期第一天開發票才會發現。
     ⚠ 不自動幫它啟用：有可能是人在綠界後台刻意停用的（例如 115/5 的 FS）。
       列出來讓人決定，比偷偷改掉安全。 */
  const floor = termFloor(roc);
  const stale = mine
    .filter(m => Number(m.UseStatus) !== 2)
    .filter(m => Number(m.InvoiceTerm) >= floor)
    .filter(m => !WORD_SKIP.includes(`${roc}/${Number(m.InvoiceTerm)}/${m.InvoiceHeader}`))
    .map(m => ({ InvoiceYear: roc, InvoiceTerm: Number(m.InvoiceTerm),
      InvoiceHeader: String(m.InvoiceHeader), InvoiceStart: String(m.InvoiceStart),
      InvoiceEnd: String(m.InvoiceEnd), trackId: String(m.TrackID || ''),
      useStatus: Number(m.UseStatus) }));
  if (dryRun) return { year: roc, ok: true, plan, done: [], stale, have: mine.length, mine };
  const done: any[] = [];
  for (const p of plan) {
    const add = await callEcpay('AddInvoiceWordSetting', { ...p, InvoiceCategory: '1' });
    if (!add.ok) { done.push({ ...p, ok: false, step: 'add', msg: add.msg || ('代碼 ' + add.code) }); continue; }
    const trackId = String((add.data && add.data.TrackID) || '');
    if (!trackId) { done.push({ ...p, ok: false, step: 'add', msg: '綠界沒有回 TrackID' }); continue; }
    /* 啟用一定要分開做：AddInvoiceWordSetting 建出來預設是停用，不啟用等於沒上傳 */
    const st = await callEcpay('UpdateInvoiceWordStatus', { TrackID: trackId, InvoiceStatus: 2 });
    let ok = st.ok, step = st.ok ? 'done' : 'status', msg = st.msg || '';
    /* 回查（見上面「寫完回查」）：綠界說失敗，但實際已啟用 → 當成成功，不要發警報。 */
    if (!ok && await wordActive(roc, trackId)) {
      ok = true; step = 'done';
      msg = '綠界回「' + (st.msg || '未知') + '」，回查確認已啟用';
    }
    /* 反過來也要防：說成功、其實沒生效。 */
    if (ok && step === 'done' && !(await wordActive(roc, trackId))) {
      ok = false; step = 'status';
      msg = '綠界回成功，但回查仍未啟用';
    }
    done.push({ ...p, trackId, ok, step, msg });
  }
  return { year: roc, ok: true, plan, done, stale, have: mine.length, mine };
}
const TERM_LABEL = ['', '1-2月', '3-4月', '5-6月', '7-8月', '9-10月', '11-12月'];
/* 台北「今天」。字軌是看台灣的日期在走，UTC 會在跨日那幾個小時算錯一天。 */
function tpeNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
/* 下一期是哪一期、還剩幾天開始 —— 字軌要在該期開始前設定好，
   所以「快到了還沒建」本身就是要通報的事，不是只有失敗才通報。 */
function nextTermInfo() {
  const d = tpeNow();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const term = Math.ceil(m / 2);
  const nTerm = term === 6 ? 1 : term + 1;
  const nAdYear = term === 6 ? y + 1 : y;
  const start = Date.UTC(nAdYear, nTerm * 2 - 2, 1);
  const today = Date.UTC(y, m - 1, d.getUTCDate());
  return { roc: String(nAdYear - 1911), term: nTerm,
    days: Math.round((start - today) / 86400000) };
}
/* LINE 通知（2026-10-10 使用者：「如果自動建失敗　我人在國外會知道嗎　可以用line發送訊息給我嗎」）
   抬頭沿用其他自動訊息的格式（見 line-punch-remind）：收到的人要一眼看出是系統發的。
   ⚠ 只發給在職管理員。櫃檯刻意不收。
   ⚠ 通知失敗不能讓同步整支掛掉 —— 字軌已經建好了，通知只是附加。 */
async function lineNotifyAdmins(text: string) {
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!token || !url || !key) return { sent: 0, msg: '缺 LINE token 或 service role key' };
    const admin = createClient(url, key);
    const { data } = await admin.from('employees').select('line_user_id')
      .eq('role', 'admin').eq('status', 'active').not('line_user_id', 'is', null);
    let sent = 0;
    for (const e of (data || [])) {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ to: (e as any).line_user_id, messages: [{ type: 'text', text }] }),
      });
      if (r.ok) sent++;
    }
    return { sent };
  } catch (e) { return { sent: 0, msg: String((e as Error)?.message || e) }; }
}
function wordLine(p: any) {
  return `${p.InvoiceHeader} ${p.InvoiceStart}–${p.InvoiceEnd}（民國 ${p.InvoiceYear} 年 ${TERM_LABEL[Number(p.InvoiceTerm)] || p.InvoiceTerm}）`;
}
async function syncWords(dryRun: boolean, notify = false) {
  /* 查當年與明年：11-12 月那期在同一年，但年底要先把明年 1-2 月建起來，
     財政部的查詢也只接受去年／當年／明年。
     ⚠ 用台北時間算年份：跨年那幾個小時 UTC 還在去年，會去查錯的年度 */
  const roc = tpeNow().getUTCFullYear() - 1911;
  const years = [String(roc), String(roc + 1)];
  const out: any[] = [];
  for (const y of years) out.push(await syncWordsYear(y, dryRun));
  const done = out.flatMap(x => x.done);
  const stale = out.flatMap(x => x.stale || []);
  const ok = out.some(x => x.ok) && done.every(d => d.ok);

  /* 「下一期建好了沒」只要那一期**有任何字軌**就算數（不再綁死 FX）。
     ⚠ 建了但沒啟用不算 ready —— 那正是 1020 要補的那個洞。 */
  const nx = nextTermInfo();
  const nxReady = out.some(y => String(y.year) === nx.roc
    && (y.mine || []).some((m: any) => Number(m.InvoiceTerm) === nx.term && Number(m.UseStatus) === 2));
  const nxLabel = `民國 ${nx.roc} 年 ${TERM_LABEL[nx.term]}`;

  let notified: any = null;
  if (notify && !dryRun) {
    const good = done.filter(d => d.ok), bad = done.filter(d => !d.ok);
    const head = ['【有肌訓練 自動訊息】', '發票字軌自動設定', ''];
    let body: string[] | null = null;
    if (bad.length || stale.length) {
      /* ⚠ 失敗一定要講「現在該做什麼」—— 人在國外，光說失敗沒有用。
         ⚠ 用一個區域陣列再指派給 body：直接對 `string[] | null` 推值，
           TypeScript 會卡「可能是 null」，部署就過不了。 */
      const lines: string[] = ['⚠ 字軌有問題，發票可能開不出來', ''];
      if (bad.length) {
        lines.push(...bad.map(b => '・' + wordLine(b) + '\n　原因：' + (b.msg || '未知')), '');
      }
      if (stale.length) {
        lines.push('已建立、但沒有啟用：', ...stale.map(s => '・' + wordLine(s)), '');
      }
      lines.push('請到綠界後台「發票字軌設定」手動建立並啟用，',
        '或在系統的 經營報表 →〔電子發票〕按〔同步字軌〕重試。');
      body = lines;
    } else if (good.length) {
      body = ['✅ 已自動建立並啟用：', '', ...good.map(g => '・' + wordLine(g)), '',
        '這一期的發票可以正常開立，不用再做任何事。'];
    } else if (!nxReady && nx.days <= 10) {
      /* 剩 10 天內還沒配號就每天提醒一次。刻意重複：這是有期限的事。 */
      body = [`⚠ ${nxLabel} 的字軌還沒設定`, '',
        `距離該期開始剩 ${nx.days} 天。`,
        '目前財政部還沒放配號，系統每天凌晨會再試一次。',
        '',
        '若到該期開始前一天仍是這則訊息，',
        '請改用人工：財政部平台申請配號 → 綠界後台建立並啟用。'];
    }
    if (body) notified = await lineNotifyAdmins(head.concat(body).join('\n'));
  }
  return { ok, dryRun, env: ENV, years: out, plan: out.flatMap(x => x.plan), done, stale,
    nextTerm: { ...nx, ready: nxReady }, notified };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!MID || !HKEY || !HIV) return json({ ok: false, msg: '尚未設定綠界金鑰（ECPAY_MID／HASHKEY／HASHIV）' }, 500);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');

    if (action === 'ping') return json({ ok: true, env: ENV, mid: MID, base: BASE });
    if (action === 'issue')         return json(await callEcpay('Issue', b.data || {}));
    if (action === 'invalid')       return json(await callEcpay('Invalid', b.data || {}));
    if (action === 'query')         return json(await callEcpay('GetIssue', b.data || {}));
    if (action === 'allowance')     return json(await callEcpay('Allowance', b.data || {}));
    /* 載具／愛心碼在開立前先驗，錯的當場擋下來 ——
       開出去才發現載具是假的，就要走作廢重開，客人已經走了。 */
    if (action === 'checkBarcode')  return json(await callEcpay('CheckBarcode', b.data || {}));
    if (action === 'checkLoveCode') return json(await callEcpay('CheckLoveCode', b.data || {}));

    /* ══ 字軌（2026-10-10）══
       唯讀的兩支給畫面查；syncWords 是「建立＋啟用」，預設先 dryRun 列出來給人看過。
       ⚠ 寫入這條路一定要保留 dryRun 那一步，不要做成按一下就直接寫。
       notify 只有 cron 會帶：畫面上按的人當場就看到結果，不用再發 LINE 給自己。 */
    if (action === 'govWords')      return json(await callEcpay('GetGovInvoiceWordSetting', b.data || {}));
    if (action === 'words')         return json(await callEcpay('GetInvoiceWordSetting', b.data || {}));
    /* dryRun／notify 兩個位置都收：前端的 invCall 包在 data 裡，cron 直接放最外層 */
    if (action === 'syncWords')     return json(await syncWords(
      !!(b.dryRun || (b.data && b.data.dryRun)), !!(b.notify || (b.data && b.data.notify))));

    return json({ ok: false, msg: '未知的 action：' + action }, 400);
  } catch (e) {
    return json({ ok: false, msg: String((e as Error)?.message || e) }, 500);
  }
});
