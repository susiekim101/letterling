'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { StudentList } from './_components/StudentList'
import { CreateSessionDialog } from './_components/CreateSessionDialog'
import { ActiveSessionView } from './_components/ActiveSessionView'
import { LogOut, PenLine, History } from 'lucide-react'

export default function Dashboard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  // Resume active session if one exists
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('sessions')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) setActiveSessionId(data.id)
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true))
  }, [user])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading || !user || !sessionChecked) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <PenLine className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold">Letterling</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="gap-1.5 rounded-full"
            >
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {activeSessionId ? (
          <ActiveSessionView
            sessionId={activeSessionId}
            onEnded={() => setActiveSessionId(null)}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Welcome back 👋</h1>
              <p className="text-muted-foreground">
                Start a new session for your class, or take a look at past progress.
              </p>
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-secondary/40 to-accent/30 p-8 ring-1 ring-border">
                <h2 className="text-xl font-bold">Ready to practice?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick your students, set the pace, and hand them the iPad.
                </p>
                <div className="mt-6 space-y-3">
                  <CreateSessionDialog
                    onSessionStarted={(sid) => setActiveSessionId(sid)}
                  />
                  <Button
                    variant="outline"
                    disabled
                    className="w-full gap-2 rounded-full"
                  >
                    <History className="h-4 w-4" /> View past session progress
                  </Button>
                </div>
              </div>
            </div>
            <StudentList teacherId={user.id} />
          </div>
        )}
      </div>
    </main>
  )
}
