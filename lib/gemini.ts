import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export interface StrokeAnnotation {
  stroke_id: number
  error_type: string         // e.g. "angle", "length", "direction", "curve"
  center: [number, number]   // 0-1000 normalized coords of the problem spot
  instruction: string        // short, child-friendly description of the error
}

export interface HandwritingFeedback {
  recognizedLetter: string | null  // what the drawing most looks like, uppercase single char
  isWrongLetter: boolean           // true when recognizedLetter doesn't match the target
  isSuccessful: boolean
  feedbackText: string     // 1-2 sentences of verbal encouragement/guidance
  annotations: StrokeAnnotation[]  // passed to editor.createShapes()
}

const SYSTEM_PROMPT =
`You are a friendly, encouraging teacher helping a young child (ages 3-6) learn to write letters.
Analyze the child's handwriting attempt and provide warm, positive feedback appropriate for their age.
Always respond with valid JSON matching this exact schema:
{
  "recognizedLetter": string | null,
  "isWrongLetter": boolean,
  "isSuccessful": boolean,
  "feedbackText": string,
  "annotations": [
    {
      "stroke_id": number,
      "error_type": string,
      "center": [x, y],
      "instruction": string
    }
  ]
}
Rules (evaluate in this order):
1. recognizedLetter: Look at the drawing and decide what letter it most resembles. Return a single uppercase letter (e.g. "B"), or null if it is just scribbles with no recognizable letter shape at all.
2. isWrongLetter: true if recognizedLetter is not null AND it does not match the target letter. When isWrongLetter is true, isSuccessful MUST be false and annotations MUST be [].
3. isSuccessful: true if the drawing matches the target letter and an adult can recognize it, even if wobbly or imperfect. Be very generous — this is a 3-6 year old. Only false if unrecognizable or a different letter.
4. feedbackText: 1-2 sentences spoken aloud to the child.
   - If isWrongLetter is true: be kind and tell them what their letter looks like, then encourage them to try the right one. Never say "wrong". Example: "Good try! That looks like a B! We're practicing the letter D — give it another go!"
   - If isSuccessful is true: give warm celebration. Example: "Great job! That looks just like the letter S!"
   - If isSuccessful is false and isWrongLetter is false: describe the circled areas by color — the 1st circle is RED, the 2nd is BLUE, the 3rd is GREEN. Example: "Good try! Look at the red circle — try pulling that line down more."
5. annotations: only when isSuccessful is false AND isWrongLetter is false — up to 3 problem spots. Empty [] otherwise.
- center: 0-1000 scale where (0,0) is top-left and (1000,1000) is bottom-right. Never use raw pixel values.
- error_type examples: "angle", "direction", "length", "curve", "start_point"
- instruction: one short phrase, e.g. "Pull down more", "Start higher", "Curve left here", "Too short"`

export async function analyzeHandwriting(
  imageBase64: string,
  mimeType: 'image/png' | 'image/jpeg',
  targetLetter: string
): Promise<HandwritingFeedback> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
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
            text: targetLetter.length > 1
              ? `The child is trying to write their full name "${targetLetter}". Analyze their handwriting and give feedback.`
              : `The child is trying to write the letter "${targetLetter.toUpperCase()}". Analyze their drawing and give feedback.`,
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

  // Validate required shape before trusting the response
  if (
    typeof parsed.isSuccessful !== 'boolean' ||
    typeof parsed.isWrongLetter !== 'boolean' ||
    typeof parsed.feedbackText !== 'string' ||
    !Array.isArray(parsed.annotations)
  ) {
    throw new Error('Unexpected Gemini response shape')
  }

  // Enforce contracts
  if (parsed.isWrongLetter) {
    parsed.isSuccessful = false
    parsed.annotations = []
  }
  if (parsed.isSuccessful) parsed.annotations = []
  // Cap to 3 annotations regardless of what Gemini returns
  parsed.annotations = parsed.annotations.slice(0, 3)

  return parsed
}
