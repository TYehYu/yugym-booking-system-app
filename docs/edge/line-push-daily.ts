// line-push-daily（2026-07-25 v3；2026-08-03 v4 對外名稱、v5 堂數與續約提醒、v6 改開課前 24 小時逐時段推；2026-08-04 v7 教練收款提醒；2026-08-07 v8 同一人只發一則＋失敗要留下紀錄；2026-08-08 v9 收款提醒改用與前端同一套「最後一堂」判斷）
// v6（2026-08-03 使用者指示）：「通知的時間統一改成前一天的同一時間，如果是明天 12 點
// 上課就今天 12 點通知，讓每個客人有 24 小時準備；要請假的也能盡早告知」——
// pg_cron 改每 30 分鐘呼叫一次（原每日 18:00 整批）；每次只推「24 小時後那個
// 30 分鐘時段」開課的課。
// v7（2026-08-04 使用者指示：「line 有辦法自動通知會員繳費提醒給教練嗎」）——
// 教練不從 LINE 登入，改由管理員在員工資料採「綁定 LINE」QR（見 index.html
// ppStaffLineBind / line-member-auth action=staff_bind）寫入 employees.line_user_id。
// v8（2026-08-07 使用者回報：「今天 20:00 的團課，昨天系統沒有通知」）——
//   ① 同一人只發一則（member_ids 會重複同一個 id）
//   ② 推播失敗要留下紀錄（會員身上記旗標＋櫃檯通知）
//
// v9（2026-08-08 使用者回報：「提醒教練會員要繳費的通知是不是還沒成功？像今天世清跟
//     子涓要繳費，並沒有看到該教練被通知」）—— 兩個各自獨立的原因：
//
//   ①【邏輯錯】原本用「sessions_total − 這張票的第幾筆預約 ≤ 2」判斷快上完了。
//      這個算法假設「票上每一堂都連得上一筆預約」，但舊系統匯入的票不是這樣：
//      劉世清那張 20 堂票在正式庫只連得上 3 筆預約（1–4 月的課從未匯入），
//      於是算出「還剩 17 堂」，永遠不會提醒 —— 而他的票餘額其實已經是 0，
//      今天就是最後一堂。前端在 2026-07-30／08-01 就踩過同一個坑並修好了
//      （computeLastBkMarks：連結法與餘額法取小），這裡改用同一套。
//
//   ②【教練沒綁 LINE】林子娟今天也是最後一堂，但她的教練 Mango 沒有綁 LINE，
//      推播根本發不出去。原本只在回應裡回一個 coach_skip_no_line 數字，
//      沒有人看得到 → 改成寫一筆櫃檯通知，讓櫃檯知道「這筆要自己提醒教練」。
//
//   ③ 順帶：「第 n/N 堂」對匯入票也是錯的（會出現「第 3/20 堂」但其實已用完），
//      改成只有在預約筆數與總堂數對得上時才顯示。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const CAT_NAME: Record<string, string> = {
  '私人教練': '教練課',
  '小班肌力': '團課',
  '體驗': '體驗課',
  '自主訓練': '自主訓練',
}
const WD = ['日', '一', '二', '三', '四', '五', '六']
const toMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0) }
const nid = () => 'NT-LP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const humanErr = (status: number, body: string) => {
  const s = String(body || '')
  if (status === 403 || /not.*friend|blocked/i.test(s)) return '會員尚未把官方帳號加為好友（或已封鎖）'
  if (status === 401) return '官方帳號金鑰失效，請管理員重新設定'
  if (status === 429) return 'LINE 推播次數已達上限'
  if (status === 400 && /invalid.*to|user/i.test(s)) return 'LINE 使用者代碼無效，請請會員重新綁定'
  return `LINE 回應 ${status}：${s.slice(0, 120)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || ''
    if (!token) return J({ error: 'NO_TOKEN' }, 500)

    const nowTW = new Date(Date.now() + 8 * 3600_000)
    const floored = new Date(Math.floor(nowTW.getTime() / 1800_000) * 1800_000)
    const tgt = new Date(floored.getTime() + 24 * 3600_000)
    const target = tgt.toISOString().slice(0, 10)
    const winStart = tgt.getUTCHours() * 60 + tgt.getUTCMinutes()
    const winEnd = winStart + 30
    const d = new Date(target + 'T00:00:00Z')
    const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )

    const { data: allBks, error: bkErr } = await admin
      .from('bookings').select('id,date,start_time,category,coach_id,substitute_coach_id,member_id,member_ids,ticket_id')
      .eq('date', target).neq('status', 'cancelled')
    if (bkErr) return J({ error: 'BOOKINGS_QUERY', detail: bkErr.message }, 500)
    const bks = (allBks || []).filter(b => { const m = toMin(String(b.start_time).slice(0, 5)); return m >= winStart && m < winEnd })
    if (!bks.length) return J({ ok: true, target, window: [winStart, winEnd], bookings: 0, sent: 0 })

    const memIds = new Set<string>(); const coachIds = new Set<string>(); const tkIds = new Set<string>()
    for (const b of bks) {
      if (b.member_id) memIds.add(b.member_id)
      if (Array.isArray(b.member_ids)) for (const m of b.member_ids) if (m) memIds.add(m)
      const c = b.substitute_coach_id || b.coach_id
      if (c) coachIds.add(c)
      if (b.category === '私人教練' && b.ticket_id) tkIds.add(b.ticket_id)
    }
    const { data: mems } = await admin.from('members').select('id,name,line_user_id,line_notify').in('id', [...memIds])
    const { data: emps } = coachIds.size ? await admin.from('employees').select('id,name,name_en,line_user_id').in('id', [...coachIds]) : { data: [] }
    const memMap: Record<string, any> = {}; for (const m of (mems || [])) memMap[m.id] = m
    const coachMap: Record<string, string> = {}
    const coachLine: Record<string, string> = {}
    for (const e of (emps || [])) {
      const n = (e as any).name_en || e.name || ''
      coachMap[e.id] = /[A-Za-z]/.test(n) ? n.toUpperCase() : n
      if ((e as any).line_user_id) coachLine[e.id] = (e as any).line_user_id
    }

    /* ── 每張票算出「哪一筆預約是該收款的那一堂」（v9）──
       與前端 computeLastBkMarks 同一套：
         A 連結法：總堂數 − 已核銷 − 已預約未上　（票上每一堂都連得上預約時才準）
         B 餘額法：sessions_remaining　　　　　　（連結有缺漏時才準；沒有餘額欄＝不表態）
       任何一邊說「沒得再約了」，那就是最後一堂 —— 取兩者較小的。
       分期票另外算：已開通區的最後一堂＝該收下一期，那是「繳費」不是「續約」。 */
    const tkInfo: Record<string, { total: number; seq: any[]; renewLastId: string | null; instLastId: string | null; linkFull: boolean }> = {}
    if (tkIds.size) {
      const { data: tks } = await admin.from('member_tickets')
        .select('id,sessions_total,sessions_remaining,unlocked_sessions,installment,status').in('id', [...tkIds])
      const { data: tbks } = await admin.from('bookings').select('id,ticket_id,date,start_time,status')
        .in('ticket_id', [...tkIds]).neq('status', 'cancelled')
      const by: Record<string, any[]> = {}
      for (const x of (tbks || [])) (by[x.ticket_id] = by[x.ticket_id] || []).push(x)
      for (const k of Object.keys(by)) {
        by[k].sort((a, b) => ((a.date || '') + (a.start_time || '')).localeCompare((b.date || '') + (b.start_time || '')))
      }
      for (const tk of (tks || [])) {
        const total = Number(tk.sessions_total) || 0
        const seq = by[tk.id] || []
        const info = { total, seq, renewLastId: null as string | null, instLastId: null as string | null, linkFull: total > 0 && seq.length === total }
        tkInfo[tk.id] = info
        if (!(total > 0) || !seq.length) continue
        const isInst = !!(tk as any).installment
        const uRaw = Number((tk as any).unlocked_sessions)
        const unlocked = Number.isFinite(uRaw) && uRaw > 0 ? uRaw : total
        // 分期：已開通區的最後一堂 → 該收下一期
        if (isInst && unlocked < total && seq[unlocked - 1]) info.instLastId = seq[unlocked - 1].id
        // 續約：整張票已經排光（分期票要等開通到最後一段才算續約情境）
        if (isInst && unlocked < total) continue
        if (tk.status && tk.status !== 'usable') continue
        const done = seq.filter((x: any) => x.status === 'checked_in' || x.status === 'completed').length
        const ahead = seq.length - done
        const byLink = total - done - ahead
        const remRaw = (tk as any).sessions_remaining
        const byBal = (remRaw === null || remRaw === undefined || remRaw === '') ? Infinity : Number(remRaw)
        if (Math.min(byLink, Number.isFinite(byBal) ? byBal : Infinity) > 0) continue
        info.renewLastId = seq[seq.length - 1].id
      }
    }

    let sent = 0; let skipNoLine = 0; let skipOptOut = 0; let failed = 0
    let coachSent = 0; let coachSkip = 0
    const failDetail: Array<{ member: string; reason: string }> = []
    const okMembers = new Set<string>()
    const push = async (to: string, text: string) => {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      })
      if (r.ok) return { ok: true, status: r.status, body: '' }
      let body = ''
      try { body = await r.text() } catch (_) { /* 讀不到內容不影響主流程 */ }
      return { ok: false, status: r.status, body }
    }
    const deskNote = async (type: string, title: string, body: string) => {
      try {
        await admin.from('notifications').insert({
          id: nid(), recipient_type: 'desk', recipient_id: 'desk', type,
          title, body, read: false, created_at: new Date().toISOString(),
        })
      } catch (_) { /* 記錄失敗不影響推播 */ }
    }

    for (const b of bks) {
      const catName = CAT_NAME[b.category] || b.category || '課程'
      const coachId = b.substitute_coach_id || b.coach_id
      const coachName = coachMap[coachId] || ''
      let seqStr = ''; let renewLine = ''
      let coachAlert = ''
      const info = (b.category === '私人教練' && b.ticket_id) ? tkInfo[b.ticket_id] : null
      if (info && info.total > 0) {
        const n = info.seq.findIndex((x: any) => x.id === b.id) + 1
        /* 「第 n/N 堂」只在連結完整時才敢寫 —— 匯入票連不上的堂數不會出現在 seq 裡，
           寫出來會變成「第 3/20 堂」但其實那張票已經用完了（v9）。 */
        if (info.linkFull && n > 0) seqStr = `（第 ${n}/${info.total} 堂）`
        if (info.instLastId === b.id) {
          coachAlert = '分期款（這是本期已開通的最後一堂）'
        } else if (info.renewLastId === b.id) {
          coachAlert = '續約（這是這張票的最後一堂）'
          renewLine = `\n💬 這期課程接近尾聲，若想繼續訓練，歡迎與教練討論續約方案！`
        }
      }
      const line3 = coachName ? `🏋️ ${catName}･教練：${coachName}${seqStr}` : `🏋️ ${catName}${seqStr}`
      const text = `【YUGYM 有肌訓練】\n提醒您明天這個時間有課 💪\n📅 ${dateLabel} ${String(b.start_time).slice(0, 5)}\n${line3}${renewLine}\n如需請假或調整，請盡早告知教練 🙏\n期待見到您！`
      const ids: string[] = []
      const seen = new Set<string>()
      if (b.member_id && !seen.has(b.member_id)) { seen.add(b.member_id); ids.push(b.member_id) }
      if (Array.isArray(b.member_ids)) for (const m of b.member_ids) if (m && !seen.has(m)) { seen.add(m); ids.push(m) }
      for (const mid of ids) {
        const mem = memMap[mid]
        if (!mem || !mem.line_user_id) { skipNoLine++; continue }
        if (mem.line_notify === false) { skipOptOut++; continue }
        const r = await push(mem.line_user_id, text)
        if (r.ok) { sent++; okMembers.add(mid); continue }
        failed++
        const why = humanErr(r.status, r.body)
        failDetail.push({ member: mem.name || mid, reason: why })
        try {
          await admin.from('members').update({ line_push_failed_at: new Date().toISOString(), line_push_error: why }).eq('id', mid)
        } catch (_) { /* 記錄失敗不影響其他人的推播 */ }
        await deskNote('line_push_fail', '⚠ LINE 上課提醒沒送到',
          `${mem.name || mid}　${dateLabel} ${String(b.start_time).slice(0, 5)} ${catName}　—— ${why}`)
      }
      // 收款提醒推給教練本人
      if (coachAlert) {
        const who = ids.map(x => (memMap[x] && memMap[x].name) || '').filter(Boolean).join('、') || '會員'
        if (coachId && coachLine[coachId]) {
          const ctext = `【YUGYM 收款提醒】\n明天這堂該跟會員收款囉 💰\n📅 ${dateLabel} ${String(b.start_time).slice(0, 5)}\n👤 ${who}${seqStr}\n💳 ${coachAlert}\n請在課後協助完成收款或轉告櫃檯。`
          const r = await push(coachLine[coachId], ctext)
          if (r.ok) coachSent++
          else {
            failed++
            await deskNote('coach_push_fail', '⚠ 教練收款提醒沒送到',
              `${coachName || coachId}　${dateLabel} ${String(b.start_time).slice(0, 5)}　${who}　—— ${humanErr(r.status, r.body)}`)
          }
        } else {
          /* v9：教練沒綁 LINE 就推不出去。原本只默默計數，櫃檯完全看不到 ——
             改成寫一筆通知，至少有人知道「這筆要自己提醒教練」。 */
          coachSkip++
          await deskNote('coach_no_line', '收款提醒沒推出去（教練未綁定 LINE）',
            `${coachName || '未指定教練'}　${dateLabel} ${String(b.start_time).slice(0, 5)}　${who}　·　${coachAlert}　—— 請在員工資料為這位教練綁定 LINE，或當面轉告`)
        }
      }
    }
    if (okMembers.size) {
      try { await admin.from('members').update({ line_push_failed_at: null, line_push_error: null }).in('id', [...okMembers]).not('line_push_failed_at', 'is', null) } catch (_) { /* 清旗標失敗不影響推播 */ }
    }
    return J({ ok: true, target, window: [winStart, winEnd], bookings: bks.length, sent, coach_sent: coachSent, coach_skip_no_line: coachSkip, skip_no_line: skipNoLine, skip_opt_out: skipOptOut, failed, fail_detail: failDetail })
  } catch (e) {
    return J({ error: String((e && (e as any).message) || e) }, 500)
  }
})
