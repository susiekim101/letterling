'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Play, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Student } from './StudentList'

export function CreateSessionDialog({
  onSessionStarted,
  sessionId,
  triggerLabel = 'Create session',
  triggerIcon = 'play',
}: {
  onSessionStarted: (sessionId: string) => void
  sessionId?: string
  triggerLabel?: string
  triggerIcon?: 'play' | 'plus'
}) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lettersPerTurn, setLettersPerTurn] = useState(1)
  const [search, setSearch] = useState('')

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await fetch('/api/students')
      if (!res.ok) throw new Error('Failed to load students')
      return res.json() as Promise<Student[]>
    },
    enabled: open,
  })

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students

    return students.filter((student) =>
      `${student.first_name} ${student.last_name}`.toLowerCase().includes(query)
    )
  }, [search, students])

  const toggle = (student: Student) => {
    if (student.active_assignment) {
      toast.error('This student is already in an active group')
      return
    }

    setSelectedIds((prev) => {
      if (prev.includes(student.id)) return prev.filter((id) => id !== student.id)
      if (prev.length >= 5) {
        toast.error('Max 5 students per group')
        return prev
      }
      return [...prev, student.id]
    })
  }

  const selectVisible = () => {
    const availableIds = visibleStudents
      .filter((student) => !student.active_assignment)
      .map((student) => student.id)

    setSelectedIds((prev) => {
      const merged = Array.from(new Set([...prev, ...availableIds]))
      if (merged.length > 5) {
        toast.error('Groups can have up to 5 students')
        return merged.slice(0, 5)
      }
      return merged
    })
  }

  const clearAll = () => setSelectedIds([])

  const start = useMutation({
    mutationFn: async () => {
      if (selectedIds.length === 0) throw new Error('Select at least one student')

      let sid = sessionId
      if (!sid) {
        const sessionRes = await fetch('/api/sessions', { method: 'POST' })
        if (!sessionRes.ok) {
          const err = await sessionRes.json()
          throw new Error(err.error ?? 'Failed to create session')
        }
        const session = await sessionRes.json()
        sid = session.id
      }

      const groupRes = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letters_per_turn: lettersPerTurn,
          student_ids: selectedIds,
          session_id: sid,
        }),
      })
      const payload = await groupRes.json().catch(() => null)
      if (!groupRes.ok) {
        throw new Error(payload?.error ?? 'Failed to create group')
      }

      return sid as string
    },
    onSuccess: (sid) => {
      toast.success(sessionId ? 'Group added!' : 'Session started!')
      setOpen(false)
      setSelectedIds([])
      setLettersPerTurn(1)
      setSearch('')
      onSessionStarted(sid)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const Icon = triggerIcon === 'plus' ? Plus : Play

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full gap-2 rounded-full">
          <Icon className="h-5 w-5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {sessionId ? 'Add group to session' : 'New session'}
          </DialogTitle>
        </DialogHeader>

        {students.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            Add students before creating a session.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Letters per turn</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={lettersPerTurn}
                  onChange={(e) => setLettersPerTurn(parseInt(e.target.value, 10) || 1)}
                  className="mt-1.5 w-28 rounded-xl"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="student-search">Find students</Label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="student-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name"
                    className="rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <Label className="block">
                  Students{' '}
                  <span className="font-normal text-muted-foreground">
                    ({selectedIds.length}/5 selected)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectVisible}>
                    Select visible
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="w-14 px-4 py-3">Pick</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudents.map((student) => {
                      const selected = selectedIds.includes(student.id)
                      const disabled = Boolean(student.active_assignment)

                      return (
                        <tr
                          key={student.id}
                          className={`border-t border-border ${disabled ? 'bg-muted/40' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selected}
                              disabled={disabled}
                              onCheckedChange={() => toggle(student)}
                              aria-label={`Select ${student.first_name} ${student.last_name}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.parent_email && (
                              <div className="text-xs text-muted-foreground">
                                {student.parent_email}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium">
                            {disabled ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                                Already in active group
                              </span>
                            ) : selected ? (
                              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-primary">
                                Selected
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Available</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              onClick={() => start.mutate()}
              disabled={start.isPending || selectedIds.length === 0}
              className="w-full gap-2 rounded-full"
              size="lg"
            >
              <Users className="h-5 w-5" />
              {start.isPending ? 'Saving…' : sessionId ? 'Add group' : 'Start session'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
