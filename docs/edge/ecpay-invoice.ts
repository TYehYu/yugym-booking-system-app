/* ══════════════════════════════════════════════════════════════════════
   綠界電子發票（B2C）—— Supabase Edge Function
   2026-09-02 建立。使用者定案：不串金流、只串發票；POS 不用（不要兩套帳）。

   ⚠ 為什麼一定要放後端：index.html 是 GitHub Pages 上的公開檔案，
     任何人按「檢視原始碼」都看得到。HashKey／HashIV 等於「用你的統編開發票」
     的權限，只能存在 Supabase 的 secrets 裡。前端只呼叫這一支。

   金鑰（supabase secrets）：
     ECPAY_MID       特店編號
     ECPAY_HASHKEY   介接 HashKey
     ECPAY_HASHIV    介接 HashIV
     ECPAY_ENV       stage（預設）／prod

   綠界 API 的加密：JSON → URLEncode(.NET 風格) → AES-128-CBC/PKCS7 → Base64
   回應反過來：Base64 → AES 解密 → URLDecode → JSON
   ⚠ URLEncode 要模仿 .NET 的 HttpUtility.UrlEncode：
     ・空白是 `+`（不是 %20）
     ・十六進位小寫（%e4 不是 %E4）
     ・不編碼 - _ . ! * ( )
     這幾條只要錯一條，綠界就會回「解密失敗」而且訊息很不明確。
   ══════════════════════════════════════════════════════════════════════ */
const ENV   = Deno.env.get('ECPAY_ENV') || 'stage';
/* 測試環境的預設值＝綠界官方公開給所有開發者的共用測試帳號（文件上就有，不是誰的祕密）。
   ⚠ 只在 stage 生效；ECPAY_ENV=prod 時一定要自己設 secrets，設不齊就直接擋下來，
     不會偷偷用測試帳號去開正式發票。 */
const STAGE_MID='2000132', STAGE_KEY='ejCk326UnaZWKisg', STAGE_IV='q9jcZX8Ib9LM8wYk';
const _def=(v:string|undefined, d:string)=> v || (ENV==='prod' ? '' : d);
const MID   = _def(Deno.env.get('ECPAY_MID'),     STAGE_MID);
const HKEY  = _def(Deno.env.get('ECPAY_HASHKEY'), STAGE_KEY);
const HIV   = _def(Deno.env.get('ECPAY_HASHIV'),  STAGE_IV);
const BASE  = ENV === 'prod'
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
    else out += '%' + b.toString(16).padStart(2, '0');   // 小寫
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
  /* ⚠ Timestamp 只有 10 分鐘有效，而且是 GMT+8 的 Unix 秒 ——
     Edge Function 跑在 UTC，Unix 秒本來就與時區無關，直接用即可。
     綠界文件寫「GMT+8」指的是他們那端的判讀，不是要我們加 8 小時。 */
  const body = {
    MerchantID: MID,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: await encData({ MerchantID: MID, ...data }),
  };
  const r = await fetch(`${BASE}/${path}`, {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!MID || !HKEY || !HIV) return json({ ok: false, msg: '尚未設定綠界金鑰（ECPAY_MID／HASHKEY／HASHIV）' }, 500);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');

    if (action === 'ping') return json({ ok: true, env: ENV, mid: MID, base: BASE });

    if (action === 'issue')   return json(await callEcpay('Issue', b.data || {}));
    if (action === 'invalid') return json(await callEcpay('Invalid', b.data || {}));
    /* ⚠ 查詢只吃 RelateNumber（2026-09-02 實測）——
       文件寫「RelateNumber 或 InvoiceNo+InvoiceDate」，但帶 InvoiceNo 那條實測一律回
       「查無發票資料」（yyyy-MM-dd 與 yyyy/MM/dd 都試過）。
       反正 RelateNumber 是我們自己給的（＝purchases.id），本來就該用它查。 */
    if (action === 'query')   return json(await callEcpay('GetIssue', b.data || {}));
    if (action === 'allowance') return json(await callEcpay('Allowance', b.data || {}));
    /* 載具／愛心碼／統編在開立前先驗，錯的當場擋下來 ——
       開出去才發現載具是假的，就要走作廢重開，客人已經走了。 */
    if (action === 'checkBarcode') return json(await callEcpay('CheckBarcode', b.data || {}));
    if (action === 'checkLoveCode') return json(await callEcpay('CheckLoveCode', b.data || {}));

    return json({ ok: false, msg: '未知的 action：' + action }, 400);
  } catch (e) {
    return json({ ok: false, msg: String((e as Error)?.message || e) }, 500);
  }
});
