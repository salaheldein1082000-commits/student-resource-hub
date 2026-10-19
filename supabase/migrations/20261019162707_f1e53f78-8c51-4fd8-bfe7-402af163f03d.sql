create type public.app_role as enum ('assessor','student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, avatar_url text,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
grant select, update on public.profiles to authenticated; grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;

create policy "own or assessor read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'assessor'));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'assessor'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email), new.email, new.raw_user_meta_data->>'avatar_url');
  if not exists (select 1 from public.user_roles where role='assessor') then
    insert into public.user_roles(user_id, role) values (new.id,'assessor');
  else
    insert into public.user_roles(user_id, role) values (new.id,'student');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- criteria
create table public.criteria (
  code text primary key, unit_no int not null default 1, learning_aim text not null,
  grade text not null, description text not null, sort_order int not null default 0
);
grant select on public.criteria to authenticated; grant insert, update, delete on public.criteria to authenticated; grant all on public.criteria to service_role;
alter table public.criteria enable row level security;
create policy "read criteria" on public.criteria for select to authenticated using (true);
create policy "assessor manage criteria" on public.criteria for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));
insert into public.criteria(code, learning_aim, grade, description, sort_order) values
 ('A.P1','A','Pass','Explain the purpose and features of IT infrastructure components (hardware, software, networking).',1),
 ('A.P2','A','Pass','Explain how infrastructure components interact to support an organisation.',2),
 ('A.M1','A','Merit','Analyse how infrastructure choices affect performance, cost and reliability.',3),
 ('A.D1','A','Distinction','Evaluate the suitability of an IT infrastructure for a given organisation.',4),
 ('B.P3','B','Pass','Produce a design for an IT infrastructure that meets client requirements.',5),
 ('B.P4','B','Pass','Review the design with others to identify and inform improvements.',6),
 ('B.M2','B','Merit','Justify design decisions, showing how they meet the requirements.',7),
 ('C.P5','C','Pass','Set up and configure the IT infrastructure to meet the design.',8),
 ('C.P6','C','Pass','Test the infrastructure and document results.',9),
 ('C.M3','C','Merit','Optimise the infrastructure based on test results and feedback.',10),
 ('BC.D2','C','Distinction','Evaluate the design and implementation, justifying decisions and optimisations.',11);

-- assignments
create table public.assignments (
  id uuid primary key default gen_random_uuid(), unit_no int not null default 1,
  learning_aim text, title text not null, brief text, due_date date,
  criteria_codes text[] not null default '{}', is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assignments to authenticated; grant all on public.assignments to service_role;
alter table public.assignments enable row level security;
create policy "read published assignments" on public.assignments for select to authenticated using (is_published or public.has_role(auth.uid(),'assessor'));
create policy "assessor manage assignments" on public.assignments for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));
create trigger t_assign_upd before update on public.assignments for each row execute function public.update_updated_at_column();

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'submitted',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(assignment_id, student_id)
);
grant select, insert, update, delete on public.submissions to authenticated; grant all on public.submissions to service_role;
alter table public.submissions enable row level security;
create policy "student read own subs" on public.submissions for select to authenticated using (student_id = auth.uid() or public.has_role(auth.uid(),'assessor'));
create policy "student create own subs" on public.submissions for insert to authenticated with check (student_id = auth.uid());
create policy "student/assessor update subs" on public.submissions for update to authenticated using (student_id = auth.uid() or public.has_role(auth.uid(),'assessor'));
create policy "assessor delete subs" on public.submissions for delete to authenticated using (public.has_role(auth.uid(),'assessor'));
create trigger t_sub_upd before update on public.submissions for each row execute function public.update_updated_at_column();

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  attempt_no int not null, file_path text not null, file_name text not null, note text,
  declaration_accepted boolean not null, declared_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  feedback text, assessed_at timestamptz, assessed_by uuid
);
grant select, insert, update on public.attempts to authenticated; grant all on public.attempts to service_role;
alter table public.attempts enable row level security;
create policy "read attempts" on public.attempts for select to authenticated using (
  public.has_role(auth.uid(),'assessor') or exists(select 1 from public.submissions s where s.id=submission_id and s.student_id=auth.uid()));
create policy "student add attempt" on public.attempts for insert to authenticated with check (
  declaration_accepted = true and exists(select 1 from public.submissions s where s.id=submission_id and s.student_id=auth.uid()));
create policy "assessor update attempt" on public.attempts for update to authenticated using (public.has_role(auth.uid(),'assessor'));

create table public.criterion_results (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  criterion_code text not null references public.criteria(code) on delete cascade,
  achieved boolean not null default false, comment text,
  primary key(attempt_id, criterion_code)
);
grant select, insert, update, delete on public.criterion_results to authenticated; grant all on public.criterion_results to service_role;
alter table public.criterion_results enable row level security;
create policy "read results" on public.criterion_results for select to authenticated using (
  public.has_role(auth.uid(),'assessor') or exists(select 1 from public.attempts a join public.submissions s on s.id=a.submission_id where a.id=attempt_id and s.student_id=auth.uid()));
create policy "assessor manage results" on public.criterion_results for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));

-- resources
create table public.resources (
  id uuid primary key default gen_random_uuid(), unit_no int not null default 1,
  learning_aim text not null, title text not null,
  type text not null check (type in ('video','pdf','link','slides','template')),
  url text not null, description text, linked_criteria text[] not null default '{}',
  is_pinned boolean not null default false, visible_from timestamptz,
  is_published boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.resources to authenticated; grant all on public.resources to service_role;
alter table public.resources enable row level security;
create policy "students read visible resources" on public.resources for select to authenticated using (
  public.has_role(auth.uid(),'assessor') or (is_published and (visible_from is null or visible_from <= now())));
create policy "assessor manage resources" on public.resources for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));
create trigger t_res_upd before update on public.resources for each row execute function public.update_updated_at_column();

create table public.resource_views (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
grant select, insert on public.resource_views to authenticated; grant all on public.resource_views to service_role;
alter table public.resource_views enable row level security;
create policy "log own views" on public.resource_views for insert to authenticated with check (student_id = auth.uid());
create policy "read views" on public.resource_views for select to authenticated using (student_id = auth.uid() or public.has_role(auth.uid(),'assessor'));

create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, body text,
  kind text not null default 'notice', is_published boolean not null default true,
  expires_at timestamptz, created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.announcements to authenticated; grant all on public.announcements to service_role;
alter table public.announcements enable row level security;
create policy "read announcements" on public.announcements for select to authenticated using (
  public.has_role(auth.uid(),'assessor') or (is_published and (expires_at is null or expires_at > now())));
create policy "assessor manage announcements" on public.announcements for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));

create table public.feedback_snippets (
  id uuid primary key default gen_random_uuid(),
  criterion_code text references public.criteria(code) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.feedback_snippets to authenticated; grant all on public.feedback_snippets to service_role;
alter table public.feedback_snippets enable row level security;
create policy "assessor snippets" on public.feedback_snippets for all to authenticated using (public.has_role(auth.uid(),'assessor')) with check (public.has_role(auth.uid(),'assessor'));

-- storage policies for 'submissions' bucket
create policy "student upload own files" on storage.objects for insert to authenticated
  with check (bucket_id='submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or assessor files" on storage.objects for select to authenticated
  using (bucket_id='submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(),'assessor')));