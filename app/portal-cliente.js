/* ============================================================================
   MOVEMASTER — portal-cliente.js
   Perfil CLIENTE: a concessionária / locadora / empresa cria a própria conta,
   solicita transportes, acompanha os pedidos e cancela quando ainda dá.

   Segurança (ver sql/2026-09-26-melhorias.sql):
   - O cliente NÃO lê tabela nenhuma direto: uma política RESTRITIVA de RLS
     bloqueia o perfil cliente em todas as tabelas. Tudo passa por 3 funções
     do banco que só devolvem/alteram os pedidos DO PRÓPRIO cliente e só com
     colunas públicas (sem valores internos, motoristas, custos etc.):
       mm_cliente_meus_pedidos · mm_cliente_solicitar · mm_cliente_cancelar
   - A solicitação entra como "aguardando aprovação" com o nome de quem pediu
     ("Cliente: Fulano (Empresa)") e aparece no Planejamento da logística.
   ============================================================================ */
(function () {
  'use strict';

  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  const TIPOS = { concessionaria: 'Concessionária', locadora: 'Locadora', empresa: 'Empresa', garagista: 'Garagista', particular: 'Particular' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const optsUF = sel => '<option value="">UF</option>' + UFS.map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${u}</option>`).join('');
  const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  let _pcPedidos = [];
  let _pcFiltro = 'ativos';
  let _pcCarros = [{ placa: '', modelo: '' }];

  // ------------------------------------------------------------------------
  // CADASTRO PRÓPRIO (tela de login)
  // ------------------------------------------------------------------------
  function abrirCadastroCliente() {
    document.getElementById('modalCadastroCliente')?.remove();
    const m = document.createElement('div');
    m.id = 'modalCadastroCliente';
    // modal-sobre-login: fica acima da .login-overlay
    m.className = 'modal show modal-sobre-login';
    m.innerHTML = `
      <div class="modal-content pc-cad">
        <span class="close" onclick="document.getElementById('modalCadastroCliente').remove()">&times;</span>
        <h2>🏢 Criar conta de cliente</h2>
        <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">Para concessionárias, locadoras e empresas solicitarem e acompanharem transportes de veículos.</p>
        <form id="formCadCliente" class="pc-form">
          <div class="pc-grid">
            <div class="login-group pc-full"><label>Nome da empresa / concessionária / locadora *</label><input id="pcEmpresa" required maxlength="120"></div>
            <div class="login-group"><label>Tipo *</label><select id="pcTipo" required>${Object.entries(TIPOS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            <div class="login-group"><label>CNPJ / CPF</label><input id="pcCnpj" maxlength="20" inputmode="numeric" placeholder="só números"></div>
            <div class="login-group"><label>Cidade *</label><input id="pcCidade" required maxlength="80"></div>
            <div class="login-group"><label>UF *</label><select id="pcUf" required>${optsUF('')}</select></div>
            <div class="login-group"><label>Seu nome (responsável) *</label><input id="pcNome" required maxlength="80"></div>
            <div class="login-group"><label>Telefone / WhatsApp</label><input id="pcTel" maxlength="20" inputmode="tel"></div>
            <div class="login-group"><label>E-mail *</label><input id="pcEmail" type="email" required autocomplete="username"></div>
            <div class="login-group"><label>Senha * (mín. 6)</label><input id="pcSenha" type="password" minlength="6" required autocomplete="new-password"></div>
          </div>
          <div id="pcCadMsg" class="login-erro"></div>
          <button type="submit" class="btn btn-primary login-btn" id="pcBtnCriar">Criar conta</button>
        </form>
      </div>`;
    document.body.appendChild(m);
    document.getElementById('formCadCliente').addEventListener('submit', criarContaCliente);
  }

  async function criarContaCliente(e) {
    e.preventDefault();
    const v = id => (document.getElementById(id)?.value || '').trim();
    const msg = document.getElementById('pcCadMsg');
    const btn = document.getElementById('pcBtnCriar');
    const meta = {
      tipo_conta: 'cliente', empresa: v('pcEmpresa'), tipo_empresa: v('pcTipo'),
      cnpj: v('pcCnpj').replace(/\D/g, ''), cidade: v('pcCidade'), uf: v('pcUf'),
      nome: v('pcNome'), telefone: v('pcTel')
    };
    if (!meta.empresa || !meta.cidade || !meta.uf || !meta.nome) { msg.textContent = 'Preencha os campos obrigatórios (*).'; return; }
    btn.disabled = true; btn.textContent = 'Criando...'; msg.style.color = ''; msg.textContent = '';
    try {
      const { data, error } = await supabase.auth.signUp({
        email: v('pcEmail'), password: document.getElementById('pcSenha').value,
        options: { data: meta }
      });
      if (error) throw error;
      if (data && data.session) {
        // Confirmação de e-mail desligada: já entra
        document.getElementById('modalCadastroCliente')?.remove();
        usuarioAtual = data.user;
        await carregarPerfilUsuario(data.user);
        return;
      }
      msg.style.color = '#22c55e';
      msg.innerHTML = '✅ Conta criada! Confirme o e-mail que enviamos e depois entre com seu e-mail e senha.';
      btn.textContent = 'Conta criada';
    } catch (err) {
      const t = String(err.message || err);
      msg.style.color = '#f87171';
      msg.textContent = /registered|already/i.test(t) ? 'Este e-mail já tem conta. Use "Entrar" ou "Esqueci minha senha".' : 'Não foi possível criar a conta: ' + t;
      btn.disabled = false; btn.textContent = 'Criar conta';
    }
  }

  // Link "Sou cliente" na tela de login
  function instalarLinkLogin() {
    const form = document.getElementById('formLogin');
    const card = form ? form.closest('.login-card') : null;
    if (!card || card.querySelector('.pc-link-cadastro')) return;
    const div = document.createElement('div');
    div.className = 'pc-link-cadastro';
    div.innerHTML = `<span>É cliente (concessionária, locadora, empresa)?</span>
      <button type="button" onclick="abrirCadastroCliente()">🏢 Criar minha conta de cliente</button>`;
    card.appendChild(div);
  }

  // ------------------------------------------------------------------------
  // PORTAL
  // ------------------------------------------------------------------------
  function statusCliente(p) {
    if (p.status === 'Cancelado') return { t: 'Cancelado', c: '#ef4444', ic: '✖' };
    if (p.status === 'Entregue') return { t: 'Entregue', c: '#22c55e', ic: '✅' };
    if (p.aprovado === false) return { t: 'Aguardando aprovação', c: '#f59e0b', ic: '⏳' };
    if (p.status === 'Em Transporte' || p.status === 'Transbordo') return { t: 'Em transporte', c: '#3b82f6', ic: '🚛' };
    if (p.status === 'Em Coleta' || p.status_planilha === 'Coletado') return { t: 'Em coleta', c: '#a855f7', ic: '🚚' };
    if (p.status === 'Ocorrência') return { t: 'Em análise pela Movemaster', c: '#f59e0b', ic: '⚠️' };
    if (p.em_viagem) return { t: 'Programado em viagem', c: '#0ea5e9', ic: '🗓️' };
    return { t: 'Aprovado — aguardando programação', c: '#22c55e', ic: '👍' };
  }
  const podeCancelar = p => p.status === 'Pendente' && !p.em_viagem;

  async function carregarPedidosCliente() {
    const { data, error } = await supabase.rpc('mm_cliente_meus_pedidos');
    if (error) throw error;
    _pcPedidos = (data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
  }

  async function renderizarPortalCliente() {
    const cont = document.getElementById('portalClienteConteudo');
    if (!cont) return;
    const pf = (typeof perfilLogado !== 'undefined' && perfilLogado) || {};
    cont.innerHTML = `
      <div class="pc-topo">
        <div>
          <div class="pc-empresa">🏢 ${esc(pf.empresa_nome || pf.nome || 'Cliente')}</div>
          <div class="pc-sub">${pf.cidade ? '📍 ' + esc(pf.cidade) + (pf.uf ? '/' + esc(pf.uf) : '') + ' · ' : ''}👤 ${esc(pf.nome || '')}</div>
        </div>
        <button class="btn btn-primary" onclick="_pcAbrirSolicitacao()">➕ Solicitar transporte</button>
      </div>
      <div id="pcResumo" class="pc-resumo"></div>
      <div class="pc-filtros">
        ${[['ativos', 'Em andamento'], ['todos', 'Todos'], ['entregues', 'Entregues'], ['cancelados', 'Cancelados']]
          .map(([k, l]) => `<button class="pc-chip ${_pcFiltro === k ? 'sel' : ''}" onclick="_pcFiltrar('${k}')">${l}</button>`).join('')}
        <input type="text" id="pcBusca" placeholder="🔎 Placa, modelo, cidade..." oninput="_pcDesenharLista()">
      </div>
      <div id="pcLista" class="pc-lista"><p class="text-muted" style="padding:1rem">Carregando seus pedidos...</p></div>`;
    try {
      await carregarPedidosCliente();
      desenharLista();
    } catch (e) {
      const l = document.getElementById('pcLista');
      if (l) l.innerHTML = `<p class="message show error">Não foi possível carregar seus pedidos: ${esc(e.message || e)}</p>`;
    }
  }

  function desenharLista() {
    const l = document.getElementById('pcLista');
    if (!l) return;
    const b = (document.getElementById('pcBusca')?.value || '').toLowerCase().trim();
    const ativos = _pcPedidos.filter(p => !['Entregue', 'Cancelado'].includes(p.status));
    const res = document.getElementById('pcResumo');
    if (res) res.innerHTML = `
      <div class="pc-kpi"><strong>${ativos.filter(p => p.aprovado === false).length}</strong><span>aguardando aprovação</span></div>
      <div class="pc-kpi"><strong>${ativos.filter(p => p.aprovado !== false).length}</strong><span>em andamento</span></div>
      <div class="pc-kpi"><strong>${_pcPedidos.filter(p => p.status === 'Entregue').length}</strong><span>entregues</span></div>`;
    let lista = _pcPedidos;
    if (_pcFiltro === 'ativos') lista = ativos;
    if (_pcFiltro === 'entregues') lista = lista.filter(p => p.status === 'Entregue');
    if (_pcFiltro === 'cancelados') lista = lista.filter(p => p.status === 'Cancelado');
    if (b) lista = lista.filter(p => `${p.placa} ${p.modelo} ${p.cidade_origem} ${p.cidade_destino} ${p.referencia || ''} #${p.id}`.toLowerCase().includes(b));
    if (!lista.length) { l.innerHTML = '<p class="text-muted" style="padding:1.2rem;text-align:center">Nenhum pedido aqui. Use <strong>➕ Solicitar transporte</strong> para pedir um.</p>'; return; }
    l.innerHTML = lista.map(p => {
      const st = statusCliente(p);
      return `<div class="pc-card">
        <div class="pc-card-top">
          <span class="pc-placa">${typeof placaMercosul === 'function' ? placaMercosul(p.placa) : esc(p.placa)}</span>
          <div class="pc-card-info">
            <div><strong>${esc(p.modelo || '—')}</strong> <span class="text-muted">· pedido #${p.id}${p.referencia ? ' · ref. ' + esc(p.referencia) : ''}</span></div>
            <div class="pc-rota">📍 ${esc(p.cidade_origem || '—')}/${esc(p.uf_origem || '')} → 🏁 ${esc(p.cidade_destino || '—')}/${esc(p.uf_destino || '')}</div>
          </div>
          <span class="pc-status" style="color:${st.c};border-color:${st.c}45;background:${st.c}18">${st.ic} ${st.t}</span>
        </div>
        <div class="pc-card-rod">
          <span>Solicitado em ${dataBR(p.data_solicitacao || p.created_at)}${p.criado_por_nome ? ' · por ' + esc(String(p.criado_por_nome).replace(/^Cliente:\s*/, '')) : ''}</span>
          ${p.data_prev_coleta ? `<span>🚚 Coleta prev.: ${dataBR(p.data_prev_coleta)}</span>` : ''}
          ${p.data_prev_entrega ? `<span>🏁 Entrega prev.: ${dataBR(p.data_prev_entrega)}</span>` : ''}
          ${p.status === 'Cancelado' && p.motivo_cancelamento ? `<span class="pc-cancel-motivo">Motivo: ${esc(p.motivo_cancelamento)}</span>` : ''}
          ${podeCancelar(p) ? `<button class="btn btn-sm btn-danger" onclick="_pcCancelar(${Number(p.id)})">Cancelar solicitação</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function filtrar(k) { _pcFiltro = k; document.querySelectorAll('.pc-chip').forEach(b => b.classList.toggle('sel', b.getAttribute('onclick').includes(`'${k}'`))); desenharLista(); }

  async function cancelar(id) {
    const motivo = prompt('Cancelar o pedido #' + id + '?\n\nInforme o motivo (opcional):', '');
    if (motivo === null) return;
    try {
      const { error } = await supabase.rpc('mm_cliente_cancelar', { p_id: id, p_motivo: motivo });
      if (error) throw error;
      await carregarPedidosCliente();
      desenharLista();
      if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao('✅ Solicitação cancelada');
    } catch (e) { alert(e.message || e); }
  }

  // ------------------------------------------------------------------------
  // NOVA SOLICITAÇÃO
  // ------------------------------------------------------------------------
  function carrosHTML() {
    return _pcCarros.map((c, i) => `<div class="pc-carro">
      <input placeholder="Placa" maxlength="8" value="${esc(c.placa)}" oninput="_pcCarroSet(${i},'placa',this.value)">
      <input placeholder="Modelo (ex.: Onix 1.0)" maxlength="80" value="${esc(c.modelo)}" oninput="_pcCarroSet(${i},'modelo',this.value)">
      ${_pcCarros.length > 1 ? `<button type="button" class="pc-carro-x" onclick="_pcCarroRemover(${i})" title="Remover">✕</button>` : ''}
    </div>`).join('');
  }

  function abrirSolicitacao() {
    const pf = (typeof perfilLogado !== 'undefined' && perfilLogado) || {};
    _pcCarros = [{ placa: '', modelo: '' }];
    document.getElementById('modalPcSolic')?.remove();
    const m = document.createElement('div');
    m.id = 'modalPcSolic';
    m.className = 'modal show';
    m.innerHTML = `
      <div class="modal-content pc-cad">
        <span class="close" onclick="document.getElementById('modalPcSolic').remove()">&times;</span>
        <h2>➕ Solicitar transporte</h2>
        <form id="formPcSolic" class="pc-form">
          <div class="pc-sec">📍 Coleta</div>
          <div class="pc-grid">
            <div class="form-group"><label>UF *</label><select id="pcsUfO" required onchange="carregarCidadesIBGE(this.value,'pcsCidO')">${optsUF(pf.uf || '')}</select></div>
            <div class="form-group"><label>Cidade *</label><select id="pcsCidO" required><option value="">Selecione a UF</option></select></div>
            <div class="form-group pc-full"><label>Endereço de coleta</label><input id="pcsEndO" maxlength="300" placeholder="Rua, número, bairro"></div>
          </div>
          <div class="pc-sec">🏁 Entrega</div>
          <div class="pc-grid">
            <div class="form-group"><label>UF *</label><select id="pcsUfD" required onchange="carregarCidadesIBGE(this.value,'pcsCidD')">${optsUF('')}</select></div>
            <div class="form-group"><label>Cidade *</label><select id="pcsCidD" required><option value="">Selecione a UF</option></select></div>
            <div class="form-group pc-full"><label>Endereço de entrega</label><input id="pcsEndD" maxlength="300" placeholder="Rua, número, bairro"></div>
          </div>
          <div class="pc-sec">🚗 Veículos</div>
          <div id="pcsCarros">${carrosHTML()}</div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="_pcCarroAdd()">➕ Adicionar veículo</button>
          <div class="pc-grid" style="margin-top:12px">
            <div class="form-group"><label>Sua referência / nº do pedido</label><input id="pcsRef" maxlength="80"></div>
            <div class="form-group pc-full"><label>Observações</label><textarea id="pcsObs" maxlength="1000" rows="2" placeholder="Horários, contato no local, urgência..."></textarea></div>
          </div>
          <div id="pcsMsg" class="message"></div>
          <button type="submit" class="btn btn-primary" style="width:100%" id="pcsBtn">📨 Enviar solicitação</button>
        </form>
      </div>`;
    document.body.appendChild(m);
    if (pf.uf && typeof carregarCidadesIBGE === 'function') {
      carregarCidadesIBGE(pf.uf, 'pcsCidO').then(() => {
        const s = document.getElementById('pcsCidO');
        if (s && pf.cidade) [...s.options].forEach(o => { if (o.value.toLowerCase() === String(pf.cidade).toLowerCase()) s.value = o.value; });
      });
    }
    document.getElementById('formPcSolic').addEventListener('submit', enviarSolicitacao);
  }

  async function enviarSolicitacao(e) {
    e.preventDefault();
    const v = id => (document.getElementById(id)?.value || '').trim();
    const msg = document.getElementById('pcsMsg');
    const carros = _pcCarros.map(c => ({ placa: c.placa.trim().toUpperCase(), modelo: c.modelo.trim() })).filter(c => c.placa || c.modelo);
    if (!carros.length) { msg.textContent = 'Informe ao menos um veículo (placa ou modelo).'; msg.className = 'message show error'; return; }
    const btn = document.getElementById('pcsBtn');
    btn.disabled = true; btn.textContent = '⏳ Enviando...';
    try {
      const { error } = await supabase.rpc('mm_cliente_solicitar', { dados: {
        cidade_origem: v('pcsCidO'), uf_origem: v('pcsUfO'), endereco_coleta: v('pcsEndO'),
        cidade_destino: v('pcsCidD'), uf_destino: v('pcsUfD'), endereco_entrega: v('pcsEndD'),
        referencia: v('pcsRef'), observacao: v('pcsObs'), carros
      } });
      if (error) throw error;
      document.getElementById('modalPcSolic')?.remove();
      if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`✅ Solicitação enviada (${carros.length} veículo(s))! A Movemaster vai analisar.`);
      _pcFiltro = 'ativos';
      renderizarPortalCliente();
    } catch (err) {
      msg.textContent = 'Não foi possível enviar: ' + (err.message || err); msg.className = 'message show error';
      btn.disabled = false; btn.textContent = '📨 Enviar solicitação';
    }
  }

  window.abrirCadastroCliente = abrirCadastroCliente;
  window.renderizarPortalCliente = renderizarPortalCliente;
  window._pcAbrirSolicitacao = abrirSolicitacao;
  window._pcFiltrar = filtrar;
  window._pcDesenharLista = desenharLista;
  window._pcCancelar = cancelar;
  window._pcCarroSet = (i, k, val) => { if (_pcCarros[i]) _pcCarros[i][k] = val; };
  window._pcCarroAdd = () => { _pcCarros.push({ placa: '', modelo: '' }); const el = document.getElementById('pcsCarros'); if (el) el.innerHTML = carrosHTML(); };
  window._pcCarroRemover = i => { _pcCarros.splice(i, 1); const el = document.getElementById('pcsCarros'); if (el) el.innerHTML = carrosHTML(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalarLinkLogin);
  else instalarLinkLogin();
})();
