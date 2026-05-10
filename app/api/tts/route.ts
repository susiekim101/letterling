import { synthesizeSpeech } from '@/lib/tts'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { text } = body

  if (!text || typeof text !== 'string') {
    return Response.json({ error: 'text is required' }, { status: 400 })
  }

  const audioBase64 = await synthesizeSpeech(text)
  return Response.json({ audioBase64 })
}
