'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { PracticeWhiteboard, type PracticeWhiteboardHandle } from '@/components/play/PracticeWhiteboard'
import { Button } from '@/components/ui/button'
import {
  MAX_LETTER_ATTEMPTS,
  cleanStudentName,
  type AttemptBudget,
} from '@/lib/student-writing'
import { toast } from 'sonner'
import { PartyPopper, Trash2, Sparkles, ArrowRight, Pen, Eraser } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  attemptBudget: AttemptBudget | null
}

function stripEmotionTags(text: string) {
  return text.replace(/\[.*?\]/g, '').trim()
}

function base64ToObjectUrl(base64: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
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
  const router = useRouter()

  const [state, setState] = useState<GroupState | null>(null)
  const [stage, setStage] = useState<'pick' | 'write' | 'pass' | 'complete'>('pick')
  const [myStudentId, setMyStudentId] = useState<string | null>(null)
  const [letterStartIdx, setLetterStartIdx] = useState(0)
  const [pendingNext, setPendingNext] = useState<Student | null>(null)
  const [feedback, setFeedback] = useState<{
    text: string
    success: boolean
    attemptsRemaining: number
    blockedReason?: 'attempt_limit'
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tool, setTool] = useState<'draw' | 'eraser'>('draw')
  const whiteboard = useRef<PracticeWhiteboardHandle | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const speechRequestIdRef = useRef(0)

  const redirectToJoin = useCallback(
    (message: string) => {
      toast.error(message)
      router.replace('/play')
    },
    [router]
  )

  const readResponse = useCallback(
    async <T,>(res: Response): Promise<T> => {
      const payload = await res.json().catch(() => null)

      if (res.status === 401 || res.status === 403) {
        redirectToJoin(payload?.error ?? 'Join the session again to continue.')
        throw new Error(payload?.error ?? 'Session expired')
      }

      if (!res.ok) {
        throw new Error(payload?.error ?? 'Request failed')
      }

      return payload as T
    },
    [redirectToJoin]
  )

  const fetchState = useCallback(async (): Promise<GroupState> => {
    const res = await fetch(`/api/play/${groupId}`)
    const data = await readResponse<GroupState>(res)
    setState(data)
    return data
  }, [groupId, readResponse])

  useEffect(() => {
    fetchState().catch(console.error)
    if (stage === 'write' || stage === 'complete') return

    const interval = setInterval(() => fetchState().catch(console.error), 4000)
    return () => clearInterval(interval)
  }, [fetchState, stage])

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
    whiteboard.current?.clear()
    setFeedback(null)
  }, [])

  const stopAudioPlayback = useCallback(() => {
    speechRequestIdRef.current += 1

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const playBrowserFallback = useCallback((text: string) => {
    const cleanText = stripEmotionTags(text)
    if (!cleanText || typeof window === 'undefined' || !('speechSynthesis' in window)) return

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 0.95
      utterance.pitch = 1.1
      window.speechSynthesis.speak(utterance)
    } catch (error) {
      console.warn('Browser TTS fallback failed', error)
    }
  }, [])

  const playSpeech = useCallback(
    async (text: string) => {
      const cleanText = stripEmotionTags(text)
      if (!cleanText || typeof window === 'undefined') return

      stopAudioPlayback()
      const requestId = speechRequestIdRef.current

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, groupId }),
        })

        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(errorText || 'Failed to synthesize speech')
        }

        const { audioBase64 } = (await res.json()) as { audioBase64?: string }
        if (!audioBase64) {
          throw new Error('Missing synthesized audio')
        }

        if (requestId !== speechRequestIdRef.current) {
          return
        }

        const audioUrl = base64ToObjectUrl(audioBase64)
        audioUrlRef.current = audioUrl

        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.onended = () => {
          if (audioRef.current === audio) {
            audioRef.current = null
          }
          if (audioUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl)
            audioUrlRef.current = null
          }
        }

        await audio.play()
      } catch (error) {
        console.warn('Server TTS failed, using browser fallback', error)
        if (requestId === speechRequestIdRef.current) {
          playBrowserFallback(cleanText)
        }
      }
    },
    [groupId, playBrowserFallback, stopAudioPlayback]
  )

  useEffect(() => stopAudioPlayback, [stopAudioPlayback])

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (stage === 'complete') {
    return <CompleteScreen students={state.students} playSpeech={playSpeech} />
  }

  if (stage === 'pass' && pendingNext) {
    return (
      <PassScreen
        next={pendingNext}
        playSpeech={playSpeech}
        onReady={async () => {
          const res = await fetch(`/api/play/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: pendingNext.id }),
          })
          await readResponse<{ ok: true }>(res)
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
          const res = await fetch(`/api/play/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: student.id }),
          })
          await readResponse<{ ok: true }>(res)
          setMyStudentId(student.id)
          const s = await fetchState()
          const p = s.progress.find((x) => x.student_id === student.id)
          setLetterStartIdx(p?.next_char ?? 0)
          setStage('write')
          void playSpeech(`${student.first_name}'s turn!`)
        }}
      />
    )
  }

  const me = state.students.find((s) => s.id === myStudentId)!
  const myProg = state.progress.find((p) => p.student_id === myStudentId)!
  const nameLetters = cleanStudentName(me.first_name)
  const letter = nameLetters[myProg.next_char] ?? ''
  const myAttemptBudget =
    state.attemptBudget?.student_id === myStudentId ? state.attemptBudget : null
  const attemptsRemaining = myAttemptBudget?.remaining ?? MAX_LETTER_ATTEMPTS
  const attemptLimit = myAttemptBudget?.limit ?? MAX_LETTER_ATTEMPTS
  const outOfAttempts = attemptsRemaining <= 0
  const nextStudent = pickNextStudent(state, myStudentId)

  const handleCheck = async () => {
    const boardExport = await whiteboard.current?.exportImage()
    if (!boardExport) {
      toast.error('Draw the letter first!')
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/play/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boardExport),
      })
      const data = await res.json().catch(() => null)

      if (res.status === 401 || res.status === 403) {
        redirectToJoin(data?.error ?? 'Join the session again to continue.')
        return
      }

      if (!res.ok && !data?.feedbackText) {
        throw new Error(data?.error ?? 'Failed to check letter')
      }

      if (data?.feedbackText) {
        setFeedback({
          text: data.feedbackText,
          success: Boolean(data.isSuccessful),
          attemptsRemaining: data.attemptsRemaining ?? 0,
          blockedReason: data.blockedReason,
        })
        void playSpeech(data.feedbackText)
      }

      await fetchState()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNextLetter = async () => {
    const nextChar = myProg.next_char + 1
    const res = await fetch(`/api/play/${groupId}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: myStudentId, next_char: nextChar }),
    })
    await readResponse<{ ok: true }>(res)
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
        void playSpeech(`${nextS.first_name}, your turn!`)
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
        void playSpeech(`${nextS.first_name}, your turn!`)
      }
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-gradient-to-b from-background to-secondary/30">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Writing</p>
          <h2 className="font-display text-xl font-bold">{me.first_name}</h2>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {nextStudent ? `Next: ${nextStudent.first_name}` : 'Last turn in the group'}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Letter</p>
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/15 font-display text-6xl font-bold text-primary shadow-inner">
            <span className="opacity-30">{letter.toUpperCase()}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Turn</p>
          <p className="font-medium">
            {state.group.current_student_id === myStudentId ? 'Now writing' : 'Waiting'}
          </p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Progress</p>
          <p className="font-display text-xl font-bold">
            {myProg.next_char + 1} / {nameLetters.length}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {attemptsRemaining} of {attemptLimit} tries left
          </p>
        </div>
      </header>

      <PracticeWhiteboard ref={whiteboard} tool={tool} />

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
      {!feedback?.success && outOfAttempts && (
        <div className="mx-4 mt-3 rounded-2xl bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900 ring-1 ring-amber-300">
          No more tries left for this letter right now. Ask your teacher before moving on.
        </div>
      )}

      <div className="flex items-center gap-3 p-4">
        <Button
          variant={tool === 'draw' ? 'default' : 'outline'}
          size="lg"
          onClick={() => setTool('draw')}
          className="h-16 gap-2 rounded-full px-5 text-base"
        >
          <Pen className="h-5 w-5" />
        </Button>
        <Button
          variant={tool === 'eraser' ? 'default' : 'outline'}
          size="lg"
          onClick={() => setTool('eraser')}
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
            disabled={submitting || outOfAttempts}
            className="h-16 flex-1 gap-2 rounded-full text-xl"
          >
            <Sparkles className="h-6 w-6" />
            {submitting
              ? 'Checking…'
              : outOfAttempts
                ? 'No more tries left'
                : 'Check my letter'}
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
            {state.students.find((student) => student.id === state.group.current_student_id)?.first_name ??
              'Someone'}{' '}
            is writing right now. Pick your name to wait your turn.
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

function PassScreen({
  next,
  onReady,
  playSpeech,
}: {
  next: Student
  onReady: () => void
  playSpeech: (text: string) => Promise<void>
}) {
  useEffect(() => {
    void playSpeech(`${next.first_name}, your turn!`)
  }, [next.first_name, playSpeech])

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

function CompleteScreen({
  students,
  playSpeech,
}: {
  students: Student[]
  playSpeech: (text: string) => Promise<void>
}) {
  useEffect(() => {
    void playSpeech('All done! Great job everyone!')
  }, [playSpeech])

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-b from-background to-accent/40 px-6">
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 18 }).map((_, index) => (
          <div
            key={index}
            className="absolute text-amber-400 opacity-80"
            style={{
              left: `${8 + (index % 6) * 15}%`,
              top: `${10 + Math.floor(index / 6) * 24}%`,
              transform: `scale(${0.8 + (index % 3) * 0.25}) rotate(${index * 14}deg)`,
            }}
          >
            <Sparkles className="h-8 w-8" />
          </div>
        ))}
      </div>
      <div className="relative text-center">
        <PartyPopper className="mx-auto h-20 w-20 text-primary" />
        <h1 className="mt-4 font-display text-5xl font-bold">All done!</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Great job, {students.map((s) => s.first_name).join(', ')}!
        </p>
      </div>
    </main>
  )
}
