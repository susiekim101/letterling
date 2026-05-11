'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Play, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Student } from './StudentList'

export function CreateSessionDialog({
  onSessionStarted,
}: {
  onSessionStarted: (groupId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lettersPerTurn, setLettersPerTurn] = useState(1)

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const res = await fetch('/api/students')
      if (!res.ok) throw new Error('Failed to load students')
      return res.json() as Promise<Student[]>
    },
    enabled: open,
  })

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) {
        toast.error('Max 5 students per group')
        return prev
      }
      return [...prev, id]
    })
  }

  const start = useMutation({
    mutationFn: async () => {
      if (selectedIds.length === 0) throw new Error('Select at least one student')
      if (lettersPerTurn < 1) throw new Error('Letters per turn must be at least 1')

      // 1. Create group
      const groupRes = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letters_per_turn: lettersPerTurn, num_students: selectedIds.length }),
      })
      if (!groupRes.ok) {
        const err = await groupRes.json()
        throw new Error(err.error ?? 'Failed to create group')
      }
      const group = await groupRes.json()

      // 2. Assign students to this group
      await Promise.all(
        selectedIds.map((sid) =>
          fetch(`/api/students/${sid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: group.id }),
          })
        )
      )

      // 3. Seed progress rows for each student
      await Promise.all(selectedIds.map((sid) => fetch(`/api/student-progress/${sid}`)))

      // 4. Create session and activate the group
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!sessionRes.ok) {
        const err = await sessionRes.json()
        throw new Error(err.error ?? 'Failed to start session')
      }

      return group.id as string
    },
    onSuccess: (groupId) => {
      toast.success('Session started!')
      setOpen(false)
      setSelectedIds([])
      setLettersPerTurn(1)
      onSessionStarted(groupId)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full gap-2 rounded-full">
          <Play className="h-5 w-5" /> Create session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">New session</DialogTitle>
        </DialogHeader>

        {students.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            Add students before creating a session.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <Label>Letters per turn</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={lettersPerTurn}
                onChange={(e) => setLettersPerTurn(parseInt(e.target.value) || 1)}
                className="mt-1.5 w-28 rounded-xl"
              />
            </div>

            <div>
              <Label className="mb-2 block">
                Students{' '}
                <span className="font-normal text-muted-foreground">
                  ({selectedIds.length}/5)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => {
                  const selected = selectedIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`rounded-full px-3 py-1.5 text-sm transition ${
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-foreground ring-1 ring-border hover:bg-muted'
                      }`}
                    >
                      {s.first_name} {s.last_name[0]}.
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              onClick={() => start.mutate()}
              disabled={start.isPending || selectedIds.length === 0}
              className="w-full gap-2 rounded-full"
              size="lg"
            >
              <Play className="h-5 w-5" />
              {start.isPending ? 'Starting…' : 'Start session'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
