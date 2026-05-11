import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadGroupByCode, loadGroupState } from "./student.server";

const cleanName = (s: string) => s.replace(/[^a-zA-Z]/g, "");

export const joinGroupByCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().regex(/^\d{4}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const group = await loadGroupByCode(data.code);
    return loadGroupState(group.id);
  });

export const getGroupState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ groupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => loadGroupState(data.groupId));

export const claimTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ groupId: z.string().uuid(), studentId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const state = await loadGroupState(data.groupId);
    // If someone else is active and not this student, refuse
    if (state.activeStudentId && state.activeStudentId !== data.studentId) {
      throw new Error("Another student is currently writing");
    }
    const me = state.progress.find((p) => p.student_id === data.studentId);
    if (me?.status === "done") throw new Error("This student has already finished");

    const { error } = await supabaseAdmin
      .from("turn_progress")
      .update({
        status: "active",
        turn_started_at: me?.turn_started_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", data.groupId)
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);
    return loadGroupState(data.groupId);
  });

export const advanceLetter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ groupId: z.string().uuid(), studentId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const state = await loadGroupState(data.groupId);
    const student = state.students.find((s) => s.id === data.studentId);
    if (!student) throw new Error("Student not in group");
    const total = cleanName(student.first_name).length || 1;
    const me = state.progress.find((p) => p.student_id === data.studentId);
    const nextIdx = (me?.current_letter_index ?? 0) + 1;
    const done = nextIdx >= total;

    const { error } = await supabaseAdmin
      .from("turn_progress")
      .update({
        current_letter_index: nextIdx,
        status: done ? "done" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", data.groupId)
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);
    return loadGroupState(data.groupId);
  });

export const passTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        groupId: z.string().uuid(),
        fromStudentId: z.string().uuid(),
        toStudentId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    // Mark current as not_started (paused) unless they're done
    const state = await loadGroupState(data.groupId);
    const fromProg = state.progress.find((p) => p.student_id === data.fromStudentId);
    if (fromProg && fromProg.status !== "done") {
      await supabaseAdmin
        .from("turn_progress")
        .update({ status: "not_started", turn_started_at: null, updated_at: now })
        .eq("group_id", data.groupId)
        .eq("student_id", data.fromStudentId);
    }
    const { error } = await supabaseAdmin
      .from("turn_progress")
      .update({ status: "active", turn_started_at: now, updated_at: now })
      .eq("group_id", data.groupId)
      .eq("student_id", data.toStudentId);
    if (error) throw new Error(error.message);
    return loadGroupState(data.groupId);
  });

export const gradeLetter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        letter: z.string().min(1).max(2),
        imageDataUrl: z.string().min(20).max(8_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        feedback: "(Demo) Great try! Keep going.",
        is_successful: true,
      };
    }

    const prompt = `You are a warm, encouraging kindergarten handwriting coach.
A 5-year-old child just tried to write the letter "${data.letter}" on a whiteboard.
Look at the drawing in the image. In ONE short, friendly sentence (max 18 words):
- If it looks like the letter "${data.letter}" (even rough), praise them and confirm.
- If not, gently say what to try next (e.g., "try a tall straight line down").
Then on a new line output ONLY: SUCCESS=true or SUCCESS=false`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("AI gateway error", res.status, body);
        return { feedback: "Nice try! Let's check that again.", is_successful: false };
      }
      const json = await res.json();
      const raw: string = json.choices?.[0]?.message?.content ?? "";
      const successMatch = raw.match(/SUCCESS\s*=\s*(true|false)/i);
      const is_successful = successMatch ? successMatch[1].toLowerCase() === "true" : false;
      const feedback = raw.replace(/SUCCESS\s*=\s*(true|false)/i, "").trim() ||
        (is_successful ? "Wonderful!" : "Let's try once more.");
      return { feedback, is_successful };
    } catch (e) {
      console.error("gradeLetter failed", e);
      return { feedback: "Hmm, let's try that again!", is_successful: false };
    }
  });
