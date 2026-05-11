import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

const PLAY_SESSION_COOKIE = 'letterling_play_session'
const PLAY_SESSION_TTL_SECONDS = 60 * 60 * 4

export type PlaySession = {
  groupId: string
  sessionId: string
  sessionVersion: number
  issuedAt: number
  expiresAt: number
}

type ValidationResult =
  | { ok: true; session: PlaySession }
  | { ok: false; response: NextResponse }

function getPlaySessionSecret() {
  const secret =
    process.env.PLAY_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!secret) {
    throw new Error('PLAY_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is required')
  }

  return secret
}

function sign(encodedPayload: string) {
  return createHmac('sha256', getPlaySessionSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function isValidSignature(encodedPayload: string, signature: string) {
  const expected = sign(encodedPayload)

  if (expected.length !== signature.length) return false

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function buildToken(session: PlaySession) {
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

function parseToken(token: string | undefined): PlaySession | null {
  if (!token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null
  if (!isValidSignature(encodedPayload, signature)) return null

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as PlaySession

    if (
      !parsed.groupId ||
      !parsed.sessionId ||
      typeof parsed.sessionVersion !== 'number' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }

    if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export function createPlaySession(
  groupId: string,
  sessionId: string,
  sessionVersion: number
): PlaySession {
  const issuedAt = Math.floor(Date.now() / 1000)

  return {
    groupId,
    sessionId,
    sessionVersion,
    issuedAt,
    expiresAt: issuedAt + PLAY_SESSION_TTL_SECONDS,
  }
}

export function setPlaySessionCookie(response: NextResponse, session: PlaySession) {
  response.cookies.set({
    name: PLAY_SESSION_COOKIE,
    value: buildToken(session),
    maxAge: PLAY_SESSION_TTL_SECONDS,
    ...cookieOptions(),
  })

  return response
}

export function clearPlaySessionCookie(response: NextResponse) {
  response.cookies.set({
    name: PLAY_SESSION_COOKIE,
    value: '',
    maxAge: 0,
    ...cookieOptions(),
  })

  return response
}

export function readPlaySession(request: NextRequest) {
  return parseToken(request.cookies.get(PLAY_SESSION_COOKIE)?.value)
}

export function invalidPlaySessionResponse(message: string, status = 401) {
  const response = NextResponse.json({ error: message }, { status })
  return clearPlaySessionCookie(response)
}

export function requirePlaySession(
  request: NextRequest,
  expectedGroupId: string
): ValidationResult {
  const session = readPlaySession(request)

  if (!session) {
    return {
      ok: false,
      response: invalidPlaySessionResponse('Join the session again to continue.', 401),
    }
  }

  if (session.groupId !== expectedGroupId) {
    return {
      ok: false,
      response: invalidPlaySessionResponse('That session link is no longer valid.', 403),
    }
  }

  return { ok: true, session }
}
