/* Dieville Watches: configuração e conexão com o Supabase */
/* =====================================================================
   CONFIGURAÇÃO: cole aqui os dois valores do seu projeto Supabase
   (painel do Supabase > Project Settings > API Keys / Data API)
   ===================================================================== */
const SUPABASE_URL = "https://yvtizwgkowjimlefvojn.supabase.co";
const SUPABASE_KEY = "sb_publishable_g3uICxIyNlXrUH__YcDgSg_bbpJOG4h";
/* Opcional: chave da API do TMDB, para buscar capas automaticamente.
   Crie de graça em themoviedb.org > Configurações > API e cole a "Chave da API". */
const TMDB_KEY = "d8faaf5641c6ef33c360bbe19549e7c1";
/* Opcional: chave da OMDb, para trazer a nota do IMDB. Grátis em omdbapi.com/apikey.aspx */
const OMDB_KEY = "b8d8d59f";
/* ===================================================================== */

const CONFIGURADO = !SUPABASE_URL.startsWith("COLE_AQUI") && !SUPABASE_KEY.startsWith("COLE_AQUI");
const sb = CONFIGURADO ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
// A página pública sempre lê como visitante, para uma sessão vencida no navegador não bloquear a leitura.
const sbPublico = CONFIGURADO ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:'dw-publico' } }) : null;
let currentUser = null;

