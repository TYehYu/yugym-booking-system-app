// line-push-daily
// ⚠ 2026-08-23：這份檔案先前落後正式部署整整 11 個版本（版控停在 v9，線上已經是 v20）。
//    已用 Supabase 上的 v20 原始碼整份覆蓋，之後改這裡＝改線上那一份，不要再從舊檔改。
// v6（2026-08-03）：每 30 分鐘呼叫一次，只推「24 小時後那個 30 分鐘時段」開課的課。
// v7（2026-08-04）：有綁 LINE 的教練收到「該收款了」的推播。
// v8（2026-08-07）：同一人只發一則；推播失敗要留下紀錄。
// v9（2026-08-08）：收款提醒改用與前端 computeLastBkMarks 同一套判斷
//   （連結法與餘額法取小）—— 舊制的「total − 第幾筆預約 ≤ 2」對匯入票完全不準；
//   教練沒綁 LINE 改寫櫃檯通知；「第 n/N 堂」只在連結完整時顯示。
// v10（2026-08-08）：used_up 不能擋掉——「票已經用完」正是最後一堂的定義本身。
// v11（2026-08-08 使用者指示）：共享票提醒發給「上課的人」（trial_name 對回真實會員）。
// v12（2026-08-11 使用者回報）：排除影子預約（sibling_of）＋同一輪同會員只推一則。
// v16（2026-08-12 使用者回報「Sandy 沒收到收款提醒、會員訊息沒有堂數」）：
//   ① 票券／序列查詢的錯誤本來被靜默呑掉——查詢一失敗，整套「第 n/N 堂」與收款判斷
//      無聲消失，會員照樣收到（沒堂數的）提醒、教練什麼都收不到，完全無跡可尋。
//      改成：查詢失敗寫櫃檯通知＋回傳 detect_error，看得見才修得掉。
//   ② body {debug:true, target:'YYYY-MM-DD', win:[start,end]} 試算模式：
//      不發任何推播、不寫任何通知，回傳每筆預約算出的堂數／收款判定（除錯用）。
// v17（2026-08-13 使用者指示）：訊息抬頭 YUGYM → 有肌訓練。
// v18（2026-08-14 使用者指示）：自主訓練的提醒要寫使用的場地——venue_unit 為主
//   （treadmill→跑步機、group→教室、multi→多功能區），舊匯入資料從 note 的「教室:」撈。
// v19（2026-08-20 使用者指示）：場地名稱「多功能區」統一改成「多功能訓練架」
//   —— 與 venues 表（multi = 多功能訓練架）和 App 內顯示一致，客人兩邊看到同一個名字。
// v20（2026-08-21 使用者指示）：抬頭統一成【有肌訓練 自動訊息】，第二行才寫是什麼通知；
//   會員那則另加一行註解說明直接回覆沒人會看到。
//   理由（使用者）：「讓會員跟教練知道這個系統自動通知」—— LINE 官方帳號的訊息看起來
//   跟真人傳的一模一樣，客人回了就以為有人收到。
// v21（2026-08-23）：教練也有 LINE 通知開關（employees.line_notify，opt-out）。
//   使用者把帳號抽屜的「通知設定」改成內嵌開關、並開放給管理員之後，那顆開關對教練
//   必須真的關得掉東西 —— 教練會收到的就是這支的收款提醒。關掉的人直接跳過，
//   而且**不寫「未綁定 LINE」的櫃檯通知**（那是異常，這是他自己選的），只計一個數字。
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
const HEAD = '【有肌訓練 自動訊息】'
const AUTO_NOTE = '（這是系統自動發送的訊息，直接回覆不會有人看到；需要協助請聯繫櫃檯）'
const humanErr = (status: number, body: string) => {
  const s = String(body || '')
  if (status === 403 || /not.*friend|blocked/i.test(s)) return '會員尚未把官方帳號加為好友（或已封鎖）'
  if (status === 401) return '官方帳號金鑰失效，請管理員重新設定'
  if (status === 429) return 'LINE 推播次數已達上限'
  if (status === 400 && /invalid.*to|user/i.test(s)) return 'LINE 使用者代碼無效，請請會員重新綁定'
  return `LINE 回應 ${status}：${s.slice(0, 120)}`
}
/* v18：自主訓練的場地（與前端 selfVenueLabel 同一套判讀，外加預設顯示多功能訓練架）
   v19：名稱與 venues 表對齊（multi = 多功能訓練架），不再用簡稱「多功能區」 */
const selfVenue = (b: any): string => {
  if (b.category !== '自主訓練') return ''
  const u = String(b.venue_unit || '')
  if (u.startsWith('treadmill')) return '跑步機'
  if (u.startsWith('group')) return '教室'
  if (u.startsWith('multi')) return '多功能訓練架'
  const nt = String(b.note || '')
  const m = nt.match(/教室[:：]\s*([^\s|｜]+)/)
  const raw = m ? m[1] : nt
  if (/跑步機/.test(raw)) return '跑步機'
  if (/教室/.test(raw)) return '教室'
  return '多功能訓練架'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || ''
    if (!token) return J({ error: 'NO_TOKEN' }, 500)

    /* v16：試算模式（不發推播、不寫通知，只回傳判定） */
    let body: any = null
    try { body = await req.json() } catch (_) { /* cron 沒帶 body */ }
    const DEBUG = !!(body && body.debug)

    const nowTW = new Date(Date.now() + 8 * 3600_000)
    const floored = new Date(Math.floor(nowTW.getTime() / 1800_000) * 1800_000)
    const tgt = new Date(floored.getTime() + 24 * 3600_000)
    let target = tgt.toISOString().slice(0, 10)
    let winStart = tgt.getUTCHours() * 60 + tgt.getUTCMinutes()
    let winEnd = winStart + 30
    if (DEBUG && body.target) target = String(body.target)
    if (DEBUG && Array.isArray(body.win)) { winStart = Number(body.win[0]) || 0; winEnd = Number(body.win[1]) || winStart + 30 }
    const d = new Date(target + 'T00:00:00Z')
    const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )

    const { data: allBks, error: bkErr } = await admin
      .from('bookings').select('id,date,start_time,category,coach_id,substitute_coach_id,member_id,member_ids,ticket_id,trial_name,sibling_of,venue_unit,note')
      .eq('date', target).neq('status', 'cancelled')
    if (bkErr) return J({ error: 'BOOKINGS_QUERY', detail: bkErr.message }, 500)
    /* v12：影子預約（第二台跑步機）不是另一堂課，直接濾掉 */
    const bks = (allBks || []).filter(b => !((b as any).sibling_of))
      .filter(b => { const m = toMin(String(b.start_time).slice(0, 5)); return m >= winStart && m < winEnd })
    if (!bks.length) return J({ ok: true, target, window: [winStart, winEnd], bookings: 0, sent: 0 })

    const memIds = new Set<string>(); const coachIds = new Set<string>()
    const tkIds = new Set<string>()      // v11：所有有票的課都要（不只教練課）—— 要拿共享名單找上課的人
    const ptTkIds = new Set<string>()    // 收款提醒只看教練課
    for (const b of bks) {
      if (b.member_id) memIds.add(b.member_id)
      if (Array.isArray(b.member_ids)) for (const m of b.member_ids) if (m) memIds.add(m)
      const c = b.substitute_coach_id || b.coach_id
      if (c) coachIds.add(c)
      if (b.ticket_id) tkIds.add(b.ticket_id)
      if (b.category === '私人教練' && b.ticket_id) ptTkIds.add(b.ticket_id)
    }

    /* v16：偵測用查詢的錯誤不再靜默呑掉 */
    const detectErrors: string[] = []

    /* ── 共享票：這張票可以給哪些人用（持有人＋共享者）（v11）── */
    const tkOwners: Record<string, string[]> = {}
    if (tkIds.size) {
      const { data: owns, error: ownErr } = await admin.from('member_tickets').select('id,member_id,shared_with').in('id', [...tkIds])
      if (ownErr) detectErrors.push('owns: ' + ownErr.message)
      for (const t of (owns || [])) {
        const arr: string[] = []
        if (t.member_id) arr.push(t.member_id)
        const sw = (t as any).shared_with
        if (Array.isArray(sw)) for (const x of sw) if (x) arr.push(String(x))
        tkOwners[t.id] = arr
        for (const x of arr) memIds.add(x)
      }
    }

    const { data: mems, error: memErr } = await admin.from('members').select('id,name,line_user_id,line_notify').in('id', [...memIds])
    if (memErr) detectErrors.push('mems: ' + memErr.message)
    /* v21：員工也有 line_notify（opt-out）。撈回來後，關掉的人不進 coachLine。 */
    const { data: emps } = coachIds.size ? await admin.from('employees').select('id,name,name_en,line_user_id,line_notify').in('id', [...coachIds]) : { data: [] }
    const memMap: Record<string, any> = {}; for (const m of (mems || [])) memMap[m.id] = m
    const coachMap: Record<string, string> = {}
    const coachLine: Record<string, string> = {}
    const coachOptOut = new Set<string>()   // v21：自己把 LINE 通知關掉的教練
    for (const e of (emps || [])) {
      const n = (e as any).name_en || e.name || ''
      coachMap[e.id] = /[A-Za-z]/.test(n) ? n.toUpperCase() : n
      /* 關掉的人不放進 coachLine，下面「有沒有綁 LINE」那一支自然就跳過了。
         ⚠ 但那條 else 會寫「未綁定 LINE」的櫃檯通知，語意會錯 —— 所以另外記一份
         coachOptOut，讓 else 分得出是「沒綁」還是「自己關掉」。 */
      if ((e as any).line_user_id && (e as any).line_notify !== false) coachLine[e.id] = (e as any).line_user_id
      if ((e as any).line_notify === false) coachOptOut.add(e.id)
    }

    /* 上課的人是誰（v11） */
    const attendeeOf = (b: any): string | null => {
      const nm = String(b.trial_name || '').trim()
      if (!nm || !b.ticket_id) return b.member_id || null
      for (const cand of (tkOwners[b.ticket_id] || [])) {
        const m = memMap[cand]
        if (m && String(m.name || '').trim() === nm) return cand
      }
      return b.member_id || null
    }

    /* ── 每張票算出「哪一筆預約是該收款的那一堂」（v9）── */
    const tkInfo: Record<string, { total: number; seq: any[]; renewLastId: string | null; instLastId: string | null; linkFull: boolean }> = {}
    if (ptTkIds.size) {
      const { data: tks, error: tkErr } = await admin.from('member_tickets')
        .select('id,sessions_total,sessions_remaining,unlocked_sessions,installment,status').in('id', [...ptTkIds])
      if (tkErr) detectErrors.push('tks: ' + tkErr.message)
      const { data: tbks, error: tbErr } = await admin.from('bookings').select('id,ticket_id,date,start_time,status')
        .in('ticket_id', [...ptTkIds]).neq('status', 'cancelled')
      if (tbErr) detectErrors.push('tbks: ' + tbErr.message)
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
        if (isInst && unlocked < total && seq[unlocked - 1]) info.instLastId = seq[unlocked - 1].id
        if (isInst && unlocked < total) continue
        if (tk.status === 'refunded') continue   // v10：used_up 不能擋
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
    let coachSent = 0; let coachSkip = 0; let coachOptOutSkip = 0; let redirected = 0; let dedup = 0
    const failDetail: Array<{ member: string; reason: string }> = []
    const okMembers = new Set<string>()
    const pushedMem = new Set<string>()   // v12：同一輪內同一位會員只推一則
    const debugRows: any[] = []           // v16：試算模式的逐筆判定
    const push = async (to: string, text: string) => {
      if (DEBUG) return { ok: true, status: 200, body: '(debug，未發送)' }
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
      if (DEBUG) return
      try {
        await admin.from('notifications').insert({
          id: nid(), recipient_type: 'desk', recipient_id: 'desk', type,
          title, body, read: false, created_at: new Date().toISOString(),
        })
      } catch (_) { /* 記錄失敗不影響推播 */ }
    }
    /* v16：偵測查詢失敗要讓櫃檯看得見（一天內同類只留一則的去重交給人眼） */
    if (detectErrors.length && !DEBUG) {
      await deskNote('push_detect_fail', '⚠ 收款提醒的票券判定失敗',
        `${dateLabel} ${Math.floor(winStart / 60)}:${String(winStart % 60).padStart(2, '0')} 這一輪的「第幾堂／該收款」判定沒算出來（${detectErrors.join('；').slice(0, 160)}）——會員仍收到基本提醒，請人工確認該時段有沒有最後一堂要收款。`)
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
        if (info.linkFull && n > 0) seqStr = `（第 ${n}/${info.total} 堂）`
        if (info.instLastId === b.id) {
          coachAlert = '分期款（這是本期已開通的最後一堂）'
        } else if (info.renewLastId === b.id) {
          coachAlert = '續約（這是這張票的最後一堂）'
          renewLine = `💬 這期課程接近尾聲，若想繼續訓練，歡迎與教練討論續約方案！`
        }
      }
      const line3 = coachName ? `🏋️ ${catName}･教練：${coachName}${seqStr}` : `🏋️ ${catName}${seqStr}`
      const venue = selfVenue(b)   // v18：自主訓練寫場地
      /* v20 排版：抬頭→通知種類→空行→內容→空行→自動發送註解 */
      const text = [HEAD, '上課提醒', '',
        `📅 ${dateLabel} ${String(b.start_time).slice(0, 5)}`,
        line3]
        .concat(venue ? [`📍 場地：${venue}`] : [])
        .concat(renewLine ? ['', renewLine] : [])
        .concat(['', '如需請假或調整，請盡早告知教練 🙏', '期待見到您！', '', AUTO_NOTE])
        .join('\n')
      const ids: string[] = []
      const seen = new Set<string>()
      const att = attendeeOf(b)
      if (att && att !== b.member_id) redirected++
      if (att && !seen.has(att)) { seen.add(att); ids.push(att) }
      if (Array.isArray(b.member_ids)) for (const m of b.member_ids) if (m && !seen.has(m)) { seen.add(m); ids.push(m) }
      if (DEBUG) {
        debugRows.push({
          booking: b.id, time: String(b.start_time).slice(0, 5), category: b.category,
          ticket_id: b.ticket_id || null, has_info: !!info, total: info ? info.total : null,
          seq_len: info ? info.seq.length : null, linkFull: info ? info.linkFull : null,
          n: info ? info.seq.findIndex((x: any) => x.id === b.id) + 1 : null,
          seqStr, coachAlert, coach: coachName,
          coach_has_line: !!(coachId && coachLine[coachId]),
          coach_opt_out: !!(coachId && coachOptOut.has(coachId)),
          venue,
          members: ids.map(x => ({ name: (memMap[x] && memMap[x].name) || x, has_line: !!(memMap[x] && memMap[x].line_user_id) })),
          text_preview: text,
        })
        continue
      }
      for (const mid of ids) {
        if (pushedMem.has(mid)) { dedup++; continue }   // v12：這一輪已經提醒過
        const mem = memMap[mid]
        if (!mem || !mem.line_user_id) { skipNoLine++; continue }
        if (mem.line_notify === false) { skipOptOut++; continue }
        const r = await push(mem.line_user_id, text)
        if (r.ok) { sent++; okMembers.add(mid); pushedMem.add(mid); continue }
        failed++
        const why = humanErr(r.status, r.body)
        failDetail.push({ member: mem.name || mid, reason: why })
        try {
          await admin.from('members').update({ line_push_failed_at: new Date().toISOString(), line_push_error: why }).eq('id', mid)
        } catch (_) { /* 記錄失敗不影響其他人的推播 */ }
        await deskNote('line_push_fail', '⚠ LINE 上課提醒沒送到',
          `${mem.name || mid}　${dateLabel} ${String(b.start_time).slice(0, 5)} ${catName}　—— ${why}`)
      }
      if (coachAlert) {
        const who = ids.map(x => (memMap[x] && memMap[x].name) || '').filter(Boolean).join('、') || '會員'
        if (coachId && coachLine[coachId]) {
          const ctext = [HEAD, '收款提醒', '',
            '明天這堂該跟會員收款囉 💰',
            `📅 ${dateLabel} ${String(b.start_time).slice(0, 5)}`,
            `👤 ${who}${seqStr}`,
            `💳 ${coachAlert}`, '',
            '請在課後協助完成收款或轉告櫃檯。'].join('\n')
          const r = await push(coachLine[coachId], ctext)
          if (r.ok) coachSent++
          else {
            failed++
            await deskNote('coach_push_fail', '⚠ 教練收款提醒沒送到',
              `${coachName || coachId}　${dateLabel} ${String(b.start_time).slice(0, 5)}　${who}　—— ${humanErr(r.status, r.body)}`)
          }
        } else if (coachId && coachOptOut.has(coachId)) {
          /* v21：教練自己把 LINE 通知關掉了 —— 這是他選的，不是異常。
             不寫櫃檯通知（寫了就變成每天都在報一件沒有人要處理的事），只計一個數字。 */
          coachOptOutSkip++
        } else {
          coachSkip++
          await deskNote('coach_no_line', '收款提醒沒推出去（教練未綁定 LINE）',
            `${coachName || '未指定教練'}　${dateLabel} ${String(b.start_time).slice(0, 5)}　${who}　·　${coachAlert}　—— 請在員工資料為這位教練綁定 LINE，或當面轉告`)
        }
      }
    }
    if (okMembers.size && !DEBUG) {
      try { await admin.from('members').update({ line_push_failed_at: null, line_push_error: null }).in('id', [...okMembers]).not('line_push_failed_at', 'is', null) } catch (_) { /* 清旗標失敗不影響推播 */ }
    }
    if (DEBUG) return J({ ok: true, debug: true, target, window: [winStart, winEnd], bookings: bks.length, detect_errors: detectErrors, rows: debugRows })
    return J({ ok: true, target, window: [winStart, winEnd], bookings: bks.length, sent, dedup_same_member: dedup, redirected_to_attendee: redirected, coach_sent: coachSent, coach_skip_no_line: coachSkip, coach_skip_opt_out: coachOptOutSkip, skip_no_line: skipNoLine, skip_opt_out: skipOptOut, failed, fail_detail: failDetail, detect_errors: detectErrors })
  } catch (e) {
    return J({ error: String((e && (e as any).message) || e) }, 500)
  }
})
