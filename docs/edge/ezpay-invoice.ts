// ezpay-invoice v2（2026-08-11）：ezPay 電子發票 開立／作廢／查詢
// ⚠ 2026-09-02 已從 Supabase 刪除，前端也整套移除（改走綠界 ecpay-invoice）。
//   這個檔案只是留在 git 歷史裡當備份，不是現行程式，也不要重新部署。
// 規格：EZP_INVI_1_2_1（invoice_issue Version 1.5、invoice_invalid 1.0）
// 加密：PostData_ = hex(AES-256-CBC(http_build_query(params), HashKey, HashIV))，手動 padding（blocksize 32）
// 驗證：回傳 CheckCode = SHA256("HashIV=..&InvoiceTransNo=..&MerchantID=..&MerchantOrderNo=..&RandomNum=..&TotalAmt=..&HashKey=..") 大寫
// 環境：body.env='test' → cinv 測試站（用 EZPAY_TEST_* secrets）；預設 prod。
// 權限：只有 櫃檯／管理員 可呼叫（以呼叫者 JWT 查 employees.role）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf as ArrayBuffer)].map(b => b.toString(16).padStart(2, '0')).join('')
const enc = new TextEncoder()

/* PHP http_build_query 同款：key=rawurlencode(value)，encodeURIComponent 再補 PHP 的差異 */
const phpUrlencode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+')
const buildQuery = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${phpUrlencode(v ?? '')}`).join('&')

/* addpadding（blocksize 32，規格附件一）＋AES-256-CBC ZERO_PADDING → hex */
async function aesEncrypt(plain: string, key: string, iv: string): Promise<string> {
  const data = enc.encode(plain)
  const pad = 32 - (data.length % 32)
  const padded = new Uint8Array(data.length + pad)
  padded.set(data); padded.fill(pad, data.length)
  const k = await crypto.subtle.importKey('raw', enc.encode(key), 'AES-CBC', false, ['encrypt'])
  // WebCrypto 會再加一層 PKCS7（整齊時補滿 16 bytes），截掉那 16 bytes 即等同 ZERO_PADDING
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: enc.encode(iv) }, k, padded))
  return hex(out.slice(0, out.length - 16))
}
async function sha256Upper(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))).toUpperCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let body: any = {}
  try { body = await req.json() } catch (_) { /* 空 body */ }
  const action = String(body.action || '')

  const isTest = body.env === 'test'
  const MID = isTest ? (Deno.env.get('EZPAY_TEST_MERCHANT_ID') || '') : (Deno.env.get('EZPAY_MERCHANT_ID') || '')
  const KEY = isTest ? (Deno.env.get('EZPAY_TEST_HASH_KEY') || '') : (Deno.env.get('EZPAY_HASH_KEY') || '')
  const IV = isTest ? (Deno.env.get('EZPAY_TEST_HASH_IV') || '') : (Deno.env.get('EZPAY_HASH_IV') || '')
  const BASE = isTest ? 'https://cinv.ezpay.com.tw' : 'https://inv.ezpay.com.tw'

  if (action === 'ping') {
    return J({ ok: !!(MID && KEY && IV), env: isTest ? 'test' : 'prod', merchant_id: MID || '（未設定）', hash_key_len: KEY.length, hash_iv_len: IV.length })
  }

  /* ── 呼叫者權限：櫃檯／管理員 ── */
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!)
  let staffId: string | null = null
  try {
    const auth = req.headers.get('authorization') || ''
    const jwt = auth.replace(/^Bearer\s+/i, '')
    const payload = JSON.parse(atob(jwt.split('.')[1] || '')) || {}
    const uid = payload.sub
    if (uid) {
      const { data: emp } = await admin.from('employees').select('id,role').eq('auth_id', uid).limit(1).maybeSingle()
      if (emp && (emp.role === 'admin' || emp.role === 'front_desk')) staffId = emp.id
    }
  } catch (_) { /* 下方擋 */ }
  if (!staffId) return J({ error: 'FORBIDDEN：只有櫃檯或管理員可操作發票' }, 403)
  if (!(MID && KEY && IV)) return J({ error: 'NO_KEYS：' + (isTest ? '測試' : '正式') + '金鑰未設定' }, 500)

  const callEzpay = async (path: string, params: Record<string, string>) => {
    const postData = await aesEncrypt(buildQuery(params), KEY, IV)
    const form = new URLSearchParams({ 'MerchantID_': MID, 'PostData_': postData })
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'YUGYM' }, body: form.toString() })
    const text = await r.text()
    let json: any
    try { json = JSON.parse(text) } catch (_) { throw new Error('EZPAY_BAD_RESPONSE：' + text.slice(0, 200)) }
    if (typeof json.Result === 'string' && json.Result) { try { json.Result = JSON.parse(json.Result) } catch (_) { /* 照舊 */ } }
    return json
  }

  try {
    /* ── 開立：action=issue ── */
    if (action === 'issue') {
      const b = body
      const totalAmt = Math.round(Number(b.total_amt) || 0)
      if (!(totalAmt > 0)) return J({ error: 'BAD_AMT：發票金額錯誤' }, 400)
      const isB2B = !!(b.buyer_ubn)
      /* 稅額：B2C 含稅內含（銷售額=round(總額/1.05)）；B2B 以未稅單價回推 */
      const amt = isB2B ? Math.round(totalAmt / 1.05) : Math.round(totalAmt / 1.05)
      const taxAmt = totalAmt - amt
      const items: Array<{ name: string; count: number; unit: string; price: number }> = Array.isArray(b.items) && b.items.length ? b.items : [{ name: b.item_name || '課程服務', count: 1, unit: '式', price: totalAmt }]
      const orderNo = String(b.order_no || ('YG' + Date.now())).replace(/[^A-Za-z0-9_]/g, '').slice(0, 20)
      const carrierType = (b.carrier_type ?? '') + ''
      const loveCode = (b.love_code ?? '') + ''
      const printFlag = (carrierType === '' && !loveCode) ? 'Y' : (b.print_flag === 'Y' ? 'Y' : 'N')
      const params: Record<string, string> = {
        RespondType: 'JSON', Version: '1.5', TimeStamp: String(Math.floor(Date.now() / 1000)),
        TransNum: '', MerchantOrderNo: orderNo,
        Status: '1', Category: isB2B ? 'B2B' : 'B2C',
        BuyerName: String(b.buyer_name || '消費者').slice(0, isB2B ? 60 : 30),
        BuyerUBN: isB2B ? String(b.buyer_ubn) : '',
        BuyerAddress: '', BuyerEmail: String(b.buyer_email || ''),
        CarrierType: isB2B ? '' : carrierType,
        CarrierNum: carrierType !== '' ? String(b.carrier_num || '') : '',
        LoveCode: isB2B ? '' : loveCode,
        PrintFlag: isB2B ? 'Y' : printFlag,
        TaxType: '1', TaxRate: '5',
        Amt: String(amt), TaxAmt: String(taxAmt), TotalAmt: String(totalAmt),
        ItemName: items.map(i => String(i.name).slice(0, 30).replace(/\|/g, '｜')).join('|'),
        ItemCount: items.map(i => String(Math.max(1, Math.round(Number(i.count) || 1)))).join('|'),
        ItemUnit: items.map(i => String(i.unit || '式').slice(0, 2)).join('|'),
        ItemPrice: items.map(i => String(Math.round(Number(i.price) || 0))).join('|'),
        ItemAmt: items.map(i => String(Math.round((Number(i.price) || 0) * Math.max(1, Math.round(Number(i.count) || 1))))).join('|'),
        Comment: String(b.comment || '').slice(0, 71),
      }
      const res = await callEzpay('/Api/invoice_issue', params)
      const ok = res.Status === 'SUCCESS'
      const R = (ok && res.Result) || {}
      /* CheckCode 驗證（附件二） */
      let checkOk = false
      if (ok && R.CheckCode) {
        const expect = await sha256Upper(`HashIV=${IV}&InvoiceTransNo=${R.InvoiceTransNo}&MerchantID=${R.MerchantID}&MerchantOrderNo=${R.MerchantOrderNo}&RandomNum=${R.RandomNum}&TotalAmt=${R.TotalAmt}&HashKey=${KEY}`)
        checkOk = expect === R.CheckCode
      }
      const rowId = 'INV-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      await admin.from('invoices').insert({
        id: rowId, merchant_order_no: orderNo, purchase_id: b.purchase_id || null, member_id: b.member_id || null,
        category: isB2B ? 'B2B' : 'B2C', buyer_name: params.BuyerName, buyer_ubn: params.BuyerUBN || null,
        carrier_type: params.CarrierType || null, carrier_num: params.CarrierNum || null, love_code: params.LoveCode || null,
        print_flag: params.PrintFlag, amt, tax_amt: taxAmt, total_amt: totalAmt,
        items, comment: params.Comment || null,
        status: ok ? 'issued' : 'failed',
        invoice_number: R.InvoiceNumber || null, random_num: R.RandomNum || null, invoice_trans_no: R.InvoiceTransNo || null,
        invoice_time: R.CreateTime ? new Date(String(R.CreateTime).replace(' ', 'T') + '+08:00').toISOString() : null,
        barcode: R.BarCode || null, qrcode_l: R.QRcodeL || null, qrcode_r: R.QRcodeR || null,
        env: isTest ? 'test' : 'prod', raw_result: res, created_by: staffId,
      })
      if (!ok) return J({ error: 'EZPAY：' + (res.Message || res.Status), status: res.Status, invoice_row: rowId }, 400)
      return J({ ok: true, invoice_row: rowId, invoice_number: R.InvoiceNumber, random_num: R.RandomNum, create_time: R.CreateTime, barcode: R.BarCode, qrcode_l: R.QRcodeL, qrcode_r: R.QRcodeR, check_code_valid: checkOk })
    }

    /* ── 作廢：action=invalid ── */
    if (action === 'invalid') {
      const num = String(body.invoice_number || '')
      if (!num) return J({ error: 'NO_INVOICE_NUMBER' }, 400)
      const params = {
        RespondType: 'JSON', Version: '1.0', TimeStamp: String(Math.floor(Date.now() / 1000)),
        InvoiceNumber: num, InvalidReason: String(body.reason || '銷售退回').slice(0, 6),
      }
      const res = await callEzpay('/Api/invoice_invalid', params)
      const ok = res.Status === 'SUCCESS'
      if (ok) {
        await admin.from('invoices').update({ status: 'invalid', invalid_reason: params.InvalidReason, invalid_at: new Date().toISOString() })
          .eq('invoice_number', num).eq('env', isTest ? 'test' : 'prod')
      }
      return ok ? J({ ok: true, invoice_number: num }) : J({ error: 'EZPAY：' + (res.Message || res.Status), status: res.Status }, 400)
    }

    /* ── 查詢：action=query（以自訂編號＋金額） ── */
    if (action === 'query') {
      const params = {
        RespondType: 'JSON', Version: '1.3', TimeStamp: String(Math.floor(Date.now() / 1000)),
        SearchType: '1', MerchantOrderNo: String(body.order_no || ''), TotalAmt: String(Math.round(Number(body.total_amt) || 0)),
      }
      const res = await callEzpay('/Api/invoice_search', params)
      return J(res)
    }

    return J({ error: 'UNKNOWN_ACTION：' + action }, 400)
  } catch (e) {
    return J({ error: String((e && (e as any).message) || e) }, 500)
  }
})
