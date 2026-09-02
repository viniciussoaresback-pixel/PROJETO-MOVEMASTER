/* ==========================================================================
   MODULE: 15-manutencao-epi.js
   Manutenção, EPI, corredores, reservas
   Linhas originais: 10517-11758
   ========================================================================== */

        } catch(e) {
            console.warn('Erro ao registrar espelho:', e);
        }
    }

    // Abrir PDF em nova aba
    const janela = window.open('', '_blank');
    janela.document.write(html);
    janela.document.close();
}
// ============================================================
// LOTE 2 — MANUTENÇÃO: CHECKLIST DE SEGURANÇA + TAG DE INTEGRIDADE
// (itens 13.2 e 13.7)
// ============================================================
const CHECKLIST_BLOCOS = [
  { grupo: 'Mecânica e Rodagem',      itens: ['Pneus','Freios','Sistema de Direção','Iluminação/Sinalização'] },
  { grupo: 'Segurança e Cegonha',     itens: ['Cintas de Amarração','Catracas','Decks/Rampas Hidráulicas','Pinos de Trava'] },
  { grupo: 'Acessórios Obrigatórios', itens: ['Tacógrafo','Extintor','Triângulo','Cinto de Segurança','Macaco/Chave de Roda'] }
];

function _hojeISO(){ return new Date().toISOString().slice(0,10); }
function _addUmMes(iso){ const d = new Date(iso+'T12:00'); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); }
function _fmtDataChk(iso){ if(!iso) return '—'; return new Date(iso+'T12:00').toLocaleDateString('pt-BR'); }

// Regra da tag (item 13): >=1 crítico OU >=6 atenção => vermelho; 1..5 atenção => amarelo; senão verde
function calcularTagChecklist(qtdAtencao, qtdCritico){
  if (qtdCritico >= 1 || qtdAtencao >= 6) return 'vermelho';
  if (qtdAtencao >= 1) return 'amarelo';
  return 'verde';
}

// Status efetivo considerando a validade mensal: vencido => no mínimo amarelo
function statusIntegridadeEfetivo(v){
  const base = v.status_integridade || 'verde';
  const vencido = v.checklist_valido_ate ? (v.checklist_valido_ate < _hojeISO()) : true; // sem checklist = vencido
  if (base === 'vermelho') return { cor:'vermelho', motivo:'Pendência crítica' };
  if (vencido) return { cor:'amarelo', motivo: v.checklist_valido_ate ? 'Checklist vencido' : 'Sem checklist' };
  return { cor: base, motivo: base === 'amarelo' ? 'Pontos em atenção' : 'Checklist em dia' };
}

const _TAG_META = {
  verde:   { emoji:'🟢', label:'Aprovado' },
  amarelo: { emoji:'🟡', label:'Atenção' },
  vermelho:{ emoji:'🔴', label:'Impedido' }
};

function tagIntegridadeHTML(v){
  const ef = statusIntegridadeEfetivo(v);
  const m = _TAG_META[ef.cor] || _TAG_META.verde;
  const val = v.checklist_valido_ate ? ' (válido até '+_fmtDataChk(v.checklist_valido_ate)+')' : '';
  return `<span class="tag-integridade tag-${ef.cor}" title="${m.label} — ${ef.motivo}${val}">${m.emoji} ${m.label}</span>`;
}

// Só frota própria tem checklist (itens 10/13)
function _veiculosFrotaPropria(){
  return (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
}

function carregarManutencao(){
  const sel = document.getElementById('checklistVeiculo');
  if (!sel) return;
  const atual = sel.value;
  const lista = _veiculosFrotaPropria();
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    lista.map(v => `<option value="${v.id}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
  renderChecklistForm();
  renderEPIForm();
  _preencherMotoristasEPI();
  if (typeof _preencherVeiculosAgendamento === 'function') _preencherVeiculosAgendamento();
  if (typeof listarAgendamentos === 'function') listarAgendamentos();
  if (typeof _preencherVeiculosEmergencia === 'function') _preencherVeiculosEmergencia();
  if (typeof renderizarParadasEmergencia === 'function') renderizarParadasEmergencia();
  aoTrocarVeiculoChecklist();
}

function renderChecklistForm(){
  const cont = document.getElementById('checklistForm');
  if (!cont) return;
  cont.innerHTML = CHECKLIST_BLOCOS.map((bloco, bi) => `
    <div class="checklist-bloco">
      <h4>${bloco.grupo}</h4>
      ${bloco.itens.map((item, ii) => {
        const name = 'chk_'+bi+'_'+ii;
        return `
        <div class="checklist-linha">
          <span class="checklist-item-nome">${item}</span>
          <div class="checklist-opcoes">
            <label class="opt opt-ok"><input type="radio" name="${name}" value="OK" checked> OK</label>
            <label class="opt opt-at"><input type="radio" name="${name}" value="Atencao"> Atenção</label>
            <label class="opt opt-cr"><input type="radio" name="${name}" value="Critico"> Crítico</label>
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

function _lerChecklistSelecionado(){
  const itens = [];
  let qtdAtencao = 0, qtdCritico = 0;
  CHECKLIST_BLOCOS.forEach((bloco, bi) => {
    bloco.itens.forEach((item, ii) => {
      const val = document.querySelector('input[name="chk_'+bi+'_'+ii+'"]:checked')?.value || 'OK';
      if (val === 'Atencao') qtdAtencao++;
      if (val === 'Critico') qtdCritico++;
      itens.push({ grupo: bloco.grupo, item, status: val });
    });
  });
  return { itens, qtdAtencao, qtdCritico };
}

function aoTrocarVeiculoChecklist(){
  const sel = document.getElementById('checklistVeiculo');
  const tagEl = document.getElementById('checklistTagAtual');
  const id = sel?.value;
  if (!id){ if(tagEl) tagEl.innerHTML=''; carregarHistoricoChecklist(null); return; }
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(id));
  if (tagEl && v) tagEl.innerHTML = 'Status atual: ' + tagIntegridadeHTML(v);
  if (typeof _preencherMotoristasEPI === 'function') _preencherMotoristasEPI();
  carregarHistoricoChecklist(id);
}

async function salvarChecklist(){
  const msgEl = document.getElementById('mensagemChecklist');
  const sel = document.getElementById('checklistVeiculo');
  const id = sel?.value;
  if (!id){ msgEl.textContent='Selecione um veículo.'; msgEl.className='message show error'; return; }
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(id));
  if (!v){ msgEl.textContent='Veículo não encontrado.'; msgEl.className='message show error'; return; }

  const { itens, qtdAtencao, qtdCritico } = _lerChecklistSelecionado();
  const cor = calcularTagChecklist(qtdAtencao, qtdCritico);
  const hoje = _hojeISO();
  const validoAte = _addUmMes(hoje);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';

  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const ins = await supabase.from('checklists_veiculo').insert({
      veiculo_id: parseInt(id), placa: v.placa, data_checklist: hoje, valido_ate: validoAte,
      status_geral: cor, qtd_atencao: qtdAtencao, qtd_critico: qtdCritico,
      itens: itens, realizado_por: usuario
    });
    if (ins.error) throw ins.error;

    const upd = await supabase.from('veiculos').update({
      status_integridade: cor, checklist_ultimo: hoje, checklist_valido_ate: validoAte
    }).eq('id', parseInt(id));
    if (upd.error) throw upd.error;

    v.status_integridade = cor; v.checklist_ultimo = hoje; v.checklist_valido_ate = validoAte;

    const m = _TAG_META[cor];
    msgEl.textContent = 'Checklist salvo. Status do veículo: '+m.emoji+' '+m.label+'. Válido até '+_fmtDataChk(validoAte)+'.';
    msgEl.className = 'message show success';
    aoTrocarVeiculoChecklist();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao salvar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

async function carregarHistoricoChecklist(veiculoId){
  const cont = document.getElementById('checklistHistorico');
  if (!cont) return;
  if (!veiculoId){ cont.innerHTML = '<p class="text-muted">Selecione um veículo.</p>'; return; }
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    const { data, error } = await supabase.from('checklists_veiculo')
      .select('*').eq('veiculo_id', parseInt(veiculoId))
      .order('data_checklist', { ascending: false }).limit(12);
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum checklist registrado ainda.</p>'; return; }
    cont.innerHTML = data.map(c => {
      const m = _TAG_META[c.status_geral] || _TAG_META.verde;
      return '<div class="checklist-hist-linha">'
        + '<span class="tag-integridade tag-'+c.status_geral+'">'+m.emoji+' '+m.label+'</span>'
        + '<span>'+_fmtDataChk(c.data_checklist)+'</span>'
        + '<span class="text-muted">'+(c.qtd_atencao||0)+' atenção · '+(c.qtd_critico||0)+' crítico</span>'
        + '<span class="text-muted">por '+(c.realizado_por||'—')+'</span>'
        + '<span class="text-muted">válido até '+_fmtDataChk(c.valido_ate)+'</span>'
        + '</div>';
    }).join('');
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro ao carregar histórico: '+(e.message||e)+'</p>';
  }
}

// ============================================================
// LOTE 3 — EPIs: avaliação (13.3), alerta p/ Compras (13.4) e
// autosserviço do motorista (13.5)
// ============================================================
const EPI_ITENS = ['Uniforme','Colete Refletivo','Talabarte','Capacete','Protetor Solar','Botina de Segurança'];
const _EPI_OPCOES = [
  { val:'OK',         label:'OK',                 cls:'opt-ok' },
  { val:'Reposicao',  label:'Necessita Reposição',cls:'opt-at' },
  { val:'Inadequado', label:'Inadequado',         cls:'opt-cr' }
];

// ---- 13.3 Avaliação de EPIs (perfil Manutenção) ----
function renderEPIForm(){
  const cont = document.getElementById('epiForm');
  if (!cont) return;
  cont.innerHTML = EPI_ITENS.map((item, i) => `
    <div class="checklist-linha">
      <span class="checklist-item-nome">${item}</span>
      <div class="epi-linha-dir">
        <input type="text" class="epi-tamanho" id="epi_tam_${i}" placeholder="Tamanho / especificação">
        <div class="checklist-opcoes">
          ${_EPI_OPCOES.map(o => `
            <label class="opt ${o.cls}"><input type="radio" name="epi_${i}" value="${o.val}" ${o.val==='OK'?'checked':''}> ${o.label}</label>
          `).join('')}
        </div>
      </div>
    </div>`).join('');
}

// popula o select de motorista (default: motorista padrão do veículo do checklist)
function _preencherMotoristasEPI(){
  const sel = document.getElementById('epiMotorista');
  if (!sel) return;
  const lista = motoristasGlobais || [];
  sel.innerHTML = '<option value="">Selecione o motorista...</option>' +
    lista.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
  // tenta casar com o motorista padrão do veículo selecionado no checklist
  const vSel = document.getElementById('checklistVeiculo')?.value;
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(vSel));
  if (v?.motorista_padrao){
    const m = lista.find(x => (x.nome||'').trim() === (v.motorista_padrao||'').trim());
    if (m) sel.value = m.id;
  }
}

async function salvarAvaliacaoEPI(){
  const msgEl = document.getElementById('mensagemEPI');
  const sel = document.getElementById('epiMotorista');
  const motoristaId = sel?.value;
  if (!motoristaId){ msgEl.textContent='Selecione o motorista.'; msgEl.className='message show error'; return; }
  const motorista = (motoristasGlobais||[]).find(m => String(m.id) === String(motoristaId));
  const urgencia = document.getElementById('epiUrgencia')?.value || 'normal';
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';

  // Coleta itens que precisam de ação: Necessita Reposição OU Inadequado
  const solicitacoes = [];
  EPI_ITENS.forEach((item, i) => {
    const val = document.querySelector(`input[name="epi_${i}"]:checked`)?.value || 'OK';
    if (val === 'OK') return;
    const tamanho = document.getElementById(`epi_tam_${i}`)?.value.trim() || null;
    solicitacoes.push({
      motorista_id: parseInt(motoristaId),
      motorista_nome: motorista?.nome || null,
      item: item + (val === 'Inadequado' ? ' (inadequado)' : ''),
      tamanho,
      urgencia: val === 'Inadequado' ? 'alta' : urgencia, // inadequado = segurança => alta
      origem: 'checklist',
      status: 'pendente',
      solicitado_por: usuario
    });
  });

  if (solicitacoes.length === 0){
    msgEl.textContent='Nenhum item marcado para reposição/inadequado — nada a solicitar.';
    msgEl.className='message show';
    return;
  }

  msgEl.textContent='Enviando...'; msgEl.className='message show';
  try {
    const { error } = await supabase.from('solicitacoes_epi').insert(solicitacoes);
    if (error) throw error;
    msgEl.textContent = `${solicitacoes.length} solicitação(ões) enviada(s) ao Financeiro/Compras.`;
    msgEl.className = 'message show success';
    renderEPIForm();
  } catch(e){
    msgEl.textContent = 'Erro ao enviar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

// ---- 13.4 Fila do Financeiro / Compras ----
async function renderizarSolicitacoesEPI(){
  const cont = document.getElementById('listaSolicitacoesEPI');
  if (!cont) return;
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    const { data, error } = await supabase.from('solicitacoes_epi')
      .select('*').eq('status','pendente')
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhuma solicitação pendente. 👍</p>'; return; }
    cont.innerHTML = `
      <table class="tabela-epi">
        <thead><tr><th>Motorista</th><th>Item</th><th>Tam./Espec.</th><th>Urgência</th><th>Origem</th><th>Ações</th></tr></thead>
        <tbody>
          ${data.map(s => `
            <tr>
              <td>${s.motorista_nome || '—'}</td>
              <td>${s.item}</td>
              <td>${s.tamanho || '—'}</td>
              <td>${s.urgencia === 'alta' ? '<span class="epi-urg-alta">🔴 Alta</span>' : 'Normal'}</td>
              <td>${s.origem === 'autosservico' ? '📱 Motorista' : '🔧 Checklist'}</td>
              <td class="epi-acoes">
                <button class="btn btn-sm btn-primary" onclick="atenderSolicitacaoEPI(${s.id})">✓ Atender</button>
                <button class="btn btn-sm btn-secondary" onclick="recusarSolicitacaoEPI(${s.id})">✕ Recusar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro ao carregar: '+(e.message||e)+'</p>';
  }
}

async function _atualizarStatusEPI(id, status){
  try {
    const patch = { status };
    if (status === 'atendida') patch.atendida_em = new Date().toISOString();
    const { error } = await supabase.from('solicitacoes_epi').update(patch).eq('id', id);
    if (error) throw error;
    renderizarSolicitacoesEPI();
  } catch(e){
    alert('Erro ao atualizar solicitação: ' + (e.message || e));
  }
}
function atenderSolicitacaoEPI(id){ if (confirm('Marcar como atendida (compra/reembolso/liberação feita)?')) _atualizarStatusEPI(id, 'atendida'); }
function recusarSolicitacaoEPI(id){ if (confirm('Recusar esta solicitação?')) _atualizarStatusEPI(id, 'recusada'); }

// ---- 13.5 Autosserviço do motorista ----
function abrirSolicitacaoEPI(){
  const card = document.getElementById('cardSolicitacaoEPI');
  if (!card) return;
  card.style.display = '';
  const selItem = document.getElementById('epiMotItem');
  if (selItem && !selItem.options.length){
    selItem.innerHTML = EPI_ITENS.map(i => `<option value="${i}">${i}</option>`).join('');
  }
  carregarMinhasEPI();
  card.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _motoristaLogadoInfo(){
  if (typeof nomesDoMotoristaLogado === 'function'){
    const { motoristaVinculado } = nomesDoMotoristaLogado();
    if (motoristaVinculado) return { id: motoristaVinculado.id, nome: motoristaVinculado.nome };
  }
  const nome = document.getElementById('usuarioLogado')?.textContent || 'Motorista';
  return { id: null, nome };
}

async function enviarSolicitacaoEPIMotorista(){
  const msgEl = document.getElementById('mensagemEPIMotorista');
  const item = document.getElementById('epiMotItem')?.value;
  const tamanho = document.getElementById('epiMotTamanho')?.value.trim() || null;
  const urgencia = document.getElementById('epiMotUrgencia')?.value || 'normal';
  if (!item){ msgEl.textContent='Selecione o item.'; msgEl.className='message show error'; return; }
  const mot = _motoristaLogadoInfo();

  msgEl.textContent='Enviando...'; msgEl.className='message show';
  try {
    const { error } = await supabase.from('solicitacoes_epi').insert({
      motorista_id: mot.id ? parseInt(mot.id) : null,
      motorista_nome: mot.nome,
      item, tamanho, urgencia,
      origem: 'autosservico', status: 'pendente',
      solicitado_por: mot.nome
    });
    if (error) throw error;
    msgEl.textContent = 'Solicitação enviada ao Financeiro/Compras. 👍';
    msgEl.className = 'message show success';
    document.getElementById('epiMotTamanho').value = '';
    carregarMinhasEPI();
  } catch(e){
    msgEl.textContent = 'Erro ao enviar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

async function carregarMinhasEPI(){
  const cont = document.getElementById('listaMinhasEPI');
  if (!cont) return;
  const mot = _motoristaLogadoInfo();
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    let q = supabase.from('solicitacoes_epi').select('*').order('created_at', { ascending:false }).limit(20);
    q = mot.id ? q.eq('motorista_id', parseInt(mot.id)) : q.eq('motorista_nome', mot.nome);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Você ainda não fez solicitações.</p>'; return; }
    const rot = { pendente:'⏳ Pendente', atendida:'✅ Atendida', recusada:'✕ Recusada' };
    cont.innerHTML = data.map(s => `
      <div class="checklist-hist-linha">
        <span>${s.item}</span>
        <span class="text-muted">${s.tamanho || ''}</span>
        <span class="text-muted">${rot[s.status] || s.status}</span>
        <span class="text-muted">${new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
      </div>`).join('');
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro: '+(e.message||e)+'</p>';
  }
}

// ============================================================
// LOTE 4 — AGENDAMENTO DE MANUTENÇÃO + BLOQUEIO NA LOGÍSTICA
// (item 13.6) + regra do 🔴 impedir alocação (13.7) + gancho item 15
// ============================================================

// Decisão CENTRAL de bloqueio de alocação de um veículo.
// Fontes: integridade (checklist 🔴), manutenção via folgas (legado),
// agendamento de manutenção, e (Lote futuro) parada de emergência (item 15).
function statusManutencaoVeiculo(v){
  // 1) Impedido por integridade do checklist (🔴)
  if (typeof statusIntegridadeEfetivo === 'function'){
    const ef = statusIntegridadeEfetivo(v);
    if (ef.cor === 'vermelho' && v.propriedade !== 'terceiro')
      return { bloqueado:true, cor:'vermelho', selo:'🔴 Impedido — '+ef.motivo, motivo:'Impedido — '+ef.motivo };
  }
  // 2) Manutenção via folgas (mecanismo legado já existente)
  const mf = (typeof manutencaoAtivaDoVeiculo === 'function') ? manutencaoAtivaDoVeiculo(v.placa) : null;
  if (mf)
    return { bloqueado:true, cor:'vermelho', selo:'🔧 Em manutenção'+(mf.descricao?' — '+mf.descricao:''), motivo:'Em manutenção' };
  // 3) Agendamento de manutenção
  const ag = (agendamentosManutencaoGlobais||[]).find(a => a.placa === v.placa && a.status !== 'concluido');
  if (ag){
    const dt = new Date(ag.data_hora), agora = new Date();
    const fmt = dt.toLocaleDateString('pt-BR');
    if (dt <= agora)
      return { bloqueado:true, cor:'vermelho', selo:'🔧 Bloqueado — manutenção agendada ('+fmt+')', motivo:'Manutenção agendada / na base', agendamento:ag };
    return { bloqueado:false, cor:'amarelo', selo:'🟡 Manutenção prevista '+fmt, motivo:'Manutenção prevista', agendamento:ag };
  }
  // 4) [item 15] Parada de emergência: ALERTA, nunca bloqueia (decisão fica fora do sistema)
  const emg = (paradasEmergenciaGlobais||[]).find(e => e.placa === v.placa && e.status === 'ativa');
  if (emg)
    return { bloqueado:false, cor:'vermelho', selo:'🚨 Parada de emergência'+(emg.motivo?' — '+emg.motivo:''), motivo:'Parada de emergência (alerta)', emergencia:emg };
  return { bloqueado:false, cor:null, selo:null, motivo:'' };
}

// ---- Cadastro de agendamento (perfil Manutenção) ----
function _preencherVeiculosAgendamento(){
  const sel = document.getElementById('agVeiculo');
  if (!sel) return;
  const atual = sel.value;
  const lista = (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    lista.map(v => `<option value="${v.placa}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
}

async function salvarAgendamentoManutencao(){
  const msgEl = document.getElementById('mensagemAgendamento');
  const placa = document.getElementById('agVeiculo')?.value;
  const dataHora = document.getElementById('agDataHora')?.value;
  const prazo = document.getElementById('agPrazo')?.value.trim() || null;
  const obs = document.getElementById('agObs')?.value.trim() || null;
  if (!placa){ msgEl.textContent='Selecione o veículo.'; msgEl.className='message show error'; return; }
  if (!dataHora){ msgEl.textContent='Informe a data/hora da manutenção.'; msgEl.className='message show error'; return; }

  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';
  msgEl.textContent='Agendando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('agendamentos_manutencao').insert({
      veiculo_id: v?.id || null, placa, data_hora: new Date(dataHora).toISOString(),
      prazo_estimado: prazo, observacao: obs, status: 'agendado', criado_por: usuario
    }).select();
    if (error) throw error;
    if (data && data[0]) agendamentosManutencaoGlobais.push(data[0]);
    msgEl.textContent = 'Manutenção agendada. A Logística verá o bloqueio/aviso na alocação.';
    msgEl.className = 'message show success';
    document.getElementById('agDataHora').value = '';
    document.getElementById('agPrazo').value = '';
    document.getElementById('agObs').value = '';
    listarAgendamentos();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao agendar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

function listarAgendamentos(){
  const cont = document.getElementById('listaAgendamentos');
  if (!cont) return;
  const ativos = (agendamentosManutencaoGlobais||[]).filter(a => a.status !== 'concluido')
    .sort((a,b) => new Date(a.data_hora) - new Date(b.data_hora));
  if (ativos.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum agendamento ativo.</p>'; return; }
  const agora = new Date();
  cont.innerHTML = ativos.map(a => {
    const dt = new Date(a.data_hora);
    const venceu = dt <= agora;
    const tag = venceu ? '<span class="tag-integridade tag-vermelho">🔧 Na base/bloqueado</span>'
                       : '<span class="tag-integridade tag-amarelo">🟡 Prevista</span>';
    return `<div class="checklist-hist-linha">
      ${tag}
      <span><strong>${a.placa}</strong></span>
      <span>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
      <span class="text-muted">${a.prazo_estimado || ''}</span>
      <span class="text-muted">${a.observacao || ''}</span>
      <button class="btn btn-sm btn-secondary" onclick="concluirAgendamento(${a.id})">✓ Concluir</button>
    </div>`;
  }).join('');
}

async function concluirAgendamento(id){
  if (!confirm('Concluir esta manutenção? O veículo volta a ficar disponível para a Logística.')) return;
  try {
    const { error } = await supabase.from('agendamentos_manutencao')
      .update({ status:'concluido' }).eq('id', id);
    if (error) throw error;
    const a = (agendamentosManutencaoGlobais||[]).find(x => x.id === id);
    if (a) a.status = 'concluido';
    listarAgendamentos();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    alert('Erro ao concluir: ' + (e.message || e));
  }
}

// ============================================================
// LOTE 5 — PARADA DE EMERGÊNCIA (item 15)
// Só registro/alerta. Não cancela, não aloca, não desaloca.
// Criação: exclusiva do Gestor de Manutenção (perfil manutencao/admin).
// Conclusão: Manutenção OU Logística.
// ============================================================
function _ehGestorManutencao(){
  const p = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  return p === 'manutencao' || p === 'admin';
}
function _podeConcluirEmergencia(){
  const p = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  return ['manutencao','logistica','admin'].includes(p);
}

function _preencherVeiculosEmergencia(){
  const sel = document.getElementById('emgVeiculo');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    (veiculosGlobais||[]).map(v => `<option value="${v.placa}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
}

async function salvarParadaEmergencia(){
  const msgEl = document.getElementById('mensagemEmergencia');
  if (!_ehGestorManutencao()){
    msgEl.textContent = 'Apenas o Gestor de Manutenção pode registrar uma parada de emergência.';
    msgEl.className = 'message show error'; return;
  }
  const placa = document.getElementById('emgVeiculo')?.value;
  const motivo = document.getElementById('emgMotivo')?.value.trim();
  const previsaoRaw = document.getElementById('emgPrevisao')?.value;
  if (!placa){ msgEl.textContent='Selecione o veículo.'; msgEl.className='message show error'; return; }
  if (!motivo){ msgEl.textContent='Descreva o motivo/defeito.'; msgEl.className='message show error'; return; }

  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';
  msgEl.textContent='Registrando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('paradas_emergencia').insert({
      veiculo_id: v?.id || null, placa, motivo,
      previsao_retorno: previsaoRaw ? new Date(previsaoRaw).toISOString() : null,
      status: 'ativa', criado_por: usuario
    }).select();
    if (error) throw error;
    if (data && data[0]) paradasEmergenciaGlobais.unshift(data[0]);
    msgEl.textContent = 'Emergência registrada. A Logística já vê o alerta (nenhuma alocação foi alterada).';
    msgEl.className = 'message show success';
    document.getElementById('emgMotivo').value = '';
    document.getElementById('emgPrevisao').value = '';
    renderizarParadasEmergencia();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao registrar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

function _linhaEmergenciaHTML(e, comConcluir){
  const dt = e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '';
  const prev = e.previsao_retorno ? ' · retorno prev.: ' + new Date(e.previsao_retorno).toLocaleString('pt-BR') : '';
  const btn = comConcluir && _podeConcluirEmergencia()
    ? `<button class="btn btn-sm btn-secondary" onclick="concluirEmergencia(${e.id})">✓ Concluir</button>` : '';
  return `<div class="emergencia-linha">
    <span class="emergencia-badge">🚨 ${e.placa}</span>
    <span>${e.motivo || ''}</span>
    <span class="text-muted">${dt}${prev}</span>
    ${btn}
  </div>`;
}

function renderizarParadasEmergencia(){
  const ativas = (paradasEmergenciaGlobais||[]).filter(e => e.status === 'ativa');

  // Painel na aba Manutenção
  const contManut = document.getElementById('listaEmergenciasManut');
  if (contManut){
    contManut.innerHTML = ativas.length === 0
      ? '<p class="text-muted">Nenhuma emergência ativa.</p>'
      : ativas.map(e => _linhaEmergenciaHTML(e, true)).join('');
  }

  // Banner na aba Logística (só aparece se houver emergência)
  const wrapLog = document.getElementById('emergenciasLogWrap');
  if (wrapLog){
    wrapLog.innerHTML = ativas.length === 0 ? '' :
      `<div class="emergencia-banner">
        <div class="emergencia-banner-titulo">🚨 Paradas de emergência ativas (${ativas.length}) — decida a carga com a Manutenção</div>
        ${ativas.map(e => _linhaEmergenciaHTML(e, true)).join('')}
      </div>`;
  }
}

async function concluirEmergencia(id){
  if (!_podeConcluirEmergencia()){ alert('Sem permissão para concluir.'); return; }
  if (!confirm('Marcar esta emergência como concluída?')) return;
  const perfil = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
  try {
    const { error } = await supabase.from('paradas_emergencia').update({
      status:'concluida', concluida_por: usuario, concluida_perfil: perfil,
      concluida_em: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    const e = (paradasEmergenciaGlobais||[]).find(x => x.id === id);
    if (e) e.status = 'concluida';
    renderizarParadasEmergencia();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(err){
    alert('Erro ao concluir: ' + (err.message || err));
  }
}

// ============================================================
// LOTE 6 — INDICADORES DE MANUTENÇÃO NO DASHBOARD (item 14)
// Veículos % e EPIs %, só frota própria. Alerta 🔴 por pendência crítica.
// ============================================================
function _conformidadeSeguranca(){
  // ----- Veículos (frota própria): checklist em dia = 🟢 efetivo -----
  const frota = (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
  const totalVeic = frota.length;
  let verdes = 0, criticos = 0;
  frota.forEach(v => {
    const cor = (typeof statusIntegridadeEfetivo === 'function') ? statusIntegridadeEfetivo(v).cor : 'verde';
    if (cor === 'verde') verdes++;
    // pendência CRÍTICA = checklist vermelho (crítico/6+ atenção), não apenas vencido
    if (v.status_integridade === 'vermelho') criticos++;
  });
  const veiculosPctNum = totalVeic > 0 ? Math.round((verdes / totalVeic) * 100) : null;

  // ----- EPIs (motoristas): em dia = sem solicitação pendente -----
  const totalMot = (motoristasGlobais||[]).length;
  const pendSet = new Set();
  (episPendentesGlobais||[]).forEach(e => pendSet.add(e.motorista_id != null ? 'id:'+e.motorista_id : 'nome:'+(e.motorista_nome||'')));
  const motComPend = pendSet.size;
  const motEmDia = Math.max(0, totalMot - motComPend);
  const episPctNum = totalMot > 0 ? Math.round((motEmDia / totalMot) * 100) : null;

  const _cor = (pct) => pct === null ? '#9ca3af' : pct >= 90 ? '#4ade80' : pct >= 70 ? '#fbbf24' : '#ef4444';

  return {
    totalVeic, totalMot, criticos,
    veiculosPct: veiculosPctNum === null ? '—' : veiculosPctNum + '%',
    episPct:     episPctNum === null ? '—' : episPctNum + '%',
    corVeic: criticos > 0 ? '#ef4444' : _cor(veiculosPctNum),
    corEpi:  _cor(episPctNum)
  };
}

// ============================================================
// LOTE 7 — ITEM 6: nomenclatura por capacidade + exceção de teto
// 1 a 9 => "Múltiplos Veículos"; 10..capacidade => "Carga Fechada".
// Teto padrão 11; acima disso exige exceção no cadastro do veículo.
// ============================================================
// Nomenclatura por capacidade:
// "Carga Fechada" SOMENTE quando fecha a capacidade cheia da cegonha (padrão 11).
// Qualquer quantidade abaixo disso => "Múltiplos Veículos".
function nomenclaturaCarga(qtd, capacidade){
  const cap = Number(capacidade) || 11; // capacidade cheia padrão
  if (qtd >= cap) return 'Carga Fechada';
  return 'Múltiplos Veículos';
}

// Ajusta o teto do input de capacidade conforme a exceção (cadastro novo)
function ajustarTetoCapacidade(){
  const chk = document.getElementById('capacidadeExcecao');
  const cap = document.getElementById('capacidadeCegonha');
  if (!cap) return;
  cap.max = (chk && chk.checked) ? 12 : 11;
  if (!(chk && chk.checked) && parseInt(cap.value,10) > 11) cap.value = 11;
}

// ============================================================
// LOTE 8 — ITEM 1: RESERVA COM TIMER GLOBAL + TIPO DE ENTREGA
// ============================================================
function toggleModoReserva(){
  const on = document.getElementById('pedidoReserva')?.checked;
  const wrap = document.getElementById('reservaVagasWrap');
  if (wrap) wrap.style.display = on ? '' : 'none';
  // Em modo reserva, placa/modelo deixam de ser obrigatórios
  ['placa','modelo'].forEach(id => {
    const el = document.getElementById(id);
    if (el){ if (on) el.removeAttribute('required'); else el.setAttribute('required',''); }
  });
}

async function salvarReservaComercial(){
  const cliente = document.getElementById('cliente').value;
  const clienteId = document.getElementById('clienteId')?.value || null;
  const dataSolicitacao = document.getElementById('dataSolicitacao').value;
  const cidadeOrigem = document.getElementById('cidadeOrigem').value;
  const ufOrigem = document.getElementById('ufOrigem').value;
  const cidadeDestino = document.getElementById('cidadeDestino').value;
  const ufDestino = document.getElementById('ufDestino').value;
  const responsavel = _getResponsavelComercial();
  const vagas = parseInt(document.getElementById('reservaVagas')?.value,10) || 1;
  const tipoEntrega = document.getElementById('tipoEntregaPedido')?.value || 'patio';

  if (!cliente || !dataSolicitacao || !cidadeOrigem || !ufOrigem || !cidadeDestino || !ufDestino || !responsavel){
    exibirMensagem('mensagemComercial', 'Reserva precisa de: cliente, data, origem, destino e responsável.', 'error');
    return;
  }

  const expira = new Date(Date.now() + paramReservaTimerMin * 60000).toISOString();
  const grupoId = (typeof gerarGrupoId === 'function' && vagas > 1) ? gerarGrupoId() : null;
  const base = {
    cliente, cliente_id: clienteId ? parseInt(clienteId) : null,
    data_solicitacao: dataSolicitacao,
    modelo: 'A definir', placa: null,
    cidade_origem: cidadeOrigem, uf_origem: ufOrigem,
    cidade_destino: cidadeDestino, uf_destino: ufDestino,
    responsavel_comercial: responsavel,
    tipo_entrega: tipoEntrega,
    origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
    criado_por_nome: (document.getElementById('usuarioLogado')?.textContent || null),
    status: 'Pendente',
    is_reserva: true, reserva_status: 'ativa', reserva_expira_em: expira
  };
  const linhas = Array.from({length: vagas}, () => grupoId ? { ...base, grupo_id: grupoId } : { ...base });

  try {
    const { error } = await supabase.from('pedidos').insert(linhas);
    if (error) throw error;
    if (typeof notificar === 'function') notificar({
      perfil:'comercial', tipo:'acao',
      titulo:`🕒 Nova reserva: ${vagas} vaga(s)`,
      mensagem:`${cliente} · ${cidadeOrigem}/${ufOrigem} → ${cidadeDestino}/${ufDestino} · expira em ${paramReservaTimerMin} min`
    });
    await recarregarPedidos();
    exibirMensagem('mensagemComercial', `✅ Reserva de ${vagas} vaga(s) criada. Confirme antes de expirar (${paramReservaTimerMin} min).`, 'success');
    document.getElementById('formComercial').reset();
    toggleModoReserva();
    renderizarReservasAtivas();
  } catch(e){
    console.error('Erro ao criar reserva:', e, '| details:', e.details, '| hint:', e.hint, '| code:', e.code);
    exibirMensagem('mensagemComercial', 'Erro ao criar reserva: ' + (e.message||'') + (e.details?(' — '+e.details):''), 'error');
  }
}

function _reservasAtivas(){
  return (pedidosGlobais||[]).filter(p => p.isReserva && p.reservaStatus === 'ativa');
}

function _fmtRestante(ms){
  if (ms <= 0) return 'expirada';
  const min = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
  return `${min}m ${String(s).padStart(2,'0')}s`;
}

function renderizarReservasAtivas(){
  const wrap = document.getElementById('reservasAtivasWrap');
  if (!wrap) return;
  const ativas = _reservasAtivas();
  if (ativas.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  const agora = Date.now();
  // agrupa por grupo_id (ou id isolado)
  const grupos = {};
  ativas.forEach(p => { const k = p.grupoId || ('p'+p.id); (grupos[k] = grupos[k] || []).push(p); });
  wrap.innerHTML = `<div class="reservas-box">
    <div class="reservas-titulo">🕒 Reservas aguardando confirmação (${ativas.length} vaga(s))</div>
    ${Object.entries(grupos).map(([k, itens]) => {
      const p = itens[0];
      const exp = p.reservaExpiraEm ? new Date(p.reservaExpiraEm).getTime() : agora;
      const restante = exp - agora;
      const critico = restante < 30*60000;
      return `<div class="reserva-linha ${critico?'reserva-critica':''}">
        <span class="reserva-rota">${p.cliente} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span class="reserva-vagas">${itens.length} vaga(s)</span>
        <span class="reserva-timer" data-exp="${exp}">${_fmtRestante(restante)}</span>
        <button class="btn btn-sm btn-primary" onclick="confirmarReserva('${k}')">✓ Confirmar</button>
        <button class="btn btn-sm btn-secondary" onclick="cancelarReserva('${k}')">✕ Cancelar</button>
      </div>`;
    }).join('')}
  </div>`;
}

function _idsDoGrupoReserva(chave){
  if (chave.startsWith('p')) { const id = parseInt(chave.slice(1),10); return _reservasAtivas().filter(p=>p.id===id).map(p=>p.id); }
  return _reservasAtivas().filter(p => p.grupoId === chave).map(p => p.id);
}

async function confirmarReserva(chave){
  const ids = _idsDoGrupoReserva(chave);
  if (ids.length === 0) return;
  try {
    const { error } = await supabase.from('pedidos')
      .update({ is_reserva:false, reserva_status:'confirmada' }).in('id', ids);
    if (error) throw error;
    ids.forEach(id => { const p=(pedidosGlobais||[]).find(x=>x.id===id); if(p){p.isReserva=false;p.reservaStatus='confirmada';} });
    exibirMensagem('mensagemComercial', '✅ Reserva confirmada. Complete os veículos pela edição do pedido.', 'success');
    renderizarReservasAtivas();
  } catch(e){ alert('Erro ao confirmar: '+(e.message||e)); }
}

async function cancelarReserva(chave, automatico){
  const ids = _idsDoGrupoReserva(chave);
  if (ids.length === 0) return;
  if (!automatico && !confirm('Cancelar esta reserva?')) return;
  try {
    const { error } = await supabase.from('pedidos')
      .update({ is_reserva:false, reserva_status:'cancelada', status:'Cancelado' }).in('id', ids);
    if (error) throw error;
    ids.forEach(id => { const p=(pedidosGlobais||[]).find(x=>x.id===id); if(p){p.isReserva=false;p.reservaStatus='cancelada';p.status='Cancelado';} });
    if (automatico && typeof notificar === 'function') notificar({
      perfil:'comercial', tipo:'alerta', titulo:'⏱️ Reserva expirada e cancelada',
      mensagem:'Uma reserva não foi confirmada a tempo e foi cancelada automaticamente.'
    });
    renderizarReservasAtivas();
  } catch(e){ if(!automatico) alert('Erro ao cancelar: '+(e.message||e)); }
}

// Tick de 1s: atualiza contadores e auto-cancela expiradas
let _reservaTickIniciado = false;
function iniciarTickReservas(){
  if (_reservaTickIniciado) return;
  _reservaTickIniciado = true;
  setInterval(() => {
    const timers = document.querySelectorAll('.reserva-timer');
    const agora = Date.now();
    let expirou = false;
    timers.forEach(t => {
      const exp = parseInt(t.dataset.exp,10);
      const restante = exp - agora;
      t.textContent = _fmtRestante(restante);
      if (restante <= 0) expirou = true;
    });
    if (expirou){
      // auto-cancela as vencidas
      const grupos = {};
      _reservasAtivas().forEach(p => { const k=p.grupoId||('p'+p.id); (grupos[k]=grupos[k]||[]).push(p); });
      Object.entries(grupos).forEach(([k, itens]) => {
        const exp = itens[0].reservaExpiraEm ? new Date(itens[0].reservaExpiraEm).getTime() : agora;
        if (exp - agora <= 0) cancelarReserva(k, true);
      });
    }
  }, 1000);
}

// ============================================================
// LOTE 9 — ITEM 5: DESALOCAR / REVERTER ALOCAÇÃO (Logística)
// Remove a cegonha e devolve o pedido à fila, antes do fechamento.
// ============================================================
async function desalocarPedido(pedidoId){
  if (bloquearSeNaoLogistica('a reversão de alocação')) return;
  const pedido = (pedidosGlobais||[]).find(p => String(p.id) === String(pedidoId));
  if (!pedido){ return; }
  if (!['Intenção Agendada','Aguardando Confirmação'].includes(pedido.status)){
    alert('Só é possível desalocar antes do fechamento (status de coleta em diante não pode ser revertido por aqui).');
    return;
  }
  if (!confirm(`Desalocar o pedido #${pedido.id} da cegonha ${pedido.placaCegonha}?\n\nEle volta para a fila de alocação como "Pendente".`)) return;

  const reversao = {
    placa_cegonha: null, rota: null, rota_id: null,
    motorista_1: null, percent_motorista_1: null,
    motorista_2: null, percent_motorista_2: null,
    data_prev_coleta: null, data_prev_entrega: null,
    patio_atual: null, patio_desde: null,
    // corredor_manual_id PRESERVADO: se tinha 📌, volta pro mesmo corredor; senão, automático
    status: 'Pendente'
  };
  try {
    const { error } = await supabase.from('pedidos').update(reversao).eq('id', parseInt(pedidoId));
    if (error) throw error;
    // Limpa os trechos de transbordo, se houver
    try { await supabase.from('pedido_trechos').delete().eq('pedido_id', parseInt(pedidoId)); } catch(e){}
    // Registra no histórico, se a trilha existir
    try {
      const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId), status_novo: 'Pendente',
        usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `↩️ Alocação revertida (desalocado da cegonha) por ${usuario}`
      });
    } catch(e){}

    if (typeof fecharModal === 'function') fecharModal('modalStatus');
    await recarregarPedidos();
    if (typeof carregarLogistica === 'function') carregarLogistica();
    if (typeof exibirMensagem === 'function')
      exibirMensagem('mensagemLogistica', `↩️ Pedido #${pedidoId} desalocado e devolvido à fila.`, 'success');
  } catch(e){
    alert('Erro ao desalocar: ' + (e.message || e));
  }
}

// ============================================================
// LOTE 10 — ITEM 12 (parte 1): CADASTRO DE CORREDORES + SLA
// ============================================================
let corredoresGlobais = [];

async function carregarCorredores(){
  const cont = document.getElementById('listaCorredores');
  try {
    const { data: cors, error } = await supabase.from('corredores')
      .select('*').order('nome');
    if (error) throw error;
    corredoresGlobais = cors || [];
    // paradas de cada corredor
    const { data: paradas } = await supabase.from('corredor_paradas')
      .select('*').order('ordem');
    const porCor = {};
    (paradas||[]).forEach(p => { (porCor[p.corredor_id] = porCor[p.corredor_id] || []).push(p); });
    corredoresGlobais.forEach(c => { c._paradas = porCor[c.id] || []; });
    _renderCorredores();
  } catch(e){
    if (cont) cont.innerHTML = '<p class="message show error">Erro ao carregar corredores: '+(e.message||e)+'</p>';
  }
}

function _renderCorredores(){
  const cont = document.getElementById('listaCorredores');
  if (!cont) return;
  if (corredoresGlobais.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum corredor cadastrado ainda.</p>'; return; }
  cont.innerHTML = corredoresGlobais.map(c => {
    const seq = (c._paradas||[]).map(p => p.cidade).join(' → ') || `${c.origem} → ${c.destino}`;
    return `<div class="corredor-linha">
      <div class="corredor-info">
        <strong>${c.nome}</strong>
        <span class="text-muted">${c.origem} → ${c.destino} · SLA ${c.sla_horas}h</span>
        <span class="corredor-seq">🛣️ ${seq}</span>
      </div>
      <div class="corredor-acoes">
        <button class="btn btn-sm btn-secondary" onclick="_editarNomeCorredor(${c.id})">✏️ Nome</button>
        <button class="btn btn-sm btn-secondary" onclick="excluirCorredor(${c.id})">🗑️ Excluir</button>
      </div>
    </div>`;
  }).join('');
}

// Editar o nome de um corredor (caso tenha digitado errado)
async function _editarNomeCorredor(id){
  const c = (corredoresGlobais||[]).find(x => String(x.id)===String(id));
  if (!c) return;
  const novo = prompt(`Editar o nome do corredor:`, c.nome || '');
  if (novo === null) return;
  const nome = novo.trim();
  if (!nome){ alert('O nome não pode ficar vazio.'); return; }
  try {
    await supabase.from('corredores').update({ nome }).eq('id', id);
    c.nome = nome;
    _renderCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCorredor', `✅ Nome do corredor atualizado para "${nome}".`, 'success');
  } catch(e){ alert('Erro ao editar: '+(e.message||e)); }
}

async function salvarCorredor(){
  const msgEl = document.getElementById('mensagemCorredor');
  const nome = document.getElementById('corNome')?.value.trim();
  const origem = document.getElementById('corOrigem')?.value.trim();
  const destino = document.getElementById('corDestino')?.value.trim();
  const sla = parseInt(document.getElementById('corSla')?.value,10);
  const paradasRaw = document.getElementById('corParadas')?.value.trim();
  if (!nome || !origem || !destino){ msgEl.textContent='Preencha nome, origem e destino.'; msgEl.className='message show error'; return; }
  if (!sla || sla < 1){ msgEl.textContent='Informe um SLA válido (horas).'; msgEl.className='message show error'; return; }

  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('corredores').insert({
      nome, origem, destino, sla_horas: sla, ativo: true
    }).select();
    if (error) throw error;
    const cor = data && data[0];
    // paradas: usa a lista informada; se vazia, usa origem+destino
    let cidades = paradasRaw ? paradasRaw.split(',').map(s => s.trim()).filter(Boolean) : [origem, destino];
    if (cor && cidades.length){
      const linhas = cidades.map((cidade, i) => ({ corredor_id: cor.id, ordem: i+1, cidade }));
      await supabase.from('corredor_paradas').insert(linhas);
    }
    msgEl.textContent = 'Corredor salvo.';
    msgEl.className = 'message show success';
    ['corNome','corOrigem','corDestino','corParadas'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('corSla').value = 24;
    carregarCorredores();
  } catch(e){
    msgEl.textContent = 'Erro ao salvar: ' + (e.message||e);
    msgEl.className = 'message show error';
  }
}

async function excluirCorredor(id){
  if (!confirm('Excluir este corredor? As paradas associadas também serão removidas.')) return;
  try {
    await supabase.from('corredor_paradas').delete().eq('corredor_id', id);
    const { error } = await supabase.from('corredores').delete().eq('id', id);
    if (error) throw error;
    corredoresGlobais = corredoresGlobais.filter(c => c.id !== id);
    _renderCorredores();
  } catch(e){ alert('Erro ao excluir: ' + (e.message||e)); }
}

// ============================================================
// LOTE 11 — ITEM 12 (parte 2): SUGESTÃO INTELIGENTE POR CORREDORES
// Cruza pedidos pendentes com corredores; agrupa por sequência de
// paradas e janela de datas; mostra ocupação p/ validação da Logística.
// ============================================================
const _CEGONHA_CAP_REF = 11;          // capacidade de referência p/ ocupação
const _JANELA_DIAS_SUG = 3;           // janela de datas para agrupar

function _norm(txt){
  return (txt||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// posição de uma cidade na sequência do corredor (-1 se não estiver)
function _posNaSeq(seq, cidade){
  // compara só a parte da cidade, ignorando "/UF" (ex.: "Curitiba/PR" = "Curitiba")
  const soCidade = v => _norm((v || '').toString().split('/')[0]);
  const alvo = soCidade(cidade);
  if (!alvo) return -1;
  return seq.findIndex(s => soCidade(s) === alvo);
}

function gerarSugestoesRota(){
  const wrap = document.getElementById('sugestoesRotaWrap');
  if (!wrap) return;
  // Sugestão é ferramenta da logística — nunca renderiza para outros perfis.
  if (typeof podeAlocarOuTransbordar === 'function' && !podeAlocarOuTransbordar()){ wrap.innerHTML = ''; return; }
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  if (corredores.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  // pedidos pendentes, não-reserva, sem cegonha
  const pendentes = (pedidosGlobais||[]).filter(p =>
    !p.isReserva && !p.placaCegonha && !(p.rotaId || p.rota_id) &&
    !['Entregue','Cancelado'].includes(p.status || 'Pendente'));
  if (pendentes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  const sugestoes = [];
  corredores.forEach(cor => {
    const seq = (cor._paradas||[]).length >= 2 ? cor._paradas.map(p=>p.cidade) : [cor.origem, cor.destino];
    // pedidos que "cabem" no corredor: parte do PÁTIO (se houver) ou da origem;
    // aceita origem→destino na ordem, ou encaixe no caminho (destino no trajeto).
    const fits = pendentes.filter(p => {
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = _posNaSeq(seq, partida);
      const id = _posNaSeq(seq, p.cidadeDestino);
      const noPatioDoTronco = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id)
          || (noPatioDoTronco && id === -1);
    });
    if (fits.length === 0) return;

    // agrupa por janela de datas (data_solicitacao)
    const ordenados = fits.slice().sort((a,b) => (a.dataSolicitacao||'').localeCompare(b.dataSolicitacao||''));
    let cluster = [];
    let inicio = null;
    const flush = () => {
      if (cluster.length){ sugestoes.push({ cor, seq, itens: cluster.slice() }); cluster = []; }
    };
    ordenados.forEach(p => {
      const d = p.dataSolicitacao ? new Date(p.dataSolicitacao+'T12:00') : null;
      if (!inicio || !d){ if (cluster.length===0) inicio = d; cluster.push(p); return; }
      const difDias = Math.abs((d - inicio)/86400000);
      if (difDias <= _JANELA_DIAS_SUG){ cluster.push(p); }
      else { flush(); inicio = d; cluster.push(p); }
    });
    flush();
  });

  if (sugestoes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  _sugestoesCache = sugestoes;

  wrap.innerHTML = `<div class="sugestoes-box">
    <div class="sugestoes-titulo sugestoes-toggle" onclick="_toggleSugestoes()" style="cursor:pointer;user-select:none">
      <span id="sugChevron">${_sugestoesAbertas?'▾':'▸'}</span> 🧭 Sugestões de rota por corredor (${sugestoes.length}) — para validação da Logística
    </div>
    <div id="sugestoesLista" style="display:${_sugestoesAbertas?'block':'none'}">
    ${sugestoes.map((s, idx) => {
      const ocup = Math.min(100, Math.round((s.itens.length / _CEGONHA_CAP_REF) * 100));
      const corPct = ocup >= 80 ? '#4ade80' : ocup >= 50 ? '#fbbf24' : '#fb923c';
      const datas = s.itens.map(p=>p.dataSolicitacao).filter(Boolean).sort();
      const janela = datas.length ? `${_fmtDataChk(datas[0])}${datas.length>1?' a '+_fmtDataChk(datas[datas.length-1]):''}` : '—';
      const paradasComPedido = s.seq.map(cidade => {
        const temColeta = s.itens.some(p => _norm(p.cidadeOrigem) === _norm(cidade));
        const temEntrega = s.itens.some(p => _norm(p.cidadeDestino) === _norm(cidade));
        const marca = temColeta && temEntrega ? '↕' : temColeta ? '↑' : temEntrega ? '↓' : '·';
        return `<span class="sug-parada ${marca!=='·'?'sug-parada-ativa':''}">${marca} ${cidade}</span>`;
      }).join('<span class="sug-seta">→</span>');
      return `<div class="sugestao-card">
        <div class="sugestao-cab">
          <strong>${s.cor.nome}</strong>
          <span class="text-muted">SLA ${s.cor.sla_horas}h · janela ${janela}</span>
          <span class="sug-ocup" style="color:${corPct}">${s.itens.length}/${_CEGONHA_CAP_REF} · ${ocup}% da cegonha</span>
        </div>
        <div class="sug-paradas">${paradasComPedido}</div>
        <div class="sug-pedidos">${s.itens.map(p =>
          `<span class="sug-pedido">#${p.id} ${p.cliente} (${p.cidadeOrigem}→${p.cidadeDestino})</span>`).join('')}</div>
        ${(typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar()) ? `<button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="criarRotaDaSugestao(${idx})">🛣️ Criar rota e alocar ${s.itens.length} carro(s)</button>` : ''}
      </div>`;
    }).join('')}
    </div>
  </div>`;
  _espelharSugPainel();
}

let _sugestoesAbertas = false;
function _toggleSugestoes(){
  _sugestoesAbertas = !_sugestoesAbertas;
  document.querySelectorAll('#sugestoesLista').forEach(el => el.style.display = _sugestoesAbertas ? 'block' : 'none');
  document.querySelectorAll('#sugChevron').forEach(el => el.textContent = _sugestoesAbertas ? '▾' : '▸');
}

// Espelha as sugestões de rota também no Painel de Acompanhamento
function _espelharSugPainel(){
  const a = document.getElementById('sugestoesRotaWrap');
  const b = document.getElementById('sugestoesRotaPainel');
  if (a && b) b.innerHTML = a.innerHTML;
}

// ============================================================
// LOTE 12 — ITEM 16: HORÁRIO PREVISTO + ETA AUTOMÁTICO
// ETA = saída real + SLA do corredor. Tags de entrega 🟢🟡🔴.
// ============================================================
const _ETA_ATENCAO_H = 3; // horas antes do ETA em que entra em "Atenção"

function statusETA(etaISO){
  if (!etaISO) return null;
  const eta = new Date(etaISO).getTime();
  const agora = Date.now();
  const restanteH = (eta - agora) / 3600000;
  if (restanteH < 0)  return { cor:'vermelho', emoji:'🔴', label:'Em Atraso',  txt:`atrasado ${Math.abs(Math.round(restanteH))}h` };
  if (restanteH <= _ETA_ATENCAO_H) return { cor:'amarelo', emoji:'🟡', label:'Atenção', txt:`restam ~${Math.max(0,Math.round(restanteH))}h` };
  return { cor:'verde', emoji:'🟢', label:'Na Janela', txt:`restam ~${Math.round(restanteH)}h` };
}

function etaRotaHTML(r){
  if (!r || !r.eta) return '';
  const s = statusETA(r.eta);
  if (!s) return '';
  const etaFmt = new Date(r.eta).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  return ` · <span class="tag-eta tag-${s.cor}" title="ETA ${etaFmt} · ${s.txt}">${s.emoji} ETA ${etaFmt}</span>`;
}

// ============================================================
// LOTE 14 — ITENS 7 e 8: CONFIRMAÇÃO DO COMERCIAL (aviso 4h) +
// FECHAMENTO POR STATUS VERDE (rota) + envio ao motorista
// ============================================================
const _CONFIRM_AVISO_H = 4; // aviso quando faltam <= 4h para a coleta

function _horasAteColeta(p){
  const dt = p.dataPrevColeta || p.data_prev_coleta;
  if (!dt) return null;
  return (new Date(dt).getTime() - Date.now()) / 3600000;
}

function renderizarConfirmacaoComercial(){
  const wrap = document.getElementById('confirmacaoComercialWrap');
  if (!wrap) return;
  wrap.innerHTML = ''; // fluxo de confirmação de intenção aposentado — status agora é livre
  if (typeof _espelharSugPainel === 'function') _espelharSugPainel();
  return;
}
function _renderizarConfirmacaoComercial_desativado(){
  const wrap = document.getElementById('confirmacaoComercialWrap');
  if (!wrap) return;
  const aguardando = (pedidosGlobais||[]).filter(p => p.status === 'Aguardando Confirmação' && p.origemLancamento !== 'logistica');
  if (aguardando.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  wrap.innerHTML = `<div class="confirmacao-box">
    <div class="confirmacao-titulo">✅ Intenções aguardando sua confirmação (${aguardando.length})</div>
    ${aguardando.map(p => {
      const h = _horasAteColeta(p);
      const urgente = h !== null && h <= _CONFIRM_AVISO_H;
      const aviso = h === null ? ''
        : urgente ? `<span class="confirma-urgente">${h < 0 ? '⏰ coleta vencida' : `🔴 faltam ${Math.max(0,Math.round(h))}h p/ coleta`}</span>`
        : `<span class="text-muted">coleta em ~${Math.round(h)}h</span>`;
      return `<div class="confirma-linha ${urgente?'confirma-linha-urgente':''}">
        <span class="confirma-rota">#${p.id} · ${p.cliente} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span>🚛 ${p.placaCegonha || 'A definir'}</span>
        ${aviso}
        <button class="btn btn-sm btn-primary" onclick="mudarStatusPlanilha(${p.id}, 'Enviado coleta')">✅ Confirmar (libera coleta)</button>
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Item 8: fechamento da rota quando tudo "verde" ----------
// "verde" = pedido já passou da confirmação (Em Coleta em diante).
function _pedidosDaRota(rotaId, placaCegonha){
  return (pedidosGlobais||[]).filter(p =>
    (String(p.rotaId) === String(rotaId)) ||
    (placaCegonha && p.placaCegonha === placaCegonha && !['Entregue','Cancelado'].includes(p.status))
  );
}
function _rotaStatusVerde(rotaId, placaCegonha){
  const ped = _pedidosDaRota(rotaId, placaCegonha).filter(p => p.status !== 'Cancelado');
  if (ped.length === 0) return { total:0, verdes:0, todosVerdes:false };
  const verdes = ped.filter(p => !['Pendente','Intenção Agendada','Aguardando Confirmação'].includes(p.status)).length;
  return { total: ped.length, verdes, todosVerdes: verdes === ped.length };
}
function fechamentoRotaHTML(r){
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (v.total === 0) return '';
  if (r.carga_fechada) return ` · <span class="tag-fechada">🔒 Carga fechada</span>`;
  if (v.todosVerdes && (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())){
    return ` · <span class="tag-verde-ok">✅ Tudo validado</span>`;
  }
  return ` · <span class="text-muted">${v.verdes}/${v.total} validado(s)</span>`;
}

async function fecharCargaRota(rotaId){
  if (bloquearSeNaoLogistica('o fechamento da carga')) return;
  const r = (rotasGlobais||[]).find(x => String(x.id) === String(rotaId));
  if (!r) return;
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (!v.todosVerdes){ alert('Ainda há pedidos não validados nesta rota.'); return; }
  if (!confirm(`Fechar a carga da rota "${r.nome || '#'+r.id}" e enviar ao motorista da cegonha ${r.placa_cegonha||'—'}?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('rotas_planejadas')
      .update({ carga_fechada:true, fechada_em:new Date().toISOString(), fechada_por:usuario })
      .eq('id', rotaId);
    if (error) throw error;
    r.carga_fechada = true;
    // envia ao motorista (notificação) — ele confere as placas no app
    try {
      if (r.placa_cegonha){
        const ped = _pedidosDaRota(r.id, r.placa_cegonha)[0];
        if (ped && typeof notificarMotoristaDoPedido === 'function'){
          await notificarMotoristaDoPedido(ped, {
            titulo: '🔒 Carga fechada — confira as placas',
            corpo: `Rota ${r.nome || '#'+r.id} liberada. Confira as placas dos veículos pelo app.`
          });
