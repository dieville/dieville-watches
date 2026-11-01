/* Dieville Watches: onda 3 (Escolhe pra mim, Sua nota, Em comum com amigos, Onde assistir, App instalável) */

const NOTA_TXT = { 1:"Não curti", 2:"Ok", 3:"Bom", 4:"Muito bom", 5:"Amei" };

/* ---------- onde assistir ---------- */
const BUSCA_SERVICO = {
  "Netflix": "https://www.netflix.com/search?q=",
  "Max": "https://play.max.com/search?q=",
  "Prime Video": "https://www.primevideo.com/search/ref=atv_nb_sug?phrase=",
  "Disney+": "https://www.disneyplus.com/search?q=",
  "Apple TV+": "https://tv.apple.com/search?term=",
  "Globoplay": "https://globoplay.globo.com/busca/?q=",
  "Crunchyroll": "https://www.crunchyroll.com/search?q=",
  "Paramount+": "https://www.paramountplus.com/search/?q=",
  "Star+": "https://www.disneyplus.com/search?q="
};
function linkServico(servico, titulo){
  const base = BUSCA_SERVICO[servico];
  if(!base) return `<span>${esc(servico)}</span>`;
  return `<a class="svc" href="${base}${encodeURIComponent(titulo)}" target="_blank" rel="noopener" aria-label="Procurar ${esc(titulo)} no ${esc(servico)} (abre em outra aba)">${esc(servico)} ↗</a>`;
}

/* ---------- sua nota ---------- */
let fichaAtualId = null;
function pedirNota(s){
  let nota = s.minhaNota || 0;
  abrirDialogo({
    titulo: `Terminou ${s.titulo} 🎉`,
    corpo: `<p class="muted" style="margin:0 0 6px">Que nota você dá?${profile?.compartilhar_assistindo !== false ? " Seus amigos veem na novidade." : ""}</p>
      <div class="stars-big" role="radiogroup" aria-label="Sua nota">${[1,2,3,4,5].map(n=> `<button type="button" role="radio" aria-checked="false" aria-label="${n} de 5: ${NOTA_TXT[n]}" data-n="${n}">★</button>`).join("")}</div>
      <div class="stars-lbl" id="starsLbl" aria-live="polite">Toque nas estrelas</div>`,
    botoes: [{ texto:"Pular" }, { texto:"Salvar", classe:"btn-primary", id:"btnNotaSalvar", acao: async ()=>{
      if(!nota){ showToast("Escolha de 1 a 5 estrelas"); return false; }
      const novo = await salvarCampos(s.id, { minha_nota: nota });
      if(!novo) return false;
      showToast(`Sua nota: ${"★".repeat(nota)} ${NOTA_TXT[nota]}`);
    } }],
    aoAbrir: corpo=>{
      const pintar = ()=>{ corpo.querySelectorAll('[data-n]').forEach(b=>{ const on = +b.dataset.n <= nota; b.classList.toggle('on', on); b.setAttribute('aria-checked', +b.dataset.n === nota); }); document.getElementById('starsLbl').textContent = nota ? NOTA_TXT[nota] : "Toque nas estrelas"; };
      corpo.querySelectorAll('[data-n]').forEach(b=> b.onclick = ()=>{ nota = +b.dataset.n; pintar(); });
      pintar();
    },
    foco: ".stars-big button"
  });
}
// ao concluir (pela ficha ou atalhos), pergunta a nota
const _salvarCamposOnda3 = salvarCampos;
salvarCampos = async function(id, campos){
  const antes = shows.find(x=> x.id === id);
  const novo = await _salvarCamposOnda3(id, campos);
  if(novo && campos.status === "Concluída" && antes?.status !== "Concluída" && !novo.minhaNota) setTimeout(()=> pedirNota(novo), 400);
  return novo;
};
// estrelas dentro da ficha
document.addEventListener('click', async e=>{
  const b = e.target.closest('.fx-nota-minha [data-minha]'); if(!b || !fichaAtualId) return;
  const s = shows.find(x=> x.id === fichaAtualId); if(!s) return;
  const n = +b.dataset.minha, nova = s.minhaNota === n ? null : n;
  const novo = await salvarCampos(s.id, { minha_nota: nova });
  if(!novo) return;
  b.closest('.stars-in').querySelectorAll('[data-minha]').forEach(x=>{ x.classList.toggle('on', nova && +x.dataset.minha <= nova); x.setAttribute('aria-checked', +x.dataset.minha === nova); });
  showToast(nova ? `Sua nota: ${"★".repeat(nova)} ${NOTA_TXT[nova]}` : "Nota removida");
});

/* ---------- em comum com amigos (na ficha) ---------- */
const comumCache = {};
const STATUS_AMIGO = { "Quero assistir":"também quer ver", "Assistindo":"está assistindo", "Em Pausa":"começou e pausou", "Aguardando Nova Temporada":"está esperando a nova temporada", "Concluída":"já viu" };
function comumHTML(lista){
  if(!lista?.length) return "";
  return `<div class="fx-comum">${lista.slice(0, 5).map(a=> `<div>${fotoHTML(a, "cm-av")}<b>${esc((a.nome || "Amigo").split(" ")[0])}</b> ${STATUS_AMIGO[a.status] || "também tem"}${a.minha_nota ? ` e deu <span class="estrelas">${"★".repeat(a.minha_nota)}${"☆".repeat(5 - a.minha_nota)}</span>` : ""}</div>`).join("")}${lista.length > 5 ? `<div class="muted">e mais ${lista.length - 5}</div>` : ""}</div>`;
}
function preencherComum(){
  const el = document.getElementById('fxComum');
  if(el && fichaAtualId && comumCache[fichaAtualId] && !el.innerHTML) el.innerHTML = comumHTML(comumCache[fichaAtualId]);
}
const _abrirFichaOnda3 = abrirFicha;
abrirFicha = function(s, origem, opts = {}){
  fichaAtualId = opts.publico ? null : s.id;
  _abrirFichaOnda3(s, origem, opts);
  if(opts.publico || !perfisAtivos) return;
  if(comumCache[s.id]){ preencherComum(); return; }
  sb.rpc('em_comum', { p_tmdb_id: s.tmdbId ?? null, p_media: s.tmdbMedia ?? null, p_titulo: s.titulo }).then(({ data })=>{ comumCache[s.id] = data || []; preencherComum(); });
};
new MutationObserver(preencherComum).observe(document.getElementById('dlgBody'), { childList:true });

/* ---------- escolhe pra mim ---------- */
const TEMPO = { curto:{ txt:"Uns 30 min" }, hora:{ txt:"Até 1 hora" }, longo:{ txt:"Um filme ou mais" } };
function cabeNoTempo(s, t){
  const m = minutosDe(s);
  if(t === "curto") return s.tipo !== "Filme" && (!m || m <= 35);
  if(t === "hora") return s.tipo === "Filme" ? (m && m <= 70) : (!m || m <= 65);
  return true;
}
function pontuar(s, t){
  let p = { "Assistindo":5, "Em Pausa":3, "Quero assistir":2 }[s.status] || 0;
  if(s.status === "Assistindo" && s.episodio) p += 2;
  p += (s.nota || 6) / 5;
  if(s.indicadoPor) p += 1;
  if(t === "longo" && s.tipo === "Filme") p += 1.5;
  return p + Math.random() * 1.2;
}
function motivo(s){
  if(s.status === "Assistindo" && s.episodio) return `▶ Você parou no T${s.temporada || 1} · E${s.episodio}`;
  if(s.status === "Assistindo") return "▶ Você está assistindo";
  if(s.status === "Em Pausa") return "⏯️ Estava em pausa, dá pra retomar";
  if(s.indicadoPor) return `💬 Indicação de ${s.indicadoPor}`;
  return `⭐ ${s.nota ? Number(s.nota).toFixed(1) : "Quero ver"}${(s.streaming || []).find(x=> x !== "Stremio") ? ` · ${s.streaming.find(x=> x !== "Stremio")}` : ""}`;
}
function escolhePraMim(){
  let tempo = lerLS2('dw-tempo', "hora"), energia = filters.carga === "all" ? "media" : filters.carga, vistos = new Set();
  const candidatos = ()=> shows.filter(s=> ["Assistindo","Em Pausa","Quero assistir"].includes(s.status))
    .filter(s=> energia === "baixa" ? cargaKey(s.carga) === "baixa" : energia === "media" ? ["baixa","media"].includes(cargaKey(s.carga)) : true)
    .filter(s=> cabeNoTempo(s, tempo));
  const desenhar = (corpo, novas)=>{
    let lista = candidatos().filter(s=> !vistos.has(s.id)).map(s=> [s, pontuar(s, tempo)]).sort((a, b)=> b[1] - a[1]).slice(0, 3).map(x=> x[0]);
    if(!lista.length && novas){ vistos = new Set(); lista = candidatos().map(s=> [s, pontuar(s, tempo)]).sort((a, b)=> b[1] - a[1]).slice(0, 3).map(x=> x[0]); }
    lista.forEach(s=> vistos.add(s.id));
    const nomeE = { baixa:"cansado", media:"energia normal", alta:"com foco" }[energia];
    corpo.querySelector('#epmRes').innerHTML = lista.length ? `<div class="lab">Para hoje, ${nomeE}, ${TEMPO[tempo].txt.toLowerCase()}</div>` + lista.map((s, i)=> `<div class="epm ${i === 0 ? "top" : ""}">
        <div class="epm-po" style="${s.imagem ? `background-image:url('${esc(s.imagem)}')` : `background:${posterGradient(s.titulo)}`}"></div>
        <div class="epm-t"><b>${esc(s.titulo)}</b><span class="why">${esc(motivo(s))}</span><small>${cargaEmoji(s.carga)}${s.duracao ? ` · ${esc(s.duracao.replace(/\s*·.*$/, ""))}` : ""} · ${esc(statusLabel(s.status).toLowerCase())}</small>
          <div class="epm-acts"><button type="button" class="btn btn-primary" data-epm-ver="${s.id}">Vou ver esse</button><button type="button" class="btn btn-ghost" data-epm-ficha="${s.id}">Ficha</button></div></div></div>`).join("")
        + `<button type="button" class="linkbtn epm-mais" data-epm-mais>🔄 Outras 3</button>`
      : `<p class="muted">Nada em Quero ver combina com ${nomeE} e ${TEMPO[tempo].txt.toLowerCase()}. Tente outro tempo ou outra energia.</p>`;
    corpo.querySelectorAll('[data-t]').forEach(b=>{ const on = b.dataset.t === tempo; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    corpo.querySelectorAll('[data-en]').forEach(b=>{ const on = b.dataset.en === energia; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  };
  abrirDialogo({
    titulo: "Escolhe pra mim",
    classe: "epm-dlg",
    corpo: `<div class="lab" id="epmEn">Sua energia</div><div class="chip-group" role="radiogroup" aria-labelledby="epmEn">${[["baixa",`${iconeEnergia("baixa")} Cansado`],["media",`${iconeEnergia("media")} Normal`],["alta",`${iconeEnergia("alta")} Com foco`]].map(([v, t])=> `<button type="button" class="chip" role="radio" data-en="${v}">${t}</button>`).join("")}</div>
      <div class="lab" id="epmTp">Quanto tempo você tem?</div><div class="chip-group" role="radiogroup" aria-labelledby="epmTp">${Object.entries(TEMPO).map(([v, o])=> `<button type="button" class="chip" role="radio" data-t="${v}">${o.txt}</button>`).join("")}</div>
      <div id="epmRes" aria-live="polite"></div>`,
    botoes: [{ texto:"Fechar" }],
    foco: "fechar",
    aoAbrir: corpo=>{
      desenhar(corpo);
      corpo.addEventListener('click', async e=>{
        const t = e.target.closest('[data-t]'); if(t){ tempo = t.dataset.t; gravarLS2('dw-tempo', tempo); vistos = new Set(); return desenhar(corpo); }
        const en = e.target.closest('[data-en]'); if(en){ energia = en.dataset.en; vistos = new Set(); return desenhar(corpo); }
        if(e.target.closest('[data-epm-mais]')) return desenhar(corpo, true);
        const f = e.target.closest('[data-epm-ficha]'); if(f){ const s = shows.find(x=> x.id === f.dataset.epmFicha); if(s) abrirFicha(s, document.getElementById('btnEscolhe')); return; }
        const v = e.target.closest('[data-epm-ver]');
        if(v){
          const s = shows.find(x=> x.id === v.dataset.epmVer); if(!s) return;
          if(s.status !== "Assistindo"){
            const antes = s.status;
            const novo = await salvarCampos(s.id, { status:"Assistindo" });
            if(!novo) return;
            showToast(`Bom filme! ${novo.titulo} está em Assistindo`, { acao:"Desfazer", ms:6000, onAcao: async ()=>{ if(await salvarCampos(s.id, { status: antes })) showToast("Status voltou para " + statusLabel(antes)); } });
            setTimeout(()=>{ if(!dlg.ov.classList.contains('open')) abrirFicha(novo, document.getElementById('btnEscolhe')); }, 500);
          }else{ fecharDialogo(); abrirFicha(s, document.getElementById('btnEscolhe')); showToast("Bom filme! 🍿"); }
        }
      });
    }
  });
}
(function(){
  const b = document.createElement('button');
  b.type = "button"; b.id = "btnEscolhe"; b.className = "btn-escolhe"; b.innerHTML = "🎲 Escolhe pra mim";
  b.onclick = escolhePraMim;
  document.getElementById('energiaHint').before(b);
})();

/* ---------- app instalável ---------- */
let pedidoInstalar = null;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = ()=> window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); pedidoInstalar = e; mostrarItemInstalar(); });
function mostrarItemInstalar(){ const b = document.getElementById('btnInstalar'); if(b) b.style.display = instalado() ? "none" : ""; }
async function instalarApp(){
  acctMenu.classList.remove('open');
  document.getElementById('instalarBanner')?.remove();
  if(pedidoInstalar){ pedidoInstalar.prompt(); const r = await pedidoInstalar.userChoice; pedidoInstalar = null; if(r.outcome === "accepted") showToast("App instalado 🎉"); return; }
  abrirDialogo({
    titulo: "Instalar o Dieville Watches",
    corpo: ehIOS ? `<ol class="inst-passos"><li>Toque em <b>Compartilhar</b> (o quadrado com a seta, embaixo no Safari).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol>`
      : `<ol class="inst-passos"><li>Abra o menu do navegador (⋮).</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li></ol>`,
    botoes: [{ texto:"Entendi", classe:"btn-primary" }]
  });
}
(function(){
  const menu = document.getElementById('btnAvatar');
  const b = document.createElement('button');
  b.id = "btnInstalar"; b.textContent = "📲 Instalar o app"; b.onclick = instalarApp;
  menu.after(b);
  mostrarItemInstalar();
})();
const _aoIniciarOnda3 = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarOnda3();
  try{
    const n = (Number(localStorage.getItem('dw-visitas')) || 0) + 1; localStorage.setItem('dw-visitas', n);
    const celular = window.matchMedia('(max-width:640px)').matches;
    if(celular && n >= 3 && !instalado() && !localStorage.getItem('dw-instalar-visto')){
      localStorage.setItem('dw-instalar-visto', '1');
      const d = document.createElement('div');
      d.id = "instalarBanner"; d.className = "inst-banner"; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Instalar o app');
      d.innerHTML = `<img src="img/icon-192.png" alt=""><div><b>Instale o Dieville Watches</b><small>Abre direto no catálogo, em tela cheia.</small></div><button type="button" class="btn btn-primary" id="btnInstBanner">Instalar</button><button type="button" class="nf-x" id="btnInstFechar" aria-label="Agora não">✕</button>`;
      document.body.appendChild(d);
      document.getElementById('btnInstBanner').onclick = instalarApp;
      document.getElementById('btnInstFechar').onclick = ()=> d.remove();
    }
  }catch(e){}
};
