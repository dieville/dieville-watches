/* Dieville Watches: home D (31/10/2026)
   A pergunta "O que vou assistir hoje?" vem com dois cartões que já respondem:
   Continuar de onde parei e Algo novo (sugestão pela energia). Pessoa nova vê "Comece por aqui".
   Também: filtro Onde assistir, marca como link para o início, Escolhe pra mim pelo menu e abas com pista de rolagem. */

const MIN_HOME_ENERGIA = 5;
const CHAVE_VISTO = 'dw-ultimo-visto';
let ordemNovo = [], chaveNovo = "", idxNovo = 0;
let sugIniciais = null, sugCarregando = false, sugIdx = 0;

/* ---------- quando foi a última vez que mexi num título ----------
   Vale a data mais recente entre o banco (titles.atualizado_em, muda com status, temporada e episódio, em qualquer aparelho)
   e a guardada neste aparelho (cobre o intervalo até a tela recarregar). Títulos antigos têm atualizado_em = criação,
   por isso a data local ainda ganha quando é mais nova. */
const ultimoVisto = ()=> lerLS2(CHAVE_VISTO, {});
function vistoEm(s, mapa){
  const loc = (mapa || ultimoVisto())[s.id] || "", srv = s.atualizadoEm || "";
  return loc > srv ? loc : srv;
}
function marcarVisto(id){
  const m = ultimoVisto(); m[id] = new Date().toISOString();
  const ids = new Set(shows.map(s=> s.id));
  Object.keys(m).forEach(k=>{ if(!ids.has(k)) delete m[k]; });
  gravarLS2(CHAVE_VISTO, m);
}
const _salvarCamposHome = salvarCampos;
salvarCampos = async function(id, campos){
  const r = await _salvarCamposHome(id, campos);
  if(r && (campos.status === "Assistindo" || "episodio" in campos || "temporada" in campos)) marcarVisto(id);
  return r;
};

/* ---------- dados dos cartões ---------- */
const capaHome = s=> s.imagem ? `background-image:url('${esc(s.imagem)}')` : `background:${posterGradient(s.titulo)}`;
function titulosContinuar(){
  const v = ultimoVisto();
  return shows.filter(s=> s.status === "Assistindo").sort((a, b)=>
    vistoEm(b, v).localeCompare(vistoEm(a, v)) || (b.episodio ? 1 : 0) - (a.episodio ? 1 : 0) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}
function titulosNovo(){
  const e = filters.carga;
  let fila = shows.filter(s=> s.status === "Quero assistir");
  if(e === "baixa") fila = fila.filter(s=> cargaKey(s.carga) === "baixa");
  else if(e === "media") fila = fila.filter(s=> ["baixa","media"].includes(cargaKey(s.carga)));
  const chave = e + "|" + fila.map(s=> s.id).join(",");
  if(chave !== chaveNovo){
    chaveNovo = chave; idxNovo = 0;
    const tempo = lerLS2('dw-tempo', "hora");
    // sem energia escolhida: o último adicionado. Com energia: a ordem do Escolhe pra mim
    ordemNovo = e === "all"
      ? [...fila].sort((a, b)=> (b.createdAt || "").localeCompare(a.createdAt || ""))
      : fila.map(s=> [s, pontuar(s, tempo)]).sort((a, b)=> b[1] - a[1]).map(x=> x[0]);
  }
  return ordemNovo;
}
const totalFila = ()=> shows.filter(s=> s.status === "Quero assistir").length;

/* ---------- HTML dos cartões ---------- */
function chipsEnergia(){
  const ops = [["baixa","Leve"],["media","Médio"],["alta","Foco"]];
  return `<div class="dc-en" role="radiogroup" aria-label="Sua energia hoje">${ops.map(([v, t])=>
    `<button type="button" role="radio" aria-checked="${filters.carga === v}" class="${filters.carga === v ? "on" : ""}" data-e="${v}">${iconeEnergia(v)}<span>${t}</span></button>`).join("")}</div>`;
}
function cartaoContinuar(s, largo){
  const v = vistoEm(s);
  const prog = s.tipo === "Filme" ? "Filme" : s.episodio ? `T${s.temporada || 1} · E${s.episodio}` : "Onde você parou?";
  const quando = v ? ` · visto ${tempoAtras(v)}` : "";
  return `<div class="dc ${largo ? "h" : ""}" data-dc-abrir="${s.id}" tabindex="0" role="button" aria-label="Continuar ${esc(s.titulo)}: ver ficha">
    <div class="dc-po" style="${capaHome(s)}"><span class="dc-ey">Continuar</span></div>
    <div class="dc-col"><div class="dc-tx"><div class="dc-tt">${esc(s.titulo)}</div><div class="dc-mt">${esc(prog)}${esc(quando)}</div></div>
    <div class="dc-ft"><span>Abrir ›</span><button type="button" class="dc-link" data-dc-todos="Assistindo">Ver todos (${titulosContinuar().length})</button></div></div></div>`;
}
function cartaoNovo(s, largo){
  const poucos = shows.length < MIN_HOME_ENERGIA;
  const meta = [s.tipo || "Série", s.duracao ? s.duracao.replace(/\s*·.*$/, "") : "", cargaKey(s.carga) === "alta" ? "pede foco" : ""].filter(Boolean).join(" · ");
  return `<div class="dc new ${largo ? "h" : ""}" ${s ? `data-dc-abrir="${s.id}" tabindex="0" role="button" aria-label="Algo novo: ${esc(s.titulo)}, ver ficha"` : ""}>
    <div class="dc-po" style="${s ? capaHome(s) : "background:var(--surface-2)"}"><span class="dc-ey">Algo novo</span></div>
    <div class="dc-col"><div class="dc-tx">${s ? `<div class="dc-tt">${esc(s.titulo)}</div><div class="dc-mt">${esc(meta)}</div>`
      : `<div class="dc-tt">Nada em Quero ver combina</div><div class="dc-mt">Tente outra energia ou veja todos.</div>`}
      ${poucos ? "" : chipsEnergia()}</div>
    <div class="dc-ft"><button type="button" class="dc-link o" data-dc-outra ${titulosNovo().length > 1 ? "" : "disabled"}>↻ Outra</button><button type="button" class="dc-link" data-dc-todos="Quero assistir">Ver todos (${totalFila()})</button></div></div></div>`;
}
function cartaoComece(){
  const lista = sugIniciais || [];
  const tres = [0, 1, 2].map(i=> lista.length ? lista[(sugIdx + i) % lista.length] : null).filter(Boolean);
  const unicos = [...new Map(tres.map(t=> [t.titulo, t])).values()];
  return `<div class="dc-comece"><div class="dc-tt">Comece por aqui</div>
    <div class="dc-mt">${unicos.length ? "Títulos do catálogo do Dieville, seu amigo. Toque em + Vou ver para adicionar ao seu." : "Adicione o primeiro título e a home passa a sugerir o que ver."}</div>
    ${unicos.length ? `<div class="dc-sug">${unicos.map(t=> `<div class="dc-s"><div class="dc-sp" style="background-image:url('${esc(t.imagem_url)}')"><button type="button" class="dc-vou" data-sug="${esc(t.titulo)}">+ Vou ver</button></div><b>${esc(t.titulo)}</b></div>`).join("")}</div>` : ""}
    <div class="dc-acts">${lista.length > 3 ? `<button type="button" class="dc-link o" data-sug-outras>↻ Outras</button>` : ""}<button type="button" class="btn btn-ghost dc-buscar" data-dc-buscar>Buscar e adicionar um título</button></div></div>`;
}

/* ---------- desenho ---------- */
function renderHome(){
  const box = document.getElementById('dirCards');
  if(!box) return;
  const outros = filters.status !== "all" || filters.tipo !== "all" || filters.genero !== "all" || filters.onde !== "all" || filters.search || viewingListId;
  const cont = titulosContinuar(), fila = totalFila();
  document.body.classList.toggle('home-sem-energia', shows.length < MIN_HOME_ENERGIA);
  if(outros || document.body.dataset.tab !== "catalogo" && document.body.dataset.tab){ box.style.display = "none"; return; }
  let html = "";
  if(!cont.length && !fila){
    if(sugIniciais === null && !sugCarregando) carregarSugestoes();
    const vazio = !shows.length;
    // catálogo vazio sem sugestões: fica a tela de primeiro acesso de sempre
    if(vazio && !(sugIniciais && sugIniciais.length)){ box.style.display = "none"; return; }
    html = `<div class="dc-wrap one">${cartaoComece()}</div>`;
    if(vazio){ const fr = document.getElementById('firstRunState'); if(fr) fr.style.display = "none"; }
  }else if(cont.length && fila){
    html = `<div class="dc-wrap">${cartaoContinuar(cont[0], false)}${cartaoNovo(titulosNovo()[idxNovo % Math.max(1, titulosNovo().length)] || null, false)}</div>`;
  }else if(fila){
    html = `<div class="dc-wrap one">${cartaoNovo(titulosNovo()[idxNovo % Math.max(1, titulosNovo().length)] || null, true)}</div>`;
  }else{
    html = `<div class="dc-wrap one">${cartaoContinuar(cont[0], true)}</div>`;
  }
  box.style.display = "";
  box.innerHTML = html;
}
const _aoRenderHome = aoRenderCatalogo;
aoRenderCatalogo = function(list){ _aoRenderHome(list); renderHome(); };

/* ---------- sugestões para quem começa ---------- */
async function carregarSugestoes(){
  sugCarregando = true;
  try{
    const { data, error } = await sb.rpc('sugestoes_iniciais');
    sugIniciais = error ? [] : (data || []);
  }catch(e){ sugIniciais = []; }
  sugCarregando = false;
  renderHome();
}
async function adicionarSugestao(titulo, btn){
  const t = (sugIniciais || []).find(x=> x.titulo === titulo); if(!t) return;
  if(btn) btn.disabled = true;
  const row = toRow({ titulo: t.titulo, genero: t.genero, vibe: t.vibe, resumo: t.resumo, status: "Quero assistir", tipo: t.tipo, carga: t.carga,
    streaming: t.streaming, duracao: t.duracao, imagem: t.imagem_url, ano: t.ano, tmdbId: t.tmdb_id, tmdbMedia: t.tmdb_media });
  const { data, error } = await sb.from('titles').insert(row).select().single();
  if(error){ console.error(error); showToast("Não consegui adicionar agora"); if(btn) btn.disabled = false; return; }
  shows.push(fromRow(data));
  sugIniciais = sugIniciais.filter(x=> x.titulo !== titulo);
  render();
  showToast(`${t.titulo} entrou no seu catálogo`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{
    const { error: e2 } = await sb.from('titles').delete().eq('id', data.id).eq('user_id', currentUser.id);
    if(!e2){ shows = shows.filter(x=> x.id !== data.id); sugIniciais = null; render(); showToast("Pronto, tirei do seu catálogo"); } else showToast("Não consegui desfazer");
  } });
}

/* ---------- cliques ---------- */
document.getElementById('dirCards').addEventListener('click', e=>{
  const en = e.target.closest('[data-e]');
  if(en){ e.stopPropagation(); setEnergia(filters.carga === en.dataset.e ? "all" : en.dataset.e); return; }
  if(e.target.closest('[data-dc-outra]')){ idxNovo++; renderHome(); return; }
  const td = e.target.closest('[data-dc-todos]');
  if(td){ setStatusFilter(td.dataset.dcTodos); document.getElementById('resultsBar').scrollIntoView({ behavior:"smooth", block:"start" }); return; }
  const sug = e.target.closest('[data-sug]'); if(sug){ adicionarSugestao(sug.dataset.sug, sug); return; }
  if(e.target.closest('[data-sug-outras]')){ sugIdx += 3; renderHome(); return; }
  if(e.target.closest('[data-dc-buscar]')){ document.getElementById('btnAdd').click(); return; }
  const ab = e.target.closest('[data-dc-abrir]');
  if(ab){ const s = shows.find(x=> x.id === ab.dataset.dcAbrir); if(s) abrirFicha(s, ab); }
});
document.getElementById('dirCards').addEventListener('keydown', e=>{
  const ab = e.target.closest('[data-dc-abrir]');
  if(ab && e.target === ab && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); const s = shows.find(x=> x.id === ab.dataset.dcAbrir); if(s) abrirFicha(s, ab); }
});

/* ---------- topo: totalizadores com + Adicionar, marca como link, Escolhe pra mim no menu ---------- */
(function(){
  const st = document.querySelector('.hero .stats');
  const b = document.createElement('button');
  b.type = "button"; b.className = "stat stat-add"; b.id = "statAdd"; b.textContent = "+ Adicionar";
  b.onclick = ()=> document.getElementById('btnAdd').click();
  st.appendChild(b);
  const brand = document.getElementById('brandHome');
  const inicio = ()=>{ viewingListId = null; resetFilters(); setTab('catalogo'); render(); };
  brand.onclick = inicio;
  brand.onkeydown = e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); inicio(); } };
  document.getElementById('btnEscolheMenu').onclick = ()=>{ acctMenu.classList.remove('open'); escolhePraMim(); };
})();

/* ---------- filtro Onde assistir (só aparece quando há dado de streaming) ---------- */
function renderOnde(){
  const cont = {};
  shows.forEach(s=> (s.streaming || []).forEach(x=>{ if(x && x !== "Stremio") cont[x] = (cont[x] || 0) + 1; }));
  const ordem = Object.entries(cont).sort((a, b)=> b[1] - a[1]).slice(0, 10);
  const row = document.getElementById('rowOnde');
  row.style.display = ordem.length ? "" : "none";
  document.getElementById('ondeChips').innerHTML = `<button class="pill ${filters.onde === "all" ? "active" : ""}" data-o="all">Todos</button>` +
    ordem.map(([n, c])=> `<button class="pill ${filters.onde === n ? "active" : ""}" data-o="${esc(n)}">${esc(n)}<small>${c}</small></button>`).join("");
}
document.getElementById('ondeChips').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  filters.onde = filters.onde === b.dataset.o ? "all" : b.dataset.o;
  render();
});
const _renderGenresHome = renderGenres;
renderGenres = function(){ _renderGenresHome(); renderOnde(); };
// "Limpar" na folha mantém a energia, como antes
document.getElementById('btnSheetLimpar').onclick = ()=>{ const c = filters.carga; resetFilters(); filters.carga = c; setEnergia(c); };

/* ---------- aba Amigos: Adicionar amigos aberto só quando ainda não há amigos ---------- */
if(typeof loadAmigos === "function"){
  const _loadAmigosHome = loadAmigos;
  loadAmigos = async function(){
    await _loadAmigosHome();
    try{ document.getElementById('amAdd').open = !(amigos || []).some(a=> a.status === "aceita"); }catch(e){}
  };
}

/* ---------- abas do celular: sombra na borda quando há mais abas para rolar ---------- */
(function(){
  const t = document.querySelector('.tabs');
  const ajusta = ()=>{
    const mais = t.scrollWidth - t.clientWidth - t.scrollLeft > 4;
    t.classList.toggle('mais-dir', mais);
    t.classList.toggle('mais-esq', t.scrollLeft > 4);
  };
  t.addEventListener('scroll', ajusta, { passive:true });
  window.addEventListener('resize', ajusta);
  new MutationObserver(ajusta).observe(t, { childList:true, subtree:true, attributes:true, attributeFilter:["style"] });
  setTimeout(ajusta, 300);
})();

// estado da faixa de Novidades lembrado entre visitas
(function(){
  const el = document.getElementById('novFaixa');
  el.classList.toggle('aberta', !!lerLS2('dw-nov-aberta', false));
})();
