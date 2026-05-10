import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('groups')
    .select('*, students(*)')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { letters_per_turn, num_students } = body

  if (!letters_per_turn || !num_students) {
    return Response.json({ error: 'letters_per_turn and num_students are required' }, { status: 400 })
  }

  // Generate a unique 6-digit group code
  const group_code = Math.floor(100000 + Math.random() * 900000)

  const { data, error } = await supabase
    .from('groups')
    .insert({ letters_per_turn, num_students, group_code, teacher_id: user.id })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
