/* Dieville Watches: onda 2 da análise heurística (energia em primeiro lugar, filtros em folha,
   continue de onde parou, primeiro acesso, listas com Compartilhar, lista pública mais limpa, revisão de carga) */

const lerLS2 = (k, def)=>{ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } };
const gravarLS2 = (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
const hoje2 = ()=> new Date().toISOString().slice(0,10);
const MIN_TITULOS = 5;
const ENERGIA_TXT = { baixa:"leves", media:"leves e médios", alta:"de todos os tipos, os que pedem foco primeiro" };

/* ---------- energia ---------- */
function setEnergia(v, lembrar = true){
  filters.carga = v;
  document.querySelectorAll('#energiaBox [data-e]').forEach(b=>{ const on = b.dataset.e === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  if(lembrar) gravarLS2('dw-energia', { dia: hoje2(), v });
  render();
}
document.querySelectorAll('#energiaBox [data-e]').forEach(b=> b.onclick = ()=> setEnergia(filters.carga === b.dataset.e ? "all" : b.dataset.e));
document.getElementById('energiaHint').addEventListener('click', e=>{ if(e.target.closest('[data-ver-todos]')) setEnergia("all"); });
// a escolha vale pelo dia
(function(){ const e = lerLS2('dw-energia', null); if(e && e.dia === hoje2() && e.v && e.v !== "all") filters.carga = e.v; })();
// "Limpar filtros" e outros resets também zeram a energia; mantém os botões em sincronia
const _resetFiltersOrig = resetFilters;
resetFilters = function(){ _resetFiltersOrig(); gravarLS2('dw-energia', { dia: hoje2(), v:"all" }); document.querySelectorAll('#energiaBox [data-e]').forEach(b=>{ b.classList.remove('on'); b.setAttribute('aria-checked', false); }); };

/* ---------- filtros em folha (celular) ---------- */
const sheetBg = document.getElementById('sheetBg');
function abrirFiltros(abrir){
  document.body.classList.toggle('filtros-open', abrir);
  document.getElementById('btnFiltros').setAttribute('aria-expanded', abrir);
  if(abrir) setTimeout(()=> document.querySelector('.filter-box .sheet-head button')?.focus(), 50);
  else document.getElementById('btnFiltros').focus();
}
document.getElementById('btnFiltros').onclick = ()=> abrirFiltros(true);
document.getElementById('btnFiltros2').onclick = ()=> abrirFiltros(true);
sheetBg.onclick = ()=> abrirFiltros(false);
document.getElementById('btnSheetVer').onclick = ()=> abrirFiltros(false);
document.getElementById('btnSheetLimpar').onclick = ()=>{ const c = filters.carga; resetFilters(); filters.carga = c; setEnergia(c); };
document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && document.body.classList.contains('filtros-open')) abrirFiltros(false); });
function nFiltros(){ return ["genero","onde"].filter(k=> filters[k] !== "all").length + (["Aguardando Nova Temporada","Concluída","Abandonei"].includes(filters.status) ? 1 : 0); }

/* ---------- continue de onde parou ---------- */
function renderContinuar(){
  const box = document.getElementById('continuar');
  const outros = filters.status !== "all" || filters.tipo !== "all" || filters.genero !== "all" || filters.onde !== "all" || filters.search || viewingListId;
  let itens = shows.filter(s=> s.status === "Assistindo");
  if(filters.carga === "baixa") itens = itens.filter(s=> cargaKey(s.carga) === "baixa");
  if(filters.carga === "media") itens = itens.filter(s=> ["baixa","media"].includes(cargaKey(s.carga)));
  if(outros || !itens.length || shows.length < MIN_TITULOS){ box.style.display = "none"; return; }
  itens.sort((a, b)=> (b.episodio ? 1 : 0) - (a.episodio ? 1 : 0) || (b.nota || 0) - (a.nota || 0));
  box.style.display = "";
  box.innerHTML = `<div class="ct-h" id="contTit">Continue de onde parou <span>${itens.length}</span></div>
    <div class="ct-row">${itens.slice(0, 12).map(s=> `<div class="ct" data-ct="${s.id}" tabindex="0" role="button" aria-label="${esc(s.titulo)}: ver ficha">
      <div class="ct-po" style="${s.imagem ? `background-image:url('${esc(s.imagem)}')` : `background:${posterGradient(s.titulo)}`}"></div>
      <div class="ct-t"><b>${esc(s.titulo)}</b><small>${cargaEmoji(s.carga)}</small>
        ${s.tipo === "Filme" ? "" : s.episodio ? `<div class="ct-acts"><span class="ct-prog">▶ T${s.temporada || 1} · E${s.episodio}</span><button type="button" class="rxn" data-ct-mais="${s.id}" aria-label="Mais um episódio de ${esc(s.titulo)}">+1 ep</button></div>`
          : `<div class="ct-acts"><button type="button" class="rxn" data-ct-onde="${s.id}">Onde você parou?</button></div>`}</div></div>`).join("")}</div>`;
}
document.getElementById('continuar').addEventListener('click', async e=>{
  const mais = e.target.closest('[data-ct-mais]');
  if(mais){
    const s = shows.find(x=> x.id === mais.dataset.ctMais); if(!s) return;
    const antes = { episodio: s.episodio ?? null, temporada: s.temporada ?? null };
    mais.disabled = true;
    const novo = await salvarCampos(s.id, { episodio: (s.episodio || 0) + 1, temporada: s.temporada || 1 });
    if(novo) showToast(`${novo.titulo}: T${novo.temporada} · E${novo.episodio}`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{ if(await salvarCampos(s.id, antes)) showToast("Episódio desfeito"); } });
    return;
  }
  const onde = e.target.closest('[data-ct-onde]');
  if(onde){ const s = shows.find(x=> x.id === onde.dataset.ctOnde); if(s) perguntarOndeParou(s); return; }
  const c = e.target.closest('[data-ct]');
  if(c){ const s = shows.find(x=> x.id === c.dataset.ct); if(s) abrirFicha(s, c); }
});
document.getElementById('continuar').addEventListener('keydown', e=>{ if((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ct]')){ e.preventDefault(); e.target.click(); } });
function perguntarOndeParou(s){
  abrirDialogo({
    titulo: `Onde você parou em ${s.titulo}?`,
    corpo: `<div style="display:flex;gap:10px"><label style="flex:1"><span class="lab">Temporada</span><input type="number" min="1" id="opT" value="${s.temporada || 1}" inputmode="numeric"></label>
      <label style="flex:1"><span class="lab">Episódio</span><input type="number" min="0" id="opE" value="${s.episodio || ""}" inputmode="numeric" placeholder="Ex.: 3"></label></div>`,
    botoes: [{ texto:"Agora não" }, { texto:"Salvar", classe:"btn-primary", acao: async ()=>{
      const t = Number(document.getElementById('opT').value) || 1, ep = Number(document.getElementById('opE').value) || null;
      const novo = await salvarCampos(s.id, { temporada: t, episodio: ep });
      if(!novo) return false;
      showToast(`Anotado: T${t}${ep ? ` · E${ep}` : ""}`);
    } }],
    foco: "#opE"
  });
}
// ao mudar para Assistindo pela ficha, pergunta o episódio (pode pular)
const _salvarCamposOrig = salvarCampos;
salvarCampos = async function(id, campos){
  const antes = shows.find(x=> x.id === id);
  const novo = await _salvarCamposOrig(id, campos);
  if(novo && campos.status === "Assistindo" && antes?.status !== "Assistindo" && novo.tipo !== "Filme" && !novo.episodio && !("episodio" in campos)){
    setTimeout(()=> perguntarOndeParou(novo), 350);
  }
  return novo;
};

/* ---------- primeiro acesso e catálogo com poucos títulos ---------- */
async function montarPrimeiroAcesso(){
  const box = document.getElementById('firstRunState');
  if(box.dataset.membro === "1") return;
  box.dataset.membro = "1";
  const nome = (profile?.nome || currentUser?.email || "").split(/[ @]/)[0];
  let lista = null;
  try{ const { data } = await sbPublico.from('lists').select('id,nome,show_ids,user_id').eq('publica', true).neq('user_id', currentUser.id).order('created_at', { ascending:false }).limit(1); lista = (data || [])[0]; }catch(e){}
  const amigosTxt = (typeof novFeed !== "undefined" && novFeed.length) ? novFeed.slice(0, 2).map(a=> `${esc((a.nome || "").split(" ")[0])} ${a.tipo === "concluiu" ? "terminou" : "está vendo"} ${esc(a.titulo)}`).join(", ") : "Veja o que eles estão assistindo e guarde com um toque";
  box.innerHTML = `<div class="fr-oi">Oi${nome ? `, ${esc(nome)}` : ""} 👋</div>
    <p class="fr-p">Aqui você guarda o que quer ver e escolhe pela sua energia do dia: leve quando está cansado, denso quando está com foco.</p>
    <div class="fr-tit">Comece por aqui</div>
    <button type="button" class="fr-path" data-fr="buscar"><span class="e">🔍</span><span><b>Buscar um título</b><small>Digite o nome; capa, resumo e onde assistir vêm sozinhos</small></span></button>
    <button type="button" class="fr-path" data-fr="amigos"><span class="e">👥</span><span><b>Pegar dos seus amigos</b><small>${amigosTxt}</small></span></button>
    ${lista ? `<a class="fr-path" href="${location.pathname}?lista=${lista.id}"><span class="e">📋</span><span><b>Explorar uma lista</b><small>"${esc(lista.nome)}" · ${plural((lista.show_ids || []).length, "título", "títulos")}</small></span></a>` : ""}
    <div class="fr-nota">Os filtros e a pergunta da energia aparecem quando você tiver ${MIN_TITULOS} títulos. <b>0 de ${MIN_TITULOS}</b></div>
    <div id="firstRunFb" style="margin-top:18px"><span>Primeira impressão do app? </span><button class="linkbtn" id="btnFirstFb">Conte para o Dieville</button></div>`;
  document.getElementById('btnFirstFb').onclick = ()=> abrirFeedback({ tipo:"outro" });
  box.onclick = e=>{
    const b = e.target.closest('[data-fr]'); if(!b) return;
    if(b.dataset.fr === "buscar") document.getElementById('btnAdd').click();
    if(b.dataset.fr === "amigos") setTab('amigos');
  };
}

/* ---------- a cada render do catálogo ---------- */
function aoRenderCatalogo(list){
  const dono = profile?.papel === "dono" || !perfisAtivos;
  const poucos = shows.length < MIN_TITULOS;
  document.body.classList.toggle('poucos-titulos', poucos);
  document.body.classList.toggle('sem-titulos', !shows.length);
  const nota = document.getElementById('poucosNota');
  nota.style.display = poucos && shows.length > 0 ? "" : "none";
  if(poucos && shows.length) nota.innerHTML = `Os filtros e a pergunta da energia aparecem quando você tiver ${MIN_TITULOS} títulos. <b>${shows.length} de ${MIN_TITULOS}</b>`;
  if(!shows.length && !dono) montarPrimeiroAcesso();
  const hint = document.getElementById('energiaHint');
  hint.innerHTML = filters.carga === "all" ? "Escolha uma opção e o catálogo mostra o que combina com hoje."
    : `Mostrando ${plural(list.length, "título", "títulos")} ${ENERGIA_TXT[filters.carga]}. <button type="button" class="linkbtn" data-ver-todos>Ver todos</button>`;
  document.querySelectorAll('#energiaBox [data-e]').forEach(b=>{ const on = b.dataset.e === filters.carga; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const n = nFiltros();
  document.getElementById('filtrosN').textContent = n ? ` · ${n}` : "";
  document.querySelectorAll('.filtrosN2').forEach(x=> x.textContent = n ? ` · ${n}` : "");
  document.getElementById('btnSheetVer').textContent = `Ver ${plural(list.length, "título", "títulos")}`;
  renderContinuar();
}

/* ---------- listas: compartilhar e menu ---------- */
function abrirCompartilharLista(list){
  abrirDialogo({
    titulo: `Compartilhar "${list.nome}"`,
    classe: "compartilhar",
    corpo: `${list.publica ? "" : `<p class="muted" style="margin:0 0 10px">Ao mandar o link, a lista fica pública. Imagem e texto não mudam nada.</p>`}
      <div class="share-ops"><button type="button" data-sh="share"><i>🔗</i>Link</button><button type="button" data-sh="image"><i>🖼️</i>Imagem</button><button type="button" data-sh="copy"><i>📝</i>Texto</button></div>`,
    botoes: [{ texto:"Fechar" }],
    aoAbrir: corpo=> corpo.querySelectorAll('[data-sh]').forEach(b=> b.onclick = async ()=>{ fecharDialogo(); await acaoLista(b.dataset.sh, list.id); })
  });
}
function abrirMenuLista(list, btn){
  document.querySelector('.lc-menu')?.remove();
  const m = document.createElement('div');
  m.className = "lc-menu umenu"; m.setAttribute('role', 'menu');
  m.innerHTML = `<button role="menuitem" data-m="edit">✏️ Editar títulos</button>${list.publica ? `<button role="menuitem" data-m="unshare">🔒 Tornar privada</button>` : ""}<button role="menuitem" class="danger" data-m="delete">🗑️ Excluir lista</button>`;
  btn.closest('.lcard').appendChild(m);
  m.querySelector('button').focus();
  m.onclick = async e=>{ const b = e.target.closest('[data-m]'); if(!b) return; m.remove(); await acaoLista(b.dataset.m, list.id); };
  setTimeout(()=> document.addEventListener('click', function fechar(ev){ if(!m.contains(ev.target)){ m.remove(); document.removeEventListener('click', fechar); } }), 0);
  m.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ m.remove(); btn.focus(); } });
}

/* ---------- lista compartilhada para quem não tem conta ---------- */
const _aoRenderListaOnda2 = aoRenderListaPublica;
aoRenderListaPublica = async function(l, itens){
  const visitante = !currentUser && !P_CONVITE;
  document.body.classList.toggle('visitante', visitante);
  const r = await _aoRenderListaOnda2(l, itens);
  if(visitante && !document.getElementById('pubSticky')){
    const s = document.createElement('div');
    s.id = "pubSticky"; s.className = "pub-sticky";
    s.innerHTML = `<span>Quer guardar estas indicações?</span><button type="button" class="btn btn-primary" data-google>Entrar ou pedir acesso</button>`;
    document.body.appendChild(s);
  }
  return r;
};

/* ---------- revisar quanto cada título pede ---------- */
const CARGA_V = { baixa:"Baixa (Fácil digestão)", media:"Média (Atenção moderada)", alta:"Alta (Foco total)" };
const minutosDe = s=> Number(((s.duracao || "").match(/(\d+)\s*min/) || [])[1]) || null;
const temporadasNum = s=> Number(((s.duracao || "").match(/(\d+)\s+temporadas?/) || [])[1]) || null;
document.getElementById('btnRevisarCarga').onclick = ()=>{
  acctMenu.classList.remove('open');
  const difs = shows.map(s=> ({ s, sug: cargaKey(sugerir(s.genero, s.tipo || "Série", minutosDe(s), temporadasNum(s), s.id).carga) }))
    .filter(x=> x.sug && cargaKey(x.s.carga) && x.sug !== cargaKey(x.s.carga)).slice(0, 40);
  if(!difs.length){ showToast("Tudo certo: a carga dos seus títulos bate com a sugestão"); return; }
  abrirDialogo({
    titulo: "Quanto cada título pede?",
    corpo: `<p class="muted" style="margin:0 0 12px">Estes ${plural(difs.length, "título parece", "títulos parecem")} diferentes do que está marcado. Toque para trocar; o que você não mexer continua igual.</p>
      <div class="rv-list">${difs.map(({ s, sug })=> `<div class="rv" data-rv="${s.id}"><b>${esc(s.titulo)}</b><small>${esc(s.duracao || s.tipo || "")}</small>
        <div class="rv-ops">${["baixa","media","alta"].map(k=> `<button type="button" class="chip ${cargaKey(s.carga) === k ? "on" : ""}" data-k="${k}">${cargaEmoji(CARGA_V[k])}${k === sug ? " ✨" : ""}</button>`).join("")}</div></div>`).join("")}</div>
      <p class="muted small" style="margin:10px 0 0">✨ = sugestão do app</p>`,
    botoes: [{ texto:"Pronto", classe:"btn-primary" }],
    aoAbrir: corpo=> corpo.addEventListener('click', async e=>{
      const b = e.target.closest('[data-k]'); if(!b) return;
      const row = b.closest('[data-rv]');
      const novo = await salvarCampos(row.dataset.rv, { carga: CARGA_V[b.dataset.k] });
      if(novo) row.querySelectorAll('[data-k]').forEach(x=> x.classList.toggle('on', x === b));
    })
  });
};
