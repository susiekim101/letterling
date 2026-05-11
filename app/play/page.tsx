'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PenLine, Delete } from 'lucide-react'
import { toast } from 'sonner'

export default function JoinPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const setCodeValue = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 4)
    setCode(digitsOnly)
  }

  const press = (d: string) => {
    if (code.length >= 4) return
    setCode(code + d)
  }
  const back = () => setCode(code.slice(0, -1))

  const submit = async () => {
    if (code.length !== 4) return
    setLoading(true)
    try {
      const res = await fetch(`/api/play/join?code=${code}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      router.push(`/play/${data.groupId}`)
    } catch (e) {
      toast.error((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/40 px-6 py-10">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <PenLine className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold">Letterling</span>
        </Link>
        <h1 className="text-center font-display text-4xl font-bold">Type your group code</h1>
        <p className="mt-2 text-center text-muted-foreground">
          Your teacher will read it out loud, or you can paste it here.
        </p>

        <div className="mt-6 w-full">
          <Input
            value={code}
            onChange={(e) => setCodeValue(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              setCodeValue(e.clipboardData.getData('text'))
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter 4-digit code"
            className="h-14 rounded-2xl text-center text-2xl font-bold tracking-[0.6em]"
          />
        </div>

        <div className="mt-8 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`grid h-20 w-14 place-items-center rounded-2xl bg-card font-display text-4xl font-bold shadow-sm ring-2 transition ${
                code[i] ? 'ring-primary text-primary' : 'ring-border text-muted-foreground/40'
              }`}
            >
              {code[i] ?? '•'}
            </div>
          ))}
        </div>

        <div className="mt-8 grid w-full max-w-xs grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => press(n)}
              className="aspect-square rounded-2xl bg-card font-display text-3xl font-bold shadow-sm ring-1 ring-border transition active:scale-95 active:bg-muted"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => press('0')}
            className="aspect-square rounded-2xl bg-card font-display text-3xl font-bold shadow-sm ring-1 ring-border transition active:scale-95 active:bg-muted"
          >
            0
          </button>
          <button
            onClick={back}
            className="grid aspect-square place-items-center rounded-2xl bg-muted text-muted-foreground shadow-sm ring-1 ring-border transition active:scale-95"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <Button
          size="lg"
          disabled={code.length !== 4 || loading}
          onClick={submit}
          className="mt-8 h-16 w-full rounded-full bg-emerald-500 text-xl text-white hover:bg-emerald-600 disabled:bg-emerald-500/50"
        >
          {loading ? 'Joining…' : 'Join'}
        </Button>
      </div>
    </main>
  )
}
