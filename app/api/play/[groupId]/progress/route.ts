import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  await params // groupId not needed — progress keyed by studentId
  const body = await request.json()
  const { studentId, next_char, goal_word } = body

  if (!studentId) {
    return Response.json({ error: 'studentId is required' }, { status: 400 })
  }
  if (next_char === undefined && goal_word === undefined) {
    return Response.json({ error: 'next_char or goal_word is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (next_char !== undefined) updates.next_char = next_char
  if (goal_word !== undefined) updates.goal_word = goal_word  // null clears it (full name written)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('student_progress')
    .update(updates)
    .eq('student_id', studentId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
