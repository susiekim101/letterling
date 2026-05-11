'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Sparkles, PenLine, Users } from 'lucide-react'

export default function Landing() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.push('/dashboard')
  }, [user, loading, router])

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <PenLine className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold">Letterling</span>
        </div>
        <div className="flex gap-2">
          <Button asChild className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600">
            <Link href="/play">Join session</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-12 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
          <Sparkles className="h-4 w-4" /> For kindergarten teachers
        </div>
        <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
          Handwriting practice that{' '}
          <span className="text-primary">kids actually love</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Set up groups, hand the iPad to the table, and let little learners take turns
          writing their names with gentle, real-time feedback.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/signup">Create teacher account</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8">
            <Link href="/login">I already have one</Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            { icon: Users, title: 'Group sessions', body: 'Up to 5 kids per group, guided through their name one letter at a time.' },
            { icon: PenLine, title: 'Take turns', body: 'Each child writes a few letters, then passes to the next.' },
            { icon: Sparkles, title: 'Live feedback', body: 'Friendly AI coach guides every stroke with encouragement.' },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl bg-card p-6 text-left shadow-sm ring-1 ring-border">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
