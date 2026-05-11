import { isValidGroupCodeInput } from '@/lib/group-code'
import { consumeJoinAttempt, getJoinThrottleKey } from '@/lib/join-throttle'
import { createPlaySession, setPlaySessionCookie } from '@/lib/play-session'
import { getHostedSessionInvalidMessage, isHostedSessionValid } from '@/lib/session-host'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return Response.json({ error: 'code is required' }, { status: 400 })

    if (!isValidGroupCodeInput(code)) {
      return Response.json({ error: 'Enter a valid classroom code.' }, { status: 400 })
    }

    const throttle = consumeJoinAttempt(getJoinThrottleKey(request.headers))
    if (!throttle.allowed) {
      return Response.json(
        {
          error: 'Too many join attempts. Wait a moment and try again.',
          retryAfterSeconds: throttle.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } }
      )
    }

    const parsed = parseInt(code, 10)

    const supabase = createAdminClient()
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, status, session_id, play_session_version')
      .eq('group_code', parsed)
      .single()

    if (error || !group) {
      return Response.json(
        { error: "That classroom code isn't ready right now. Ask your teacher to check it." },
        { status: 404 }
      )
    }
    if (group.status !== 'active' || !group.session_id) {
      return Response.json(
        { error: "That classroom code isn't ready right now. Ask your teacher to check it." },
        { status: 400 }
      )
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, teacher_id, status, host_last_seen_at')
      .eq('id', group.session_id)
      .single()

    if (sessionError || !isHostedSessionValid(session)) {
      return Response.json(
        { error: getHostedSessionInvalidMessage() },
        { status: 403 }
      )
    }

    const newVersion = (group.play_session_version ?? 1) + 1
    const { error: versionError } = await supabase
      .from('groups')
      .update({ play_session_version: newVersion })
      .eq('id', group.id)

    if (versionError) {
      return Response.json({ error: 'Server error' }, { status: 500 })
    }

    const response = NextResponse.json({ groupId: group.id, tabVersion: newVersion })
    const playSession = createPlaySession(group.id, group.session_id, newVersion)
    return setPlaySessionCookie(response, playSession)
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
