/* Dieville Watches: Novidades (faixa no catálogo, feed dos amigos com curtidas e comentários, novas temporadas e ano) */

let novFeed = [];          // novidades dos amigos (feed_novidades)
let novRetorno = [];       // curtidas e comentários no que é seu
let novTemporadas = [];    // novas temporadas e episódios dos seus títulos (calculado no navegador)
let novFiltro = "tudo";
let retornoVistoAntes = null;

const lerLS = (k, def)=>{ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } };
const gravarLS = (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
const hojeISO = ()=> new Date().toISOString().slice(0,10);
const diasAte = d=> Math.round((new Date(d + "T12:00:00") - new Date(hojeISO() + "T12:00:00")) / 864e5);
const dataBR = d=> d ? d.slice(8,10) + "/" + d.slice(5,7) : "";

/* ---------- frases ---------- */
function fraseNovidade(a){
  const t = `<b>${esc(a.titulo)}</b>`;
  if(a.tipo === "assistindo") return `começou a assistir ${t}`;
  if(a.tipo === "concluiu") return `terminou ${t}${Number(a.detalhe) ? ` e deu <span class="estrelas" aria-label="${a.detalhe} de 5">${"★".repeat(Number(a.detalhe))}${"☆".repeat(5 - Number(a.detalhe))}</span>` : ""}`;
  if(a.tipo === "lista") return `publicou a lista ${t}${a.detalhe ? ` · ${plural(Number(a.detalhe), "título", "títulos")}` : ""}`;
  return fraseAtividade(a);
}
function fraseRetorno(r){
  const alvo = r.atividade_tipo === "assistindo" ? `que você começou <b>${esc(r.titulo)}</b>`
    : r.atividade_tipo === "concluiu" ? `que você terminou <b>${esc(r.titulo)}</b>`
    : r.atividade_tipo === "lista" ? `sua lista <b>${esc(r.titulo)}</b>` : `sua novidade sobre <b>${esc(r.titulo)}</b>`;
  return r.tipo === "curtida" ? `❤️ <b>${esc(r.nome)}</b> curtiu ${alvo}` : `💬 <b>${esc(r.nome)}</b> em ${esc(r.titulo)}: "${esc(r.texto)}"`;
}
function capa(url, titulo){ return url ? `background-image:url('${esc(url)}')` : `background:${posterGradient(titulo || "")}`; }
function botoesNovidade(a){
  const vou = a.title_id && a.tipo !== "lista" ? `<button type="button" class="rxn" data-nv-vou="${a.id}">📌 Vou ver</button>` : "";
  const abrir = a.tipo === "lista" && a.list_id ? `<a class="rxn" href="${location.pathname}?lista=${a.list_id}">Abrir lista</a>` : "";
  return `<div class="nv-rx">${vou}${abrir}
    <button type="button" class="rxn ${a.eu_curti ? "on" : ""}" data-nv-curtir="${a.id}" aria-pressed="${a.eu_curti}" aria-label="Curtir">❤️${a.curtidas ? ` ${a.curtidas}` : ""}</button>
    <button type="button" class="rxn" data-nv-com="${a.id}" aria-label="Comentar">💬${a.comentarios ? ` ${a.comentarios}` : ""}</button></div>`;
}

/* ---------- carregar ---------- */
async function carregarNovidadesAmigos(){
  const [{ data: f }, { data: r }] = await Promise.all([sb.rpc('feed_novidades', { p_limite: 40, p_so_comentados: false }), sb.rpc('retorno_para_mim', { p_limite: 30 })]);
  novFeed = f || []; novRetorno = r || [];
}
const retornoNovo = ()=> novRetorno.filter(r=> !profile?.retorno_visto_em || r.created_at > profile.retorno_visto_em);

/* ---------- faixa no catálogo ---------- */
function itensFaixa(){
  const fechada = null; // a faixa não fecha mais: só recolhe ou expande
  const vistas = new Set(lerLS('dw-temp-vistas', []));
  const semana = new Date(Date.now() - 7 * 864e5).toISOString();
  const temps = novTemporadas.filter(t=> !vistas.has(t.chave)).map(t=> ({ k:"tv", ord: t.urg, t }));
  const am = novFeed.filter(a=> a.created_at > semana && (!fechada || a.created_at > fechada)).slice(0, 8).map(a=> ({ k:"am", ord: 10, d: a.created_at, a }));
  const ret = retornoNovo().filter(r=> !fechada || r.created_at > fechada).slice(0, 3).map(r=> ({ k:"ret", ord: 5, d: r.created_at, r }));
  const duv = Object.keys(lerLS('dw-vinc-duvida', {})).filter(id=> shows.some(x=> x.id === id && !x.tmdbId)).length;
  const vinc = duv ? [{ k:"vinc", ord: 8, n: duv }] : [];
  return [...temps, ...ret, ...vinc, ...am].sort((x, y)=> x.ord - y.ord || (y.d || "").localeCompare(x.d || ""));
}
function cartaoFaixa(it){
  if(it.k === "tv"){
    const t = it.t, s = shows.find(x=> x.id === t.id);
    return `<div class="nc tv" data-nv-ficha-propria="${t.id}" tabindex="0" role="button" aria-label="${esc(t.titulo)}: ${esc(t.etiqueta)}">
      <div class="po" style="${capa(s?.imagem, t.titulo)}"></div>
      <div class="t"><span class="ntag tv">📺 ${esc(t.etiqueta)}</span><div><b>${esc(t.titulo)}</b> ${esc(t.texto)}</div><small>${esc(t.sub)}</small>
        ${t.podeMover ? `<div class="nv-rx"><button type="button" class="rxn pri" data-nv-mover="${t.id}" data-temp="${t.temporada}">Mover para Assistindo</button></div>` : ""}</div></div>`;
  }
  if(it.k === "vinc"){
    return `<div class="nc tv" data-nv-conferir tabindex="0" role="button" aria-label="Conferir ${it.n} títulos">
      <div class="po" style="display:grid;place-items:center;font-size:22px;background:#1b2c44">✨</div>
      <div class="t"><span class="ntag tv">📺 SEUS TÍTULOS</span><div>Confere ${plural(it.n, "título", "títulos")} para ativar ano e avisos de temporada</div><small>Um toque em cada capa certa</small>
        <div class="nv-rx"><button type="button" class="rxn pri" data-nv-conferir>Conferir</button></div></div></div>`;
  }
  if(it.k === "ret"){
    const r = it.r;
    return `<div class="nc ret" data-nv-ir-com-voce tabindex="0" role="button">
      <div class="po" style="${capa(r.imagem_url, r.titulo)}"></div>
      <div class="t"><span class="ntag am">👥 PARA VOCÊ</span><div>${fraseRetorno(r)}</div><small>${tempoAtras(r.created_at)}</small></div></div>`;
  }
  const a = it.a;
  return `<div class="nc" data-nv-ficha="${a.id}" tabindex="0" role="button" aria-label="${esc(a.nome)}: novidade sobre ${esc(a.titulo)}">
    <div class="po" style="${capa(a.imagem_url, a.titulo)}"></div>
    <div class="t"><span class="ntag am">👥 ${esc((a.nome || "Amigo").split(" ")[0].toUpperCase())}</span><div>${fraseNovidade(a)}</div><small>${tempoAtras(a.created_at)}</small>${botoesNovidade(a)}</div></div>`;
}
function renderFaixa(){
  const el = document.getElementById('novFaixa');
  const itens = itensFaixa();
  if(!itens.length){ el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "";
  const d0 = itens[0];
  const dest = d0.k === "tv" ? `${d0.t.titulo} ${d0.t.selo.replace("📺 ", "")}` : d0.k === "am" ? `${(d0.a.nome || "").split(" ")[0]} ${d0.a.tipo === "concluiu" ? "terminou" : d0.a.tipo === "lista" ? "publicou uma lista" : "começou"} ${d0.a.titulo || ""}` : d0.k === "vinc" ? "confira seus títulos" : "alguém reagiu ao que é seu";
  const aberta = el.classList.contains('aberta');
  el.innerHTML = `<div class="nf-h"><div class="nf-tt"><b>Novidades <span class="nf-n">${itens.length}</span> <span class="nf-dest">· ${esc(dest)}</span></b><small class="nf-sub">Episódios novos das suas séries e o que seus amigos andam vendo</small></div><button type="button" class="linkbtn nf-toggle" id="btnNovToggle" aria-expanded="${aberta}">${aberta ? "Recolher ▴" : "Expandir ▾"}</button><button type="button" class="linkbtn" id="btnNovVerTudo">Ver tudo</button></div>
    <div class="nf-cards">${itens.slice(0, 12).map(cartaoFaixa).join("")}</div>`;
  document.getElementById('btnNovVerTudo').onclick = ()=> setTab('amigos');
  document.getElementById('btnNovToggle').onclick = ()=>{ el.classList.toggle('aberta'); gravarLS('dw-nov-aberta', el.classList.contains('aberta')); renderFaixa(); };
}

/* ---------- aba Amigos ---------- */
function itemFeedHTML(a){
  return `<div class="feed-item" data-item="${a.id}">
    <div class="fp" style="${capa(a.imagem_url, a.titulo)}" data-nv-ficha="${a.id}" role="button" tabindex="0" aria-label="Ver ${esc(a.titulo)}"></div>
    <div style="flex:1;min-width:0"><b>${esc(a.nome)}</b> ${fraseNovidade(a)}
      <div class="when">${tempoAtras(a.created_at)}${a.list_id && a.tipo !== "lista" ? ` · na lista <a href="${location.pathname}?lista=${a.list_id}">${esc(a.list_nome || "")}</a>` : ""}${a.tipo === "comentario" && a.detalhe ? ` · "${esc(a.detalhe)}"` : ""}</div>
      ${botoesNovidade(a)}
      ${(a.quem_curtiu || []).length ? `<div class="nv-quem">❤️ ${a.quem_curtiu.map(esc).join(", ")}${a.curtidas > a.quem_curtiu.length ? ` e mais ${a.curtidas - a.quem_curtiu.length}` : ""}</div>` : ""}
      <div class="nv-coms" id="coms-${a.id}" hidden></div>
    </div></div>`;
}
function renderAbaNovidades(){
  const novos = retornoNovo().length;
  document.getElementById('novChips').innerHTML = [["tudo","Tudo"],["voce","Com você"],["comentarios","Comentários"]].map(([v, t])=>
    `<button type="button" role="tab" aria-selected="${novFiltro === v}" class="chip ${novFiltro === v ? "on" : ""}" data-nv-filtro="${v}">${t}${v === "voce" && novos ? ` <span class="tab-badge">${novos}</span>` : ""}</button>`).join("");
  const ret = document.getElementById('novRetorno'), feed = document.getElementById('amigosFeed');
  const novosRet = novRetorno.filter(r=> !retornoVistoAntes || r.created_at > retornoVistoAntes);
  if(novFiltro === "voce"){
    ret.innerHTML = "";
    feed.innerHTML = novRetorno.length ? novRetorno.map(r=> `<div class="feed-item ${novosRet.includes(r) ? "novo" : ""}"><div class="fp" style="${capa(r.imagem_url, r.titulo)}"></div>
      <div>${fraseRetorno(r)}<div class="when">${tempoAtras(r.created_at)}</div></div></div>`).join("")
      : `<div class="empty-sm">Quando alguém curtir ou comentar o que você faz, aparece aqui.</div>`;
    return;
  }
  ret.innerHTML = novFiltro === "tudo" && novosRet.length ? `<div class="nv-voce">${novosRet.slice(0, 3).map(r=> `<div>${fraseRetorno(r)}</div>`).join("")}${novosRet.length > 3 ? `<button type="button" class="linkbtn" data-nv-filtro="voce">Ver tudo (${novosRet.length})</button>` : ""}</div>` : "";
  const itens = novFiltro === "comentarios" ? novFeed.filter(a=> a.comentarios > 0) : novFeed;
  feed.innerHTML = itens.length ? itens.map(itemFeedHTML).join("")
    : `<div class="empty-sm">${novFiltro === "comentarios" ? "Nenhuma conversa ainda. Comente uma novidade para começar." : amigos.some(a=> a.status === "aceita") ? "Seus amigos ainda não fizeram nada por aqui." : "Quando você tiver amigos, o que eles começarem, terminarem ou publicarem aparece aqui."}</div>`;
}

const _loadAmigosNov = loadAmigos;
loadAmigos = async function(){
  await Promise.all([_loadAmigosNov(), carregarNovidadesAmigos()]);
  if(retornoVistoAntes === null) retornoVistoAntes = profile?.retorno_visto_em || "";
  renderAbaNovidades();
  if(retornoNovo().length){
    sb.rpc('marcar_retorno_visto');
    if(profile) profile.retorno_visto_em = new Date().toISOString();
    atualizarBadgeAmigos(); renderFaixa();
  }
};
const _badgeAmigosOrig = atualizarBadgeAmigos;
atualizarBadgeAmigos = function(){
  const pedidos = amigos.filter(a=> a.status === "pendente" && a.recebido).length;
  const n = pedidos + retornoNovo().length;
  const b = document.getElementById('amigosBadge');
  b.textContent = n; b.style.display = n ? "" : "none";
};

/* ---------- comentários ---------- */
async function abrirComentarios(id, focar){
  const box = document.getElementById('coms-' + id);
  if(!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="muted" style="font-size:13px">Carregando…</div>`;
  const { data, error } = await sb.rpc('comentarios_atividade', { p_id: id });
  if(error){ box.innerHTML = ""; showToast("Não consegui carregar os comentários"); return; }
  box.innerHTML = (data || []).map(c=> `<div class="nv-c"><b>${esc(c.nome || "Alguém")}:</b> ${esc(c.texto)} <span class="when">${tempoAtras(c.created_at)}</span>${c.pode_apagar ? ` <button type="button" class="linkbtn" data-nv-apagar="${c.id}" data-item="${id}">Apagar</button>` : ""}</div>`).join("")
    + `<form class="nv-form" data-nv-form="${id}"><label class="sr-only" for="nvc-${id}">Comentar</label><input id="nvc-${id}" maxlength="280" placeholder="Comentar…" autocomplete="off"><button class="btn btn-primary" type="submit">Enviar</button></form>`;
  if(focar) document.getElementById('nvc-' + id)?.focus();
}
function atualizarItem(id, fn){
  const a = novFeed.find(x=> x.id === id); if(!a) return;
  fn(a);
  const html = itemFeedHTML(a);
  document.querySelectorAll(`.feed-item[data-item="${id}"]`).forEach(el=>{ const aberto = !el.querySelector('.nv-coms').hidden; el.outerHTML = html; if(aberto) abrirComentarios(id); });
  if(document.body.dataset.tab === "catalogo") renderFaixa();
}

/* ---------- ações (catálogo e aba Amigos) ---------- */
async function abrirFichaAtividade(id, origem){
  const a = novFeed.find(x=> x.id === id);
  if(a?.tipo === "lista" && a.list_id){ location.href = `${location.pathname}?lista=${a.list_id}`; return; }
  const { data, error } = await sb.rpc('titulo_da_atividade', { p_id: id });
  const row = (data || [])[0];
  if(error || !row){ showToast("Esse título não está mais disponível"); return; }
  abrirFicha(fromRow(row), origem, { publico: true });
}
document.addEventListener('click', async e=>{
  const fil = e.target.closest('[data-nv-filtro]');
  if(fil){ novFiltro = fil.dataset.nvFiltro; renderAbaNovidades(); return; }
  const cur = e.target.closest('[data-nv-curtir]');
  if(cur){
    e.stopPropagation();
    const id = cur.dataset.nvCurtir, a = novFeed.find(x=> x.id === id); if(!a) return;
    const on = !a.eu_curti;
    atualizarItem(id, x=>{ x.eu_curti = on; x.curtidas += on ? 1 : -1; x.quem_curtiu = on ? ["Você", ...(x.quem_curtiu || [])] : (x.quem_curtiu || []).filter(n=> n !== "Você"); });
    const { error } = await sb.rpc('curtir_atividade', { p_id: id, p_on: on });
    if(error){ atualizarItem(id, x=>{ x.eu_curti = !on; x.curtidas += on ? -1 : 1; }); showToast("Não consegui curtir agora"); }
    return;
  }
  const com = e.target.closest('[data-nv-com]');
  if(com){
    e.stopPropagation();
    const id = com.dataset.nvCom;
    if(document.body.dataset.tab !== "amigos"){ novFiltro = "tudo"; await setTab('amigos'); setTimeout(()=> abrirComentarios(id, true), 300); return; }
    const box = document.getElementById('coms-' + id);
    if(box && !box.hidden){ box.hidden = true; return; }
    return abrirComentarios(id, true);
  }
  const ap = e.target.closest('[data-nv-apagar]');
  if(ap){
    if(!(await confirmar({ titulo:"Apagar este comentário?", botao:"Apagar", perigo:true }))) return;
    const { error } = await sb.rpc('apagar_comentario_atividade', { p_id: ap.dataset.nvApagar });
    if(error){ showToast("Não consegui apagar"); return; }
    atualizarItem(ap.dataset.item, x=>{ x.comentarios = Math.max(0, x.comentarios - 1); });
    return abrirComentarios(ap.dataset.item);
  }
  const vou = e.target.closest('[data-nv-vou]');
  if(vou){
    e.stopPropagation();
    vou.disabled = true;
    const { data, error } = await sb.rpc('vou_ver_atividade', { p_id: vou.dataset.nvVou });
    vou.disabled = false;
    if(error){ showToast("Não consegui adicionar agora"); return; }
    if(!data?.ok){ showToast(data?.motivo === "ja_tem" ? "Esse título já está no seu catálogo" : "Esse título não está mais disponível"); return; }
    await loadShows(); render();
    showToast("Adicionado ao seu catálogo em Quero assistir", { acao:"Desfazer", ms:6000, onAcao: async ()=>{
      await sb.from('titles').delete().eq('id', data.id).eq('user_id', currentUser.id);
      shows = shows.filter(s=> s.id !== data.id); render(); showToast("Removido do seu catálogo");
    } });
    return;
  }
  const mov = e.target.closest('[data-nv-mover]');
  if(mov){
    e.stopPropagation();
    const temp = Number(mov.dataset.temp) || null;
    const novo = await salvarCampos(mov.dataset.nvMover, temp ? { status:"Assistindo", temporada: temp, episodio: 0 } : { status:"Assistindo" });
    if(novo){
      novTemporadas = novTemporadas.filter(t=> !(t.id === novo.id && t.podeMover));
      renderFaixa(); render();
      showToast(`${novo.titulo} agora está em Assistindo`);
    }
    return;
  }
  if(e.target.closest('[data-nv-conferir]')){ e.stopPropagation(); return abrirConferir(); }
  if(e.target.closest('[data-nv-ir-com-voce]')){ novFiltro = "voce"; return setTab('amigos'); }
  if(e.target.closest('button, a, input, form')) return;
  const fp = e.target.closest('[data-nv-ficha-propria]');
  if(fp){ const s = shows.find(x=> x.id === fp.dataset.nvFichaPropria); if(s) abrirFicha(s, fp); return; }
  const fi = e.target.closest('[data-nv-ficha]');
  if(fi) abrirFichaAtividade(fi.dataset.nvFicha, fi);
});
document.addEventListener('keydown', e=>{
  if((e.key === 'Enter' || e.key === ' ') && e.target.matches('.nc[role=button], .fp[role=button]')){ e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', async e=>{
  const f = e.target.closest('[data-nv-form]'); if(!f) return;
  e.preventDefault();
  const id = f.dataset.nvForm, input = f.querySelector('input'), texto = input.value.trim();
  if(!texto) return;
  const btn = f.querySelector('button'); btn.disabled = true;
  const { data, error } = await sb.rpc('comentar_atividade', { p_id: id, p_texto: texto });
  btn.disabled = false;
  if(error || !data?.ok){ showToast("Não consegui comentar agora"); return; }
  atualizarItem(id, x=>{ x.comentarios += 1; });
  abrirComentarios(id, true);
});

/* ---------- novas temporadas, episódios e ano (checa no máximo uma vez por dia) ---------- */
const VIGIA = ["Assistindo", "Aguardando Nova Temporada", "Concluída"];
function calcularNovidadeTitulo(s, d){
  const hoje = hojeISO();
  const seasons = (d.seasons || []).filter(x=> x.season_number > 0);
  const out = [];
  if(s.status === "Assistindo" && d.next_episode_to_air?.air_date){
    const ep = d.next_episode_to_air, n = diasAte(ep.air_date);
    if(n >= -2 && n <= 7) out.push({ tipo:"ep", temporada: ep.season_number, ep: ep.episode_number, data: ep.air_date });
  }
  if(s.status !== "Assistindo"){
    const vista = s.temporada || 0;
    // temporada depois da que você viu, ainda sem data ou que estreia/estreou há no máximo 7 dias
    const nova = seasons.filter(x=> x.season_number > vista && (!x.air_date || diasAte(x.air_date) >= -7)).sort((a, b)=> a.season_number - b.season_number)[0];
    if(nova){
      const ant = seasons.filter(x=> x.season_number < nova.season_number && x.air_date).pop();
      const voltou = s.status === "Concluída" && !!ant && !!nova.air_date && (new Date(nova.air_date) - new Date(ant.air_date)) > 3 * 365 * 864e5;
      out.push({ tipo:"temp", temporada: nova.season_number, data: nova.air_date || null, voltou });
    }
  }
  return out;
}
function montarTemporada(s, n){
  const dias = n.data ? diasAte(n.data) : null;
  const sub = s.status === "Concluída" ? "Você terminou esta série" : s.status === "Aguardando Nova Temporada" ? "Você estava aguardando" : `Você está assistindo${s.episodio ? ` · parou no E${s.episodio}` : ""}`;
  if(n.tipo === "ep"){
    const quando = dias === 0 ? "sai hoje" : dias < 0 ? "saiu" : `sai em ${plural(dias, "dia", "dias")} (${dataBR(n.data)})`;
    return { id:s.id, titulo:s.titulo, chave:`${s.id}:ep:${n.temporada}:${n.ep}`, etiqueta:"EPISÓDIO NOVO", texto:`T${n.temporada} E${n.ep} ${quando}`, sub, urg: dias <= 0 ? 1 : 3, selo:`📺 E${n.ep} ${dias === 0 ? "hoje" : dias < 0 ? "saiu" : `em ${dias}d`}`, temporada:n.temporada, podeMover:false };
  }
  const estreou = dias !== null && dias <= 0;
  const etiqueta = estreou ? (dias === 0 ? "ESTREIA HOJE" : "ESTREOU") : n.voltou ? "VOLTOU" : "NOVA TEMPORADA";
  const texto = dias === null ? `temporada ${n.temporada} anunciada, ainda sem data` : estreou ? `temporada ${n.temporada}${dias === 0 ? "" : ` estreou em ${dataBR(n.data)}`}` : `temporada ${n.temporada} estreia em ${plural(dias, "dia", "dias")} (${dataBR(n.data)})`;
  return { id:s.id, titulo:s.titulo, chave:`${s.id}:temp:${n.temporada}:${estreou ? "e" : n.data || "x"}`, etiqueta, texto: n.voltou && !estreou ? texto + " 😮" : texto, sub,
    urg: estreou ? 0 : dias === null ? 6 : 2, selo:`📺 T${n.temporada} ${dias === null ? "anunciada" : dias === 0 ? "hoje" : dias < 0 ? "estreou" : `em ${dias} dias`}`, temporada:n.temporada, podeMover: estreou };
}
function reconstruirTemporadas(){
  const cache = lerLS('dw-temp-cache', { dia:null, porId:{} });
  novTemporadas = [];
  shows.forEach(s=>{
    if(!VIGIA.includes(s.status)) return;
    (cache.porId[s.id] || []).forEach(n=>{
      if(n.data && diasAte(n.data) < (n.tipo === "ep" ? -2 : -7)) return;
      novTemporadas.push(montarTemporada(s, n));
    });
  });
}
function seloNovidade(s){
  const t = novTemporadas.filter(x=> x.id === s.id).sort((a, b)=> a.urg - b.urg)[0];
  return t ? `<div class="nov-selo">${esc(t.selo)}</div>` : "";
}
/* ---------- ligar títulos antigos à busca inteligente ---------- */
const nrm = t=> (t || "").normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function vincularCatalogo(){
  const tent = lerLS('dw-vinc-tent', {}), ign = new Set(lerLS('dw-vinc-ignorar', [])), duv = lerLS('dw-vinc-duvida', {});
  const semana = Date.now() - 7 * 864e5;
  const alvo = shows.filter(s=> !s.tmdbId && !ign.has(s.id) && !duv[s.id] && !(tent[s.id] > semana)).slice(0, 60);
  let ligados = 0;
  for(let i = 0; i < alvo.length; i += 4){
    await Promise.all(alvo.slice(i, i + 4).map(async s=>{
      tent[s.id] = Date.now();
      try{
        const media = s.tipo === "Filme" ? "movie" : "tv";
        const res = (await tmdbFind(s.titulo, s.tipo)).filter(r=> r.media === media);
        if(!res.length) return;
        const nomes = new Set([s.titulo, ...queryVariants(s.titulo)].map(nrm));
        const exatos = res.filter(r=> nomes.has(nrm(r.nome)) || nomes.has(nrm(r.original)));
        const livre = r=> !shows.some(x=> x.tmdbId === r.id && x.tmdbMedia === r.media);
        if(exatos.length === 1 && livre(exatos[0])){
          const r = exatos[0], up = { tmdb_id: r.id, tmdb_media: r.media };
          if(!s.ano && Number(r.ano)) up.ano = Number(r.ano);
          const { error } = await sb.from('titles').update(up).eq('id', s.id).eq('user_id', currentUser.id);
          if(!error){ shows = shows.map(x=> x.id === s.id ? { ...x, tmdbId: r.id, tmdbMedia: r.media, ano: up.ano || x.ano } : x); ligados++; }
        }else{
          duv[s.id] = (exatos.length ? exatos : res).filter(livre).slice(0, 4).map(r=> ({ id: r.id, media: r.media, nome: r.nome, ano: r.ano, thumb: r.thumb }));
          if(!duv[s.id].length) delete duv[s.id];
        }
      }catch(err){ console.warn("vínculo", s.titulo, err.message); }
    }));
  }
  gravarLS('dw-vinc-tent', tent); gravarLS('dw-vinc-duvida', duv);
  return ligados;
}
function abrirConferir(){
  const duv = lerLS('dw-vinc-duvida', {});
  const itens = Object.entries(duv).map(([id, ops])=> ({ s: shows.find(x=> x.id === id && !x.tmdbId), ops })).filter(x=> x.s);
  if(!itens.length){ showToast("Nada para conferir agora"); renderFaixa(); return; }
  abrirDialogo({
    titulo: "Confere estes títulos",
    corpo: `<p class="muted" style="margin:0 0 12px">Toque na capa certa de cada um. Assim o app passa a mostrar o ano e avisar sobre novas temporadas.</p>
      <div class="vinc-list">${itens.map(({ s, ops })=> `<div class="vinc-item" data-vinc="${s.id}"><b>${esc(s.titulo)} <span class="muted" style="font-weight:400">· ${esc(s.tipo)}</span></b>
        <div class="vinc-opts">${ops.map((o, i)=> `<button type="button" data-op="${i}">${o.thumb ? `<img src="${esc(o.thumb)}" alt="" loading="lazy">` : ""}<span>${esc(o.nome)}${o.ano ? ` (${esc(o.ano)})` : ""}</span></button>`).join("")}
          <button type="button" class="nenhum" data-op="nenhum">Nenhum destes</button></div></div>`).join("")}</div>`,
    botoes: [{ texto:"Fechar", classe:"btn-primary" }],
    aoAbrir: corpo=> corpo.addEventListener('click', async e=>{
      const b = e.target.closest('[data-op]'); if(!b) return;
      const box = b.closest('[data-vinc]'), id = box.dataset.vinc, d = lerLS('dw-vinc-duvida', {});
      if(b.dataset.op === "nenhum"){
        gravarLS('dw-vinc-ignorar', [...new Set([...lerLS('dw-vinc-ignorar', []), id])]);
      }else{
        const o = (d[id] || [])[+b.dataset.op]; if(!o) return;
        const s = shows.find(x=> x.id === id);
        const up = { tmdb_id: o.id, tmdb_media: o.media }; if(!s?.ano && Number(o.ano)) up.ano = Number(o.ano);
        const { error } = await sb.from('titles').update(up).eq('id', id).eq('user_id', currentUser.id);
        if(error){ showToast("Não consegui salvar agora"); return; }
        shows = shows.map(x=> x.id === id ? { ...x, tmdbId: o.id, tmdbMedia: o.media, ano: up.ano || x.ano } : x);
        gravarLS('dw-temp-cache', { dia:null, porId: lerLS('dw-temp-cache', { porId:{} }).porId });
      }
      delete d[id]; gravarLS('dw-vinc-duvida', d);
      box.remove();
      if(!corpo.querySelector('[data-vinc]')){ fecharDialogo(); showToast("Tudo conferido"); setTimeout(sincronizarTitulos, 300); }
      render(); renderFaixa();
    })
  });
}

async function sincronizarTitulos(){
  if(!TMDB_KEY) return;
  const ligados = await vincularCatalogo();
  if(ligados){ render(); gravarLS('dw-temp-cache', { dia:null, porId: lerLS('dw-temp-cache', { porId:{} }).porId }); }
  const cache = lerLS('dw-temp-cache', { dia:null, porId:{} });
  const semAno = shows.filter(s=> s.tmdbId && !s.ano).slice(0, 40);
  const vigiar = cache.dia === hojeISO() ? [] : shows.filter(s=> s.tmdbId && s.tmdbMedia === "tv" && VIGIA.includes(s.status));
  const fila = [...new Map([...vigiar, ...semAno].map(s=> [s.id, s])).values()];
  if(!fila.length){ renderFaixa(); return; }
  const porId = cache.dia === hojeISO() ? cache.porId : {};
  let mudouAno = false;
  for(let i = 0; i < fila.length; i += 4){
    await Promise.all(fila.slice(i, i + 4).map(async s=>{
      try{
        const d = await tmdbGet(`${s.tmdbMedia}/${s.tmdbId}`);
        const ano = Number((d.release_date || d.first_air_date || "").slice(0,4)) || null;
        if(ano && !s.ano){
          const { error } = await sb.from('titles').update({ ano }).eq('id', s.id).eq('user_id', currentUser.id);
          if(!error){ shows = shows.map(x=> x.id === s.id ? { ...x, ano } : x); mudouAno = true; }
        }
        if(s.tmdbMedia === "tv" && VIGIA.includes(s.status) && vigiar.includes(s)) porId[s.id] = calcularNovidadeTitulo(s, d);
      }catch(err){ console.warn("novidades", s.titulo, err.message); }
    }));
  }
  if(vigiar.length) gravarLS('dw-temp-cache', { dia: hojeISO(), porId });
  reconstruirTemporadas();
  if(mudouAno || novTemporadas.length) render();
  renderFaixa();
}

/* ---------- ao abrir o app ---------- */
const _aoIniciarNovOrig = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarNovOrig();
  reconstruirTemporadas();
  if(novTemporadas.length) render();
  try{ await carregarNovidadesAmigos(); }catch(e){}
  atualizarBadgeAmigos();
  renderFaixa();
  setTimeout(sincronizarTitulos, 1500);
};
