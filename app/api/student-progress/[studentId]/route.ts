import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch existing progress or auto-create a row
  let { data, error } = await supabase
    .from('student_progress')
    .select('*')
    .eq('student_id', studentId)
    .single()

  if (error && error.code === 'PGRST116') {
    // No row yet — create one
    const { data: student } = await supabase
      .from('students')
      .select('first_name')
      .eq('id', studentId)
      .single()

    const insert = await supabase
      .from('student_progress')
      .insert({
        student_id: studentId,
        teacher_id: user.id,
        next_char: 0,
        goal_word: student?.first_name ?? null,
      })
      .select()
      .single()

    data = insert.data
    error = insert.error
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { next_char, goal_word } = body

  const updates: Record<string, unknown> = {}
  if (next_char !== undefined) updates.next_char = next_char
  if (goal_word !== undefined) updates.goal_word = goal_word

  const { data, error } = await supabase
    .from('student_progress')
    .update(updates)
    .eq('student_id', studentId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
