import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, UserPlus, Mail, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";

export type Student = {
  id: string;
  first_name: string;
  last_name: string;
  parent_email: string;
};

export function StudentList({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const [showEmails, setShowEmails] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("teacher_id", teacherId)
        .order("first_name");
      if (error) throw error;
      return data as Student[];
    },
  });

  return (
    <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Your students</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEmails((v) => !v)}
          className="gap-1.5 rounded-full"
        >
          {showEmails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showEmails ? "Hide" : "Show"} emails
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : students.length === 0 ? (
        <p className="rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
          No students yet. Add your first one below!
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {students.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">
                  {s.first_name} <span className="text-muted-foreground">{s.last_name}</span>
                </p>
                {showEmails && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {s.parent_email}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddStudentDialog teacherId={teacherId} onAdded={() => qc.invalidateQueries({ queryKey: ["students", teacherId] })} />
    </div>
  );
}

function AddStudentDialog({ teacherId, onAdded }: { teacherId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [parentEmail, setParentEmail] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").insert({
        teacher_id: teacherId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        parent_email: parentEmail.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added");
      setFirstName(""); setLastName(""); setParentEmail("");
      setOpen(false);
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4 w-full gap-2 rounded-full">
          <UserPlus className="h-4 w-4" /> Add student
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Add a student</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="fn">First name</Label>
            <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="ln">Last name</Label>
            <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="pe">Parent email</Label>
            <Input id="pe" type="email" required value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} className="mt-1.5 rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="w-full rounded-full gap-2">
              <Plus className="h-4 w-4" /> {mutation.isPending ? "Adding…" : "Add student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
