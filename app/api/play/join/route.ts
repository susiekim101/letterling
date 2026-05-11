import { createPlaySession, setPlaySessionCookie } from '@/lib/play-session'
import { getHostedSessionInvalidMessage, isHostedSessionValid } from '@/lib/session-host'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return Response.json({ error: 'code is required' }, { status: 400 })

    const parsed = parseInt(code, 10)
    if (isNaN(parsed)) return Response.json({ error: 'Invalid code' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, status, session_id, play_session_version')
      .eq('group_code', parsed)
      .single()

    if (error || !group) return Response.json({ error: 'Group not found' }, { status: 404 })
    if (group.status !== 'active' || !group.session_id) {
      return Response.json({ error: 'Session is not active' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, status, host_last_seen_at')
      .eq('id', group.session_id)
      .single()

    if (sessionError || !isHostedSessionValid(session)) {
      return Response.json({ error: getHostedSessionInvalidMessage() }, { status: 403 })
    }

    const response = NextResponse.json({ groupId: group.id })
    const playSession = createPlaySession(
      group.id,
      group.session_id,
      group.play_session_version ?? 1
    )
    return setPlaySessionCookie(response, playSession)
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
