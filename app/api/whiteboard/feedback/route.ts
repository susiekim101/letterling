import { createClient } from '@/lib/supabase/server'
import { analyzeHandwriting } from '@/lib/gemini'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { imageBase64, mimeType = 'image/png', targetLetter, sessionId, studentId, groupId } = body

  if (!imageBase64 || !targetLetter || !sessionId || !studentId || !groupId) {
    return Response.json(
      { error: 'imageBase64, targetLetter, sessionId, studentId, and groupId are required' },
      { status: 400 }
    )
  }

  const feedback = await analyzeHandwriting(imageBase64, mimeType, targetLetter)

  // Persist to whiteboard_states
  await supabase.from('whiteboard_states').insert({
    session_id: sessionId,
    student_id: studentId,
    teacher_id: user.id,
    group_id: groupId,
    letter: targetLetter,
    gemini_feedback_text: feedback.feedbackText,
    gemini_whiteboard_feedback: { annotations: feedback.annotations },
    is_successful: feedback.isSuccessful,
  })

  return Response.json(feedback)
}
