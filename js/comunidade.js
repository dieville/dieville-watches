/* Dieville Watches: Fase 3, comunidade (amigos, atividade, reações e comentários nas listas) */

const REACOES = [
  { v:"vou_ver", ic:"📌", txt:"Vou ver", um:"vai ver", varios:"vão ver" },
  { v:"ja_vi", ic:"✅", txt:"Já vi", um:"já viu", varios:"já viram" },
  { v:"amei", ic:"❤️", txt:"Amei", um:"amou", varios:"amaram" },
  { v:"nao_curti", ic:"👎", txt:"Não curti", um:"não curtiu", varios:"não curtiram" }
];
let amigos = [];

/* ---------- ao abrir o app ---------- */
async function aoIniciarApp(){
  atualizarCompartilhar();
  if(typeof verificarRespostasFeedback === "function") verificarRespostasFeedback(true);
  const { data } = await sb.rpc('meus_amigos');
  amigos = data || [];
  atualizarBadgeAmigos();
}
function atualizarBadgeAmigos(){
  const n = amigos.filter(a=> a.status === "pendente" && a.recebido).length;
  const b = document.getElementById('amigosBadge');
  b.textContent = n; b.style.display = n ? "" : "none";
}

/* ---------- mostrar o que estou assistindo ---------- */
function atualizarCompartilhar(){
  const on = profile?.compartilhar_assistindo !== false;
  document.getElementById('compartilharTxt').textContent = on ? "ligado" : "desligado";
  document.getElementById('btnCompartilhar').setAttribute('aria-checked', on);
}
document.getElementById('btnCompartilhar').onclick = async ()=>{
  const novo = profile?.compartilhar_assistindo === false;
  const { error } = await sb.rpc('set_compartilhar', { p_valor: novo });
  if(error){ showToast("Não consegui mudar essa opção"); return; }
  profile.compartilhar_assistindo = novo;
  atualizarCompartilhar();
  showToast(novo ? "Seus amigos vão ver quando você começar a assistir algo" : "Seus amigos não vão mais ver o que você começa a assistir", { ms:3500 });
};

/* ---------- aba Amigos ---------- */
function fraseAtividade(a){
  const t = `<b>${esc(a.titulo)}</b>`;
  if(a.tipo === "assistindo") return `começou a assistir ${t}`;
  if(a.tipo === "comentario") return `comentou em ${t}`;
  const r = REACOES.find(x=> x.v === a.detalhe);
  if(a.detalhe === "amei") return `marcou ${t} como <b>Amei</b>`;
  return `${r ? r.um : "reagiu a"} ${t}`;
}
async function loadAmigos(){
  const [{ data: am }, { data: feed }] = await Promise.all([sb.rpc('meus_amigos'), sb.rpc('feed_amigos', { p_limite: 40 })]);
  amigos = am || [];
  atualizarBadgeAmigos();
  const pedidos = amigos.filter(a=> a.status === "pendente" && a.recebido);
  document.getElementById('amigosPedidos').innerHTML = pedidos.length ? `<div class="pcard-box"><h3>${pedidos.length === 1 ? "Pedido de amizade" : "Pedidos de amizade"}</h3>${pedidos.map(a=>
    `<div class="urow">${fotoHTML(a)}<div><span class="uname">${esc(a.nome)}</span><div class="umeta">Quer ser seu amigo no Dieville Watches</div></div>
      <div class="acts"><button class="btn btn-ok" data-aceitar="${a.amizade_id}">Aceitar</button><button class="btn btn-ghost" data-agora-nao="${a.amizade_id}">Agora não</button></div></div>`).join("")}</div>` : "";
  const itens = feed || [];
  document.getElementById('amigosFeed').innerHTML = itens.length ? itens.map(a=>
    `<div class="feed-item"><div class="fp" style="${a.imagem_url ? `background-image:url('${esc(a.imagem_url)}')` : `background:${posterGradient(a.titulo)}`}"></div>
      <div><b>${esc(a.nome)}</b> ${fraseAtividade(a)}
        <div class="when">${tempoAtras(a.created_at)}${a.list_id ? ` · na lista <a href="${location.pathname}?lista=${a.list_id}">${esc(a.list_nome || "")}</a>` : ""}${a.tipo === "comentario" && a.detalhe ? ` · "${esc(a.detalhe)}"` : ""}</div></div></div>`).join("")
    : `<div class="empty-sm">${amigos.some(a=> a.status === "aceita") ? "Seus amigos ainda não fizeram nada por aqui." : "Quando você tiver amigos, o que eles reagirem, comentarem ou começarem a assistir aparece aqui."}</div>`;
  const lista = amigos.filter(a=> a.status === "aceita" || (a.status === "pendente" && !a.recebido));
  document.getElementById('amigosLista').innerHTML = lista.length ? lista.map(a=>
    `<div class="urow">${fotoHTML(a)}<div><span class="uname">${esc(a.nome)}</span><div class="umeta">${a.status === "aceita" ? `Amigos desde ${dataCurta(a.desde)}` : "Pedido enviado, aguardando resposta"}</div></div>
      <div class="acts">${a.status === "aceita" ? `<button class="btn btn-ghost" data-desfazer="${a.user_id}" data-nome="${esc(a.nome)}">Desfazer amizade</button>` : ""}</div></div>`).join("")
    : `<div class="empty-sm">Você ainda não tem amigos por aqui. Convide alguém ou adicione quem fez uma lista que você recebeu.</div>`;
}
document.querySelector('.tab-amigos').addEventListener('click', async e=>{
  const ac = e.target.closest('[data-aceitar]'), an = e.target.closest('[data-agora-nao]'), df = e.target.closest('[data-desfazer]');
  if(ac || an){
    const { error } = await sb.rpc('responder_amizade', { p_id: (ac || an).dataset[ac ? "aceitar" : "agoraNao"], p_aceitar: !!ac });
    if(error){ showToast("Não consegui responder agora"); return; }
    showToast(ac ? "Agora vocês são amigos" : "Pedido escondido");
    return loadAmigos();
  }
  if(df){
    if(!(await confirmar({ titulo:`Desfazer a amizade com ${df.dataset.nome}?`, texto:"Vocês deixam de ver a atividade um do outro.", botao:"Desfazer amizade", perigo:true }))) return;
    await sb.rpc('desfazer_amizade', { p_user: df.dataset.desfazer });
    showToast("Amizade desfeita");
    return loadAmigos();
  }
});

/* convidar amigo: o dono vai para Convites; membros geram um convite que vira pedido para o dono */
document.getElementById('btnConvidarAmigo').onclick = ()=>{
  if(profile?.papel === "dono"){
    setTab('pessoas');
    document.querySelector('.tab-people .subtabs button[data-sub="convites"]').click();
    setTimeout(()=> document.getElementById('invName').focus(), 50);
    return;
  }
  const publicas = lists.filter(l=> l.publica);
  abrirDialogo({
    titulo: "Convidar alguém novo",
    corpo: `<div class="muted">Para quem ainda não tem conta. Você gera um link para mandar; quando a pessoa entrar, o pedido chega para o Dieville aprovar e vocês já ficam amigos. Se a pessoa já usa o app, mande seu link de amizade.</div>
      <label class="lab" for="cvNome">Para quem?</label><input type="text" id="cvNome" maxlength="60" placeholder="Nome da pessoa">
      ${publicas.length ? `<label class="lab" for="cvLista">Começar com uma lista sua (opcional)</label><select id="cvLista"><option value="">Sem lista</option>${publicas.map(l=> `<option value="${l.id}">${esc(l.nome)}</option>`).join("")}</select>` : ""}
      <div id="cvRes"></div>`,
    botoes: [
      { texto:"Fechar" },
      { texto:"Gerar convite", classe:"btn-primary", fechar:false, acao: async btn=>{
          const nome = document.getElementById('cvNome').value.trim();
          if(!nome){ document.getElementById('cvNome').focus(); return false; }
          const lista = document.getElementById('cvLista')?.value || null;
          const { data, error } = await sb.from('invites').insert({ nome, lista_id: lista }).select().single();
          if(error){ showToast("Não consegui criar o convite"); return false; }
          const url = linkConvite(data);
          mostrarMensagemConvite(document.getElementById('cvRes'), url);
          btn.style.display = "none";
      } }
    ]
  });
};

/* ---------- reações e comentários na lista pública ---------- */
let rxEstado = null;
async function aoRenderListaPublica(l, itens){
  const membro = currentUser && profile?.status === "aprovado" && perfisAtivos;
  rxEstado = { lista: l, itens, membro, reacoes: [], contagens: [], comentarios: [], nomes: {} };
  if(membro){
    const [{ data: rs }, { data: cs }] = await Promise.all([
      sb.from('reacoes').select('title_id,user_id,tipo').eq('list_id', l.id),
      sb.from('comentarios').select('*').eq('list_id', l.id).order('created_at')
    ]);
    rxEstado.reacoes = rs || []; rxEstado.comentarios = cs || [];
    const ids = [...new Set([...rxEstado.reacoes.map(r=> r.user_id), ...rxEstado.comentarios.map(c=> c.user_id)])];
    if(ids.length){
      const { data: ps } = await sb.rpc('perfis_basicos', { p_ids: ids });
      (ps || []).forEach(p=> rxEstado.nomes[p.id] = p);
    }
    if(l.user_id !== currentUser.id) botaoAmizadeNaLista(l);
  }else{
    const { data } = await sbPublico.rpc('contagem_reacoes', { p_lista: l.id });
    rxEstado.contagens = data || [];
  }
  itens.forEach(t=> renderReacoesCard(t));
}
function contagensDe(tid){
  const c = {};
  if(rxEstado.membro) rxEstado.reacoes.filter(r=> r.title_id === tid).forEach(r=> c[r.tipo] = (c[r.tipo] || 0) + 1);
  else rxEstado.contagens.filter(r=> r.title_id === tid).forEach(r=> c[r.tipo] = r.total);
  return c;
}
function nomesLista(nomes){
  if(nomes.length === 1) return nomes[0];
  return nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
}
function renderReacoesCard(t){
  const card = document.querySelector(`#pubGrid .card[data-id="${t.id}"]`); if(!card) return;
  card.querySelector('.rx-box')?.remove();
  const c = contagensDe(t.id);
  const meu = rxEstado.membro ? rxEstado.reacoes.find(r=> r.title_id === t.id && r.user_id === currentUser.id)?.tipo : null;
  const top = Object.entries(c).sort((a,b)=> b[1] - a[1])[0];
  let quem = "";
  if(top){
    const r = REACOES.find(x=> x.v === top[0]);
    if(rxEstado.membro){
      const ns = rxEstado.reacoes.filter(x=> x.title_id === t.id && x.tipo === top[0]).map(x=> x.user_id === currentUser.id ? "Você" : (rxEstado.nomes[x.user_id]?.nome || "alguém").split(" ")[0]);
      const mostrar = ns.slice(0, 3), resto = ns.length - mostrar.length;
      const sujeito = resto > 0 ? `${mostrar.join(", ")} e mais ${resto}` : nomesLista(mostrar);
      const verbo = ns.length === 1 ? (ns[0] === "Você" ? r.um.replace("vai ver", "vai ver") : r.um) : r.varios;
      quem = `${r.ic} ${esc(sujeito)} ${verbo}`;
    }else{
      quem = `${r.ic} ${plural(top[1], "pessoa", "pessoas")} ${top[1] === 1 ? r.um : r.varios}`;
    }
  }
  const box = document.createElement('div');
  box.className = "rx-box";
  if(!rxEstado.membro){ if(quem){ box.innerHTML = `<div class="rx-cnt">${quem}</div>`; card.appendChild(box); } return; }
  box.innerHTML = `<div class="reactions" role="group" aria-label="Reações a ${esc(t.titulo)}">${REACOES.map(r=>
      `<button type="button" class="rx ${meu === r.v ? "on" : ""} ${rxEstado.membro ? "" : "off"}" data-rx="${r.v}" aria-pressed="${meu === r.v}">${r.ic} ${r.txt}${c[r.v] ? ` <span class="n">${c[r.v]}</span>` : ""}</button>`).join("")}</div>
    <div class="rx-who">${quem || (rxEstado.membro ? "<i>Ninguém reagiu ainda. Seja o primeiro.</i>" : "")}</div>
    ${rxEstado.membro ? comentariosHTML(t) : ""}`;
  card.appendChild(box);
  box.addEventListener('click', e=> cliqueReacao(e, t));
  const inp = box.querySelector('.cm-form input');
  if(inp){
    const cnt = box.querySelector('.cm-form .count');
    inp.addEventListener('input', ()=> cnt.textContent = `${inp.value.length}/280`);
    inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); box.querySelector('[data-enviar-cm]').click(); } });
  }
}
function comentariosHTML(t){
  const cs = rxEstado.comentarios.filter(c=> c.title_id === t.id);
  const souDonoLista = rxEstado.lista.user_id === currentUser.id;
  return `<div class="cms">${cs.map(c=>{
      const p = c.user_id === currentUser.id ? { nome: profile?.nome || "Você", avatar_url: profile?.avatar_url } : rxEstado.nomes[c.user_id];
      const pode = c.user_id === currentUser.id || souDonoLista;
      return `<div class="cm">${fotoHTML(p, "av")}<div style="flex:1;min-width:0"><b>${esc(c.user_id === currentUser.id ? "Você" : (p?.nome || "Membro"))}</b> ${esc(c.texto)}<div class="when">${tempoAtras(c.created_at)}</div></div>${pode ? `<button type="button" class="cm-del" data-del-cm="${c.id}">Apagar</button>` : ""}</div>`;
    }).join("")}
    <div class="cm-form"><input type="text" maxlength="280" placeholder="Comentar…" aria-label="Comentário sobre ${esc(t.titulo)}"><span class="count">0/280</span><button type="button" class="btn btn-primary" data-enviar-cm>Enviar</button></div></div>`;
}
async function cliqueReacao(e, t){
  const rxb = e.target.closest('[data-rx]');
  if(rxb){
    if(!rxEstado.membro) return mostrarConviteReagir(rxb.closest('.rx-box'));
    const tipo = rxb.dataset.rx;
    const atual = rxEstado.reacoes.find(r=> r.title_id === t.id && r.user_id === currentUser.id);
    if(atual && atual.tipo === tipo){
      const { error } = await sb.from('reacoes').delete().eq('list_id', rxEstado.lista.id).eq('title_id', t.id).eq('user_id', currentUser.id);
      if(error){ showToast("Não consegui tirar a reação"); return; }
      rxEstado.reacoes = rxEstado.reacoes.filter(r=> r !== atual);
    }else{
      const { error } = await sb.from('reacoes').upsert({ list_id: rxEstado.lista.id, title_id: t.id, user_id: currentUser.id, tipo }, { onConflict:'list_id,title_id,user_id' });
      if(error){ console.error(error); showToast("Não consegui salvar a reação"); return; }
      if(atual) atual.tipo = tipo; else rxEstado.reacoes.push({ title_id: t.id, user_id: currentUser.id, tipo });
      if(tipo === "vou_ver") perguntarAdicionar(t);
    }
    renderReacoesCard(t);
    return;
  }
  const del = e.target.closest('[data-del-cm]');
  if(del){
    if(!(await confirmar({ titulo:"Apagar este comentário?", botao:"Apagar", perigo:true }))) return;
    const { error } = await sb.from('comentarios').delete().eq('id', del.dataset.delCm);
    if(error){ showToast("Não consegui apagar o comentário"); return; }
    rxEstado.comentarios = rxEstado.comentarios.filter(c=> c.id !== del.dataset.delCm);
    renderReacoesCard(t);
    return;
  }
  const env = e.target.closest('[data-enviar-cm]');
  if(env){
    const inp = env.closest('.cm-form').querySelector('input');
    const texto = inp.value.trim(); if(!texto){ inp.focus(); return; }
    env.disabled = true;
    const { data, error } = await sb.from('comentarios').insert({ list_id: rxEstado.lista.id, title_id: t.id, texto }).select().single();
    env.disabled = false;
    if(error){ console.error(error); showToast("Não consegui enviar o comentário"); return; }
    rxEstado.comentarios.push(data);
    renderReacoesCard(t);
  }
}
function mostrarConviteReagir(box){
  if(box.querySelector('.rx-gate')) return;
  const g = document.createElement('div');
  g.className = "rx-gate";
  g.innerHTML = `<b>Quer reagir e comentar?</b><br>Entre com sua conta do Dieville Watches. Se ainda não tem, peça acesso.<div style="margin-top:10px"><button class="btn btn-primary" data-google>Entrar ou pedir acesso</button></div>`;
  box.appendChild(g);
}

/* "Vou ver": pergunta antes de mexer no catálogo */
let catalogoCarregado = false;
async function perguntarAdicionar(t){
  if(rxEstado.lista.user_id === currentUser.id) return;
  if(!catalogoCarregado){ await loadShows(); catalogoCarregado = true; }
  if(findDup(t.titulo, t.tmdbId ? { id: t.tmdbId, media: t.tmdbMedia } : null, null)) return;
  abrirDialogo({
    titulo: "Adicionar ao seu catálogo?",
    corpo: `<div class="muted"><b style="color:var(--text)">${esc(t.titulo)}</b> entra no seu catálogo como <b style="color:var(--text)">Quero ver</b>, com capa, gênero e carga já preenchidos.</div>`,
    botoes: [
      { texto:"Só marcar" },
      { texto:"Adicionar", classe:"btn-primary", acao: async ()=>{
          const { data: novo, error } = await sb.rpc('import_title', { p_lista: rxEstado.lista.id, p_title: t.id });
          if(error){ console.error(error); showToast("Não consegui adicionar ao catálogo"); return; }
          if(!novo){ showToast("Esse título já está no seu catálogo"); return; }
          catalogoCarregado = false;
          showToast(`✓ ${t.titulo} adicionado ao seu catálogo`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{
            const { error: e2 } = await sb.from('titles').delete().eq('id', novo).eq('user_id', currentUser.id);
            showToast(e2 ? "Não consegui desfazer" : "Pronto, tirei do seu catálogo");
          } });
      } }
    ]
  });
}

/* botão de amizade na lista de outro membro */
async function botaoAmizadeNaLista(l){
  const box = document.getElementById('pubCta');
  if(!box || box.querySelector('[data-amizade]')) return;
  if(!amigos.length){ const { data } = await sb.rpc('meus_amigos'); amigos = data || []; }
  const rel = amigos.find(a=> a.user_id === l.user_id);
  const nome = (await sb.rpc('list_owner_name', { p_lista: l.id })).data || "o dono da lista";
  const primeiro = nome.split(" ")[0];
  const row = box.querySelector('.row-btns') || box;
  const b = document.createElement('button');
  b.className = "btn btn-ghost"; b.dataset.amizade = "1";
  if(rel?.status === "aceita"){ b.textContent = `✓ Você e ${primeiro} são amigos`; b.disabled = true; }
  else if(rel?.status === "pendente" && !rel.recebido){ b.textContent = "Pedido de amizade enviado"; b.disabled = true; }
  else b.textContent = rel?.recebido ? `Aceitar amizade de ${primeiro}` : `Adicionar ${primeiro} como amigo`;
  b.onclick = async ()=>{
    b.disabled = true;
    const { data, error } = await sb.rpc('pedir_amizade', { p_user: l.user_id });
    if(error || !data?.ok){ showToast("Não consegui enviar o pedido de amizade"); b.disabled = false; return; }
    b.textContent = data.status === "aceita" ? `✓ Você e ${primeiro} são amigos` : "Pedido de amizade enviado";
    const { data: am } = await sb.rpc('meus_amigos'); amigos = am || [];
  };
  row.appendChild(b);
}
