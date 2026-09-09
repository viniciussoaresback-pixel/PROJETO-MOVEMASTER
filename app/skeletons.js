/* =========================================================================
   MOVEMASTER — Skeletons de carregamento

   Em vez de "Carregando..." (ou de uma tela em branco), mostramos o
   contorno do que está por vir: as barras cinzas no formato da tabela ou
   dos cards. O conteúdo real substitui o contorno quando chega.

   Por que isso importa: a espera é a mesma, mas a percepção muda bastante.
   Um texto "Carregando..." parece uma tela parada; o contorno parece uma
   tela que já começou a montar. É o mesmo truque que o Gmail e o LinkedIn
   usam — e é a forma mais barata de o sistema parecer rápido.

   Uso:
     mmSkeletonTabela('#idDoContainer', { linhas: 8, colunas: 6 });
     mmSkeletonCards('#idDoContainer', { quantidade: 4 });
     mmSkeletonKpis('#idDoContainer', { quantidade: 5 });

   Não precisa "limpar": quem renderiza já troca o innerHTML.
   ========================================================================= */

function _mmAlvo(seletor) {
  if (!seletor) return null;
  if (typeof seletor === 'string') {
    return seletor.startsWith('#') || seletor.startsWith('.')
      ? document.querySelector(seletor)
      : document.getElementById(seletor);
  }
  return seletor;
}

/** Contorno de tabela: cabeçalho + N linhas de M colunas. */
function mmSkeletonTabela(seletor, opcoes) {
  const el = _mmAlvo(seletor);
  if (!el) return;
  const o = opcoes || {};
  const linhas = o.linhas || 6;
  const colunas = o.colunas || 5;

  // Larguras variadas deixam o contorno parecido com dado real; barras
  // todas iguais parecem uma grade e chamam mais atenção do que deveriam.
  const larguras = ['62%', '85%', '48%', '72%', '55%', '90%', '40%'];

  let html = '<div class="mm-skel-tabela" aria-hidden="true">';
  html += '<div class="mm-skel-linha mm-skel-cabecalho">';
  for (let c = 0; c < colunas; c++) html += '<span class="mm-skel-barra" style="width:60%"></span>';
  html += '</div>';

  for (let l = 0; l < linhas; l++) {
    // Atraso crescente: as linhas "acendem" em cascata, o que sugere
    // carregamento em andamento em vez de tela congelada.
    html += `<div class="mm-skel-linha" style="animation-delay:${l * 45}ms">`;
    for (let c = 0; c < colunas; c++) {
      html += `<span class="mm-skel-barra" style="width:${larguras[(l + c) % larguras.length]}"></span>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

/** Contorno de cards (listas em bloco, como as viagens do painel). */
function mmSkeletonCards(seletor, opcoes) {
  const el = _mmAlvo(seletor);
  if (!el) return;
  const q = (opcoes && opcoes.quantidade) || 3;

  let html = '<div class="mm-skel-cards" aria-hidden="true">';
  for (let i = 0; i < q; i++) {
    html += `<div class="mm-skel-card" style="animation-delay:${i * 60}ms">
      <span class="mm-skel-barra" style="width:38%;height:14px"></span>
      <span class="mm-skel-barra" style="width:72%"></span>
      <span class="mm-skel-barra" style="width:55%"></span>
      <span class="mm-skel-barra" style="width:30%"></span>
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

/** Contorno dos quadros de número no topo (faturamento, conferidos...). */
function mmSkeletonKpis(seletor, opcoes) {
  const el = _mmAlvo(seletor);
  if (!el) return;
  const q = (opcoes && opcoes.quantidade) || 4;

  let html = '<div class="mm-skel-kpis" aria-hidden="true">';
  for (let i = 0; i < q; i++) {
    html += `<div class="mm-skel-kpi" style="animation-delay:${i * 50}ms">
      <span class="mm-skel-barra" style="width:55%;height:9px"></span>
      <span class="mm-skel-barra" style="width:70%;height:22px"></span>
      <span class="mm-skel-barra" style="width:45%;height:8px"></span>
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

/**
 * Mostra o skeleton só se a espera passar de `atrasoMs`.
 * Para uma resposta de 80ms, o contorno apareceria e sumiria num piscar —
 * isso incomoda mais do que esperar. Abaixo do limiar, nada aparece.
 */
function mmSkeletonSeDemorar(seletor, tipo, opcoes, atrasoMs) {
  const id = setTimeout(() => {
    if (tipo === 'cards') mmSkeletonCards(seletor, opcoes);
    else if (tipo === 'kpis') mmSkeletonKpis(seletor, opcoes);
    else mmSkeletonTabela(seletor, opcoes);
  }, atrasoMs == null ? 180 : atrasoMs);
  return () => clearTimeout(id);   // chame para cancelar se os dados chegarem antes
}

window.mmSkeletonTabela = mmSkeletonTabela;
window.mmSkeletonCards = mmSkeletonCards;
window.mmSkeletonKpis = mmSkeletonKpis;
window.mmSkeletonSeDemorar = mmSkeletonSeDemorar;
