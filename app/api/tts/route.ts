import { synthesizeSpeech } from '@/lib/tts'
import { invalidPlaySessionResponse, requirePlaySession } from '@/lib/play-session'
import { getHostedSessionInvalidMessage, isHostedSessionValid } from '@/lib/session-host'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { text, groupId } = body

  if (!text || typeof text !== 'string' || text.length > 500) {
    return Response.json({ error: 'text is required and must be under 500 characters' }, { status: 400 })
  }
  if (!groupId || typeof groupId !== 'string') {
    return Response.json({ error: 'groupId is required' }, { status: 400 })
  }

  const playSession = requirePlaySession(request, groupId)
  if (!playSession.ok) return playSession.response

  const supabase = createAdminClient()
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, status, session_id, play_session_version')
    .eq('id', groupId)
    .single()

  if (groupError || !group) {
    return Response.json({ error: 'Group not found' }, { status: 404 })
  }
  if (group.status !== 'active' || !group.session_id) {
    return invalidPlaySessionResponse('This session is no longer active.', 400)
  }
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id, status, host_last_seen_at')
    .eq('id', group.session_id)
    .single()

  if (sessionError || !isHostedSessionValid(session)) {
    return invalidPlaySessionResponse(getHostedSessionInvalidMessage(), 403)
  }
  if (group.session_id !== playSession.session.sessionId) {
    return invalidPlaySessionResponse('That session has expired. Join again to continue.', 403)
  }
  if (group.play_session_version !== playSession.session.sessionVersion) {
    return invalidPlaySessionResponse('That group has been logged out. Join again to continue.', 403)
  }

  try {
    const audioBase64 = await synthesizeSpeech(text)
    return Response.json({ audioBase64 })
  } catch (error) {
    console.error('TTS error:', error)
    const message =
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? error.message
        : 'Failed to synthesize speech'
    return Response.json({ error: message }, { status: 500 })
  }
}
