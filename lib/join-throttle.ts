const JOIN_WINDOW_MS = 5 * 60_000
const MAX_JOIN_ATTEMPTS = 12

type AttemptWindow = {
  count: number
  resetAt: number
}

const attemptsByKey = new Map<string, AttemptWindow>()

function getNow() {
  return Date.now()
}

function cleanupExpired(now: number) {
  for (const [key, entry] of attemptsByKey) {
    if (entry.resetAt <= now) attemptsByKey.delete(key)
  }
}

export function getJoinThrottleKey(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = headers.get('x-real-ip')?.trim()
  const userAgent = headers.get('user-agent')?.trim() ?? 'unknown'

  return `${forwardedFor ?? realIp ?? 'unknown'}:${userAgent}`
}

export function consumeJoinAttempt(key: string) {
  const now = getNow()
  cleanupExpired(now)

  const current = attemptsByKey.get(key)
  if (!current || current.resetAt <= now) {
    attemptsByKey.set(key, { count: 1, resetAt: now + JOIN_WINDOW_MS })
    return {
      allowed: true,
      remaining: MAX_JOIN_ATTEMPTS - 1,
      retryAfterSeconds: Math.ceil(JOIN_WINDOW_MS / 1000),
    }
  }

  if (current.count >= MAX_JOIN_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  attemptsByKey.set(key, current)

  return {
    allowed: true,
    remaining: MAX_JOIN_ATTEMPTS - current.count,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}
