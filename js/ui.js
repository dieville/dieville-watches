/* Dieville Watches: utilitários de interface usados pelas abas Usuários, Feedback e Amigos */

// Escapa texto vindo de outras pessoas antes de colocar no HTML
function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, c=> ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function fotoHTML(p, cls = "ph"){
  const nome = p?.nome || p?.email || "?";
  if(p?.avatar_url) return `<img class="${cls === "ph" ? "av" : cls}" src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">`;
  return `<span class="${cls}" aria-hidden="true">${esc(nome[0].toUpperCase())}</span>`;
}

function dataCurta(d){ return d ? new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : ""; }

function tempoAtras(d){
  if(!d) return "";
  const min = Math.max(0, (Date.now() - new Date(d).getTime()) / 60000);
  if(min < 1) return "agora";
  if(min < 60) return `há ${plural(Math.round(min), "minuto", "minutos")}`;
  const h = min / 60;
  if(h < 24) return `há ${plural(Math.round(h), "hora", "horas")}`;
  const dias = Math.floor(h / 24);
  if(dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/* Caixa de diálogo genérica: abrirDialogo({ titulo, corpo (HTML), botoes:[{ texto, classe, acao, fechar }] , aoAbrir }) */
const dlg = {
  ov: document.getElementById('dlgOverlay'),
  titulo: document.getElementById('dlgTitle'),
  corpo: document.getElementById('dlgBody'),
  acoes: document.getElementById('dlgActions'),
  foco: null,
  aoFechar: null
};
function abrirDialogo({ titulo, corpo, botoes = [], aoAbrir, aoFechar, classe = "", foco = null }){
  dlg.foco = document.activeElement;
  dlg.ov.querySelector('.modal').className = "modal dlg " + classe;
  dlg.aoFechar = aoFechar || null;
  dlg.titulo.textContent = titulo;
  dlg.corpo.innerHTML = corpo;
  dlg.acoes.innerHTML = "";
  dlg.acoes.style.display = botoes.length ? "flex" : "none";
  const wrap = document.createElement('div');
  wrap.style.cssText = "display:flex;gap:10px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end";
  botoes.forEach(b=>{
    const el = document.createElement('button');
    el.type = "button";
    el.className = "btn " + (b.classe || "btn-ghost");
    el.textContent = b.texto;
    if(b.id) el.id = b.id;
    el.onclick = async ()=>{
      if(b.acao){
        el.disabled = true;
        const r = await b.acao(el);
        el.disabled = false;
        if(r === false) return;
      }
      if(b.fechar !== false) fecharDialogo();
    };
    wrap.appendChild(el);
  });
  dlg.acoes.appendChild(wrap);
  dlg.ov.classList.add('open');
  dlg.ov.querySelector('.modal').scrollTop = 0;
  if(aoAbrir) aoAbrir(dlg.corpo);
  setTimeout(()=>{ if(foco){ const el = foco === "fechar" ? document.getElementById('dlgClose') : dlg.ov.querySelector(foco); if(el){ el.focus(); return; } }
    const f = dlg.corpo.querySelector('textarea, input:not([type=checkbox]):not([type=file]), button, [tabindex="0"]') || dlg.acoes.querySelector('button'); if(f) f.focus(); }, 30);
}
function fecharDialogo(){
  dlg.ov.classList.remove('open');
  const fn = dlg.aoFechar; dlg.aoFechar = null;
  if(fn) fn();
  if(dlg.foco && document.body.contains(dlg.foco)) dlg.foco.focus();
}
document.getElementById('dlgClose').onclick = fecharDialogo;
dlg.ov.addEventListener('click', e=>{ if(e.target === dlg.ov) fecharDialogo(); });
// Esc já fecha overlays abertos no app.js; garante o aoFechar também
new MutationObserver(()=>{ if(!dlg.ov.classList.contains('open') && dlg.aoFechar){ const fn = dlg.aoFechar; dlg.aoFechar = null; fn(); } })
  .observe(dlg.ov, { attributes:true, attributeFilter:['class'] });

/* Confirmação no estilo do app: await confirmar({ titulo, texto, botao, perigo }) devolve true ou false */
function confirmar({ titulo = "Tem certeza?", texto = "", botao = "Confirmar", perigo = false } = {}){
  return new Promise(res=>{
    let ok = false;
    abrirDialogo({
      titulo, classe: "confirmar",
      corpo: texto ? `<p class="muted" style="margin:0">${esc(texto)}</p>` : "",
      botoes: [{ texto:"Cancelar" }, { texto: botao, classe: perigo ? "btn-danger-solid" : "btn-primary", acao: ()=>{ ok = true; } }],
      aoFechar: ()=> res(ok),
      foco: "fechar"
    });
  });
}
