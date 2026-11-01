/* Dieville Watches: medição do teste com o Clarity (01/11/2026)
   Eventos e tags SEM texto de pessoas, sem nome e sem e-mail. Só enviam depois do "Aceitar" (privacidade-teste.js).
   medir(nome) é seguro de chamar de qualquer lugar: sem Clarity ou sem aceite, não faz nada. */
const medirAtivo = ()=> !!(CLARITY_ID && clarityCarregado && privLer() === "sim" && typeof window.clarity === "function");
function medir(nome){ try{ if(medirAtivo()) window.clarity("event", nome); }catch(e){} }
function medirTag(k, v){ try{ if(medirAtivo()) window.clarity("set", k, String(v)); }catch(e){} }
const faixa = n => n === 0 ? "0" : n < 10 ? "1 a 9" : n < 30 ? "10 a 29" : "30 ou mais";

async function medirIniciar(){
  if(!medirAtivo()) return;
  const build = (document.querySelector('script[src*="privacidade-teste.js"]')?.src.match(/v=([0-9a-z]+)/) || [])[1] || "?";
  medirTag("build", build);
  medirTag("papel", profile?.papel === "dono" ? "dono" : "membro");
  medirTag("aparelho", matchMedia("(max-width:640px)").matches ? "celular" : "computador");
  medirTag("faixa_titulos", faixa(shows.length));
  medirTag("faixa_amigos", faixa((typeof amigos !== "undefined" ? amigos : []).filter(a=> a.status === "aceita").length));
  // código anônimo (derivado do usuário, sem nome nem e-mail) para juntar as visitas da mesma pessoa
  try{
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dw|" + currentUser.id));
    const cod = [...new Uint8Array(bytes)].slice(0, 5).map(b=> b.toString(16).padStart(2, "0")).join("");
    window.clarity("identify", cod);
  }catch(e){}
}
// roda quando o Clarity é carregado (aceite) ou na abertura do app com aceite já salvo
const _carregarClarityM = carregarClarity;
carregarClarity = function(){ _carregarClarityM(); setTimeout(medirIniciar, 400); };
const _escolherPrivM = escolherPriv;

/* ---------- cliques (delegados, sem ler texto de ninguém) ---------- */
document.addEventListener('click', e=>{
  if(!medirAtivo()) return;
  const q = s=> e.target.closest(s);
  if(q('.stat[data-quick]')) medir("numero_topo_tocado");
  else if(q('#chipsStatus [data-tipo]')) medir("chip_tipo_tocado");
  else if(q('#btnFiltros, #btnFiltros2')) medir("mais_filtros_aberto");
  else if(q('#btnNovToggle')) medir("letreiro_aberto");
  else if(q('[data-st]')) medir("status_alterado");
  else if(q('#fxMaisEp')) medir("episodio_mais1");
  else if(q('[data-cm-retry], [data-rep-retry]')) medir("tentar_de_novo");
  else if(q('[data-cm-vincular]')) medir("vincular_aberto");
}, true);

/* ---------- funções do app ---------- */
const _abrirFichaM = abrirFicha;
abrirFicha = function(...a){ medir("ficha_aberta"); return _abrirFichaM.apply(this, a); };
const _setTabM = setTab;
setTab = function(t, ...r){ if(t === "novidades") medir("novidades_aberta"); return _setTabM.call(this, t, ...r); };
const _abrirFeedbackM = abrirFeedback;
abrirFeedback = function(...a){ medir("feedback_aberto"); return _abrirFeedbackM.apply(this, a); };
const _showToastM = showToast;
showToast = function(msg, ...r){
  if(typeof msg === "string"){ if(msg === "Adicionado") medir("titulo_adicionado"); else if(/^(Não consegui|Erro)/.test(msg)) medir("erro_exibido"); }
  return _showToastM.call(this, msg, ...r);
};
// busca: conta que buscou, nunca o que foi digitado
let _tBusca;
document.getElementById('search')?.addEventListener('input', ()=>{ clearTimeout(_tBusca); _tBusca = setTimeout(()=>{ if(document.getElementById('search').value.trim()) medir("busca_feita"); }, 1200); });
