import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const body = await request.json()
  const { studentId, next_char, goal_word } = body

  if (!studentId || typeof studentId !== 'string') {
    return Response.json({ error: 'studentId is required' }, { status: 400 })
  }
  if (next_char === undefined && goal_word === undefined) {
    return Response.json({ error: 'next_char or goal_word is required' }, { status: 400 })
  }
  if (next_char !== undefined && (!Number.isInteger(next_char) || next_char < 0)) {
    return Response.json({ error: 'next_char must be a non-negative integer' }, { status: 400 })
  }
  if (goal_word !== undefined && goal_word !== null) {
    if (typeof goal_word !== 'string' || goal_word.length > 50 || !/^[a-zA-Z\s'-]+$/.test(goal_word)) {
      return Response.json({ error: 'Invalid goal_word' }, { status: 400 })
    }
  }
  if (next_char === undefined && goal_word === undefined) {
    return Response.json({ error: 'next_char or goal_word is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (next_char !== undefined) updates.next_char = next_char
  if (goal_word !== undefined) updates.goal_word = goal_word  // null clears it (full name written)

  const supabase = createAdminClient()

  // Verify the student belongs to this group before updating
  const { data: student, error: sErr } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('group_id', groupId)
    .single()
  if (sErr || !student) {
    return Response.json({ error: 'Student not found in this group' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (next_char !== undefined) updates.next_char = next_char
  if (goal_word !== undefined) updates.goal_word = goal_word  // null clears it (full name written)

  const { error } = await supabase
    .from('student_progress')
    .update(updates)
    .eq('student_id', studentId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
