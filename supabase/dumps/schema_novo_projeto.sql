-- =====================================================================
-- Schema-only migration SQL, extracted from Supabase backup dump
-- Source: Gerenciador de Tarefas FK - db_cluster-15-08-2026@00-38-35.backup
-- Contains: public schema tables, sequences, functions, triggers,
--           constraints, indexes, RLS policies, realtime publication,
--           and grants. NO DATA, NO auth.users, NO storage.
-- Run this in the SQL Editor of a fresh Supabase project.
-- =====================================================================

-- Extensions (usually already enabled by default on new Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Required: some function bodies below reference tables created later in
-- this script (e.g. get_user_projects references project_members). This
-- matches the original pg_dump behavior of skipping eager validation.
SET check_function_bodies = false;

--
-- Name: add_todo_to_group(bigint, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.add_todo_to_group(p_todo_id bigint, p_group_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.todo_groups (todo_id, group_id, user_id)
  VALUES (p_todo_id, p_group_id, auth.uid())
  ON CONFLICT (todo_id, group_id) DO NOTHING;
END;
$$;


ALTER FUNCTION public.add_todo_to_group(p_todo_id bigint, p_group_id bigint) OWNER TO postgres;

--
-- Name: apply_section_default_assignee(); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.apply_section_default_assignee() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if new.assignee_id is null and new.section_id is not null then
    select default_assignee_id into new.assignee_id
    from public.sections where id = new.section_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.apply_section_default_assignee() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.projects (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    description text,
    color text DEFAULT '#6366f1'::text,
    icon text,
    owner_id uuid NOT NULL,
    status text DEFAULT 'active'::text,
    shared_with uuid[] DEFAULT '{}'::uuid[],
    show_on_dashboard boolean DEFAULT true
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: get_user_projects(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.get_user_projects(p_user_id uuid) RETURNS SETOF public.projects
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.* from public.projects p
  where p.owner_id = p_user_id
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = p.id and pm.user_id = p_user_id
  );
$$;


ALTER FUNCTION public.get_user_projects(p_user_id uuid) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: has_project_access(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.has_project_access(p_project_id bigint, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select
    public.is_project_member(p_project_id, p_user_id)
    or exists (
      select 1 from public.sections s
      where s.project_id = p_project_id and public.is_section_shared(s.id, p_user_id)
    )
    or exists (
      select 1 from public.todos t
      where t.project_id = p_project_id and public.is_task_shared(t.id, p_user_id)
    )
    or exists (
      select 1 from public.todos t
      where t.project_id = p_project_id and t.assignee_id = p_user_id
    );
$$;


ALTER FUNCTION public.has_project_access(p_project_id bigint, p_user_id uuid) OWNER TO postgres;

--
-- Name: has_section_access(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.has_section_access(p_section_id bigint, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select
    exists (
      select 1 from public.sections s
      where s.id = p_section_id
        and (s.user_id = p_user_id or public.is_project_member(s.project_id, p_user_id))
    )
    or public.is_section_shared(p_section_id, p_user_id)
    or exists (
      select 1 from public.todos t
      where t.section_id = p_section_id and public.is_task_shared(t.id, p_user_id)
    );
$$;


ALTER FUNCTION public.has_section_access(p_section_id bigint, p_user_id uuid) OWNER TO postgres;

--
-- Name: is_project_member(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.is_project_member(p_project_id bigint, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      return exists (
        select 1 from public.project_members
        where project_id = p_project_id and user_id = p_user_id
      );
    end;
    $$;


ALTER FUNCTION public.is_project_member(p_project_id bigint, p_user_id uuid) OWNER TO postgres;

--
-- Name: is_section_shared(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.is_section_shared(p_section_id bigint, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.section_shares where section_id = p_section_id and user_id = p_user_id
  );
$$;


ALTER FUNCTION public.is_section_shared(p_section_id bigint, p_user_id uuid) OWNER TO postgres;

--
-- Name: is_task_shared(bigint, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.is_task_shared(p_task_id bigint, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.task_shares where task_id = p_task_id and user_id = p_user_id
  );
$$;


ALTER FUNCTION public.is_task_shared(p_task_id bigint, p_user_id uuid) OWNER TO postgres;

--
-- Name: restrict_assignee_change(); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE FUNCTION public.restrict_assignee_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if new.assignee_id is distinct from old.assignee_id then
    if new.project_id is not null and not exists (
      select 1 from public.projects where id = new.project_id and owner_id = auth.uid()
    ) then
      raise exception 'Apenas o proprietário do projeto pode atribuir esta tarefa.';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.restrict_assignee_change() OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.events (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.finance_transactions (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    date date NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    category text,
    CONSTRAINT finance_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text]))),
    CONSTRAINT finance_transactions_type_check CHECK ((type = ANY (ARRAY['payable'::text, 'receivable'::text])))
);


ALTER TABLE public.finance_transactions OWNER TO postgres;

--
-- Name: finance_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.finance_transactions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.finance_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.goals (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    description text,
    target_date date,
    is_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.goals OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.goals ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.goals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: project_invites; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.project_invites (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    invited_user_id uuid NOT NULL,
    invited_by_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT project_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


ALTER TABLE public.project_invites OWNER TO postgres;

--
-- Name: project_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.project_invites ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.project_invites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.project_members (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    project_id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text
);


ALTER TABLE public.project_members OWNER TO postgres;

--
-- Name: project_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


CREATE SEQUENCE public.project_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_members_id_seq OWNER TO postgres;

--
-- Name: project_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--


ALTER SEQUENCE public.project_members_id_seq OWNED BY public.project_members.id;


--
-- Name: project_sections; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.project_sections (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    project_id bigint NOT NULL,
    title text NOT NULL,
    color text DEFAULT '#94a3b8'::text,
    "position" integer DEFAULT 0
);


ALTER TABLE public.project_sections OWNER TO postgres;

--
-- Name: project_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


CREATE SEQUENCE public.project_sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_sections_id_seq OWNER TO postgres;

--
-- Name: project_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--


ALTER SEQUENCE public.project_sections_id_seq OWNED BY public.project_sections.id;


--
-- Name: project_tasks; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.project_tasks (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    project_id bigint NOT NULL,
    section_id bigint,
    parent_task_id bigint,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'none'::text,
    assignee_id uuid,
    due_date date,
    "position" integer DEFAULT 0,
    is_completed boolean DEFAULT false
);


ALTER TABLE public.project_tasks OWNER TO postgres;

--
-- Name: project_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


CREATE SEQUENCE public.project_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_tasks_id_seq OWNER TO postgres;

--
-- Name: project_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--


ALTER SEQUENCE public.project_tasks_id_seq OWNED BY public.project_tasks.id;


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


CREATE SEQUENCE public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--


ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: section_shares; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.section_shares (
    id bigint NOT NULL,
    section_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.section_shares OWNER TO postgres;

--
-- Name: section_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.section_shares ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.section_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.sections (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    project_id bigint NOT NULL,
    title text NOT NULL,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    default_assignee_id uuid,
    color text
);


ALTER TABLE public.sections OWNER TO postgres;

--
-- Name: sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.sections ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subtasks; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.subtasks (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    title text NOT NULL,
    is_completed boolean DEFAULT false,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.subtasks OWNER TO postgres;

--
-- Name: subtasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.subtasks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subtasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: task_review_notifications; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.task_review_notifications (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    task_id bigint NOT NULL,
    task_title text NOT NULL,
    sender_name text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    type text DEFAULT 'review'::text,
    note text,
    CONSTRAINT task_review_notifications_type_check CHECK ((type = ANY (ARRAY['review'::text, 'approved'::text, 'rejected'::text, 'assigned'::text])))
);


ALTER TABLE public.task_review_notifications OWNER TO postgres;

--
-- Name: task_review_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.task_review_notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.task_review_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: task_shares; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.task_shares (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.task_shares OWNER TO postgres;

--
-- Name: task_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.task_shares ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.task_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: task_view_groups; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.task_view_groups (
    id bigint NOT NULL,
    task_id bigint NOT NULL,
    view_group_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.task_view_groups OWNER TO postgres;

--
-- Name: task_view_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.task_view_groups ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.task_view_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: todo_groups; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.todo_groups (
    id bigint NOT NULL,
    todo_id bigint NOT NULL,
    group_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.todo_groups OWNER TO postgres;

--
-- Name: todo_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.todo_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.todo_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: todos; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.todos (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    is_completed boolean DEFAULT false,
    goal_id bigint,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    view_group_id bigint,
    due_at timestamp with time zone,
    is_important boolean DEFAULT false,
    project_id bigint,
    section_id bigint,
    due_date date,
    "position" integer DEFAULT 0 NOT NULL,
    description text,
    priority text,
    status text DEFAULT 'A_FAZER'::text,
    assignee_id uuid,
    deleted_at timestamp with time zone,
    status_changed_at timestamp with time zone DEFAULT now(),
    auto_review_reason text,
    CONSTRAINT todos_priority_check CHECK ((priority = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'urgente'::text]))),
    CONSTRAINT todos_status_check CHECK ((status = ANY (ARRAY['A_FAZER'::text, 'EM_ANDAMENTO'::text, 'REVISAO'::text, 'CONCLUIDO'::text])))
);


ALTER TABLE public.todos OWNER TO postgres;

--
-- Name: COLUMN todos.is_important; Type: COMMENT; Schema: public; Owner: postgres
--


COMMENT ON COLUMN public.todos.is_important IS 'Indica se a tarefa é marcada como importante/urgente';


--
-- Name: COLUMN todos.deleted_at; Type: COMMENT; Schema: public; Owner: postgres
--


COMMENT ON COLUMN public.todos.deleted_at IS 'Quando não nulo, a tarefa está na lixeira (soft delete) e não deve aparecer nas listagens normais.';


--
-- Name: COLUMN todos.status_changed_at; Type: COMMENT; Schema: public; Owner: postgres
--


COMMENT ON COLUMN public.todos.status_changed_at IS 'Última vez que o status da tarefa foi alterado (manual ou automaticamente). Usado para detectar tarefas paradas há mais de 1 dia.';


--
-- Name: COLUMN todos.auto_review_reason; Type: COMMENT; Schema: public; Owner: postgres
--


COMMENT ON COLUMN public.todos.auto_review_reason IS 'Quando não nulo, indica que a tarefa foi movida automaticamente para REVISAO por inatividade. Limpa quando o usuário altera o status manualmente.';


--
-- Name: todos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.todos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.todos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: view_groups; Type: TABLE; Schema: public; Owner: postgres
--


CREATE TABLE public.view_groups (
    id bigint NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    color text DEFAULT '#6366f1'::text,
    icon text DEFAULT 'Folder'::text,
    type text DEFAULT 'time'::text,
    recurrence_type text DEFAULT 'daily'::text,
    recurrence_days jsonb,
    schedules jsonb,
    project_id bigint,
    show_on_dashboard boolean DEFAULT true,
    CONSTRAINT view_groups_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))
);


ALTER TABLE public.view_groups OWNER TO postgres;

--
-- Name: view_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--


ALTER TABLE public.view_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.view_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_members id; Type: DEFAULT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_members ALTER COLUMN id SET DEFAULT nextval('public.project_members_id_seq'::regclass);


--
-- Name: project_sections id; Type: DEFAULT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_sections ALTER COLUMN id SET DEFAULT nextval('public.project_sections_id_seq'::regclass);


--
-- Name: project_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks ALTER COLUMN id SET DEFAULT nextval('public.project_tasks_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.events_id_seq', 1, false);


--
-- Name: finance_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.finance_transactions_id_seq', 5, true);


--
-- Name: goals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.goals_id_seq', 1, false);


--
-- Name: project_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.project_invites_id_seq', 67, true);


--
-- Name: project_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.project_members_id_seq', 82, true);


--
-- Name: project_sections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.project_sections_id_seq', 12, true);


--
-- Name: project_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.project_tasks_id_seq', 503, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.projects_id_seq', 105, true);


--
-- Name: section_shares_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.section_shares_id_seq', 5, true);


--
-- Name: sections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.sections_id_seq', 72, true);


--
-- Name: subtasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.subtasks_id_seq', 9, true);


--
-- Name: task_review_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.task_review_notifications_id_seq', 9, true);


--
-- Name: task_shares_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.task_shares_id_seq', 1, false);


--
-- Name: task_view_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.task_view_groups_id_seq', 125, true);


--
-- Name: todo_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.todo_groups_id_seq', 85, true);


--
-- Name: todos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.todos_id_seq', 520, true);


--
-- Name: view_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--


SELECT pg_catalog.setval('public.view_groups_id_seq', 159, true);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_invites project_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_invites
    ADD CONSTRAINT project_invites_pkey PRIMARY KEY (id);


--
-- Name: project_invites project_invites_project_id_invited_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_invites
    ADD CONSTRAINT project_invites_project_id_invited_user_id_key UNIQUE (project_id, invited_user_id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_sections project_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_sections
    ADD CONSTRAINT project_sections_pkey PRIMARY KEY (id);


--
-- Name: project_tasks project_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: section_shares section_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.section_shares
    ADD CONSTRAINT section_shares_pkey PRIMARY KEY (id);


--
-- Name: section_shares section_shares_section_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.section_shares
    ADD CONSTRAINT section_shares_section_id_user_id_key UNIQUE (section_id, user_id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: subtasks subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);


--
-- Name: task_review_notifications task_review_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_review_notifications
    ADD CONSTRAINT task_review_notifications_pkey PRIMARY KEY (id);


--
-- Name: task_shares task_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_shares
    ADD CONSTRAINT task_shares_pkey PRIMARY KEY (id);


--
-- Name: task_shares task_shares_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_shares
    ADD CONSTRAINT task_shares_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: task_view_groups task_view_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_view_groups
    ADD CONSTRAINT task_view_groups_pkey PRIMARY KEY (id);


--
-- Name: task_view_groups task_view_groups_task_id_view_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_view_groups
    ADD CONSTRAINT task_view_groups_task_id_view_group_id_key UNIQUE (task_id, view_group_id);


--
-- Name: todo_groups todo_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todo_groups
    ADD CONSTRAINT todo_groups_pkey PRIMARY KEY (id);


--
-- Name: todo_groups todo_groups_todo_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todo_groups
    ADD CONSTRAINT todo_groups_todo_id_group_id_key UNIQUE (todo_id, group_id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: view_groups view_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.view_groups
    ADD CONSTRAINT view_groups_pkey PRIMARY KEY (id);


--
-- Name: idx_project_members_composite; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_project_members_composite ON public.project_members USING btree (user_id, project_id);


--
-- Name: idx_project_members_project_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_project_members_project_id ON public.project_members USING btree (project_id);


--
-- Name: idx_project_members_user_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_project_members_user_id ON public.project_members USING btree (user_id);


--
-- Name: idx_projects_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_projects_id ON public.projects USING btree (id);


--
-- Name: idx_projects_owner; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);


--
-- Name: idx_section_shares_user; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_section_shares_user ON public.section_shares USING btree (user_id);


--
-- Name: idx_subtasks_task_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_subtasks_task_id ON public.subtasks USING btree (task_id);


--
-- Name: idx_task_shares_user; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_task_shares_user ON public.task_shares USING btree (user_id);


--
-- Name: idx_task_view_groups_task_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_task_view_groups_task_id ON public.task_view_groups USING btree (task_id);


--
-- Name: idx_task_view_groups_view_group_id; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_task_view_groups_view_group_id ON public.task_view_groups USING btree (view_group_id);


--
-- Name: idx_todos_assignee; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_todos_assignee ON public.todos USING btree (assignee_id);


--
-- Name: idx_todos_position; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_todos_position ON public.todos USING btree (project_id, "position" DESC);


--
-- Name: idx_todos_section_position; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX idx_todos_section_position ON public.todos USING btree (section_id, "position" DESC);


--
-- Name: todos_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX todos_deleted_at_idx ON public.todos USING btree (deleted_at);


--
-- Name: todos_status_changed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--


CREATE INDEX todos_status_changed_at_idx ON public.todos USING btree (status_changed_at);


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: supabase_auth_admin
--


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: todos trg_apply_section_default_assignee; Type: TRIGGER; Schema: public; Owner: postgres
--


CREATE TRIGGER trg_apply_section_default_assignee BEFORE INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION public.apply_section_default_assignee();


--
-- Name: todos trg_restrict_assignee_change; Type: TRIGGER; Schema: public; Owner: postgres
--


CREATE TRIGGER trg_restrict_assignee_change BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.restrict_assignee_change();


--
-- Name: events events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: finance_transactions finance_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: goals goals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: project_invites project_invites_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_invites
    ADD CONSTRAINT project_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_invites project_invites_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_invites
    ADD CONSTRAINT project_invites_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_invites project_invites_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_invites
    ADD CONSTRAINT project_invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_sections project_sections_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_sections
    ADD CONSTRAINT project_sections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_tasks project_tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.project_tasks(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_tasks project_tasks_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.project_sections(id) ON DELETE SET NULL;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: section_shares section_shares_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.section_shares
    ADD CONSTRAINT section_shares_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE CASCADE;


--
-- Name: section_shares section_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.section_shares
    ADD CONSTRAINT section_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sections sections_default_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_default_assignee_id_fkey FOREIGN KEY (default_assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sections sections_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: sections sections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: subtasks subtasks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: task_review_notifications task_review_notifications_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_review_notifications
    ADD CONSTRAINT task_review_notifications_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: task_review_notifications task_review_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_review_notifications
    ADD CONSTRAINT task_review_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_shares task_shares_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_shares
    ADD CONSTRAINT task_shares_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: task_shares task_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_shares
    ADD CONSTRAINT task_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_view_groups task_view_groups_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_view_groups
    ADD CONSTRAINT task_view_groups_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: task_view_groups task_view_groups_view_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.task_view_groups
    ADD CONSTRAINT task_view_groups_view_group_id_fkey FOREIGN KEY (view_group_id) REFERENCES public.view_groups(id) ON DELETE CASCADE;


--
-- Name: todo_groups todo_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todo_groups
    ADD CONSTRAINT todo_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.view_groups(id) ON DELETE CASCADE;


--
-- Name: todo_groups todo_groups_todo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todo_groups
    ADD CONSTRAINT todo_groups_todo_id_fkey FOREIGN KEY (todo_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: todo_groups todo_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todo_groups
    ADD CONSTRAINT todo_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: todos todos_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: todos todos_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: todos todos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: todos todos_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE SET NULL;


--
-- Name: todos todos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: todos todos_view_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_view_group_id_fkey FOREIGN KEY (view_group_id) REFERENCES public.view_groups(id) ON DELETE SET NULL;


--
-- Name: view_groups view_groups_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.view_groups
    ADD CONSTRAINT view_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: view_groups view_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--


ALTER TABLE ONLY public.view_groups
    ADD CONSTRAINT view_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: project_invites Anyone can create invites; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Anyone can create invites" ON public.project_invites FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_invites.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: task_review_notifications Autenticados podem inserir notificações; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Autenticados podem inserir notificações" ON public.task_review_notifications FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: profiles Authenticated users can view all profiles; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: todo_groups Enable all access for users based on user_id; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Enable all access for users based on user_id" ON public.todo_groups USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: project_members Invited users can insert themselves; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Invited users can insert themselves" ON public.project_members FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.project_invites
  WHERE ((project_invites.project_id = project_members.project_id) AND (project_invites.invited_user_id = auth.uid()) AND (project_invites.status = ANY (ARRAY['pending'::text, 'accepted'::text])))))));


--
-- Name: project_invites Invited users can update their invites; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Invited users can update their invites" ON public.project_invites FOR UPDATE USING ((auth.uid() = invited_user_id));


--
-- Name: project_members Members visible to authenticated; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Members visible to authenticated" ON public.project_members FOR SELECT TO authenticated USING (true);


--
-- Name: project_members Project members can add members; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can add members" ON public.project_members FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))) OR public.is_project_member(project_id, auth.uid())));


--
-- Name: todos Project members can delete tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can delete tasks" ON public.todos FOR DELETE USING (((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND public.is_project_member(project_id, auth.uid()))));


--
-- Name: todos Project members can insert tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can insert tasks" ON public.todos FOR INSERT WITH CHECK (((auth.uid() = user_id) OR ((project_id IS NOT NULL) AND public.is_project_member(project_id, auth.uid())) OR ((section_id IS NOT NULL) AND public.is_section_shared(section_id, auth.uid()))));


--
-- Name: todos Project members can update tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can update tasks" ON public.todos FOR UPDATE USING (((auth.uid() = user_id) OR (assignee_id = auth.uid()) OR ((project_id IS NOT NULL) AND public.is_project_member(project_id, auth.uid())) OR ((section_id IS NOT NULL) AND public.is_section_shared(section_id, auth.uid())) OR public.is_task_shared(id, auth.uid())));


--
-- Name: sections Project members can view sections; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can view sections" ON public.sections FOR SELECT USING (public.has_section_access(id, auth.uid()));


--
-- Name: todos Project members can view tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project members can view tasks" ON public.todos FOR SELECT USING (((auth.uid() = user_id) OR (assignee_id = auth.uid()) OR ((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = todos.project_id) AND (projects.owner_id = auth.uid()))))) OR ((section_id IS NOT NULL) AND public.is_section_shared(section_id, auth.uid())) OR public.is_task_shared(id, auth.uid())));


--
-- Name: project_invites Project owners can delete invites; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project owners can delete invites" ON public.project_invites FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_invites.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_invites Project owners can view invites; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Project owners can view invites" ON public.project_invites FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_invites.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: section_shares Section owners manage section shares; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Section owners manage section shares" ON public.section_shares USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.sections s
  WHERE ((s.id = section_shares.section_id) AND ((s.user_id = auth.uid()) OR public.is_project_member(s.project_id, auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sections s
  WHERE ((s.id = section_shares.section_id) AND ((s.user_id = auth.uid()) OR public.is_project_member(s.project_id, auth.uid()))))));


--
-- Name: task_shares Task owners manage task shares; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Task owners manage task shares" ON public.task_shares USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.todos t
  WHERE ((t.id = task_shares.task_id) AND ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.todos t
  WHERE ((t.id = task_shares.task_id) AND ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid())))))));


--
-- Name: subtasks Users can delete subtasks of their tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete subtasks of their tasks" ON public.subtasks FOR DELETE USING ((task_id IN ( SELECT t.id
   FROM public.todos t
  WHERE ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid()))))));


--
-- Name: task_view_groups Users can delete task_view_groups for their view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete task_view_groups for their view_groups" ON public.task_view_groups FOR DELETE USING ((view_group_id IN ( SELECT view_groups.id
   FROM public.view_groups
  WHERE (view_groups.user_id = auth.uid()))));


--
-- Name: events Users can delete their own events; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own events" ON public.events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: goals Users can delete their own goals; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own goals" ON public.goals FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: projects Users can delete their own projects; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING ((auth.uid() = owner_id));


--
-- Name: sections Users can delete their own sections; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own sections" ON public.sections FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: finance_transactions Users can delete their own transactions; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own transactions" ON public.finance_transactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: view_groups Users can delete their own view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can delete their own view_groups" ON public.view_groups FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: subtasks Users can insert subtasks into their tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert subtasks into their tasks" ON public.subtasks FOR INSERT WITH CHECK ((task_id IN ( SELECT t.id
   FROM public.todos t
  WHERE ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid()))))));


--
-- Name: task_view_groups Users can insert task_view_groups for their view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert task_view_groups for their view_groups" ON public.task_view_groups FOR INSERT WITH CHECK ((view_group_id IN ( SELECT view_groups.id
   FROM public.view_groups
  WHERE (view_groups.user_id = auth.uid()))));


--
-- Name: events Users can insert their own events; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own events" ON public.events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: goals Users can insert their own goals; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own goals" ON public.goals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: projects Users can insert their own projects; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own projects" ON public.projects FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: sections Users can insert their own sections; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own sections" ON public.sections FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: finance_transactions Users can insert their own transactions; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own transactions" ON public.finance_transactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: view_groups Users can insert their own view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can insert their own view_groups" ON public.view_groups FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: subtasks Users can update subtasks of their tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update subtasks of their tasks" ON public.subtasks FOR UPDATE USING ((task_id IN ( SELECT t.id
   FROM public.todos t
  WHERE ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid()))))));


--
-- Name: events Users can update their own events; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own events" ON public.events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: goals Users can update their own goals; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own goals" ON public.goals FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: projects Users can update their own projects; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING ((auth.uid() = owner_id));


--
-- Name: projects Users can update their own projects or shared; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own projects or shared" ON public.projects FOR UPDATE USING ((auth.uid() = owner_id));


--
-- Name: sections Users can update their own sections; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own sections" ON public.sections FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: finance_transactions Users can update their own transactions; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own transactions" ON public.finance_transactions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: view_groups Users can update their own view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can update their own view_groups" ON public.view_groups FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: subtasks Users can view subtasks of their tasks; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view subtasks of their tasks" ON public.subtasks FOR SELECT USING ((task_id IN ( SELECT t.id
   FROM public.todos t
  WHERE ((t.user_id = auth.uid()) OR ((t.project_id IS NOT NULL) AND public.is_project_member(t.project_id, auth.uid()))))));


--
-- Name: task_view_groups Users can view task_view_groups for their view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view task_view_groups for their view_groups" ON public.task_view_groups FOR SELECT USING ((view_group_id IN ( SELECT view_groups.id
   FROM public.view_groups
  WHERE (view_groups.user_id = auth.uid()))));


--
-- Name: project_invites Users can view their invites; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their invites" ON public.project_invites FOR SELECT USING ((auth.uid() = invited_user_id));


--
-- Name: events Users can view their own events; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their own events" ON public.events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: goals Users can view their own goals; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their own goals" ON public.goals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: sections Users can view their own sections; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their own sections" ON public.sections FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: finance_transactions Users can view their own transactions; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their own transactions" ON public.finance_transactions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: view_groups Users can view their own view_groups; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Users can view their own view_groups" ON public.view_groups FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: task_review_notifications Usuário pode deletar próprias notificações; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Usuário pode deletar próprias notificações" ON public.task_review_notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: task_review_notifications Usuário vê próprias notificações; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "Usuário vê próprias notificações" ON public.task_review_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: project_members criar membro; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "criar membro" ON public.project_members FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: projects criar projeto; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "criar projeto" ON public.projects FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: project_tasks criar tarefa; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "criar tarefa" ON public.project_tasks FOR INSERT WITH CHECK ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: project_members deletar membro; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "deletar membro" ON public.project_members FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: projects deletar projeto; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "deletar projeto" ON public.projects FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: project_tasks deletar tarefa; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "deletar tarefa" ON public.project_tasks FOR DELETE USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: projects editar projeto; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "editar projeto" ON public.projects FOR UPDATE USING ((owner_id = auth.uid()));


--
-- Name: project_tasks editar tarefa; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "editar tarefa" ON public.project_tasks FOR UPDATE USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sections gerenciar secoes; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "gerenciar secoes" ON public.project_sections USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: goals; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members project_members_select_other_members; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY project_members_select_other_members ON public.project_members FOR SELECT USING (public.is_project_member(project_id, auth.uid()));


--
-- Name: project_members project_members_select_own; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY project_members_select_own ON public.project_members FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: project_members project_members_select_owner; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY project_members_select_owner ON public.project_members FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.project_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: project_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY projects_delete_owner ON public.projects FOR DELETE USING ((auth.uid() = owner_id));


--
-- Name: projects projects_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY projects_insert_owner ON public.projects FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: projects projects_select; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY projects_select ON public.projects FOR SELECT USING (((auth.uid() = owner_id) OR public.is_project_member(id, auth.uid())));


--
-- Name: projects projects_select_owner_or_member; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY projects_select_owner_or_member ON public.projects FOR SELECT USING (((auth.uid() = owner_id) OR public.has_project_access(id, auth.uid())));


--
-- Name: projects projects_update_owner; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY projects_update_owner ON public.projects FOR UPDATE USING ((auth.uid() = owner_id));


--
-- Name: section_shares; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.section_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

--
-- Name: sections sections_delete; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY sections_delete ON public.sections FOR DELETE USING (((auth.uid() = user_id) OR public.is_project_member(project_id, auth.uid())));


--
-- Name: sections sections_insert; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY sections_insert ON public.sections FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_project_member(project_id, auth.uid())));


--
-- Name: sections sections_select; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY sections_select ON public.sections FOR SELECT USING (((auth.uid() = user_id) OR public.is_project_member(project_id, auth.uid())));


--
-- Name: sections sections_update; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY sections_update ON public.sections FOR UPDATE USING (((auth.uid() = user_id) OR public.is_project_member(project_id, auth.uid())));


--
-- Name: subtasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

--
-- Name: task_review_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.task_review_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: task_shares; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.task_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: task_view_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.task_view_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: todo_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.todo_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: todos; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members ver membros; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "ver membros" ON public.project_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: projects ver projetos; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "ver projetos" ON public.projects FOR SELECT USING ((owner_id = auth.uid()));


--
-- Name: project_sections ver secoes; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "ver secoes" ON public.project_sections FOR SELECT USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: project_tasks ver tarefas; Type: POLICY; Schema: public; Owner: postgres
--


CREATE POLICY "ver tarefas" ON public.project_tasks FOR SELECT USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: view_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--


ALTER TABLE public.view_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime subtasks; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--


ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.subtasks;


--
-- Name: supabase_realtime task_review_notifications; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--


ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.task_review_notifications;


--
-- Name: supabase_realtime todos; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--


ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.todos;


--
-- Name: supabase_realtime view_groups; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--


ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.view_groups;


--
-- Name: FUNCTION add_todo_to_group(p_todo_id bigint, p_group_id bigint); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.add_todo_to_group(p_todo_id bigint, p_group_id bigint) TO anon;
GRANT ALL ON FUNCTION public.add_todo_to_group(p_todo_id bigint, p_group_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.add_todo_to_group(p_todo_id bigint, p_group_id bigint) TO service_role;


--
-- Name: FUNCTION apply_section_default_assignee(); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.apply_section_default_assignee() TO anon;
GRANT ALL ON FUNCTION public.apply_section_default_assignee() TO authenticated;
GRANT ALL ON FUNCTION public.apply_section_default_assignee() TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: FUNCTION get_user_projects(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.get_user_projects(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_projects(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_projects(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_project_access(p_project_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.has_project_access(p_project_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_project_access(p_project_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_project_access(p_project_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION has_section_access(p_section_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.has_section_access(p_section_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_section_access(p_section_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_section_access(p_section_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_project_member(p_project_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.is_project_member(p_project_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_project_member(p_project_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_project_member(p_project_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_section_shared(p_section_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.is_section_shared(p_section_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_section_shared(p_section_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_section_shared(p_section_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_shared(p_task_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.is_task_shared(p_task_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_shared(p_task_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_shared(p_task_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION restrict_assignee_change(); Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON FUNCTION public.restrict_assignee_change() TO anon;
GRANT ALL ON FUNCTION public.restrict_assignee_change() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_assignee_change() TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: SEQUENCE events_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.events_id_seq TO service_role;


--
-- Name: TABLE finance_transactions; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.finance_transactions TO anon;
GRANT ALL ON TABLE public.finance_transactions TO authenticated;
GRANT ALL ON TABLE public.finance_transactions TO service_role;


--
-- Name: SEQUENCE finance_transactions_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.finance_transactions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.finance_transactions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.finance_transactions_id_seq TO service_role;


--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.goals TO anon;
GRANT ALL ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;


--
-- Name: SEQUENCE goals_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.goals_id_seq TO anon;
GRANT ALL ON SEQUENCE public.goals_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.goals_id_seq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE project_invites; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.project_invites TO anon;
GRANT ALL ON TABLE public.project_invites TO authenticated;
GRANT ALL ON TABLE public.project_invites TO service_role;


--
-- Name: SEQUENCE project_invites_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.project_invites_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_invites_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_invites_id_seq TO service_role;


--
-- Name: TABLE project_members; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.project_members TO anon;
GRANT ALL ON TABLE public.project_members TO authenticated;
GRANT ALL ON TABLE public.project_members TO service_role;


--
-- Name: SEQUENCE project_members_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.project_members_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_members_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_members_id_seq TO service_role;


--
-- Name: TABLE project_sections; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.project_sections TO anon;
GRANT ALL ON TABLE public.project_sections TO authenticated;
GRANT ALL ON TABLE public.project_sections TO service_role;


--
-- Name: SEQUENCE project_sections_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.project_sections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_sections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_sections_id_seq TO service_role;


--
-- Name: TABLE project_tasks; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.project_tasks TO anon;
GRANT ALL ON TABLE public.project_tasks TO authenticated;
GRANT ALL ON TABLE public.project_tasks TO service_role;


--
-- Name: SEQUENCE project_tasks_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.project_tasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_tasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_tasks_id_seq TO service_role;


--
-- Name: SEQUENCE projects_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.projects_id_seq TO anon;
GRANT ALL ON SEQUENCE public.projects_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.projects_id_seq TO service_role;


--
-- Name: TABLE section_shares; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.section_shares TO anon;
GRANT ALL ON TABLE public.section_shares TO authenticated;
GRANT ALL ON TABLE public.section_shares TO service_role;


--
-- Name: SEQUENCE section_shares_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.section_shares_id_seq TO anon;
GRANT ALL ON SEQUENCE public.section_shares_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.section_shares_id_seq TO service_role;


--
-- Name: TABLE sections; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.sections TO anon;
GRANT ALL ON TABLE public.sections TO authenticated;
GRANT ALL ON TABLE public.sections TO service_role;


--
-- Name: SEQUENCE sections_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.sections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sections_id_seq TO service_role;


--
-- Name: TABLE subtasks; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.subtasks TO anon;
GRANT ALL ON TABLE public.subtasks TO authenticated;
GRANT ALL ON TABLE public.subtasks TO service_role;


--
-- Name: SEQUENCE subtasks_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.subtasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subtasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subtasks_id_seq TO service_role;


--
-- Name: TABLE task_review_notifications; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.task_review_notifications TO anon;
GRANT ALL ON TABLE public.task_review_notifications TO authenticated;
GRANT ALL ON TABLE public.task_review_notifications TO service_role;


--
-- Name: SEQUENCE task_review_notifications_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.task_review_notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.task_review_notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.task_review_notifications_id_seq TO service_role;


--
-- Name: TABLE task_shares; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.task_shares TO anon;
GRANT ALL ON TABLE public.task_shares TO authenticated;
GRANT ALL ON TABLE public.task_shares TO service_role;


--
-- Name: SEQUENCE task_shares_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.task_shares_id_seq TO anon;
GRANT ALL ON SEQUENCE public.task_shares_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.task_shares_id_seq TO service_role;


--
-- Name: TABLE task_view_groups; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.task_view_groups TO anon;
GRANT ALL ON TABLE public.task_view_groups TO authenticated;
GRANT ALL ON TABLE public.task_view_groups TO service_role;


--
-- Name: SEQUENCE task_view_groups_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.task_view_groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.task_view_groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.task_view_groups_id_seq TO service_role;


--
-- Name: TABLE todo_groups; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.todo_groups TO anon;
GRANT ALL ON TABLE public.todo_groups TO authenticated;
GRANT ALL ON TABLE public.todo_groups TO service_role;


--
-- Name: SEQUENCE todo_groups_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.todo_groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.todo_groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.todo_groups_id_seq TO service_role;


--
-- Name: TABLE todos; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.todos TO anon;
GRANT ALL ON TABLE public.todos TO authenticated;
GRANT ALL ON TABLE public.todos TO service_role;


--
-- Name: SEQUENCE todos_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.todos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.todos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.todos_id_seq TO service_role;


--
-- Name: TABLE view_groups; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON TABLE public.view_groups TO anon;
GRANT ALL ON TABLE public.view_groups TO authenticated;
GRANT ALL ON TABLE public.view_groups TO service_role;


--
-- Name: SEQUENCE view_groups_id_seq; Type: ACL; Schema: public; Owner: postgres
--


GRANT ALL ON SEQUENCE public.view_groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.view_groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.view_groups_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--


ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- NOTE: the equivalent "FOR ROLE supabase_admin" block was intentionally
-- removed here - the SQL Editor runs as "postgres", which lacks permission
-- to alter default privileges on behalf of supabase_admin (42501 error).
-- A fresh Supabase project already ships supabase_admin's own defaults.

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--


ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- NOTE: "FOR ROLE supabase_admin" block removed (see note above).

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--


ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- NOTE: "FOR ROLE supabase_admin" block removed (see note above).


