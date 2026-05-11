'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Square, Clock, Users } from 'lucide-react'
import { toast } from 'sonner'

type Student = { id: string; first_name: string; last_name: string }
type Progress = {
  student_id: string
  next_char: number
  goal_word: string | null
  finished_last_char: boolean
}
type GroupState = {
  group: {
    id: string
    group_code: number
    letters_per_turn: number
    current_student_id: string | null
    session_id: string | null
  }
  students: Student[]
  progress: Progress[]
}

const cleanName = (s: string) => s.replace(/[^a-zA-Z]/g, '')

export function ActiveSessionView({
  groupId,
  onEnded,
}: {
  groupId: string
  onEnded: () => void
}) {
  const [state, setState] = useState<GroupState | null>(null)

  const refresh = async () => {
    try {
      const res = await fetch(`/api/play/${groupId}`)
      if (!res.ok) return
      setState(await res.json())
    } catch {}
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [groupId])

  const endSession = async () => {
    if (!state?.group.session_id) return
    try {
      await fetch(`/api/sessions/${state.group.session_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      })
      await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive', current_student_id: null }),
      })
      toast.success('Session ended')
      onEnded()
    } catch {
      toast.error('Failed to end session')
    }
  }

  if (!state) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>
  }

  const code = String(state.group.group_code).padStart(4, '0')
  const doneCount = state.progress.filter((p) => p.finished_last_char).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Live session</h1>
          <p className="text-sm text-muted-foreground">
            Read this code aloud so students can join on the iPad.
          </p>
        </div>
        <Button variant="outline" onClick={endSession} className="gap-2 rounded-full">
          <Square className="h-4 w-4" /> End session
        </Button>
      </div>

      <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
              <Users className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {doneCount}/{state.students.length} done · {state.group.letters_per_turn} letter
                {state.group.letters_per_turn === 1 ? '' : 's'} per turn
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-accent px-6 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground/70">
              Group code
            </p>
            <p className="font-display text-3xl font-bold tracking-[0.3em] text-accent-foreground">
              {code}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Current letter</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.students.map((s) => {
                const prog = state.progress.find((p) => p.student_id === s.id)
                const name = cleanName(s.first_name)
                const idx = prog?.next_char ?? 0
                const total = name.length || 1
                const pct = Math.min(100, Math.round((idx / total) * 100))
                const letter = name[idx] ?? '—'
                const isActive = state.group.current_student_id === s.id
                const done = prog?.finished_last_char ?? false

                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      {s.first_name} {s.last_name}
                      {isActive && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          Writing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {done ? (
                        <span className="text-success font-semibold">Done ✓</span>
                      ) : (
                        <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-primary/10 font-display text-lg font-bold text-primary">
                          {letter.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
                          <Clock className="h-3 w-3" /> Active
                        </span>
                      ) : done ? (
                        <span className="text-xs text-muted-foreground">Finished</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Waiting</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
