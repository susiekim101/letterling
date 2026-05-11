import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return Response.json({ error: 'code is required' }, { status: 400 })

    const parsed = parseInt(code, 10)
    if (isNaN(parsed)) return Response.json({ error: 'Invalid code' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, status')
      .eq('group_code', parsed)
      .single()

    if (error || !group) return Response.json({ error: 'Group not found' }, { status: 404 })
    if (group.status !== 'active') return Response.json({ error: 'Session is not active' }, { status: 400 })

    return Response.json({ groupId: group.id })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
