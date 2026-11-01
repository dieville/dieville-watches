/* Dieville Watches: app */
let shows = [];
let lists = [];
let viewingListId = null;
let editingListId = null;
let filters = { status:"all", carga:"all", search:"", tipo:"all", genero:"all", onde:"all" };

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function hueFor(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = str.charCodeAt(i) + ((h<<5)-h);
  return Math.abs(h) % 360;
}
function posterGradient(titulo){
  const h = hueFor(titulo);
  return `linear-gradient(135deg, hsl(${h} 55% 30%), hsl(${(h+50)%360} 45% 14%))`;
}

function resizeImage(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const maxDim = 640;
        let w = img.width, h = img.height;
        if(w >= h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
        else if(h > w && h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = ()=> reject(new Error('imagem inválida'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

const norm = t => (t||"").trim().toLowerCase();

/* ---------- conversão entre o app e as tabelas do Supabase ---------- */
function fromRow(r){
  return {
    id: r.id, titulo: r.titulo, genero: r.genero || "", vibe: r.vibe || "", resumo: r.resumo || "",
    status: r.status || "Quero assistir", tipo: r.tipo || "Série", carga: r.carga || "",
    streaming: r.streaming || [], duracao: r.duracao || "",
    temporada: r.temporada, episodio: r.episodio,
    imagem: r.imagem_url || null, imagemPath: r.imagem_path || null,
    indicadoPor: r.indicado_por || "", createdAt: r.created_at || "", atualizadoEm: r.atualizado_em || "",
    tmdbId: r.tmdb_id ?? null, tmdbMedia: r.tmdb_media || null, ano: r.ano ?? null, minhaNota: r.minha_nota ?? null, nota: (r.nota === null || r.nota === undefined) ? null : Number(r.nota)
  };
}
function toRow(s){
  return {
    titulo: s.titulo, genero: s.genero || "", vibe: s.vibe || "", resumo: s.resumo || "",
    status: s.status || "Quero assistir", tipo: s.tipo || "Série", carga: s.carga || "",
    streaming: (s.streaming && s.streaming.length) ? s.streaming : ["Stremio"], duracao: s.duracao || "",
    temporada: s.temporada ?? null, episodio: s.episodio ?? null,
    imagem_url: s.imagem || null, imagem_path: s.imagemPath || null,
    indicado_por: s.indicadoPor || "", ano: s.ano ?? null, tmdb_id: s.tmdbId ?? null, tmdb_media: s.tmdbMedia || null, nota: (s.nota === null || s.nota === undefined || s.nota === "") ? null : Number(s.nota)
  };
}
function listFromRow(r){ return { id: r.id, nome: r.nome, showIds: r.show_ids || [], publica: !!r.publica }; }

async function loadShows(){
  const { data, error } = await sb.from('titles').select('*').eq('user_id', currentUser.id).order('titulo');
  if(error){ console.error(error); showToast("Não consegui carregar seus títulos"); shows = []; return; }
  shows = data.map(fromRow);
}

async function loadLists(){
  const { data, error } = await sb.from('lists').select('*').eq('user_id', currentUser.id).order('created_at');
  if(error){ console.error(error); lists = []; return; }
  lists = data.map(listFromRow);
}

async function saveListIds(list){
  const { error } = await sb.from('lists').update({ show_ids: list.showIds }).eq('id', list.id);
  if(error){ console.error(error); showToast("Não consegui salvar a lista agora"); return false; }
  return true;
}

/* ---------- capas no Storage do Supabase ---------- */
async function uploadCover(dataUrl){
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${currentUser.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('capas').upload(path, blob, { contentType: 'image/jpeg' });
  if(error) throw error;
  const { data } = sb.storage.from('capas').getPublicUrl(path);
  return { url: data.publicUrl, path };
}
async function removeCover(path){
  if(!path) return;
  const { error } = await sb.storage.from('capas').remove([path]);
  if(error) console.error(error);
}

/* ---------- catálogo inicial (126 títulos montados nas conversas) ---------- */
function buildInitialCatalog(){
  const map = new Map();
  SEED.forEach(s => map.set(norm(s.titulo), { tipo: "Série", ...s }));
  [...ENRICH_DATA, ...MOVIES_DATA].forEach(ed=>{
    const { renomeiaDe, ...item } = ed;
    const alvo = map.get(norm(item.titulo));
    if(!alvo){ map.set(norm(item.titulo), { status: "Quero assistir", ...item }); return; }
    for(const k of ["genero","vibe","resumo","carga","duracao"]){ if((!alvo[k] || alvo[k] === "-") && item[k]) alvo[k] = item[k]; }
    if((!alvo.streaming || !alvo.streaming.length) && item.streaming && item.streaming.length) alvo.streaming = item.streaming;
    if((alvo.nota === undefined || alvo.nota === null) && item.nota != null) alvo.nota = item.nota;
    if(item.tipo === "Anime") alvo.tipo = "Anime";
  });
  return [...map.values()].map(s => toRow({
    ...s,
    tipo: ANIMES.has(s.titulo) ? "Anime" : (s.tipo || "Série"),
    carga: CARGA_REVISION[s.titulo] || s.carga || "Média (Atenção moderada)",
    status: s.status || "Quero assistir",
    imagem: null, imagemPath: null, indicadoPor: ""
  }));
}

async function seedCatalog(){
  const btn = document.getElementById('btnSeedCatalog');
  btn.disabled = true; btn.textContent = "Carregando…";
  const rows = buildInitialCatalog();
  for(let i = 0; i < rows.length; i += 50){
    const { error } = await sb.from('titles').insert(rows.slice(i, i + 50));
    if(error){ console.error(error); showToast("Erro ao carregar o catálogo: " + error.message); btn.disabled = false; btn.textContent = "Carregar catálogo inicial"; return; }
  }
  await loadShows();
  render();
  showToast(`${shows.length} títulos carregados`);
}

function statusClass(s){
  return { "Quero assistir":"st-quero","Assistindo":"st-assistindo","Em Pausa":"st-pausa","Aguardando Nova Temporada":"st-aguardando","Concluída":"st-concluida","Abandonei":"st-abandonei" }[s] || "st-quero";
}
function cargaKey(c){
  if(!c) return "";
  if(c.startsWith("Baixa")) return "baixa";
  if(c.startsWith("Média")) return "media";
  if(c.startsWith("Alta")) return "alta";
  return "";
}

function applyFilters(){
  return shows.filter(s=>{
    if(viewingListId){
      const list = lists.find(l=>l.id===viewingListId);
      if(!list || !list.showIds.includes(s.id)) return false;
    }
    if(filters.status!=="all" && s.status!==filters.status) return false;
    if(filters.tipo!=="all" && (s.tipo||"Série")!==filters.tipo) return false;
    if(filters.carga==="baixa" && cargaKey(s.carga)!=="baixa") return false;
    if(filters.carga==="media" && !["baixa","media"].includes(cargaKey(s.carga))) return false;
    if(filters.genero!=="all" && !generoTokens(s.genero).has(filters.genero)) return false;
    if(filters.onde!=="all" && !(s.streaming||[]).includes(filters.onde)) return false;
    if(filters.search){
      const q = filters.search.toLowerCase();
      const hay = `${s.titulo} ${s.genero} ${s.vibe}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_LABEL = { "Quero assistir":"Quero ver", "Em Pausa":"Em pausa", "Aguardando Nova Temporada":"Aguardando temporada", "Concluída":"Concluído" };
const statusLabel = s => STATUS_LABEL[s] || s;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

let sortMode = "proximos";
try{ sortMode = localStorage.getItem('wl-sort') || "proximos"; }catch(e){}
const STATUS_ORDEM = { "Assistindo":0, "Em Pausa":1, "Aguardando Nova Temporada":2, "Quero assistir":3, "Concluída":4, "Abandonei":5 };
// "Com foco": mesma ordem de sempre, mas os títulos que pedem foco vêm primeiro
function sortList(list){
  const base = sortListBase(list);
  if(filters.carga !== "alta") return base;
  const pc = s=> ({ alta:0, media:1, baixa:2 })[cargaKey(s.carga)] ?? 3;
  return base.map((s, i)=> [s, i]).sort((a, b)=> pc(a[0]) - pc(b[0]) || a[1] - b[1]).map(x=> x[0]);
}
function sortListBase(list){
  const byNome = (a,b)=> a.titulo.localeCompare(b.titulo, 'pt-BR');
  const nota = s => (s.nota === null || s.nota === undefined) ? -1 : s.nota;
  const arr = [...list];
  if(sortMode === "az") return arr.sort(byNome);
  if(sortMode === "nota") return arr.sort((a,b)=> nota(b) - nota(a) || byNome(a,b));
  if(sortMode === "recentes") return arr.sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||"") || byNome(a,b));
  return arr.sort((a,b)=> (STATUS_ORDEM[a.status] ?? 9) - (STATUS_ORDEM[b.status] ?? 9) || nota(b) - nota(a) || byNome(a,b));
}

const GENERO_LABEL = { scifi:"Ficção científica", fantasia:"Fantasia", suspense:"Suspense", historico:"Histórico", guerra:"Guerra",
  politico:"Político", acao:"Ação", aventura:"Aventura", animacao:"Animação", comedia:"Comédia", terror:"Terror", misterio:"Mistério",
  crime:"Crime", drama:"Drama", romance:"Romance", familia:"Família", documentario:"Documentário", faroeste:"Faroeste",
  superheroi:"Super-herói", psicologico:"Psicológico" };
function generoTagsHTML(g, publico){
  const toks = [...generoTokens(g)];
  if(!toks.length) return esc(g || "");
  if(publico) return toks.map(t=> GENERO_LABEL[t]).join(" · ");
  return `<span class="gtxt">${toks.map(t=> GENERO_LABEL[t]).join(" · ")}</span>`;
}
let generosAbertos = false;
function renderGenres(){
  const cont = {};
  shows.forEach(s=> generoTokens(s.genero).forEach(t=> cont[t] = (cont[t]||0) + 1));
  const ordem = Object.entries(cont).sort((a,b)=> b[1]-a[1]);
  const visiveis = generosAbertos ? ordem : ordem.slice(0, 8);
  if(filters.genero!=="all" && !visiveis.find(([t])=> t===filters.genero)){ const f = ordem.find(([t])=> t===filters.genero); if(f) visiveis.push(f); }
  const box = document.getElementById('genreChips');
  box.innerHTML = `<button class="pill ${filters.genero==="all"?"active":""}" data-g="all">Todos</button>` +
    visiveis.map(([t,n])=> `<button class="pill ${filters.genero===t?"active":""}" data-g="${t}">${GENERO_LABEL[t]}<small>${n}</small></button>`).join("") +
    (ordem.length > 8 ? `<button class="pill" data-more>${generosAbertos ? "Menos" : `+ ${ordem.length - 8}`}</button>` : "");
  const sel = document.getElementById('mGenero');
  sel.innerHTML = `<option value="all">Gênero: Todos</option>` + ordem.map(([t,n])=> `<option value="${t}">${GENERO_LABEL[t]} (${n})</option>`).join("");
  sel.value = filters.genero;
}
function setGeneroFilter(g){ filters.genero = g; render(); }
document.getElementById('genreChips').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  if(b.hasAttribute('data-more')){ generosAbertos = !generosAbertos; renderGenres(); return; }
  setGeneroFilter(filters.genero === b.dataset.g && b.dataset.g !== "all" ? "all" : b.dataset.g);
});
document.getElementById('mGenero').onchange = e=> setGeneroFilter(e.target.value);
document.getElementById('grid').addEventListener('click', e=>{
  const g = e.target.closest('.gtag'); if(!g) return;
  e.stopPropagation(); setGeneroFilter(g.dataset.g);
  document.querySelector('.filter-box').scrollIntoView({ behavior:"smooth", block:"start" });
}, true);

function render(){
  renderGenres();
  const grid = document.getElementById('grid');
  const list = sortList(applyFilters());
  grid.innerHTML = "";
  const vazio = shows.length === 0;
  document.getElementById('firstRunState').style.display = vazio ? "block" : "none";
  document.getElementById('emptyState').style.display = (!vazio && !list.length) ? "block" : "none";

  const banner = document.getElementById('listBanner');
  if(viewingListId){
    const l = lists.find(x=>x.id===viewingListId);
    if(l){
      banner.style.display = "block";
      document.getElementById('listBannerText').textContent = `Vendo lista: ${l.nome} (${l.showIds.length})`;
    }else{
      viewingListId = null;
      banner.style.display = "none";
    }
  }else{
    banner.style.display = "none";
  }

  list.forEach(s=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${s.titulo}, ${statusLabel(s.status)}. Ver detalhes`);
    const abrir = ()=> (typeof abrirFicha === 'function' ? abrirFicha(s, card) : openModal(s, card));
    card.onclick = abrir;
    card.onkeydown = e=>{ if(e.target === card && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); abrir(); } };
    card.innerHTML = cardHTML(s, false);
    grid.appendChild(card);
  });

  updateResultsBar(list.length);
  if(typeof aoRenderCatalogo === 'function') aoRenderCatalogo(list);
  document.getElementById('statTotal').textContent = shows.length;
  document.getElementById('statAssistindo').textContent = shows.filter(s=>s.status==="Assistindo").length;
  document.getElementById('statPausa').textContent = shows.filter(s=>s.status==="Em Pausa").length;
  document.getElementById('statFila').textContent = shows.filter(s=>s.status==="Quero assistir").length;
  document.querySelectorAll('.stat[data-quick]').forEach(b=> b.classList.toggle('on', b.dataset.quick !== "all" && b.dataset.quick === filters.status));
}

function cardHTML(s, publico){
  const prog = (!publico && s.tipo !== "Filme" && (s.temporada || s.episodio)) ? (s.episodio ? `▶ T${s.temporada||1} · E${s.episodio}` : `▶ T${s.temporada}`) : "";
  const posterStyle = s.imagem
    ? `background:linear-gradient(180deg, rgba(20,21,26,.25) 0%, rgba(20,21,26,.95) 85%), url('${esc(s.imagem)}') center/cover no-repeat; opacity:1`
    : `background:${posterGradient(s.titulo)}; opacity:.16`;
  return `
    <div class="poster" style="${posterStyle}"></div>
    ${(s.nota !== null && s.nota !== undefined) ? `<span class="status-tag" style="left:14px;right:auto;background:#2a2410;color:#e8c33d">⭐ ${Number(s.nota).toFixed(1)}</span>` : ""}
    ${publico ? `<span class="status-tag st-quero">${s.tipo || "Série"}</span>` : `<span class="status-tag ${statusClass(s.status)}">${statusLabel(s.status)}</span>`}
    <div class="titulo">${esc(s.titulo)}${s.ano ? ` <span class="ano">${esc(s.ano)}</span>` : ""}</div>
    <div class="genero">${generoTagsHTML(s.genero, publico)}</div>
    <div class="vibe">${esc(s.vibe)}</div>
    ${!publico && s.minhaNota ? `<div class="minha-nota" aria-label="Sua nota: ${s.minhaNota} de 5">${"★".repeat(s.minhaNota)}<span>${"★".repeat(5 - s.minhaNota)}</span></div>` : ""}
    ${!publico && typeof seloNovidade === "function" ? seloNovidade(s) : ""}
    ${publico && cargaKey(s.carga) ? `<span class="carga-pub ${cargaKey(s.carga)}">${cargaEmoji(s.carga)} · ${({ baixa:"bom pra ver cansado", media:"pede alguma atenção", alta:"melhor com energia" })[cargaKey(s.carga)]}</span>` : ""}
    ${publico && s.resumo ? `<div class="resumo">${esc(s.resumo)}</div>` : ""}
    ${!publico && s.indicadoPor ? `<div class="vibe" style="opacity:.7">💬 indicação de ${esc(s.indicadoPor)}</div>` : ""}
    <div class="meta">
      <div class="streams">${(s.streaming||[]).map(x=>`<span>${esc(x)}</span>`).join("")}</div>
      <div style="text-align:right">
        ${publico ? "" : `<div class="carga">${cargaEmoji(s.carga)}</div>`}
        ${prog ? `<div class="prog">${prog}</div>` : ""}
      </div>
    </div>
  `;
}

/* Ícones de energia em SVG: mesma forma e cor em qualquer aparelho (os emojis perdiam a cor na TV) */
const ICONE_ENERGIA = {
  baixa:'<path d="M20 4C10 4 5 9 5 15v5h3c6 0 11-5 12-16z"/><path d="M5 20 14 11"/>',
  media:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  alta:'<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z"/>'
};
function iconeEnergia(k){
  return ICONE_ENERGIA[k] ? `<svg class="ei ${k}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_ENERGIA[k]}</svg>` : "";
}
function cargaEmoji(c){
  const k = cargaKey(c);
  return k==="baixa" ? `${iconeEnergia(k)} Leve` : k==="media" ? `${iconeEnergia(k)} Médio` : k==="alta" ? `${iconeEnergia(k)} Pede foco` : "sem carga";
}

/* ---------- filters wiring ---------- */
function setStatusFilter(v){
  filters.status = v;
  document.querySelectorAll('.pill[data-status]').forEach(b=>b.classList.toggle('active', b.dataset.status===v));
  document.getElementById('mStatus').value = v;
  render();
}
function setTipoFilter(v){
  filters.tipo = v;
  document.querySelectorAll('.pill[data-tipo]').forEach(b=>b.classList.toggle('active', b.dataset.tipo===v));
  document.getElementById('mTipo').value = v;
  render();
}
document.querySelectorAll('.pill[data-status]').forEach(btn=> btn.onclick = ()=> setStatusFilter(filters.status === btn.dataset.status ? "all" : btn.dataset.status));
document.querySelectorAll('.pill[data-tipo]').forEach(btn=> btn.onclick = ()=> setTipoFilter(btn.dataset.tipo));
document.getElementById('mStatus').onchange = e=> setStatusFilter(e.target.value);
document.getElementById('mTipo').onchange = e=> setTipoFilter(e.target.value);
document.querySelectorAll('.stat[data-quick]').forEach(b=> b.onclick = ()=>{
  if(b.dataset.quick === "all"){ resetFilters(); viewingListId = null; render(); return; }
  setStatusFilter(filters.status === b.dataset.quick ? "all" : b.dataset.quick);
});
const sortSel = document.getElementById('sortSel');
sortSel.value = sortMode;
sortSel.onchange = ()=>{ sortMode = sortSel.value; try{ localStorage.setItem('wl-sort', sortMode); }catch(e){} render(); };
document.querySelectorAll('.dial button').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.dial button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    filters.carga = btn.dataset.c;
    render();
  };
});
const searchEl = document.getElementById('search');
const clearSearchBtn = document.getElementById('btnClearSearch');
searchEl.addEventListener('input', e=>{
  filters.search = e.target.value;
  clearSearchBtn.classList.toggle('show', !!e.target.value);
  render();
});
searchEl.addEventListener('keydown', e=>{ if(e.key === 'Escape' && searchEl.value){ e.stopPropagation(); clearSearchBtn.click(); } });
clearSearchBtn.onclick = ()=>{ searchEl.value = ""; filters.search = ""; clearSearchBtn.classList.remove('show'); render(); searchEl.focus(); };

/* ---------- abas, menu da conta e resultado ---------- */
function setTab(tab){
  document.body.dataset.tab = tab;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===tab));
  if(tab==='listas') renderLists();
  if(tab==='pessoas') loadPeople();
  if(tab==='amigos' && typeof loadAmigos === 'function') loadAmigos();
  if(tab==='novidades' && typeof abrirNovidades === 'function') abrirNovidades();
  window.scrollTo(0,0);
}
document.querySelectorAll('.tabs button').forEach(b=> b.onclick = ()=> setTab(b.dataset.tab));

const acctMenu = document.getElementById('acctMenu');
const btnAccount = document.getElementById('btnAccount');
btnAccount.onclick = e=>{ e.stopPropagation(); const o = acctMenu.classList.toggle('open'); btnAccount.setAttribute('aria-expanded', o); };
document.addEventListener('click', e=>{ if(!acctMenu.contains(e.target)){ acctMenu.classList.remove('open'); btnAccount.setAttribute('aria-expanded', false); } });

function filtrosAtivos(){
  return filters.status!=="all" || filters.tipo!=="all" || filters.carga!=="all" || filters.genero!=="all" || filters.onde!=="all" || !!filters.search;
}
function resetFilters(){
  filters = { status:"all", carga:"all", search:"", tipo:"all", genero:"all", onde:"all" };
  document.querySelectorAll('.pill[data-status]').forEach(b=>b.classList.toggle('active', b.dataset.status==="all"));
  document.querySelectorAll('.pill[data-tipo]').forEach(b=>b.classList.toggle('active', b.dataset.tipo==="all"));
  document.querySelectorAll('.dial button').forEach(b=>b.classList.toggle('active', b.dataset.c==="all"));
  document.getElementById('search').value = "";
  document.getElementById('btnClearSearch').classList.remove('show');
  document.getElementById('mTipo').value = "all";
  document.getElementById('mStatus').value = "all";
  document.getElementById('mGenero').value = "all";
}
function updateResultsBar(n){
  const ativos = filtrosAtivos();
  document.getElementById('resultsText').innerHTML = shows.length ? `<b>${n} ${n===1?"título":"títulos"}</b>${ativos ? " com os filtros atuais" : ""}` : "";
  document.getElementById('btnClearFilters').style.display = ativos ? "" : "none";
  document.getElementById('btnCreateFromFilter').style.display = (ativos && n && !viewingListId) ? "" : "none";
}
document.getElementById('btnClearFilters').onclick = ()=>{ resetFilters(); render(); };

document.getElementById('btnCreateFromFilter').onclick = async ()=>{
  const ids = applyFilters().map(s=>s.id);
  if(!ids.length) return;
  const nome = prompt(`Nome da lista com ${ids.length} títulos:`);
  if(!nome || !nome.trim()) return;
  const { data, error } = await sb.from('lists').insert({ nome: nome.trim(), show_ids: ids }).select().single();
  if(error){ console.error(error); showToast("Não consegui criar a lista"); return; }
  lists.push(listFromRow(data));
  showToast(`Lista "${nome.trim()}" criada`);
  setTab('listas');
};

/* ---------- gerar imagem compartilhável ---------- */
function truncateText(ctx, text, maxWidth){
  let t = text || "";
  if(ctx.measureText(t).width <= maxWidth) return t;
  while(t.length > 0 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

async function generateListImage(list){
  const items = shows.filter(s=>list.showIds.includes(s.id));
  if(!items.length){ showToast("Essa lista está vazia"); return; }
  showToast("Gerando imagem...");

  const loadedImgs = await Promise.all(items.map(s=>{
    if(!s.imagem) return Promise.resolve(null);
    return new Promise(resolve=>{
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror = ()=> resolve(null);
      img.crossOrigin = 'anonymous';
      img.src = s.imagem;
    });
  }));

  const W = 720, rowH = 96, headerH = 118, footerH = 46;
  const H = headerH + items.length * rowH + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1d1f27');
  bg.addColorStop(1, '#14151a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#e8a33d';
  ctx.font = '700 13px Arial';
  ctx.fillText('DIEVILLE WATCHES', 32, 38);
  ctx.fillStyle = '#f2f0ea';
  ctx.font = '700 30px Georgia';
  ctx.fillText(truncateText(ctx, list.nome, W - 64), 32, 76);
  ctx.strokeStyle = '#34374680';
  ctx.beginPath(); ctx.moveTo(32, headerH - 12); ctx.lineTo(W - 32, headerH - 12); ctx.stroke();

  items.forEach((s, i)=>{
    const y = headerH + i * rowH;
    const img = loadedImgs[i];
    const size = 72, tx = 32, ty = y + 12;

    ctx.save();
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(tx, ty, size, size, 10);
    else ctx.rect(tx, ty, size, size);
    ctx.clip();
    if(img){
      const scale = Math.max(size / img.width, size / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      ctx.drawImage(img, tx - (iw - size) / 2, ty - (ih - size) / 2, iw, ih);
    }else{
      const h = hueFor(s.titulo);
      const grad = ctx.createLinearGradient(tx, ty, tx + size, ty + size);
      grad.addColorStop(0, `hsl(${h} 55% 30%)`);
      grad.addColorStop(1, `hsl(${(h + 50) % 360} 45% 14%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(tx, ty, size, size);
    }
    ctx.restore();

    const textX = tx + size + 20;
    const maxTextW = W - textX - 32;
    ctx.fillStyle = '#f2f0ea';
    ctx.font = '600 19px Georgia';
    ctx.fillText(truncateText(ctx, s.titulo, maxTextW), textX, y + 34);

    ctx.fillStyle = '#e8a33d';
    ctx.font = '600 13px Arial';
    ctx.fillText(truncateText(ctx, s.genero || '-', maxTextW), textX, y + 56);

    if((s.streaming || []).length){
      ctx.fillStyle = '#a7a7b0';
      ctx.font = '400 12px Arial';
      ctx.fillText(truncateText(ctx, s.streaming.join(' · '), maxTextW), textX, y + 76);
    }

    if(i < items.length - 1){
      ctx.strokeStyle = '#34374630';
      ctx.beginPath(); ctx.moveTo(32, y + rowH - 4); ctx.lineTo(W - 32, y + rowH - 4); ctx.stroke();
    }
  });

  ctx.fillStyle = '#6c6d78';
  ctx.font = '400 11px Arial';
  ctx.fillText(plural(items.length, "título", "títulos"), 32, H - 18);

  canvas.toBlob(blob=>{
    if(!blob){ showToast("Não consegui gerar a imagem"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Imagem baixada, já pode mandar!");
  }, 'image/png');
}

/* ---------- minhas listas ---------- */
function renderLists(){
  const c = document.getElementById('listsContainer');
  if(!lists.length){
    c.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:10px 0">Nenhuma lista ainda. Crie uma acima.</div>`;
    return;
  }
  c.innerHTML = lists.map(l=>`
    <div class="lcard">
      <div class="lc-top">
        <div class="lc-nome">${esc(l.nome)}${l.publica ? '<span class="pub-tag">pública</span>' : ''}</div>
        <button class="lc-more" data-action="menu" data-id="${l.id}" aria-label="Mais ações da lista ${esc(l.nome)}" aria-haspopup="menu">⋯</button>
      </div>
      <div class="lc-sub">${plural(l.showIds.length, "título", "títulos")}${l.publica ? "" : " · privada"}</div>
      <div class="lc-acts">
        <button class="btn btn-primary" data-action="sharemenu" data-id="${l.id}">Compartilhar</button>
        <button class="btn btn-ghost" data-action="view" data-id="${l.id}">Ver</button>
      </div>
    </div>
  `).join("");
}


document.getElementById('btnCreateList').onclick = async ()=>{
  const input = document.getElementById('newListName');
  const nome = input.value.trim();
  if(!nome){ showToast("Dá um nome pra lista"); return; }
  const { data, error } = await sb.from('lists').insert({ nome, show_ids: [] }).select().single();
  if(error){ console.error(error); showToast("Não consegui criar a lista"); return; }
  lists.push(listFromRow(data));
  input.value = "";
  renderLists();
  showToast("Lista criada");
};

document.getElementById('listsContainer').addEventListener('click', async e=>{
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  return acaoLista(btn.dataset.action, btn.dataset.id, btn);
});
async function acaoLista(action, id, btn){
  const list = lists.find(l=>l.id===id);
  if(!list) return;
  if(action==='sharemenu') return abrirCompartilharLista(list);
  if(action==='menu') return abrirMenuLista(list, btn);

  if(action==='view'){
    viewingListId = id;
    resetFilters();
    setTab('catalogo');
    render();
  }
  if(action==='edit'){
    openPicker(list);
  }
  if(action==='copy'){
    const items = shows.filter(s=>list.showIds.includes(s.id));
    if(!items.length){ showToast("Essa lista está vazia"); return; }
    const text = `🎬 ${list.nome}\n\n` + items.map(s=>{
      const streams = (s.streaming||[]).length ? ` [${s.streaming.join(", ")}]` : "";
      const ind = s.indicadoPor ? ` (indicação de ${s.indicadoPor})` : "";
      return `• ${s.titulo} · ${s.genero||"-"}${streams}${ind}`;
    }).join("\n");
    try{
      await navigator.clipboard.writeText(text);
      showToast(`Lista "${list.nome}" copiada`);
    }catch(e){
      showToast("Não consegui copiar");
    }
  }
  if(action==='image'){
    await generateListImage(list);
  }
  if(action==='share'){
    if(!list.publica){
      const { error } = await sb.from('lists').update({ publica: true }).eq('id', id);
      if(error){ console.error(error); showToast("Não consegui tornar a lista pública"); return; }
      list.publica = true;
      renderLists();
    }
    const url = `${location.origin}${location.pathname}?lista=${id}`;
    if(navigator.share){
      try{ await navigator.share({ title: list.nome, text: `Minha lista: ${list.nome}`, url }); return; }catch(e){ if(e.name === 'AbortError') return; }
    }
    try{ await navigator.clipboard.writeText(url); showToast("Link público copiado"); }
    catch(e){ prompt("Copie o link:", url); }
  }
  if(action==='unshare'){
    const { error } = await sb.from('lists').update({ publica: false }).eq('id', id);
    if(error){ showToast("Não consegui tornar privada"); return; }
    list.publica = false;
    renderLists();
    showToast("Lista privada, o link parou de funcionar");
  }
  if(action==='delete'){
    if(!(await confirmar({ titulo:`Excluir a lista "${list.nome}"?`, texto:"Os títulos continuam no seu catálogo.", botao:"Excluir lista", perigo:true }))) return;
    const { error } = await sb.from('lists').delete().eq('id', id);
    if(error){ showToast("Não consegui excluir a lista"); return; }
    lists = lists.filter(l=>l.id!==id);
    if(viewingListId===id) viewingListId = null;
    renderLists();
    render();
    showToast("Lista excluída");
  }
}

document.getElementById('btnClearListView').onclick = ()=>{
  viewingListId = null;
  render();
};

/* ---------- seletor de séries para uma lista ---------- */
// A seleção fica num rascunho: a lista só muda quando a pessoa toca em Salvar
let pickerSel = new Set();
function openPicker(list){
  editingListId = list.id;
  pickerSel = new Set(list.showIds);
  document.getElementById('pickerTitle').textContent = `Editar: ${list.nome}`;
  document.getElementById('pickerSearch').value = "";
  renderPicker("");
  atualizarPickerN();
  document.getElementById('pickerOverlay').classList.add('open');
  setTimeout(()=> document.getElementById('pickerSearch').focus(), 50);
}
function fecharPicker(){ document.getElementById('pickerOverlay').classList.remove('open'); }
function atualizarPickerN(){
  document.getElementById('pickerCount').textContent = plural(pickerSel.size, "título selecionado", "títulos selecionados");
}
function renderPicker(query){
  const list = lists.find(l=>l.id===editingListId);
  if(!list) return;
  const q = query.toLowerCase();
  const filtered = shows.filter(s=> !q || s.titulo.toLowerCase().includes(q));
  const container = document.getElementById('pickerList');
  container.innerHTML = filtered.map(s=>`
    <label class="pk-row">
      <input type="checkbox" data-id="${s.id}" ${pickerSel.has(s.id) ? 'checked' : ''}>
      <i class="pk-box" aria-hidden="true"></i>
      <span class="pk-po" style="${s.imagem ? `background-image:url('${esc(s.imagem)}')` : `background:${posterGradient(s.titulo)}`}"></span>
      <span class="pk-t"><b>${esc(s.titulo)}</b><small>${esc([s.tipo || "Série", s.ano].filter(Boolean).join(" · "))}</small></span>
    </label>
  `).join("") || `<div style="color:var(--text-dim);font-size:13px;padding:10px 0">Nenhum título encontrado</div>`;
}

document.getElementById('pickerSearch').addEventListener('input', e=> renderPicker(e.target.value));

document.getElementById('pickerList').addEventListener('change', e=>{
  const cb = e.target.closest('input[type=checkbox]');
  if(!cb) return;
  if(cb.checked) pickerSel.add(cb.dataset.id); else pickerSel.delete(cb.dataset.id);
  atualizarPickerN();
});

document.getElementById('btnPickerDone').onclick = async ()=>{
  const list = lists.find(l=>l.id===editingListId);
  if(list){
    const antes = list.showIds;
    list.showIds = [...pickerSel];
    if(!(await saveListIds(list))){ list.showIds = antes; return; }
  }
  fecharPicker();
  renderLists();
  showToast("Lista atualizada");
};
document.getElementById('btnPickerCancel').onclick = fecharPicker;
document.getElementById('btnPickerX').onclick = fecharPicker;
document.getElementById('pickerOverlay').addEventListener('click', e=>{ if(e.target.id==='pickerOverlay') fecharPicker(); });
document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && document.getElementById('pickerOverlay').classList.contains('open')) fecharPicker(); });

/* ---------- modal ---------- */
const overlay = document.getElementById('overlay');
let currentId = null;
let pendingImage = null;

function setCoverPreview(src, novo){
  const prev = document.getElementById('imgPreview');
  prev.style.backgroundImage = src ? `url('${src}')` : '';
  prev.textContent = src ? '' : '🖼️';
  prev.classList.toggle('has', !!src);
  document.getElementById('dropTxt').innerHTML = src
    ? `<b>${novo ? "Nova capa carregada ✓" : "Capa atual"}</b>${novo ? "Ela será salva quando você clicar em Salvar." : ""} Para trocar, clique aqui ou arraste outra imagem.`
    : `<b>Adicionar capa</b>Arraste uma imagem para cá ou clique para escolher do seu dispositivo.`;
  document.getElementById('btnRemoveImg').style.display = src ? 'inline-block' : 'none';
}
async function handleCoverFile(file){
  if(!file || !file.type.startsWith('image/')){ showToast("Escolha um arquivo de imagem"); return; }
  try{ pendingImage = await resizeImage(file); setCoverPreview(pendingImage, true); hideTmdb(); }
  catch(err){ showToast("Não consegui processar essa imagem"); }
}
document.getElementById('fImagem').addEventListener('change', e=> handleCoverFile(e.target.files[0]));
const dropzone = document.getElementById('dropzone');
['dragenter','dragover'].forEach(ev=> dropzone.addEventListener(ev, e=>{ e.preventDefault(); dropzone.classList.add('over'); }));
['dragleave','drop'].forEach(ev=> dropzone.addEventListener(ev, e=>{ e.preventDefault(); dropzone.classList.remove('over'); }));
dropzone.addEventListener('drop', e=> handleCoverFile(e.dataTransfer.files[0]));
document.getElementById('btnRemoveImg').onclick = ()=>{
  pendingImage = null;
  document.getElementById('fImagem').value = '';
  setCoverPreview(null);
};

let lastFocus = null;
function openModal(show, origin){
  lastFocus = origin || document.activeElement;
  pendingTmdb = show?.tmdbId ? { id: show.tmdbId, media: show.tmdbMedia } : null;
  pendingAno = show?.ano ?? null;
  forceDup = false;
  showDup(null);
  currentId = show ? show.id : null;
  document.getElementById('chipCarga').classList.remove('invalid');
  document.getElementById('modalTitle').textContent = show ? "Editar título" : "Novo título";
  document.getElementById('btnDelete').style.display = show ? "inline-block" : "none";
  document.getElementById('fTitulo').value = show?.titulo || "";
  document.getElementById('fGenero').value = show?.genero || "";
  document.getElementById('fVibe').value = show?.vibe || "";
  document.getElementById('fResumo').value = show?.resumo || "";
  document.getElementById('fStatus').value = show?.status || "Quero assistir";
  document.getElementById('fDuracao').value = show?.duracao || "";
  document.getElementById('fTemporada').value = show?.temporada || "";
  document.getElementById('fIndicadoPor').value = show?.indicadoPor || "";
  document.getElementById('fNota').value = (show?.nota !== null && show?.nota !== undefined) ? show.nota : "";
  document.getElementById('fEpisodio').value = show?.episodio || "";

  pendingImage = show?.imagem || null;
  document.getElementById('fImagem').value = "";
  setCoverPreview(pendingImage);
  hideTmdb();
  clearSrc();
  document.getElementById('completeResults').classList.remove('show');
  document.getElementById('completeResults').innerHTML = "";
  document.getElementById('btnCompleteTmdb').style.display = (show && TMDB_KEY) ? "" : "none";
  const comBusca = !show && !!TMDB_KEY;
  document.getElementById('lookupQ').value = "";
  document.getElementById('btnClearLookup').classList.remove('show');
  document.getElementById('lookupResults').innerHTML = "";
  document.querySelectorAll('#lookupTipo .chip').forEach(c=> c.classList.toggle('on', c.dataset.v === ""));

  const cargaInicial = show ? (show.carga || "") : "Média (Atenção moderada)";
  document.querySelectorAll('#chipCarga .chip').forEach(c=>{
    c.classList.toggle('on', c.dataset.v === cargaInicial);
  });
  document.querySelectorAll('#chipTipo .chip').forEach(c=>{
    c.classList.toggle('on', c.dataset.v === (show?.tipo||"Série"));
  });
  updateTipoDependentUI(show?.tipo||"Série");
  document.querySelectorAll('#chipStream .chip').forEach(c=>{
    c.classList.toggle('on', (show?.streaming||[]).includes(c.dataset.v));
  });
  overlay.classList.add('open');
  overlay.querySelector('.modal').scrollTop = 0;
  showLookup(comBusca);
  setTimeout(()=> document.getElementById(comBusca ? 'lookupQ' : 'fTitulo').focus(), 30);
}
function closeModal(){
  overlay.classList.remove('open'); currentId=null;
  if(lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
document.getElementById('btnCloseModal').onclick = closeModal;

// Esc fecha e o Tab fica preso dentro do modal aberto
document.addEventListener('keydown', e=>{
  const aberto = [...document.querySelectorAll('.overlay.open')].pop();
  if(e.key === 'Escape'){
    if(aberto){ e.preventDefault(); if(aberto === overlay) closeModal(); else aberto.classList.remove('open'); return; }
    if(acctMenu.classList.contains('open')){ acctMenu.classList.remove('open'); btnAccount.focus(); }
    return;
  }
  if(e.key === 'Tab' && aberto){
    const foc = [...aberto.querySelectorAll('button, input:not(.sr-only), select, textarea, [tabindex="0"]')].filter(el=> el.offsetParent !== null);
    if(!foc.length) return;
    const first = foc[0], last = foc[foc.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
});

document.getElementById('btnAdd').onclick = ()=> openModal(null);
document.getElementById('btnCancel').onclick = closeModal;
overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });

document.querySelectorAll('#chipCarga .chip').forEach(c=>{
  c.onclick = ()=>{
    document.querySelectorAll('#chipCarga .chip').forEach(x=>x.classList.remove('on'));
    c.classList.add('on');
    document.getElementById('chipCarga').classList.remove('invalid');
  };
});
document.querySelectorAll('#chipStream .chip').forEach(c=>{
  c.onclick = ()=> c.classList.toggle('on');
});
document.querySelectorAll('#chipTipo .chip').forEach(c=>{
  c.onclick = ()=>{
    document.querySelectorAll('#chipTipo .chip').forEach(x=>x.classList.remove('on'));
    c.classList.add('on');
    updateTipoDependentUI(c.dataset.v);
  };
});

document.querySelectorAll('.chip-group').forEach(g=> new MutationObserver(()=> g.querySelectorAll('.chip').forEach(c=> c.setAttribute('aria-pressed', c.classList.contains('on')))).observe(g, { subtree:true, attributes:true, attributeFilter:['class'] }));

function updateTipoDependentUI(tipo){
  const isFilme = tipo === "Filme";
  document.getElementById('fieldTemporadaEpisodio').style.display = isFilme ? "none" : "";
  document.getElementById('optAguardando').style.display = isFilme ? "none" : "";
  const statusSel = document.getElementById('fStatus');
  if(isFilme && statusSel.value === "Aguardando Nova Temporada"){ statusSel.value = "Concluída"; }
}

/* ---------- backup manual (exportar / importar) ---------- */
document.getElementById('btnExport').onclick = ()=>{
  acctMenu.classList.remove('open');
  const backup = {
    geradoEm: new Date().toISOString(),
    shows: shows,
    lists: lists
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dieville-watches-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Backup baixado (${shows.length} títulos, ${lists.length} listas)`);
};

document.getElementById('btnImportTrigger').onclick = ()=>{
  acctMenu.classList.remove('open');
  document.getElementById('fImportFile').click();
};

document.getElementById('btnFirstImport').onclick = ()=> document.getElementById('fImportFile').click();
document.getElementById('btnSeedCatalog').onclick = seedCatalog;

document.getElementById('fImportFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ev=>{
    let backup;
    try{ backup = JSON.parse(ev.target.result); }catch(err){ showToast("Não consegui ler esse arquivo de backup"); return; }
    if(!backup.shows || !Array.isArray(backup.shows)){ showToast("Arquivo de backup inválido"); return; }
    await importBackup(backup);
  };
  reader.readAsText(file);
  e.target.value = "";
});

// Mescla o backup no banco: título que já existe é atualizado, título novo é criado.
// Capas antigas (embutidas no arquivo) sobem para o Storage automaticamente.
async function importBackup(backup){
  showToast("Importando, pode levar alguns segundos…");
  const idMap = {};
  const existentes = new Map(shows.map(s=>[norm(s.titulo), s]));
  let falhas = 0;
  for(const item of backup.shows){
    if(!item.titulo) continue;
    let imagem = item.imagem || null, imagemPath = item.imagemPath || null;
    if(imagem && imagem.startsWith('data:')){
      try{ const up = await uploadCover(imagem); imagem = up.url; imagemPath = up.path; }
      catch(err){ console.error(err); imagem = null; imagemPath = null; }
    }
    const row = toRow({ ...item, imagem, imagemPath });
    const ex = existentes.get(norm(item.titulo));
    const q = ex ? sb.from('titles').update(row).eq('id', ex.id) : sb.from('titles').insert(row);
    const { data, error } = await q.select().single();
    if(error){ console.error(error); falhas++; continue; }
    idMap[item.id] = data.id;
  }
  for(const l of (backup.lists || [])){
    const ids = (l.showIds || []).map(x=>idMap[x]).filter(Boolean);
    const ex = lists.find(x=>norm(x.nome) === norm(l.nome));
    if(ex){
      const uniao = [...new Set([...ex.showIds, ...ids])];
      await sb.from('lists').update({ show_ids: uniao }).eq('id', ex.id);
    }else{
      await sb.from('lists').insert({ nome: l.nome, show_ids: ids });
    }
  }
  await Promise.all([loadShows(), loadLists()]);
  render();
  showToast(falhas ? `Backup importado com ${falhas} falha(s)` : `Backup importado (${shows.length} títulos)`);
}

// opts: { acao: "Texto", onAcao: fn, ms: 5000 }. Mensagens de erro ganham "Avisar o Dieville" quando dá para enviar feedback.
let toastTimer = null;
function showToast(msg, opts = {}){
  const t = document.getElementById('toast');
  const ehErro = /^(Não consegui|Erro)/.test(msg);
  if(!opts.acao && ehErro && typeof abrirFeedback === "function" && profile?.status === "aprovado" && document.body.dataset.mode === "app"){
    opts = { acao: "Avisar o Dieville", onAcao: ()=> abrirFeedback({ tipo: "erro", texto: `Apareceu a mensagem: "${msg}"` }), ms: 6000 };
  }
  t.innerHTML = "";
  t.appendChild(document.createTextNode(msg));
  if(opts.acao){
    const b = document.createElement('button');
    b.className = "toast-act"; b.type = "button"; b.textContent = opts.acao;
    b.onclick = ()=>{ t.classList.remove('show', 'has-act'); opts.onAcao && opts.onAcao(); };
    t.appendChild(b);
    t.classList.add('has-act');
  }else{
    t.classList.remove('has-act');
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show', 'has-act'), opts.ms || (opts.acao ? 5000 : 1800));
}

document.getElementById('btnSave').onclick = async ()=>{
  const titulo = document.getElementById('fTitulo').value.trim();
  if(!titulo){ showToast("Dê um título antes de salvar"); document.getElementById('fTitulo').focus(); return; }
  if(!document.querySelector('#chipCarga .chip.on')){
    const g = document.getElementById('chipCarga'); g.classList.add('invalid');
    showToast("Escolha a carga cognitiva, ela alimenta o filtro de energia");
    g.querySelector('.chip').focus(); return;
  }

  if(!forceDup){
    const dup = findDup(titulo, pendingTmdb, currentId);
    if(dup){ showDup(dup); return; }
  }

  const cargaChip = document.querySelector('#chipCarga .chip.on');
  const tipoChip = document.querySelector('#chipTipo .chip.on');
  const streams = Array.from(document.querySelectorAll('#chipStream .chip.on')).map(c=>c.dataset.v);

  const data = {
    titulo,
    genero: document.getElementById('fGenero').value.trim(),
    vibe: document.getElementById('fVibe').value.trim(),
    resumo: document.getElementById('fResumo').value.trim(),
    status: document.getElementById('fStatus').value,
    tipo: tipoChip ? tipoChip.dataset.v : "Série",
    carga: cargaChip ? cargaChip.dataset.v : "",
    streaming: streams,
    duracao: document.getElementById('fDuracao').value.trim(),
    temporada: (tipoChip && tipoChip.dataset.v === "Filme") ? null : (document.getElementById('fTemporada').value ? Number(document.getElementById('fTemporada').value) : null),
    episodio: (tipoChip && tipoChip.dataset.v === "Filme") ? null : (document.getElementById('fEpisodio').value ? Number(document.getElementById('fEpisodio').value) : null),
    imagem: pendingImage,
    indicadoPor: document.getElementById('fIndicadoPor').value.trim(),
    nota: document.getElementById('fNota').value !== "" ? Math.max(0, Math.min(10, Number(document.getElementById('fNota').value))) : null,
    tmdbId: (forceDup && !currentId) ? null : (pendingTmdb?.id ?? null),
    tmdbMedia: (forceDup && !currentId) ? null : (pendingTmdb?.media ?? null),
    ano: pendingAno ?? null,
  };

  const btnSave = document.getElementById('btnSave');
  btnSave.disabled = true; btnSave.textContent = "Salvando…";
  try{
    const old = currentId ? shows.find(s=>s.id===currentId) : null;
    let imagem = old?.imagem || null, imagemPath = old?.imagemPath || null;
    if(pendingImage && pendingImage.startsWith('data:')){
      const up = await uploadCover(pendingImage);
      if(old?.imagemPath) removeCover(old.imagemPath);
      imagem = up.url; imagemPath = up.path;
    }else if(pendingImage && pendingImage !== old?.imagem){
      if(old?.imagemPath) removeCover(old.imagemPath);
      imagem = pendingImage; imagemPath = null;
    }else if(!pendingImage){
      if(old?.imagemPath) removeCover(old.imagemPath);
      imagem = null; imagemPath = null;
    }
    const row = toRow({ ...data, imagem, imagemPath });
    if(currentId){
      const { data: upd, error } = await sb.from('titles').update(row).eq('id', currentId).select().single();
      if(error) throw error;
      shows = shows.map(s => s.id===currentId ? fromRow(upd) : s);
      showToast("Atualizado");
    }else{
      const { data: ins, error } = await sb.from('titles').insert(row).select().single();
      if(error) throw error;
      shows.push(fromRow(ins));
      shows.sort((a,b)=> a.titulo.localeCompare(b.titulo));
      showToast("Adicionado");
    }
    render();
    closeModal();
  }catch(err){
    console.error(err);
    showToast(err.code === "23505" ? "Esse título já está no seu catálogo" : "Não consegui salvar: " + (err.message || "erro de conexão"));
  }finally{
    btnSave.disabled = false; btnSave.textContent = "Salvar";
  }
};

document.getElementById('btnDelete').onclick = async ()=>{
  if(!currentId) return;
  const alvo = shows.find(s=>s.id===currentId);
  if(!(await confirmar({ titulo:`Remover "${alvo?.titulo}"?`, texto:"Ele sai do seu catálogo e das suas listas.", botao:"Remover", perigo:true }))) return;
  const { error } = await sb.from('titles').delete().eq('id', currentId);
  if(error){ showToast("Não consegui remover"); return; }
  if(alvo?.imagemPath) removeCover(alvo.imagemPath);
  for(const l of lists.filter(l=>l.showIds.includes(currentId))){
    l.showIds = l.showIds.filter(x=>x!==currentId);
    await saveListIds(l);
  }
  shows = shows.filter(s=>s.id!==currentId);
  render();
  closeModal();
  showToast("Removido");
};

/* ---------- foto de perfil (fica em capas/<seu id>/avatar.jpg) ---------- */
function avatarPublicUrl(uid){ return sb.storage.from('capas').getPublicUrl(`${uid}/avatar.jpg`).data.publicUrl; }
function loadAvatar(){
  const btn = document.getElementById('btnAccount');
  const img = new Image();
  // 1º a foto que a pessoa enviou; se não houver, a foto da conta Google
  const google = profile?.avatar_url || currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture || null;
  const usar = src=>{ btn.style.backgroundImage = `url('${src}')`; btn.classList.add('has-photo'); };
  img.onload = ()=> usar(img.src);
  img.onerror = ()=>{ if(!google) return; const g = new Image(); g.referrerPolicy = "no-referrer"; g.onload = ()=> usar(google); g.src = google; };
  img.src = avatarPublicUrl(currentUser.id) + `?t=${Date.now()}`;
}
document.getElementById('btnAvatar').onclick = ()=>{ acctMenu.classList.remove('open'); document.getElementById('fAvatarFile').click(); };
document.getElementById('fAvatarFile').addEventListener('change', async e=>{
  const file = e.target.files[0]; e.target.value = "";
  if(!file) return;
  try{
    const dataUrl = await resizeImage(file);
    const blob = await (await fetch(dataUrl)).blob();
    const { error } = await sb.storage.from('capas').upload(`${currentUser.id}/avatar.jpg`, blob, { contentType:'image/jpeg', upsert:true, cacheControl:'60' });
    if(error) throw error;
    loadAvatar();
    showToast("Foto atualizada");
  }catch(err){ console.error(err); showToast("Não consegui salvar a foto: " + (err.message || "erro")); }
});

/* ---------- TMDB + OMDb: busca, autopreenchimento e capas ---------- */
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_THUMB = "https://image.tmdb.org/t/p/w154";
function hideTmdb(){ const r = document.getElementById('tmdbResults'); r.classList.remove('show'); r.innerHTML = ""; }

async function tmdbGet(path, params = {}){
  const bearer = TMDB_KEY.length > 60;
  const qs = new URLSearchParams({ language:"pt-BR", ...params });
  if(!bearer) qs.set('api_key', TMDB_KEY);
  const res = await fetch(`https://api.themoviedb.org/3/${path}?${qs}`, bearer ? { headers:{ Authorization:`Bearer ${TMDB_KEY}` } } : {});
  if(!res.ok) throw new Error(res.status === 401 ? "Chave do TMDB inválida" : "TMDB respondeu " + res.status);
  return res.json();
}
// variações do nome: "Origem (From)" tenta "Origem (From)", "Origem" e "From"
function queryVariants(titulo){
  const base = titulo.replace(/\s*\((anime|live action|\d{4})\)\s*/gi, " ").trim();
  const v = [base];
  const m = base.match(/^(.*?)\s*\((.+)\)\s*$/);
  if(m){ v.push(m[1].trim(), m[2].trim()); }
  return [...new Set(v.filter(Boolean))];
}
async function tmdbFind(titulo, tipo){
  const rota = tipo === "Filme" ? "search/movie" : (tipo === "Série" || tipo === "Anime") ? "search/tv" : "search/multi";
  for(const q of queryVariants(titulo)){
    const json = await tmdbGet(rota, { query:q, include_adult:"false" });
    const res = (json.results || [])
      .map(r=> ({ ...r, media: r.media_type || (rota === "search/movie" ? "movie" : "tv") }))
      .filter(r=> r.media === "movie" || r.media === "tv")
      .slice(0, 8)
      .map(r=>({
        id: r.id, media: r.media,
        nome: r.title || r.name,
        original: r.original_title || r.original_name,
        ano: (r.release_date || r.first_air_date || "").slice(0,4),
        poster: r.poster_path ? TMDB_IMG + r.poster_path : null,
        thumb: r.poster_path ? TMDB_THUMB + r.poster_path : null,
        anime: (r.genre_ids || []).includes(16) && (r.origin_country || []).includes("JP")
      }));
    if(res.length) return res;
  }
  return [];
}

// a ordem importa: "HBO Max Amazon Channel" é Max, não Prime Video, então Amazon fica por último
const PROVEDORES = [["netflix","Netflix"],["hbo","Max"],["max","Max"],["disney","Disney+"],["globoplay","Globoplay"],["apple tv","Apple TV+"],["star+","Star+"],["star plus","Star+"],["paramount","Paramount+"],["crunchyroll","Crunchyroll"],["prime video","Prime Video"],["amazon","Prime Video"]];
const GENERO_PT = { "Sci-Fi & Fantasy":"Ficção científica / Fantasia", "Action & Adventure":"Ação / Aventura", "Ação e Aventura":"Ação / Aventura", "War & Politics":"Guerra / Política", "Guerra e Política":"Guerra / Política", "Thriller":"Suspense", "Ficção científica":"Ficção científica" };

async function tmdbDetails(item){
  const d = await tmdbGet(`${item.media}/${item.id}`, { append_to_response:"external_ids,watch/providers" });
  let resumo = d.overview || "";
  if(!resumo){ try{ resumo = (await tmdbGet(`${item.media}/${item.id}`, { language:"en-US" })).overview || ""; }catch(e){} }
  const generosRaw = (d.genres || []).map(g=> g.name);
  const generos = [...new Set(generosRaw.flatMap(g=> (GENERO_PT[g] || g).split(" / ")))].slice(0, 2);
  const minutos = item.media === "movie" ? d.runtime : ((d.episode_run_time || [])[0] || d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime || null);
  const temporadas = d.number_of_seasons || null;
  const br = d["watch/providers"]?.results?.BR?.flatrate || [];
  const streaming = [...new Set(br.map(p=> { const n = p.provider_name.toLowerCase().replace(/\s+(amazon|apple tv)\s+channel.*$/, ""); return (PROVEDORES.find(([k])=> n.includes(k)) || [])[1]; }).filter(Boolean))];
  const paises = d.origin_country || (d.production_countries || []).map(c=> c.iso_3166_1);
  const anime = item.media === "tv" && (d.genres || []).some(g=> g.id === 16) && paises.includes("JP");
  let nota = null, notaSrc = null;
  const imdbId = d.imdb_id || d.external_ids?.imdb_id;
  if(OMDB_KEY && imdbId){
    try{
      const o = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${encodeURIComponent(OMDB_KEY)}`).then(r=> r.json());
      if(o.imdbRating && o.imdbRating !== "N/A"){ nota = Number(o.imdbRating); notaSrc = "IMDB"; }
    }catch(e){ console.error(e); }
  }
  if(nota === null && d.vote_average && d.vote_count > 20){ nota = Math.round(d.vote_average * 10) / 10; notaSrc = "TMDB"; }
  return {
    titulo: d.title || d.name || item.nome,
    tipo: item.media === "movie" ? "Filme" : (anime ? "Anime" : "Série"),
    genero: generos.join(" / "),
    resumo,
    duracao: minutos ? `~${minutos} min${temporadas ? ` · ${plural(temporadas, "temporada", "temporadas")}` : ""}` : (temporadas ? plural(temporadas, "temporada", "temporadas") : ""),
    minutos, temporadas, streaming,
    poster: d.poster_path ? TMDB_IMG + d.poster_path : item.poster,
    nota, notaSrc,
    ano: Number((d.release_date || d.first_air_date || "").slice(0,4)) || null,
    tmdb: { id: item.id, media: item.media }
  };
}

/* ---------- sugestões de carga e vibe, aprendidas com o seu catálogo ---------- */
const semAcento = t => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const GENERO_REGRAS = [
  ["scifi", /sci|ficcao/], ["fantasia", /fantas/], ["suspense", /thriller|suspense|espionag/], ["historico", /histor|epoca/],
  ["guerra", /guerra|war\b/], ["politico", /politic/], ["acao", /acao|action/], ["aventura", /aventura|adventure/],
  ["animacao", /anima/], ["comedia", /comedia|comedy|sitcom/], ["terror", /terror|horror/], ["misterio", /misterio|investiga|whodunit/],
  ["crime", /crime|policial|mafia/], ["drama", /drama/], ["romance", /romance|romant/], ["familia", /familia|kids|infantil/],
  ["documentario", /document/], ["faroeste", /faroeste|western/], ["superheroi", /super-?heroi|marvel/], ["psicologico", /psicolog/]
];
function generoTokens(g){ const t = semAcento(g); return new Set(GENERO_REGRAS.filter(([, re])=> re.test(t)).map(([k])=> k)); }

function sugerir(genero, tipo, minutos, temporadas, ignorarId){
  const alvo = generoTokens(genero);
  const vibe = {}, carga = { baixa:0, media:0, alta:0 };
  let peso = 0;
  for(const s of shows){
    if(s.id === ignorarId) continue;
    const comum = [...generoTokens(s.genero)].filter(t=> alvo.has(t)).length;
    if(!comum) continue;
    const w = comum + ((s.tipo || "Série") === tipo ? 0.5 : 0);
    (s.vibe || "").split(",").map(v=> v.trim()).filter(Boolean).forEach(v=>{
      const k = semAcento(v);
      vibe[k] = vibe[k] || { label:v, score:0 };
      vibe[k].score += w;
    });
    const ck = cargaKey(s.carga);
    if(ck){ carga[ck] += w; peso += w; }
  }
  // carga: o que o seu catálogo diz para esses gêneros, ajustado pela duração
  // o catálogo pesa só metade: antes ele puxava quase tudo para "Pede foco" e se reforçava
  const neutro = { baixa:.34, media:.33, alta:.33 };
  const p = {};
  for(const k of ["baixa","media","alta"]) p[k] = (peso ? .5 * (carga[k] / peso) : 0) + (peso ? .5 : 1) * neutro[k];
  if(minutos){
    if(minutos <= 30){ p.baixa += .3; p.alta -= .15; }
    else if(minutos <= 45){ p.media += .1; }
    else if(minutos >= 55){ p.alta += .2; p.baixa -= .1; }
    if(tipo === "Filme" && minutos >= 140) p.alta += .15;
  }
  if((alvo.has("comedia") || alvo.has("animacao") || alvo.has("familia")) && (!minutos || minutos <= 35)) p.baixa += .2;
  if(tipo === "Anime" && alvo.has("acao") && (!minutos || minutos <= 30)) p.baixa += .1;
  if(alvo.has("psicologico") || alvo.has("misterio") || alvo.has("politico")) p.alta += .1;
  if(temporadas && temporadas >= 5) p.alta += .05;
  const ordem = Object.entries(p).sort((a,b)=> b[1] - a[1]);
  let escolha = ordem[0][0];
  const cargaV = { baixa:"Baixa (Fácil digestão)", media:"Média (Atenção moderada)", alta:"Alta (Foco total)" }[escolha];
  const vibeV = Object.values(vibe).sort((a,b)=> b.score - a.score).slice(0, 2).map(v=> v.label).join(", ");
  return { carga: cargaV, vibe: vibeV };
}

/* ---------- duplicados ---------- */
let pendingAno = null;    // ano de lançamento vindo da busca
let pendingTmdb = null;   // { id, media } do título escolhido na busca
let forceDup = false;
function findDup(titulo, tmdb, ignorarId){
  return shows.find(s=> s.id !== ignorarId && (
    (tmdb && s.tmdbId && s.tmdbId === tmdb.id && s.tmdbMedia === tmdb.media) || norm(s.titulo) === norm(titulo)));
}
function showDup(d){
  const bar = document.getElementById('dupBar');
  if(!d){ bar.style.display = "none"; bar.innerHTML = ""; return; }
  const prog = (d.tipo !== "Filme" && (d.temporada || d.episodio)) ? `, T${d.temporada||0} · E${d.episodio||0}` : "";
  bar.innerHTML = `<span class="dp" style="background-image:${d.imagem ? `url('${esc(d.imagem)}')` : posterGradient(d.titulo)}"></span>
    <div><b>Você já tem "${esc(d.titulo)}"</b><br>Está como "${statusLabel(d.status)}"${prog}.
    <div class="acts"><button type="button" class="btn btn-primary" id="dupOpen">Abrir o que já existe</button><button type="button" class="btn btn-ghost" id="dupForce">Adicionar mesmo assim</button></div></div>`;
  bar.style.display = "flex";
  document.getElementById('dupOpen').onclick = ()=>{ closeModal(); openModal(d); };
  document.getElementById('dupForce').onclick = ()=>{ forceDup = true; showDup(null); document.getElementById('btnSave').click(); };
  overlay.querySelector('.modal').scrollTo({ top:0, behavior:"smooth" });
}

/* ---------- preencher o formulário com etiqueta de origem ---------- */
let autoSnapshot = null;
function fieldOf(el){ return el.closest('.field'); }
function markSrc(el, src){
  const f = fieldOf(el); if(!f) return;
  f.querySelectorAll('.src').forEach(x=> x.remove());
  const lab = f.querySelector('label'); if(!lab || !src) return;
  const cls = src === "IMDB" ? "src-imdb" : src === "Sugestão" ? "src-sug" : "src-tmdb";
  if(src === "TMDB") src = "✨ Auto";
  lab.insertAdjacentHTML('beforeend', ` <span class="src ${cls}">${src}</span>`);
}
function clearSrc(){ document.querySelectorAll('#overlay .src').forEach(x=> x.remove()); document.getElementById('autoBar').style.display = "none"; autoSnapshot = null; }
document.getElementById('overlay').addEventListener('input', e=>{ const f = fieldOf(e.target); if(f) f.querySelectorAll('.src').forEach(x=> x.remove()); });
document.getElementById('overlay').addEventListener('click', e=>{ const c = e.target.closest('.chip'); if(c){ const f = fieldOf(c); if(f) f.querySelectorAll('.src').forEach(x=> x.remove()); } });

function snapshotForm(){
  const ids = ['fTitulo','fGenero','fVibe','fResumo','fDuracao','fNota','fStatus'];
  return {
    vals: Object.fromEntries(ids.map(id=> [id, document.getElementById(id).value])),
    chips: Object.fromEntries(['chipTipo','chipCarga','chipStream'].map(g=> [g, [...document.querySelectorAll(`#${g} .chip.on`)].map(c=> c.dataset.v)])),
    img: pendingImage
  };
}
function restoreForm(snap){
  Object.entries(snap.vals).forEach(([id, v])=> document.getElementById(id).value = v);
  Object.entries(snap.chips).forEach(([g, on])=> document.querySelectorAll(`#${g} .chip`).forEach(c=> c.classList.toggle('on', on.includes(c.dataset.v))));
  pendingImage = snap.img; setCoverPreview(pendingImage);
  updateTipoDependentUI(snap.chips.chipTipo[0] || "Série");
}
document.getElementById('btnUndoAuto').onclick = ()=>{ if(autoSnapshot) restoreForm(autoSnapshot); clearSrc(); showToast("Preenchimento desfeito"); };

function setChips(group, values){ document.querySelectorAll(`#${group} .chip`).forEach(c=> c.classList.toggle('on', values.includes(c.dataset.v))); }

function aplicarDados(d, soVazios){
  autoSnapshot = snapshotForm();
  if(d.tmdb) pendingTmdb = d.tmdb;
  if(d.ano) pendingAno = d.ano;
  let n = 0;
  const $ = id => document.getElementById(id);
  const put = (id, v, src)=>{ const el = $(id); if(v === null || v === undefined || v === "") return; if(soVazios && el.value.trim()) return; el.value = v; markSrc(el, src); n++; };
  if(!soVazios) put('fTitulo', d.titulo, "TMDB");
  if(!soVazios || !document.querySelector('#chipTipo .chip.on')){ setChips('chipTipo', [d.tipo]); updateTipoDependentUI(d.tipo); markSrc($('chipTipo'), "TMDB"); n++; }
  put('fGenero', d.genero, "TMDB");
  put('fResumo', d.resumo, "TMDB");
  put('fDuracao', d.duracao, "TMDB");
  if(d.nota !== null) put('fNota', d.nota, d.notaSrc);
  const streamsAtuais = [...document.querySelectorAll('#chipStream .chip.on')].map(c=> c.dataset.v);
  const streamVazio = !streamsAtuais.length || (streamsAtuais.length === 1 && streamsAtuais[0] === "Stremio");
  if(d.streaming.length && (!soVazios || streamVazio)){ setChips('chipStream', d.streaming); markSrc($('chipStream'), "TMDB"); n++; }
  else if(!d.streaming.length && !streamsAtuais.length){ setChips('chipStream', ["Stremio"]); }
  if(d.poster && (!soVazios || !pendingImage)){ pendingImage = d.poster; setCoverPreview(pendingImage, true); markSrc($('dropzone'), "TMDB"); n++; }
  const sug = sugerir(d.genero || $('fGenero').value, d.tipo, d.minutos, d.temporadas, currentId);
  if(!soVazios || !$('fVibe').value.trim()){ if(sug.vibe){ $('fVibe').value = sug.vibe; markSrc($('fVibe'), "Sugestão"); n++; } }
  if(!soVazios){ setChips('chipCarga', [sug.carga]); markSrc($('chipCarga'), "Sugestão"); n++; }
  const bar = $('autoBar');
  $('autoBarTxt').textContent = n ? `✨ ${plural(n, "campo preenchido", "campos preenchidos")} automaticamente. Confira e salve.` : "Nenhum campo vazio para completar.";
  bar.style.display = "flex";
}

function renderResults(container, results, onPick, avisarExistente){
  const ja = r => avisarExistente ? shows.find(s=> (s.tmdbId === r.id && s.tmdbMedia === r.media) || norm(s.titulo) === norm(r.nome) || norm(s.titulo) === norm(r.original)) : null;
  container.innerHTML = results.map((r, i)=> { const e = ja(r); return `<button type="button" class="lk" data-i="${i}">${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy">` : `<span class="noimg"></span>`}<span><b>${esc(r.nome)}</b><small>${r.anime ? "Anime" : r.media === "movie" ? "Filme" : "Série"}${r.ano ? ` · ${r.ano}` : ""}${r.original && r.original !== r.nome ? ` · ${esc(r.original)}` : ""}</small>${e ? `<span class="ja">✓ Já está no seu catálogo, toque para abrir</span>` : ""}</span></button>`; }).join("");
  container.querySelectorAll('.lk').forEach(b=> b.onclick = ()=>{
    const r = results[+b.dataset.i]; const e = ja(r);
    if(e){ closeModal(); openModal(e); return; }
    onPick(r);
  });
}

/* passo 1 do novo título: buscar pelo nome */
function showLookup(on){
  document.getElementById('lookupStep').style.display = on ? "block" : "none";
  document.getElementById('formBody').style.display = on ? "none" : "block";
  document.querySelector('#overlay .modal-actions').style.display = on ? "none" : "flex";
}
let lookupTimer = null;
async function runLookup(){
  const q = document.getElementById('lookupQ').value.trim();
  const box = document.getElementById('lookupResults');
  if(q.length < 2){ box.innerHTML = ""; return; }
  box.innerHTML = `<div class="note">Buscando…</div>`;
  const tipo = document.querySelector('#lookupTipo .chip.on')?.dataset.v || "";
  try{
    const res = await tmdbFind(q, tipo);
    if(document.getElementById('lookupQ').value.trim() !== q) return;
    const filtrados = tipo === "Anime" ? res.filter(r=> r.anime).concat(res.filter(r=> !r.anime)) : res;
    if(!filtrados.length){ box.innerHTML = `<div class="note">Nada encontrado. Tente o nome original, em inglês, ou preencha manualmente.</div>`; return; }
    renderResults(box, filtrados, async item=>{
      box.innerHTML = `<div class="note">Carregando dados de "${esc(item.nome)}"…</div>`;
      try{
        const d = await tmdbDetails(item);
        showLookup(false);
        aplicarDados(d, false);
        document.getElementById('fTitulo').focus();
      }catch(err){ box.innerHTML = `<div class="note">Não consegui carregar: ${err.message}</div>`; }
    }, true);
  }catch(err){ box.innerHTML = `<div class="note">Não consegui buscar: ${err.message}</div>`; }
}
document.getElementById('lookupQ').addEventListener('input', e=>{ document.getElementById('btnClearLookup').classList.toggle('show', !!e.target.value); clearTimeout(lookupTimer); lookupTimer = setTimeout(runLookup, 350); });
document.getElementById('btnClearLookup').onclick = ()=>{ const q = document.getElementById('lookupQ'); q.value = ""; document.getElementById('btnClearLookup').classList.remove('show'); document.getElementById('lookupResults').innerHTML = ""; q.focus(); };
document.querySelectorAll('#lookupTipo .chip').forEach(c=> c.addEventListener('click', ()=>{ document.querySelectorAll('#lookupTipo .chip').forEach(x=> x.classList.toggle('on', x === c)); runLookup(); }));
document.getElementById('btnManual').onclick = ()=>{
  const q = document.getElementById('lookupQ').value.trim();
  showLookup(false);
  if(q) document.getElementById('fTitulo').value = q;
  document.getElementById('fTitulo').focus();
};

/* editar: completar campos vazios */
document.getElementById('btnCompleteTmdb').onclick = async ()=>{
  const box = document.getElementById('completeResults');
  box.classList.add('show');
  if(!TMDB_KEY){ box.innerHTML = `<div class="tmdb-note">A busca automática não está configurada (falta a chave TMDB_KEY no arquivo).</div>`; return; }
  const titulo = document.getElementById('fTitulo').value.trim();
  if(!titulo){ box.innerHTML = `<div class="tmdb-note">Preencha o título primeiro.</div>`; return; }
  box.innerHTML = `<div class="tmdb-note">✨ Buscando…</div>`;
  const tipo = document.querySelector('#chipTipo .chip.on')?.dataset.v || "";
  const fechar = ()=>{ box.classList.remove('show'); box.innerHTML = ""; };
  try{
    const res = await tmdbFind(titulo, tipo);
    if(!res.length){ box.innerHTML = `<div class="tmdb-note">Não encontrei "${esc(titulo)}". Tente o nome original, em inglês.</div>`; return; }
    box.innerHTML = `<div class="tmdb-note" style="display:flex">Qual destes é o título certo?<button type="button" class="linkbtn" style="margin-left:auto">Cancelar</button></div><div class="lookup-res" style="grid-column:1/-1"></div>`;
    box.querySelector('.tmdb-note .linkbtn').onclick = fechar;
    renderResults(box.querySelector('.lookup-res'), res, async item=>{
      box.innerHTML = `<div class="tmdb-note">✨ Completando…</div>`;
      try{
        const d = await tmdbDetails(item);
        fechar();
        aplicarDados(d, true);
        overlay.querySelector('.modal').scrollTo({ top:0, behavior:"smooth" });
      }catch(err){ box.innerHTML = `<div class="tmdb-note">Não consegui completar: ${err.message}</div>`; }
    });
  }catch(err){ box.innerHTML = `<div class="tmdb-note">Não consegui buscar: ${err.message}</div>`; }
};

/* só a capa */
document.getElementById('btnFindCover').onclick = async ()=>{
  const box = document.getElementById('tmdbResults');
  const titulo = document.getElementById('fTitulo').value.trim();
  box.classList.add('show');
  if(!TMDB_KEY){ box.innerHTML = `<div class="tmdb-note">A busca automática não está configurada (falta a chave TMDB_KEY no arquivo).</div>`; return; }
  if(!titulo){ box.innerHTML = `<div class="tmdb-note">Preencha o título primeiro.</div>`; return; }
  box.innerHTML = `<div class="tmdb-note">Buscando…</div>`;
  const tipo = document.querySelector('#chipTipo .chip.on')?.dataset.v || "";
  try{
    const res = (await tmdbFind(titulo, tipo)).filter(r=> r.poster);
    if(!res.length){ box.innerHTML = `<div class="tmdb-note">Nada encontrado para "${esc(titulo)}". Tente o nome original, em inglês.</div>`; return; }
    box.innerHTML = `<div class="tmdb-note">Escolha a capa certa:</div>` + res.map((r,i)=>`<button type="button" data-i="${i}"><img src="${esc(r.thumb)}" alt="" loading="lazy"><span>${esc(r.nome)}${r.ano ? ` (${esc(r.ano)})` : ""}</span></button>`).join("");
    box.querySelectorAll('button[data-i]').forEach(b=> b.onclick = ()=>{
      pendingImage = res[+b.dataset.i].poster;
      setCoverPreview(pendingImage, true);
      hideTmdb();
    });
  }catch(err){ box.innerHTML = `<div class="tmdb-note">Não consegui buscar: ${err.message}</div>`; }
};

/* em lote: completa só o que está vazio no catálogo inteiro */
document.getElementById('btnBulkCovers').onclick = async ()=>{
  acctMenu.classList.remove('open');
  if(!TMDB_KEY){ showToast("A busca automática não está configurada"); return; }
  const precisa = s => !s.imagem || !s.resumo || !s.genero || !s.duracao || s.nota === null || !s.vibe || !(s.streaming || []).some(x=> x !== "Stremio");
  const alvo = shows.filter(precisa);
  if(!alvo.length){ showToast("Seu catálogo já está completo"); return; }
  if(!(await confirmar({ titulo:`Completar dados de ${plural(alvo.length, "título", "títulos")}?`, texto:`Só preencho campos vazios (capa, resumo, gênero, duração, nota, onde assistir e vibe sugerida). Nada que você escreveu é alterado. Uso o primeiro resultado da busca, então vale conferir depois.`, botao:"Completar" }))) return;
  let ok = 0; const semResultado = [];
  for(const [i, s] of alvo.entries()){
    showToast(`Completando… ${i + 1}/${alvo.length}`);
    try{
      const item = (await tmdbFind(s.titulo, s.tipo))[0];
      if(!item){ semResultado.push(s.titulo); continue; }
      const d = await tmdbDetails(item);
      const up = {};
      if(!s.tmdbId && !shows.some(x=> x.tmdbId === item.id && x.tmdbMedia === item.media)){ up.tmdb_id = item.id; up.tmdb_media = item.media; }
      if(!s.imagem && d.poster){ up.imagem_url = d.poster; up.imagem_path = null; }
      if(!s.resumo && d.resumo) up.resumo = d.resumo;
      if(!s.genero && d.genero) up.genero = d.genero;
      if(!s.duracao && d.duracao) up.duracao = d.duracao;
      if(s.nota === null && d.nota !== null) up.nota = d.nota;
      if(!s.ano && d.ano) up.ano = d.ano;
      if(!(s.streaming || []).some(x=> x !== "Stremio") && d.streaming.length) up.streaming = d.streaming;
      if(!s.vibe){ const sug = sugerir(s.genero || d.genero, s.tipo, d.minutos, d.temporadas, s.id).vibe; if(sug) up.vibe = sug; }
      if(!Object.keys(up).length) continue;
      const { data, error } = await sb.from('titles').update(up).eq('id', s.id).select().single();
      if(error) throw error;
      Object.assign(s, fromRow(data)); ok++;
    }catch(err){ console.error(err); if(/inválida/.test(err.message)){ showToast(err.message); return; } semResultado.push(s.titulo); }
    await new Promise(r=> setTimeout(r, 150));
  }
  render();
  showToast(`${plural(ok, "título completado", "títulos completados")}${semResultado.length ? `, ${semResultado.length} sem correspondência` : ""}`);
  if(semResultado.length) console.info("Sem correspondência no TMDB:", semResultado);
  if(semResultado.length) setTimeout(()=> alert(`Não encontrei estes títulos (confira o nome ou preencha à mão):\n\n${semResultado.join("\n")}`), 2200);
};

/* ---------- acesso: perfil, convites e pedidos ---------- */
const URLP = new URLSearchParams(location.search);
const P_LISTA = URLP.get('lista');
const P_CONVITE = (URLP.get('convite') || "").toUpperCase() || null;
const P_AMIGO = (URLP.get('amigo') || "").toUpperCase() || null;
let linkPendente = null;   // link de amizade ou convite aberto por quem já tem acesso (tratado em amizades.js)
if(P_AMIGO){ try{ localStorage.setItem('dw-amigo', P_AMIGO); }catch(e){} }
let profile = null;
let perfisAtivos = true;   // falso enquanto o script de acesso não foi rodado no Supabase

async function loadProfile(){
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if(error){
    // tabela ainda não existe: mantém o funcionamento antigo (só o dono usa)
    if(/profiles|relation|schema cache/i.test(error.message || "")){ perfisAtivos = false; return { status:"aprovado", papel:"dono", nome:"" }; }
    throw error;
  }
  return data || { status:"pendente", papel:"membro", pedido_em:null };
}
function semParametros(){ history.replaceState(null, "", location.pathname); }
function voltarPara(){ return location.origin + location.pathname + location.search; }

async function entrarComGoogle(){
  const msg = document.getElementById('authMsg');
  try{ localStorage.setItem('dw-origem', JSON.stringify({ lista:P_LISTA, convite:P_CONVITE })); }catch(e){}
  const { error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: voltarPara() } });
  if(error){
    const t = /not enabled|unsupported provider/i.test(error.message) ? "O login com Google ainda não foi ativado no Supabase." : "Não consegui abrir o Google: " + error.message;
    if(msg) msg.textContent = t; showToast(t);
  }
}
document.addEventListener('click', e=>{
  if(e.target.closest('[data-google]')) entrarComGoogle();
  if(e.target.closest('[data-signout]')) sb.auth.signOut().then(()=>{ try{ localStorage.removeItem('dw-origem'); }catch(e){} location.href = location.pathname; });
});
function origemSalva(){
  let o = { lista:P_LISTA, convite:P_CONVITE };
  if(!o.lista && !o.convite){ try{ o = JSON.parse(localStorage.getItem('dw-origem') || "{}"); }catch(e){} }
  return o;
}

async function showRequest(){
  document.body.dataset.mode = "request";
  document.querySelectorAll('.who-email').forEach(x=> x.textContent = currentUser.email || "");
  const o = origemSalva();
  if(o.lista){
    const { data: l } = await sbPublico.from('lists').select('nome').eq('id', o.lista).eq('publica', true).maybeSingle();
    if(l) document.getElementById('reqIntro').textContent = `Você chegou pela lista "${l.nome}". O Dieville Watches é só para convidados: envie seu pedido e o Dieville decide.`;
  }
  if(o.convite) document.getElementById('reqIntro').textContent += " (O convite deste link já foi usado ou expirou.)";
  document.getElementById('btnSendRequest').onclick = async ()=>{
    const btn = document.getElementById('btnSendRequest');
    btn.disabled = true; btn.textContent = "Enviando…";
    const { error } = await sb.rpc('request_access', { p_lista: o.lista || null, p_codigo: o.convite || null, p_mensagem: document.getElementById('reqMsg').value.trim() });
    btn.disabled = false; btn.textContent = "Enviar pedido";
    if(error){ document.getElementById('reqError').textContent = "Não consegui enviar: " + error.message; return; }
    showPending();
  };
}
async function showPending(){
  document.body.dataset.mode = "pending";
  document.querySelectorAll('.who-email').forEach(x=> x.textContent = currentUser.email || "");
  const o = origemSalva();
  if(o.lista){
    const { data: l } = await sbPublico.from('lists').select('show_ids').eq('id', o.lista).eq('publica', true).maybeSingle();
    if(l) document.getElementById('pendingList').textContent = `Os ${plural((l.show_ids||[]).length, "título", "títulos")} da lista ficam guardados e entram no seu catálogo quando for aprovado.`;
  }
}
function showBlocked(){
  document.body.dataset.mode = "blocked";
  document.querySelectorAll('.who-email').forEach(x=> x.textContent = currentUser.email || "");
}

/* decide para onde a pessoa vai depois de entrar */
async function rotearConta(){
  profile = await loadProfile();
  if(profile.status === "aprovado"){
    if(P_CONVITE && !P_LISTA){ linkPendente = { convite: P_CONVITE }; semParametros(); }
    if(P_AMIGO){ semParametros(); }
    if(P_LISTA){ await loadPublicList(P_LISTA); return; }
    try{ localStorage.removeItem('dw-origem'); }catch(e){}
    return startApp();
  }
  if(profile.status === "pendente"){
    const o = origemSalva();
    if(o.convite){
      const { data, error } = await sb.rpc('accept_invite', { p_codigo: o.convite });
      if(!error && data?.ok && data.pendente){
        try{ localStorage.removeItem('dw-origem'); }catch(e){}
        semParametros();
        profile = await loadProfile();
        return showPending();
      }
      if(!error && data?.ok){
        try{ localStorage.removeItem('dw-origem'); }catch(e){}
        semParametros();
        profile = await loadProfile();
        await startApp();
        showToast(data.importados ? `Bem-vindo! ${plural(data.importados, "título importado", "títulos importados")} da lista` : "Bem-vindo ao Dieville Watches!");
        return;
      }
    }
    return profile.pedido_em ? showPending() : showRequest();
  }
  showBlocked();
}

/* ---------- visão pública de uma lista (?lista=ID) ---------- */
async function loadPublicList(id){
  document.body.dataset.mode = "public";
  const { data: l, error } = await sbPublico.from('lists').select('*').eq('id', id).eq('publica', true).maybeSingle();
  if(error){
    console.error(error);
    document.getElementById('pubTitle').textContent = "Não consegui abrir a lista";
    document.getElementById('pubSub').textContent = "Tente recarregar a página em alguns segundos.";
    return;
  }
  if(!l){
    document.getElementById('pubTitle').textContent = "Lista indisponível";
    document.getElementById('pubSub').textContent = "Essa lista não existe ou deixou de ser pública.";
    return;
  }
  const dono = document.getElementById('pubOwner');
  dono.src = avatarPublicUrl(l.user_id) + `?t=${Date.now()}`;
  dono.onload = ()=> dono.style.display = "block";
  let donoNome = "";
  try{ const r = await sbPublico.rpc('list_owner_name', { p_lista: id }); donoNome = r.data || ""; }catch(e){}
  if(donoNome) document.querySelector('#publicView .eyebrow').innerHTML = `<span class="dot"></span> Lista de ${donoNome}`;
  document.title = `${l.nome} · Dieville Watches`;
  document.getElementById('pubTitle').textContent = l.nome;
  const ids = l.show_ids || [];
  renderPublicCta(l, ids.length, donoNome || "Dieville");
  if(!ids.length){ document.getElementById('pubSub').textContent = "Essa lista ainda está vazia."; return; }
  const { data: rows, error: e2 } = await sbPublico.from('titles').select('*').in('id', ids);
  if(e2){ console.error(e2); document.getElementById('pubSub').textContent = "Não consegui carregar os títulos. Recarregue a página."; return; }
  const itens = (rows || []).map(fromRow).sort((a,b)=> ids.indexOf(a.id) - ids.indexOf(b.id));
  document.getElementById('pubSub').textContent = `${itens.length} ${itens.length === 1 ? "indicação" : "indicações"} pra você assistir.`;
  const grid = document.getElementById('pubGrid');
  itens.forEach(s=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = s.id;
    card.innerHTML = cardHTML(s, true);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${s.titulo}. Ver detalhes`);
    const abrirPub = e=>{ if(e.target.closest('.rx-box') || typeof abrirFicha !== 'function') return; abrirFicha(s, card, { publico:true }); };
    card.addEventListener('click', abrirPub);
    card.addEventListener('keydown', e=>{ if(e.target === card && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); abrirPub(e); } });
    grid.appendChild(card);
  });
  if(typeof aoRenderListaPublica === "function") aoRenderListaPublica(l, itens);
}

async function renderPublicCta(l, n, donoNome){
  const box = document.getElementById('pubCta');
  const gbtn = `<button class="btn btn-google" data-google>${document.querySelector('[data-google]').innerHTML}</button>`;
  // já tem conta aprovada
  if(currentUser && profile?.status === "aprovado"){
    if(l.user_id === currentUser.id){ box.innerHTML = `<b class="h">Esta é a sua lista</b><div class="row-btns"><a class="btn btn-primary" href="${location.pathname}">Abrir meu catálogo</a></div>`; }
    else{
      box.innerHTML = `<b class="h">Quer guardar estas indicações?</b><p>Adiciono ao seu catálogo os títulos que você ainda não tem.</p><div class="row-btns"><button class="btn btn-primary" id="btnImportPub">Adicionar ao meu catálogo</button><a class="btn btn-ghost" href="${location.pathname}">Abrir meu catálogo</a></div>`;
      setTimeout(()=> document.getElementById('btnImportPub').onclick = async ()=>{
        const { data, error } = await sb.rpc('import_list', { p_lista: l.id });
        if(error){ showToast("Não consegui adicionar: " + error.message); return; }
        box.innerHTML = `<b class="h">${data ? `${plural(data, "título adicionado", "títulos adicionados")} ✓` : "Você já tinha todos ✓"}</b><div class="row-btns"><a class="btn btn-primary" href="${location.pathname}">Abrir meu catálogo</a></div>`;
      });
    }
    box.style.display = "block"; return;
  }
  // com convite válido no link
  if(P_CONVITE){
    const { data: c } = await sbPublico.rpc('check_invite', { p_codigo: P_CONVITE });
    if(c && c.valido){
      box.className = "pub-cta inv";
      box.innerHTML = c.grupo
        ? `<b class="h">Você foi convidado para o Dieville Watches 🎟️</b><p>Crie sua watchlist${n ? ` e comece com ${plural(n, "título", "títulos")}` : ""}. Organize tudo pela sua energia do dia.</p><div class="row-btns">${gbtn}</div><small>Convite: ${esc(c.nome)}. Entre com o Google e peça acesso.</small>`
        : `<b class="h">${esc(c.nome)}, você foi convidado 🎟️</b><p>Crie sua watchlist e comece com ${n ? `estes ${plural(n, "título", "títulos")}` : "o pé direito"}. Organize tudo pela sua energia do dia.</p><div class="row-btns">${gbtn}</div><small>Convite de uso único.</small>`;
      box.style.display = "block"; return;
    }
  }
  // sem convite: pedir acesso
  box.className = "pub-cta";
  box.innerHTML = `<b class="h">Quer sua própria watchlist?</b><p>O Dieville Watches é só para convidados. Peça acesso e ${donoNome === "Dieville" ? "o Dieville" : "o dono"} decide.</p><div class="row-btns"><button class="btn btn-ghost" data-google>Pedir acesso</button></div>`;
  box.style.display = "block";
}

/* convite sem lista: página de boas-vindas */
async function loadInviteLanding(){
  document.body.dataset.mode = "public";
  document.querySelector('#publicView .eyebrow').innerHTML = `<span class="dot"></span> Convite`;
  const { data: c } = await sbPublico.rpc('check_invite', { p_codigo: P_CONVITE });
  const box = document.getElementById('pubCta');
  const gbtn = `<button class="btn btn-google" data-google>${document.querySelector('[data-google]').innerHTML}</button>`;
  if(c && c.valido){
    document.getElementById('pubTitle').textContent = c.grupo ? "Você foi convidado para o Dieville Watches 🎟️" : `${c.nome}, você foi convidado 🎟️`;
    document.getElementById('pubSub').textContent = "Organize séries, filmes e animes pela sua energia do dia.";
    box.className = "pub-cta inv"; box.innerHTML = `<div class="row-btns">${gbtn}</div><small>${c.grupo ? `Convite: ${esc(c.nome)}. Entre com o Google e peça acesso.` : "Convite de uso único."}</small>`;
  }else{
    document.getElementById('pubTitle').textContent = "Convite indisponível";
    document.getElementById('pubSub').textContent = "Este convite já foi usado, foi cancelado, expirou ou atingiu o limite.";
    box.className = "pub-cta"; box.innerHTML = `<div class="row-btns"><button class="btn btn-ghost" data-google>Pedir acesso</button></div>`;
  }
  box.style.display = "block";
}

/* ---------- login ---------- */
async function startApp(){
  document.body.dataset.mode = "app";
  document.body.dataset.tab = "catalogo";
  const email = currentUser?.email || "";
  document.getElementById('acctEmail').textContent = email;
  if(email) document.getElementById('btnAccount').textContent = email[0].toUpperCase();
  loadAvatar();
  const dono = !perfisAtivos || profile?.papel === "dono";
  document.getElementById('tabPessoas').style.display = (dono && perfisAtivos) ? "" : "none";
  document.getElementById('tabAmigos').style.display = perfisAtivos ? "" : "none";
  document.getElementById('btnSeedCatalog').style.display = dono ? "" : "none";
  if(!dono){
    document.querySelector('#firstRunState .display').textContent = "Bem-vindo ao Dieville Watches 👋";
    document.querySelector('#firstRunState .display + div').textContent = "Use o “+ Adicionar” para buscar seu primeiro título. É só digitar o nome.";
  }
  document.body.classList.add('loading');
  await Promise.all([loadShows(), loadLists()]);
  document.body.classList.remove('loading');
  render();
  if(dono && perfisAtivos) loadPeople();
  if(perfisAtivos){
    sb.rpc('touch_seen').then(()=>{}, ()=>{});
    setInterval(()=> sb.rpc('touch_seen').then(()=>{}, ()=>{}), 3 * 60 * 1000);
    if(typeof aoIniciarApp === "function") aoIniciarApp();
  }
}

async function doLogin(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPass').value;
  const msg = document.getElementById('authMsg');
  if(!email || !password){ msg.textContent = "Preencha e-mail e senha."; return; }
  msg.textContent = "";
  const btn = document.getElementById('btnLogin');
  btn.disabled = true; btn.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Entrar";
  if(error){
    const m = (error.message || "").toLowerCase();
    if(m.includes("email not confirmed")) msg.textContent = "Seu e-mail ainda não foi confirmado no Supabase (veja Authentication > Users).";
    else if(m.includes("invalid login credentials")) msg.textContent = "E-mail ou senha incorretos.";
    else if(m.includes("api key") || m.includes("apikey")) msg.textContent = "Chave do Supabase inválida. Confira a SUPABASE_KEY no index.html.";
    else if(m.includes("fetch") || m.includes("network")) msg.textContent = "Não consegui falar com o Supabase. Confira a SUPABASE_URL ou se o projeto está pausado.";
    else msg.textContent = "Erro do Supabase: " + error.message;
    return;
  }
  currentUser = data.user;
  rotearConta();
}
document.getElementById('btnLogin').onclick = doLogin;
document.getElementById('authPass').addEventListener('keydown', e=>{ if(e.key === 'Enter') doLogin(); });
document.getElementById('btnSignOut').onclick = async ()=>{ await sb.auth.signOut(); location.reload(); };

/* erro que volta do login (ex.: cadastro fechado, login cancelado) */
function lerErroLogin(){
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const q = new URLSearchParams(location.search);
  const codigo = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error');
  if(!codigo) return null;
  const desc = h.get('error_description') || q.get('error_description') || "";
  ['error','error_code','error_description'].forEach(k=> q.delete(k));
  const qs = q.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  if(/signup_disabled|signups not allowed/i.test(codigo + desc)) return "No momento não estamos aceitando contas novas. Fale com o Dieville.";
  if(/access_denied/i.test(codigo) && !/signup/i.test(desc)) return "O login foi cancelado. Tente de novo quando quiser.";
  return "Não foi possível entrar agora. Tente de novo em alguns minutos.";
}
const ERRO_LOGIN = lerErroLogin();

// espera todos os scripts (ui, usuarios, feedback, comunidade) carregarem antes de iniciar
async function init(){
  if(!CONFIGURADO){ document.body.dataset.mode = "setup"; return; }
  if(ERRO_LOGIN) setTimeout(()=>{
    const m = document.getElementById('authMsg');
    if(document.body.dataset.mode === "login" && m) m.textContent = ERRO_LOGIN;
    else showToast(ERRO_LOGIN, { ms: 6000 });
  }, 600);
  const { data: { session } } = await sb.auth.getSession();
  if(session){
    currentUser = session.user;
    try{ await rotearConta(); }
    catch(err){ console.error(err); if(P_LISTA) await loadPublicList(P_LISTA); else startApp(); }
    return;
  }
  if(P_LISTA){ await loadPublicList(P_LISTA); return; }
  if(P_CONVITE){ await loadInviteLanding(); return; }
  if(P_AMIGO && typeof loadAmigoLanding === "function"){ await loadAmigoLanding(P_AMIGO); return; }
  document.body.dataset.mode = "login";
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
