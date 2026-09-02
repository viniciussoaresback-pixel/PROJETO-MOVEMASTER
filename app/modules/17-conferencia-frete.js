/* ==========================================================================
   MODULE: 17-conferencia-frete.js
   Conferência e tabela frete
   Linhas originais: 13779-15317
   ========================================================================== */

    }
    await aposMutacaoPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    document.getElementById('modalAvancarRota')?.remove();
    const msg = `⏩ ${ok} carro(s) avançado(s).` + (pulados ? ` ${pulados} exigem ação individual (checklist/transbordo/cegonha).` : '');
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', msg, 'success');
    if (pulados && ok === 0) alert(msg);
  } catch(e){ alert('Erro ao avançar: '+(e.message||e)); }
}

// ============================================================
// HISTÓRICO DE CARGAS CONCLUÍDAS — por motorista e por dia
// Só visualização. Aparece no Painel (logística) e no Faturamento (financeiro).
// ============================================================
// ============================================================
// TABELA DE FRETE (Fase 2b) — valores de referência por cliente/rota/vigência
// Usada pela Central de Conferência para comparar frete lançado × valor esperado.
// ============================================================
let tabelaFreteGlobais = [];
let _tabFreteEdit = null; // linha em edição (ou null)

async function _carregarTabelaFrete(){
  try {
    const { data } = await supabase.from('tabela_frete').select('*').order('cliente', { ascending:true });
    tabelaFreteGlobais = data || [];
  } catch(e){ tabelaFreteGlobais = []; }
}

// Busca o valor de referência vigente para um pedido (cliente + origem + destino [+ categoria])
// Retorna { valor, vigencia } ou null se não houver cadastro aplicável.
function valorTabelaFretePedido(p){
  if (!p) return null;
  const cli = _norm(p.cliente || '');
  const orig = _norm(p.cidadeOrigem || '');
  const dest = _norm(p.cidadeDestino || '');
  const cat = _norm(p.categoriaVeiculo || p.categoria_veiculo || '');
  const dataRef = p.createdAt || p.created_at || p.dataSolicitacao || new Date().toISOString();
  const dRef = new Date(dataRef);

  const candidatos = (tabelaFreteGlobais||[]).filter(t => {
    if (_norm(t.cliente||'') !== cli) return false;
    if (_norm(t.origem||'') !== orig) return false;
    if (_norm(t.destino||'') !== dest) return false;
    // categoria: se a linha tem categoria definida, precisa bater; se vazia, serve pra qualquer uma
    if (t.categoria && _norm(t.categoria) !== cat) return false;
    // vigência: a partir de vigencia_de (se preenchida)
    if (t.vigencia_de && new Date(t.vigencia_de) > dRef) return false;
    return true;
  });
  if (candidatos.length === 0) return null;
  // pega o mais específico (com categoria) e mais recente na vigência
  candidatos.sort((a,b) => {
    const espA = a.categoria ? 1 : 0, espB = b.categoria ? 1 : 0;
    if (espA !== espB) return espB - espA;
    return new Date(b.vigencia_de||0) - new Date(a.vigencia_de||0);
  });
  const t = candidatos[0];
  return { valor: Number(t.valor)||0, vigencia: t.vigencia_de };
}

function renderizarTabelaFrete(){
  const cont = document.getElementById('tabelaFreteConteudo');
  if (!cont) return;
  if (tabelaFreteGlobais.length === 0 && !window._tabFreteCarregada){
    window._tabFreteCarregada = true;
    _carregarTabelaFrete().then(()=>renderizarTabelaFrete());
  }
  const linhas = (tabelaFreteGlobais||[]).slice().sort((a,b)=>(a.cliente||'').localeCompare(b.cliente||''));
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  const confCSS = `<style id="confEstilosInline">
    #conferenciaConteudo .conf-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
    #conferenciaConteudo .conf-titulo { font-size:1.5rem; font-weight:800; margin:0; }
    #conferenciaConteudo .conf-sub { color:#9ca3af; font-size:.9rem; margin:.3rem 0 0; }
    #conferenciaConteudo .conf-header-acoes { display:flex; gap:8px; flex-wrap:wrap; }
    #conferenciaConteudo .conf-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:18px; }
    @media (max-width:1000px){ #conferenciaConteudo .conf-kpis { grid-template-columns:repeat(2,1fr); } }
    #conferenciaConteudo .conf-kpi { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px; }
    #conferenciaConteudo .conf-kpi-lbl { font-size:.68rem; font-weight:700; letter-spacing:.4px; color:#9ca3af; text-transform:uppercase; }
    #conferenciaConteudo .conf-kpi-num { font-size:1.5rem; font-weight:800; margin:6px 0 2px; }
    #conferenciaConteudo .conf-kpi-hint { font-size:.72rem; color:#9ca3af; }
    #conferenciaConteudo .conf-verde { color:#22c55e; } #conferenciaConteudo .conf-laranja { color:#f59e0b; }
    #conferenciaConteudo .conf-filtros { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px; margin-bottom:16px; }
    #conferenciaConteudo .conf-filtro { display:flex; flex-direction:column; gap:4px; }
    #conferenciaConteudo .conf-filtro label { font-size:.7rem; color:#9ca3af; font-weight:600; }
    #conferenciaConteudo .conf-filtro input, #conferenciaConteudo .conf-filtro select { padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.04); color:inherit; font-size:.85rem; }
    #conferenciaConteudo .conf-tabela-wrap { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; overflow:hidden; margin-bottom:16px; }
    #conferenciaConteudo .conf-tabela-titulo { font-size:.78rem; font-weight:800; letter-spacing:.5px; color:#9ca3af; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); }
    #conferenciaConteudo .conf-tabela { width:100%; border-collapse:collapse; font-size:.85rem; }
    #conferenciaConteudo .conf-tabela th { text-align:left; padding:10px 12px; font-size:.72rem; color:#9ca3af; font-weight:700; border-bottom:1px solid rgba(255,255,255,.08); }
    #conferenciaConteudo .conf-tabela td { padding:11px 12px; border-bottom:1px solid rgba(255,255,255,.05); }
    #conferenciaConteudo .conf-tabela td.center, #conferenciaConteudo .conf-tabela th.center { text-align:center; }
    #conferenciaConteudo .conf-tabela td.right { text-align:right; }
    #conferenciaConteudo .conf-status-pill { font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:999px; }
    #conferenciaConteudo .conf-ver-btn { background:none; border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:4px 8px; cursor:pointer; color:inherit; }
    #conferenciaConteudo .conf-fechamento { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:18px 20px; margin-bottom:16px; }
    #conferenciaConteudo .conf-fech-tit { font-size:.95rem; font-weight:800; margin-bottom:14px; }
    #conferenciaConteudo .conf-fech-resumo { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
    @media (max-width:800px){ #conferenciaConteudo .conf-fech-resumo { grid-template-columns:repeat(2,1fr); } }
    #conferenciaConteudo .conf-fech-resumo > div { display:flex; flex-direction:column; gap:3px; }
    #conferenciaConteudo .conf-fech-resumo span { font-size:.72rem; color:#9ca3af; }
    #conferenciaConteudo .conf-fech-resumo strong { font-size:1.05rem; }
    #conferenciaConteudo .conf-fech-status { padding:12px 14px; border-radius:8px; font-size:.85rem; margin-bottom:12px; }
    #conferenciaConteudo .conf-fech-ok { background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25); color:#22c55e; }
    #conferenciaConteudo .conf-fech-bloq { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.3); color:#f59e0b; }
    #conferenciaConteudo .conf-fech-fechado { background:rgba(239,68,68,.06); border:1px solid rgba(239,68,68,.25); color:#ef4444; }
    #conferenciaConteudo .conf-nota { font-size:.82rem; color:#9ca3af; background:rgba(59,130,246,.06); border:1px solid rgba(59,130,246,.2); border-radius:10px; padding:12px 16px; }
  </style>`;

  cont.innerHTML = confCSS + `
    <div class="conf-header">
      <div>
        <h1 class="conf-titulo">💵 Frete do Cliente</h1>
        <p class="conf-sub">Valor que cobramos do cliente por trecho — usado na conferência do frete. (Receita)</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_tabFreteNovo()">➕ Nova linha</button>
    </div>

    <div id="tabFreteForm"></div>

    <div class="conf-tabela-wrap">
      <div class="conf-tabela-titulo">VALORES CADASTRADOS (${linhas.length})</div>
      ${linhas.length === 0 ? '<p class="text-muted" style="padding:1.5rem;text-align:center">Nenhum valor cadastrado ainda. Clique em "Nova linha" para começar.<br><span style="font-size:.82rem">Enquanto não houver cadastro, a conferência continua sendo feita manualmente.</span></p>' : `
      <table class="conf-tabela">
        <thead><tr>
          <th>Cliente</th><th>Origem</th><th>Destino</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Vigência</th><th></th>
        </tr></thead>
        <tbody>
          ${linhas.map(t => `<tr>
            <td><strong>${t.cliente||'—'}</strong></td>
            <td>${t.origem||'—'}</td>
            <td>${t.destino||'—'}</td>
            <td>${t.categoria||'<span class="text-muted">todas</span>'}</td>
            <td>${t.tipo_operacao||'<span class="text-muted">—</span>'}</td>
            <td class="right"><strong>${fmt(t.valor)}</strong></td>
            <td>${t.vigencia_de?new Date(t.vigencia_de+'T12:00').toLocaleDateString('pt-BR'):'<span class="text-muted">sempre</span>'}</td>
            <td style="white-space:nowrap">
              <button class="conf-ver-btn" onclick="_tabFreteEditar(${t.id})" title="Editar">✏️</button>
              <button class="conf-ver-btn" onclick="_tabFreteExcluir(${t.id})" title="Excluir">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="conf-nota">
      💡 A conferência busca o valor por <strong>cliente + origem + destino</strong> (e categoria, se preenchida), respeitando a vigência.
      Onde não houver valor cadastrado, a Central de Conferência mantém o preenchimento manual.
    </div>`;
}

function _tabFreteNovo(){ _tabFreteEdit = { id:null }; _tabFreteRenderForm(); }
function _tabFreteEditar(id){ _tabFreteEdit = (tabelaFreteGlobais||[]).find(t=>t.id===id) || {id:null}; _tabFreteRenderForm(); }

function _tabFreteRenderForm(){
  const wrap = document.getElementById('tabFreteForm');
  if (!wrap) return;
  if (!_tabFreteEdit){ wrap.innerHTML = ''; return; }
  const t = _tabFreteEdit;
  // datalist de clientes para facilitar
  const clientes = [...new Set((clientesGlobais||[]).map(c=>c.nome).filter(Boolean))].sort();
  wrap.innerHTML = `
    <div class="tabfrete-form">
      <div class="tabfrete-form-tit">${t.id?'✏️ Editar valor':'➕ Novo valor de referência'}</div>
      <div class="tabfrete-grid">
        <div class="conf-filtro"><label>Cliente *</label><input list="tabFreteClientes" id="tfCliente" value="${(t.cliente||'').replace(/"/g,'&quot;')}" placeholder="nome do cliente"></div>
        <datalist id="tabFreteClientes">${clientes.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">`).join('')}</datalist>
        <div class="conf-filtro"><label>Origem (cidade) *</label><input id="tfOrigem" value="${(t.origem||'').replace(/"/g,'&quot;')}" placeholder="cidade origem"></div>
        <div class="conf-filtro"><label>Destino (cidade) *</label><input id="tfDestino" value="${(t.destino||'').replace(/"/g,'&quot;')}" placeholder="cidade destino"></div>
        <div class="conf-filtro"><label>Categoria (opcional)</label><input id="tfCategoria" value="${(t.categoria||'').replace(/"/g,'&quot;')}" placeholder="hatch/sedan/suv... (vazio=todas)"></div>
        <div class="conf-filtro"><label>Tipo de operação (opcional)</label><input id="tfTipo" value="${(t.tipo_operacao||'').replace(/"/g,'&quot;')}" placeholder="normal/especial..."></div>
        <div class="conf-filtro"><label>Valor de referência (R$) *</label><input type="number" step="0.01" id="tfValor" value="${t.valor!=null?t.valor:''}" placeholder="0,00"></div>
        <div class="conf-filtro"><label>Vigência a partir de</label><input type="date" id="tfVigencia" value="${t.vigencia_de||''}"></div>
      </div>
      <div class="tabfrete-form-acoes">
        <button class="btn btn-primary btn-sm" onclick="_tabFreteSalvar()">💾 Salvar</button>
        <button class="btn btn-secondary btn-sm" onclick="_tabFreteCancelar()">Cancelar</button>
      </div>
    </div>`;
}

function _tabFreteCancelar(){ _tabFreteEdit = null; _tabFreteRenderForm(); }

async function _tabFreteSalvar(){
  const cliente = document.getElementById('tfCliente')?.value.trim();
  const origem = document.getElementById('tfOrigem')?.value.trim();
  const destino = document.getElementById('tfDestino')?.value.trim();
  const valor = parseFloat(document.getElementById('tfValor')?.value);
  if (!cliente || !origem || !destino || isNaN(valor)){ alert('Preencha cliente, origem, destino e valor.'); return; }
  const registro = {
    cliente, origem, destino,
    categoria: document.getElementById('tfCategoria')?.value.trim() || null,
    tipo_operacao: document.getElementById('tfTipo')?.value.trim() || null,
    valor,
    vigencia_de: document.getElementById('tfVigencia')?.value || null
  };
  try {
    if (_tabFreteEdit && _tabFreteEdit.id){
      await supabase.from('tabela_frete').update(registro).eq('id', _tabFreteEdit.id);
      const i = tabelaFreteGlobais.findIndex(t=>t.id===_tabFreteEdit.id);
      if (i>=0) tabelaFreteGlobais[i] = { ...tabelaFreteGlobais[i], ...registro };
    } else {
      const { data } = await supabase.from('tabela_frete').insert(registro).select();
      if (data && data[0]) tabelaFreteGlobais.push(data[0]);
    }
    _tabFreteEdit = null;
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valor salvo na tabela de frete!');
    renderizarTabelaFrete();
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

async function _tabFreteExcluir(id){
  if (!confirm('Excluir este valor da tabela de frete?')) return;
  try {
    await supabase.from('tabela_frete').delete().eq('id', id);
    tabelaFreteGlobais = tabelaFreteGlobais.filter(t=>t.id!==id);
    renderizarTabelaFrete();
  } catch(e){ alert('Erro ao excluir: '+(e.message||e)); }
}

// ============================================================
// CENTRAL DE CONFERÊNCIA (perfil financeiro) — Fase 1: estrutura base
// Reusa a base de viagens do Histórico de Cargas, adicionando a camada de conferência.
// ============================================================
let _confFiltros = { de:null, ate:null, motorista:'', cliente:'', status:'' };
let _confViagemSel = null;

// Viagens candidatas à conferência: concluídas (viagens realizadas)
function _confViagens(){
  const rotas = (rotasGlobais||[]).filter(r => r.status === 'concluida' || r.status === 'em_andamento');
  return rotas.map(r => _histDadosViagem(r)).filter(v => v.pedidos.length > 0);
}

// Aplica filtros de período/motorista/cliente
function _confViagensFiltradas(){
  let lista = _confViagens();
  const f = _confFiltros;
  if (f.de){ const d = new Date(f.de+'T00:00:00'); lista = lista.filter(v => v.data && new Date(v.data) >= d); }
  if (f.ate){ const d = new Date(f.ate+'T23:59:59'); lista = lista.filter(v => v.data && new Date(v.data) <= d); }
  if (f.motorista) lista = lista.filter(v => _norm(v.motorista).includes(_norm(f.motorista)));
  if (f.cliente) lista = lista.filter(v => v.pedidos.some(p => _norm(p.cliente||'').includes(_norm(f.cliente))));
  if (f.status) lista = lista.filter(v => _confStatusViagem(v).chave === f.status);
  // ordena por data desc
  return lista.sort((a,b) => new Date(b.data||0) - new Date(a.data||0));
}

// Status de conferência de uma viagem (Fase 1: baseado em CTe e no que já existe;
// a conferência de frete×tabela vem na Fase 2)
function _confStatusViagem(v){
  const totalCarros = v.pedidos.length;
  const cteFaltando = totalCarros - v.comCte;
  // marca de conferência salva na rota (quando existir)
  const conferida = v.rota && v.rota.conferida_em;
  if (conferida) return { chave:'conferida', label:'Conferida', cor:'#22c55e' };
  if (cteFaltando > 0) return { chave:'cte_pendente', label:'CT-e pendente', cor:'#ef4444' };
  return { chave:'pendente', label:'Pendente', cor:'#f59e0b' };
}

function renderizarCentralConferencia(){
  const cont = document.getElementById('conferenciaConteudo');
  if (!cont) return;
  // carrega fechamentos uma vez
  if (window._fechamentosPeriodo === undefined){ window._fechamentosPeriodo = {}; _confCarregarFechamentos().then(()=>renderizarCentralConferencia()); }
  // carrega a tabela de frete uma vez (para conferência automática)
  if (!window._tabFreteCarregada){ window._tabFreteCarregada = true; if (typeof _carregarTabelaFrete==='function') _carregarTabelaFrete().then(()=>renderizarCentralConferencia()); }
  // carrega valores de pernas salvos uma vez
  if (window._pernasCarregadas === undefined){ window._pernasCarregadas = false; _confCarregarPernas().then(()=>renderizarCentralConferencia()); }
  // período padrão: mês atual, se ainda não definido
  if (!_confFiltros.de && !_confFiltros.ate){
    const hoje = new Date();
    _confFiltros.de = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
    _confFiltros.ate = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);
  }
  const viagens = _confViagensFiltradas();

  // KPIs do período
  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const fatBruto = viagens.reduce((s,v)=>s+v.total,0);
  const conferidas = viagens.filter(v => _confStatusViagem(v).chave === 'conferida').length;
  const pendencias = viagens.filter(v => _confStatusViagem(v).chave !== 'conferida').length;

  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  cont.innerHTML = `
    <div class="conf-header">
      <div>
        <h1 class="conf-titulo">Central de Conferência</h1>
        <p class="conf-sub">Validação de viagens, fretes, CT-es e cálculo de remuneração</p>
      </div>
      <div class="conf-header-acoes">
        <button class="btn btn-secondary btn-sm" onclick="_confExportarCSV()">📊 Exportar Excel/CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="_confExportarPDF()">📄 Exportar PDF</button>
      </div>
    </div>

    <div class="conf-kpis">
      <div class="conf-kpi"><div class="conf-kpi-lbl">VIAGENS</div><div class="conf-kpi-num">${totViagens}</div><div class="conf-kpi-hint">Total no período</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">VEÍCULOS</div><div class="conf-kpi-num">${totVeiculos}</div><div class="conf-kpi-hint">Transportados</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">FATURAMENTO (BRUTO)</div><div class="conf-kpi-num conf-verde">${fmt(fatBruto)}</div><div class="conf-kpi-hint">No período</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">CONFERIDOS</div><div class="conf-kpi-num">${conferidas}</div><div class="conf-kpi-hint">${totViagens?Math.round(conferidas/totViagens*100):0}% do total</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">PENDÊNCIAS</div><div class="conf-kpi-num conf-laranja">${pendencias}</div><div class="conf-kpi-hint">A revisar</div></div>
    </div>

    <div class="conf-filtros">
      <div class="conf-filtro"><label>Período inicial</label><input type="date" id="confDe" value="${_confFiltros.de||''}" onchange="_confSetFiltro('de', this.value)"></div>
      <div class="conf-filtro"><label>Período final</label><input type="date" id="confAte" value="${_confFiltros.ate||''}" onchange="_confSetFiltro('ate', this.value)"></div>
      <div class="conf-filtro"><label>Motorista</label><input type="text" id="confMot" value="${_confFiltros.motorista||''}" placeholder="todos" oninput="var _v=this.value; _mmDeb('confFiltro_motorista', function(){ _confSetFiltro('motorista', _v); })"></div>
      <div class="conf-filtro"><label>Cliente</label><input type="text" id="confCli" value="${_confFiltros.cliente||''}" placeholder="todos" oninput="var _v=this.value; _mmDeb('confFiltro_cliente', function(){ _confSetFiltro('cliente', _v); })"></div>
      <div class="conf-filtro"><label>Status</label>
        <select id="confStatus" onchange="_confSetFiltro('status', this.value)">
          <option value="">Todos</option>
          <option value="pendente" ${_confFiltros.status==='pendente'?'selected':''}>Pendente</option>
          <option value="cte_pendente" ${_confFiltros.status==='cte_pendente'?'selected':''}>CT-e pendente</option>
          <option value="conferida" ${_confFiltros.status==='conferida'?'selected':''}>Conferida</option>
        </select>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_confLimparFiltros()">🧹 Limpar filtros</button>
    </div>

    <div class="conf-tabela-wrap">
      <div class="conf-tabela-titulo">VIAGENS DO PERÍODO</div>
      ${viagens.length === 0 ? '<p class="text-muted" style="padding:1.5rem;text-align:center">Nenhuma viagem realizada no período selecionado.</p>' : `
      <table class="conf-tabela">
        <thead><tr>
          <th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Cliente</th>
          <th>Veíc.</th><th>Frete lançado</th><th>CT-e</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${viagens.map(v => {
            const st = _confStatusViagem(v);
            const cli = v.pedidos[0]?.cliente || '—';
            const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;
            return `<tr>
              <td><strong>#${v.id}</strong></td>
              <td>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</td>
              <td>${v.motorista}</td>
              <td>${v.cegonha}</td>
              <td style="font-size:.82rem">${rota}</td>
              <td>${cli}</td>
              <td class="center">${v.pedidos.length}</td>
              <td class="right">${fmt(v.total)}</td>
              <td class="center">${v.comCte}/${v.pedidos.length}</td>
              <td><span class="conf-status-pill" style="background:${st.cor}22;color:${st.cor}">${st.label}</span></td>
              <td><button class="conf-ver-btn" onclick="_confAbrirDetalhe(${v.id})">👁️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>

    ${_confPainelFechamento(viagens)}`;
}

// Painel de fechamento do período (Fase 4)
function _confPainelFechamento(viagens){
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const totViagens = viagens.length;
  const conferidas = viagens.filter(v => _confStatusViagem(v).chave === 'conferida').length;
  const naoConferidas = totViagens - conferidas;
  const ctePendentes = viagens.filter(v => _confStatusViagem(v).chave === 'cte_pendente').length;
  const fatBruto = viagens.reduce((s,v)=>s+v.total,0);
  const remunTotal = viagens.reduce((s,v)=>{
    return s + v.pedidos.reduce((ss,p)=>{ const vm=(typeof valorMotoristaPedido==='function')?valorMotoristaPedido(p):{valor:0}; return ss+(vm.valor||0); },0);
  },0);

  // status de fechamento do período (chave = de|ate)
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const fechado = (window._fechamentosPeriodo||{})[chavePeriodo];

  const pendencias = [];
  if (naoConferidas > 0) pendencias.push(`${naoConferidas} viagem(ns) não conferida(s)`);
  if (ctePendentes > 0) pendencias.push(`${ctePendentes} viagem(ns) com CT-e pendente`);
  const podeFechar = pendencias.length === 0 && totViagens > 0;

  return `
    <div class="conf-fechamento">
      <div class="conf-fech-tit">🔒 Fechamento do período</div>
      <div class="conf-fech-resumo">
        <div><span>Faturamento bruto</span><strong>${fmt(fatBruto)}</strong></div>
        <div><span>Remuneração motoristas</span><strong>${fmt(remunTotal)}</strong></div>
        <div><span>Resultado operacional</span><strong style="color:#22c55e">${fmt(fatBruto - remunTotal)}</strong></div>
        <div><span>Viagens conferidas</span><strong>${conferidas}/${totViagens}</strong></div>
      </div>
      ${fechado ? `
        <div class="conf-fech-status conf-fech-fechado">
          🔒 <strong>FECHAMENTO CONCLUÍDO</strong> — fechado por ${fechado.por} em ${new Date(fechado.em).toLocaleString('pt-BR')}.
          <div style="margin-top:4px;font-size:.8rem">As viagens deste período estão travadas para conferência.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="_confReabrirFechamento()">🔓 Reabrir fechamento</button>
      ` : podeFechar ? `
        <div class="conf-fech-status conf-fech-ok">🟢 Tudo conferido — pronto para fechar o período.</div>
        <button class="btn btn-primary" onclick="_confLiberarFechamento()">🔒 Liberar para fechamento</button>
      ` : `
        <div class="conf-fech-status conf-fech-bloq">
          ⚠️ <strong>FECHAMENTO BLOQUEADO</strong> — resolva as pendências antes:
          <ul style="margin:6px 0 0;padding-left:20px">${pendencias.map(p=>`<li>${p}</li>`).join('')}</ul>
        </div>
      `}
    </div>`;
}

async function _confLiberarFechamento(){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  if (!confirm(`Fechar o período de ${_confFiltros.de} a ${_confFiltros.ate}?\n\nAs viagens deste período ficarão travadas para conferência (só reabrindo o fechamento).`)) return;
  try {
    const registro = { periodo_de:_confFiltros.de, periodo_ate:_confFiltros.ate, fechado_por:usuario, fechado_em:new Date().toISOString(), status:'fechado' };
    await supabase.from('fechamentos').insert(registro);
    window._fechamentosPeriodo = window._fechamentosPeriodo || {};
    window._fechamentosPeriodo[chavePeriodo] = { por:usuario, em:registro.fechado_em };
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('🔒 Período fechado com sucesso!');
    renderizarCentralConferencia();
  } catch(e){ alert('Erro ao fechar período: '+(e.message||e)); }
}

async function _confReabrirFechamento(){
  const motivo = prompt('Motivo da reabertura do fechamento:\n(será registrado com seu nome, data e hora)');
  if (motivo === null || !motivo.trim()) return;
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await supabase.from('fechamentos').insert({
      periodo_de:_confFiltros.de, periodo_ate:_confFiltros.ate,
      fechado_por:usuario, fechado_em:new Date().toISOString(),
      status:'reaberto', motivo_reabertura:motivo.trim()
    });
    delete (window._fechamentosPeriodo||{})[chavePeriodo];
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('🔓 Fechamento reaberto (registrado).');
    renderizarCentralConferencia();
  } catch(e){ alert('Erro ao reabrir: '+(e.message||e)); }
}

// Carrega os fechamentos existentes (chamado no boot / ao abrir a central)
async function _confCarregarFechamentos(){
  try {
    const { data } = await supabase.from('fechamentos').select('*').order('fechado_em', { ascending:true });
    window._fechamentosPeriodo = {};
    (data||[]).forEach(f => {
      const chave = `${f.periodo_de}|${f.periodo_ate}`;
      if (f.status === 'fechado') window._fechamentosPeriodo[chave] = { por:f.fechado_por, em:f.fechado_em };
      else if (f.status === 'reaberto') delete window._fechamentosPeriodo[chave];
    });
  } catch(e){ /* tabela pode não existir ainda */ }
}

// ===== Fase 5: Relatório consolidado (CSV/Excel e PDF) =====
function _confLinhasRelatorio(){
  const viagens = _confViagensFiltradas();
  return viagens.map(v => {
    const st = _confStatusViagem(v);
    const cli = v.pedidos[0]?.cliente || '—';
    const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;
    const esperado = v.pedidos.reduce((s,p)=> s + (p.freteEsperado!=null?Number(p.freteEsperado):0), 0);
    const temEsperado = v.pedidos.some(p => p.freteEsperado != null);
    const diferenca = temEsperado ? (v.total - esperado) : null;
    return { v, st, cli, rota, esperado, temEsperado, diferenca };
  });
}

function _confExportarCSV(){
  const linhas = _confLinhasRelatorio();
  const head = ['Viagem','Data','Motorista','Cegonha','Rota','Cliente','Veiculos','Frete_lancado','Valor_tabela','Diferenca','CTe_conferidos','CTe_total','Status'];
  const rows = [head];
  linhas.forEach(({v,st,cli,rota,esperado,temEsperado,diferenca}) => {
    rows.push([
      '#'+v.id,
      v.data?new Date(v.data).toLocaleDateString('pt-BR'):'-',
      v.motorista, v.cegonha, rota, cli, v.pedidos.length,
      v.total.toFixed(2).replace('.',','),
      temEsperado?esperado.toFixed(2).replace('.',','):'-',
      diferenca!=null?diferenca.toFixed(2).replace('.',','):'-',
      v.comCte, v.pedidos.length, st.label
    ]);
  });
  const csv = rows.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `conferencia_${_confFiltros.de||''}_a_${_confFiltros.ate||''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function _confExportarPDF(){
  const linhas = _confLinhasRelatorio();
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const periodo = `${_confFiltros.de?new Date(_confFiltros.de+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${_confFiltros.ate?new Date(_confFiltros.ate+'T12:00').toLocaleDateString('pt-BR'):'hoje'}`;
  const totFat = linhas.reduce((s,l)=>s+l.v.total,0);
  const totVeic = linhas.reduce((s,l)=>s+l.v.pedidos.length,0);
  const conferidas = linhas.filter(l=>l.st.chave==='conferida').length;

  const corpo = `
    <div class="filtros"><strong>Período:</strong> ${periodo} &nbsp;·&nbsp; <strong>${linhas.length}</strong> viagens · <strong>${totVeic}</strong> veículos · <strong>${conferidas}</strong> conferidas</div>
    <table>
      <thead><tr>
        <th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Cliente</th>
        <th>Veíc.</th><th>Frete</th><th>Tabela</th><th>Dif.</th><th>CT-e</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${linhas.map(({v,st,cli,rota,esperado,temEsperado,diferenca})=>`<tr>
          <td><strong>#${v.id}</strong></td>
          <td>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</td>
          <td>${v.motorista}</td>
          <td>${v.cegonha}</td>
          <td>${rota}</td>
          <td>${cli}</td>
          <td style="text-align:center">${v.pedidos.length}</td>
          <td>${fmt(v.total)}</td>
          <td>${temEsperado?fmt(esperado):'—'}</td>
          <td>${diferenca!=null?fmt(diferenca):'—'}</td>
          <td style="text-align:center">${v.comCte}/${v.pedidos.length}</td>
          <td>${st.label}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="totalgeral">Faturamento bruto do período: ${fmt(totFat)}</div>`;

  if (typeof _abrirPDF === 'function') _abrirPDF('Central de Conferência — Relatório do período', corpo);
  else alert('Template de PDF indisponível.');
}



function _confSetFiltro(campo, valor){
  _confFiltros[campo] = valor;
  const ativo = document.activeElement;
  const id = ativo?.id;
  const pos = ativo && typeof ativo.selectionStart==='number' ? ativo.selectionStart : null;
  renderizarCentralConferencia();
  if (id){ const el = document.getElementById(id); if (el){ el.focus(); if(pos!==null){ try{el.setSelectionRange(pos,pos);}catch(e){} } } }
}

function _confLimparFiltros(){
  _confFiltros = { de:null, ate:null, motorista:'', cliente:'', status:'' };
  renderizarCentralConferencia();
}

let _confAbaDetalhe = 'veiculos';
// valores esperados de frete digitados manualmente (memória local até salvar): { pedidoId: valor }
let _confValoresEsperados = {};

function _confAbrirDetalhe(viagemId){
  _confViagemSel = viagemId;
  _confAbaDetalhe = 'veiculos';
  _confValoresEsperados = {};
  _confRenderPainel();
}

function _confFecharPainel(){
  document.getElementById('confPainelOverlay')?.remove();
  _confViagemSel = null;
}

function _confSelAbaDetalhe(aba){ _confAbaDetalhe = aba; _confRenderPainel(); }

function _confRenderPainel(){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_confViagemSel));
  if (!r){ _confFecharPainel(); return; }
  const v = _histDadosViagem(r);
  const st = _confStatusViagem(v);
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const cli = v.pedidos[0]?.cliente || '—';
  const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;

  const old = document.getElementById('confPainelOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'confPainelOverlay';
  div.className = 'conf-painel-overlay';
  div.innerHTML = `
    <div class="conf-painel-bg" onclick="_confFecharPainel()"></div>
    <div class="conf-painel">
      <div class="conf-painel-head">
        <div>
          <div class="conf-painel-tit">Detalhes da Viagem #${v.id}</div>
          <span class="conf-status-pill" style="background:${st.cor}22;color:${st.cor}">${st.label}</span>
        </div>
        <button class="conf-painel-x" onclick="_confFecharPainel()">✕</button>
      </div>

      <div class="conf-painel-info">
        <div><span class="conf-info-lbl">👤 Motorista</span><strong>${v.motorista}</strong></div>
        <div><span class="conf-info-lbl">🚛 Cegonha</span><strong>${v.cegonha}</strong></div>
        <div><span class="conf-info-lbl">📅 Data</span><strong>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</strong></div>
        <div><span class="conf-info-lbl">🗺️ Rota</span><strong>${rota}</strong></div>
        <div><span class="conf-info-lbl">🏢 Cliente</span><strong>${cli}</strong></div>
      </div>

      <div class="conf-painel-abas">
        <button class="conf-aba ${_confAbaDetalhe==='veiculos'?'ativo':''}" onclick="_confSelAbaDetalhe('veiculos')">Veículos (${v.pedidos.length})</button>
        <button class="conf-aba ${_confAbaDetalhe==='frete'?'ativo':''}" onclick="_confSelAbaDetalhe('frete')">Frete e Tabela</button>
        <button class="conf-aba ${_confAbaDetalhe==='ctes'?'ativo':''}" onclick="_confSelAbaDetalhe('ctes')">CT-es (${v.comCte}/${v.pedidos.length})</button>
        <button class="conf-aba ${_confAbaDetalhe==='remuneracao'?'ativo':''}" onclick="_confSelAbaDetalhe('remuneracao')">Remuneração</button>
      </div>

      <div class="conf-painel-corpo">${_confAbaConteudo(v)}</div>

      <div class="conf-painel-rodape">
        ${st.chave==='conferida'
          ? `<div class="conf-conferida-info">✅ Conferida ${r.conferida_por?('por '+r.conferida_por):''} ${r.conferida_em?('em '+new Date(r.conferida_em).toLocaleString('pt-BR')):''}</div>
             <button class="btn btn-secondary btn-sm" onclick="_confDesmarcarConferida(${v.id})">Reabrir conferência</button>`
          : `<button class="btn btn-primary" onclick="_confMarcarConferida(${v.id})">✅ Marcar viagem como conferida</button>`}
      </div>
    </div>`;
  document.body.appendChild(div);
}

// ============================================================
// CONFERÊNCIA POR PERNA (trecho a trecho do pedido transbordado)
// ============================================================
// Monta a lista de pernas que um pedido percorreu, usando o vínculo histórico
// (viagem_pedidos) + a rota de cada perna. Cada perna tem trecho, motorista,
// cegonha, status (concluída/andamento) e valor (tabela ou manual/definido).
function _confPernasDoPedido(p){
  if (!p) return { pernas: [], finalizado: false };
  const vinculos = (viagemPedidosGlobais||[])
    .filter(vp => String(vp.pedido_id) === String(p.id))
    .sort((a,b) => new Date(a.entrou_em||a.created_at||0) - new Date(b.entrou_em||b.created_at||0));

  // Se não há vínculo histórico (pedido nunca transbordou / tabela vazia), trata como perna única.
  if (vinculos.length === 0){
    const rotaAtual = (rotasGlobais||[]).find(r => String(r.id) === String(p.rotaId || p.rota_id));
    const unica = {
      trechoOrigem: p.cidadeOrigem || '—',
      trechoDestino: p.cidadeDestino || '—',
      motorista: (rotaAtual && rotaAtual.motorista_1) || p.motorista1 || '—',
      cegonha: (rotaAtual && rotaAtual.placa_cegonha) || p.placaCegonha || '—',
      concluida: p.status === 'Entregue',
      rotaId: rotaAtual ? rotaAtual.id : null
    };
    const finalizado = p.status === 'Entregue';
    return { pernas: [unica], finalizado };
  }

  // Monta cada perna a partir das viagens que o pedido passou
  const pernas = vinculos.map((vp, i) => {
    const rota = (rotasGlobais||[]).find(r => String(r.id) === String(vp.rota_id));
    // origem da perna: para a 1ª usa a origem do pedido; para as seguintes, o pátio de transbordo anterior
    const origemPerna = (i === 0)
      ? (p.cidadeOrigem || '—')
      : (vinculos[i-1].cidade_transbordo || p.cidadeTransbordo || rota && rota.nome || '—');
    // destino da perna: se saiu por transbordo, o destino é o ponto de transbordo; senão, o destino final
    const destinoPerna = vp.saiu_em
      ? (vp.cidade_transbordo || p.cidadeTransbordo || '(transbordo)')
      : (p.cidadeDestino || '—');
    return {
      trechoOrigem: origemPerna,
      trechoDestino: destinoPerna,
      motorista: (rota && rota.motorista_1) || '—',
      cegonha: (rota && rota.placa_cegonha) || '—',
      concluida: !!vp.saiu_em || (rota && rota.status === 'concluida') || p.status === 'Entregue',
      transbordo: !!vp.saiu_em,
      rotaId: vp.rota_id
    };
  });

  // Trajeto finalizado? Só quando a última perna chegou ao destino final E o pedido está Entregue.
  const ultima = pernas[pernas.length - 1];
  const chegouDestinoFinal = ultima && _cidadeIgual(ultima.trechoDestino, p.cidadeDestino);
  const finalizado = (p.status === 'Entregue') && chegouDestinoFinal;

  return { pernas, finalizado };
}

// Valor de uma perna: tabela do trecho > manual do trecho > valor definido na conferência > null
function _confValorPerna(perna, p){
  const cat = p.categoriaVeiculo || p.categoria_veiculo || '';
  const chaveManual = `${p.id}|${perna.trechoOrigem}|${perna.trechoDestino}`;
  if (window._confValoresPerna && window._confValoresPerna[chaveManual] != null){
    return { valor: Number(window._confValoresPerna[chaveManual])||0, origem: 'definido' };
  }
  const tab = (typeof valorTabelaTrecho==='function') ? valorTabelaTrecho(perna.trechoOrigem, perna.trechoDestino, cat) : null;
  if (tab != null) return { valor: tab, origem: 'tabela' };
  const man = (typeof valorManualTrecho==='function') ? valorManualTrecho(perna.trechoOrigem, perna.trechoDestino, cat) : null;
  if (man != null) return { valor: man, origem: 'manual' };
  return { valor: null, origem: 'pendente' };
}

// Guarda o valor definido para uma perna (sem re-renderizar, pra não perder foco)
function _confSetValorPerna(chave, valor){
  window._confValoresPerna = window._confValoresPerna || {};
  window._confValoresPerna[chave] = valor === '' ? null : parseFloat(valor);
}

// Carrega os valores de pernas já salvos no banco
async function _confCarregarPernas(){
  window._pernasCarregadas = true;
  window._confValoresPerna = window._confValoresPerna || {};
  try {
    const { data } = await supabase.from('remuneracao_pernas').select('*');
    (data||[]).forEach(r => {
      const chave = `${r.pedido_id}|${r.trecho_origem}|${r.trecho_destino}`;
      window._confValoresPerna[chave] = Number(r.valor);
    });
  } catch(e){ /* tabela pode não existir ainda */ }
}

// Salva os valores das pernas definidos manualmente
async function _confSalvarPernas(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para editar.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  const valores = window._confValoresPerna || {};
  try {
    for (const chave of Object.keys(valores)){
      const val = valores[chave];
      if (val == null) continue;
      const [pedidoId, origem, destino] = chave.split('|');
      await supabase.from('remuneracao_pernas').upsert({
        pedido_id: parseInt(pedidoId),
        trecho_origem: origem,
        trecho_destino: destino,
        valor: val,
        definido_por: usuario,
        definido_em: new Date().toISOString()
      }, { onConflict: 'pedido_id,trecho_origem,trecho_destino' });
    }
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valores das pernas salvos!');
  } catch(e){ alert('Erro ao salvar pernas: '+(e.message||e)); }
}

function _confAbaConteudo(v){
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  if (_confAbaDetalhe === 'veiculos'){
    return `<table class="conf-det-tabela">
      <thead><tr><th>#</th><th>Placa</th><th>Modelo</th><th>Origem</th><th>Destino</th><th>Frete</th><th>CT-e</th></tr></thead>
      <tbody>${v.pedidos.map((p,i)=>`<tr>
        <td>${i+1}</td>
        <td><strong>${p.placa||'—'}</strong></td>
        <td>${p.modelo||'—'}</td>
        <td>${p.cidadeOrigem||'—'}</td>
        <td>${p.cidadeDestino||'—'}</td>
        <td class="right">${fmt(p.valorFrete)}</td>
        <td class="center">${(p.numeroCte||cteInfoDoPedido(p.id))?'🟢':'🔴'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5"><strong>Total da viagem</strong></td><td class="right"><strong>${fmt(v.total)}</strong></td><td class="center">${v.comCte}/${v.pedidos.length}</td></tr></tfoot>
    </table>`;
  }

  if (_confAbaDetalhe === 'frete'){
    let totalLancado = 0, totalEsperado = 0, temEsperado = false;
    const linhas = v.pedidos.map((p,i)=>{
      const lancado = Number(p.valorFrete||0);
      totalLancado += lancado;
      const esperadoSalvo = (p.freteEsperado != null ? p.freteEsperado : null);
      // Fase 2b: busca automática na tabela de frete cadastrada
      const daTabela = (typeof valorTabelaFretePedido==='function') ? valorTabelaFretePedido(p) : null;
      const esperado = _confEsperadoDoPedido(p);
      const fonteAuto = (esperadoSalvo == null && !_confEsperadoEditado(p.id) && daTabela);
      if (esperado != null && esperado !== ''){ temEsperado = true; totalEsperado += Number(esperado); }
      const dif = (esperado != null && esperado !== '') ? (lancado - Number(esperado)) : null;
      const difCor = dif === null ? '' : (Math.abs(dif) < 0.01 ? '#22c55e' : '#f59e0b');
      const difTxt = dif === null ? '—' : (Math.abs(dif) < 0.01 ? 'R$ 0,00 🟢' : fmt(dif)+' 🟠');
      return `<tr>
        <td><strong>${p.placa||'—'}</strong><br><span class="text-muted" style="font-size:.75rem">${p.cidadeOrigem||''}→${p.cidadeDestino||''}</span></td>
        <td class="right">${fmt(lancado)}</td>
        <td><input type="number" step="0.01" class="conf-esperado-input" value="${esperado!=null?esperado:''}" placeholder="valor tabela" oninput="_confSetEsperado(${p.id}, this.value)">${fonteAuto?'<br><span style="font-size:.68rem;color:#3b82f6">🔵 da tabela</span>':''}</td>
        <td class="right" id="confDif_${p.id}" style="color:${difCor};font-weight:700">${difTxt}</td>
      </tr>`;
    }).join('');
    const difTotal = temEsperado ? (totalLancado - totalEsperado) : null;
    return `
      <div class="conf-frete-aviso">💡 Valores marcados <span style="color:#3b82f6">🔵 da tabela</span> vieram do cadastro automático. Onde não há cadastro, digite o <strong>valor esperado</strong> manualmente — ou cadastre na aba <strong>Tabela de Frete</strong> para automatizar.</div>
      <table class="conf-det-tabela">
        <thead><tr><th>Carro</th><th>Frete lançado</th><th>Valor esperado (tabela)</th><th>Diferença</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="right"><strong>${fmt(totalLancado)}</strong></td><td class="right"><strong id="confTotEsperado">${temEsperado?fmt(totalEsperado):'—'}</strong></td><td class="right"><strong id="confTotDif">${difTotal!==null?fmt(difTotal):'—'}</strong></td></tr></tfoot>
      </table>
      <div class="conf-frete-acoes">
        <label style="font-size:.8rem;color:var(--text-secondary,#9ca3af)">Justificativa do ajuste (opcional)</label>
        <input type="text" id="confJustificativa" class="conf-just-input" placeholder="ex: ajuste conforme tabela vigente para o cliente">
        <button class="btn btn-primary btn-sm" onclick="_confSalvarFrete(${v.id})">💾 Salvar valores conferidos</button>
      </div>`;
  }

  if (_confAbaDetalhe === 'ctes'){
    return `<table class="conf-det-tabela">
      <thead><tr><th>Placa</th><th>Nº CT-e</th><th>Status</th></tr></thead>
      <tbody>${v.pedidos.map(p=>{
        const info = cteInfoDoPedido(p.id);
        const num = p.numeroCte || (info && info.numero) || null;
        const temCte = num || info;
        return `<tr>
          <td><strong>${p.placa||'—'}</strong></td>
          <td>${num || '<span class="text-muted">—</span>'}</td>
          <td>${temCte?'<span style="color:#22c55e;font-weight:700">🟢 Emitido</span>':'<span style="color:#ef4444;font-weight:700">🔴 Pendente</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="2"><strong>Conferidos</strong></td><td><strong>${v.comCte}/${v.pedidos.length}</strong></td></tr></tfoot>
    </table>`;
  }

  if (_confAbaDetalhe === 'remuneracao'){
    // Conferência POR PERNA: cada pedido mostra as pernas que percorreu, com o valor
    // de cada trecho (tabela ou definido manualmente) e o status (finalizado ou não).
    let totalGeral = 0, temPendente = false, temNaoFinalizado = false;
    const origemLabel = { tabela:'🟢 Tabela do trecho', manual:'🟠 Manual do trecho', definido:'🔵 Definido por você', pendente:'🔴 Sem valor' };

    const blocos = v.pedidos.map(p => {
      const { pernas, finalizado } = _confPernasDoPedido(p);
      if (!finalizado) temNaoFinalizado = true;
      let totalPedido = 0, pedidoPendente = false;
      const linhasPernas = pernas.map((perna,i) => {
        const vp = _confValorPerna(perna, p);
        if (vp.valor == null){ pedidoPendente = true; temPendente = true; } else { totalPedido += Number(vp.valor); }
        const chaveManual = `${p.id}|${perna.trechoOrigem}|${perna.trechoDestino}`;
        const podeDefinir = vp.origem === 'pendente' || vp.origem === 'definido';
        return `<tr>
          <td style="font-size:.78rem;color:#9ca3af">Perna ${i+1}</td>
          <td><strong>${perna.trechoOrigem}</strong> → <strong>${perna.trechoDestino}</strong>
            ${perna.transbordo?'<span style="color:#fb923c;font-size:.7rem"> 🔀 transbordo</span>':''}
            ${!perna.concluida?'<span style="color:#f59e0b;font-size:.7rem"> ⏳ em andamento</span>':''}
          </td>
          <td style="font-size:.8rem">👤 ${perna.motorista}<br><span class="text-muted" style="font-size:.72rem">🚛 ${perna.cegonha}</span></td>
          <td>${podeDefinir
            ? `<input type="number" step="0.01" class="conf-perna-input" value="${vp.origem==='definido'?vp.valor:''}" placeholder="definir R$" oninput="_confSetValorPerna('${chaveManual.replace(/'/g,"\\'")}', this.value)" style="width:110px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.04);color:inherit;font-size:.82rem">`
            : `<span style="font-size:.74rem;color:#22c55e">${origemLabel[vp.origem]}</span>`}
          </td>
          <td class="right"><strong>${vp.valor!=null?fmt(vp.valor):'—'}</strong></td>
        </tr>`;
      }).join('');
      totalGeral += totalPedido;

      return `<div style="margin-bottom:16px;border:1px solid rgba(255,255,255,.1);border-radius:10px;overflow:hidden">
        <div style="padding:10px 12px;background:rgba(255,255,255,.03);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div><strong>#${p.id}</strong> · ${p.placa||'—'} <span class="text-muted" style="font-size:.78rem">${p.modelo||''}</span>
            <span class="text-muted" style="font-size:.75rem"> · ${p.cidadeOrigem||''} → ${p.cidadeDestino||''}</span></div>
          <div>${finalizado
            ? '<span style="color:#22c55e;font-size:.75rem;font-weight:700">✅ Trajeto completo</span>'
            : '<span style="color:#f59e0b;font-size:.75rem;font-weight:700">⚠️ Trajeto NÃO finalizado</span>'}</div>
        </div>
        <table class="conf-det-tabela" style="margin:0">
          <thead><tr><th></th><th>Trecho da perna</th><th>Motorista / Cegonha</th><th>Valor</th><th>Total</th></tr></thead>
          <tbody>${linhasPernas}</tbody>
          <tfoot><tr><td colspan="4"><strong>Total do pedido #${p.id}${pedidoPendente?' <span style="color:#ef4444;font-size:.72rem">(perna sem valor)</span>':''}</strong></td><td class="right"><strong>${fmt(totalPedido)}</strong></td></tr></tfoot>
        </table>
      </div>`;
    }).join('');

    return `
      <div class="conf-frete-aviso">💡 Cada pedido mostra as <strong>pernas</strong> que percorreu. O valor vem da <strong>tabela do trecho</strong> quando existe; onde não há preço tabelado, <strong>defina o valor</strong> daquela perna. ${temNaoFinalizado?'<br><strong style="color:#f59e0b">⚠️ Há pedido(s) com trajeto não finalizado — confira só quando o trajeto estiver completo.</strong>':''}</div>
      ${blocos}
      <div style="margin-top:14px;padding:12px 14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;font-size:.85rem">
        <div style="display:flex;justify-content:space-between"><span>Faturamento da viagem</span><strong>${fmt(v.total)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Remuneração total (todas as pernas)${temPendente?' <span style="color:#ef4444;font-size:.72rem">(há pendências)</span>':''}</span><strong>${fmt(totalGeral)}</strong></div>
      </div>
      <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="_confSalvarPernas(${v.id})">💾 Salvar valores das pernas</button></div>`;
  }
  return '';
}

// Guarda o que o usuário digitou. hasOwnProperty permite distinguir
// "campo apagado de propósito" (null) de "nunca foi tocado" (undefined).
function _confEsperadoEditado(pedidoId){
  return Object.prototype.hasOwnProperty.call(_confValoresEsperados || {}, pedidoId);
}

function _confEsperadoDoPedido(p){
  if (_confEsperadoEditado(p.id)) return _confValoresEsperados[p.id];
  if (p.freteEsperado != null) return p.freteEsperado;
  const daTabela = (typeof valorTabelaFretePedido==='function') ? valorTabelaFretePedido(p) : null;
  return daTabela ? daTabela.valor : null;
}

// Digitar NÃO redesenha mais o painel: só recalcula a coluna "Diferença"
// e os totais do rodapé. Assim o campo não perde o foco nem o cursor.
function _confSetEsperado(pedidoId, valor){
  const num = (valor === '' || valor == null) ? null : parseFloat(valor);
  _confValoresEsperados[pedidoId] = (num != null && isNaN(num)) ? null : num;
  _confAtualizarDiferencasFrete();
}

function _confAtualizarDiferencasFrete(){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_confViagemSel));
  if (!r) return;
  const v = _histDadosViagem(r);
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  let totalLancado = 0, totalEsperado = 0, temEsperado = false;
  v.pedidos.forEach(p => {
    const lancado = Number(p.valorFrete||0);
    totalLancado += lancado;
    const esp = _confEsperadoDoPedido(p);
    const valido = (esp != null && esp !== '' && !isNaN(Number(esp)));
    if (valido){ temEsperado = true; totalEsperado += Number(esp); }
    const cel = document.getElementById('confDif_' + p.id);
    if (cel){
      const dif = valido ? (lancado - Number(esp)) : null;
      cel.style.color = dif === null ? '' : (Math.abs(dif) < 0.01 ? '#22c55e' : '#f59e0b');
      cel.textContent = dif === null ? '—' : (Math.abs(dif) < 0.01 ? 'R$ 0,00 🟢' : fmt(dif)+' 🟠');
    }
  });
  const tE = document.getElementById('confTotEsperado');
  if (tE) tE.textContent = temEsperado ? fmt(totalEsperado) : '—';
  const tD = document.getElementById('confTotDif');
  if (tD) tD.textContent = temEsperado ? fmt(totalLancado - totalEsperado) : '—';
}

async function _confSalvarFrete(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para editar a conferência.'); return; }
  const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
  if (!r) return;
  const v = _histDadosViagem(r);
  const justificativa = document.getElementById('confJustificativa')?.value.trim() || null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await Promise.all(v.pedidos.map(p => {
      const esperado = _confValoresEsperados[p.id];
      if (esperado == null) return Promise.resolve();
      const pg = (pedidosGlobais||[]).find(x=>String(x.id)===String(p.id));
      if (pg){ pg.freteEsperado = esperado; }
      return supabase.from('pedidos').update({
        frete_esperado: esperado,
        frete_conferido_em: new Date().toISOString(),
        frete_conferido_por: usuario,
        frete_justificativa: justificativa
      }).eq('id', p.id);
    }));
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valores conferidos salvos!');
    _confRenderPainel();
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

async function _confMarcarConferida(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para alterar a conferência.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await supabase.from('rotas_planejadas').update({ conferida_em: new Date().toISOString(), conferida_por: usuario }).eq('id', viagemId);
    const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
    if (r){ r.conferida_em = new Date().toISOString(); r.conferida_por = usuario; }
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Viagem marcada como conferida!');
    _confRenderPainel();
    renderizarCentralConferencia();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

async function _confDesmarcarConferida(viagemId){
  if (!confirm('Reabrir a conferência desta viagem?')) return;
  try {
    await supabase.from('rotas_planejadas').update({ conferida_em: null, conferida_por: null }).eq('id', viagemId);
    const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
    if (r){ r.conferida_em = null; r.conferida_por = null; }
    _confRenderPainel();
    renderizarCentralConferencia();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

function renderizarHistoricoCargas(containerId){
  const lista = document.getElementById('histvLista');
  if (!lista) return;

  const fBusca = _norm(document.getElementById('histBusca')?.value || '');
  const fMot = _norm(document.getElementById('histMotorista')?.value || '');
  const fCeg = _norm(document.getElementById('histCegonha')?.value || '');
  const fDest = _norm(document.getElementById('histDestino')?.value || '');
  const fOrig = _norm(document.getElementById('histOrigem')?.value || '');
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';

  // Histórico mostra viagens concluídas E em andamento (registro do que aconteceu)
  let rotas = (rotasGlobais||[]).filter(r => ['concluida','em_andamento','planejada'].includes(r.status));

  let viagens = rotas.map(_histDadosViagem);

  // filtros
  if (fMot) viagens = viagens.filter(v => _norm(v.motorista).includes(fMot));
  if (fCeg) viagens = viagens.filter(v => _norm(v.cegonha).includes(fCeg));
  if (fDest) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeDestino||'').includes(fDest)));
  if (fOrig) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeOrigem||'').includes(fOrig)));
  if (fDe) viagens = viagens.filter(v => v.data && v.data >= fDe);
  if (fAte) viagens = viagens.filter(v => v.data && v.data <= fAte);
  if (fBusca) viagens = viagens.filter(v =>
    _norm('#'+v.id).includes(fBusca) || _norm(v.motorista).includes(fBusca) ||
    _norm(v.cegonha).includes(fBusca) || v.pedidos.some(p => _norm(p.placa||'').includes(fBusca)));

  // ordena por data desc
  viagens.sort((a,b) => String(b.data||'').localeCompare(String(a.data||'')));

  if (viagens.length === 0){
    lista.innerHTML = '<p class="text-muted" style="padding:1rem">Nenhuma viagem no filtro.</p>';
    const det = document.getElementById('histvDetalhe'); if (det) det.innerHTML = '';
    return;
  }

  // seleção padrão: primeira viagem
  if (!_histViagemSel || !viagens.some(v => String(v.id)===String(_histViagemSel))){
    _histViagemSel = viagens[0].id;
  }

  const mostradas = viagens.slice(0, _histLimite);
  lista.innerHTML = `
    <div class="histv-lista-cab">VIAGENS (${viagens.length})</div>
    ${mostradas.map(v => {
      const st = _histStatusInfo(v.status);
      const sel = String(v.id)===String(_histViagemSel);
      const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
        (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
      return `<div class="histv-card ${sel?'sel':''}" onclick="_histSelViagem(${v.id})">
        <div class="histv-card-top">
          <span class="histv-card-id">#${v.id}</span>
          <span class="histv-badge ${st.cls}">${st.label}</span>
        </div>
        <div class="histv-card-lin">🚛 <strong>${v.cegonha}</strong> <span class="text-muted">· 📅 ${v.data ? new Date(v.data+(v.data.length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</span></div>
        <div class="histv-card-rota">${rotaTxt}</div>
        <div class="histv-card-mot">Motorista: ${v.motorista}</div>
        <div class="histv-card-rod">
          <span class="text-muted">${v.pedidos.length} veículo(s)</span>
          <span class="histv-card-total">R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
        </div>
      </div>`;
    }).join('')}
    ${viagens.length > _histLimite ? `<button class="histv-vermais" onclick="_histVerMais()">Ver mais viagens</button>` : ''}`;

  _histRenderDetalhe();
}

function _histSelViagem(id){ _histViagemSel = id; renderizarHistoricoCargas(); }
function _histVerMais(){ _histLimite += 8; renderizarHistoricoCargas(); }

// Coleta as viagens conforme os filtros atuais (reutiliza a mesma lógica da lista)
function _histViagensFiltradas(){
  const fBusca = _norm(document.getElementById('histBusca')?.value || '');
  const fMot = _norm(document.getElementById('histMotorista')?.value || '');
  const fCeg = _norm(document.getElementById('histCegonha')?.value || '');
  const fDest = _norm(document.getElementById('histDestino')?.value || '');
  const fOrig = _norm(document.getElementById('histOrigem')?.value || '');
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';

  let rotas = (rotasGlobais||[]).filter(r => ['concluida','em_andamento','planejada'].includes(r.status));
  let viagens = rotas.map(_histDadosViagem);
  if (fMot) viagens = viagens.filter(v => _norm(v.motorista).includes(fMot));
  if (fCeg) viagens = viagens.filter(v => _norm(v.cegonha).includes(fCeg));
  if (fDest) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeDestino||'').includes(fDest)));
  if (fOrig) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeOrigem||'').includes(fOrig)));
  if (fDe) viagens = viagens.filter(v => v.data && v.data >= fDe);
  if (fAte) viagens = viagens.filter(v => v.data && v.data <= fAte);
  if (fBusca) viagens = viagens.filter(v =>
    _norm('#'+v.id).includes(fBusca) || _norm(v.motorista).includes(fBusca) ||
    _norm(v.cegonha).includes(fBusca) || v.pedidos.some(p => _norm(p.placa||'').includes(fBusca)));
  viagens.sort((a,b) => String(b.data||'').localeCompare(String(a.data||'')));
  return viagens;
}

// RELATÓRIO CONSOLIDADO — visão gerencial de todas as viagens do período
function _histAbrirRelatorio(){
  const viagens = _histViagensFiltradas();
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';
  const periodo = (fDe || fAte) ? `${fDe?new Date(fDe+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${fAte?new Date(fAte+'T12:00').toLocaleDateString('pt-BR'):'hoje'}` : 'Todas as viagens';

  // totais
  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const totFat = viagens.reduce((s,v)=>s+v.total,0);
  const totMot = viagens.reduce((s,v)=>s+v.totalMotorista,0);
  const totCteOk = viagens.reduce((s,v)=>s+v.comCte,0);
  const totPend = totVeiculos - totCteOk;

  const old = document.getElementById('histRelatOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'histRelatOverlay';
  div.className = 'histrelat-overlay';
  div.innerHTML = `
    <div class="histrelat-bg" onclick="document.getElementById('histRelatOverlay').remove()"></div>
    <div class="histrelat-painel">
      <div class="histrelat-head">
        <div>
          <h2>📊 Relatório Consolidado</h2>
          <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 0">${periodo}</p>
        </div>
        <div class="histrelat-head-acoes">
          <button class="btn btn-secondary btn-sm" onclick="_histExportarRelatorioCSV()">⬇️ Excel/CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="_histExportarRelatorioPDF()">📄 PDF</button>
          <button class="histrelat-x" onclick="document.getElementById('histRelatOverlay').remove()">✕</button>
        </div>
      </div>

      <div class="histrelat-totais">
        <div class="histrelat-tz"><strong>${totViagens}</strong><span>Viagens</span></div>
        <div class="histrelat-tz"><strong>${totVeiculos}</strong><span>Veículos</span></div>
        <div class="histrelat-tz"><strong class="v-verde">R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Faturamento</span></div>
        <div class="histrelat-tz"><strong class="v-laranja">R$ ${totMot.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Motoristas</span></div>
        <div class="histrelat-tz"><strong class="v-azul">R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Resultado</span></div>
        <div class="histrelat-tz"><strong class="${totPend?'v-laranja':'v-verde'}">${totCteOk}/${totVeiculos}</strong><span>CTes conferidos</span></div>
      </div>

      <div class="histrelat-tabwrap">
        <table class="histrelat-tab">
          <thead><tr><th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Veíc.</th><th>Faturamento</th><th>Motorista</th><th>CTe</th></tr></thead>
          <tbody>
            ${viagens.length===0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9ca3af">Nenhuma viagem no período.</td></tr>' :
              viagens.map(v => {
                const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
                  (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
                const cteOk = v.comCte === v.pedidos.length && v.pedidos.length>0;
                return `<tr>
                  <td><strong>#${v.id}</strong></td>
                  <td>${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>${v.motorista}</td>
                  <td>${v.cegonha}</td>
                  <td>${rotaTxt}</td>
                  <td style="text-align:center">${v.pedidos.length}</td>
                  <td>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td>${cteOk?'<span class="histv-ok">✅ '+v.comCte+'/'+v.pedidos.length+'</span>':'<span style="color:#f59e0b">⚠️ '+v.comCte+'/'+v.pedidos.length+'</span>'}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Exporta o relatório para CSV (abre no Excel)
function _histExportarRelatorioCSV(){
  const viagens = _histViagensFiltradas();
  const linhas = [['Viagem','Data','Motorista','Cegonha','Rota','Veiculos','Faturamento','Motorista','CTe_conferidos','CTe_total']];
  viagens.forEach(v => {
    const rotaTxt = v.paradas.length ? `${v.paradas[0]} > ${v.paradas[v.paradas.length-1]}` :
      (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} > ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'-'));
    linhas.push([
      '#'+v.id,
      v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '-',
      v.motorista, v.cegonha, rotaTxt, v.pedidos.length,
      v.total.toFixed(2).replace('.',','), v.totalMotorista.toFixed(2).replace('.',','),
      v.comCte, v.pedidos.length
    ]);
  });
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `relatorio_viagens_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Exporta o relatório em PDF no estilo do sistema (usa o template _abrirPDF)
function _histExportarRelatorioPDF(){
  const viagens = _histViagensFiltradas();
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';
  const periodo = (fDe || fAte)
    ? `${fDe?new Date(fDe+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${fAte?new Date(fAte+'T12:00').toLocaleDateString('pt-BR'):'hoje'}`
    : 'Todas as viagens';

  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const totFat = viagens.reduce((s,v)=>s+v.total,0);
  const totMot = viagens.reduce((s,v)=>s+v.totalMotorista,0);
  const totCteOk = viagens.reduce((s,v)=>s+v.comCte,0);

  const linhas = viagens.map(v => {
    const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
      (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
    const cteOk = v.comCte === v.pedidos.length && v.pedidos.length>0;
    return `<tr>
      <td><strong>#${v.id}</strong></td>
      <td>${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${v.motorista}</td>
      <td>${v.cegonha}</td>
      <td>${rotaTxt}</td>
      <td style="text-align:center">${v.pedidos.length}</td>
      <td>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="text-align:center">${cteOk?'✅':'⚠️'} ${v.comCte}/${v.pedidos.length}</td>
    </tr>`;
  }).join('');

  const corpo = `
    <div class="filtros">
      <span><strong>Período:</strong> ${periodo}</span>
    </div>
    <div class="rescards">
      <div class="rescard"><div class="restopo"><span>Viagens</span><span>${totViagens}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Veículos</span><span>${totVeiculos}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Faturamento</span><span>R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Motoristas</span><span>R$ ${totMot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Resultado</span><span>R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>CTes conferidos</span><span>${totCteOk}/${totVeiculos}</span></div></div>
    </div>
    <h3>Viagens do período</h3>
    <table>
      <thead><tr><th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Veíc.</th><th>Faturamento</th><th>Motorista</th><th>CTe</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="9" style="text-align:center">Nenhuma viagem no período.</td></tr>'}</tbody>
    </table>
    <div class="totalgeral">Total faturado: R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:2})} · Resultado: R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`;

  if (typeof _abrirPDF === 'function') _abrirPDF('Relatório de Viagens', corpo);
}

// Aba selecionada no detalhe
let _histAbaSel = 'carga';
function _histSelAba(aba){ _histAbaSel = aba; _histRenderDetalhe(); }

function _histRenderDetalhe(){
  const det = document.getElementById('histvDetalhe');
  if (!det) return;
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_histViagemSel));
  if (!r){ det.innerHTML = ''; return; }
  const v = _histDadosViagem(r);
  const st = _histStatusInfo(v.status);
  const saida = r.iniciada_em ? new Date(r.iniciada_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const chegada = r.concluida_em ? new Date(r.concluida_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const rotaTxt = v.paradas.length ? v.paradas.join(' → ') :
    (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));

  det.innerHTML = `
    <div class="histv-det-cab">
      <div class="histv-det-vnum">
        <div class="histv-det-hash">VIAGEM</div>
        <div class="histv-det-num">#${v.id}</div>
        <span class="histv-badge ${st.cls}">${st.label}</span>
        ${r.criada_por_usuario ? `<div style="margin-top:6px;font-size:.72rem;color:#9ca3af">🧑‍💼 Criada por <strong style="color:inherit">${r.criada_por_usuario}</strong>${r.criado_por?` (${r.criado_por})`:''}</div>` : (r.criado_por ? `<div style="margin-top:6px;font-size:.72rem;color:#9ca3af">🧑‍💼 Criada por ${r.criado_por}</div>` : '')}
        ${r.conferida_em ? `<div style="margin-top:6px;font-size:.72rem;color:#22c55e;font-weight:700">✅ Conferida${r.conferida_por?` por ${r.conferida_por}`:''}<br><span style="font-weight:400;color:#9ca3af">${new Date(r.conferida_em).toLocaleString('pt-BR')}</span></div>` : ''}
      </div>
      <div class="histv-det-info">
        <div class="histv-di"><span class="histv-di-lbl">👤 MOTORISTA</span><span class="histv-di-val">${v.motorista}</span></div>
        <div class="histv-di"><span class="histv-di-lbl">🚛 CEGONHA</span><span class="histv-di-val">${v.cegonha}${v.modelo?`<br><span class="text-muted" style="font-size:.75rem">Modelo: ${v.modelo}</span>`:''}</span></div>
        <div class="histv-di"><span class="histv-di-lbl">📅 DATA</span><span class="histv-di-val">${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}<br><span class="text-muted" style="font-size:.75rem">Saída: ${saida} · Chegada: ${chegada}</span></span></div>
        <div class="histv-di"><span class="histv-di-lbl">📍 ROTA</span><span class="histv-di-val">${rotaTxt}</span></div>
      </div>
      <div class="histv-resumo">
        <div class="histv-resumo-tit">RESUMO DA VIAGEM</div>
        <div class="histv-resumo-grid">
          <div class="histv-rz"><strong>${v.pedidos.length}</strong><span>VEÍCULOS</span></div>
          <div class="histv-rz histv-rz-fat"><strong>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>FATURAMENTO</span></div>
          <div class="histv-rz histv-rz-mot"><strong>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>MOTORISTA</span></div>
          <div class="histv-rz histv-rz-res"><strong>R$ ${v.resultado.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>RESULTADO</span></div>
        </div>
      </div>
    </div>

    <div class="histv-abas">
      <button class="histv-aba ${_histAbaSel==='carga'?'sel':''}" onclick="_histSelAba('carga')">CARGA DA VIAGEM</button>
      <button class="histv-aba ${_histAbaSel==='timeline'?'sel':''}" onclick="_histSelAba('timeline')">LINHA DO TEMPO</button>
      <button class="histv-aba ${_histAbaSel==='conferencia'?'sel':''}" onclick="_histSelAba('conferencia')">CONFERÊNCIA E DOCUMENTOS</button>
      <button class="histv-aba ${_histAbaSel==='financeiro'?'sel':''}" onclick="_histSelAba('financeiro')">FINANCEIRO</button>
    </div>

    <div class="histv-aba-conteudo">${_histAbaConteudo(v)}</div>

    <div class="histv-rodape-info">ℹ️ Esta viagem está registrada no histórico. Transbordos, ocorrências e alterações ficam registrados na linha do tempo.</div>`;
}

// Conteúdo de cada aba
function _histAbaConteudo(v){
  if (_histAbaSel === 'carga') return _histAbaCarga(v);
  if (_histAbaSel === 'timeline') return _histAbaTimeline(v);
  if (_histAbaSel === 'conferencia') return _histAbaConferencia(v);
  if (_histAbaSel === 'financeiro') return _histAbaFinanceiro(v);
  return `<p class="text-muted" style="padding:2rem;text-align:center">Esta aba será construída na próxima etapa.</p>`;
}

// ABA FINANCEIRO — Status + Resumo financeiro + Detalhamento da remuneração
function _histAbaFinanceiro(v){
  const st = _histStatusInfo(v.status);
  const chegada = v.rota.concluida_em ? new Date(v.rota.concluida_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : null;

  // Remuneração: soma dos valores por pedido (com origem)
  let temPendente = false;
  const detPed = v.pedidos.map(p => {
    const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null,origem:'pendente'};
    if (vm.valor == null) temPendente = true;
    return { p, vm };
  });
  const valorBase = detPed.reduce((s,d)=> s + (d.vm.valor||0), 0);

  // status textual
  const statusTxt = v.status === 'concluida' ? `Viagem concluída com sucesso.${chegada?` Entregas finalizadas às ${chegada}.`:''}`
    : v.status === 'em_andamento' ? 'Viagem em andamento.'
    : 'Viagem aguardando início.';
  const statusIc = v.status === 'concluida' ? '✅' : v.status === 'em_andamento' ? '🚛' : '⏳';

  return `<div class="histv-fin">
    <div class="histv-fin-col">
      <div class="histv-sec-tit">STATUS DA VIAGEM</div>
      <div class="histv-fin-status ${st.cls}">
        <div class="histv-fin-status-ic">${statusIc}</div>
        <div>
          <div class="histv-fin-status-lbl">${st.label}</div>
          <div class="histv-fin-status-sub">${statusTxt}</div>
        </div>
      </div>
    </div>

    <div class="histv-fin-col">
      <div class="histv-sec-tit">RESUMO FINANCEIRO</div>
      <div class="histv-fin-linha"><span>Faturamento bruto</span><strong class="v-verde">R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-linha"><span>Remuneração do motorista</span><strong class="v-laranja">− R$ ${valorBase.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-linha"><span>Despesas operacionais</span><strong class="text-muted">− R$ 0,00</strong></div>
      <div class="histv-fin-linha histv-fin-resultado"><span>Resultado operacional</span><strong class="v-azul">R$ ${(v.total - valorBase).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      ${temPendente?'<div class="histv-fin-aviso">⚠️ Há pedido(s) com remuneração a definir — o total do motorista pode mudar.</div>':''}
    </div>

    <div class="histv-fin-col histv-fin-full">
      <div class="histv-sec-tit">DETALHAMENTO DA REMUNERAÇÃO</div>
      <table class="histv-tab">
        <thead><tr><th>PEDIDO</th><th>TRECHO</th><th>ORIGEM DO VALOR</th><th>VALOR</th></tr></thead>
        <tbody>
          ${detPed.map(({p,vm}) => `<tr>
            <td><strong>#${p.id}</strong> ${p.placa||''}</td>
            <td>${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}</td>
            <td>${_histOrigemValorLabel(vm.origem)}</td>
            <td>${vm.valor!=null ? 'R$ '+vm.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '<span style="color:#f87171">a definir</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="histv-tab-total"><span>TOTAL MOTORISTA</span><strong class="v-azul">R$ ${valorBase.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-nota">💡 Excedente e bônus por meta ainda não são calculados automaticamente — quando essa regra for definida, entra aqui.</div>
    </div>
  </div>`;
}

function _histOrigemValorLabel(origem){
  if (origem === 'pedido') return '✏️ Ajuste do pedido';
  if (origem === 'tabela') return '📋 Tabela oficial';
  if (origem === 'manual') return '✍️ Valor do trecho';
  return '⏳ Pendente';
}

// ABA LINHA DO TEMPO — agrega os eventos reais (historico_status) de todos os pedidos da viagem
function _histAbaTimeline(v){
  // dispara a busca async e renderiza quando chegar
  _histCarregarTimeline(v);
  return `<div class="histv-timeline" id="histvTimeline"><p class="text-muted" style="padding:2rem;text-align:center">Carregando linha do tempo...</p></div>`;
}

// Mapeia o tipo de evento para ícone e cor
function _histEventoVisual(ev){
  const txt = ((ev.observacao||'') + ' ' + (ev.status_novo||'')).toLowerCase();
  if (txt.includes('coleta')) return { ic:'📥', cls:'ev-verde', titulo:'Coleta' };
  if (txt.includes('transbordo')) return { ic:'🔀', cls:'ev-roxo', titulo:'Transbordo' };
  if (txt.includes('entreg')) return { ic:'✅', cls:'ev-verde', titulo:'Entrega' };
  if (txt.includes('conferid') || txt.includes('cte')) return { ic:'📄', cls:'ev-azul', titulo:'Documento' };
  if (txt.includes('início') || txt.includes('inicio') || txt.includes('em transporte') || txt.includes('viagem')) return { ic:'🚛', cls:'ev-azul', titulo:'Transporte' };
  if (txt.includes('pátio') || txt.includes('patio')) return { ic:'📍', cls:'ev-cinza', titulo:'Pátio' };
  if (txt.includes('aprovad')) return { ic:'✅', cls:'ev-verde', titulo:'Aprovação' };
  return { ic:'🟢', cls:'ev-cinza', titulo:'Evento' };
}

async function _histCarregarTimeline(v){
  const alvo = document.getElementById('histvTimeline');
  if (!alvo) return;
  const ids = v.pedidos.map(p => parseInt(p.id));
  let eventos = [];

  // marcos da própria rota (saída/chegada) quando existem
  if (v.rota.iniciada_em) eventos.push({ created_at: v.rota.iniciada_em, _marco:true, ic:'🚛', cls:'ev-azul', titulo:'Início da viagem', obs: (v.paradas[0]||'') , quem: v.motorista });
  if (v.rota.concluida_em) eventos.push({ created_at: v.rota.concluida_em, _marco:true, ic:'🏁', cls:'ev-verde', titulo:'Viagem concluída', obs:'', quem: v.motorista });

  try {
    if (ids.length){
      const { data } = await supabase.from('historico_status').select('*').in('pedido_id', ids).order('created_at', { ascending: true });
      (data||[]).forEach(ev => {
        // ignora ruído: eventos sem observação e sem mudança real
        if (!ev.observacao && ev.status_anterior === ev.status_novo) return;
        const vis = _histEventoVisual(ev);
        eventos.push({ created_at: ev.created_at, ic:vis.ic, cls:vis.cls, titulo:vis.titulo, obs: ev.observacao || ev.status_novo || '', quem: ev.usuario_nome || '', pedido: ev.pedido_id });
      });
    }
  } catch(e){ /* silencioso */ }

  if (eventos.length === 0){
    alvo.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center">Nenhum evento registrado nesta viagem ainda.<br><span style="font-size:.8rem">Os eventos aparecem conforme a operação executa as ações (coleta, transbordo, entrega...).</span></p>';
    return;
  }

  eventos.sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));

  alvo.innerHTML = `<div class="histv-sec-tit">LINHA DO TEMPO DA VIAGEM</div>
    <div class="histv-tl">
      ${eventos.map(ev => {
        const d = ev.created_at ? new Date(ev.created_at) : null;
        const dia = d ? d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '--';
        const hora = d ? d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
        return `<div class="histv-tl-item">
          <div class="histv-tl-data">${dia}<br><span>${hora}</span></div>
          <div class="histv-tl-linha"><span class="histv-tl-dot ${ev.cls}">${ev.ic}</span></div>
          <div class="histv-tl-conteudo">
            <div class="histv-tl-tit">${ev.titulo}${ev.pedido?` <span class="histv-tl-ped">#${ev.pedido}</span>`:''}</div>
            <div class="histv-tl-obs">${ev.obs||''}</div>
            ${ev.quem?`<div class="histv-tl-quem">${ev.quem}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ABA CONFERÊNCIA E DOCUMENTOS
function _histAbaConferencia(v){
  const total = v.pedidos.length;
  const comCte = v.comCte;
  const pend = total - comCte;
  const pct = total ? Math.round(comCte/total*100) : 0;
  const okConf = pend === 0 && total > 0;
  const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(v.id));
  const mans = docs.filter(d => d.tipo==='manifesto');
  const ctes = docs.filter(d => d.tipo==='cte');

  // donut simples via conic-gradient
  const donut = `conic-gradient(#22c55e ${pct*3.6}deg, rgba(148,163,184,.2) ${pct*3.6}deg)`;

  return `<div class="histv-conf">
    <div class="histv-conf-col">
      <div class="histv-sec-tit">CONFERÊNCIA DE CTes</div>
      <div class="histv-donut-wrap">
        <div class="histv-donut" style="background:${donut}">
          <div class="histv-donut-centro"><strong>${comCte}</strong><span>de ${total}</span></div>
        </div>
        <div class="histv-donut-leg">
          <div><span class="histv-dot-v"></span> Conferidos: ${comCte} (${pct}%)</div>
          <div><span class="histv-dot-c"></span> Pendentes: ${pend} (${100-pct}%)</div>
        </div>
      </div>
      <div class="histv-conf-status ${okConf?'ok':'pend'}">
        ${okConf ? '🟢 CONFERÊNCIA OK<br><span>Todos os CTes foram conferidos.</span>'
                 : `🟠 PENDÊNCIA DE CONFERÊNCIA<br><span>${pend} pedido(s) sem CTe registrado.</span>`}
      </div>
      ${pend>0 ? `<div class="histv-conf-pendentes">
        <div class="histv-sec-tit" style="margin-top:12px">Pendentes:</div>
        ${v.pedidos.filter(p => !(p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id)))).map(p =>
          `<div class="histv-conf-pend-item">⚠️ #${p.id} · ${p.placa||''} · ${p.cliente||''} → ${p.cidadeDestino||''}</div>`).join('')}
      </div>` : ''}
    </div>

    <div class="histv-conf-col">
      <div class="histv-sec-tit">DOCUMENTOS DA VIAGEM</div>
      <div class="histv-docs">
        <div class="histv-doc-lin"><span>🧾 CTes da viagem (${ctes.length})</span>${ctes.length?`<a href="${ctes[0].url}" target="_blank" class="histv-doc-ver">VER</a>`:'<span class="text-muted">—</span>'}</div>
        <div class="histv-doc-lin"><span>📋 Manifestos (${mans.length})</span>${mans.length?`<a href="${mans[0].url}" target="_blank" class="histv-doc-ver">VER</a>`:'<span class="text-muted">—</span>'}</div>
        <div class="histv-doc-lin"><span>📄 Romaneio de carga</span><button class="histv-doc-ver" onclick="abrirFecharEnviarCarga(${v.id})">VER</button></div>
      </div>
      ${docs.length ? `<div class="histv-docs-todos">
        <div class="histv-sec-tit" style="margin-top:12px">Arquivos enviados</div>
        ${docs.map(d => `<div class="histv-doc-arq"><a href="${d.url}" target="_blank">📎 ${d.nome_arquivo||'documento'}</a> <span class="text-muted" style="font-size:.72rem">${d.tipo}</span></div>`).join('')}
      </div>` : '<p class="text-muted" style="font-size:.8rem;margin-top:10px">Nenhum documento enviado ainda.</p>'}
    </div>
  </div>`;
}

function _histAbaCarga(v){
  return `<div class="histv-carga">
    <div class="histv-veiculos">
      <div class="histv-sec-tit">VEÍCULOS TRANSPORTADOS (${v.pedidos.length})</div>
      <table class="histv-tab">
        <thead><tr><th>PEDIDO</th><th>PLACA</th><th>MODELO</th><th>CLIENTE</th><th>ORIGEM</th><th>DESTINO</th><th>FRETE</th><th>CTe</th><th>ENTREGA</th></tr></thead>
        <tbody>
          ${v.pedidos.map(p => {
            const vinc = _vinculoViagemPedido(v.id, p.id);
            const transb = vinc && vinc.saiu_em;
            const temCte = p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id));
            return `<tr>
              <td><strong>#${p.id}</strong></td>
              <td>${p.placa||'—'}</td>
              <td>${p.modelo||'—'}</td>
              <td>${p.cliente||'—'}</td>
              <td>${p.cidadeOrigem||'—'}</td>
              <td>${p.cidadeDestino||'—'}${transb?`<br><span style="font-size:.7rem;color:#a855f7">🔀 transbordado</span>`:''}</td>
              <td>R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td>${temCte?'<span class="histv-ok">✅ OK</span>':'<span class="histv-pend">— </span>'}</td>
              <td>${p.status==='Entregue'?'<span class="histv-ok">✅ OK</span>':'<span class="text-muted">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="histv-tab-total"><span>TOTAL DA VIAGEM</span><strong>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
    </div>
  </div>`;
}

// ===== HISTÓRICO DE CARGAS — visão viagem (master-detail) =====
let _histViagemSel = null;
let _histLimite = 8;

function _histCargasCasca(){
  return `
    <div class="histv-filtros">
      <input type="text" id="histBusca" class="histv-busca" placeholder="🔎 Buscar viagem, motorista, placa..." oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histMotorista" class="histv-fil" placeholder="👤 Motorista" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histCegonha" class="histv-fil" placeholder="🚛 Cegonha" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histOrigem" class="histv-fil" placeholder="📍 Origem" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histDestino" class="histv-fil" placeholder="🏁 Destino" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <div class="hist-datas-grupo">
        <label class="hist-data">De <input type="date" id="histDataDe" onchange="renderizarHistoricoCargas()"></label>
        <label class="hist-data">Até <input type="date" id="histDataAte" onchange="renderizarHistoricoCargas()"></label>
      </div>
      <button class="histv-btn-relatorio" onclick="_histAbrirRelatorio()">📊 Relatório do período</button>
    </div>
    <div class="histv-layout">
      <div class="histv-lista" id="histvLista"></div>
      <div class="histv-detalhe" id="histvDetalhe"></div>
    </div>`;
}

// Monta os dados de uma viagem (rota + pedidos vinculados) — só dados reais
function _histDadosViagem(r){
  const pedidos = _pedidosHistoricoDaViagem(r.id).filter(p => p.status !== 'Cancelado');
  const total = pedidos.reduce((s,p)=>s+Number(p.valorFrete||0),0);
  const totalMotorista = pedidos.reduce((s,p)=>{
    const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null};
    return s + (vm.valor||0);
  }, 0);
  const comCte = pedidos.filter(p => p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id))).length;
  const entregues = pedidos.filter(p => p.status === 'Entregue').length;
  const data = r.data_saida || r.iniciada_em || (pedidos[0] && _dataLancamento(pedidos[0])) || null;
  return {
    id: r.id, nome: r.nome, rota: r,
    motorista: r.motorista_1 || (pedidos[0]&&pedidos[0].motorista1) || '—',
    cegonha: r.placa_cegonha || '—',
    modelo: (veiculosGlobais||[]).find(v => v.placa === r.placa_cegonha)?.tipo || '',
    data, status: r.status,
    paradas: Array.isArray(r.paradas) ? r.paradas : [],
    pedidos, total, totalMotorista, comCte, entregues,
    resultado: total - totalMotorista
  };
}

function _histStatusInfo(st){
  if (st === 'concluida') return { label:'CONCLUÍDA', cls:'histv-st-ok' };
  if (st === 'em_andamento') return { label:'EM VIAGEM', cls:'histv-st-viagem' };
  if (st === 'planejada') return { label:'AGUARDANDO', cls:'histv-st-aguard' };
  return { label:(st||'—').toUpperCase(), cls:'' };
}

// Popula o seletor de corredor no lançamento, marcando os que combinam com origem→destino
function _popularCorredoresPedido(){
  const sel = document.getElementById('pedidoCorredor');
  if (!sel) return;
  const origVal = document.getElementById('cidadeOrigem')?.value || '';
  const destVal = document.getElementById('cidadeDestino')?.value || '';
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  const combina = (c) => {
    const seq = ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean);
    const io = _posNaSeq(seq, origVal), id = _posNaSeq(seq, destVal);
