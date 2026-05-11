import 'server-only'

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { createHash } from 'node:crypto'

const VOICE_ID = 'eppqEXVumQ3CfdndcIBd'
const PRIMARY_MODEL = 'eleven_v3'
const FALLBACK_MODEL = 'eleven_multilingual_v2'
const OUTPUT_FORMAT = 'mp3_44100_128'

const clipCache = new Map<string, string>()
const inFlightRequests = new Map<string, Promise<string>>()

let client: ElevenLabsClient | null = null

function getClient() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY')
  }

  client ??= new ElevenLabsClient({ apiKey })
  return client
}

function getCacheKey(text: string) {
  return createHash('sha256')
    .update(JSON.stringify({ text, voiceId: VOICE_ID, outputFormat: OUTPUT_FORMAT }))
    .digest('hex')
}

async function streamToBase64(audioStream: ReadableStream<Uint8Array>) {
  const reader = audioStream.getReader()
  const chunks: Buffer[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(Buffer.from(value))
  }

  if (chunks.length === 0) {
    throw new Error('No audio content returned from ElevenLabs')
  }

  return Buffer.concat(chunks).toString('base64')
}

async function synthesizeWithModel(text: string, modelId: string) {
  const audioStream = await getClient().textToSpeech.convert(VOICE_ID, {
    modelId,
    outputFormat: OUTPUT_FORMAT,
    text,
  })

  return streamToBase64(audioStream)
}

async function synthesizeWithFallback(text: string) {
  try {
    return await synthesizeWithModel(text, PRIMARY_MODEL)
  } catch (primaryError) {
    console.warn(
      `ElevenLabs TTS failed for ${PRIMARY_MODEL}, retrying ${FALLBACK_MODEL}`,
      primaryError
    )
    return synthesizeWithModel(text, FALLBACK_MODEL)
  }
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const cacheKey = getCacheKey(text)
  const cached = clipCache.get(cacheKey)
  if (cached) return cached

  const inFlight = inFlightRequests.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async () => {
    try {
      const audioBase64 = await synthesizeWithFallback(text)
      clipCache.set(cacheKey, audioBase64)
      return audioBase64
    } finally {
      inFlightRequests.delete(cacheKey)
    }
  })()

  inFlightRequests.set(cacheKey, request)
  return request
}
