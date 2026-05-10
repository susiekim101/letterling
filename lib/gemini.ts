import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export interface StrokeAnnotation {
  stroke_id: number
  error_type: string       // e.g. "angle", "pressure", "length", "direction"
  arrow_start: [number, number]  // pixel coordinates on the canvas
  arrow_end: [number, number]
  instruction: string      // short, child-friendly instruction
}

export interface HandwritingFeedback {
  isSuccessful: boolean
  feedbackText: string     // 1-2 sentences of verbal encouragement/guidance
  annotations: StrokeAnnotation[]  // passed to editor.createShapes()
}

const SYSTEM_PROMPT = `You are a friendly, encouraging teacher helping a young child (ages 3-6) learn to write letters.
Analyze the child's handwriting attempt and provide warm, positive feedback appropriate for their age.
Always respond with valid JSON matching this exact schema:
{
  "isSuccessful": boolean,
  "feedbackText": string,
  "annotations": [
    {
      "stroke_id": number,
      "error_type": string,
      "arrow_start": [x, y],
      "arrow_end": [x, y],
      "instruction": string
    }
  ]
}
Rules:
- isSuccessful: true if the letter is recognizable and reasonably well-formed for a young child
- feedbackText: 1-2 short, warm sentences. Celebrate success or gently guide them.
- annotations: list of stroke-level corrections using pixel coordinates from the image. Each arrow points from where the stroke went to where it should go. Keep empty [] if the attempt is successful or corrections are not needed.
- error_type examples: "angle", "direction", "length", "curve", "start_point"
- instruction: one short phrase like "Pull down more sharply" or "Start higher up"`

export async function analyzeHandwriting(
  imageBase64: string,
  mimeType: 'image/png' | 'image/jpeg',
  targetLetter: string
): Promise<HandwritingFeedback> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          {
            text: `The child is trying to write the letter "${targetLetter.toUpperCase()}". Analyze their drawing and give feedback.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
    },
  })

  const text = response.text ?? ''
  const parsed = JSON.parse(text) as HandwritingFeedback
  return parsed
}
