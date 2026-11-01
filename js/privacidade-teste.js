/* Dieville Watches: aviso de privacidade do teste e Microsoft Clarity (01/11/2026)
   Só funciona se CLARITY_ID (config.js) estiver preenchido. Nada é carregado antes do "Aceitar". */
const PRIV_KEY = "dw-clarity";
const privLer = ()=>{ try{ return localStorage.getItem(PRIV_KEY); }catch(e){ return null; } };
const privGravar = v=>{ try{ localStorage.setItem(PRIV_KEY, v); }catch(e){} };
let clarityCarregado = false;

function claritySinal(ok){
  if(typeof window.clarity !== "function") return;
  try{ window.clarity('consentv2', { ad_Storage: "denied", analytics_Storage: ok ? "granted" : "denied" }); }catch(e){}
}
function carregarClarity(){
  if(!CLARITY_ID || clarityCarregado) return;
  clarityCarregado = true;
  // áreas com texto de pessoas ficam mascaradas mesmo que o modo do painel mude
  ['#amigosFeed', '.tab-amigos', '.tab-novidades', '#fbList', '#repList', '#usrList', '#dlgOverlay'].forEach(sel=> document.querySelectorAll(sel).forEach(el=> el.setAttribute('data-clarity-mask', 'True')));
  (function(c, l, a, r, i, t, y){
    c[a] = c[a] || function(){ (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_ID);
  claritySinal(true);
}
function escolherPriv(v){
  privGravar(v);
  document.getElementById('privAviso')?.remove();
  if(v === "sim") carregarClarity(); else if(clarityCarregado) claritySinal(false);
}
const PRIV_LONGO = `<p><b>O que gravamos</b><br>Cliques, toques, rolagem e as telas que você abre, para ver onde o app confunde. Usamos o Microsoft Clarity.</p>
<p><b>O que fica escondido</b><br>Tudo que você escreve (comentários, buscas, notas) e os nomes de outras pessoas aparecem tapados na gravação.</p>
<p><b>Código anônimo</b><br>Para juntar as visitas da mesma pessoa, usamos um código curto gerado a partir da sua conta. Ele não tem seu nome nem seu e-mail.</p>
<p><b>Quem vê</b><br>Só o Dieville, dono do app.</p>
<p><b>Como mudar de ideia</b><br>No menu da conta, em Privacidade do teste, você liga ou desliga quando quiser. Ao recusar, o Clarity para de gravar e deixa de usar cookies.</p>
<p><b>Até quando</b><br>Só durante o teste com amigos.</p>`;
function abrirPrivLongo(){
  const atual = privLer();
  abrirDialogo({ titulo: "Privacidade do teste",
    corpo: `<div class="muted">${PRIV_LONGO}<p><b>Sua escolha hoje:</b> ${atual === "sim" ? "aceitou a gravação" : atual === "nao" ? "recusou a gravação" : "ainda não escolheu"}.</p></div>`,
    botoes: [{ texto:"Recusar", acao: ()=>{ escolherPriv("nao"); showToast("Gravação desligada"); } }, { texto:"Aceitar", acao: ()=>{ escolherPriv("sim"); showToast("Gravação ligada durante o teste"); } }] });
}
function mostrarAviso(){
  if(document.getElementById('privAviso')) return;
  const d = document.createElement('div');
  d.id = "privAviso"; d.className = "priv-aviso"; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Privacidade do teste');
  d.innerHTML = `<b>Ajude a melhorar o app</b><p>Durante o teste, gravamos como você usa as telas para achar o que atrapalha. Textos que você escreve e nomes de amigos ficam escondidos na gravação. <button type="button" class="b3" data-priv-mais>Saiba mais</button></p>
    <div class="priv-btns"><button type="button" class="b2" data-priv="nao">Recusar</button><button type="button" class="b2" data-priv="sim">Aceitar</button></div>`;
  document.body.appendChild(d);
}
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-priv]'); if(b) return escolherPriv(b.dataset.priv);
  if(e.target.closest('[data-priv-mais]')) abrirPrivLongo();
});
document.getElementById('btnPrivTeste').onclick = ()=>{ document.getElementById('acctMenu').classList.remove('open'); abrirPrivLongo(); };

const _aoIniciarPriv = aoIniciarApp;
aoIniciarApp = async function(){
  await _aoIniciarPriv();
  if(!CLARITY_ID) return;
  document.getElementById('btnPrivTeste').style.display = "";
  const v = privLer();
  if(v === "sim") carregarClarity(); else if(!v) mostrarAviso();
};
