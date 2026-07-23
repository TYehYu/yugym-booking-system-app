// Supabase Edge Function: create-staff-account（加固版 v4，2026-07-23）
//
// 🔴 修補的漏洞（v3 及更早）：本函式只驗 verify_jwt，而 anon key 本身就是合法 JWT 且
//    公開在 repo 的 config.js —— 任何人都能呼叫；更嚴重的是 v3 遇到「email 已存在」時
//    會**把該帳號密碼改成呼叫者給的值**（原意是修復半殘帳號），等於任何人都能重設
//    admin@staff.yugym.local 的密碼、接管管理員。
//
// v4 規則：
//   action='create'         建立員工帳號 —— 必須是**管理員本人的 JWT**；帳號已存在→409，不改密碼
//   action='reset_password' 重設密碼     —— 必須是**管理員本人的 JWT**
//   action='member_signup'  會員自助申辦 —— 允許匿名（公開 QR 入口），但：
//                             ・email 必須符合 09xxxxxxxx@member.yugym.local
//                             ・密碼至少 8 碼
//                             ・**帳號已存在一律拒絕（409），絕不改密碼**
//   共同：一律不回傳帳號是否存在以外的資訊；service_role 只在伺服器端使用。
//
// 備註：會員帳號無法用前端 signUp 建立（Supabase 對收不到信的網域回 "Email address is
//   invalid"），故一律走本函式的 admin.createUser（email_confirm:true 免驗證信）。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const J = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MEMBER_EMAIL = /^09\d{8}@member\.yugym\.local$/i
const STAFF_EMAIL = /^[a-z0-9._%+-]+@staff\.yugym\.local$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'create')
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!email || !password) return J({ error: '缺少 email 或 password' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )

    // 呼叫者身分：service_role client 可驗證任何使用者 JWT；anon key 沒有 sub → user 為 null
    const findCaller = async () => {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return null
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data?.user) return null
      const { data: emp } = await admin
        .from('employees').select('id,role,status').eq('auth_id', data.user.id).maybeSingle()
      if (!emp) return null
      if (emp.status === 'inactive' || emp.status === 'resigned') return null
      return emp as { id: string; role: string; status: string }
    }
    const findUserByEmail = async (target: string) => {
      let page = 1
      const perPage = 1000
      while (page <= 10) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
        if (error) return null
        const hit = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === target)
        if (hit) return hit
        if (!data || !data.users || data.users.length < perPage) return null
        page++
      }
      return null
    }

    // ── 會員自助申辦（公開入口，唯一免管理員的動作）──
    if (action === 'member_signup') {
      if (!MEMBER_EMAIL.test(email)) return J({ error: '帳號格式不正確' }, 400)
      if (password.length < 8) return J({ error: '密碼至少需要 8 個字元' }, 400)
      if (await findUserByEmail(email)) return J({ error: 'ACCOUNT_EXISTS' }, 409)
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) return J({ error: error.message }, 400)
      return J({ uid: data.user?.id ?? null, repaired: false })
    }

    // ── 以下動作一律需要「管理員本人」的 JWT（anon key 不算）──
    const caller = await findCaller()
    if (!caller || caller.role !== 'admin') return J({ error: 'FORBIDDEN：需管理員登入後操作' }, 403)

    if (action === 'reset_password') {
      if (!STAFF_EMAIL.test(email) && !MEMBER_EMAIL.test(email)) return J({ error: '帳號格式不正確' }, 400)
      if (password.length < 6) return J({ error: '密碼至少需要 6 個字元' }, 400)
      const user = await findUserByEmail(email)
      if (!user) return J({ error: '找不到此帳號' }, 404)
      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
      if (updErr) return J({ error: updErr.message }, 400)
      return J({ ok: true, uid: user.id, repaired: true })
    }

    if (action === 'create') {
      if (!STAFF_EMAIL.test(email)) return J({ error: '帳號格式不正確' }, 400)
      if (password.length < 6) return J({ error: '密碼至少需要 6 個字元' }, 400)
      if (await findUserByEmail(email)) return J({ error: 'ACCOUNT_EXISTS：此帳號已存在，請改用「重設密碼」' }, 409)
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) return J({ error: error.message }, 400)
      return J({ uid: data.user?.id ?? null, repaired: false })
    }

    return J({ error: '未知的 action' }, 400)
  } catch (e) {
    return J({ error: String((e as any)?.message || e) }, 500)
  }
})
