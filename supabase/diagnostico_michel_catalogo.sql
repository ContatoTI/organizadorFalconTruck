-- DIAGNÓSTICO (só leitura, não altera nada).
-- Simula o Michel logado e conta quantas tarefas do CATALOGO (projeto 110) ele enxerga.
-- Tudo num bloco só. O resultado aparece como "ERROR: RESULTADO ..." de propósito:
-- isso desfaz qualquer efeito e mostra os números na tela. Me mande essa linha.

do $$
declare
  v_email   text := 'michel.coutinho@falcontruck.com.br';
  v_uid     uuid;
  v_projeto text;
  v_membro  boolean;
  v_total   int;
  v_ve      int;
begin
  select name into v_projeto from public.projects where id = 110;
  if v_projeto is null then
    raise exception 'Projeto 110 não existe.';
  end if;

  select id into v_uid from auth.users where lower(trim(email)) = v_email;
  if v_uid is null then
    select id into v_uid from public.profiles where lower(trim(email)) = v_email;
  end if;
  if v_uid is null then
    raise exception 'Michel (%) não existe em auth.users nem em profiles.', v_email;
  end if;

  select exists (select 1 from public.project_members where project_id = 110 and user_id = v_uid) into v_membro;
  select count(*) into v_total from public.todos where project_id = 110 and deleted_at is null;

  -- A partir daqui, o banco age como se fosse o Michel.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_ve from public.todos where project_id = 110 and deleted_at is null;

  raise exception 'RESULTADO (não é erro) -> projeto=% | michel_id=% | michel_e_membro=% | total_tarefas=% | michel_consegue_ver=%',
    v_projeto, v_uid, v_membro, v_total, v_ve;
end $$;
