'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock3, LogOut, Square, UserMinus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { CreateSessionDialog } from './CreateSessionDialog'
import { formatGroupCode } from '@/lib/group-code'
import { cleanStudentName } from '@/lib/student-writing'

type StudentProgress = {
  student_id: string
  next_char: number
  goal_word: string | null
  finished_last_char: boolean
}

type SessionStudent = {
  id: string
  first_name: string
  last_name: string
  student_progress: StudentProgress[]
  membership: {
    turn_order: number
  }
}

type Group = {
  id: string
  group_code: number
  letters_per_turn: number
  current_student_id: string | null
  status: string
  joined: boolean
  active_recently: boolean
  current_student: SessionStudent | null
  next_student: SessionStudent | null
  students: SessionStudent[]
}

type Session = {
  id: string
  status: string
  groups: Group[]
}

function getProgressDisplay(student: SessionStudent) {
  const progress = student.student_progress[0]
  const cleanName = cleanStudentName(progress?.goal_word ?? student.first_name)
  const total = cleanName.length || 1
  const pct = progress?.finished_last_char
    ? 100
    : Math.min(100, Math.round(((progress?.next_char ?? 0) / total) * 100))
  const currentLetter = progress?.finished_last_char
    ? 'Done'
    : cleanName[progress?.next_char ?? 0]?.toUpperCase() ?? '—'

  return {
    pct,
    currentLetter,
    done: progress?.finished_last_char ?? false,
  }
}

export function ActiveSessionView({
  sessionId,
  onEnded,
}: {
  sessionId: string
  onEnded: () => void
}) {
  const [session, setSession] = useState<Session | null>(null)

  const refresh = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (res.status === 404 || res.status === 401) {
        onEnded()
        return
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to load session')
      }

      setSession(data)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => {
      void refresh()
    }, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const endSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to end session')
      toast.success('Session ended')
      onEnded()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const logoutGroup = async (groupId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to log out group')
      toast.success('Group logged out and code refreshed')
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const removeStudent = async (groupId: string, studentId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_student', studentId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to remove student')
      toast.success('Student removed from group')
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (!session) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>
  }

  const activeGroups = session.groups.filter((group) => group.status === 'active')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Live session</h1>
          <p className="text-sm text-muted-foreground">
            {activeGroups.length} active group{activeGroups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <CreateSessionDialog
            sessionId={sessionId}
            onSessionStarted={refresh}
            triggerLabel="Add group"
            triggerIcon="plus"
          />
          <Button variant="outline" onClick={endSession} className="gap-2 rounded-full">
            <Square className="h-4 w-4" /> End session
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {activeGroups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            onLogout={() => logoutGroup(group.id)}
            onRemoveStudent={(studentId) => removeStudent(group.id, studentId)}
          />
        ))}
      </div>
    </div>
  )
}

function GroupCard({
  group,
  onLogout,
  onRemoveStudent,
}: {
  group: Group
  onLogout: () => void
  onRemoveStudent: (studentId: string) => void
}) {
  const code = formatGroupCode(group.group_code)
  const doneCount = group.students.filter((student) => getProgressDisplay(student).done).length

  return (
    <div className="rounded-3xl bg-card shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
            <Users className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {doneCount}/{group.students.length} done · {group.letters_per_turn} letter
              {group.letters_per_turn === 1 ? '' : 's'} per turn
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  group.joined
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {group.joined ? 'Joined on device' : 'Waiting to join'}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  group.active_recently
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {group.active_recently ? 'Active recently' : 'Idle'}
              </span>
              {group.current_student && (
                <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">
                  Now: {group.current_student.first_name}
                </span>
              )}
              {group.next_student && (
                <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
                  Next: {group.next_student.first_name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-accent px-6 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground/70">
              Group code
            </p>
            <p className="font-display text-3xl font-bold tracking-[0.3em] text-accent-foreground">
              {code}
            </p>
          </div>
          <Button variant="outline" onClick={onLogout} className="gap-2 rounded-full">
            <LogOut className="h-4 w-4" /> Log out group
          </Button>
        </div>
      </div>

      <div className="border-t border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Current letter</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Turn</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.students.map((student) => {
              const display = getProgressDisplay(student)
              const isActive = group.current_student_id === student.id

              return (
                <tr key={student.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {student.first_name} {student.last_name}
                    {isActive && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Clock3 className="h-3 w-3" /> Writing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {display.done ? (
                      <span className="font-semibold text-emerald-700">Done ✓</span>
                    ) : (
                      <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-primary/10 font-display text-lg font-bold text-primary">
                        {display.currentLetter}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${display.pct}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs text-muted-foreground">
                        {display.pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    #{student.membership.turn_order}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveStudent(student.id)}
                      className="gap-1.5 rounded-full text-muted-foreground hover:text-destructive"
                    >
                      <UserMinus className="h-4 w-4" /> Remove
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
