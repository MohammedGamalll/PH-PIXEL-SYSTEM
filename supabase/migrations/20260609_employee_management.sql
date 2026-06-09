-- Employee management: tables, RLS policies, and helper RPCs.
-- Idempotent: safe to run on an existing database where these objects already exist.

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.employees (
  id uuid primary key,                       -- equals auth.users.id
  admin_id uuid not null,                     -- owner/admin (branch) this employee belongs to
  name text not null,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  basic_salary numeric not null default 0,
  working_hours numeric not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_admin_id_idx on public.employees (admin_id);

create table if not exists public.employee_activity_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  admin_id uuid not null,
  employee_id uuid,
  actor_name text,
  action_type text not null,
  subject_type text,
  subject_id uuid,
  subject_label text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists employee_activity_log_admin_idx on public.employee_activity_log (admin_id, created_at desc);
create index if not exists employee_activity_log_employee_idx on public.employee_activity_log (employee_id);

-- =========================================================================
-- Helper functions
-- =========================================================================

-- Returns the admin_id for the currently authenticated user.
-- If the caller is an employee, returns their admin_id; otherwise returns their own id.
create or replace function public.get_auth_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.admin_id from public.employees e where e.id = auth.uid()),
    auth.uid()
  );
$$;

-- Returns the list of employees belonging to the caller's admin (branch).
create or replace function public.get_admin_employees()
returns table (
  id uuid,
  name text,
  email text,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, e.email, e.first_name, e.last_name
  from public.employees e
  where e.admin_id = public.get_auth_admin_id();
$$;

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.employees enable row level security;
alter table public.employee_activity_log enable row level security;

-- Admin can see/manage only their own employees; an employee can see only their own row.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select
  using (
    admin_id = auth.uid()
    or id = auth.uid()
  );

drop policy if exists employees_admin_write on public.employees;
create policy employees_admin_write on public.employees
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- Activity log: visible within the same branch (admin or its employees).
drop policy if exists employee_activity_log_select on public.employee_activity_log;
create policy employee_activity_log_select on public.employee_activity_log
  for select
  using (admin_id = public.get_auth_admin_id());

drop policy if exists employee_activity_log_insert on public.employee_activity_log;
create policy employee_activity_log_insert on public.employee_activity_log
  for insert
  with check (admin_id = public.get_auth_admin_id());

grant execute on function public.get_auth_admin_id() to authenticated;
grant execute on function public.get_admin_employees() to authenticated;
