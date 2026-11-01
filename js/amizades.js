/* Dieville Watches: link de amizade, sugestões de amigos e retorno ao abrir links */

const URL_AMIGO = c=> `${location.origin}${location.pathname}?amigo=${c}`;
let meuLinkAmizade = null;
let sugEnviadas = new Set();

/* ---------- meu link ---------- */
async function carregarMeuLink(novo = false){
  const { data, error } = await sb.rpc('meu_link_amizade', { p_novo: novo });
  if(error){ document.getElementById('amLinkTxt').textContent = "Não consegui carregar o link"; return null; }
  meuLinkAmizade = data;
  document.getElementById('amLinkTxt').textContent = URL_AMIGO(data).replace(/^https?:\/\//, "");
  return data;
}
document.getElementById('btnCopiarLinkAmizade').onclick = async ()=>{
  const c = meuLinkAmizade || await carregarMeuLink();
  if(!c) return;
  const url = URL_AMIGO(c);
  if(navigator.share){ try{ await navigator.share({ title:"Vamos ser amigos no Dieville Watches", url }); return; }catch(e){ if(e.name === 'AbortError') return; } }
  try{ await navigator.clipboard.writeText(url); showToast("Link de amizade copiado"); }catch(e){ prompt("Copie seu link de amizade:", url); }
};
document.getElementById('btnNovoLinkAmizade').onclick = ()=>{
  abrirDialogo({
    titulo: "Gerar um link novo?",
    corpo: `<div class="muted">O link antigo para de funcionar. Quem já é seu amigo continua amigo.</div>`,
    botoes: [{ texto:"Cancelar" }, { texto:"Gerar link novo", classe:"btn-primary", acao: async ()=>{ if(await carregarMeuLink(true)) showToast("Link novo pronto"); } }]
  });
};

/* ---------- sugestões ---------- */
async function carregarSugestoes(){
  const box = document.getElementById('amigosSugBox');
  const { data, error } = await sb.rpc('sugestoes_amigos');
  const itens = (data || []).filter(p=> !amigos.some(a=> a.user_id === p.user_id) || sugEnviadas.has(p.user_id));
  if(error || !itens.length){ box.style.display = "none"; return; }
  box.style.display = "";
  document.getElementById('amigosSugestoes').innerHTML = itens.map(p=>
    `<div class="urow">${fotoHTML(p)}<div><span class="uname">${esc(p.nome || "Sem nome")}</span><div class="umeta">${p.via === (profile?.nome || "") ? "Também usa o app" : `Amigo de ${esc(p.via)}`}</div></div>
      <div class="acts">${sugEnviadas.has(p.user_id)
        ? `<span class="am-enviado" role="status">✓ Pedido enviado</span>`
        : `<button class="btn btn-ghost" type="button" data-sugerido="${p.user_id}" aria-label="Adicionar ${esc(p.nome || "")} como amigo">Adicionar</button>`}</div></div>`).join("");
}
document.getElementById('amigosSugestoes').addEventListener('click', async e=>{
  const b = e.target.closest('[data-sugerido]'); if(!b) return;
  b.disabled = true;
  const { data, error } = await sb.rpc('pedir_amizade', { p_user: b.dataset.sugerido });
  if(error || !data?.ok){ b.disabled = false; showToast("Não consegui enviar o pedido"); return; }
  if(data.status === "aceita"){ showToast("Agora vocês são amigos"); return loadAmigos(); }
  sugEnviadas.add(b.dataset.sugerido);
  b.outerHTML = `<span class="am-enviado" role="status">✓ Pedido enviado</span>`;
});

const _loadAmigosOrig = loadAmigos;
loadAmigos = async function(){
  await _loadAmigosOrig();
  carregarSugestoes();
  if(!meuLinkAmizade) carregarMeuLink();
};

/* ---------- aparecer nas sugestões ---------- */
function atualizarSugestoesMenu(){
  const on = profile?.aparecer_sugestoes !== false;
  document.getElementById('sugestoesTxt').textContent = on ? "ligado" : "desligado";
  document.getElementById('btnSugestoes').setAttribute('aria-checked', on);
}
document.getElementById('btnSugestoes').onclick = async ()=>{
  const novo = profile?.aparecer_sugestoes === false;
  const { error } = await sb.rpc('set_aparecer_sugestoes', { p_valor: novo });
  if(error){ showToast("Não consegui mudar essa opção"); return; }
  profile.aparecer_sugestoes = novo;
  atualizarSugestoesMenu();
  showToast(novo ? "Amigos dos seus amigos podem ver você nas sugestões" : "Você não aparece mais nas sugestões", { ms:3500 });
};

/* ---------- quem abre um link: sempre aparece algo na tela ---------- */
function dialogoPessoa(r, titulo, texto, botoes){
  abrirDialogo({
    titulo,
    classe: "am-dlg",
    corpo: `<div class="am-pessoa">${r?.nome !== undefined ? fotoHTML({ nome:r.nome, avatar_url:r.avatar_url }, "am-av") : ""}<p class="muted">${texto}</p></div>`,
    botoes
  });
}
function irParaAmigos(){ setTab('amigos'); }

async function tratarLinkAmizade(codigo){
  const { data: r, error } = await sb.rpc('ver_link_amizade', { p_codigo: codigo });
  if(error){ showToast("Não consegui abrir o link de amizade"); return; }
  const nome = esc(r.nome || "Essa pessoa");
  if(r.estado === "proprio") return dialogoPessoa(null, "Esse é o seu link", "Mande para quem você quer adicionar como amigo.",
    [{ texto:"Fechar" }, { texto:"Copiar link", classe:"btn-primary", acao: ()=> document.getElementById('btnCopiarLinkAmizade').click() }]);
  if(r.estado === "ja_amigos") return dialogoPessoa(r, "Vocês já são amigos", `Você e ${nome} já são amigos por aqui.`,
    [{ texto:"Fechar" }, { texto:"Ver amigos", classe:"btn-primary", acao: irParaAmigos }]);
  if(r.estado !== "pode") return dialogoPessoa(null, "Esse link não funciona mais", "Peça um link novo para quem te enviou.", [{ texto:"Fechar", classe:"btn-primary" }]);
  dialogoPessoa(r, `${r.nome || "Alguém"} quer ser seu amigo`, "Vocês vão ver o que o outro está assistindo e as reações nas listas.", [
    { texto:"Agora não" },
    { texto:"Aceitar amizade", classe:"btn-primary", acao: async ()=>{
        const { data, error } = await sb.rpc('aceitar_link_amizade', { p_codigo: codigo });
        if(error || !data?.ok){ showToast("Não consegui aceitar a amizade"); return false; }
        showToast(`Agora você e ${r.nome || "essa pessoa"} são amigos`, { acao:"Ver amigos", onAcao: irParaAmigos, ms:5000 });
      } }
  ]);
}

async function tratarConviteDeMembro(codigo){
  const { data: r, error } = await sb.rpc('convite_ja_membro', { p_codigo: codigo });
  if(error) return;
  const nome = esc(r.nome || "Essa pessoa");
  if(r.estado === "proprio") return dialogoPessoa(null, "Esse convite é seu", "Ele serve para quem ainda não tem conta. Para quem já usa o app, mande seu link de amizade.",
    [{ texto:"Fechar" }, { texto:"Ver meu link", classe:"btn-primary", acao: irParaAmigos }]);
  if(r.estado === "ja_amigos") return dialogoPessoa(r, "Você já tem acesso", `Esse era um convite para quem ainda não tem conta. Você e ${nome} já são amigos.`,
    [{ texto:"Fechar", classe:"btn-primary" }]);
  if(r.estado !== "pode") return dialogoPessoa(null, "Você já tem acesso", "Esse era um convite para quem ainda não tem conta, então não muda nada para você.", [{ texto:"Fechar", classe:"btn-primary" }]);
  dialogoPessoa(r, "Você já tem acesso", `Esse era um convite para quem ainda não tem conta. Quer adicionar ${nome} como amigo?`, [
    { texto:"Agora não" },
    { texto:`Adicionar ${r.nome || "como amigo"}`, classe:"btn-primary", acao: async ()=>{
        const { data, error } = await sb.rpc('convite_ja_membro', { p_codigo: codigo, p_aceitar: true });
        if(error || data?.estado !== "aceita"){ showToast("Não consegui adicionar agora"); return false; }
        showToast(`Agora você e ${r.nome || "essa pessoa"} são amigos`, { acao:"Ver amigos", onAcao: irParaAmigos, ms:5000 });
      } }
  ]);
}

const _aoIniciarAmOrig = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarAmOrig();
  atualizarSugestoesMenu();
  let codigo = null;
  try{ codigo = localStorage.getItem('dw-amigo'); localStorage.removeItem('dw-amigo'); }catch(e){}
  if(codigo) return setTimeout(()=> tratarLinkAmizade(codigo), 400);
  if(linkPendente?.convite){ const c = linkPendente.convite; linkPendente = null; setTimeout(()=> tratarConviteDeMembro(c), 400); }
};

/* ---------- visitante abrindo um link de amizade ---------- */
async function loadAmigoLanding(codigo){
  document.body.dataset.mode = "public";
  document.querySelector('#publicView .eyebrow').innerHTML = `<span class="dot"></span> Amizade`;
  const { data: r } = await sbPublico.rpc('ver_link_amizade', { p_codigo: codigo });
  const box = document.getElementById('pubCta');
  const gbtn = `<button class="btn btn-google" data-google>${document.querySelector('[data-google]').innerHTML}</button>`;
  if(r && r.estado !== "invalido"){
    document.getElementById('pubTitle').textContent = `${r.nome || "Um amigo"} usa o Dieville Watches`;
    document.getElementById('pubSub').textContent = "Entre com o Google. Se você já tem acesso, a amizade aparece na hora; se ainda não tem, peça acesso e o Dieville decide.";
    box.className = "pub-cta inv"; box.innerHTML = `<div class="row-btns">${gbtn}</div>`;
  }else{
    document.getElementById('pubTitle').textContent = "Link indisponível";
    document.getElementById('pubSub').textContent = "Esse link de amizade não funciona mais. Peça um link novo para quem te enviou.";
    box.className = "pub-cta"; box.innerHTML = `<div class="row-btns"><button class="btn btn-ghost" data-google>Entrar</button></div>`;
  }
  box.style.display = "block";
}

/* ---------- aviso para quem entrou por link de grupo: agora é amigo do dono ---------- */
const _aoIniciarGrpOrig = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarGrpOrig();
  if(!currentUser || profile?.papel === "dono") return;
  let visto = false; try{ visto = !!localStorage.getItem('dw-aviso-grupo'); }catch(e){}
  if(visto) return;
  setTimeout(async ()=>{
    const { data, error } = await sb.rpc('meu_convite_grupo');
    if(error || !data?.grupo) return;
    try{ localStorage.setItem('dw-aviso-grupo', '1'); }catch(e){}
    if(document.querySelector('#dlgOverlay.open')) return;
    const dono = "Dieville";
    abrirDialogo({
      titulo: `Você e o ${dono} agora são amigos`,
      corpo: `<p>Você entrou pelo link <b>${esc(data.nome)}</b>. O ${dono} passa a ver o que você começa a assistir e você vê o que ele assiste.</p><p class="muted">Se preferir, dá para desligar o seu lado agora. Você muda isso quando quiser no menu da conta.</p>`,
      botoes: [
        { texto:"Desligar o meu lado", acao: async ()=>{ const { error:e2 } = await sb.rpc('set_compartilhar', { p_valor:false }); if(e2){ showToast("Não consegui mudar essa opção"); return false; } profile.compartilhar_assistindo = false; if(typeof atualizarCompartilhar === 'function') atualizarCompartilhar(); showToast("Seus amigos não vão ver o que você assiste"); } },
        { texto:"Manter ligado", classe:"btn-primary" }
      ]
    });
  }, 1200);
};
