import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Play, Users } from "lucide-react";
import { toast } from "sonner";
import type { Student } from "./StudentList";

type DraftGroup = {
  id: string; // local
  name: string;
  studentIds: string[];
  lettersPerTurn: number;
};

function gen4Code() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function CreateSessionDialog({
  teacherId,
  onSessionStarted,
}: {
  teacherId: string;
  onSessionStarted: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftGroup[]>([]);

  const { data: students = [] } = useQuery({
    queryKey: ["students", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students").select("*").eq("teacher_id", teacherId).order("first_name");
      if (error) throw error;
      return data as Student[];
    },
    enabled: open,
  });

  const addDraft = () =>
    setDrafts((d) => [
      ...d,
      { id: crypto.randomUUID(), name: "", studentIds: [], lettersPerTurn: 1 },
    ]);

  const updateDraft = (id: string, patch: Partial<DraftGroup>) =>
    setDrafts((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const removeDraft = (id: string) => setDrafts((d) => d.filter((g) => g.id !== id));

  const toggleStudent = (gid: string, sid: string) => {
    setDrafts((d) =>
      d.map((g) => {
        if (g.id !== gid) return g;
        const has = g.studentIds.includes(sid);
        if (has) return { ...g, studentIds: g.studentIds.filter((x) => x !== sid) };
        if (g.studentIds.length >= 5) {
          toast.error("Max 5 students per group");
          return g;
        }
        return { ...g, studentIds: [...g.studentIds, sid] };
      })
    );
  };

  const start = useMutation({
    mutationFn: async () => {
      if (drafts.length === 0) throw new Error("Add at least one group");
      for (const g of drafts) {
        if (!g.name.trim()) throw new Error("Every group needs a name");
        if (g.studentIds.length === 0) throw new Error(`Group "${g.name}" has no students`);
        if (g.lettersPerTurn < 1) throw new Error("Letters per turn must be at least 1");
      }

      const { data: session, error: sErr } = await supabase
        .from("sessions")
        .insert({ teacher_id: teacherId, status: "active" })
        .select()
        .single();
      if (sErr) throw sErr;

      for (const g of drafts) {
        const { data: group, error: gErr } = await supabase
          .from("groups")
          .insert({
            session_id: session.id,
            name: g.name.trim(),
            code: gen4Code(),
            letters_per_turn: g.lettersPerTurn,
          })
          .select()
          .single();
        if (gErr) throw gErr;

        const gsRows = g.studentIds.map((sid, i) => ({
          group_id: group.id,
          student_id: sid,
          position: i,
        }));
        const { error: gsErr } = await supabase.from("group_students").insert(gsRows);
        if (gsErr) throw gsErr;

        const tpRows = g.studentIds.map((sid) => ({
          group_id: group.id,
          student_id: sid,
          status: "not_started",
          current_letter_index: 0,
        }));
        const { error: tpErr } = await supabase.from("turn_progress").insert(tpRows);
        if (tpErr) throw tpErr;
      }

      return session.id as string;
    },
    onSuccess: (sid) => {
      toast.success("Session started!");
      setOpen(false);
      setDrafts([]);
      onSessionStarted(sid);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full gap-2 rounded-full">
          <Play className="h-5 w-5" /> Create session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">New session</DialogTitle>
        </DialogHeader>

        {students.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            Add students before creating a session.
          </p>
        ) : (
          <div className="space-y-4">
            {drafts.map((g, idx) => (
              <div key={g.id} className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-border">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" /> Group {idx + 1}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDraft(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Group name</Label>
                    <Input
                      value={g.name}
                      onChange={(e) => updateDraft(g.id, { name: e.target.value })}
                      placeholder="e.g. Blue Table"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label>Letters per turn</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={g.lettersPerTurn}
                      onChange={(e) =>
                        updateDraft(g.id, { lettersPerTurn: parseInt(e.target.value) || 1 })
                      }
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Label className="mb-2 block">Students ({g.studentIds.length}/5)</Label>
                  <div className="flex flex-wrap gap-2">
                    {students.map((s) => {
                      const selected = g.studentIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStudent(g.id, s.id)}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-foreground ring-1 ring-border hover:bg-muted"
                          }`}
                        >
                          {s.first_name} {s.last_name[0]}.
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addDraft} className="w-full gap-2 rounded-full">
              <Plus className="h-4 w-4" /> Add group
            </Button>

            <Button
              onClick={() => start.mutate()}
              disabled={start.isPending || drafts.length === 0}
              className="w-full gap-2 rounded-full"
              size="lg"
            >
              <Play className="h-5 w-5" />
              {start.isPending ? "Starting…" : "Start session"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
