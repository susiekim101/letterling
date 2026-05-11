import { analyzeHandwriting, type HandwritingFeedback } from '@/lib/gemini'
import { invalidPlaySessionResponse, readPlaySession, validatePlayTabVersion } from '@/lib/play-session'
import { getHostedSessionInvalidMessage, isHostedSessionValid } from '@/lib/session-host'
import { MAX_LETTER_ATTEMPTS, cleanStudentName, getTargetLetter } from '@/lib/student-writing'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

const MAX_BASE64_CHARS = 4 * 1024 * 1024 // ~3 MB raw image
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg'])

type GradeResponse = HandwritingFeedback & {
  attemptLimit: number
  attemptsRemaining: number
  attemptsUsed: number
  blockedReason?: 'attempt_limit'
  targetLetter: string
}

function jsonFailure(
  message: string,
  options?: Partial<GradeResponse> & { status?: number }
) {
  const status = options?.status ?? 409

  return Response.json(
    {
      isSuccessful: false,
      feedbackText: message,
      annotations: [],
      attemptLimit: options?.attemptLimit ?? MAX_LETTER_ATTEMPTS,
      attemptsRemaining: options?.attemptsRemaining ?? MAX_LETTER_ATTEMPTS,
      attemptsUsed: options?.attemptsUsed ?? 0,
      blockedReason: options?.blockedReason,
      targetLetter: options?.targetLetter ?? '',
      error: message,
    },
    { status }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { imageBase64, mimeType = 'image/png' } = body

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return Response.json({ error: 'Invalid mimeType' }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return Response.json({ error: 'Image too large' }, { status: 413 })
  }

  const playSession = readPlaySession(request)
  if (!playSession) {
    return invalidPlaySessionResponse('Join the session again to continue.', 401)
  }

  const supabase = createAdminClient()

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, session_id, teacher_id, current_student_id, status, play_session_version')
    .eq('id', playSession.groupId)
    .single()

  if (groupError || !group) {
    return invalidPlaySessionResponse('This session is no longer active.', 404)
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

  if (group.session_id !== playSession.sessionId) {
    return invalidPlaySessionResponse('That session has expired. Join again to continue.', 403)
  }
  if (group.play_session_version !== playSession.sessionVersion) {
    return invalidPlaySessionResponse('That group has been logged out. Join again to continue.', 403)
  }
  if (!validatePlayTabVersion(request, group.play_session_version)) {
    return invalidPlaySessionResponse('This tab is no longer active. Re-enter the group code to continue.', 403)
  }

  if (!group.current_student_id) {
    return jsonFailure('Tap a name before checking a letter.', { status: 409 })
  }

  const { data: membership } = await supabase
    .from('group_memberships')
    .select('id')
    .eq('group_id', group.id)
    .eq('student_id', group.current_student_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    return jsonFailure('That student is no longer in this group.', { status: 403 })
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, first_name')
    .eq('id', group.current_student_id)
    .single()

  if (studentError || !student) {
    return jsonFailure('That student is no longer in this group.', { status: 403 })
  }

  const progressResult = await supabase
    .from('student_progress')
    .select('student_id, next_char, goal_word, finished_last_char')
    .eq('student_id', student.id)
    .eq('teacher_id', group.teacher_id)
    .maybeSingle()

  if (progressResult.error) {
    return Response.json({ error: progressResult.error.message }, { status: 500 })
  }

  let progress = progressResult.data

  if (!progress) {
    const { error: insertProgressError } = await supabase.from('student_progress').insert({
      student_id: student.id,
      teacher_id: group.teacher_id,
      next_char: 0,
      goal_word: student.first_name,
      finished_last_char: false,
    })

    if (insertProgressError) {
      return Response.json({ error: insertProgressError.message }, { status: 500 })
    }

    progress = {
      student_id: student.id,
      next_char: 0,
      goal_word: student.first_name,
      finished_last_char: false,
    }
  }

  const isFullNameStage = progress.finished_last_char && progress.goal_word !== null
  const targetLetter = isFullNameStage
    ? cleanStudentName(progress.goal_word ?? student.first_name)
    : getTargetLetter(progress.goal_word, student.first_name, progress.next_char)

  if (!targetLetter) {
    return jsonFailure('This word is already finished.', { status: 409 })
  }

  const { count: attemptCount, error: attemptError } = await supabase
    .from('whiteboard_states')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', group.session_id)
    .eq('group_id', group.id)
    .eq('student_id', student.id)
    .eq('teacher_id', group.teacher_id)
    .eq('letter_index', progress.next_char)

  if (attemptError) {
    return Response.json({ error: attemptError.message }, { status: 500 })
  }

  const attemptsUsed = attemptCount ?? 0

  if (attemptsUsed >= MAX_LETTER_ATTEMPTS) {
    return jsonFailure("You've used all 5 tries for this letter. Ask a teacher for help.", {
      status: 429,
      attemptLimit: MAX_LETTER_ATTEMPTS,
      attemptsRemaining: 0,
      attemptsUsed,
      blockedReason: 'attempt_limit',
      targetLetter,
    })
  }

  try {
    const feedback = await analyzeHandwriting(imageBase64, mimeType, targetLetter)
    const attemptNumber = attemptsUsed + 1

    const { error: insertAttemptError } = await supabase.from('whiteboard_states').insert({
      session_id: group.session_id,
      student_id: student.id,
      teacher_id: group.teacher_id,
      group_id: group.id,
      letter: targetLetter,
      letter_index: progress.next_char,
      attempt_number: attemptNumber,
      whiteboard_data: {
        mimeType,
        imageBase64,
        targetLetter,
        letterIndex: progress.next_char,
        source: 'play-grade',
      },
      gemini_feedback_text: feedback.feedbackText,
      gemini_whiteboard_feedback: { annotations: feedback.annotations },
      is_successful: feedback.isSuccessful,
    })

    if (insertAttemptError) {
      return Response.json({ error: insertAttemptError.message }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    await supabase
      .from('groups')
      .update({ last_active_at: nowIso })
      .eq('id', group.id)

    await supabase
      .from('group_memberships')
      .update({ joined_at: nowIso, last_active_at: nowIso })
      .eq('group_id', group.id)
      .eq('student_id', student.id)
      .eq('status', 'active')

    const response: GradeResponse = {
      ...feedback,
      attemptLimit: MAX_LETTER_ATTEMPTS,
      attemptsUsed: attemptNumber,
      attemptsRemaining: Math.max(0, MAX_LETTER_ATTEMPTS - attemptNumber),
      targetLetter,
    }

    return Response.json(response)
  } catch (e) {
    console.error('Grade error:', e)

    return Response.json({
      isSuccessful: false,
      feedbackText: "Hmm, let's try that again!",
      annotations: [],
      attemptLimit: MAX_LETTER_ATTEMPTS,
      attemptsUsed,
      attemptsRemaining: Math.max(0, MAX_LETTER_ATTEMPTS - attemptsUsed),
      targetLetter,
    } satisfies GradeResponse)
  }
}
