import { synthesizeSpeech } from '@/lib/tts'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { text } = body

  if (!text || typeof text !== 'string' || text.length > 500) {
    return Response.json({ error: 'text is required and must be under 500 characters' }, { status: 400 })
  }

  const audioBase64 = await synthesizeSpeech(text)
  return Response.json({ audioBase64 })
}
