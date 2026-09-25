/* =====================================================================
   MOVEMASTER — MÓDULO 13 · CRM COMERCIAL (Fase 1 · só leitura)

   O QUE ESTE MÓDULO FAZ HOJE
   ---------------------------
   - Dashboard com 4 números: cadastrados, ativos, sem movimentação
     e negociações em andamento.
   - Carteira de clientes: lista todos os clientes JÁ CADASTRADOS
     no sistema (clientesGlobais), com o vendedor responsável, o
     último transporte (buscado automaticamente em pedidosGlobais) e
     os dias sem movimentação. Filtros por vendedor, prioridade,
     status, segmento e "situação" (todos / ativos / sem movimentação).
   - Agenda: placeholder. Só será populada quando a Fase 3 (registro
     de ações) estiver ativa. Deixamos o slot pronto para não mexer
     na navegação depois.

   O QUE ESTE MÓDULO NÃO FAZ (de propósito)
   ----------------------------------------
   - Não registra ações comerciais (contatos, visitas, propostas).
   - Não calcula temperatura 🔥/🌡️/❄️ automaticamente. O usuário quer
     validar como a planilha faz isso antes de virar regra do sistema.
   - Não faz transferência entre vendedores, notificações ou aceite.
   - Não importa a planilha (363 clientes / 617 ações). Isso é outro
     script, feito só depois do CRM estar validado com dados reais.

   FILOSOFIA
   ---------
   Um "sem movimentação" aqui é: nenhum pedido nos últimos N dias.
   O usuário validou N = 30 na planilha, mas deixamos o número numa
   constante no topo pra facilitar mudar depois.
   ===================================================================== */

// Janela (em dias) para considerar um cliente "sem movimentação".
// Espelha a métrica "Sem Movimentação +30 dias" do dashboard da planilha.
const CRM_DIAS_SEM_MOV = 30;

// Filtros da Carteira. Persistem enquanto o usuário navega entre
// sub-abas do CRM — se ele mudar de aba principal e voltar, resetam
// junto com o resto (comportamento padrão do sistema).
let _crmCarteiraFiltros = {
  busca: '',
  vendedor: '',
  prioridade: '',
  status: '',
  segmento: '',
  situacao: ''   // '' | 'ativos' | 'sem_mov' | 'sem_pedido' | 'sem_vendedor'
};

// Qual sub-aba do CRM está aberta. Começa no Dashboard.
let _crmSubAbaAtual = 'dashboard';

// -------------------------------------------------------------------
// UTILIDADES DE DATA / NORMALIZAÇÃO
// -------------------------------------------------------------------

// Normaliza uma string p/ comparar nomes (tira acento, baixa caixa,
// remove espaços extras). Serve para achar o mesmo cliente escrito
// de formas ligeiramente diferentes entre o cadastro e o pedido.
function _crmNorm(s){
  return String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim().replace(/\s+/g,' ');
}

// Diferença em dias entre uma data (string YYYY-MM-DD ou ISO) e hoje.
// Retorna null se não conseguir parsear — assim quem chama decide
// se mostra '—' ou trata como "muito antigo".
function _crmDiasDesde(data){
  if (!data) return null;
  const d = new Date(String(data).length <= 10 ? data + 'T12:00:00' : data);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  const ms = hoje.getTime() - d.getTime();
  return Math.floor(ms / (1000*60*60*24));
}

function _crmFmtData(d){
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR');
}

// -------------------------------------------------------------------
// BUSCA DO ÚLTIMO TRANSPORTE DE UM CLIENTE
// -------------------------------------------------------------------
// Filtra pedidosGlobais pelo cliente e devolve o mais recente pela
// data_solicitacao. O casamento é por clienteId (jeito certo) com
// fallback por nome normalizado, porque parte dos pedidos antigos
// pode ter só o campo `cliente` (nome livre) e não o clienteId.
function _crmUltimoTransporte(cliente){
  const pedidos = window.pedidosGlobais || [];
  if (!pedidos.length) return null;

  const idAlvo = cliente?.id;
  const nomeAlvo = _crmNorm(cliente?.nome);

  const doCliente = pedidos.filter(p => {
    if (idAlvo && p.clienteId && Number(p.clienteId) === Number(idAlvo)) return true;
    if (nomeAlvo && _crmNorm(p.cliente) === nomeAlvo) return true;
    return false;
  });

  if (!doCliente.length) return null;

  // Ordena por data solicitação desc. Pedidos sem data vão pro fim.
  doCliente.sort((a,b) => {
    const da = a.dataSolicitacao || a.createdAt || '';
    const db = b.dataSolicitacao || b.createdAt || '';
    return db.localeCompare(da);
  });
  return doCliente[0];
}

// -------------------------------------------------------------------
// SUB-ABA: SELETOR
// -------------------------------------------------------------------
function _crmTrocarSubAba(qual){
  _crmSubAbaAtual = qual;
  renderizarCRM();
}

// -------------------------------------------------------------------
// PONTO DE ENTRADA — MONTA O CRM INTEIRO
// -------------------------------------------------------------------
// Chamado pelo dispatcher do mod-01 quando a aba `comercialCRM` abre.
// Escreve dentro de #comercialCRMConteudo, que é o único elemento
// que o index.html precisou reservar pra este módulo.
function renderizarCRM(){
  const cont = document.getElementById('comercialCRMConteudo');
  if (!cont) return;

  // Esqueleto se os dados globais ainda não chegaram. Reaproveita o
  // pattern usado no mod-12 (renderizarComercialPedidos): quando o
  // sinal de dados prontos disparar, chama de novo.
  if (!window.__mmDadosCarregados && typeof mmSkeletonTabela === 'function'){
    mmSkeletonTabela(cont, { linhas: 6, colunas: 6 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarCRM());
    return;
  }

  const abas = [
    { id:'dashboard', label:'📊 Dashboard' },
    { id:'carteira',  label:'📇 Carteira de Clientes' },
    { id:'agenda',    label:'🗓️ Agenda' }
  ];

  const navHTML = `
    <div class="cg-header" style="align-items:center">
      <h2 style="margin:0">🎯 CRM Comercial</h2>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        ${abas.map(a => `
          <button class="btn ${_crmSubAbaAtual===a.id?'btn-primary':'btn-secondary'} btn-sm"
                  onclick="_crmTrocarSubAba('${a.id}')">${a.label}</button>
        `).join('')}
      </div>
    </div>
  `;

  let corpo = '';
  if (_crmSubAbaAtual === 'dashboard') corpo = _crmMontarDashboard();
  else if (_crmSubAbaAtual === 'carteira') corpo = _crmMontarCarteira();
  else if (_crmSubAbaAtual === 'agenda') corpo = _crmMontarAgenda();

  cont.innerHTML = navHTML + corpo;
}

// -------------------------------------------------------------------
// SUB-ABA · DASHBOARD
// -------------------------------------------------------------------
// 4 cards de números "de cabeceira". Todos calculados em tempo real
// a partir dos globais que já existem — nada é gravado, nada é
// cacheado. Se um cliente for editado, basta reabrir a aba.
function _crmMontarDashboard(){
  const clientes = window.clientesGlobais || [];
  const pedidos  = window.pedidosGlobais  || [];

  const totalClientes = clientes.length;

  // "Ativo" = tem pelo menos 1 pedido nos últimos CRM_DIAS_SEM_MOV dias.
  // "Sem movimentação" = tem pelo menos 1 pedido, mas o último está fora
  // dessa janela. Cliente que NUNCA transportou vai para "sem pedido"
  // (aparece na Carteira mas não conta em nenhuma dessas duas métricas).
  let ativos = 0, semMov = 0, semPedido = 0;
  clientes.forEach(c => {
    const ult = _crmUltimoTransporte(c);
    if (!ult){ semPedido++; return; }
    const dias = _crmDiasDesde(ult.dataSolicitacao || ult.createdAt);
    if (dias == null){ semPedido++; return; }
    if (dias <= CRM_DIAS_SEM_MOV) ativos++;
    else semMov++;
  });

  // Negociações em andamento = clientes cujo status_negociacao está
  // em algum estágio "ativo" do funil. 'Fechado - Ganho' e
  // 'Fechado - Perdido' saem da contagem, e quem ainda está como
  // 'Novo Cadastro' também (ainda não virou negociação).
  const statusAndamento = new Set([
    'Prospecção em Andamento',
    'Negociação Aberta',
    'Proposta Enviada'
  ]);
  const negociacoes = clientes.filter(c => statusAndamento.has(c.status_negociacao||'')).length;

  const card = (titulo, valor, sub, cor) => `
    <div class="card" style="padding:1rem;min-width:180px;flex:1">
      <div style="font-size:.78rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">${titulo}</div>
      <div style="font-size:2rem;font-weight:700;color:${cor||'var(--text-primary)'};line-height:1.1;margin-top:.3rem">${valor}</div>
      <div style="font-size:.8rem;color:var(--text-secondary);margin-top:.2rem">${sub}</div>
    </div>
  `;

  return `
    <div style="display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1rem">
      ${card('Clientes cadastrados', totalClientes, 'Total na base', 'var(--accent)')}
      ${card('Clientes ativos', ativos, `Transporte nos últimos ${CRM_DIAS_SEM_MOV} dias`, '#22c55e')}
      ${card('Sem movimentação', semMov, `Sem transporte há mais de ${CRM_DIAS_SEM_MOV} dias`, '#f59e0b')}
      ${card('Negociações em andamento', negociacoes, 'Prospecção · Aberta · Proposta', '#3b82f6')}
    </div>

    ${semPedido ? `
      <div class="card" style="padding:.8rem 1rem;margin-top:1rem">
        <div style="font-size:.85rem;color:var(--text-secondary)">
          <strong>${semPedido}</strong> cliente(s) ainda sem nenhum transporte registrado no sistema.
          Aparecem na Carteira com o filtro "Sem pedidos".
        </div>
      </div>
    ` : ''}

    <div class="card" style="padding:.8rem 1rem;margin-top:1rem;border-left:3px solid var(--accent)">
      <div style="font-size:.85rem;color:var(--text-secondary)">
        <strong>Fase 1 do CRM.</strong> Estes números são calculados em tempo real a partir
        dos pedidos e clientes já existentes. Registro de ações comerciais, temperatura
        automática, ranking por vendedor e agenda entram nas próximas fases.
      </div>
    </div>
  `;
}

// -------------------------------------------------------------------
// SUB-ABA · CARTEIRA DE CLIENTES
// -------------------------------------------------------------------
function _crmSetFiltroCarteira(chave, valor){
  _crmCarteiraFiltros[chave] = valor;
  renderizarCRM();
}
function _crmLimparFiltrosCarteira(){
  _crmCarteiraFiltros = { busca:'', vendedor:'', prioridade:'', status:'', segmento:'', situacao:'' };
  renderizarCRM();
}

function _crmMontarCarteira(){
  const clientes = window.clientesGlobais || [];
  const f = _crmCarteiraFiltros;

  // Lista de vendedores oferecida nos filtros: vem dos próprios
  // clientes cadastrados. Se ainda ninguém tiver vendedor
  // preenchido, o dropdown fica só com "Todos" — o filtro
  // "Sem responsável" (dentro de "Situação") resolve esse caso.
  const vendedoresBase = [...new Set(clientes.map(c => c.vendedor_responsavel).filter(Boolean))].sort();

  // Enriquecimento: para cada cliente resolvemos aqui o último
  // transporte e os dias sem movimentação — evita chamar duas vezes
  // durante a montagem da tabela.
  const enriched = clientes.map(c => {
    const ult = _crmUltimoTransporte(c);
    const dias = ult ? _crmDiasDesde(ult.dataSolicitacao || ult.createdAt) : null;
    return { cli: c, ult, dias };
  });

  // Aplicação dos filtros. Um cliente entra na lista se PASSAR em
  // todos os filtros ativos — quem quiser ver tudo é só limpar.
  const busca = _crmNorm(f.busca);
  const filtrados = enriched.filter(({cli, ult, dias}) => {
    if (busca){
      const alvo = _crmNorm(cli.nome) + ' ' + _crmNorm(cli.nome_fantasia) + ' ' + _crmNorm(cli.cidade) + ' ' + _crmNorm(cli.codigo) + ' ' + _crmNorm(cli.cnpj) + ' ' + _crmNorm(cli.cpf);
      if (!alvo.includes(busca)) return false;
    }
    if (f.vendedor   && (cli.vendedor_responsavel||'') !== f.vendedor)   return false;
    if (f.prioridade && (cli.prioridade||'')          !== f.prioridade) return false;
    if (f.status     && (cli.status_negociacao||'')   !== f.status)     return false;
    if (f.segmento   && (cli.segmento||'')            !== f.segmento)   return false;

    if (f.situacao === 'ativos'        && !(dias != null && dias <= CRM_DIAS_SEM_MOV)) return false;
    if (f.situacao === 'sem_mov'       && !(dias != null && dias > CRM_DIAS_SEM_MOV)) return false;
    if (f.situacao === 'sem_pedido'    && ult) return false;
    if (f.situacao === 'sem_vendedor'  && cli.vendedor_responsavel) return false;

    return true;
  });

  // Ordena: prioridade A → C, depois quem está mais atrasado primeiro.
  const ordemPrio = { 'A':0, 'B':1, 'C':2, '':3 };
  filtrados.sort((a,b) => {
    const pa = ordemPrio[(a.cli.prioridade||'').toUpperCase()] ?? 4;
    const pb = ordemPrio[(b.cli.prioridade||'').toUpperCase()] ?? 4;
    if (pa !== pb) return pa - pb;
    // dias null (sem pedido) fica no fim da lista dentro da mesma prioridade
    const da = a.dias == null ? -1 : a.dias;
    const db = b.dias == null ? -1 : b.dias;
    return db - da;
  });

  // Opções fixas das listas — mesmos rótulos que serão gravados no
  // banco pelo cadastro. Se um cliente tiver vindo com valor fora
  // dessa lista, ele aparece do mesmo jeito na tabela mas não é
  // filtrável — não é problema, é sinal de que precisa padronizar.
  const listaPrio      = ['A','B','C'];
  const listaSegmentos = ['Garagem','Concessionária','Locadora','Particular','Transportadora','Outro'];
  const listaStatus    = ['Novo Cadastro','Prospecção em Andamento','Negociação Aberta','Proposta Enviada','Fechado - Ganho','Fechado - Perdido'];

  const filtrosHTML = `
    <div class="cg-filtros" style="margin-top:1rem">
      <div class="cg-filtro" style="min-width:220px">
        <label>Buscar</label>
        <input type="text" value="${f.busca}" placeholder="Nome, cidade, CNPJ..." oninput="_crmSetFiltroCarteira('busca', this.value)">
      </div>
      <div class="cg-filtro">
        <label>Vendedor</label>
        <select onchange="_crmSetFiltroCarteira('vendedor', this.value)">
          <option value="">Todos</option>
          ${vendedoresBase.map(v => `<option ${f.vendedor===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="cg-filtro">
        <label>Prioridade</label>
        <select onchange="_crmSetFiltroCarteira('prioridade', this.value)">
          <option value="">Todas</option>
          ${listaPrio.map(p => `<option ${f.prioridade===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="cg-filtro">
        <label>Status</label>
        <select onchange="_crmSetFiltroCarteira('status', this.value)">
          <option value="">Todos</option>
          ${listaStatus.map(s => `<option ${f.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="cg-filtro">
        <label>Segmento</label>
        <select onchange="_crmSetFiltroCarteira('segmento', this.value)">
          <option value="">Todos</option>
          ${listaSegmentos.map(s => `<option ${f.segmento===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="cg-filtro">
        <label>Situação</label>
        <select onchange="_crmSetFiltroCarteira('situacao', this.value)">
          <option value="">Todas</option>
          <option value="ativos"       ${f.situacao==='ativos'?'selected':''}>Ativos (≤${CRM_DIAS_SEM_MOV}d)</option>
          <option value="sem_mov"      ${f.situacao==='sem_mov'?'selected':''}>Sem movimentação (+${CRM_DIAS_SEM_MOV}d)</option>
          <option value="sem_pedido"   ${f.situacao==='sem_pedido'?'selected':''}>Sem pedidos</option>
          <option value="sem_vendedor" ${f.situacao==='sem_vendedor'?'selected':''}>Sem responsável</option>
        </select>
      </div>
      <div class="cg-filtro" style="align-self:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="_crmLimparFiltrosCarteira()">Limpar</button>
      </div>
    </div>
  `;

  // Renderização das linhas
  let linhas;
  if (!filtrados.length){
    linhas = `<tr><td colspan="8" class="text-center text-muted" style="padding:1.4rem">
      Nenhum cliente encontrado com esses filtros.
    </td></tr>`;
  } else {
    linhas = filtrados.map(({cli, ult, dias}) => {
      const rota = ult ? `${ult.cidadeOrigem||'—'} → ${ult.cidadeDestino||'—'}` : '—';
      const dataUlt = ult ? _crmFmtData(ult.dataSolicitacao || ult.createdAt) : '—';

      // Coluna "Dias sem mov":
      // - Verde ≤ 30d
      // - Laranja > 30d
      // - Cinza "Sem pedidos" quando não achou nada
      let corBadge = '#6b7280', textoDias = 'Sem pedidos';
      if (dias != null){
        textoDias = `${dias}d`;
        corBadge = dias <= CRM_DIAS_SEM_MOV ? '#22c55e' : '#f59e0b';
      }

      const badge = (t,c) => t
        ? `<span style="display:inline-block;padding:.15rem .5rem;border-radius:10px;background:${c||'var(--surface-2)'};color:#fff;font-size:.72rem;font-weight:600">${t}</span>`
        : '<span style="color:var(--text-tertiary)">—</span>';

      const corPrio = { 'A':'#ef4444', 'B':'#3b82f6', 'C':'#6b7280' }[(cli.prioridade||'').toUpperCase()];

      return `<tr>
        <td>
          <div style="font-weight:600">${cli.nome||'—'}</div>
          <div style="font-size:.75rem;color:var(--text-tertiary)">${cli.codigo||''}${cli.cidade?' · '+cli.cidade:''}${cli.uf?'/'+cli.uf:''}</div>
        </td>
        <td>${cli.vendedor_responsavel || '<span style="color:var(--text-tertiary)">Sem responsável</span>'}</td>
        <td>${badge(cli.prioridade, corPrio)}</td>
        <td style="font-size:.85rem">${cli.status_negociacao || '<span style="color:var(--text-tertiary)">—</span>'}</td>
        <td style="font-size:.85rem">${cli.segmento || '—'}</td>
        <td style="font-size:.85rem">
          <div>${rota}</div>
          <div style="color:var(--text-tertiary);font-size:.75rem">${dataUlt}</div>
        </td>
        <td>${badge(textoDias, corBadge)}</td>
      </tr>`;
    }).join('');
  }

  return `
    ${filtrosHTML}

    <div class="card" style="margin-top:1rem;padding:0">
      <div style="padding:.6rem 1rem;border-bottom:1px solid var(--border-soft);font-size:.85rem;color:var(--text-secondary)">
        Mostrando <strong>${filtrados.length}</strong> de ${clientes.length} cliente(s).
      </div>
      <div class="tabela-scroll">
        <table class="ocup-tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Prio.</th>
              <th>Status</th>
              <th>Segmento</th>
              <th>Último transporte</th>
              <th>Sem mov.</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------------
// SUB-ABA · AGENDA (placeholder — Fase 3)
// -------------------------------------------------------------------
// Deixamos o slot pronto para não ter que mexer na navegação depois.
// Quando a Fase 3 (registro de ações) entrar, é aqui que a agenda
// da próxima semana será desenhada.
function _crmMontarAgenda(){
  return `
    <div class="card" style="padding:2rem;margin-top:1rem;text-align:center">
      <div style="font-size:2.6rem;margin-bottom:.6rem;opacity:.4">🗓️</div>
      <div style="font-weight:600;margin-bottom:.4rem">Agenda ainda não disponível</div>
      <div style="color:var(--text-secondary);font-size:.9rem;max-width:520px;margin:0 auto">
        Este espaço mostrará as próximas ações programadas por vendedor
        (visitas, ligações, propostas). Ativado depois que a Fase 3 —
        registro de ações comerciais — for validada.
      </div>
    </div>
  `;
}
