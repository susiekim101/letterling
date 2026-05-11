import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export interface StrokeAnnotation {
  stroke_id: number
  error_type: string         // e.g. "angle", "length", "direction", "curve"
  center: [number, number]   // 0-1000 normalized coords of the problem spot
  instruction: string        // short, child-friendly description of the error
}

export interface HandwritingFeedback {
  isSuccessful: boolean
  feedbackText: string     // 1-2 sentences of verbal encouragement/guidance
  annotations: StrokeAnnotation[]  // passed to editor.createShapes()
}

const SYSTEM_PROMPT =
`You are a friendly, encouraging teacher helping a young child (ages 3-6) learn to write letters.
Analyze the child's handwriting attempt and provide warm, positive feedback appropriate for their age.
Always respond with valid JSON matching this exact schema:
{
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
Rules:
- isSuccessful: true if an adult can recognize the intended letter, even if wobbly or imperfect. Be very generous — this is a 3-6 year old child. Only set false if the letter is genuinely unrecognizable or is clearly a different letter.
- If isSuccessful is true, annotations MUST be empty []. Do not add corrections when the letter is recognized.
- feedbackText: 1-2 sentences spoken aloud to the child. If isSuccessful is true, give warm celebration (e.g. "Great job! That looks just like the letter S!"). If there are annotations, describe each circled area by color: the 1st circle is RED, the 2nd is BLUE, the 3rd is GREEN. Example: "Good try! Look at the red circle — try pulling that line down more. The blue circle shows where to start a bit higher."
- annotations: only when isSuccessful is false — up to 3 problem spots, each marking a distinct error in a different part of the image. Empty [] if isSuccessful is true.
- center: the center point of the problem area using a 0-1000 scale where (0,0) is top-left and (1000,1000) is bottom-right. Never use raw pixel values.
- error_type examples: "angle", "direction", "length", "curve", "start_point"
- instruction: one short phrase describing what is wrong at this exact spot, e.g. "Pull down more", "Start higher", "Curve left here", "Too short"`

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
    typeof parsed.feedbackText !== 'string' ||
    !Array.isArray(parsed.annotations)
  ) {
    throw new Error('Unexpected Gemini response shape')
  }

  // Enforce contract: successful means no corrections
  if (parsed.isSuccessful) parsed.annotations = []
  // Cap to 3 annotations regardless of what Gemini returns
  parsed.annotations = parsed.annotations.slice(0, 3)

  return parsed
}
