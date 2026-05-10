import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Square, Clock, Users } from "lucide-react";
import { toast } from "sonner";

type Row = {
  group: { id: string; name: string; code: string; letters_per_turn: number };
  students: Array<{
    id: string;
    first_name: string;
    last_name: string;
    progress: {
      current_letter_index: number;
      status: string;
      turn_started_at: string | null;
    };
  }>;
};

function fullName(s: { first_name: string; last_name: string }) {
  return `${s.first_name} ${s.last_name}`;
}

function letterCount(s: { first_name: string; last_name: string }) {
  // letters across the first name only? Spec: "current letter index / total letters in their name"
  // Use first name (kindergarten typical). Strip non-letters.
  return s.first_name.replace(/[^a-zA-Z]/g, "").length || 1;
}

export function ActiveSessionView({
  sessionId,
  onEnded,
}: {
  sessionId: string;
  onEnded: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["session-progress", sessionId],
    queryFn: async (): Promise<Row[]> => {
      const { data: groups, error: gErr } = await supabase
        .from("groups")
        .select("id, name, code, letters_per_turn")
        .eq("session_id", sessionId)
        .order("created_at");
      if (gErr) throw gErr;

      if (!groups?.length) return [];

      const groupIds = groups.map((g) => g.id);

      const { data: gs, error: gsErr } = await supabase
        .from("group_students")
        .select("group_id, position, student:students(id, first_name, last_name)")
        .in("group_id", groupIds)
        .order("position");
      if (gsErr) throw gsErr;

      const { data: tp, error: tpErr } = await supabase
        .from("turn_progress")
        .select("group_id, student_id, current_letter_index, status, turn_started_at")
        .in("group_id", groupIds);
      if (tpErr) throw tpErr;

      return groups.map((g) => ({
        group: g,
        students: (gs ?? [])
          .filter((x) => x.group_id === g.id)
          .map((x) => {
            const s = x.student as unknown as { id: string; first_name: string; last_name: string };
            const p = (tp ?? []).find(
              (q) => q.group_id === g.id && q.student_id === s.id
            ) ?? { current_letter_index: 0, status: "not_started", turn_started_at: null };
            return {
              id: s.id,
              first_name: s.first_name,
              last_name: s.last_name,
              progress: {
                current_letter_index: p.current_letter_index,
                status: p.status,
                turn_started_at: p.turn_started_at,
              },
            };
          }),
      }));
    },
  });

  // Realtime subscribe to turn_progress changes
  useEffect(() => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turn_progress" },
        () => refetch()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refetch]);

  const endSession = async () => {
    const { error } = await supabase
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) return toast.error(error.message);
    toast.success("Session ended");
    onEnded();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Live session</h1>
          <p className="text-sm text-muted-foreground">
            Read each group's code aloud so kids can join on the iPad.
          </p>
        </div>
        <Button variant="outline" onClick={endSession} className="gap-2 rounded-full">
          <Square className="h-4 w-4" /> End session
        </Button>
      </div>

      <div className="space-y-4">
        {rows.map((r) => (
          <GroupCard key={r.group.id} row={r} tick={tick} />
        ))}
      </div>
    </div>
  );
}

function GroupCard({ row, tick }: { row: Row; tick: number }) {
  const [open, setOpen] = useState(true);
  // tick reference to silence unused warning
  void tick;

  const total = row.students.length;
  const done = useMemo(
    () => row.students.filter((s) => s.progress.status === "done").length,
    [row.students]
  );

  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
                <Users className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold">{row.group.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {done}/{total} done · {row.group.letters_per_turn} letter
                  {row.group.letters_per_turn === 1 ? "" : "s"} per turn
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-accent px-4 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground/70">
                  Code
                </p>
                <p className="font-display text-2xl font-bold tracking-[0.3em] text-accent-foreground">
                  {row.group.code}
                </p>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-5 py-3">Current letter</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3 text-right">Time on turn</th>
                </tr>
              </thead>
              <tbody>
                {row.students.map((s) => (
                  <StudentRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function StudentRow({ s }: { s: Row["students"][number] }) {
  const total = letterCount(s);
  const idx = s.progress.current_letter_index;
  const letter = s.first_name[idx] ?? "—";
  const pct = Math.min(100, Math.round((idx / total) * 100));

  if (s.progress.status === "not_started") {
    return (
      <tr className="border-t border-border">
        <td className="px-5 py-4 font-medium">{fullName(s)}</td>
        <td className="px-5 py-4 text-muted-foreground" colSpan={3}>
          Not started
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-5 py-4 font-medium">{fullName(s)}</td>
      <td className="px-5 py-4">
        <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-primary/10 font-display text-lg font-bold text-primary">
          {letter.toUpperCase()}
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
        </div>
      </td>
      <td className="px-5 py-4 text-right">
        <Timer startedAt={s.progress.turn_started_at} done={s.progress.status === "done"} />
      </td>
    </tr>
  );
}

function Timer({ startedAt, done }: { startedAt: string | null; done: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (done || !startedAt) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [startedAt, done]);

  if (!startedAt) return <span className="text-muted-foreground">—</span>;
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm">
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      {mm}:{ss}
    </span>
  );
}
