// line-daily-report（2026-08-13 使用者指示；v2 同日：訊息抬頭 YUGYM → 有肌訓練）
// v3（2026-08-21 使用者回報「手機閱讀起來斷句很不直覺」）：排版改成一行一件事。
//   舊版把日期黏在標題後、金額與筆數擠同一行、分項用「･」串起來，
//   LINE 的訊息泡泡在手機上很窄，這些行都會從中間折斷（「現金 $5,0」／「00･匯款」），
//   數字被切成兩半最難讀。改成：標題與日期分行、每個分項自己一行、區塊之間空一行。
// v4（2026-08-21 使用者指示）：抬頭統一成【有肌訓練 自動訊息】，第二行才寫是什麼通知。
//   理由：「讓會員跟教練知道這個系統自動通知」—— 不然收到的人會以為是櫃檯手打的而去回訊息。
// v6（2026-08-23）：員工的 LINE 通知開關 employees.line_notify（opt-out）——
//   帳號抽屜的「通知設定」開放給管理員了，關掉就不再推戰報。
//   has_line 一併看這個旗標，debug 模式列出來的收件人才與實際發送一致。
// v5（2026-08-22 使用者回報「今天明明只有兩筆收款，戰報卻說有五筆」）：
//   抽獎兌換也寫在 purchases（id 以 LOT- 開頭、deal_amount 0、payment_method 為 null），
//   舊版的 purN 是「今天 purchases 的列數」，把抽獎那幾列也算成收款筆數。
//   金額一直是對的（抽獎都是 $0），只有筆數錯。
//   改成：LOT- 整列跳過（日後抽獎品項若標了價也不會混進營收）＋ 0 元不算一筆收款。
// 每天 22:00（台北）：
// ① 店長＋管理員 → 今日營收（含現金/匯款拆帳展開）、今日教練課堂數、今日團課人次
// ② 當天有上課紀錄的教練 → 自己當天的課堂數（店長若同時有上課，附在戰報後面不另發）
// 口徑與系統內對齊：堂數＝已簽到/已完成；團課人次不含請假（同月報表）；
// 營收＝當日收款紀錄 deal_amount 合計（作廢已歸零），split 用 pay_split 拆現金/匯款。
// body {debug:true, date:'YYYY-MM-DD'} 試算模式：不發訊，回傳算出來的數字與收件人。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const WD = ['日', '一', '二', '三', '四', '五', '六']
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const HEAD = '【有肌訓練 自動訊息】'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || ''
    if (!token) return J({ error: 'NO_TOKEN' }, 500)
    let body: any = null
    try { body = await req.json() } catch (_) { /* cron 沒帶 body */ }
    const DEBUG = !!(body && body.debug)

    const nowTW = new Date(Date.now() + 8 * 3600_000)
    let today = nowTW.toISOString().slice(0, 10)
    if (DEBUG && body.date) today = String(body.date)
    const d = new Date(today + 'T00:00:00Z')
    const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )
    const detectErrors: string[] = []

    /* ── 今日營收（收款紀錄；+8 時區日期）── */
    const { data: purs, error: puErr } = await admin.from('purchases').select('id,deal_amount,payment_method,pay_split,created_at')
    if (puErr) detectErrors.push('purchases: ' + puErr.message)
    let revenue = 0, cash = 0, bank = 0, other = 0, purN = 0, skippedLot = 0, skippedZero = 0
    for (const p of (purs || [])) {
      const local = new Date(new Date(p.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
      if (local !== today) continue
      /* v5：抽獎兌換不是收款。purchases 這張表同時放「銷售」與「抽獎兌換」，
         後者 id 以 LOT- 開頭、金額 0、沒有付款方式。整列跳過而不是只跳金額，
         日後抽獎品項若標了價，也不會混進當日營收。 */
      if (String((p as any).id || '').startsWith('LOT-')) { skippedLot++; continue }
      const amt = Number(p.deal_amount) || 0
      /* 0 元不算一筆收款（贈送、作廢後歸零的那幾列都在這裡被濾掉） */
      if (!amt) { skippedZero++; continue }
      revenue += amt; purN++
      if (p.payment_method === 'split' && p.pay_split && typeof p.pay_split === 'object') {
        cash += Number((p.pay_split as any).cash) || 0
        bank += Number((p.pay_split as any).transfer) || 0
      } else if (p.payment_method === 'cash') cash += amt
      else if (p.payment_method === 'transfer') bank += amt
      else other += amt
    }

    /* ── 今日課堂（已簽到/已完成；排除第二台跑步機影子）── */
    const { data: bks, error: bkErr } = await admin.from('bookings')
      .select('id,category,status,coach_id,substitute_coach_id,member_ids,attendance,sibling_of')
      .eq('date', today).in('status', ['checked_in', 'completed'])
    if (bkErr) detectErrors.push('bookings: ' + bkErr.message)
    let ptCount = 0, grpCount = 0, grpHeads = 0
    const perCoach: Record<string, { pt: number; grp: number; heads: number }> = {}
    const touch = (cid: string) => (perCoach[cid] = perCoach[cid] || { pt: 0, grp: 0, heads: 0 })
    for (const b of (bks || [])) {
      if ((b as any).sibling_of) continue
      const cid = (b as any).substitute_coach_id || b.coach_id
      if (b.category === '私人教練') {
        ptCount++
        if (cid) touch(cid).pt++
      } else if (b.category === '小班肌力') {
        const ids = Array.isArray(b.member_ids) ? b.member_ids.filter(Boolean) : []
        const att = (b as any).attendance && typeof (b as any).attendance === 'object' ? (b as any).attendance : {}
        const leave = Object.values(att).filter(v => v === 'leave').length
        const heads = Math.max(0, ids.length - leave)
        grpCount++; grpHeads += heads
        if (cid) { const s = touch(cid); s.grp++; s.heads += heads }
      }
    }

    /* ── 收件人── */
    const { data: emps, error: emErr } = await admin.from('employees')
      .select('id,name,name_en,role,is_manager,line_user_id,status,line_notify')
    if (emErr) detectErrors.push('employees: ' + emErr.message)
    const active = (emps || []).filter(e => e.status !== 'inactive' && e.status !== 'resigned')
    const bosses = active.filter(e => e.role === 'admin' || (e as any).is_manager === true)
    const bossIds = new Set(bosses.map(e => e.id))
    /* v6（2026-08-23）：員工的 LINE 通知開關（employees.line_notify，opt-out）。
       使用者把「通知設定」那顆開關開放給管理員之後，關掉的人就不該再收到戰報 ——
       開關關不掉東西，那顆開關就是假的。與會員端 members.line_notify 同一條規則。 */
    const notifyOn = (e: any) => e.line_notify !== false
    const coachLine = (e: any) => (notifyOn(e) ? (e.line_user_id || null) : null)
    const dispName = (e: any) => { const n = e.name_en || e.name || ''; return /[A-Za-z]/.test(n) ? n.toUpperCase() : n }

    /* v3 排版：一行一件事。
       ・標題、通知種類與日期分行 —— 黏在一起一定會折。
       ・收款分項每種一行，只列有金額的那幾種（只有現金時就不會多一行 $0 匯款）。
       ・「共 N 筆」單獨一行，不再黏在金額後面被折成兩半。
       ・區塊之間空一行，錢一段、課一段，掃一眼就分得開。 */
    const revBlock = [`💰 今日營收 ${money(revenue)}`]
    if (cash) revBlock.push(`　現金 ${money(cash)}`)
    if (bank) revBlock.push(`　匯款 ${money(bank)}`)
    if (other) revBlock.push(`　其他 ${money(other)}`)
    if (purN) revBlock.push(`　共 ${purN} 筆收款`)

    const bossText = [
      HEAD,
      `今日戰報　${dateLabel}`,
      '',
      ...revBlock,
      '',
      `🏋️ 教練課 ${ptCount} 堂`,
      `👥 團課 ${grpCount} 堂（${grpHeads} 人次）`,
    ].join('\n')

    const coachLines = (cid: string) => {
      const s = perCoach[cid]; if (!s) return []
      const out: string[] = []
      if (s.pt) out.push(`🏋️ 教練課 ${s.pt} 堂`)
      if (s.grp) out.push(`👥 團課 ${s.grp} 堂（${s.heads} 人次）`)
      return out
    }

    const plan: Array<{ id: string; name: string; kind: string; text: string; has_line: boolean }> = []
    for (const e of bosses) {
      const mine = coachLines(e.id)
      const text = mine.length ? [bossText, '', '你今天的課', ...mine].join('\n') : bossText
      plan.push({ id: e.id, name: dispName(e), kind: 'boss', text, has_line: !!coachLine(e) })
    }
    for (const cid of Object.keys(perCoach)) {
      if (bossIds.has(cid)) continue   // 店長/管理員已在戰報附自己的課，不另發
      const e = active.find(x => x.id === cid); if (!e) continue
      const text = [
        HEAD,
        `今日課堂　${dateLabel}`,
        '',
        '今天辛苦了！你今天完成：',
        ...coachLines(cid),
      ].join('\n')
      plan.push({ id: e.id, name: dispName(e), kind: 'coach', text, has_line: !!coachLine(e) })
    }

    if (DEBUG) return J({ ok: true, debug: true, date: today, revenue, cash, bank, other, purchases: purN, skipped_lottery: skippedLot, skipped_zero: skippedZero, ptCount, grpCount, grpHeads, detect_errors: detectErrors, recipients: plan })

    let sent = 0, skipNoLine = 0, failed = 0
    const failDetail: Array<{ name: string; reason: string }> = []
    for (const r of plan) {
      const e = active.find(x => x.id === r.id)
      const to = e && notifyOn(e) ? (e as any).line_user_id : null
      if (!to) { skipNoLine++; continue }
      const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ to, messages: [{ type: 'text', text: r.text }] }),
      })
      if (resp.ok) { sent++; continue }
      failed++
      let bodyTxt = ''; try { bodyTxt = await resp.text() } catch (_) { /* 讀不到不影響 */ }
      failDetail.push({ name: r.name, reason: `LINE 回應 ${resp.status}：${bodyTxt.slice(0, 100)}` })
    }
    if (failed || detectErrors.length) {
      try {
        await admin.from('notifications').insert({
          id: 'NT-DR' + Date.now().toString(36), recipient_type: 'desk', recipient_id: 'desk', type: 'line_push_fail',
          title: '⚠ 今日戰報推播有狀況',
          body: `${dateLabel}　發送 ${sent}、失敗 ${failed}、未綁定 ${skipNoLine}${failDetail.length ? '　—— ' + failDetail.map(f => f.name + '：' + f.reason).join('；').slice(0, 160) : ''}${detectErrors.length ? '　查詢錯誤：' + detectErrors.join('；').slice(0, 120) : ''}`,
          read: false, created_at: new Date().toISOString(),
        })
      } catch (_) { /* 記錄失敗不影響推播 */ }
    }
    return J({ ok: true, date: today, sent, skip_no_line: skipNoLine, failed, fail_detail: failDetail, detect_errors: detectErrors })
  } catch (e) {
    return J({ error: String((e && (e as any).message) || e) }, 500)
  }
})
