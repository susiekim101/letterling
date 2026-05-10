
-- STUDENTS
create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  parent_email text not null,
  created_at timestamptz not null default now()
);
alter table public.students enable row level security;
create policy "Teachers manage own students" on public.students
  for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create index on public.students(teacher_id);

-- SESSIONS
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.sessions enable row level security;
create policy "Teachers manage own sessions" on public.sessions
  for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create index on public.sessions(teacher_id);

-- GROUPS
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  code text not null unique,
  letters_per_turn int not null default 1,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;
create policy "Teachers manage groups in own sessions" on public.groups
  for all using (
    exists (select 1 from public.sessions s where s.id = session_id and s.teacher_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s where s.id = session_id and s.teacher_id = auth.uid())
  );
create index on public.groups(session_id);

-- GROUP STUDENTS (ordered turn list)
create table public.group_students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  position int not null,
  unique (group_id, student_id)
);
alter table public.group_students enable row level security;
create policy "Teachers manage own group_students" on public.group_students
  for all using (
    exists (
      select 1 from public.groups g
      join public.sessions s on s.id = g.session_id
      where g.id = group_id and s.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.groups g
      join public.sessions s on s.id = g.session_id
      where g.id = group_id and s.teacher_id = auth.uid()
    )
  );
create index on public.group_students(group_id);

-- TURN PROGRESS (live per-student state)
create table public.turn_progress (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  current_letter_index int not null default 0,
  status text not null default 'not_started', -- not_started | active | done
  turn_started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (group_id, student_id)
);
alter table public.turn_progress enable row level security;
create policy "Teachers view own turn_progress" on public.turn_progress
  for select using (
    exists (
      select 1 from public.groups g
      join public.sessions s on s.id = g.session_id
      where g.id = group_id and s.teacher_id = auth.uid()
    )
  );
create policy "Teachers manage own turn_progress" on public.turn_progress
  for all using (
    exists (
      select 1 from public.groups g
      join public.sessions s on s.id = g.session_id
      where g.id = group_id and s.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.groups g
      join public.sessions s on s.id = g.session_id
      where g.id = group_id and s.teacher_id = auth.uid()
    )
  );
create index on public.turn_progress(group_id);

-- Realtime for turn_progress (Chain B will write to this; teacher dashboard listens)
alter publication supabase_realtime add table public.turn_progress;
