import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { StudentList } from "@/components/dashboard/StudentList";
import { CreateSessionDialog } from "@/components/dashboard/CreateSessionDialog";
import { ActiveSessionView } from "@/components/dashboard/ActiveSessionView";
import { LogOut, History, PenLine } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  // Resume active session if one exists
  const { data: existingActive } = useQuery({
    queryKey: ["active-session", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("teacher_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  useEffect(() => {
    if (existingActive && !activeSessionId) setActiveSessionId(existingActive);
  }, [existingActive, activeSessionId]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
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
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
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
                  Group your students, set the pace, and let them take turns on the iPad.
                </p>
                <div className="mt-6 space-y-3">
                  <CreateSessionDialog
                    teacherId={user.id}
                    onSessionStarted={(sid) => setActiveSessionId(sid)}
                  />
                  <Button variant="outline" disabled className="w-full gap-2 rounded-full">
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
  );
}
