import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const groupId = request.nextUrl.searchParams.get('group_id')
  let query = supabase.from('students').select('*').order('first_name')
  if (groupId) query = query.eq('group_id', groupId)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { first_name, last_name, parent_email, group_id } = body

  if (!first_name || !last_name) {
    return Response.json({ error: 'first_name and last_name are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('students')
    .insert({ first_name, last_name, parent_email, group_id, teacher_id: user.id })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
