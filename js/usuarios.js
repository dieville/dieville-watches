/* Dieville Watches: aba Usuários (só o dono). Usuários, Convites e Feedback. */

let usuarios = [], convites = [], filtroUsr = "todos", menuAberto = null;
const nomeDe = id => usuarios.find(p=> p.id === id)?.nome || "alguém";

function atividadeDe(u){
  if(!u.visto_em) return { cls:"d-old", txt:"Ainda não usou o app" };
  const min = (Date.now() - new Date(u.visto_em).getTime()) / 60000;
  if(min <= 5) return { cls:"d-now", txt:"Usando agora" };
  if(min <= 30 * 24 * 60) return { cls:"d-ok", txt:`Último uso ${tempoAtras(u.visto_em)}` };
  return { cls:"d-old", txt:`Sem uso há ${Math.floor(min / 1440)} dias` };
}

function grupoDe(u){
  if(u.papel === "dono") return "plataforma";
  if(u.status === "pendente") return u.ignorado ? "outros" : "espera";
  if(u.status === "aprovado" || u.status === "bloqueado") return "plataforma";
  return "outros"; // recusados
}

async function loadPeople(){
  const [{ data: us, error }, { data: cs }] = await Promise.all([
    sb.rpc('owner_users'),
    sb.from('invites').select('*').order('criado_em', { ascending:false })
  ]);
  if(error){ console.error(error); showToast("Não consegui carregar os usuários"); return; }
  usuarios = us || []; convites = cs || [];
  renderUsuarios(); renderConvites(); atualizarBadgesUsuarios();
  if(typeof loadFeedbackDono === "function") loadFeedbackDono();
}

function atualizarBadgesUsuarios(){
  const espera = usuarios.filter(u=> grupoDe(u) === "espera").length;
  const fb = typeof feedbackNovos === "function" ? feedbackNovos() : 0;
  const b = document.getElementById('pendBadge');
  b.textContent = espera + fb; b.style.display = (espera + fb) ? "" : "none";
  const f = document.getElementById('fbBadge');
  f.textContent = fb; f.style.display = fb ? "" : "none";
}

function linhaUsuario(u){
  const ativ = atividadeDe(u);
  const origem = u.origem_lista
    ? `<div class="from">Chegou pela lista <b>${esc(u.origem_lista_nome || "removida")}</b>${u.origem_por && u.origem_por !== currentUser.id ? ` · ${u.convidado_por === u.origem_por ? "convidado" : "repassada"} por <b>${esc(u.origem_por_nome || "alguém")}</b>` : ""}</div>`
    : (u.convidado_por && u.convidado_por !== currentUser.id && u.status === "pendente" ? `<div class="from">Convidado por <b>${esc(u.convidado_por_nome || "alguém")}</b></div>` : "");
  const como = u.papel === "dono" ? "" : u.convidado_por ? (u.convidado_por === currentUser.id ? "convidado por você" : `convidado por ${esc(u.convidado_por_nome || "alguém")}`) : (u.origem_lista && u.status === "aprovado" ? `pela lista ${esc(u.origem_lista_nome || "removida")}` : "");
  let selo = "", meta = "", acoes = "";
  if(u.papel === "dono"){
    selo = `<span class="st st-own">DONO</span>`;
    meta = `<span class="seen"><span class="dot ${ativ.cls}"></span>${ativ.txt}</span> · ${plural(u.titulos, "título", "títulos")} · desde ${dataCurta(u.created_at)}`;
  }else if(u.status === "pendente"){
    selo = u.pedido_em ? `<span class="st st-wait">PEDIU ACESSO</span>` : `<span class="st st-ghost">ENTROU, NÃO PEDIU</span>`;
    meta = `${esc(u.email)} · ${u.pedido_em ? `pediu ${tempoAtras(u.pedido_em)}` : `entrou ${tempoAtras(u.created_at)} e não enviou o pedido`}${u.ignorado ? " · ignorado" : ""}`;
    acoes = `<button class="btn btn-ok" data-dec="aprovar" data-u="${u.id}">Aprovar</button>` + (u.pedido_em
      ? `<button class="btn btn-no" data-dec="recusar" data-u="${u.id}">Recusar</button>`
      : (u.ignorado ? "" : `<button class="btn btn-ghost" data-dec="ignorar" data-u="${u.id}">Ignorar</button>`));
  }else if(u.status === "aprovado"){
    selo = `<span class="st st-ok">COM ACESSO</span>`;
    meta = `<span class="seen"><span class="dot ${ativ.cls}"></span>${ativ.txt}</span> · ${plural(u.titulos, "título", "títulos")} · desde ${dataCurta(u.aprovado_em || u.created_at)}${como ? " · " + como : ""}`;
    acoes = `<button class="more-btn" data-menu="${u.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Ações para ${esc(u.nome || u.email)}">⋯</button>`;
  }else if(u.status === "bloqueado"){
    selo = `<span class="st st-off">BLOQUEADO</span>`;
    meta = `${esc(u.email)} · dados guardados`;
    acoes = `<button class="btn btn-ghost" data-dec="desbloquear" data-u="${u.id}">Desbloquear</button>`;
  }else{
    selo = `<span class="st st-no">RECUSADO</span>`;
    meta = `${esc(u.email)} · pediu em ${dataCurta(u.pedido_em || u.created_at)}`;
    acoes = `<button class="btn btn-ghost" data-dec="aprovar" data-u="${u.id}">Aprovar mesmo assim</button>`;
  }
  return `<div class="urow" data-row="${u.id}" ${u.status === "bloqueado" ? 'style="opacity:.8"' : ""}>
    ${fotoHTML(u)}
    <div><span class="uname">${esc(u.nome || u.email)}</span>${selo}
      <div class="umeta">${meta}</div>${u.status === "pendente" ? origem + (u.mensagem ? `<div class="umsg">"${esc(u.mensagem)}"</div>` : "") : ""}</div>
    <div class="acts">${acoes}</div>
  </div>`;
}

function renderUsuarios(){
  const cont = {
    todos: usuarios.length,
    pedidos: usuarios.filter(u=> u.status === "pendente").length,
    ativos: usuarios.filter(u=> u.status === "aprovado").length,
    bloqueados: usuarios.filter(u=> u.status === "bloqueado").length,
    recusados: usuarios.filter(u=> u.status === "recusado").length
  };
  const nomes = { todos:"Todos", pedidos:"Pedidos", ativos:"Ativos", bloqueados:"Bloqueados", recusados:"Recusados" };
  document.getElementById('usrFilters').innerHTML = Object.keys(nomes).map(k=>
    `<button type="button" class="${filtroUsr === k ? "on" : ""}" data-f="${k}" aria-pressed="${filtroUsr === k}">${nomes[k]}<small>${cont[k]}</small></button>`).join("");

  const naPlataforma = usuarios.filter(u=> u.status === "aprovado").length;
  const usaram = usuarios.filter(u=> u.status === "aprovado" && u.visto_em && Date.now() - new Date(u.visto_em) < 30 * 864e5).length;
  document.getElementById('usrResumo').textContent = `Só entra quem você aprovar. ${plural(naPlataforma, "pessoa", "pessoas")} na plataforma, ${usaram} ${usaram === 1 ? "usou" : "usaram"} nos últimos 30 dias.`;

  const porAtividade = (a,b)=> (a.papel === "dono" ? -1 : 0) - (b.papel === "dono" ? -1 : 0) || (new Date(b.visto_em || 0) - new Date(a.visto_em || 0));
  const filtrados = usuarios.filter(u=> filtroUsr === "todos" ? true
    : filtroUsr === "pedidos" ? u.status === "pendente"
    : filtroUsr === "ativos" ? u.status === "aprovado"
    : filtroUsr === "bloqueados" ? u.status === "bloqueado" : u.status === "recusado");
  const secoes = filtroUsr === "todos"
    ? [["Esperando você", filtrados.filter(u=> grupoDe(u) === "espera").sort((a,b)=> new Date(b.pedido_em || b.created_at) - new Date(a.pedido_em || a.created_at))],
       ["Na plataforma", filtrados.filter(u=> grupoDe(u) === "plataforma").sort(porAtividade)],
       ["Recusados e ignorados", filtrados.filter(u=> grupoDe(u) === "outros")]]
    : [[null, filtrados.sort(porAtividade)]];
  const html = secoes.filter(([t, l])=> l.length || t === "Esperando você").map(([t, l])=>
    (t ? `<div class="usr-sec"><h3>${t}</h3><span>${l.length}</span></div>` : "") +
    (l.length ? `<div>${l.map(linhaUsuario).join("")}</div>` : `<div class="empty-sm">${t === "Esperando você" ? "Ninguém esperando por você agora." : "Ninguém aqui."}</div>`)
  ).join("");
  document.getElementById('usrList').innerHTML = html || `<div class="empty-sm">Ninguém aqui.</div>`;
}

function fecharMenuUsuario(){
  if(!menuAberto) return;
  menuAberto.remove(); menuAberto = null;
  document.querySelectorAll('.more-btn[aria-expanded="true"]').forEach(b=> b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e=>{ if(menuAberto && !e.target.closest('.umenu') && !e.target.closest('.more-btn')) fecharMenuUsuario(); });
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') fecharMenuUsuario(); });

document.getElementById('usrFilters').addEventListener('click', e=>{
  const b = e.target.closest('button[data-f]'); if(!b) return;
  filtroUsr = b.dataset.f; renderUsuarios();
});

document.getElementById('usrList').addEventListener('click', async e=>{
  const mb = e.target.closest('.more-btn');
  if(mb){
    const aberto = mb.getAttribute('aria-expanded') === "true";
    fecharMenuUsuario();
    if(aberto) return;
    const u = usuarios.find(x=> x.id === mb.dataset.menu); if(!u) return;
    mb.setAttribute('aria-expanded', 'true');
    const m = document.createElement('div');
    m.className = "umenu"; m.setAttribute('role', 'menu');
    m.innerHTML = (u.listas_publicas ? `<button role="menuitem" data-listas="${u.id}">Ver listas públicas (${u.listas_publicas})</button>` : "")
      + `<button role="menuitem" class="danger" data-dec="bloquear" data-u="${u.id}">Bloquear acesso</button>`;
    mb.closest('.urow').appendChild(m);
    menuAberto = m;
    m.querySelector('button').focus();
    return;
  }
  const vl = e.target.closest('[data-listas]');
  if(vl){
    fecharMenuUsuario();
    const row = document.querySelector(`.urow[data-row="${vl.dataset.listas}"]`);
    row.querySelector('.ulistas')?.remove();
    const { data } = await sbPublico.from('lists').select('id,nome,show_ids').eq('user_id', vl.dataset.listas).eq('publica', true).order('created_at');
    const box = document.createElement('div');
    box.className = "ulistas";
    box.innerHTML = (data || []).map(l=> `<a href="${location.pathname}?lista=${l.id}" target="_blank" rel="noopener">${esc(l.nome)}</a><span class="umeta" style="margin:0">${plural((l.show_ids||[]).length, "título", "títulos")}</span>`).join("") || `<span class="umeta">Nenhuma lista pública.</span>`;
    row.appendChild(box);
    return;
  }
  const dec = e.target.closest('[data-dec]');
  if(!dec) return;
  fecharMenuUsuario();
  const acao = dec.dataset.dec;
  const u = usuarios.find(x=> x.id === dec.dataset.u);
  const quem = u?.nome || u?.email || "esta pessoa";
  if(acao === "recusar" && !(await confirmar({ titulo:`Recusar o pedido de ${quem}?`, texto:"Dá para aprovar depois, no filtro Recusados.", botao:"Recusar", perigo:true }))) return;
  if(acao === "bloquear" && !(await confirmar({ titulo:`Bloquear o acesso de ${quem}?`, texto:`Os dados ficam guardados e dá para desbloquear depois.`, botao:"Bloquear", perigo:true }))) return;
  dec.disabled = true;
  const { data, error } = await sb.rpc('decide_member', { p_user: dec.dataset.u, p_acao: acao });
  if(error || !data?.ok){ showToast("Não consegui concluir: " + (error?.message || "tente de novo")); dec.disabled = false; return; }
  showToast({ aprovar: data.importados ? `Aprovado, com ${plural(data.importados, "título", "títulos")} da lista` : "Aprovado",
              recusar:"Pedido recusado", bloquear:"Acesso bloqueado", desbloquear:"Acesso liberado", ignorar:"Ignorado. Continua em Todos." }[acao]);
  loadPeople();
});

/* ---------- Convites (dono) ---------- */
function linkConvite(c){ return `${location.origin}${location.pathname}?${c.lista_id ? `lista=${c.lista_id}&` : ""}convite=${c.codigo}`; }
async function copiarOuCompartilhar(url, titulo){
  if(navigator.share){ try{ await navigator.share({ title: titulo, url }); return; }catch(e){ if(e.name === 'AbortError') return; } }
  try{ await navigator.clipboard.writeText(url); showToast("Link do convite copiado"); }catch(e){ prompt("Copie o link do convite:", url); }
}
/* mensagem de convite pronta (dono fala como criador; membro convida em nome próprio) */
function textoConvite(url){
  const dono = !perfisAtivos || profile?.papel === "dono";
  const abertura = dono
    ? "Oi! Desenvolvi um app chamado Dieville Watches e queria que você fosse um dos primeiros a usar.\n\nA ideia: nos fins de semana eu perdia mais tempo escolhendo o que ver do que vendo. Então ele funciona assim:"
    : "Oi! Te convidei para o Dieville Watches, um app para guardar o que você quer assistir, e queria que você fosse um dos primeiros a usar.\n\nA ideia: parar de perder mais tempo escolhendo o que ver do que vendo. Ele funciona assim:";
  return abertura + "\n• você guarda séries, filmes e animes num lugar só\n• escolhe a energia do dia (cansado, normal ou com foco) e ele mostra só o que combina\n• o botão Escolhe pra mim sugere 3 opções em segundos\n• você vê o que os amigos estão assistindo e comenta sem levar spoiler\n\nSeu convite está aqui: " + url + "\nO acesso é por convite e o link vale por 7 dias.";
}
async function copiarMensagem(texto){
  try{ await navigator.clipboard.writeText(texto); showToast("Mensagem copiada"); }catch(e){ prompt("Copie a mensagem:", texto); }
  if(typeof medir === 'function') medir('convite_enviado');
}
function abrirWhatsApp(texto){
  window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  if(typeof medir === 'function') medir('convite_enviado');
}
/* bloco com mensagem editável + Copiar + WhatsApp (dentro de um container) */
function mostrarMensagemConvite(box, url){
  box.innerHTML = `<label class="lab" for="invMsg">Mensagem (você pode editar antes de enviar)</label><textarea id="invMsg" rows="9" class="inv-msg"></textarea><div class="inv-acts"><button type="button" class="btn btn-primary" id="invMsgCopy">📋 Copiar mensagem</button><button type="button" class="btn btn-ghost" id="invMsgWa">💬 Enviar no WhatsApp</button></div>`;
  const ta = box.querySelector('#invMsg'); ta.value = textoConvite(url);
  box.querySelector('#invMsgCopy').onclick = ()=> copiarMensagem(ta.value);
  box.querySelector('#invMsgWa').onclick = ()=> abrirWhatsApp(ta.value);
}
function renderConvites(){
  const nomesListas = {};
  lists.forEach(l=> nomesListas[l.id] = l.nome);
  const sel = document.getElementById('invList');
  sel.innerHTML = `<option value="">Sem lista, só o acesso</option>` + lists.filter(l=> l.publica).map(l=> `<option value="${l.id}">${esc(l.nome)}</option>`).join("");
  document.getElementById('invList2').innerHTML = convites.length ? convites.map(c=>{
    const ativo = !c.usado_por && !c.cancelado && new Date(c.expira_em) > new Date();
    const st = c.usado_por ? `<span class="pill-s ps-ok">USADO</span>` : c.cancelado ? `<span class="pill-s ps-off">CANCELADO</span>` : !ativo ? `<span class="pill-s ps-off">EXPIRADO</span>` : `<span class="pill-s ps-wait">AGUARDANDO</span>`;
    const por = c.criado_por !== currentUser.id ? ` · feito por ${esc(nomeDe(c.criado_por))}` : "";
    return `<div class="pcard"><b>${esc(c.nome)}</b>${st}<div class="meta2">${c.lista_id ? `Lista: ${esc(nomesListas[c.lista_id] || "de outra pessoa")} · ` : ""}criado em ${dataCurta(c.criado_em)}${por}${c.usado_por ? ` · aceito em ${dataCurta(c.usado_em)}` : ativo ? ` · expira em ${dataCurta(c.expira_em)}` : ""}</div>${ativo ? `<div class="acts"><button class="btn btn-ghost" data-copy="${c.id}">📋 Copiar mensagem</button><button class="btn btn-ghost" data-wa="${c.id}">💬 WhatsApp</button><button class="btn btn-no" data-cancel="${c.id}">Cancelar convite</button></div>` : ""}</div>`;
  }).join("") : `<div class="empty-sm">Nenhum convite ainda.</div>`;
}
document.getElementById('invList2').addEventListener('click', async e=>{
  const cp = e.target.closest('[data-copy]');
  if(cp){ const c = convites.find(x=> x.id === cp.dataset.copy); return copiarMensagem(textoConvite(linkConvite(c))); }
  const wa = e.target.closest('[data-wa]');
  if(wa){ const c = convites.find(x=> x.id === wa.dataset.wa); return abrirWhatsApp(textoConvite(linkConvite(c))); }
  const cc = e.target.closest('[data-cancel]');
  if(cc){
    if(!(await confirmar({ titulo:"Cancelar este convite?", texto:"O link para de funcionar.", botao:"Cancelar convite", perigo:true }))) return;
    const { error } = await sb.from('invites').update({ cancelado:true }).eq('id', cc.dataset.cancel);
    if(error){ showToast("Não consegui cancelar o convite"); return; }
    showToast("Convite cancelado"); loadPeople();
  }
});
document.getElementById('btnCreateInvite').onclick = async ()=>{
  const nome = document.getElementById('invName').value.trim();
  if(!nome){ showToast("Diga para quem é o convite"); document.getElementById('invName').focus(); return; }
  const lista = document.getElementById('invList').value || null;
  const { data, error } = await sb.from('invites').insert({ nome, lista_id: lista }).select().single();
  if(error){ showToast("Não consegui criar o convite: " + error.message); return; }
  const url = linkConvite(data);
  mostrarMensagemConvite(document.getElementById('invResult'), url);
  document.getElementById('invName').value = "";
  loadPeople();
};

/* subabas */
document.querySelector('.tab-people .subtabs').addEventListener('click', e=>{
  const b = e.target.closest('button[data-sub]'); if(!b) return;
  document.querySelectorAll('.tab-people .subtabs button').forEach(x=>{ x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  document.querySelectorAll('.tab-people .sub-pane').forEach(x=> x.style.display = x.dataset.pane === b.dataset.sub ? "" : "none");
  if(b.dataset.sub === "feedback" && typeof abriuFeedbackDono === "function") abriuFeedbackDono();
});
