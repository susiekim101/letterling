import 'server-only'

import { createHash } from 'node:crypto'

const DEFAULT_VOICE_ID = 'eppqEXVumQ3CfdndcIBd'
const PRIMARY_MODEL = 'eleven_flash_v2_5'
const FALLBACK_MODEL = 'eleven_turbo_v2_5'
const OUTPUT_FORMAT = 'mp3_22050_32'
const LATENCY_OPTIMIZATION = 3
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

const clipCache = new Map<string, string>()
const inFlightRequests = new Map<string, Promise<string>>()

function getApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY')
  }

  return apiKey
}

function getVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID
}

function getCacheKey(text: string) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        text,
        voiceId: getVoiceId(),
        modelId: PRIMARY_MODEL,
        outputFormat: OUTPUT_FORMAT,
      })
    )
    .digest('hex')
}

async function readErrorDetails(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: unknown; message?: unknown }
      | null
    if (typeof payload?.detail === 'string') return payload.detail
    if (typeof payload?.message === 'string') return payload.message
    if (payload?.detail) return JSON.stringify(payload.detail)
  }

  const text = await response.text().catch(() => '')
  if (text) return text
  return `HTTP ${response.status}`
}

async function synthesizeViaHttp(text: string, modelId: string) {
  const voiceId = getVoiceId()
  const apiKey = getApiKey()
  const url = new URL(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`)
  url.searchParams.set('optimize_streaming_latency', String(LATENCY_OPTIMIZATION))
  url.searchParams.set('output_format', OUTPUT_FORMAT)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      use_pvc_as_ivc: true,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const details = await readErrorDetails(response)
    throw new Error(`ElevenLabs request failed (${response.status}): ${details}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())
  if (audioBuffer.length === 0) throw new Error('No audio content returned from ElevenLabs')

  return audioBuffer.toString('base64')
}

async function synthesizeWithFallback(text: string) {
  try {
    return await synthesizeViaHttp(text, PRIMARY_MODEL)
  } catch (primaryError) {
    console.warn(
      `ElevenLabs TTS failed for ${PRIMARY_MODEL}, retrying ${FALLBACK_MODEL}`,
      primaryError
    )
    return synthesizeViaHttp(text, FALLBACK_MODEL)
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
