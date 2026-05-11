'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Square, Clock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CreateSessionDialog } from './CreateSessionDialog'

type StudentProgress = {
  student_id: string
  next_char: number
  goal_word: string | null
  finished_last_char: boolean
}

type Student = {
  id: string
  first_name: string
  last_name: string
  student_progress: StudentProgress[]
}

type Group = {
  id: string
  group_code: number
  letters_per_turn: number
  current_student_id: string | null
  status: string
  students: Student[]
}

type Session = {
  id: string
  status: string
  groups: Group[]
}

const cleanName = (s: string) => s.replace(/[^a-zA-Z]/g, '')

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
      const supabase = createClient()

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError || !sessionData) {
        await supabase.from('sessions').update({ status: 'inactive' }).eq('id', sessionId)
        onEnded()
        return
      }

      const { data: groups } = await supabase
        .from('groups')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'active')

      const enrichedGroups: Group[] = await Promise.all(
        (groups ?? []).map(async (group) => {
          const { data: students } = await supabase
            .from('students')
            .select('*')
            .eq('group_id', group.id)

          const enrichedStudents: Student[] = await Promise.all(
            (students ?? []).map(async (student) => {
              const { data: progress } = await supabase
                .from('student_progress')
                .select('*')
                .eq('student_id', student.id)
              return { ...student, student_progress: progress ?? [] }
            })
          )

          return { ...group, students: enrichedStudents }
        })
      )

      setSession({ ...sessionData, groups: enrichedGroups })
    } catch {
      onEnded()
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const endSession = async () => {
    try {
      const supabase = createClient()
      await supabase.from('groups').update({ status: 'inactive', current_student_id: null }).eq('session_id', sessionId)
      await supabase.from('sessions').update({ status: 'inactive', ended_at: new Date().toISOString() }).eq('id', sessionId)
      toast.success('Session ended')
      onEnded()
    } catch {
      toast.error('Failed to end session')
    }
  }

  if (!session) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>
  }

  const activeGroups = session.groups.filter((g) => g.status === 'active')

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
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  )
}

function GroupCard({ group }: { group: Group }) {
  const code = String(group.group_code).padStart(4, '0')
  const doneCount = group.students.filter((s) => {
    const prog = s.student_progress[0]
    return prog?.finished_last_char
  }).length

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

      <div className="border-t border-border">
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
            {group.students.map((s) => {
              const prog = s.student_progress[0]
              const name = cleanName(s.first_name)
              const idx = prog?.next_char ?? 0
              const total = name.length || 1
              const pct = Math.min(100, Math.round((idx / total) * 100))
              const letter = name[idx] ?? '—'
              const isActive = group.current_student_id === s.id
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
                      <span className="font-semibold text-success">Done ✓</span>
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
  )
}
