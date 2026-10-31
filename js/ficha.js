/* Dieville Watches: ficha de leitura do título e atalhos de feedback */

const STATUS_FICHA = ["Quero assistir", "Assistindo", "Em Pausa", "Aguardando Nova Temporada", "Concluída", "Abandonei"];

function temporadasDe(s){
  const m = (s.duracao || "").match(/(\d+)\s+temporadas?/);
  if(m) return plural(Number(m[1]), "temporada", "temporadas");
  try{ const c = JSON.parse(localStorage.getItem('dw-temps') || "{}"); if(c[s.id]) return plural(c[s.id], "temporada", "temporadas"); }catch(e){}
  return "";
}
async function buscarTemporadas(s){
  if(s.tipo === "Filme" || !s.tmdbId || s.tmdbMedia !== "tv" || temporadasDe(s) || !TMDB_KEY) return;
  try{
    const d = await tmdbGet(`tv/${s.tmdbId}`);
    if(!d.number_of_seasons) return;
    const c = JSON.parse(localStorage.getItem('dw-temps') || "{}"); c[s.id] = d.number_of_seasons; localStorage.setItem('dw-temps', JSON.stringify(c));
    const el = document.getElementById('fxTemps');
    if(el){ el.hidden = false; el.querySelector('b').textContent = plural(d.number_of_seasons, "temporada", "temporadas"); }
  }catch(e){}
}
function fichaHTML(s, publico){
  const capa = s.imagem ? `background-image:url('${esc(s.imagem)}')` : `background:${posterGradient(s.titulo)}`;
  const tipo = s.tipo || "Série";
  const gen = [...generoTokens(s.genero)].map(t=> GENERO_LABEL[t]).join(" · ") || esc(s.genero || "");
  const prog = (tipo !== "Filme" && (s.temporada || s.episodio)) ? (s.episodio ? `T${s.temporada || 1} · E${s.episodio}` : `T${s.temporada}`) : "";
  const linha = (rot, val)=> val ? `<div class="fx-row"><span>${rot}</span><b>${val}</b></div>` : "";
  return `<div class="fx">
    <div class="fx-top">
      <div class="fx-capa" style="${capa}" role="img" aria-label="Capa de ${esc(s.titulo)}"></div>
      <div class="fx-info">
        <div class="fx-tags"><span class="fx-tag">${esc(tipo)}</span>${s.ano ? `<span class="fx-tag">${esc(s.ano)}</span>` : ""}${(s.nota !== null && s.nota !== undefined) ? `<span class="fx-tag fx-nota">⭐ ${Number(s.nota).toFixed(1)}</span>` : ""}<span class="fx-tag">${cargaEmoji(s.carga)}</span></div>
        ${gen ? `<div class="fx-gen">${gen}</div>` : ""}
        ${s.vibe ? `<div class="fx-vibe">${esc(s.vibe)}</div>` : ""}
        ${(s.streaming || []).length ? `<div class="fx-streams">${s.streaming.map(x=> linkServico(x, s.titulo)).join("")}</div>` : ""}
      </div>
    </div>
    ${s.resumo ? `<p class="fx-resumo">${esc(s.resumo)}</p>` : `<p class="fx-resumo muted">Sem resumo ainda.</p>`}
    <div class="fx-dados">
      ${publico ? "" : linha("Onde você parou", prog)}
      ${linha("Duração", esc((s.duracao || "").replace(/\s*·\s*\d+\s+temporadas?/, "")))}
      ${tipo !== "Filme" ? `<div class="fx-row" id="fxTemps"${temporadasDe(s) ? "" : " hidden"}><span>Temporadas</span><b>${temporadasDe(s) || ""}</b></div>` : ""}
      ${publico ? "" : linha("Indicado por", esc(s.indicadoPor || ""))}
    </div>
    ${publico ? "" : `<div class="fx-row fx-nota-minha"><span>Sua nota</span><span class="stars-in" role="radiogroup" aria-label="Sua nota">${[1,2,3,4,5].map(n=> `<button type="button" role="radio" aria-checked="${s.minhaNota === n}" aria-label="${n} de 5: ${NOTA_TXT[n]}" data-minha="${n}" class="${s.minhaNota >= n ? "on" : ""}">★</button>`).join("")}</span></div>
    <div id="fxComum"></div>`}
    ${publico ? "" : `
    <div class="fx-acoes">
      <span class="lab" id="fxStLab">Mudar status</span>
      <div class="chip-group" id="fxStatus" role="radiogroup" aria-labelledby="fxStLab">${STATUS_FICHA.filter(x=> !(tipo === "Filme" && x === "Aguardando Nova Temporada")).map(x=>
        `<button type="button" class="chip ${s.status === x ? "on" : ""}" role="radio" aria-checked="${s.status === x}" data-st="${esc(x)}">${esc(statusLabel(x))}</button>`).join("")}</div>
      <div class="fx-linha">
        ${tipo !== "Filme" ? `<button type="button" class="btn btn-ghost" id="fxMaisEp">+1 episódio</button>` : ""}
        ${lists.length ? `<label class="sr-only" for="fxLista">Adicionar a uma lista</label><select id="fxLista" class="fx-sel"><option value="">Adicionar a uma lista…</option>${lists.map(l=> `<option value="${l.id}" ${l.showIds.includes(s.id) ? "disabled" : ""}>${esc(l.nome)}${l.showIds.includes(s.id) ? " ✓" : ""}</option>`).join("")}</select>` : ""}
      </div>
    </div>`}
  </div>`;
}

function abrirFicha(s, origem, { publico = false } = {}){
  const atual = publico ? s : (shows.find(x=> x.id === s.id) || s);
  const botoes = publico ? [{ texto:"Fechar", classe:"btn-primary" }] : [
    { texto:"✏️ Editar", classe:"btn-ghost", acao: ()=>{ setTimeout(()=> openModal(shows.find(x=> x.id === atual.id) || atual, origem), 30); } },
    { texto:"Fechar", classe:"btn-primary" }
  ];
  abrirDialogo({
    titulo: atual.titulo,
    classe: "ficha",
    corpo: fichaHTML(atual, publico),
    botoes,
    foco: "fechar",
    aoAbrir: corpo=> { buscarTemporadas(atual); if(!publico) ligarAcoesFicha(corpo, atual, origem); }
  });
}

async function salvarCampos(id, campos){
  const { data, error } = await sb.from('titles').update(campos).eq('id', id).select().single();
  if(error){ console.error(error); showToast("Não consegui salvar a mudança"); return null; }
  const novo = fromRow(data);
  shows = shows.map(x=> x.id === id ? novo : x);
  render();
  return novo;
}

function ligarAcoesFicha(corpo, s, origem){
  const reabrir = novo=>{ dlg.corpo.innerHTML = fichaHTML(novo, false); ligarAcoesFicha(dlg.corpo, novo, origem); };
  corpo.querySelectorAll('#fxStatus .chip').forEach(c=> c.onclick = async ()=>{
    if(c.dataset.st === s.status) return;
    const antes = s.status;
    const novo = await salvarCampos(s.id, { status: c.dataset.st });
    if(novo){
      reabrir(novo); dlg.corpo.querySelector(`#fxStatus .chip[data-st="${CSS.escape(novo.status)}"]`)?.focus();
      showToast(`Status: ${statusLabel(novo.status)}`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{ const v = await salvarCampos(s.id, { status: antes }); if(v){ if(dlg.ov.classList.contains('open')) reabrir(v); showToast("Status voltou para " + statusLabel(antes)); } } });
    }
  });
  const ep = corpo.querySelector('#fxMaisEp');
  if(ep) ep.onclick = async ()=>{
    const antes = { episodio: s.episodio ?? null, temporada: s.temporada ?? null, status: s.status };
    const campos = { episodio: (s.episodio || 0) + 1, temporada: s.temporada || 1 };
    const virouAssistindo = s.status === "Quero assistir";
    if(virouAssistindo) campos.status = "Assistindo";
    const novo = await salvarCampos(s.id, campos);
    if(novo){
      reabrir(novo);
      showToast(`Agora: T${novo.temporada} · E${novo.episodio}${virouAssistindo ? " · marcado como Assistindo" : ""}`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{ const v = await salvarCampos(s.id, antes); if(v){ if(dlg.ov.classList.contains('open')) reabrir(v); showToast("Episódio desfeito"); } } });
      dlg.corpo.querySelector('#fxMaisEp')?.focus();
    }
  };
  const sel = corpo.querySelector('#fxLista');
  if(sel) sel.onchange = async ()=>{
    const l = lists.find(x=> x.id === sel.value); if(!l) return;
    l.showIds.push(s.id);
    if(await saveListIds(l)){ showToast(`Adicionado à lista "${l.nome}"`); reabrir(shows.find(x=> x.id === s.id) || s); }
    else l.showIds = l.showIds.filter(x=> x !== s.id);
  };
}

/* ---------- feedback mais visível ---------- */
document.getElementById('btnFeedbackTop').onclick = ()=> abrirFeedback();
document.getElementById('btnFirstFb').onclick = ()=> abrirFeedback({ tipo: "outro" });

// rodapé da lista compartilhada
const _aoRenderListaOrig = aoRenderListaPublica;
aoRenderListaPublica = async function(l, itens){
  const pe = document.getElementById('pubFooter');
  const membro = currentUser && profile?.status === "aprovado" && perfisAtivos;
  pe.innerHTML = `<div class="pub-fb">${membro
    ? `<span>Tem uma ideia para o app ou viu algo errado?</span> <button type="button" class="linkbtn" id="btnPubFb">💬 Conte para o Dieville</button>`
    : `<span>Gostou do app? Quem tem conta pode reagir, comentar e mandar sugestões.</span> <button type="button" class="linkbtn" data-google>Entrar ou pedir acesso</button>`}</div>
    <div style="margin-top:10px">Lista feita no Dieville Watches</div>`;
  const b = document.getElementById('btnPubFb');
  if(b) b.onclick = ()=> abrirFeedback();
  return _aoRenderListaOrig(l, itens);
};

// catálogo vazio de quem acabou de chegar e convite depois de algumas semanas
const _aoIniciarOrig = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarOrig();
  if(profile?.papel === "dono") return;
  document.getElementById('firstRunFb').style.display = "";
  try{
    if(localStorage.getItem('dw-convite-fb')) return;
    const desde = new Date(profile?.aprovado_em || profile?.created_at || Date.now());
    if(Date.now() - desde < 14 * 864e5) return;
    const { count } = await sb.from('feedback').select('id', { count:'exact', head:true }).eq('user_id', currentUser.id);
    if(count) return;
    localStorage.setItem('dw-convite-fb', '1');
    setTimeout(()=> showToast("Como está sendo usar o app?", { acao:"Contar para o Dieville", onAcao: ()=> abrirFeedback(), ms:9000 }), 2500);
  }catch(e){}
};
