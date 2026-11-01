-- Dieville Watches: limpeza e Kingdom (01/11/2026). PENDENTE: rode no SQL Editor do Supabase.
-- 1) Remove "Enen no Shouboutai" sem vínculo quando a mesma conta já tem "Fire Force" (TMDB 88046).
delete from public.titles t
where t.titulo ilike 'Enen no Shouboutai%' and t.tmdb_id is null
  and exists (select 1 from public.titles f where f.user_id = t.user_id and f.tmdb_id = 88046 and f.tmdb_media = 'tv');

-- 2) Kingdom é a série coreana da Netflix (TMDB 70593, 2019).
update public.titles t set tmdb_id = 70593, tmdb_media = 'tv', ano = coalesce(t.ano, 2019)
where lower(t.titulo) = 'kingdom' and t.tmdb_id is null
  and not exists (select 1 from public.titles x where x.user_id = t.user_id and x.tmdb_id = 70593 and x.tmdb_media = 'tv');
