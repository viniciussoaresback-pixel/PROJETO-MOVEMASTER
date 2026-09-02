/* ==========================================================================
   MODULE: 13-diretoria.js
   Diretoria + folgas
   Linhas originais: 7979-8534
   ========================================================================== */


        if (!sel.dataset.ligado) {
            sel.dataset.ligado = '1';
            sel.addEventListener('change', function () {
                if (typeof carregarCidadesIBGE === 'function') carregarCidadesIBGE(this.value, cidId);
            });
        }
    });
}

// ============================================
// VISÃO GERAL — DIRETORIA
// Painel somente leitura: responde as perguntas que a chefia
// costuma fazer sobre a operação, sem precisar garimpar telas.
// ============================================

const _dirMes = (d) => String(d || '').slice(0, 7);          // 'AAAA-MM'
const _dirHoje = () => new Date().toISOString().slice(0, 10);

function _dirDataPedido(p) {
    // usa a data de REGISTRO (confiável), não a prev. de coleta (editável, pode ter erro de digitação).
    return String(p.dataSolicitacao || p.createdAt || p.created_at || p.dataPrevColeta || '').slice(0, 10);
}

function _dirMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function _dirMesLabel(ym) {
    const [a, m] = ym.split('-');
    const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${nomes[parseInt(m, 10) - 1]}/${a.slice(2)}`;
}

// Resumo geral consolidado de TODOS os meses (visão macro para a diretoria)
function _dirMostrarGeral(){
  const validos = pedidosGlobais.filter(p => p.status !== 'Cancelado');
  const soma = arr => arr.reduce((s,p)=> s + Number(p.valorFrete||0), 0);
  const moeda = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  // agrupa por mês
  const porMes = {};
  validos.forEach(p => { const m = _dirMes(_dirDataPedido(p)); if(!m) return; (porMes[m]=porMes[m]||[]).push(p); });
  const meses = Object.keys(porMes).sort().reverse();
  const totalGeral = soma(validos);
  const carrosGeral = validos.length;
  const entreguesGeral = validos.filter(p=>p.status==='Entregue').length;
  const mediaMes = meses.length ? totalGeral/meses.length : 0;
  const linhas = meses.map(m => {
    const ps = porMes[m];
    const ent = ps.filter(p=>p.status==='Entregue').length;
    return `<tr>
      <td><strong>${_dirMesLabel(m)}</strong></td>
      <td style="text-align:center">${ps.length}</td>
      <td style="text-align:center">${ent}</td>
      <td style="text-align:right"><strong>${moeda(soma(ps))}</strong></td>
    </tr>`;
  }).join('');
  const old = document.getElementById('dirGeralOverlay'); if(old) old.remove();
  const div = document.createElement('div');
  div.id = 'dirGeralOverlay';
  div.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.6)" onclick="document.getElementById('dirGeralOverlay').remove()"></div>
    <div style="position:relative;background:var(--surface-1,#14141a);border:1px solid rgba(255,255,255,.12);border-radius:16px;width:92%;max-width:640px;max-height:88vh;overflow-y:auto;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div><h2 style="margin:0">📊 Resumo Geral</h2><p style="color:#9ca3af;font-size:.85rem;margin:.3rem 0 0">Consolidado de todos os meses (${meses.length} ${meses.length===1?'mês':'meses'})</p></div>
        <button onclick="document.getElementById('dirGeralOverlay').remove()" style="background:none;border:none;color:#9ca3af;font-size:1.4rem;cursor:pointer">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:18px">
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Faturamento total</div><div style="font-size:1.4rem;font-weight:800;color:#22c55e">${moeda(totalGeral)}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Média por mês</div><div style="font-size:1.4rem;font-weight:800">${moeda(mediaMes)}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Carros transportados</div><div style="font-size:1.4rem;font-weight:800">${carrosGeral}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Entregues</div><div style="font-size:1.4rem;font-weight:800">${entreguesGeral}</div></div>
      </div>
      <div style="font-size:.78rem;font-weight:700;color:#9ca3af;margin-bottom:8px">DETALHAMENTO POR MÊS</div>
      <table style="width:100%;border-collapse:collapse;font-size:.85rem">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,.1)"><th style="text-align:left;padding:8px;font-size:.7rem;color:#9ca3af">Mês</th><th style="text-align:center;padding:8px;font-size:.7rem;color:#9ca3af">Carros</th><th style="text-align:center;padding:8px;font-size:.7rem;color:#9ca3af">Entregues</th><th style="text-align:right;padding:8px;font-size:.7rem;color:#9ca3af">Faturamento</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr style="border-top:2px solid rgba(255,255,255,.15)"><td style="padding:8px"><strong>TOTAL</strong></td><td style="text-align:center;padding:8px"><strong>${carrosGeral}</strong></td><td style="text-align:center;padding:8px"><strong>${entreguesGeral}</strong></td><td style="text-align:right;padding:8px"><strong>${moeda(totalGeral)}</strong></td></tr></tfoot>
      </table>
    </div>`;
  document.body.appendChild(div);
}

function renderizarDiretoria() {
    const hoje = _dirHoje();
    const mesReal = _dirMes(hoje);
    const mesAtual = (typeof _dirMesSel !== 'undefined' && _dirMesSel) ? _dirMesSel : mesReal;
    const dataAnterior = new Date();
    dataAnterior.setMonth(dataAnterior.getMonth() - 1);
    const mesAnterior = _dirMes(dataAnterior.toISOString());

    const validos = pedidosGlobais.filter(p => p.status !== 'Cancelado');
    const doMes = validos.filter(p => _dirMes(_dirDataPedido(p)) === mesAtual);
    const doMesAnterior = validos.filter(p => _dirMes(_dirDataPedido(p)) === mesAnterior);

    const soma = (lista) => lista.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);

    // ---------- Indicadores ----------
    const emRota = validos.filter(p =>
        ['Intenção Agendada','Aguardando Confirmação','Em Coleta','Em Transporte','Transbordo'].includes(p.status));
    const entreguesMes = doMes.filter(p => p.status === 'Entregue');
    const fatMes = soma(doMes);
    const fatAnterior = soma(doMesAnterior);
    const variacao = fatAnterior > 0 ? ((fatMes - fatAnterior) / fatAnterior) * 100 : null;

    // ocupação média da frota (só cegonhas com carga)
    const ocupacoes = (veiculosGlobais || []).map(v => {
        const carros = validos.filter(p => p.placaCegonha === v.placa &&
            !['Entregue','Cancelado'].includes(p.status)).length;
        return { placa: v.placa, tipo: v.tipo, carros, capacidade: v.capacidade || 11,
                 terceiro: v.propriedade === 'terceiro' };
    });
    // Item 10 — ocupação considera SÓ frota própria (isola terceiros/agregados)
    const comCarga = ocupacoes.filter(o => o.carros > 0 && !o.terceiro);
    const ocupMedia = comCarga.length > 0
        ? Math.round(comCarga.reduce((a, o) => a + (o.carros / o.capacidade) * 100, 0) / comCarga.length)
        : 0;

    const setaVar = variacao === null ? ''
        : variacao >= 0
            ? `<span class="dir-var dir-var-alta">▲ ${variacao.toFixed(0)}%</span>`
            : `<span class="dir-var dir-var-baixa">▼ ${Math.abs(variacao).toFixed(0)}%</span>`;

    const elKpis = document.getElementById('dirIndicadores');
    const _conf = (typeof _conformidadeSeguranca === 'function') ? _conformidadeSeguranca() : null;
    if (elKpis) elKpis.innerHTML = `
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Cargas em rota agora</span>
            <span class="dir-kpi-num">${emRota.length}</span>
            <span class="dir-kpi-obs">${comCarga.length} cegonha(s) carregada(s)</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Carros entregues no mês</span>
            <span class="dir-kpi-num" style="color:#4ade80">${entreguesMes.length}</span>
            <span class="dir-kpi-obs">de ${doMes.length} no total do mês</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Faturamento do mês</span>
            <span class="dir-kpi-num" style="color:#4ade80;font-size:1.5rem">${_dirMoeda(fatMes)}</span>
            <span class="dir-kpi-obs">${setaVar} vs. mês anterior (${_dirMoeda(fatAnterior)})</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Ocupação média da frota</span>
            <span class="dir-kpi-num" style="color:${ocupMedia >= 80 ? '#4ade80' : ocupMedia >= 50 ? '#fbbf24' : '#ef4444'}">${ocupMedia}%</span>
            <span class="dir-kpi-obs">frota própria em operação</span>
        </div>
        ${_conf ? `
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Conformidade — Veículos</span>
            <span class="dir-kpi-num" style="color:${_conf.corVeic}">${_conf.veiculosPct}</span>
            <span class="dir-kpi-obs">checklist em dia · frota própria (${_conf.totalVeic})</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Conformidade — EPIs</span>
            <span class="dir-kpi-num" style="color:${_conf.corEpi}">${_conf.episPct}</span>
            <span class="dir-kpi-obs">motoristas sem pendência (${_conf.totalMot})</span>
        </div>` : ''}`;

    const elPeriodo = document.getElementById('dirPeriodo');
    if (elPeriodo) {
        // meses disponíveis (com dados) para o seletor
        const _anoMin = 2024;
        const mesesDisp = [...new Set(validos.map(p => _dirMes(_dirDataPedido(p))).filter(Boolean))]
          .filter(m => { const a = parseInt(m.slice(0,4),10); return a >= _anoMin && a <= (new Date().getFullYear()+1); })
          .sort().reverse();
        if (!mesesDisp.includes(mesReal)) mesesDisp.unshift(mesReal);
        elPeriodo.innerHTML = '<span style=\'font-size:.85rem;color:#9ca3af\'>Mês de referência:</span> ' +
          '<select onchange=\'_dirMesSel=this.value; renderizarDiretoria();\' style=\'margin:0 8px;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);color:inherit;font-weight:700\'>' +
          mesesDisp.map(m => `<option value="${m}" ${m===mesAtual?'selected':''}>${_dirMesLabel(m)}</option>`).join('') + '</select>' +
          `<button onclick="_dirMostrarGeral()" style="margin-left:8px;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,106,0,.4);background:rgba(255,106,0,.1);color:#ff6a00;font-weight:700;cursor:pointer">📊 Resumo geral (todos os meses)</button>`;
    }

    // ---------- Alertas ----------
    const prazoVencido = validos.filter(p =>
        p.prazoEntregaEstimado && !['Entregue'].includes(p.status) &&
        String(p.prazoEntregaEstimado).slice(0,10) < hoje).length;

    const patioParado = validos.filter(p => p.patioAtual && p.patioDesde &&
        (Date.now() - new Date(p.patioDesde).getTime()) / 3600000 >= 48).length;

    const semCegonha = validos.filter(p =>
        ['Intenção Agendada','Aguardando Confirmação'].includes(p.status) && !p.placaCegonha).length;

    const alertas = [
        { n: prazoVencido, txt: 'pedido(s) com prazo de entrega vencido', ico: '⏰' },
        { n: patioParado,  txt: 'carro(s) parado(s) em pátio há mais de 48h', ico: '🅿️' },
        { n: semCegonha,   txt: 'pedido(s) confirmado(s) sem cegonha definida', ico: '🚛' },
        { n: (_conf ? _conf.criticos : 0), txt: 'veículo(s) da frota própria com pendência CRÍTICA de segurança', ico: '🔴', critico: true }
    ].filter(a => a.n > 0);

    const elAlertas = document.getElementById('dirAlertas');
    if (elAlertas) elAlertas.innerHTML = alertas.length === 0
        ? '<div class="dir-tudo-ok">✅ Nenhum ponto de atenção no momento.</div>'
        : `<div class="dir-alertas">${alertas.map(a =>
            `<div class="dir-alerta${a.critico ? ' dir-alerta-critico' : ''}"><span class="dir-alerta-num">${a.ico} ${a.n}</span><span>${a.txt}</span></div>`
          ).join('')}</div>`;

    // ---------- Faturamento 6 meses ----------
    const meses = [];
    const _hojeD = new Date();
    for (let i = 5; i >= 0; i--) {
        // Usa SEMPRE o dia 1 para evitar o bug do setMonth quando o dia atual
        // é 29/30/31 (voltar 1 mês "pulava" para o mês errado e repetia).
        const d = new Date(_hojeD.getFullYear(), _hojeD.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        meses.push(ym);
    }
    const porMes = meses.map(m => ({
        mes: m,
        total: soma(validos.filter(p => _dirMes(_dirDataPedido(p)) === m)),
        carros: validos.filter(p => _dirMes(_dirDataPedido(p)) === m).length
    }));
    const maxMes = Math.max(...porMes.map(m => m.total), 1);

    const elFat = document.getElementById('dirFaturamento');
    if (elFat) elFat.innerHTML = porMes.map(m => `
        <div class="dir-barra-linha">
            <span class="dir-barra-rot">${_dirMesLabel(m.mes)}</span>
            <div class="dir-barra-trilho">
                <div class="dir-barra" style="width:${Math.max(2, (m.total / maxMes) * 100)}%;
                     background:${m.mes === mesAtual ? '#ff6a00' : 'rgba(255,106,0,0.45)'}"></div>
            </div>
            <span class="dir-barra-val">${_dirMoeda(m.total)}<small>${m.carros} carros</small></span>
        </div>`).join('');

    // ---------- Ocupação da frota ----------
    const elFrota = document.getElementById('dirFrota');
    const propriasOcup = ocupacoes.filter(o => !o.terceiro);
    const qtdTerceiros = ocupacoes.length - propriasOcup.length;
    const frotaOrd = propriasOcup.sort((a, b) => (b.carros / b.capacidade) - (a.carros / a.capacidade));
    if (elFrota) elFrota.innerHTML = (frotaOrd.length === 0
        ? '<p class="text-muted text-sm">Nenhum veículo próprio cadastrado.</p>'
        : frotaOrd.map(o => {
            const pct = Math.round((o.carros / o.capacidade) * 100);
            const cor = pct >= 80 ? '#4ade80' : pct >= 40 ? '#fbbf24' : pct > 0 ? '#fb923c' : '#4b5563';
            return `
            <div class="dir-barra-linha">
                <span class="dir-barra-rot">${o.placa}</span>
                <div class="dir-barra-trilho">
                    <div class="dir-barra" style="width:${Math.max(2, pct)}%;background:${cor}"></div>
                </div>
                <span class="dir-barra-val">${o.carros}/${o.capacidade}<small>${pct}%</small></span>
            </div>`;
        }).join(''))
        + (qtdTerceiros > 0 ? `<p class="text-muted text-sm" style="margin-top:8px">🤝 ${qtdTerceiros} veículo(s) de terceiros/agregados não entram nos indicadores de ocupação.</p>` : '');
    if (typeof renderizarConferenciaDiretoria === 'function') renderizarConferenciaDiretoria();

    // ---------- Rankings ----------
    const ranking = (chaveFn, elId, vazio) => {
        const mapa = {};
        doMes.forEach(p => {
            const k = chaveFn(p);
            if (!k) return;
            if (!mapa[k]) mapa[k] = { total: 0, carros: 0 };
            mapa[k].total += parseFloat(p.valorFrete) || 0;
            mapa[k].carros++;
        });
        const lista = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        const max = Math.max(...lista.map(l => l[1].total), 1);
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = lista.length === 0
            ? `<p class="text-muted text-sm">${vazio}</p>`
            : lista.map(([nome, d]) => `
                <div class="dir-barra-linha">
                    <span class="dir-barra-rot" title="${nome}">${nome}</span>
                    <div class="dir-barra-trilho">
                        <div class="dir-barra" style="width:${Math.max(2,(d.total/max)*100)}%;background:#60a5fa"></div>
                    </div>
                    <span class="dir-barra-val">${_dirMoeda(d.total)}<small>${d.carros} carros</small></span>
                </div>`).join('');
    };

    ranking(p => p.cliente, 'dirClientes', 'Nenhum pedido neste mês.');
    if (typeof renderComerciais === 'function') renderComerciais();

    // Rotas mais rentáveis — layout próprio, com a ROTA INTEIRA descrita
    // e bem visível (não truncada como no ranking de clientes).
    (() => {
        const mapa = {};
        doMes.forEach(p => {
            if (!p.cidadeOrigem || !p.cidadeDestino) return;
            const k = `${p.cidadeOrigem}/${p.ufOrigem || ''} → ${p.cidadeDestino}/${p.ufDestino || ''}`;
            if (!mapa[k]) mapa[k] = { total: 0, carros: 0 };
            mapa[k].total += parseFloat(p.valorFrete) || 0;
            mapa[k].carros++;
        });
        const lista = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        const max = Math.max(...lista.map(l => l[1].total), 1);
        const el = document.getElementById('dirRotas');
        if (!el) return;
        el.innerHTML = lista.length === 0
            ? '<p class="text-muted text-sm">Nenhuma rota neste mês.</p>'
            : lista.map(([nome, d], i) => `
                <div class="dir-rota-item">
                    <div class="dir-rota-topo">
                        <span class="dir-rota-pos">${i + 1}º</span>
                        <span class="dir-rota-nome">${nome}</span>
                        <span class="dir-rota-val">${_dirMoeda(d.total)}</span>
                    </div>
                    <div class="dir-rota-barra-trilho">
                        <div class="dir-rota-barra" style="width:${Math.max(2, (d.total / max) * 100)}%"></div>
                        <span class="dir-rota-carros">${d.carros} carro(s)</span>
                    </div>
                </div>`).join('');
    })();
}

// ============================================
// FOLGAS DE MOTORISTAS E LEMBRETES
// Registra folgas/ferias/atestados e avisa na alocacao
// quando o motorista esta indisponivel.
// ============================================

let folgasGlobais = [];

const TIPOS_FOLGA = {
    folga:      { label: 'Folga',      icone: '🛌', cor: '#60a5fa' },
    ferias:     { label: 'Férias',     icone: '🏖️', cor: '#34d399' },
    atestado:   { label: 'Atestado',   icone: '🏥', cor: '#f472b6' },
    manutencao: { label: 'Manutenção', icone: '🔧', cor: '#fb923c' },
    lembrete:   { label: 'Lembrete',   icone: '📌', cor: '#fbbf24' }
};

async function carregarFolgas() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('folgas_lembretes')
            .select('*').order('data_inicio', { ascending: true });
        folgasGlobais = data || [];
    } catch (e) {
        folgasGlobais = [];
        console.warn('Folgas não carregadas:', e.message);
    }
}

// Um registro cobre a data informada?
function folgaCobreData(f, dataISO) {
    const d = String(dataISO).slice(0, 10);
    const ini = String(f.data_inicio).slice(0, 10);
    const fim = String(f.data_fim || f.data_inicio).slice(0, 10);
    return d >= ini && d <= fim;
}

// Motorista está indisponível nessa data? Devolve o registro ou null.
function motoristaIndisponivel(nomeMotorista, dataISO) {
    if (!nomeMotorista) return null;
    const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                       .toUpperCase().replace(/\s+/g, ' ').trim();
    const alvo = norm(nomeMotorista);
    const data = dataISO || new Date().toISOString().slice(0, 10);
    return (folgasGlobais || []).find(f =>
        f.motorista_id && norm(f.motorista_nome) === alvo && folgaCobreData(f, data)
    ) || null;
}

function renderizarFolgas() {
    const painel = document.getElementById('painelFolgas');
    if (!painel) return;

    const hoje = new Date().toISOString().slice(0, 10);
    const emDias = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    const ativos   = folgasGlobais.filter(f => folgaCobreData(f, hoje));
    const proximos = folgasGlobais.filter(f => String(f.data_inicio).slice(0,10) > hoje
                                            && String(f.data_inicio).slice(0,10) <= emDias(30));
    const proximos15 = folgasGlobais.filter(f => (f.tipo||'folga') !== 'lembrete'
                                            && String(f.data_inicio).slice(0,10) > hoje
                                            && String(f.data_inicio).slice(0,10) <= emDias(15));
    const passados = folgasGlobais.filter(f =>
        String(f.data_fim || f.data_inicio).slice(0,10) < hoje).slice(-10).reverse();

    const cartao = (f) => {
        const cfg = TIPOS_FOLGA[f.tipo] || TIPOS_FOLGA.lembrete;
        const ini = new Date(String(f.data_inicio).slice(0,10) + 'T12:00').toLocaleDateString('pt-BR');
        const fim = f.data_fim && String(f.data_fim).slice(0,10) !== String(f.data_inicio).slice(0,10)
            ? ' até ' + new Date(String(f.data_fim).slice(0,10) + 'T12:00').toLocaleDateString('pt-BR')
            : '';
        return `
        <div class="folga-card" style="border-left-color:${cfg.cor}">
            <div class="folga-topo">
                <span class="folga-tipo" style="color:${cfg.cor};background:${cfg.cor}18;border:1px solid ${cfg.cor}45">
                    ${cfg.icone} ${cfg.label}
                </span>
                <span class="folga-quem">${f.motorista_nome || 'Geral'}</span>
                <span class="folga-data">${ini}${fim}</span>
                <button class="btn-kanban-excluir" onclick="excluirFolga(${f.id})" title="Excluir">🗑️</button>
            </div>
            ${f.descricao ? `<div class="folga-desc">${f.descricao}</div>` : ''}
        </div>`;
    };

    painel.innerHTML = `
        <div class="patios-resumo">
            <div class="patios-resumo-item ${ativos.length > 0 ? 'patios-resumo-alerta' : ''}">
                <strong>${ativos.length}</strong><span>indisponível(is) hoje</span>
            </div>
            <div class="patios-resumo-item ${proximos15.length > 0 ? 'patios-resumo-alerta' : ''}">
                <strong>${proximos15.length}</strong><span>⚠️ folga(s) em ≤ 15 dias</span>
            </div>
            <div class="patios-resumo-item">
                <strong>${proximos.length}</strong><span>agendado(s) nos próximos 30 dias</span>
            </div>
        </div>

        <h3 class="conf-titulo">Hoje</h3>
        ${ativos.length === 0
            ? '<p class="text-muted text-sm" style="padding:0.4rem 0">Todos disponíveis hoje. 👌</p>'
            : ativos.map(cartao).join('')}

        <h3 class="conf-titulo" style="margin-top:1.2rem">Próximos 30 dias</h3>
        ${proximos.length === 0
            ? '<p class="text-muted text-sm" style="padding:0.4rem 0">Nada agendado.</p>'
            : proximos.map(cartao).join('')}

        ${passados.length > 0 ? `
            <h3 class="conf-titulo" style="margin-top:1.2rem">Encerrados recentes</h3>
            <div class="folgas-passadas">${passados.map(cartao).join('')}</div>` : ''}`;
}

function abrirNovaFolga() {
    const existente = document.getElementById('modalFolga');
    if (existente) existente.remove();

    const opcoesMot = ['<option value="">— Lembrete geral (sem motorista) —</option>']
        .concat((motoristasGlobais || []).map(m =>
            `<option value="${m.id}|${(m.nome||'').replace(/"/g,'&quot;')}">${m.nome}</option>`)).join('');

    const opcoesTipo = Object.entries(TIPOS_FOLGA)
        .map(([v, c]) => `<option value="${v}">${c.icone} ${c.label}</option>`).join('');

    const hoje = new Date().toISOString().slice(0, 10);

    const modal = document.createElement('div');
    modal.id = 'modalFolga';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px">
            <span class="close" onclick="document.getElementById('modalFolga').remove()">&times;</span>
            <h2>📅 Novo registro</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="folgaTipo" onchange="alternarCampoVeiculoFolga()">${opcoesTipo}</select>
                </div>
                <div class="form-group">
                    <label>Motorista</label>
                    <select id="folgaMotorista">${opcoesMot}</select>
                </div>
            </div>
            <div id="folgaGrupoVeiculo" class="form-group" style="display:none">
                <label>Veículo em manutenção *</label>
                <select id="folgaVeiculo">
                    <option value="">Selecione o caminhão</option>
                    ${(typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
                        .filter(v => v.propriedade !== 'terceiro')
                        .map(v => `<option value="${v.placa}">${v.placa}${v.modelo ? ' · ' + v.modelo : ''}</option>`).join('')}
                </select>
                <p class="text-muted text-sm" style="margin-top:0.3rem">O caminhão selecionado ficará <strong style="color:#ef4444">bloqueado em vermelho</strong> no painel de cegonhas até este lembrete ser concluído.</p>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data de início *</label>
                    <input type="date" id="folgaInicio" value="${hoje}">
                </div>
                <div class="form-group">
                    <label>Data de fim <span class="text-muted text-sm">(vazio = 1 dia)</span></label>
                    <input type="date" id="folgaFim">
                </div>
            </div>
            <div class="form-group">
                <label>Observação</label>
                <input type="text" id="folgaDescricao" placeholder="Ex: folga compensatória, férias programadas...">
            </div>
            <div id="mensagemFolga" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarFolga()">Salvar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalFolga').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// #3 · Manutenção de veículo: alterna o campo de seleção conforme o tipo
function alternarCampoVeiculoFolga() {
    const tipo = document.getElementById('folgaTipo')?.value;
    const grupo = document.getElementById('folgaGrupoVeiculo');
    if (!grupo) return;
    grupo.style.display = tipo === 'manutencao' ? '' : 'none';
}

// Retorna o registro de manutenção ATIVA (dentro do período) que se aplica ao
// veículo — ou null se não houver. Usado para colorir o painel de cegonhas.
function manutencaoAtivaDoVeiculo(placa) {
    if (!placa || typeof folgasGlobais === 'undefined' || !folgasGlobais) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    return folgasGlobais.find(f => f.tipo === 'manutencao'
        && f.veiculo_placa === placa
        && (!f.data_inicio || f.data_inicio <= hoje)
        && (!f.data_fim || f.data_fim >= hoje)) || null;
}

async function salvarFolga() {
    const msgEl = document.getElementById('mensagemFolga');
    const inicio = document.getElementById('folgaInicio').value;
    const fim = document.getElementById('folgaFim').value || null;

    if (!inicio) {
        msgEl.textContent = 'Informe a data de início.';
        msgEl.className = 'message show error';
        return;
    }
    if (fim && fim < inicio) {
        msgEl.textContent = 'A data de fim não pode ser anterior à de início.';
        msgEl.className = 'message show error';
        return;
    }

    const sel = document.getElementById('folgaMotorista').value;
    const [motoristaId, motoristaNome] = sel ? sel.split('|') : [null, null];

    const tipo = document.getElementById('folgaTipo').value;
    const veiculoPlaca = document.getElementById('folgaVeiculo')?.value || null;
    if (tipo === 'manutencao' && !veiculoPlaca) {
        msgEl.textContent = 'Selecione o veículo em manutenção.';
        msgEl.className = 'message show error';
        return;
    }

    try {
        const { error } = await supabase.from('folgas_lembretes').insert({
            tipo: tipo,
            motorista_id: motoristaId ? parseInt(motoristaId) : null,
            motorista_nome: motoristaNome || null,
            veiculo_placa: veiculoPlaca,
            data_inicio: inicio,
            data_fim: fim,
            descricao: document.getElementById('folgaDescricao').value.trim() || null,
            criado_por: document.getElementById('usuarioLogado')?.textContent || 'Logística'
        });
        if (error) throw error;

        document.getElementById('modalFolga').remove();
        await carregarFolgas();
        renderizarFolgas();
        if (typeof renderizarPainelCegonhas === 'function') renderizarPainelCegonhas();
        exibirMensagem('mensagemLogistica', '✅ Registro salvo.', 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function excluirFolga(id) {
    if (!confirm('Excluir este registro?')) return;
