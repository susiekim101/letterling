'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PartyPopper, Trash2, Sparkles, ArrowRight, Pen, Eraser } from 'lucide-react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

// Avoid SSR — tldraw uses browser APIs
// const Tldraw = dynamic(() => import('tldraw').then((m) => m.Tldraw), { ssr: false })

// Defined outside component so it's stable (required by tldraw)
const HIDDEN_UI = {
  ContextMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  ZoomMenu: null,
  MainMenu: null,
  Minimap: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  Toolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
} as const

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
    status: string
  }
  students: Student[]
  progress: Progress[]
}

const cleanName = (s: string) => s.replace(/[^a-zA-Z]/g, '')

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.95
    u.pitch = 1.1
    window.speechSynthesis.speak(u)
  } catch {}
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function pickNextStudent(state: GroupState, currentId: string): Student | null {
  const { students, progress } = state
  const idx = students.findIndex((s) => s.id === currentId)
  for (let i = 1; i <= students.length; i++) {
    const cand = students[(idx + i) % students.length]
    const p = progress.find((x) => x.student_id === cand.id)
    if (p && !p.finished_last_char) return cand
  }
  return null
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = use(params)

  const [state, setState] = useState<GroupState | null>(null)
  const [stage, setStage] = useState<'pick' | 'write' | 'pass' | 'complete'>('pick')
  const [myStudentId, setMyStudentId] = useState<string | null>(null)
  const [letterStartIdx, setLetterStartIdx] = useState(0)
  const [pendingNext, setPendingNext] = useState<Student | null>(null)
  const [feedback, setFeedback] = useState<{
    text: string
    success: boolean
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tool, setTool] = useState<'draw' | 'eraser'>('draw')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useRef<any>(null)

  const fetchState = useCallback(async (): Promise<GroupState> => {
    const res = await fetch(`/api/play/${groupId}`)
    if (!res.ok) throw new Error('Failed to load group')
    const data: GroupState = await res.json()
    setState(data)
    return data
  }, [groupId])

  useEffect(() => {
    fetchState().catch(console.error)
    const interval = setInterval(() => fetchState().catch(console.error), 4000)
    return () => clearInterval(interval)
  }, [fetchState])

  useEffect(() => {
    if (!state) return
    if (
      state.students.length > 0 &&
      state.progress.length > 0 &&
      state.progress.every((p) => p.finished_last_char)
    ) {
      setStage('complete')
    }
  }, [state])

  const clearCanvas = useCallback(() => {
    const ed = editor.current
    if (!ed) return
    const ids = [...ed.getCurrentPageShapeIds()]
    if (ids.length) ed.deleteShapes(ids)
    setFeedback(null)
  }, [])

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (stage === 'complete') return <CompleteScreen students={state.students} />

  if (stage === 'pass' && pendingNext) {
    return (
      <PassScreen
        next={pendingNext}
        onReady={async () => {
          await fetch(`/api/play/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: pendingNext.id }),
          })
          setMyStudentId(pendingNext.id)
          const s = await fetchState()
          const p = s.progress.find((x) => x.student_id === pendingNext.id)
          setLetterStartIdx(p?.next_char ?? 0)
          setPendingNext(null)
          setFeedback(null)
          setStage('write')
          clearCanvas()
        }}
      />
    )
  }

  if (stage === 'pick' || !myStudentId) {
    return (
      <PickName
        state={state}
        onPick={async (student) => {
          if (
            state.group.current_student_id &&
            state.group.current_student_id !== student.id
          ) {
            toast.error('Another student is currently writing')
            return
          }
          const prog = state.progress.find((p) => p.student_id === student.id)
          if (prog?.finished_last_char) {
            toast.error('This student has already finished')
            return
          }
          await fetch(`/api/play/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: student.id }),
          })
          setMyStudentId(student.id)
          const s = await fetchState()
          const p = s.progress.find((x) => x.student_id === student.id)
          setLetterStartIdx(p?.next_char ?? 0)
          setStage('write')
        }}
      />
    )
  }

  const me = state.students.find((s) => s.id === myStudentId)!
  const myProg = state.progress.find((p) => p.student_id === myStudentId)!
  const nameLetters = cleanName(me.first_name)
  const letter = nameLetters[myProg.next_char] ?? ''

  const handleCheck = async () => {
    const ed = editor.current
    if (!ed) return
    const shapeIds = Array.from(ed.getCurrentPageShapeIds() as Set<string>)
    if (shapeIds.length === 0) {
      toast.error('Draw the letter first!')
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await ed.toImage(shapeIds, {
        format: 'png',
        background: true,
        scale: 1,
        padding: 32,
      })
      const imageBase64 = await blobToBase64(result.blob)
      const res = await fetch('/api/play/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/png', targetLetter: letter }),
      })
      const data = await res.json()
      setFeedback({ text: data.feedbackText, success: data.isSuccessful })
      speak(data.feedbackText)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNextLetter = async () => {
    const nextChar = myProg.next_char + 1
    await fetch(`/api/play/${groupId}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: myStudentId, next_char: nextChar }),
    })
    clearCanvas()
    const s = await fetchState()
    const myNew = s.progress.find((p) => p.student_id === myStudentId)!

    if (s.progress.every((p) => p.finished_last_char)) {
      setStage('complete')
      return
    }

    if (myNew.finished_last_char) {
      const nextS = pickNextStudent(s, myStudentId!)
      if (nextS) {
        setPendingNext(nextS)
        setStage('pass')
        speak(`${nextS.first_name}, your turn!`)
      } else {
        setStage('complete')
      }
      return
    }

    const lettersThisTurn = myNew.next_char - letterStartIdx
    if (lettersThisTurn >= s.group.letters_per_turn) {
      const nextS = pickNextStudent(s, myStudentId!)
      if (nextS) {
        setPendingNext(nextS)
        setStage('pass')
        speak(`${nextS.first_name}, your turn!`)
      }
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-gradient-to-b from-background to-secondary/30">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Writing</p>
          <h2 className="font-display text-xl font-bold">{me.first_name}</h2>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Letter</p>
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/15 font-display text-6xl font-bold text-primary shadow-inner">
            <span className="opacity-30">{letter.toUpperCase()}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Progress</p>
          <p className="font-display text-xl font-bold">
            {myProg.next_char + 1} / {nameLetters.length}
          </p>
        </div>
      </header>
      {/* <div style={{ position: 'fixed', inset: 0 }}>
        <Tldraw />
      </div> */}

      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border">
        <Tldraw
          components={HIDDEN_UI}
          onMount={(ed) => {
            editor.current = ed
            ed.setCurrentTool('draw')
            ed.updateInstanceState({ isDebugMode: false })
          }}
        />
      </div>

      {feedback && (
        <div
          className={`mx-4 mt-3 rounded-2xl p-4 text-center text-base font-medium ${
            feedback.success
              ? 'bg-success/15 text-success-foreground ring-1 ring-success/40'
              : 'bg-accent text-accent-foreground'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex items-center gap-3 p-4">
        <Button
          variant={tool === 'draw' ? 'default' : 'outline'}
          size="lg"
          onClick={() => { setTool('draw'); editor.current?.setCurrentTool('draw') }}
          className="h-16 gap-2 rounded-full px-5 text-base"
        >
          <Pen className="h-5 w-5" />
        </Button>
        <Button
          variant={tool === 'eraser' ? 'default' : 'outline'}
          size="lg"
          onClick={() => { setTool('eraser'); editor.current?.setCurrentTool('eraser') }}
          className="h-16 gap-2 rounded-full px-5 text-base"
        >
          <Eraser className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={clearCanvas}
          className="h-16 gap-2 rounded-full px-6 text-base"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
        {feedback?.success ? (
          <Button
            size="lg"
            onClick={handleNextLetter}
            className="h-16 flex-1 gap-2 rounded-full text-xl"
          >
            <ArrowRight className="h-6 w-6" /> Next letter
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleCheck}
            disabled={submitting}
            className="h-16 flex-1 gap-2 rounded-full text-xl"
          >
            <Sparkles className="h-6 w-6" />
            {submitting ? 'Checking…' : 'Check my letter'}
          </Button>
        )}
      </div>
    </main>
  )
}

function PickName({
  state,
  onPick,
}: {
  state: GroupState
  onPick: (s: Student) => void
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/40 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="mt-2 text-center font-display text-4xl font-bold">Tap your name</h1>
        {state.group.current_student_id && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Someone is writing — pick your name to wait your turn.
          </p>
        )}
        <div className="mt-8 grid gap-3">
          {state.students.map((s) => {
            const prog = state.progress.find((p) => p.student_id === s.id)
            const done = prog?.finished_last_char ?? false
            return (
              <button
                key={s.id}
                onClick={() => !done && onPick(s)}
                disabled={done}
                className={`rounded-3xl p-6 text-left text-2xl font-bold shadow-sm ring-1 transition ${
                  done
                    ? 'bg-muted text-muted-foreground ring-border line-through'
                    : 'bg-card ring-border hover:bg-primary/10 active:scale-[0.98]'
                }`}
              >
                {s.first_name} {s.last_name[0]}.
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function PassScreen({ next, onReady }: { next: Student; onReady: () => void }) {
  useEffect(() => {
    speak(`${next.first_name}, your turn!`)
  }, [next.first_name])

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-accent/40 to-background px-6">
      <div className="text-center">
        <p className="text-lg uppercase tracking-wider text-muted-foreground">Pass the iPad to</p>
        <h1 className="mt-4 font-display text-7xl font-bold text-primary md:text-8xl">
          {next.first_name}
        </h1>
        <Button
          size="lg"
          onClick={onReady}
          className="mt-12 h-16 rounded-full px-12 text-2xl"
        >
          I'm ready
        </Button>
      </div>
    </main>
  )
}

function CompleteScreen({ students }: { students: Student[] }) {
  useEffect(() => {
    speak('All done! Great job everyone!')
  }, [])

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-background to-accent/40 px-6">
      <div className="text-center">
        <PartyPopper className="mx-auto h-20 w-20 text-primary" />
        <h1 className="mt-4 font-display text-5xl font-bold">All done!</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Great job, {students.map((s) => s.first_name).join(', ')}!
        </p>
      </div>
    </main>
  )
}
