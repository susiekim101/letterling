import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name } = await request.json()
    if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: full_name ?? '' },
      },
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({
      userId: data.user?.id ?? null,
      requiresEmailConfirmation: !data.session,
    })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
