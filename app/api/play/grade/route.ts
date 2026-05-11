import { analyzeHandwriting } from '@/lib/gemini'
import { NextRequest } from 'next/server'

const MAX_BASE64_CHARS = 4 * 1024 * 1024 // ~3 MB raw image
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg'])

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { imageBase64, mimeType = 'image/png', targetLetter } = body

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  }
  if (typeof targetLetter !== 'string' || !targetLetter) {
    return Response.json({ error: 'targetLetter is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return Response.json({ error: 'Invalid mimeType' }, { status: 400 })
  }
  if (targetLetter.length > 50 || !/^[a-zA-Z\s'-]+$/.test(targetLetter)) {
    return Response.json({ error: 'Invalid targetLetter' }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return Response.json({ error: 'Image too large' }, { status: 413 })
  }

  try {
    const feedback = await analyzeHandwriting(imageBase64, mimeType, targetLetter)
    return Response.json(feedback)
  } catch (e) {
    console.error('Grade error:', e)
    return Response.json(
      { isSuccessful: false, feedbackText: "Hmm, let's try that again!", annotations: [] }
    )
  }
}
