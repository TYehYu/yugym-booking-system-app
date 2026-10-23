/* 臨時停課的 LINE 通知（2026-10-23 建立）

   起因：臨時停課那張視窗的勾選寫著「發 LINE 通知會員」、確認視窗還寫
   「N 位會員會立刻收到 LINE 通知 —— 這個收不回來」，**兩句都是假的**。
   前端的 pushNotification 只寫進 notifications 表（App 裡的通知），
   而會發 LINE 的那幾支（line-push-daily / line-daily-report / line-punch-remind）
   讀的全是別的表，沒有任何東西會把那則通知推成 LINE。
   使用者 2026-10-23：「順便把發line功能完善」。

   ⚠ 為什麼不接任意文字：line-push-test 就是因為「可以發任意訊息」而在 2026-07-25
     被刻意停掉。這支不把那個洞開回來 —— 外面只能給「日期」與「延幾天」，
     文字在這裡組，而且只發給**那一天真的被臨時停課停掉的課**的會員。

   ⚠ 名單從資料庫自己查，不吃前端給的會員清單：
     判準＝那天 status='cancelled' 且 cancel_reason 以「臨時停課」或「天災停課」開頭的預約
     （1023 起理由可以自己打，但前綴固定 —— 只認前綴，不認理由本身）。
     會員同時看 member_id（教練課／體驗／自主訓練）與 member_ids（團課）——
     只看後者是 10/22 那次 31 堂只通知到 4 位的原因。

   ⚠ 重按不重發：每發成功一位就寫一筆 notifications（type='cday_line'），
     下次同一天同一位就跳過。讀不到就整個不發（寧可不發，也不要重複發）。

   ⚠ LINE 純文字不吃 Markdown：不要寫 ** 與 _。

   body: { date:'YYYY-MM-DD', extDays?:7, reasonKey?:'typhoon|power|maintenance|closed|other', dryRun?:true } */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const nid = () => 'NT-CD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* 與 line-push-daily 同一套人話（403＝沒加好友是最常見的那一種） */
const humanErr = (status: number, body: string) => {
  const s = String(body || '');
  if (status === 403 || /not.*friend|blocked/i.test(s)) return '會員尚未把官方帳號加為好友（或已封鎖）';
  if (status === 401) return '官方帳號金鑰失效，請管理員重新設定';
  if (status === 429) return 'LINE 推播次數已達上限';
  if (status === 400 && /invalid.*to|user/i.test(s)) return 'LINE 使用者代碼無效，請請會員重新綁定';
  return `LINE 回應 ${status}：${s.slice(0, 120)}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const J = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const b = await req.json().catch(() => ({} as any));
    const dryRun = !!b.dryRun;

    const url = Deno.env.get('SUPABASE_URL') || '';
    const skey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!url || !skey) return J({ ok: false, error_code: 'NO_KEYS' }, 500);
    const admin = createClient(url, skey);

    /* ── 誰在呼叫 ──────────────────────────────────────────────────────
       兩條路：
       ① 人按按鈕 → JWT 對得到一位在職的管理員或主管
          （與前端 isManagerUp／fn_set_employment_type 同一條）
       ② pg_cron 排程 → 沒有人的身分，授權存在 cday_line_jobs 那一列上
          （只有管理員寫得進去）。不把 service_role 金鑰塞進 cron.job。
       ⚠ 排程這條只認「到期、還沒做、日期與參數都照資料庫那一列」的任務，
         body 給的 date／extDays 一律被那一列覆蓋 —— 排程不能自己決定發什麼。 */
    let who = '';
    let job: any = null;
    const scheduled = !!b.scheduled;
    if (scheduled) {
      const { data: jobs, error: jErr } = await admin.from('cday_line_jobs')
        .select('*').is('done_at', null).lte('run_after', new Date().toISOString())
        .order('run_after', { ascending: true }).limit(1);
      if (jErr) return J({ ok: false, error_code: 'JOB_QUERY', detail: jErr.message }, 500);
      job = (jobs || [])[0] || null;
      if (!job) return J({ ok: true, scheduled: true, skipped: 'no_due_job' });
      who = 'cron(' + String(job.created_by || '') + ')';
    } else {
      const auth = req.headers.get('Authorization') || '';
      const jwt = auth.replace(/^Bearer\s+/i, '');
      if (!jwt) return J({ ok: false, error_code: 'AUTH.FORBIDDEN' }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      const uid = u && u.user && u.user.id;
      if (!uid) return J({ ok: false, error_code: 'AUTH.FORBIDDEN' }, 401);
      const { data: me } = await admin.from('employees')
        .select('id,name,role,is_manager,status').eq('auth_id', uid).maybeSingle();
      if (!me || (me as any).status === 'inactive') return J({ ok: false, error_code: 'AUTH.FORBIDDEN' }, 403);
      if ((me as any).role !== 'admin' && !(me as any).is_manager) {
        return J({ ok: false, error_code: 'AUTH.NOT_MANAGER' }, 403);
      }
      who = (me as any).name || (me as any).id;
    }

    /* 排程的參數一律以資料庫那一列為準（body 只是觸發） */
    const date = String(job ? job.close_date : (b.date || '')).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return J({ ok: false, error_code: 'DATE.INVALID' }, 400);
    const extDays = Math.max(0, Math.min(60, Number(job ? job.ext_days : b.extDays) || 0));
    /* 發給會員的那一句只能從這張白名單來（2026-10-23）——
       使用者在視窗裡可以自己打理由，但那句只進系統與課卡，不會跑到 LINE。
       外面傳的是 key，對不上就退回「因故停課」。 */
    const LINE_REASON: Record<string,string> = {
      typhoon:'因颱風停課', power:'因停電停課', maintenance:'因設備維修停課',
      closed:'因臨時停業停課', other:'因故停課',
    };
    const reasonLine = LINE_REASON[String((job ? job.reason_key : b.reasonKey) || '')] || '因故停課';

    /* ── 名單：那天真的被臨時停課停掉的課（不吃前端給的清單）── */
    /* ⚠ 兩種前綴都要認（2026-10-23）：10/23 以前寫死「天災停課」，
       之後改成「臨時停課・<理由>」—— 使用者可以自己打理由，前綴固定。
       只認前綴、不認理由本身，所以使用者打什麼都不影響這裡找得到課。 */
    const { data: bks, error: bkErr } = await admin.from('bookings')
      .select('id,member_id,member_ids,cancel_reason,status')
      .eq('date', date).eq('status', 'cancelled')
      .or('cancel_reason.like.臨時停課*,cancel_reason.like.天災停課*');
    if (bkErr) return J({ ok: false, error_code: 'BOOKINGS_QUERY', detail: bkErr.message }, 500);
    const ids = new Set<string>();
    for (const x of (bks || [])) {
      if ((x as any).member_id) ids.add(String((x as any).member_id));
      const arr = (x as any).member_ids;
      if (Array.isArray(arr)) for (const m of arr) if (m) ids.add(String(m));
    }
    if (!ids.size) {
      /* 那天沒有被停課的課 → 沒事可做，但任務也算結束（不要每小時重試） */
      if (job) { try{ await admin.from('cday_line_jobs').update({ done_at:new Date().toISOString(),
        result:{ ok:true, members:0, note:'那天沒有被臨時停課停掉的課' } }).eq('id', job.id); }catch(_){} }
      return J({ ok: true, date, bookings: (bks || []).length, members: 0, sent: 0 });
    }

    /* ── 已經發過的不重發 ── */
    const { data: done, error: dErr } = await admin.from('notifications')
      .select('recipient_id').eq('type', 'cday_line').like('body', '%' + date + '%');
    if (dErr) return J({ ok: false, error_code: 'DEDUP_QUERY', detail: dErr.message }, 500);
    const sentAlready = new Set<string>((done || []).map((x: any) => String(x.recipient_id)));

    const { data: mems, error: mErr } = await admin.from('members')
      .select('id,name,line_user_id,line_notify').in('id', [...ids]);
    if (mErr) return J({ ok: false, error_code: 'MEMBERS_QUERY', detail: mErr.message }, 500);

    const md = date.slice(5).replace('-', '/');
    /* 沒有展延時那一行要整行消失，不能留一個空行（與 line-push-daily 的場地那一行同一個做法）。
       ⚠ 空字串在這裡是「真的要一個空行」，所以不能用 filter(Boolean) 整串清掉 —— 分段組。 */
    const text = ['【有肌訓練 貼心提醒】', '停課通知', '']
      .concat([`${reasonLine}，${md} 的課程已取消。`, '這一堂沒有扣堂數。'])
      .concat(extDays > 0 ? [`票券效期已延長 ${extDays} 天。`] : [])
      .concat(['', '請重新預約，造成不便請見諒。', '',
        '（這是系統自動發送的訊息，直接回覆不會有人看到；需要協助請聯繫櫃檯）'])
      .join('\n');

    if (dryRun) {
      return J({
        ok: true, dryRun: true, date, bookings: (bks || []).length,
        members: ids.size, already_sent: sentAlready.size,
        no_line: (mems || []).filter((m: any) => !m.line_user_id).length,
        opt_out: (mems || []).filter((m: any) => m.line_notify === false).length,
        text,
      });
    }
    if (!token) return J({ ok: false, error_code: 'NO_TOKEN' }, 500);

    let sent = 0, skipSent = 0, skipNoLine = 0, skipOptOut = 0, failed = 0;
    const failDetail: Array<{ member: string; reason: string }> = [];
    for (const m of (mems || [])) {
      const mid = String((m as any).id);
      if (sentAlready.has(mid)) { skipSent++; continue; }
      if (!(m as any).line_user_id) { skipNoLine++; continue; }
      if ((m as any).line_notify === false) { skipOptOut++; continue; }
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ to: (m as any).line_user_id, messages: [{ type: 'text', text }] }),
      });
      if (r.ok) {
        sent++;
        /* 留痕＝下次的去重依據。寫失敗就不算發過（寧可重發一次，也不要查不到） */
        try {
          await admin.from('notifications').insert({
            id: nid(), recipient_type: 'member', recipient_id: mid, type: 'cday_line',
            title: '停課通知（LINE 已送出）',
            body: `${date} 全館停課的 LINE 通知已送出` + (extDays > 0 ? `，票券效期 +${extDays} 天` : ''),
            read: true, created_at: new Date().toISOString(),
          });
        } catch (_) { /* 留痕失敗不影響推播本身 */ }
        continue;
      }
      failed++;
      let rb = '';
      try { rb = await r.text(); } catch (_) { /* 讀不到內容不影響主流程 */ }
      const why = humanErr(r.status, rb);
      failDetail.push({ member: (m as any).name || mid, reason: why });
      try {
        await admin.from('notifications').insert({
          id: nid(), recipient_type: 'desk', recipient_id: 'desk', type: 'line_push_fail',
          title: '⚠ 停課的 LINE 通知沒送到',
          body: `${(m as any).name || mid}　${md} 停課通知　—— ${why}`,
          read: false, created_at: new Date().toISOString(),
        });
      } catch (_) { /* 記錄失敗不影響其他人 */ }
    }
    const out = {
      ok: true, date, bookings: (bks || []).length, members: ids.size,
      sent, skip_already_sent: skipSent, skip_no_line: skipNoLine, skip_opt_out: skipOptOut,
      failed, fail_detail: failDetail, by: who,
    };
    /* 一次性：做完就封印那一列，排程再跑也不會重來（函式自己的去重是第二道） */
    if (job) {
      try {
        await admin.from('cday_line_jobs')
          .update({ done_at: new Date().toISOString(), result: out }).eq('id', job.id);
      } catch (_) { /* 寫不回去就讓它留著；下一輪會再跑，但人不會收到第二封（已去重） */ }
    }
    return J(out);
  } catch (e) {
    return J({ ok: false, error_code: String((e as Error)?.message || e) }, 500);
  }
});
