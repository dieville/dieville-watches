-- Dieville Watches: liberar na hora (07/11/2026).
-- Link de grupo com interruptor: ligado, quem entra pelo link já fica aprovado e vira amigo do dono.
-- Desligado (padrão), continua como em 01/11: todo mundo vira pedido e espera a aprovação.
-- Regras do modo ligado: limite de pessoas obrigatório (1 a 100) e validade de no máximo 30 dias.

alter table public.invites add column if not exists liberar_na_hora boolean not null default false;

-- Criação: só o dono cria grupo; no modo "liberar na hora" o limite é obrigatório e a validade tem teto de 30 dias.
create or replace function public.invites_grupo_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.grupo then new.liberar_na_hora := false; end if;
  if new.grupo then
    if not public.is_owner() then raise exception 'só o dono cria convite de grupo'; end if;
    new.expira_em := least(coalesce(new.expira_em, now() + interval '30 days'), now() + interval '90 days');
    if new.limite is not null and new.limite < 1 then new.limite := null; end if;
    if new.liberar_na_hora then
      if new.limite is null then raise exception 'liberar na hora exige um limite de pessoas'; end if;
      new.limite := least(new.limite, 100);
      new.expira_em := least(new.expira_em, now() + interval '30 days');
    end if;
  end if;
  return new;
end $$;

-- Alteração: quem não é dono não muda "grupo" nem "liberar_na_hora" (membro só cancela os próprios convites).
create or replace function public.invites_update_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    new.grupo := old.grupo;
    new.liberar_na_hora := old.liberar_na_hora;
  end if;
  return new;
end $$;
drop trigger if exists invites_update_guard on public.invites;
create trigger invites_update_guard before update on public.invites
  for each row execute function public.invites_update_guard();

-- Visitante: informa se o link libera na hora (só para ajustar o texto da tela).
create or replace function public.check_invite(p_codigo text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('nome', i.nome,
    'valido', (not i.cancelado and i.expira_em > now() and
               case when i.grupo then (i.limite is null or i.usos < i.limite) else i.usado_por is null end),
    'usado', (not i.grupo and i.usado_por is not null),
    'grupo', i.grupo,
    'liberar', (i.grupo and i.liberar_na_hora))
  from invites i where i.codigo = upper(p_codigo);
$$;

create or replace function public.accept_invite(p_codigo text) returns json
language plpgsql security definer set search_path = public as $$
declare i invites; p profiles; n int := 0; do_dono boolean;
begin
  select * into p from profiles where id = auth.uid();
  if not found then return json_build_object('ok', false, 'erro', 'sem_perfil'); end if;
  if p.status = 'aprovado' then return json_build_object('ok', true, 'ja_aprovado', true); end if;
  if p.status = 'bloqueado' then return json_build_object('ok', false, 'erro', 'bloqueado'); end if;
  select * into i from invites where codigo = upper(p_codigo) for update;
  if not found or i.cancelado or i.expira_em <= now() or (not i.grupo and i.usado_por is not null) then
    return json_build_object('ok', false, 'erro', 'convite_invalido');
  end if;
  if i.grupo then
    -- grupo: conta o pedido uma vez por pessoa
    if p.convite_id is distinct from i.id then
      if i.limite is not null and i.usos >= i.limite then
        return json_build_object('ok', false, 'erro', 'convite_invalido');
      end if;
      update invites set usos = usos + 1 where id = i.id;
    end if;
    -- liberar na hora: só vale se o link foi feito pelo dono
    select exists(select 1 from profiles where id = i.criado_por and papel = 'dono') into do_dono;
    if i.liberar_na_hora and do_dono then
      update profiles set status = 'aprovado', aprovado_em = now(), convidado_por = i.criado_por, convite_id = i.id,
                          origem_lista = i.lista_id, origem_por = i.criado_por, ignorado = false
      where id = auth.uid();
      if i.lista_id is not null then n := _importar_lista(auth.uid(), i.lista_id); end if;
      perform _amizade_aceita(i.criado_por, auth.uid());
      return json_build_object('ok', true, 'importados', n, 'grupo', true);
    end if;
    -- sem liberar na hora: vira pedido
    update profiles set convidado_por = i.criado_por, convite_id = i.id, origem_lista = i.lista_id, origem_por = i.criado_por,
                        pedido_em = case when p.convite_id is not distinct from i.id then coalesce(p.pedido_em, now()) else now() end,
                        ignorado = false
    where id = auth.uid();
    return json_build_object('ok', true, 'pendente', true, 'grupo', true);
  end if;
  update invites set usado_por = auth.uid(), usado_em = now() where id = i.id;
  select exists(select 1 from profiles where id = i.criado_por and papel = 'dono') into do_dono;
  if do_dono then
    update profiles set status = 'aprovado', aprovado_em = now(), convidado_por = i.criado_por, convite_id = i.id,
                        origem_lista = i.lista_id, ignorado = false, nome = case when coalesce(nome,'') = '' then i.nome else nome end
    where id = auth.uid();
    if i.lista_id is not null then n := _importar_lista(auth.uid(), i.lista_id); end if;
    perform _amizade_aceita(i.criado_por, auth.uid());
    return json_build_object('ok', true, 'importados', n);
  end if;
  update profiles set convidado_por = i.criado_por, convite_id = i.id, origem_lista = i.lista_id, origem_por = i.criado_por,
                      pedido_em = now(), ignorado = false, nome = case when coalesce(nome,'') = '' then i.nome else nome end
  where id = auth.uid();
  return json_build_object('ok', true, 'pendente', true);
end $$;
