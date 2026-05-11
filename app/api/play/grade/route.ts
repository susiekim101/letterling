import { analyzeHandwriting } from '@/lib/gemini'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { imageBase64, mimeType = 'image/png', targetLetter } = body

  if (!imageBase64 || !targetLetter) {
    return Response.json({ error: 'imageBase64 and targetLetter are required' }, { status: 400 })
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
