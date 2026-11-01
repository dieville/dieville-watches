/* Dieville Watches: comunidade no título (01/11/2026)
   Bloco "Comunidade" na ficha: quem tem o título, reações, comentários com proteção de spoiler (por status e por episódio),
   moderação mínima (editar, apagar, reportar, silenciar) e fila de reportes para o dono. Depende de sql/comunidade-titulo-01-11.sql. */

const REACOES_T = [{ v:"vou_ver", ic:"📌", t:"Vou ver" }, { v:"ja_vi", ic:"✅", t:"Já vi" }, { v:"amei", ic:"❤️", t:"Amei" }, { v:"nao_curti", ic:"👎", t:"Não curti" }];
const ERROS_COM = {
  texto_vazio: "Escreva algo antes de enviar.", texto_longo: "O comentário passa de 280 caracteres.",
  link_proibido: "Links não são permitidos nos comentários.", muito_rapido: "Calma, muitos comentários em pouco tempo. Tente de novo em um minuto.",
  sem_permissao: "Você não tem permissão para isso."
};
const ct = { s:null, dados:null, forcar:false, todos:false, reveladas:new Set(), menu:null, modo:null, erro:null, rascunho:{}, regras:false };

const membroComunidade = ()=> !!(currentUser && perfisAtivos && profile?.status === "aprovado");
const lsOk = (k)=>{ try{ return !!localStorage.getItem(k); }catch(e){ return false; } };
const lsSet = (k)=>{ try{ localStorage.setItem(k, "1"); }catch(e){} };
function textoErro(error){
  const m = String(error?.message || "");
  const k = Object.keys(ERROS_COM).find(x=> m.includes(x));
  return k ? ERROS_COM[k] : (navigator.onLine === false ? "Parece que você está sem conexão." : "Não consegui concluir. Pode ser a conexão ou uma falha nossa.");
}
const listaNomes = n=> n.length <= 1 ? (n[0] || "") : n.slice(0, -1).join(", ") + " e " + n[n.length - 1];

/* ---------- carregar ---------- */
async function carregarComunidade(forcar = false){
  const box = document.getElementById('fxCom'), s = ct.s;
  if(!box || !s || !membroComunidade()) return;
  if(!s.tmdbId || !s.tmdbMedia){
    box.innerHTML = amigos.some(a=> a.status === "aceita")
      ? `<div class="cm-vinc"><span>Vincule este título para ver o que seus amigos acham.</span><button type="button" class="b2" data-cm-vincular>Vincular</button></div>` : "";
    return;
  }
  const { data, error } = await sb.rpc('comunidade_titulo', { p_tmdb_id: s.tmdbId, p_media: s.tmdbMedia, p_forcar: forcar });
  if(ct.s?.id !== s.id || !document.getElementById('fxCom')) return;
  if(error){
    ct.retry = ()=> carregarComunidade(forcar);
    box.innerHTML = `<section class="cmx"><div class="cm-erro" role="alert"><b>Não consegui carregar a comunidade.</b><span>O resto da ficha continua normal.</span>
      <div class="cm-btr"><button type="button" class="b2" data-cm-retry>Tentar de novo</button></div></div></section>`;
    return;
  }
  if(!data){ box.innerHTML = ""; return; }
  ct.dados = data; ct.forcar = forcar; ct.erro = null;
  renderComunidade();
}

/* ---------- desenho ---------- */
function cmHTML(c){
  const ep = c.temporada ? `<span class="cm-ep">T${c.temporada}${c.episodio ? ` E${c.episodio}` : ""}</span>` : "";
  const nota = c.nota ? `<span class="cm-st" role="img" aria-label="nota ${c.nota} de 5">${"★".repeat(c.nota)}${"☆".repeat(5 - c.nota)}</span>` : "";
  const corpo = (c.spoiler && !c.minha && !ct.reveladas.has(c.id))
    ? `<button type="button" class="b3" data-cm-rev="${c.id}">Tem spoiler. Mostrar</button>` : esc(c.texto);
  const menu = ct.menu === c.id ? `<div class="cm-menu" role="menu">${c.minha
      ? `<button type="button" role="menuitem" data-cm-editar="${c.id}">Editar</button><button type="button" role="menuitem" data-cm-apagar="${c.id}">Apagar</button>`
      : `<button type="button" role="menuitem" data-cm-reportar="${c.id}">Reportar comentário</button><button type="button" role="menuitem" data-cm-silenciar="${c.user_id}" data-nome="${esc((c.nome || "").split(" ")[0])}">Silenciar ${esc((c.nome || "").split(" ")[0])}</button>`}</div>` : "";
  let painel = "";
  if(ct.modo?.id === c.id){
    if(ct.modo.tipo === "apagar") painel = `<div class="cm-pn"><b>Apagar este comentário?</b><div class="cm-btr"><button type="button" class="b3" data-cm-cancelar>Cancelar</button><button type="button" class="b2" data-cm-apagar-ok="${c.id}">Apagar</button></div></div>`;
    if(ct.modo.tipo === "reportar") painel = `<div class="cm-pn"><b>Reportar comentário</b><p>Quem escreveu não é avisado.</p>
      ${[["spoiler","Spoiler sem aviso"],["ofensivo","Ofensivo ou assédio"],["spam","Spam"],["outro","Outro"]].map(([v, t], i)=> `<label class="cm-rad"><input type="radio" name="cmMotivo" value="${v}" ${i === 0 ? "checked" : ""}><span>${t}</span></label>`).join("")}
      <input type="text" id="cmDetalhe" maxlength="300" placeholder="Detalhe (opcional)" aria-label="Detalhe do reporte">
      <div class="cm-btr"><button type="button" class="b3" data-cm-cancelar>Cancelar</button><button type="button" class="b2" data-cm-reportar-ok="${c.id}">Enviar reporte</button></div></div>`;
    if(ct.modo.tipo === "editar") painel = `<div class="cm-pn"><label class="sr-only" for="cmEdTxt">Editar comentário</label><textarea id="cmEdTxt" maxlength="280" rows="2">${esc(c.texto)}</textarea>
      <label class="cm-chk"><input type="checkbox" id="cmEdSp" ${c.spoiler ? "checked" : ""}><span>Tem spoiler</span></label>
      <div class="cm-btr"><button type="button" class="b3" data-cm-cancelar>Cancelar</button><button type="button" class="b2" data-cm-editar-ok="${c.id}">Salvar</button></div></div>`;
  }
  return `<div class="cm-c ${c.oculto ? "oc" : ""}"><span class="cm-avw">${fotoHTML(c, "cm-av")}</span>
    <div class="cm-b"><div class="cm-meta"><b>${esc((c.nome || "Alguém").split(" ")[0])}${c.minha ? " (você)" : ""}</b>${nota}${ep}<span>${tempoAtras(c.created_at)}${c.editado ? " · editado" : ""}</span>${c.oculto ? `<span class="cm-tag">Ocultado pelo Dieville</span>` : ""}
      <button type="button" class="b3 cm-mais" data-cm-menu="${c.id}" aria-label="Mais opções do comentário" aria-expanded="${ct.menu === c.id}">⋯</button></div>
      <div class="cm-t">${corpo}</div>${menu}${painel}</div></div>`;
}
function compHTML(){
  const s = ct.s, r = ct.rascunho, serie = s.tipo !== "Filme";
  const prog = serie && (s.temporada || s.episodio) ? `T${s.temporada || 1} E${s.episodio || 1}` : "";
  const sobre = r.sobre || (prog && !["Concluída", "Abandonei"].includes(s.status) ? "agora" : "serie");
  const opt = (v, t)=> `<option value="${v}" ${sobre === v ? "selected" : ""}>${t}</option>`;
  return `<div class="cm-comp"><label class="sr-only" for="cmTxt">Escreva para os amigos</label>
    <textarea id="cmTxt" maxlength="280" rows="2" placeholder="Escreva para os amigos">${esc(r.texto || "")}</textarea>
    <div class="cm-lin">${serie ? `<label class="sr-only" for="cmSobre">Sobre qual parte</label><select id="cmSobre" class="fx-sel">${opt("serie", "Sobre: a série toda")}${prog ? opt("agora", `Sobre: onde estou (${prog})`) : ""}${opt("outro", "Sobre: outro episódio…")}</select>
      <span class="cm-ep-in" id="cmEpIn" ${sobre === "outro" ? "" : "hidden"}>T <input type="number" id="cmT" min="1" max="200" value="${esc(r.t || "")}" aria-label="Temporada"> E <input type="number" id="cmE" min="1" max="5000" value="${esc(r.e || "")}" aria-label="Episódio"></span>` : ""}
      <label class="cm-chk"><input type="checkbox" id="cmSp" ${r.spoiler ? "checked" : ""}><span>Tem spoiler</span></label></div>
    ${ct.regras ? `<div class="cm-pn"><b>Antes do primeiro comentário</b><p>Seja respeitoso. Marque o episódio ou "Tem spoiler" quando contar algo da história. Sem links.</p><div class="cm-btr"><button type="button" class="b2" data-cm-regras-ok>Entendi, enviar</button></div></div>` : ""}
    <div class="cm-btr"><span class="cm-cont" id="cmCont"></span>${ct.regras ? "" : `<button type="button" class="b2" id="cmEnviar" data-cm-enviar>Enviar</button>`}</div></div>`;
}
function renderComunidade(){
  const box = document.getElementById('fxCom'), d = ct.dados;
  if(!box || !d) return;
  if(!d.amigos.length){ box.innerHTML = ""; return; }
  const nomes = d.amigos.map(a=> (a.nome || "Amigo").split(" ")[0]);
  const quem = nomes.length <= 3 ? listaNomes(nomes) : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
  const visiveis = d.comentarios.filter(c=> c.texto !== null), ocultos = d.comentarios.filter(c=> c.texto === null);
  const porStatus = ocultos.filter(c=> !c.temporada), porEp = ocultos.filter(c=> c.temporada);
  const lista = visiveis.slice(0, ct.todos ? 60 : 2);
  box.innerHTML = `<section class="cmx" aria-label="Comunidade">
    <div class="cm-h"><h4>Comunidade</h4>${visiveis.length > 2 ? `<button type="button" class="b3" data-cm-todos>${ct.todos ? "Ver menos" : `Ver todos (${visiveis.length})`}</button>` : ""}</div>
    <div class="cm-who"><span class="cm-avs">${d.amigos.slice(0, 3).map(a=> fotoHTML(a, "cm-av")).join("")}</span><span>${esc(quem)} também ${nomes.length === 1 ? "tem" : "têm"}</span></div>
    <div class="cm-rx" role="group" aria-label="Sua reação">${REACOES_T.map(r=> `<button type="button" class="${d.minha === r.v ? "me" : ""}" aria-pressed="${d.minha === r.v}" data-cm-rx="${r.v}"><b>${r.ic} ${d.reacoes[r.v] || 0}</b>${r.t}</button>`).join("")}</div>
    ${lista.map(cmHTML).join("")}
    ${porStatus.length ? `<div class="cm-spo"><b>${plural(porStatus.length, "comentário de amigo", "comentários de amigos")}</b>Podem conter spoilers. Liberam quando você concluir.<div><button type="button" class="b3" data-cm-forcar>Mostrar mesmo assim</button></div></div>` : ""}
    ${porEp.map(c=> `<div class="cm-spo"><b>1 comentário sobre T${c.temporada}${c.episodio ? ` E${c.episodio}` : ""}</b>Aparece quando você chegar lá.</div>`).join("")}
    ${!d.comentarios.length ? `<div class="cm-vz">Ninguém comentou ainda.<br><b>Seja o primeiro a comentar</b></div>` : ""}
    ${ct.erro ? `<div class="cm-erro" role="alert"><b>${esc(ct.erro.msg)}</b><span>${esc(ct.erro.det || "Seu texto continua no campo.")}</span><div class="cm-btr"><button type="button" class="b3" data-cm-avisar>Avisar o Dieville</button>${ct.erro.retry ? `<button type="button" class="b2" data-cm-retry>Tentar de novo</button>` : ""}</div></div>` : ""}
    ${compHTML()}</section>`;
  atualizarContador();
}
function atualizarContador(){
  const t = document.getElementById('cmTxt'), c = document.getElementById('cmCont');
  if(t && c){ const r = 280 - t.value.length; c.textContent = r <= 40 ? `${r} restantes` : ""; }
}
function falhou(msg, error, retry){
  ct.erro = { msg, det: textoErro(error), retry: retry || null }; ct.retry = retry || null;
  const t = document.getElementById('cmTxt'); if(t) ct.rascunho.texto = t.value;
  renderComunidade();
}

/* ---------- ações ---------- */
function lerRascunho(){
  const g = id=> document.getElementById(id);
  ct.rascunho = { texto: g('cmTxt')?.value || "", spoiler: !!g('cmSp')?.checked, sobre: g('cmSobre')?.value || "", t: g('cmT')?.value || "", e: g('cmE')?.value || "" };
}
async function reagirT(v){
  const d = ct.dados, antes = { minha: d.minha, reacoes: { ...d.reacoes } };
  if(d.minha) d.reacoes[d.minha] = Math.max(0, (d.reacoes[d.minha] || 0) - 1);
  if(d.minha === v) d.minha = null; else { d.minha = v; d.reacoes[v] = (d.reacoes[v] || 0) + 1; }
  lerRascunho(); ct.erro = null; renderComunidade();
  const { error } = await sb.rpc('reagir_titulo', { p_tmdb_id: ct.s.tmdbId, p_media: ct.s.tmdbMedia, p_tipo: v });
  if(error){ d.minha = antes.minha; d.reacoes = antes.reacoes; falhou("Não consegui salvar sua reação.", error, ()=> reagirT(v)); }
}
async function enviarComentario(){
  lerRascunho();
  const r = ct.rascunho, s = ct.s, texto = r.texto.trim();
  if(!texto){ falhou("Escreva algo antes de enviar.", { message:"texto_vazio" }); return; }
  let temporada = null, episodio = null;
  if(r.sobre === "agora"){ temporada = s.temporada || 1; episodio = s.episodio || 1; }
  if(r.sobre === "outro"){ temporada = Number(r.t) || null; episodio = Number(r.e) || null; if(!temporada){ falhou("Diga a temporada do episódio.", { message:"texto_vazio" }); return; } }
  if(!lsOk('dw-regras-vistas')){ ct.regras = true; ct.erro = null; renderComunidade(); return; }
  const b = document.getElementById('cmEnviar'); if(b){ b.disabled = true; b.textContent = "Enviando…"; }
  const { error } = await sb.rpc('comentar_titulo', { p_tmdb_id: s.tmdbId, p_media: s.tmdbMedia, p_texto: texto, p_temporada: temporada, p_episodio: episodio, p_spoiler: r.spoiler });
  if(error){ falhou("Não consegui enviar seu comentário.", error, enviarComentario); return; }
  ct.rascunho = {}; ct.erro = null; showToast("Comentário enviado");
  await carregarComunidade(ct.forcar);
}
async function chamar(rpc, args, msgErro, depois, retry){
  const { error } = await sb.rpc(rpc, args);
  if(error){ falhou(msgErro, error, retry); return false; }
  ct.erro = null; ct.menu = null; ct.modo = null;
  if(depois) await depois();
  return true;
}
document.addEventListener('click', async e=>{
  const box = e.target.closest('#fxCom');
  if(!box){ if(ct.menu && !e.target.closest('.cm-menu')){ ct.menu = null; renderComunidade(); } return; }
  const q = sel=> e.target.closest(sel);
  const rx = q('[data-cm-rx]'); if(rx) return reagirT(rx.dataset.cmRx);
  if(q('[data-cm-retry]')) return ct.retry ? ct.retry() : carregarComunidade(ct.forcar);
  if(q('[data-cm-avisar]')) return abrirFeedback({ tipo: "erro", texto: `Comunidade no título: ${ct.erro?.msg || "falha ao carregar"}` });
  if(q('[data-cm-vincular]')) return vincularFicha(ct.s);
  if(q('[data-cm-todos]')){ lerRascunho(); ct.todos = !ct.todos; return renderComunidade(); }
  if(q('[data-cm-forcar]')){ lerRascunho(); return carregarComunidade(true); }
  const rev = q('[data-cm-rev]'); if(rev){ lerRascunho(); ct.reveladas.add(rev.dataset.cmRev); return renderComunidade(); }
  const mn = q('[data-cm-menu]'); if(mn){ lerRascunho(); ct.menu = ct.menu === mn.dataset.cmMenu ? null : mn.dataset.cmMenu; ct.modo = null; return renderComunidade(); }
  const pnl = (attr, tipo)=>{ const b = q(`[${attr}]`); if(!b) return false; lerRascunho(); ct.modo = { id: b.dataset[attr.replace("data-", "").replace(/-(\w)/g, (_, c)=> c.toUpperCase())], tipo }; ct.menu = null; renderComunidade(); return true; };
  if(pnl('data-cm-editar', 'editar') || pnl('data-cm-apagar', 'apagar') || pnl('data-cm-reportar', 'reportar')) return;
  if(q('[data-cm-cancelar]')){ ct.modo = null; return renderComunidade(); }
  const sil = q('[data-cm-silenciar]');
  if(sil){
    const uid = sil.dataset.cmSilenciar, nome = sil.dataset.nome;
    const ok = await chamar('silenciar_amigo', { p_id: uid, p_on: true }, `Não consegui silenciar ${nome}.`, ()=> carregarComunidade(ct.forcar), ()=> sil.click());
    if(ok) showToast(`${nome} silenciado. Dá para reativar em Amigos.`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{ await sb.rpc('silenciar_amigo', { p_id: uid, p_on: false }); carregarComunidade(ct.forcar); } });
    return;
  }
  const ap = q('[data-cm-apagar-ok]'); if(ap){ const id = ap.dataset.cmApagarOk; lerRascunho(); return chamar('apagar_comentario_titulo', { p_id: id }, "Não consegui apagar o comentário.", ()=> carregarComunidade(ct.forcar), ()=> ap.click()); }
  const rp = q('[data-cm-reportar-ok]');
  if(rp){
    const id = rp.dataset.cmReportarOk, motivo = box.querySelector('input[name=cmMotivo]:checked')?.value || "outro", detalhe = document.getElementById('cmDetalhe')?.value || "";
    lerRascunho();
    const ok = await chamar('reportar_comentario', { p_id: id, p_motivo: motivo, p_detalhe: detalhe }, "Não consegui enviar o reporte.", ()=> carregarComunidade(ct.forcar), ()=> rp.click());
    if(ok) showToast("Obrigado, o Dieville vai ver. O comentário some só para você.");
    return;
  }
  const ed = q('[data-cm-editar-ok]');
  if(ed){ const id = ed.dataset.cmEditarOk, texto = document.getElementById('cmEdTxt')?.value || "", sp = !!document.getElementById('cmEdSp')?.checked; lerRascunho(); return chamar('editar_comentario_titulo', { p_id: id, p_texto: texto, p_spoiler: sp }, "Não consegui salvar a edição.", ()=> carregarComunidade(ct.forcar), ()=> ed.click()); }
  if(q('[data-cm-regras-ok]')){ lsSet('dw-regras-vistas'); ct.regras = false; return enviarComentario(); }
  if(q('[data-cm-enviar]')) return enviarComentario();
});
document.addEventListener('input', e=>{
  if(e.target.id === 'cmTxt') atualizarContador();
  if(e.target.id === 'cmSobre'){ const w = document.getElementById('cmEpIn'); if(w) w.hidden = e.target.value !== "outro"; }
});

/* ---------- vincular um título ao catálogo de títulos (para a comunidade achar os amigos) ---------- */
async function vincularFicha(s){
  if(!s) return;
  abrirDialogo({ titulo: "Vincular título", corpo: `<p class="muted" style="margin:0 0 12px">Escolha a capa certa de <b>${esc(s.titulo)}</b>. Assim você vê o que seus amigos acham.</p><div id="vfRes" class="vinc-opts"><span class="muted">Procurando…</span></div>`, botoes: [{ texto:"Fechar", classe:"btn-primary" }],
    aoAbrir: async corpo=>{
      let res = [];
      try{ const media = s.tipo === "Filme" ? "movie" : "tv"; res = (await tmdbFind(s.titulo, s.tipo)).filter(r=> r.media === media).slice(0, 5); }
      catch(err){ corpo.querySelector('#vfRes').innerHTML = `<span class="muted">Não consegui buscar agora. Tente de novo em instantes.</span>`; return; }
      const alvo = corpo.querySelector('#vfRes');
      alvo.innerHTML = res.length ? res.map((o, i)=> `<button type="button" data-op="${i}">${o.thumb ? `<img src="${esc(o.thumb)}" alt="" loading="lazy">` : ""}<span>${esc(o.nome)}${o.ano ? ` (${esc(o.ano)})` : ""}</span></button>`).join("") : `<span class="muted">Não achei esse título. Tente editar o nome.</span>`;
      alvo.onclick = async ev=>{
        const b = ev.target.closest('[data-op]'); if(!b) return;
        const o = res[+b.dataset.op], up = { tmdb_id: o.id, tmdb_media: o.media }; if(!s.ano && Number(o.ano)) up.ano = Number(o.ano);
        const { error } = await sb.from('titles').update(up).eq('id', s.id).eq('user_id', currentUser.id);
        if(error){ showToast("Não consegui vincular agora"); return; }
        shows = shows.map(x=> x.id === s.id ? { ...x, tmdbId: o.id, tmdbMedia: o.media, ano: up.ano || x.ano } : x);
        render(); fecharDialogo(); const novo = shows.find(x=> x.id === s.id); if(novo) setTimeout(()=> abrirFicha(novo, document.body), 60);
      };
    } });
}

/* ---------- ganchos na ficha ---------- */
const _fichaHTMLTC = fichaHTML;
fichaHTML = function(s, publico){
  const h = _fichaHTMLTC(s, publico);
  return (!publico && membroComunidade()) ? h.replace('<div id="fxComum"></div>', '<div id="fxComum"></div><div id="fxCom" class="fx-com" data-clarity-mask="True"></div>') : h;
};
const _ligarTC = ligarAcoesFicha;
ligarAcoesFicha = function(corpo, s, origem){
  _ligarTC(corpo, s, origem);
  Object.assign(ct, { s, dados:null, forcar:false, todos:false, menu:null, modo:null, erro:null, rascunho:{}, regras:false, retry:null });
  if(corpo.querySelector('#fxCom')) carregarComunidade(false);
};

/* ---------- Amigos: silenciados ---------- */
async function carregarSilenciados(){
  const box = document.getElementById('amigosSilenciados'); if(!box) return;
  const { data } = await sb.rpc('meus_silenciados');
  box.style.display = (data || []).length ? "" : "none";
  document.getElementById('silList').innerHTML = (data || []).map(p=> `<div class="urow"><span class="uname">${esc(p.nome)}</span><div class="acts"><button type="button" class="b2" data-reativar="${p.user_id}">Reativar</button></div></div>`).join("");
}
document.addEventListener('click', async e=>{
  const b = e.target.closest('[data-reativar]'); if(!b) return;
  const { error } = await sb.rpc('silenciar_amigo', { p_id: b.dataset.reativar, p_on: false });
  if(error){ showToast("Não consegui reativar agora"); return; }
  showToast("Comentários reativados"); carregarSilenciados();
});
const _loadAmigosTC = loadAmigos;
loadAmigos = async function(){ await _loadAmigosTC(); try{ await carregarSilenciados(); }catch(e){} };

/* ---------- Dono: fila de reportes ---------- */
const MOTIVO_TXT = { spoiler:"Spoiler sem aviso", ofensivo:"Ofensivo ou assédio", spam:"Spam", outro:"Outro" };
let reportes = [];
function pintarBadgeReportes(){
  const n = reportes.filter(r=> r.situacao === "novo").length, b = document.getElementById('repBadge');
  if(b){ b.textContent = n; b.style.display = n ? "" : "none"; }
}
async function carregarReportes(){
  const box = document.getElementById('repList'); if(!box) return;
  const { data, error } = await sb.rpc('reportes_dono');
  if(error){ box.innerHTML = `<div class="empty-sm">Não consegui carregar os reportes. <button type="button" class="b3" data-rep-retry>Tentar de novo</button></div>`; return; }
  reportes = data || []; pintarBadgeReportes();
  box.innerHTML = reportes.length ? reportes.map(r=> `<div class="rp-card ${r.situacao}">
      <small>Reportado por ${esc(r.reporter_nome)} · ${esc(MOTIVO_TXT[r.motivo] || r.motivo)} · ${tempoAtras(r.created_at)}</small>
      <q>${esc(r.texto)}</q>
      <small>Autor: ${esc(r.autor_nome)}${r.titulo ? ` · ${esc(r.titulo)}` : ""}${r.detalhe ? ` · "${esc(r.detalhe)}"` : ""}</small>
      ${r.autor_ocultados >= 3 ? `<small class="rp-alerta">${esc(r.autor_nome)} já tem ${r.autor_ocultados} comentários ocultados. Vale decidir se desfaz a amizade ou bloqueia.</small>` : ""}
      ${r.situacao === "novo" ? `<div class="cm-btr" style="justify-content:flex-start"><button type="button" class="b2" data-rep-ocultar="${r.id}">Ocultar</button><button type="button" class="b3" data-rep-ignorar="${r.id}">Ignorar</button></div>` : `<small>${r.situacao === "ocultado" ? "Ocultado" : "Ignorado"}</small>`}</div>`).join("")
    : `<div class="empty-sm">Nenhum reporte. Quando alguém reportar um comentário, aparece aqui.</div>`;
}
document.addEventListener('click', async e=>{
  if(e.target.closest('[data-rep-retry]')) return carregarReportes();
  const oc = e.target.closest('[data-rep-ocultar]'), ig = e.target.closest('[data-rep-ignorar]');
  if(!oc && !ig) return;
  const { error } = await sb.rpc('decidir_reporte', { p_id: (oc || ig).dataset[oc ? "repOcultar" : "repIgnorar"], p_acao: oc ? "ocultar" : "ignorar" });
  if(error){ showToast("Não consegui salvar a decisão"); return; }
  showToast(oc ? "Comentário ocultado para todos" : "Reporte ignorado"); carregarReportes();
});
document.querySelector('.tab-people .subtabs').addEventListener('click', e=>{ if(e.target.closest('[data-sub="reportes"]')) carregarReportes(); });
const _aoIniciarTC = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarTC();
  if(profile?.papel === "dono" && perfisAtivos){ try{ const { data } = await sb.rpc('reportes_dono'); reportes = data || []; pintarBadgeReportes(); }catch(e){} }
};
