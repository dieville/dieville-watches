/* Dieville Watches: feedback sobre a plataforma e "O que melhorou" */

let feedbacks = [], filtroFb = "novo", fbVistosAgora = new Set();
const TIPO_FB = { erro:"🐞 ERRO", ideia:"💡 IDEIA", outro:"💬 OUTRO" };

function telaAtual(){
  if(document.body.dataset.mode !== "app") return "Lista compartilhada";
  return { catalogo:"Catálogo", listas:"Listas", amigos:"Amigos", pessoas:"Usuários" }[document.body.dataset.tab] || "Catálogo";
}
function aparelhoAtual(){
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "outro aparelho";
  const nav = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${so}, ${nav}`;
}

/* ---------- membro: enviar ---------- */
function abrirFeedback({ tipo = "", texto = "" } = {}){
  document.getElementById('acctMenu').classList.remove('open');
  let imagem = null;
  const tela = telaAtual(), aparelho = aparelhoAtual();
  abrirDialogo({
    titulo: "Ajude a melhorar o app",
    corpo: `<div class="muted">Só o Dieville lê. Quando virar melhoria, você recebe um retorno.</div>
      <span class="lab" id="fbTipoLab">O que você quer contar?</span>
      <div class="chip-group" id="fbTipo" role="radiogroup" aria-labelledby="fbTipoLab">
        <button type="button" class="chip" data-v="erro" role="radio">🐞 Encontrei um erro</button>
        <button type="button" class="chip" data-v="ideia" role="radio">💡 Tenho uma ideia</button>
        <button type="button" class="chip" data-v="outro" role="radio">💬 Outro</button>
      </div>
      <label class="lab" for="fbTexto">Conte com suas palavras</label>
      <textarea id="fbTexto" maxlength="1000" placeholder="O que aconteceu, ou o que você gostaria que existisse?">${esc(texto)}</textarea>
      <div class="count" id="fbCount">0/1000</div>
      <span class="lab">Imagem da tela (opcional)</span>
      <label class="attach" id="fbAttach" tabindex="0"><span id="fbAttachTxt">🖼️ Anexar um print</span><input type="file" id="fbImg" accept="image/*" class="sr-only"></label>
      <div class="auto">Vamos enviar junto: a tela em que você está (${esc(tela)}) e o tipo de aparelho (${esc(aparelho)}). Isso ajuda a achar erros mais rápido.</div>`,
    botoes: [
      { texto:"Cancelar" },
      { texto:"Enviar", classe:"btn-primary", id:"fbEnviar", acao: async ()=>{
          const t = document.querySelector('#fbTipo .chip.on')?.dataset.v;
          const txt = document.getElementById('fbTexto').value.trim();
          if(!t || !txt) return false;
          let imagem_path = null, imagem_bytes = null;
          if(imagem){
            const path = `${currentUser.id}/${crypto.randomUUID()}.jpg`;
            const { error: eUp } = await sb.storage.from('feedback').upload(path, imagem, { contentType:'image/jpeg' });
            if(eUp){ console.error(eUp); showToast("Não consegui enviar a imagem. O texto vai sem ela.", { ms:4000 }); }
            else { imagem_path = path; imagem_bytes = imagem.size; }
          }
          const { error } = await sb.from('feedback').insert({ tipo: t, texto: txt, tela, aparelho, imagem_path, imagem_bytes });
          if(error){ console.error(error); document.getElementById('fbCount').textContent = "Não consegui enviar agora. Tente de novo."; return false; }
          showToast({ erro:"Obrigado! O erro chegou para o Dieville.", ideia:"Obrigado! Sua ideia chegou para o Dieville.", outro:"Obrigado! Sua mensagem chegou para o Dieville." }[t], { ms:3500 });
      } }
    ],
    aoAbrir: corpo=>{
      const enviar = document.getElementById('fbEnviar');
      const ta = corpo.querySelector('#fbTexto');
      const valida = ()=>{
        corpo.querySelector('#fbCount').textContent = `${ta.value.length}/1000`;
        enviar.disabled = !(corpo.querySelector('#fbTipo .chip.on') && ta.value.trim());
      };
      corpo.querySelectorAll('#fbTipo .chip').forEach(c=>{
        c.setAttribute('aria-checked', c.dataset.v === tipo);
        c.classList.toggle('on', c.dataset.v === tipo);
        c.onclick = ()=>{ corpo.querySelectorAll('#fbTipo .chip').forEach(x=>{ x.classList.toggle('on', x === c); x.setAttribute('aria-checked', x === c); }); valida(); };
      });
      ta.addEventListener('input', valida);
      corpo.querySelector('#fbAttach').addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); corpo.querySelector('#fbImg').click(); } });
      corpo.querySelector('#fbImg').addEventListener('change', async e=>{
        const f = e.target.files[0]; if(!f) return;
        try{
          const dataUrl = await reduzirImagem(f, 1600);
          imagem = await (await fetch(dataUrl)).blob();
          corpo.querySelector('#fbAttachTxt').innerHTML = `<img src="${dataUrl}" alt=""> Print anexado · <b style="color:var(--amber)">trocar</b>`;
        }catch(err){ showToast("Não consegui usar essa imagem", { ms:3000 }); }
      });
      valida();
    }
  });
}
function reduzirImagem(file, maxDim){
  return new Promise((ok, falha)=>{
    const r = new FileReader();
    r.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = ()=> falha(new Error('imagem inválida'));
      img.src = e.target.result;
    };
    r.onerror = ()=> falha(new Error('leitura'));
    r.readAsDataURL(file);
  });
}
document.getElementById('btnFeedback').onclick = ()=> abrirFeedback();

/* ---------- membro: meus feedbacks ---------- */
async function abrirMeusFeedbacks(){
  document.getElementById('acctMenu').classList.remove('open');
  const { data, error } = await sb.from('feedback').select('id,tipo,texto,situacao,resposta,created_at').eq('user_id', currentUser.id).order('created_at', { ascending:false });
  if(error){ showToast("Não consegui abrir seus feedbacks"); return; }
  const itens = data || [];
  abrirDialogo({
    titulo: "Meus feedbacks",
    corpo: itens.length ? itens.map(f=>{
      const sit = f.situacao === "resolvido" && f.resposta
        ? `<div class="fb-resp"><b>✓ ${f.tipo === "erro" ? "Corrigido" : "Virou melhoria"}</b><div>"${esc(f.resposta)}" · Dieville</div></div>`
        : `<div class="muted" style="margin-top:8px">${f.situacao === "novo" ? "Enviado" : "✓ Recebido pelo Dieville"}</div>`;
      return `<div class="fbi"><span class="kind k-${f.tipo}">${TIPO_FB[f.tipo]}</span><span class="muted">enviado em ${dataCurta(f.created_at)}</span><div class="txt">${esc(f.texto)}</div>${sit}</div>`;
    }).join("") : `<div class="empty-sm">Você ainda não enviou nenhum feedback.</div>`,
    botoes: [{ texto:"Enviar um novo", classe:"btn-ghost", acao: ()=>{ setTimeout(()=> abrirFeedback(), 50); } }, { texto:"Fechar", classe:"btn-primary" }]
  });
  if(itens.some(f=> f.situacao === "resolvido" && f.resposta)){
    sb.rpc('feedback_respostas_vistas').then(()=> verificarRespostasFeedback(), ()=>{});
  }
}
document.getElementById('btnMeusFeedbacks').onclick = abrirMeusFeedbacks;

async function verificarRespostasFeedback(avisar){
  const { count } = await sb.from('feedback').select('id', { count:'exact', head:true })
    .eq('user_id', currentUser.id).eq('situacao', 'resolvido').eq('resposta_vista', false).not('resposta', 'is', null);
  const b = document.getElementById('fbRespBadge');
  b.textContent = count || ""; b.style.display = count ? "" : "none";
  if(avisar && count) showToast("O Dieville respondeu seu feedback", { acao:"Ver", onAcao: abrirMeusFeedbacks, ms:7000 });
}

/* ---------- todos: O que melhorou ---------- */
async function abrirMelhorias(){
  document.getElementById('acctMenu').classList.remove('open');
  const { data } = await sb.from('melhorias').select('*').order('created_at', { ascending:false }).limit(50);
  const itens = data || [];
  abrirDialogo({
    titulo: "O que melhorou",
    corpo: itens.length ? `<div class="muted" style="margin-bottom:6px">Mudanças no app, muitas vindas de sugestões de quem usa.</div>` + itens.map(m=>
      `<div class="fbi" style="display:flex;gap:10px;align-items:flex-start"><span class="kind k-${m.tipo}" style="margin:2px 0 0">${m.tipo === "corrigido" ? "CORRIGIDO" : "NOVO"}</span><div><b>${esc(m.titulo)}</b><div class="muted">${dataCurta(m.created_at)}${m.credito_nome ? ` · ideia de ${esc(m.credito_nome)}` : ""}</div></div></div>`).join("")
      : `<div class="empty-sm">Ainda não há melhorias publicadas.</div>`,
    botoes: [{ texto:"Fechar", classe:"btn-primary" }]
  });
}
document.getElementById('btnMelhorias').onclick = abrirMelhorias;

/* ---------- dono: caixa de entrada ---------- */
function feedbackNovos(){ return feedbacks.filter(f=> f.situacao === "novo").length; }
async function loadFeedbackDono(){
  const { data, error } = await sb.from('feedback').select('*').order('created_at', { ascending:false });
  if(error){ console.error(error); return; }
  feedbacks = data || [];
  renderFeedbackDono(); atualizarBadgesUsuarios();
}
function renderFeedbackDono(){
  const situ = f=> fbVistosAgora.has(f.id) ? "novo" : f.situacao;
  const cont = { novo: feedbacks.filter(f=> situ(f) === "novo").length, recebido: feedbacks.filter(f=> situ(f) === "recebido").length, resolvido: feedbacks.filter(f=> f.situacao === "resolvido").length, todos: feedbacks.length };
  const nomes = { novo:"Novos", recebido:"Recebidos", resolvido:"Resolvidos", todos:"Todos" };
  document.getElementById('fbFilters').innerHTML = Object.keys(nomes).map(k=> `<button type="button" class="${filtroFb === k ? "on" : ""}" data-f="${k}" aria-pressed="${filtroFb === k}">${nomes[k]}<small>${cont[k]}</small></button>`).join("");
  const lista = feedbacks.filter(f=> filtroFb === "todos" || situ(f) === filtroFb || (filtroFb === "resolvido" && f.situacao === "resolvido"));
  document.getElementById('fbList').innerHTML = lista.length ? lista.map(f=>{
    const autor = usuarios.find(u=> u.id === f.user_id);
    const kb = f.imagem_bytes ? `${Math.max(1, Math.round(f.imagem_bytes / 1024))} KB` : "";
    const img = f.imagem_path ? `<div class="acts"><span class="muted">🖼️ 1 imagem${kb ? " · " + kb : ""}</span><button class="btn btn-ghost" data-ver="${f.id}">Ver</button><button class="btn btn-no" data-apagar="${f.id}">Apagar imagem</button></div>` : "";
    const fim = f.situacao === "resolvido"
      ? `<div class="fb-resp"><b>✓ Resolvido em ${dataCurta(f.resolvido_em)}</b>${f.resposta ? `<div>Retorno enviado: "${esc(f.resposta)}"</div>` : `<div class="muted">Sem retorno para a pessoa.</div>`}</div>`
      : `<div class="acts"><span class="muted">${situ(f) === "novo" ? "Novo" : "Recebido"}</span><button class="btn btn-primary" data-resolver="${f.id}">Marcar como resolvido</button></div>`;
    return `<div class="fbi"><span class="kind k-${f.tipo}">${TIPO_FB[f.tipo]}</span><b>${esc(autor?.nome || autor?.email || "Membro")}</b> <span class="muted">· ${tempoAtras(f.created_at)} · ${esc(f.tela || "")}${f.aparelho ? " · " + esc(f.aparelho) : ""}</span><div class="txt">${esc(f.texto)}</div>${img}${fim}</div>`;
  }).join("") : `<div class="empty-sm">${filtroFb === "novo" ? "Nenhum feedback novo." : "Nada por aqui."}</div>`;
}
// abriu a subaba: o que era novo passa a "recebido" (continua aparecendo como novo até sair da tela)
async function abriuFeedbackDono(){
  const novos = feedbacks.filter(f=> f.situacao === "novo").map(f=> f.id);
  if(!novos.length) return;
  novos.forEach(id=> fbVistosAgora.add(id));
  const { error } = await sb.from('feedback').update({ situacao:"recebido" }).in('id', novos);
  if(!error) feedbacks.forEach(f=>{ if(novos.includes(f.id)) f.situacao = "recebido"; });
  atualizarBadgesUsuarios();
}
document.getElementById('fbFilters').addEventListener('click', e=>{
  const b = e.target.closest('button[data-f]'); if(!b) return;
  filtroFb = b.dataset.f; renderFeedbackDono();
});
document.getElementById('fbList').addEventListener('click', async e=>{
  const ver = e.target.closest('[data-ver]');
  if(ver){
    const f = feedbacks.find(x=> x.id === ver.dataset.ver);
    const { data, error } = await sb.storage.from('feedback').createSignedUrl(f.imagem_path, 300);
    if(error){ showToast("Não consegui abrir a imagem"); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
    return;
  }
  const ap = e.target.closest('[data-apagar]');
  if(ap){
    if(!(await confirmar({ titulo:"Apagar a imagem deste feedback?", texto:"O texto continua guardado.", botao:"Apagar imagem", perigo:true }))) return;
    if(await apagarImagemFeedback(ap.dataset.apagar)){ showToast("Imagem apagada"); renderFeedbackDono(); }
    return;
  }
  const rs = e.target.closest('[data-resolver]');
  if(rs) abrirResolver(feedbacks.find(x=> x.id === rs.dataset.resolver));
});
async function apagarImagemFeedback(id){
  const f = feedbacks.find(x=> x.id === id);
  if(!f?.imagem_path) return true;
  const { error } = await sb.storage.from('feedback').remove([f.imagem_path]);
  if(error){ showToast("Não consegui apagar a imagem"); return false; }
  await sb.from('feedback').update({ imagem_path:null, imagem_bytes:null }).eq('id', id);
  f.imagem_path = null; f.imagem_bytes = null;
  return true;
}
function abrirResolver(f){
  const autor = usuarios.find(u=> u.id === f.user_id);
  const nome = (autor?.nome || "a pessoa").split(" ")[0];
  abrirDialogo({
    titulo: "Marcar como resolvido",
    corpo: `<div class="muted">${TIPO_FB[f.tipo].split(" ")[0]} ${esc(autor?.nome || "Membro")}: "${esc(f.texto.length > 90 ? f.texto.slice(0, 90) + "…" : f.texto)}"</div>
      <label class="lab" for="rsResp">Retorno para ${esc(nome)} (opcional)</label>
      <textarea id="rsResp" maxlength="300" placeholder="${f.tipo === "erro" ? "Ex.: Corrigido! Obrigado por avisar." : "Ex.: Sua ideia virou realidade! Agora dá para…"}"></textarea>
      <div class="muted" style="font-size:12px;margin-top:4px">Se ficar em branco, ${esc(nome)} não recebe retorno.</div>
      <label class="check"><input type="checkbox" id="rsPub" ${f.tipo === "outro" ? "" : "checked"}><span>Publicar em "O que melhorou" para todos</span></label>
      <div id="rsPubBox"><label class="lab" for="rsTit">Como aparece na lista</label><input type="text" id="rsTit" maxlength="140" placeholder="Ex.: Filtro por streaming no catálogo">
        <div class="muted" style="font-size:12px;margin-top:4px">${f.tipo === "ideia" ? `Aparece com "ideia de ${esc(nome)}".` : `Aparece como "Corrigido".`}</div></div>
      ${f.imagem_path ? `<label class="check"><input type="checkbox" id="rsImg" checked><span>Apagar a imagem anexada</span></label>` : ""}`,
    botoes: [
      { texto:"Cancelar" },
      { texto:"Resolver", classe:"btn-primary", acao: async ()=>{
          const resposta = document.getElementById('rsResp').value.trim() || null;
          const pub = document.getElementById('rsPub').checked;
          const titulo = document.getElementById('rsTit').value.trim();
          if(pub && !titulo){ document.getElementById('rsTit').focus(); showToast("Escreva como a melhoria aparece na lista", { ms:3000 }); return false; }
          if(document.getElementById('rsImg')?.checked){ if(!(await apagarImagemFeedback(f.id))) return false; }
          const { error } = await sb.from('feedback').update({ situacao:"resolvido", resposta, resolvido_em: new Date().toISOString(), resposta_vista:false }).eq('id', f.id);
          if(error){ showToast("Não consegui marcar como resolvido"); return false; }
          if(pub){
            const { error: e2 } = await sb.from('melhorias').insert({ titulo, tipo: f.tipo === "erro" ? "corrigido" : "novo", credito_nome: f.tipo === "ideia" ? (autor?.nome || null) : null, feedback_id: f.id });
            if(e2) showToast("Resolvido, mas não consegui publicar em O que melhorou");
          }
          showToast(resposta ? `Resolvido. ${nome} vai ver seu retorno.` : "Resolvido");
          loadFeedbackDono();
      } }
    ],
    aoAbrir: corpo=>{
      const box = corpo.querySelector('#rsPubBox');
      const cb = corpo.querySelector('#rsPub');
      const sync = ()=> box.style.display = cb.checked ? "" : "none";
      cb.addEventListener('change', sync); sync();
    }
  });
}
