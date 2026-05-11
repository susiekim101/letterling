import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  await params // groupId not needed — progress keyed by studentId
  const body = await request.json()
  const { studentId, next_char } = body

  if (!studentId || next_char === undefined) {
    return Response.json({ error: 'studentId and next_char are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('student_progress')
    .update({ next_char, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
