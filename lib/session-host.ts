const HOST_HEARTBEAT_WINDOW_MS = 60_000

type HostedSessionRecord = {
  id: string
  teacher_id: string
  status: string
  host_last_seen_at: string | null
}

export function isTeacherHostActive(hostLastSeenAt: string | null, now = Date.now()) {
  if (!hostLastSeenAt) return false

  const lastSeen = new Date(hostLastSeenAt).getTime()
  if (Number.isNaN(lastSeen)) return false

  return now - lastSeen < HOST_HEARTBEAT_WINDOW_MS
}

export function isHostedSessionValid(session: HostedSessionRecord | null | undefined) {
  return Boolean(
    session &&
      session.status === 'active' &&
      isTeacherHostActive(session.host_last_seen_at)
  )
}

export function getHostedSessionInvalidMessage() {
  return 'This session is no longer being hosted by a teacher. Ask them to reopen it.'
}

