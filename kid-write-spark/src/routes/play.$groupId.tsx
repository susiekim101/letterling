import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tldraw, type Editor, AssetRecordType } from "tldraw";
import "tldraw/tldraw.css";
import { Button } from "@/components/ui/button";
import {
  getGroupState,
  claimTurn,
  advanceLetter,
  passTurn,
  gradeLetter,
} from "@/lib/student.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PartyPopper, Trash2, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/play/$groupId")({
  component: PlayPage,
});

type Student = { id: string; first_name: string; last_name: string };
type Progress = {
  student_id: string;
  current_letter_index: number;
  status: string;
  turn_started_at: string | null;
};
type State = {
  group: { id: string; name: string; code: string; letters_per_turn: number };
  students: Student[];
  progress: Progress[];
  activeStudentId: string | null;
};

const cleanName = (s: string) => s.replace(/[^a-zA-Z]/g, "");

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

function PlayPage() {
  const { groupId } = Route.useParams();
  const fetchState = useServerFn(getGroupState);
  const claim = useServerFn(claimTurn);
  const advance = useServerFn(advanceLetter);
  const pass = useServerFn(passTurn);
  const grade = useServerFn(gradeLetter);

  const [state, setState] = useState<State | null>(null);
  // local stage: "pick" | "write" | "pass" | "complete"
  const [stage, setStage] = useState<"pick" | "write" | "pass" | "complete">("pick");
  const [pendingNext, setPendingNext] = useState<Student | null>(null);
  const [myStudentId, setMyStudentId] = useState<string | null>(null);
  const [letterStartIdx, setLetterStartIdx] = useState(0); // index when current turn started
  const [feedback, setFeedback] = useState<{ text: string; success: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const refresh = useCallback(async () => {
    const s = (await fetchState({ data: { groupId } })) as State;
    setState(s);
    return s;
  }, [fetchState, groupId]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`play-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turn_progress", filter: `group_id=eq.${groupId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, refresh]);

  // Detect session complete
  useEffect(() => {
    if (!state) return;
    if (state.progress.length > 0 && state.progress.every((p) => p.status === "done")) {
      setStage("complete");
    }
  }, [state]);

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (stage === "complete") return <CompleteScreen students={state.students} />;
  if (stage === "pass" && pendingNext)
    return (
      <PassScreen
        next={pendingNext}
        onReady={async () => {
          await pass({
            data: {
              groupId,
              fromStudentId: myStudentId!,
              toStudentId: pendingNext.id,
            },
          });
          setMyStudentId(pendingNext.id);
          const s = await refresh();
          const p = s.progress.find((x) => x.student_id === pendingNext.id);
          setLetterStartIdx(p?.current_letter_index ?? 0);
          setPendingNext(null);
          setFeedback(null);
          setStage("write");
          editorRef.current?.selectAll().deleteShapes(editorRef.current.getSelectedShapeIds());
        }}
      />
    );

  if (stage === "pick" || !myStudentId) {
    return (
      <PickName
        state={state}
        onPick={async (s) => {
          try {
            const res = (await claim({
              data: { groupId, studentId: s.id },
            })) as State;
            setState(res);
            setMyStudentId(s.id);
            const p = res.progress.find((x) => x.student_id === s.id);
            setLetterStartIdx(p?.current_letter_index ?? 0);
            setStage("write");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    );
  }

  // write stage
  const me = state.students.find((s) => s.id === myStudentId)!;
  const myProg = state.progress.find((p) => p.student_id === myStudentId)!;
  const nameLetters = cleanName(me.first_name);
  const letter = nameLetters[myProg.current_letter_index] ?? "";

  const handleClear = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const ids = Array.from(ed.getCurrentPageShapeIds());
    if (ids.length) ed.deleteShapes(ids);
    setFeedback(null);
  };

  const handleCheck = async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const shapeIds = Array.from(ed.getCurrentPageShapeIds());
    if (shapeIds.length === 0) {
      toast.error("Draw the letter first!");
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await ed.toImage(shapeIds, {
        format: "png",
        background: true,
        scale: 1,
        padding: 32,
      });
      const blob = result.blob;
      const dataUrl = await blobToDataUrl(blob);
      const res = await grade({ data: { letter, imageDataUrl: dataUrl } });
      setFeedback({ text: res.feedback, success: res.is_successful });
      speak(res.feedback);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextLetter = async () => {
    const res = (await advance({
      data: { groupId, studentId: myStudentId! },
    })) as State;
    setState(res);
    setFeedback(null);
    handleClear();

    const myNew = res.progress.find((p) => p.student_id === myStudentId)!;
    const total = nameLetters.length;
    const turnLen = state.group.letters_per_turn;

    // session complete?
    if (res.progress.every((p) => p.status === "done")) {
      setStage("complete");
      return;
    }

    if (myNew.status === "done") {
      // advance to next not-done student in order
      const nextS = pickNextStudent(res, myStudentId!);
      if (nextS) {
        setPendingNext(nextS);
        setStage("pass");
        speak(`${nextS.first_name}, your turn!`);
      } else {
        setStage("complete");
      }
      return;
    }

    // turn boundary
    const lettersThisTurn = myNew.current_letter_index - letterStartIdx;
    if (lettersThisTurn >= turnLen && myNew.current_letter_index < total) {
      const nextS = pickNextStudent(res, myStudentId!);
      if (nextS) {
        setPendingNext(nextS);
        setStage("pass");
        speak(`${nextS.first_name}, your turn!`);
      }
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-background to-secondary/30">
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
            {myProg.current_letter_index + 1} / {nameLetters.length}
          </p>
        </div>
      </header>

      <div className="mx-4 flex-1 overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border">
        <Tldraw
          hideUi
          onMount={(ed) => {
            editorRef.current = ed;
            ed.setCurrentTool("draw");
            ed.updateInstanceState({ isDebugMode: false });
          }}
        />
      </div>

      {feedback && (
        <div
          className={`mx-4 mt-3 rounded-2xl p-4 text-center text-base font-medium ${
            feedback.success
              ? "bg-success/15 text-success-foreground ring-1 ring-success/40"
              : "bg-accent text-accent-foreground"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex items-center gap-3 p-4">
        <Button
          variant="outline"
          size="lg"
          onClick={handleClear}
          className="h-16 gap-2 rounded-full px-6 text-base"
        >
          <Trash2 className="h-5 w-5" /> Clear
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
            {submitting ? "Checking…" : "Check my letter"}
          </Button>
        )}
      </div>
    </main>
  );
}

function pickNextStudent(s: State, currentId: string): Student | null {
  const order = s.students;
  const idx = order.findIndex((x) => x.id === currentId);
  for (let i = 1; i <= order.length; i++) {
    const cand = order[(idx + i) % order.length];
    const p = s.progress.find((x) => x.student_id === cand.id);
    if (p && p.status !== "done") return cand;
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function PickName({ state, onPick }: { state: State; onPick: (s: Student) => void }) {
  const taken = (sid: string) => {
    const p = state.progress.find((x) => x.student_id === sid);
    return p?.status === "done";
  };
  const isActiveOther = state.activeStudentId !== null;
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/40 px-6 py-10">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-sm uppercase tracking-wider text-muted-foreground">
          {state.group.name}
        </p>
        <h1 className="mt-2 text-center font-display text-4xl font-bold">Tap your name</h1>
        {isActiveOther && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Someone is writing — pick your name to wait your turn.
          </p>
        )}
        <div className="mt-8 grid gap-3">
          {state.students.map((s) => {
            const done = taken(s.id);
            return (
              <button
                key={s.id}
                onClick={() => !done && onPick(s)}
                disabled={done}
                className={`rounded-3xl p-6 text-left text-2xl font-bold shadow-sm ring-1 transition ${
                  done
                    ? "bg-muted text-muted-foreground ring-border line-through"
                    : "bg-card ring-border hover:bg-primary/10 active:scale-[0.98]"
                }`}
              >
                {s.first_name} {s.last_name[0]}.
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function PassScreen({ next, onReady }: { next: Student; onReady: () => void }) {
  useEffect(() => {
    speak(`${next.first_name}, your turn!`);
  }, [next.first_name]);
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
  );
}

function CompleteScreen({ students }: { students: Student[] }) {
  useEffect(() => {
    speak("All done! Great job everyone!");
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-background to-accent/40 px-6">
      <div className="text-center">
        <PartyPopper className="mx-auto h-20 w-20 text-primary" />
        <h1 className="mt-4 font-display text-5xl font-bold">All done!</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Great job, {students.map((s) => s.first_name).join(", ")}!
        </p>
        <Button
          size="lg"
          onClick={() => toast.success("Results sent to parents! (demo)")}
          className="mt-10 h-16 rounded-full px-10 text-xl"
        >
          Send results to parents
        </Button>
      </div>
    </main>
  );
}

// satisfy unused import lint when AssetRecordType isn't used
void AssetRecordType;
