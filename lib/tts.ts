import textToSpeech from '@google-cloud/text-to-speech'

const client = new textToSpeech.TextToSpeechClient()

export async function synthesizeSpeech(text: string): Promise<string> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Wavenet-F',   // warm, female voice suitable for children
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.9,          // slightly slower for young children
      pitch: 2.0,                 // slightly higher, friendly tone
    },
  })

  const audioContent = response.audioContent
  if (!audioContent) throw new Error('No audio content returned from TTS')

  // Return base64 string regardless of whether it came back as Buffer or string
  if (typeof audioContent === 'string') return audioContent
  return Buffer.from(audioContent).toString('base64')
}
