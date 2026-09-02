/* ==========================================================================
   MODULE: 05-comercial.js
   Lançamento comercial + import EVO
   Linhas originais: 842-1268
   ========================================================================== */

// ============================================
// LANÇAMENTO COMERCIAL
// ============================================

// Item 1 — modal ao finalizar o lançamento: aguardando aprovação ou já aprovado
function _abrirModalAprovacaoLancamento(){
  const old = document.getElementById('modalAprovLanc'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAprovLanc';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10000';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:440px;width:92%;border-radius:14px;padding:24px">
      <h2 style="margin:0 0 6px">✅ Como registrar este pedido?</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1.2rem">Escolha se o pedido já entra aprovado no fluxo ou se fica aguardando aprovação.</p>
      <button class="aprov-opt" onclick="_confirmarAprovacaoLanc(true)">
        <div class="aprov-ic" style="background:rgba(34,197,94,.15)">✅</div>
        <div><div class="aprov-tit">Já aprovado</div><div class="aprov-sub">Entra direto nos corredores / sem rota para planejamento.</div></div>
      </button>
      <button class="aprov-opt" onclick="_confirmarAprovacaoLanc(false)">
        <div class="aprov-ic" style="background:rgba(245,158,11,.15)">⏳</div>
        <div><div class="aprov-tit">Aguardando aprovação</div><div class="aprov-sub">Fica numa área separada até alguém (comercial ou logística) aprovar.</div></div>
      </button>
      <button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="document.getElementById('modalAprovLanc').remove()">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
}

function _confirmarAprovacaoLanc(aprovado){
  window._lancamentoJaAprovado = aprovado;
  window._lancamentoAprovacaoEscolhida = true;
  document.getElementById('modalAprovLanc')?.remove();
  // dispara o submit de novo, agora com a escolha feita
  const form = document.getElementById('formComercial');
  if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable:true}));
}

// ============================================================
// IMPORTAÇÃO DE CARGAS DO EVO APP (Excel)
// ============================================================
let _evoPreview = null; // dados processados aguardando confirmação

function _evoArquivoSelecionado(event){
  const file = event.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined'){ alert('Biblioteca de leitura de Excel não carregou. Recarregue a página (Ctrl+Shift+R) e tente de novo.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
      _evoProcessar(linhas);
    } catch(err){ alert('Não consegui ler a planilha: '+(err.message||err)); }
    event.target.value = ''; // permite reimportar o mesmo arquivo
  };
  reader.readAsArrayBuffer(file);
}

// Índice das colunas do Evo (baseado no cabeçalho da linha 2)
function _evoMapCols(header){
  const idx = {};
  header.forEach((nome, i) => { if (nome) idx[String(nome).trim()] = i; });
  return idx;
}

function _evoProcessar(linhas){
  // linha 0 = grupos, linha 1 = cabeçalho real, dados a partir da linha 2
  if (!linhas || linhas.length < 3){ alert('Planilha vazia ou fora do formato esperado.'); return; }
  const H = _evoMapCols(linhas[1]);
  const col = (nome) => H[nome];
  const get = (row, nome) => { const c = col(nome); return c!=null ? row[c] : null; };

  // agrupa por ID (pregão) — cada ID = 1 pedido com N carros
  const grupos = {};
  for (let r = 2; r < linhas.length; r++){
    const row = linhas[r];
    if (!row) continue;
    const placa = get(row, 'PLACA/CÓD.') || get(row, 'LOCALIZADOR');
    if (!placa) continue;
    const idPedido = get(row, 'ID') || placa;
    if (!grupos[idPedido]) grupos[idPedido] = [];
    grupos[idPedido].push({
      placa: String(placa).trim(),
      localizador: get(row,'LOCALIZADOR'),
      modelo: get(row,'MODELO') || '',
      valorVeiculo: get(row,'VALOR DO VEÍCULO (R$)'),
      frete: parseFloat(get(row,'TRANSPORTE (R$)')) || null,
      embarcador: get(row,'EMBARCADOR (NOME)') || '',
      embarcadorDoc: get(row,'TOMADOR (CPF/CNPJ)') || get(row,'EMBARCADOR (CPF/CNPJ)') || '',
      colLocal: get(row,'LOCAL'), colRua: get(row,'RUA'), colNum: get(row,'NÚMERO'),
      colBairro: get(row,'BAIRRO'), colCidade: get(row,'CIDADE'), colUf: get(row,'UF'),
      colCep: get(row,'CEP'), colCnpj: get(row,'CPF/CNPJ'), colContato: get(row,'CONTATO'), colTel: get(row,'TELEFONE'),
      entLocal: get(row,'LOCAL (1)'), entRua: get(row,'RUA (1)'), entNum: get(row,'NÚMERO (1)'),
      entBairro: get(row,'BAIRRO (1)'), entCidade: get(row,'CIDADE (1)'), entUf: get(row,'UF (1)'),
      entCep: get(row,'CEP (1)'), entCnpj: get(row,'CPF/CNPJ (1)'),
      dtLancamento: get(row,'DT. LANÇAMENTO')
    });
  }

  const pedidos = Object.keys(grupos).map(id => {
    const carros = grupos[id];
    const ref = carros[0];
    const dupCarros = carros.filter(c => (pedidosGlobais||[]).some(p =>
      _norm(p.placa||'') === _norm(c.placa) && _norm(p.cidadeDestino||'') === _norm(c.entCidade||'')));
    return { id, carros, ref, duplicado: dupCarros.length };
  });

  _evoPreview = pedidos;
  _evoAbrirPreview(pedidos);
}

function _evoAbrirPreview(pedidos){
  const totalCarros = pedidos.reduce((s,p)=>s+p.carros.length,0);
  const comDup = pedidos.filter(p => p.duplicado > 0).length;
  const old = document.getElementById('evoPreviewOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'evoPreviewOverlay';
  div.className = 'evo-overlay';
  div.innerHTML = `
    <div class="evo-bg" onclick="document.getElementById('evoPreviewOverlay').remove()"></div>
    <div class="evo-painel">
      <div class="evo-head">
        <div>
          <h2 style="margin:0">📥 Importar do Evo — prévia</h2>
          <p class="text-muted" style="font-size:.85rem;margin:.3rem 0 0">${pedidos.length} pedido(s) · ${totalCarros} carro(s)${comDup?` · <span style="color:#f59e0b">⚠️ ${comDup} possível(is) duplicado(s)</span>`:''}</p>
        </div>
        <button class="evo-x" onclick="document.getElementById('evoPreviewOverlay').remove()">✕</button>
      </div>
      <div class="evo-lista">
        ${pedidos.map((p,i) => {
          const c = p.ref;
          const semCliente = !c.embarcador;
          const semDestino = !c.entCidade;
          const problema = semCliente || semDestino;
          return `<div class="evo-ped ${p.duplicado?'evo-dup':''}">
            <label class="evo-ped-head">
              <input type="checkbox" class="evo-chk" data-idx="${i}" ${problema?'':'checked'}>
              <span class="evo-ped-id">${p.id}</span>
              <span class="evo-ped-badge">🔗 ${p.carros.length} carro(s)</span>
              ${p.duplicado?`<span class="evo-dup-badge">⚠️ ${p.duplicado} já existe(m)</span>`:''}
              ${problema?`<span class="evo-prob-badge">⚠️ ${semCliente?'sem cliente':''}${semCliente&&semDestino?' / ':''}${semDestino?'sem destino':''}</span>`:''}
            </label>
            <div class="evo-ped-info">
              <div>👤 <strong>${c.embarcador||'—'}</strong> ${c.embarcadorDoc?`· ${c.embarcadorDoc}`:''}</div>
              <div>📍 ${c.colCidade||'—'}/${c.colUf||''} → 🏁 ${c.entCidade||'—'}/${c.entUf||''}</div>
              <div class="text-muted" style="font-size:.78rem">🚗 ${p.carros.map(x=>x.placa).join(', ')}</div>
              <div class="text-muted" style="font-size:.78rem">${c.modelo||'sem modelo'} · frete: ${c.frete?('R$ '+c.frete.toLocaleString('pt-BR')):'a preencher'}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="evo-actions">
        <button class="btn btn-primary" onclick="_evoConfirmarImportacao()">✅ Importar selecionados</button>
        <button class="btn btn-secondary" onclick="document.getElementById('evoPreviewOverlay').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Converte a data do Evo (texto dd/mm/aaaa, ou serial do Excel) para ISO
function _evoParseData(v){
  if (!v) return null;
  // número serial do Excel (dias desde 1899-12-30)
  if (typeof v === 'number'){
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString();
  }
  const s = String(v).trim();
  // formato dd/mm/aaaa (com ou sem hora)
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m){ const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`); return isNaN(d)?null:d.toISOString(); }
  // formato aaaa-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m){ const d = new Date(s); return isNaN(d)?null:d.toISOString(); }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

async function _evoConfirmarImportacao(){
  console.log('%c[Evo Import v257] iniciando — grupo_id via UUID','color:#ff6a00;font-weight:bold');
  const marcados = [...document.querySelectorAll('.evo-chk:checked')].map(c => parseInt(c.getAttribute('data-idx')));
  if (marcados.length === 0){ alert('Selecione ao menos um pedido para importar.'); return; }
  const pedidos = marcados.map(i => _evoPreview[i]);
  const btn = document.querySelector('#evoPreviewOverlay .btn-primary');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Importando...'; }

  let criados = 0, clientesCriados = 0;
  window._evoErroMostrado = false;
  try {
    for (const ped of pedidos){
      const c = ped.ref;
      let clienteId = null, clienteNome = c.embarcador || '';
      if (c.embarcador){
        let cli = (clientesGlobais||[]).find(x =>
          (c.embarcadorDoc && _norm(x.cnpj||'')===_norm(c.embarcadorDoc)) || _norm(x.nome||'')===_norm(c.embarcador));
        if (!cli){
          const novoCli = {
            nome: c.embarcador, cnpj: c.embarcadorDoc || null, tipo_cliente: 'empresa',
            cidade: c.colCidade || null, uf: c.colUf || null,
            endereco: c.colRua || null, numero: c.colNum ? String(c.colNum) : null,
            bairro: c.colBairro || null, cep: c.colCep || null,
            telefone: c.colTel || null
          };
          const { data, error: errCli } = await supabase.from('clientes').insert(novoCli).select();
          if (errCli){ console.error('Evo import erro no cliente', c.embarcador, errCli); }
          if (data && data[0]){ cli = data[0]; clientesGlobais.push(cli); clientesCriados++; }
        }
        if (cli){ clienteId = cli.id; clienteNome = cli.nome; }
      }
      const grupoId = ped.carros.length > 1 ? (typeof gerarGrupoId === 'function' ? gerarGrupoId() : (crypto.randomUUID ? crypto.randomUUID() : null)) : null;
      for (const carro of ped.carros){
        const novoPedido = {
          cliente: clienteNome, cliente_id: clienteId,
          modelo: carro.modelo || '', placa: carro.placa,
          referencia: String(ped.id||''),
          cidade_origem: c.colCidade || null, uf_origem: c.colUf || null,
          cidade_destino: c.entCidade || null, uf_destino: c.entUf || null,
          endereco_coleta: [c.colRua, c.colNum, c.colBairro].filter(Boolean).join(', ') || null,
          endereco_entrega: [c.entRua, c.entNum, c.entBairro].filter(Boolean).join(', ') || null,
          cnpj_coleta: c.colCnpj ? String(c.colCnpj) : null,
          cnpj_entrega: c.entCnpj ? String(c.entCnpj) : null,
          cep_coleta: c.colCep ? String(c.colCep) : null,
          cep_entrega: c.entCep ? String(c.entCep) : null,
          valor_frete: Number(carro.frete) || 0,
          data_solicitacao: _evoParseData(c.dtLancamento) || new Date().toISOString(),
          status: 'Pendente',
          aprovado: true,
          aprovado_em: new Date().toISOString(),
          grupo_id: grupoId,
          origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
          criado_por_nome: 'Importado do Evo'
        };
        const { error } = await supabase.from('pedidos').insert(novoPedido);
        if (!error) criados++;
        else {
          console.error('Evo import erro no pedido', carro.placa, '| MENSAGEM:', error.message, '| DETALHES:', error.details, '| DICA:', error.hint, '| CODE:', error.code);
          console.error('Evo pedido que falhou:', JSON.stringify(novoPedido));
          if (!window._evoErroMostrado){
            window._evoErroMostrado = true;
            alert('Erro ao importar (primeiro pedido que falhou):\n\n'
              + 'Placa: '+carro.placa+'\n'
              + 'Mensagem: '+(error.message||'—')+'\n'
              + (error.details?('Detalhes: '+error.details+'\n'):'')
              + (error.hint?('Dica: '+error.hint):''));
          }
        }
      }
    }
    await recarregarPedidos();
    document.getElementById('evoPreviewOverlay')?.remove();
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`✅ ${criados} carro(s) importado(s)!`);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Importação concluída: ${criados} carro(s)${clientesCriados?`, ${clientesCriados} cliente(s) novo(s)`:''}. Revise os pedidos se necessário.`, 'success');
  } catch(e){
    alert('Erro na importação: '+(e.message||e));
    if (btn){ btn.disabled = false; btn.textContent = '✅ Importar selecionados'; }
  }
}

async function salvarPedidoComercial(event) {
    event.preventDefault();

    // Item 1 — pergunta se o pedido já nasce aprovado ou aguardando aprovação
    if (window._lancamentoAprovacaoEscolhida !== true){
        _abrirModalAprovacaoLancamento();
        return;
    }
    window._lancamentoAprovacaoEscolhida = false; // reseta para o próximo

    // Item 1 — modo Reserva (fluxo leve, sem veículos, com timer)
    if (document.getElementById('pedidoReserva')?.checked) {
        return salvarReservaComercial();
    }

    const pedido = {
        cliente: document.getElementById('cliente').value,
        dataSolicitacao: document.getElementById('dataSolicitacao').value,
        prazoEntregaEstimado: document.getElementById('prazoEntregaEstimado')?.value || null,
        modelo: document.getElementById('modelo').value,
        placa: document.getElementById('placa').value,
        cidadeOrigem: document.getElementById('cidadeOrigem').value,
        categoriaVeiculo: document.getElementById('categoriaVeiculo')?.value || null,
        ufOrigem: document.getElementById('ufOrigem').value,
        cidadeDestino: document.getElementById('cidadeDestino').value,
        ufDestino: document.getElementById('ufDestino').value,
        enderecoColeta: document.getElementById('enderecoColeta').value,
        enderecoEntrega: document.getElementById('enderecoEntrega').value,
        valorFrete: valorMoedaParaFloat(document.getElementById('valorFrete').value),
        responsavelComercial: _getResponsavelComercial(),
        referencia: (document.getElementById('referenciaVeiculo1')?.value.trim() || document.getElementById('referenciaPedido')?.value.trim() || null),
        observacao: document.getElementById('observacaoPedido')?.value.trim() || null
    };

    if (!validarPedido(pedido)) {
        exibirMensagem('mensagemComercial', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    // Veículos adicionais do mesmo cliente (mesma origem/destino)
    const veiculosExtras = coletarVeiculosExtras();
    if (veiculosExtras === null) {
        exibirMensagem('mensagemComercial', 'Preencha modelo e placa de todos os veículos adicionais (ou remova a linha vazia).', 'error');
        return;
    }

    // Placas duplicadas no mesmo lançamento
    const todasPlacas = [pedido.placa.toUpperCase(), ...veiculosExtras.map(v => v.placa)];
    if (new Set(todasPlacas).size !== todasPlacas.length) {
        exibirMensagem('mensagemComercial', 'Há placas repetidas no mesmo lançamento. Verifique os veículos.', 'error');
        return;
    }

    if (supabase) {
        try {
            const dadosParaSalvar = {
                cliente: pedido.cliente,
                cliente_id: document.getElementById('clienteId')?.value ? parseInt(document.getElementById('clienteId').value) : null,
                data_solicitacao: pedido.dataSolicitacao,
                prazo_entrega_estimado: pedido.prazoEntregaEstimado,
                modelo: pedido.modelo,
                placa: pedido.placa,
                cidade_origem: pedido.cidadeOrigem,
                categoria_veiculo: pedido.categoriaVeiculo,
                uf_origem: pedido.ufOrigem,
                cidade_destino: pedido.cidadeDestino,
                uf_destino: pedido.ufDestino,
                cep_coleta: document.getElementById('cepColeta')?.value || null,
                endereco_coleta: pedido.enderecoColeta,
                cnpj_coleta: document.getElementById('cnpjColeta')?.value.trim() || null,
                cep_entrega: document.getElementById('cepEntrega')?.value || null,
                endereco_entrega: pedido.enderecoEntrega,
                cnpj_entrega: document.getElementById('cnpjEntrega')?.value.trim() || null,
                valor_frete: pedido.valorFrete,
                frete_tipo: document.getElementById('freteTipo')?.value || 'cheio',
                responsavel_comercial: pedido.responsavelComercial,
                referencia: pedido.referencia,
                observacao_pedido: pedido.observacao,
                tipo_entrega: document.getElementById('tipoEntregaPedido')?.value || 'patio',
                forma_coleta: document.getElementById('formaColeta')?.value || null,
                patio_coleta: (document.getElementById('formaColeta')?.value === 'patio') ? (document.getElementById('patioColeta')?.value || null) : null,
                equipe_coleta_id: (document.getElementById('formaColeta')?.value === 'coletador') ? (parseInt(document.getElementById('equipeColeta')?.value) || null) : null,
                obs_coleta: document.getElementById('obsColeta')?.value.trim() || null,
                origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
                criado_por_nome: (document.getElementById('usuarioLogado')?.textContent || null),
                corredor_manual_id: (parseInt(document.getElementById('pedidoCorredor')?.value) || null),
                aprovado: (window._lancamentoJaAprovado === true),
                aprovado_em: (window._lancamentoJaAprovado === true) ? new Date().toISOString() : null,
                aprovado_por: (window._lancamentoJaAprovado === true) ? (document.getElementById('usuarioLogado')?.textContent || null) : null,
                status: 'Pendente'
            };

            // ===== Cálculo do frete conforme o tipo (por carro x frete cheio) =====
            const _freteTipo = document.getElementById('freteTipo')?.value || 'cheio';
            const _valorBase = Number(dadosParaSalvar.valor_frete) || 0;
            const _qtdCarros = 1 + veiculosExtras.length;
            let _valoresCarro; // valor de frete de cada carro (índice 0 = principal)
            if (_freteTipo === 'cheio') {
                // "frete cheio" = total da carga; divide entre os carros (total é a verdade)
                const base = Math.floor((_valorBase / _qtdCarros) * 100) / 100;
                _valoresCarro = Array(_qtdCarros).fill(base);
                const resto = Math.round((_valorBase - base * _qtdCarros) * 100) / 100;
                _valoresCarro[_qtdCarros - 1] = Math.round((base + resto) * 100) / 100; // última linha absorve o centavo
            } else {
                // "por carro" = valor unitário; cada carro usa o seu (ou o principal)
                _valoresCarro = [_valorBase];
                veiculosExtras.forEach(v => _valoresCarro.push(v.valorFrete !== null ? v.valorFrete : _valorBase));
            }

            // Monta 1 pedido por veículo; se houver mais de 1, vincula por grupo_id
            let linhasParaInserir;
            if (veiculosExtras.length > 0) {
                const grupoId = gerarGrupoId();
                linhasParaInserir = [
                    { ...dadosParaSalvar, valor_frete: _valoresCarro[0], grupo_id: grupoId },
                    ...veiculosExtras.map((v, i) => ({
                        ...dadosParaSalvar,
                        modelo: v.modelo,
                        placa: v.placa,
                        categoria_veiculo: v.categoriaVeiculo || dadosParaSalvar.categoria_veiculo || null,
                        valor_frete: _valoresCarro[i + 1],
                        referencia: v.referencia || dadosParaSalvar.referencia,
                        endereco_coleta:  v.enderecoColeta  || dadosParaSalvar.endereco_coleta,
                        endereco_entrega: v.enderecoEntrega || dadosParaSalvar.endereco_entrega,
                        grupo_id: grupoId
                    }))
                ];
            } else {
                linhasParaInserir = [{ ...dadosParaSalvar, valor_frete: _valoresCarro[0] }];
            }

            const { error } = await supabase.from('pedidos').insert(linhasParaInserir);
            if (error) throw error;

            await recarregarPedidos();
            const qtd = linhasParaInserir.length;
            exibirMensagem('mensagemComercial',
                qtd > 1 ? `✅ ${qtd} pedidos salvos com sucesso (1 por veículo, mesmo grupo)!` : '✅ Pedido salvo com sucesso!',
                'success');

            // Avisa a logística que chegou pedido novo
            notificar({
                perfil: 'logistica', tipo: 'acao',
                titulo: qtd > 1 ? `Nova ${nomenclaturaCarga(qtd)}: ${qtd} carros` : 'Novo pedido para alocar',
                mensagem: `${pedido.cliente} · ${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}`
            });
            document.getElementById('formComercial').reset();
            limparVeiculosExtras();
            await carregarPainel();
            await carregarFaturamento();
            renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        } catch (error) {
            console.error('Erro ao salvar pedido:', error, '| details:', error.details, '| hint:', error.hint, '| code:', error.code);
            exibirMensagem('mensagemComercial', 'Erro ao salvar: ' + (error.message||'') + (error.details?(' — '+error.details):''), 'error');
        }
    } else {
        pedidosGlobais.push(pedido);
        exibirMensagem('mensagemComercial', 'Pedido salvo localmente!', 'success');
        document.getElementById('formComercial').reset();
    }
}

function validarPedido(pedido) {
    return pedido.cliente && pedido.dataSolicitacao && pedido.modelo && pedido.placa &&
           pedido.cidadeOrigem && pedido.ufOrigem && pedido.cidadeDestino && pedido.ufDestino &&
           pedido.enderecoColeta && pedido.enderecoEntrega && pedido.valorFrete;
}

