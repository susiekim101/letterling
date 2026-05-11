import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name } = await request.json()
    if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ userId: data.user.id })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
