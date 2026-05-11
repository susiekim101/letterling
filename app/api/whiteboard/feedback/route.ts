import { createClient } from '@/lib/supabase/server'
import { analyzeHandwriting } from '@/lib/gemini'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    imageBase64,
    mimeType = 'image/png',
    targetLetter,
    sessionId,
    studentId,
    groupId,
    letterIndex,
  } = body

  if (!imageBase64 || !targetLetter || !sessionId || !studentId || !groupId) {
    return Response.json(
      { error: 'imageBase64, targetLetter, sessionId, studentId, and groupId are required' },
      { status: 400 }
    )
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, session_id, teacher_id')
    .eq('id', groupId)
    .eq('teacher_id', user.id)
    .single()

  if (groupError || !group || group.session_id !== sessionId) {
    return Response.json({ error: 'Group not found' }, { status: 404 })
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()

  if (sessionError || !session) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, teacher_id')
    .eq('id', studentId)
    .eq('teacher_id', user.id)
    .single()

  if (studentError || !student) {
    return Response.json({ error: 'Student not found' }, { status: 404 })
  }

  const { data: membership, error: membershipError } = await supabase
    .from('group_memberships')
    .select('id')
    .eq('session_id', sessionId)
    .eq('group_id', groupId)
    .eq('student_id', studentId)
    .eq('teacher_id', user.id)
    .neq('status', 'removed')
    .maybeSingle()

  if (membershipError) {
    return Response.json({ error: membershipError.message }, { status: 500 })
  }

  if (!membership) {
    return Response.json({ error: 'Student is not part of this group.' }, { status: 403 })
  }

  const feedback = await analyzeHandwriting(imageBase64, mimeType, targetLetter)
  let attemptNumber: number | null = null

  if (typeof letterIndex === 'number') {
    const { count, error: countError } = await supabase
      .from('whiteboard_states')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('teacher_id', user.id)
      .eq('letter_index', letterIndex)

    if (countError) {
      return Response.json({ error: countError.message }, { status: 500 })
    }

    attemptNumber = (count ?? 0) + 1
  }

  // Persist to whiteboard_states
  const { error: insertError } = await supabase.from('whiteboard_states').insert({
    session_id: sessionId,
    student_id: studentId,
    teacher_id: user.id,
    group_id: groupId,
    letter: targetLetter,
    letter_index: typeof letterIndex === 'number' ? letterIndex : null,
    attempt_number: attemptNumber,
    whiteboard_data: {
      mimeType,
      imageBase64,
      targetLetter,
      letterIndex: typeof letterIndex === 'number' ? letterIndex : null,
      source: 'teacher-feedback',
    },
    gemini_feedback_text: feedback.feedbackText,
    gemini_whiteboard_feedback: { annotations: feedback.annotations },
    is_successful: feedback.isSuccessful,
  })

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  return Response.json(feedback)
}
