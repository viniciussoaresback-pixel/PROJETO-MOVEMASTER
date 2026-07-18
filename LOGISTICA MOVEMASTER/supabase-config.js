// ============================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================

const SUPABASE_URL = 'https://xxcqjiqgddjahzjkgopn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4Y3FqaXFnZGRqYWh6amtnb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTIxMjgsImV4cCI6MjA5OTYyODEyOH0.MIY2RRuhGShhUGiJ8J2yYNNejzUeFyjQ3gtvjTGkzQQ';

const bibliotecaOriginal = window.supabase;
var supabase = null;
var perfilAtual = null;
var usuarioAtual = null;

// Mapa de permissões por perfil
const PERMISSOES = {
    admin:      ['comercial','painel','logistica','faturamento','cadastros'],
    comercial:  ['comercial','painel','cadastros'],
    logistica:  ['painel','logistica'],
    financeiro: ['faturamento'],
    motorista:  ['motorista'],
    fiscal:     ['fiscal']
};

const NOMES_PERFIL = {
    admin:      'Administrador',
    comercial:  'Comercial',
    logistica:  'Logística',
    motorista:  'Motorista',
    financeiro: 'Financeiro',
    fiscal:     'Fiscal (CTE)'
};

const CORES_PERFIL = {
    admin:      'badge-admin',
    comercial:  'badge-comercial',
    logistica:  'badge-logistica',
    motorista:  'badge-motorista',
    financeiro: 'badge-financeiro',
    fiscal:     'badge-fiscal'
};

function inicializarSupabase() {
    if (bibliotecaOriginal && typeof bibliotecaOriginal.createClient === 'function') {
        supabase = bibliotecaOriginal.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado com sucesso!');
        verificarSessao();
    } else {
        console.error('❌ Biblioteca Supabase não encontrada.');
    }
}

// ============================================
// AUTENTICAÇÃO E PERFIL
// ============================================

async function verificarSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        usuarioAtual = session.user;
        await carregarPerfilUsuario(session.user);
    } else {
        mostrarLogin();
    }
}

async function carregarPerfilUsuario(user) {
    try {
        const { data, error } = await supabase
            .from('perfis')
            .select('*')
            .eq('user_id', user.id)
            .eq('ativo', true)
            .maybeSingle();

        if (error || !data) {
            // Usuário sem perfil cadastrado
            mostrarSemPermissao('Usuário sem perfil cadastrado. Contate o administrador.');
            return;
        }

        perfilAtual = data.perfil;
        direcionarPorPerfil(data, user.email);

    } catch (e) {
        console.error('Erro ao carregar perfil:', e);
        mostrarSemPermissao('Erro ao carregar perfil. Tente novamente.');
    }
}

function direcionarPorPerfil(perfil, email) {
    ocultarTodasTelas();

    if (perfil.perfil === 'admin') {
        mostrarTelaAdmin(email, perfil.nome);
    } else {
        mostrarAppComPerfil(email, perfil);
    }
}

// ============================================
// TELAS
// ============================================

function ocultarTodasTelas() {
    ['telaLogin','telaSemPermissao','telaAdmin','appPrincipal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function mostrarLogin() {
    ocultarTodasTelas();
    document.getElementById('telaLogin').style.display = 'flex';

    const form = document.getElementById('formLogin');
    if (!form) return;

    const novoForm = form.cloneNode(true);
    form.parentNode.replaceChild(novoForm, form);

    novoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const senha = document.getElementById('loginSenha').value;
        const erroEl = document.getElementById('loginErro');
        const btn = document.getElementById('btnLogin');

        btn.textContent = 'Entrando...';
        btn.disabled = true;
        erroEl.textContent = '';

        const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

        if (error) {
            erroEl.textContent = 'E-mail ou senha incorretos.';
            btn.textContent = 'Entrar';
            btn.disabled = false;
        } else {
            usuarioAtual = data.user;
            await carregarPerfilUsuario(data.user);
        }
    });
}

function mostrarSemPermissao(mensagem) {
    ocultarTodasTelas();
    document.getElementById('telaSemPermissao').style.display = 'flex';
    const el = document.getElementById('semPermissaoPerfil');
    if (el) el.textContent = mensagem || '';
}

function mostrarTelaAdmin(email, nome) {
    ocultarTodasTelas();
    document.getElementById('telaAdmin').style.display = 'block';

    const el = document.getElementById('usuarioLogadoAdmin');
    if (el) el.textContent = nome || email;

    // Configurar navegação admin
    document.querySelectorAll('[data-tab-admin]').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab-admin');
            document.querySelectorAll('[data-tab-admin]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('#telaAdmin .tab-content').forEach(s => s.classList.remove('active'));
            const sec = document.getElementById(tab);
            if (sec) sec.classList.add('active');
        });
    });

    carregarListaUsuarios();

    // Form novo usuário
    const formNovo = document.getElementById('formNovoUsuario');
    if (formNovo) {
        formNovo.addEventListener('submit', criarNovoUsuario);
    }
}

function mostrarAppComPerfil(email, perfilData) {
    ocultarTodasTelas();
    document.getElementById('appPrincipal').style.display = 'block';

    // Registrar último acesso
    if (usuarioAtual?.id) registrarUltimoAcesso(usuarioAtual.id);

    // Badge de perfil
    const badge = document.getElementById('badgePerfil');
    if (badge) {
        badge.textContent = NOMES_PERFIL[perfilData.perfil] || perfilData.perfil;
        badge.className = 'badge-perfil ' + (CORES_PERFIL[perfilData.perfil] || '');
    }

    // Nome/email no header
    const usuarioEl = document.getElementById('usuarioLogado');
    if (usuarioEl) usuarioEl.textContent = perfilData.nome || email;

    // Aplicar permissões ao menu
    aplicarPermissoes(perfilData.perfil);
}

function aplicarPermissoes(perfil) {
    const abas = PERMISSOES[perfil] || [];

    // Esconder/mostrar botões do menu
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        const tab = btn.getAttribute('data-tab');
        if (abas.includes(tab)) {
            btn.style.display = '';
        } else {
            btn.style.display = 'none';
        }
    });

    // Ativar primeira aba permitida
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (abas.length > 0) {
        const primeiraAba = abas[0];
        const sec = document.getElementById(primeiraAba);
        if (sec) sec.classList.add('active');
        const btn = document.querySelector(`.nav-btn[data-tab="${primeiraAba}"]`);
        if (btn) btn.classList.add('active');
    }

    // Mostrar telas especiais para motorista e fiscal
    if (perfil === 'motorista') mostrarTelaMotorista();
    if (perfil === 'fiscal') mostrarTelaFiscal();
}

// ============================================
// ADMIN: ENTRAR COMO PERFIL
// ============================================

function entrarComoAdmin(perfil) {
    ocultarTodasTelas();
    document.getElementById('appPrincipal').style.display = 'block';

    const badge = document.getElementById('badgePerfil');
    if (badge) {
        badge.textContent = NOMES_PERFIL[perfil] || perfil;
        badge.className = 'badge-perfil ' + (CORES_PERFIL[perfil] || '');
    }

    const usuarioEl = document.getElementById('usuarioLogado');
    if (usuarioEl) usuarioEl.textContent = 'Admin visualizando: ' + NOMES_PERFIL[perfil];

    // Mostrar botão voltar
    const btnVoltar = document.getElementById('btnVoltarAdmin');
    if (btnVoltar) btnVoltar.style.display = '';

    aplicarPermissoes(perfil);
}

function voltarParaAdmin() {
    const btnVoltar = document.getElementById('btnVoltarAdmin');
    if (btnVoltar) btnVoltar.style.display = 'none';
    mostrarTelaAdmin(usuarioAtual?.email || '', '');
}

// ============================================
// TELAS ESPECIAIS: MOTORISTA E FISCAL
// ============================================

function mostrarTelaMotorista() {
    // Esconder todas as abas normais e mostrar conteúdo do motorista
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    let sec = document.getElementById('motorista');
    if (!sec) {
        sec = document.createElement('section');
        sec.id = 'motorista';
        sec.className = 'tab-content active';
        sec.innerHTML = `
            <div class="card">
                <h2>Área do Motorista</h2>
                <p class="text-muted" style="margin-bottom:1.5rem">Seus pedidos ativos e ações disponíveis.</p>
                <div class="motorista-acoes">
                    <div class="motorista-acao-card" onclick="abrirEnvioFoto()">
                        <span class="motorista-icon">📸</span>
                        <h3>Foto da Placa</h3>
                        <p>Envie a foto da placa para confirmar a coleta</p>
                        <button class="btn btn-primary">Enviar Foto</button>
                    </div>
                    <div class="motorista-acao-card" onclick="abrirEnvioDocumento()">
                        <span class="motorista-icon">📄</span>
                        <h3>Documentos CTE</h3>
                        <p>Envie o espelho PDF para geração das notas</p>
                        <button class="btn btn-primary">Enviar PDF</button>
                    </div>
                </div>
                <div class="message" id="mensagemMotorista"></div>
            </div>
            <div class="card">
                <h2>Meus Pedidos</h2>
                <div id="pedidosMotoristaLista" class="motorista-pedidos-lista">
                    <p class="text-center text-muted">Carregando pedidos...</p>
                </div>
            </div>`;
        // Carregar pedidos do motorista
        setTimeout(() => carregarPedidosMotorista(), 300);
        // Importante: existem 2 ".main-content" (telaAdmin e appPrincipal).
        // A tela do motorista precisa ir no main do appPrincipal, que é o visível.
        document.querySelector('#appPrincipal .main-content')?.appendChild(sec);
    } else {
        sec.classList.add('active');
    }
}

function mostrarTelaFiscal() {
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    let sec = document.getElementById('fiscal');
    if (!sec) {
        sec = document.createElement('section');
        sec.id = 'fiscal';
        sec.className = 'tab-content active';
        sec.innerHTML = `
            <div class="card">
                <h2>Área Fiscal (CTE)</h2>
                <p class="text-muted" style="margin-bottom:1rem">Espelhos de carga gerados pela logística para emissão de notas fiscais.</p>
                <div id="notificacoesFiscal" style="margin-bottom:1.2rem"></div>
                <div class="card-header-row" style="margin-bottom:0.8rem">
                    <h3 style="font-size:0.95rem">📄 Espelhos de Carga Recebidos</h3>
                    <button class="btn btn-secondary btn-sm" onclick="carregarDadosFiscal()">↻ Atualizar</button>
                </div>
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Cegonha</th>
                                <th>Veículos</th>
                                <th>Motorista</th>
                                <th>Valor Total</th>
                                <th>Gerado por</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="corpoTabelaFiscal">
                            <tr><td colspan="7" class="text-center">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
        // Correção: a seção era criada mas nunca inserida no DOM (faltava o appendChild)
        document.querySelector('#appPrincipal .main-content')?.appendChild(sec);
        carregarDadosFiscal();
    } else {
        sec.classList.add('active');
        carregarDadosFiscal();
    }
}

async function carregarDadosFiscal() {
    if (!supabase) return;
    try {
        // Buscar espelhos de carga gerados pela logística
        const { data: pdfs } = await supabase
            .from('ocorrencias')
            .select('*')
            .eq('tipo', 'pdf_fiscal')
            .order('created_at', { ascending: false });

        // Ocorrências recentes
        const { data: ocorrencias } = await supabase
            .from('ocorrencias')
            .select('*')
            .eq('tipo', 'ocorrencia')
            .order('created_at', { ascending: false })
            .limit(10);

        // Notificações de ocorrências
        const notifEl = document.getElementById('notificacoesFiscal');
        if (notifEl) {
            if (ocorrencias && ocorrencias.length > 0) {
                notifEl.innerHTML = `
                    <div style="margin-bottom:0.5rem;font-size:0.82rem;font-weight:600;color:#fbbf24">⚠️ Ocorrências Recentes</div>
                    ${ocorrencias.map(o => `
                        <div class="fiscal-notif">
                            <strong>Pedido #${o.pedido_id}</strong> — ${o.descricao || '—'}
                            <span style="float:right;font-size:0.7rem;color:#888">${new Date(o.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                    `).join('')}
                `;
            } else {
                notifEl.innerHTML = '';
            }
        }

        const corpo = document.getElementById('corpoTabelaFiscal');
        if (!corpo) return;

        if (!pdfs || pdfs.length === 0) {
            corpo.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum espelho de carga disponível ainda. A logística gera o espelho pelo Painel das Cegonhas.</td></tr>';
            return;
        }

        corpo.innerHTML = pdfs.map(pdf => {
            let extras = {};
            try { extras = JSON.parse(pdf.dados_extras || '{}'); } catch(e) {}

            const placaCegonha = extras.placa_cegonha || '—';
            const totalPedidos = extras.total_pedidos || '—';
            const totalFrete = extras.total_frete
                ? 'R$ ' + Number(extras.total_frete).toLocaleString('pt-BR', {minimumFractionDigits:2})
                : '—';
            const gerado = pdf.created_at ? new Date(pdf.created_at).toLocaleString('pt-BR') : '—';

            // Buscar motorista da cegonha
            const veiculo = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : []).find(v => v.placa === placaCegonha);
            const motorista = veiculo?.motorista_padrao || '—';

            return `<tr>
                <td><strong style="color:#f97316">${placaCegonha}</strong></td>
                <td><span style="background:rgba(249,115,22,0.12);color:#f97316;padding:0.15rem 0.5rem;border-radius:4px;font-weight:700">${totalPedidos} veículo(s)</span></td>
                <td>${motorista}</td>
                <td style="color:#4ade80;font-weight:600">${totalFrete}</td>
                <td style="font-size:0.78rem">${pdf.usuario_nome || '—'}</td>
                <td style="font-size:0.75rem;color:var(--text-muted)">${gerado}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="regerarEspelhoCarga('${placaCegonha}')">📄 Ver / Imprimir</button>
                </td>
            </tr>`;
        }).join('');

    } catch(e) {
        console.error('Erro ao carregar dados fiscal:', e);
    }
}

// Regerar o espelho a partir da placa da cegonha
function regerarEspelhoCarga(placaCegonha) {
    if (typeof gerarEspelhoCarga === 'function') {
        gerarEspelhoCarga(placaCegonha);
    }
}

// ============================================
// PARTE 3: MOTORISTA — ENVIO DE FOTO DA PLACA
// ============================================

function abrirEnvioFoto() {
    const pedidosMotorista = obterPedidosMotorista();
    if (pedidosMotorista.length === 0) {
        exibirMensagemMotorista('Nenhum pedido Em Coleta atribuído a você.', 'error');
        return;
    }

    const opcoes = pedidosMotorista.map(p => `<option value="${p.id}">#${p.id} — ${p.cliente || ''} (${p.cidade_origem}/${p.uf_origem} → ${p.cidade_destino}/${p.uf_destino})</option>`).join('');

    mostrarModalUpload({
        titulo: '📸 Envio de Foto da Placa',
        descricao: 'Selecione o pedido e envie a foto da placa do veículo para confirmar a coleta.',
        opcoesPedido: opcoes,
        aceitarTipos: 'image/*',
        labelArquivo: 'Foto da placa',
        tipo: 'foto_placa',
        callbackSucesso: () => {
            exibirMensagemMotorista('✅ Foto enviada! A logística foi notificada.', 'success');
        }
    });
}

// ============================================
// PARTE 3: MOTORISTA — ENVIO DE DOCUMENTO CTE
// ============================================

function abrirEnvioDocumento() {
    const pedidosMotorista = obterPedidosMotorista();
    if (pedidosMotorista.length === 0) {
        exibirMensagemMotorista('Nenhum pedido Em Transporte atribuído a você.', 'error');
        return;
    }

    const opcoes = pedidosMotorista.map(p => `<option value="${p.id}">#${p.id} — ${p.cliente || ''}</option>`).join('');

    mostrarModalUpload({
        titulo: '📄 Envio de Documento CTE',
        descricao: 'Envie o espelho em PDF para geração das notas fiscais.',
        opcoesPedido: opcoes,
        aceitarTipos: '.pdf,image/*',
        labelArquivo: 'PDF ou imagem do documento',
        tipo: 'documento_cte',
        callbackSucesso: () => {
            exibirMensagemMotorista('✅ Documento enviado! O fiscal foi notificado.', 'success');
        }
    });
}

function obterPedidosMotorista() {
    const nomeMotorista = document.getElementById('usuarioLogado')?.textContent || '';
    return pedidosGlobais.filter(p =>
        (p.motorista1 === nomeMotorista || p.motorista2 === nomeMotorista) &&
        ['Em Coleta','Em Transporte','Intenção Agendada'].includes(p.status)
    );
}

function exibirMensagemMotorista(texto, tipo) {
    const el = document.getElementById('mensagemMotorista');
    if (!el) return;
    el.textContent = texto;
    el.className = 'message show ' + tipo;
    setTimeout(() => el.classList.remove('show'), 5000);
}

function mostrarModalUpload({ titulo, descricao, opcoesPedido, aceitarTipos, labelArquivo, tipo, callbackSucesso }) {
    // Remove modal anterior se existir
    const existing = document.getElementById('modalUpload');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modalUpload';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('modalUpload').remove()">&times;</span>
            <h2>${titulo}</h2>
            <p class="text-muted" style="margin-bottom:1rem">${descricao}</p>
            <div class="form-group">
                <label>Pedido *</label>
                <select id="uploadPedidoId">
                    ${opcoesPedido}
                </select>
            </div>
            <div class="form-group">
                <label>${labelArquivo} *</label>
                <div class="upload-area" id="uploadArea" onclick="document.getElementById('inputArquivoUpload').click()">
                    <span class="upload-icon">${tipo === 'foto_placa' ? '📷' : '📁'}</span>
                    <p>${tipo === 'foto_placa' ? 'Toque para tirar a foto da placa' : 'Clique para selecionar ou arraste o arquivo aqui'}</p>
                    <span id="nomeArquivoUpload" class="upload-nome"></span>
                </div>
                <input type="file" id="inputArquivoUpload" accept="${aceitarTipos}" ${tipo === 'foto_placa' ? 'capture="environment"' : ''} style="display:none" onchange="mostrarNomeArquivo(this)">
            </div>
            <div class="form-group">
                <label>Observação (opcional)</label>
                <textarea id="uploadObservacao" rows="2" placeholder="Alguma informação adicional..."></textarea>
            </div>
            <div id="uploadProgressBar" style="display:none" class="progress-bar-wrap">
                <div class="progress-bar-inner" id="progressBarInner"></div>
                <span id="progressBarTexto">Enviando...</span>
            </div>
            <div id="mensagemUpload" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="executarUpload('${tipo}', () => { ${callbackSucesso.toString().replace(/^.*?{|}$/g, '')} })">Enviar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalUpload').remove()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function mostrarNomeArquivo(input) {
    const nome = document.getElementById('nomeArquivoUpload');
    const area = document.getElementById('uploadArea');
    if (input.files[0]) {
        nome.textContent = input.files[0].name;
        area.classList.add('upload-area-com-arquivo');
    }
}

async function executarUpload(tipo, callbackSucesso) {
    const pedidoId = document.getElementById('uploadPedidoId')?.value;
    const arquivo = document.getElementById('inputArquivoUpload')?.files[0];
    const observacao = document.getElementById('uploadObservacao')?.value || '';
    const msgEl = document.getElementById('mensagemUpload');

    if (!pedidoId || !arquivo) {
        msgEl.textContent = 'Selecione o pedido e o arquivo.';
        msgEl.className = 'message show error';
        return;
    }

    const progressWrap = document.getElementById('uploadProgressBar');
    const progressInner = document.getElementById('progressBarInner');
    progressWrap.style.display = 'block';
    progressInner.style.width = '30%';

    try {
        // 1. Upload para Supabase Storage
        const ext = arquivo.name.split('.').pop();
        const nomeArquivo = `${tipo}/${pedidoId}/${Date.now()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('movemaster-arquivos')
            .upload(nomeArquivo, arquivo, { upsert: true });

        if (uploadError) throw uploadError;
        progressInner.style.width = '60%';

        // 2. Pegar URL pública
        const { data: urlData } = supabase.storage
            .from('movemaster-arquivos')
            .getPublicUrl(nomeArquivo);

        const arquivoUrl = urlData?.publicUrl || '';
        progressInner.style.width = '80%';

        // 3. Registrar na tabela ocorrencias
        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Motorista';
        const { error: ocorrErr } = await supabase.from('ocorrencias').insert({
            pedido_id: parseInt(pedidoId),
            tipo,
            descricao: observacao || null,
            arquivo_url: arquivoUrl,
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'motorista'
        });

        if (ocorrErr) throw ocorrErr;
        progressInner.style.width = '100%';

        setTimeout(() => {
            document.getElementById('modalUpload')?.remove();
            if (typeof callbackSucesso === 'function') callbackSucesso();
        }, 600);

    } catch (err) {
        progressWrap.style.display = 'none';
        msgEl.textContent = 'Erro ao enviar: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// PARTE 3: LOGÍSTICA — REGISTRAR OCORRÊNCIA
// ============================================

function abrirRegistrarOcorrencia(pedidoId) {
    const existing = document.getElementById('modalOcorrencia');
    if (existing) existing.remove();

    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const modal = document.createElement('div');
    modal.id = 'modalOcorrencia';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('modalOcorrencia').remove()">&times;</span>
            <h2>⚠️ Registrar Ocorrência</h2>
            <p class="text-muted">Pedido #${pedido.id} — ${pedido.cliente || ''}</p>
            <div class="form-group">
                <label>Tipo de Ocorrência *</label>
                <select id="ocorrenciaTipo">
                    <option value="atraso">Atraso</option>
                    <option value="avaria">Avaria no veículo transportado</option>
                    <option value="problema_coleta">Problema na coleta</option>
                    <option value="problema_entrega">Problema na entrega</option>
                    <option value="acidente">Acidente</option>
                    <option value="outros">Outros</option>
                </select>
            </div>
            <div class="form-group">
                <label>Descrição *</label>
                <textarea id="ocorrenciaDescricao" rows="3" placeholder="Descreva o que aconteceu..."></textarea>
            </div>
            <div class="form-group">
                <label>Foto/Documento (opcional)</label>
                <div class="upload-area" onclick="document.getElementById('inputOcorrenciaArquivo').click()">
                    <span class="upload-icon">📎</span>
                    <p>Clique para anexar</p>
                    <span id="nomeOcorrenciaArquivo" class="upload-nome"></span>
                </div>
                <input type="file" id="inputOcorrenciaArquivo" accept="image/*,.pdf" style="display:none"
                    onchange="document.getElementById('nomeOcorrenciaArquivo').textContent = this.files[0]?.name || ''">
            </div>
            <div id="mensagemOcorrencia" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarOcorrencia(${pedidoId})">Registrar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalOcorrencia').remove()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function salvarOcorrencia(pedidoId) {
    const tipo = document.getElementById('ocorrenciaTipo').value;
    const descricao = document.getElementById('ocorrenciaDescricao').value.trim();
    const arquivo = document.getElementById('inputOcorrenciaArquivo')?.files[0];
    const msgEl = document.getElementById('mensagemOcorrencia');

    if (!descricao) {
        msgEl.textContent = 'Descreva a ocorrência.';
        msgEl.className = 'message show error';
        return;
    }

    try {
        let arquivoUrl = null;
        if (arquivo) {
            const ext = arquivo.name.split('.').pop();
            const nomeArq = `ocorrencia/${pedidoId}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from('movemaster-arquivos')
                .upload(nomeArq, arquivo, { upsert: true });
            if (!upErr) {
                const { data: urlData } = supabase.storage.from('movemaster-arquivos').getPublicUrl(nomeArq);
                arquivoUrl = urlData?.publicUrl || null;
            }
        }

        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
        const { error } = await supabase.from('ocorrencias').insert({
            pedido_id: parseInt(pedidoId),
            tipo: 'ocorrencia',
            descricao: `[${tipo.toUpperCase()}] ${descricao}`,
            arquivo_url: arquivoUrl,
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica'
        });
        if (error) throw error;

        // Notificar fiscal via histórico
        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: 'Em Transporte',
            status_novo: 'Em Transporte',
            usuario_nome: usuarioNome,
            usuario_perfil: 'logistica',
            observacao: `⚠️ OCORRÊNCIA: [${tipo}] ${descricao}`
        });

        document.getElementById('modalOcorrencia').remove();
        if (typeof exibirMensagem === 'function')
            exibirMensagem('mensagemLogistica', '⚠️ Ocorrência registrada e fiscal notificado.', 'success');

    } catch(err) {
        msgEl.textContent = 'Erro: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// PARTE 3: FISCAL — PDF DO PEDIDO
// ============================================

async function gerarPDFFiscal(pedidoId) {
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    // Buscar ocorrências e arquivos do pedido
    const { data: ocorrencias } = await supabase
        .from('ocorrencias')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: true });

    const { data: historico } = await supabase
        .from('historico_status')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: true });

    const fotoPlaca = ocorrencias?.find(o => o.tipo === 'foto_placa');
    const docCTE = ocorrencias?.find(o => o.tipo === 'documento_cte');
    const ocorrenciasReais = ocorrencias?.filter(o => o.tipo === 'ocorrencia') || [];

    // Gerar HTML do PDF
    const conteudo = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>CTE — Pedido #${pedidoId}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 2rem; color: #111; font-size: 13px; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f97316; padding-bottom: 1rem; margin-bottom: 1.5rem; }
                .logo-title { font-size: 1.4rem; font-weight: 900; color: #f97316; letter-spacing: 0.05em; }
                .logo-sub { font-size: 0.75rem; color: #888; }
                h2 { font-size: 1rem; color: #f97316; border-bottom: 1px solid #eee; padding-bottom: 0.4rem; margin-top: 1.5rem; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
                th { background: #f5f5f5; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.72rem; text-transform: uppercase; color: #666; }
                td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; }
                .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; background: #fff3e0; color: #f97316; }
                .ocorr { background: #fff8e1; border-left: 3px solid #fbbf24; padding: 0.5rem 0.8rem; margin-bottom: 0.5rem; border-radius: 0 4px 4px 0; }
                .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.72rem; color: #999; text-align: center; }
                .foto-wrap { margin: 0.5rem 0; }
                .foto-wrap img { max-width: 300px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="logo-title">MOVEMASTER</div>
                    <div class="logo-sub">Controle Logístico</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:1.1rem;font-weight:700">CTE — Pedido #${pedidoId}</div>
                    <div style="color:#888;font-size:0.75rem">Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
                </div>
            </div>

            <h2>Dados do Pedido</h2>
            <table>
                <tr><th>Cliente</th><td>${pedido.cliente || '—'}</td><th>Status</th><td><span class="badge">${pedido.status || '—'}</span></td></tr>
                <tr><th>Modelo</th><td>${pedido.modelo || '—'}</td><th>Placa</th><td>${pedido.placa || '—'}</td></tr>
                <tr><th>Origem</th><td>${pedido.cidade_origem || ''}/${pedido.uf_origem || ''}</td><th>Destino</th><td>${pedido.cidade_destino || ''}/${pedido.uf_destino || ''}</td></tr>
                <tr><th>End. Coleta</th><td>${pedido.endereco_coleta || '—'}</td><th>End. Entrega</th><td>${pedido.endereco_entrega || '—'}</td></tr>
                <tr><th>Valor Frete</th><td><strong>R$ ${Number(pedido.valor_frete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td><th>Responsável</th><td>${pedido.responsavel_comercial || '—'}</td></tr>
            </table>

            <h2>Transporte</h2>
            <table>
                <tr><th>Cegonha (Placa)</th><td>${pedido.placa_cegonha || '—'}</td><th>Rota</th><td>${pedido.rota || '—'}</td></tr>
                <tr><th>Motorista 1</th><td>${pedido.motorista_1 || '—'}</td><th>% Frete</th><td>${pedido.percent_motorista_1 || '—'}%</td></tr>
                ${pedido.motorista_2 ? `<tr><th>Motorista 2</th><td>${pedido.motorista_2}</td><th>% Frete</th><td>${pedido.percent_motorista_2 || '—'}%</td></tr>` : ''}
                <tr><th>Prev. Coleta</th><td>${pedido.data_prev_coleta ? new Date(pedido.data_prev_coleta).toLocaleString('pt-BR') : '—'}</td>
                    <th>Prev. Entrega</th><td>${pedido.data_prev_entrega ? new Date(pedido.data_prev_entrega).toLocaleString('pt-BR') : '—'}</td></tr>
            </table>

            ${fotoPlaca ? `<h2>Foto da Placa</h2><div class="foto-wrap"><img src="${fotoPlaca.arquivo_url}" alt="Foto da placa"><br><small>Enviado por ${fotoPlaca.usuario_nome} em ${new Date(fotoPlaca.created_at).toLocaleString('pt-BR')}</small></div>` : ''}

            ${ocorrenciasReais.length > 0 ? `<h2>⚠️ Ocorrências (${ocorrenciasReais.length})</h2>${ocorrenciasReais.map(o => `<div class="ocorr"><strong>${new Date(o.created_at).toLocaleString('pt-BR')}</strong> — ${o.descricao || '—'}<br><small>Por: ${o.usuario_nome}</small></div>`).join('')}` : ''}

            ${historico && historico.length > 0 ? `<h2>Histórico de Status</h2><table><tr><th>Data/Hora</th><th>De</th><th>Para</th><th>Por</th><th>Obs.</th></tr>${historico.map(h => `<tr><td>${new Date(h.created_at).toLocaleString('pt-BR')}</td><td>${h.status_anterior||'—'}</td><td>${h.status_novo}</td><td>${h.usuario_nome||'—'}</td><td>${h.observacao||''}</td></tr>`).join('')}</table>` : ''}

            <div class="footer">Documento gerado pelo sistema MoveMaster · ${new Date().toLocaleString('pt-BR')}</div>
        </body>
        </html>
    `;

    // Abrir em nova janela e imprimir
    const janela = window.open('', '_blank');
    janela.document.write(conteudo);
    janela.document.close();
    setTimeout(() => janela.print(), 500);
}

// ============================================
// PARTE 3: COMERCIAL — CONFIRMAR RECEITA
// ============================================

function abrirConfirmarReceita(pedidoId) {
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const existing = document.getElementById('modalReceita');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modalReceita';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('modalReceita').remove()">&times;</span>
            <h2>💰 Confirmar Receita</h2>
            <div class="status-resumo-info" style="margin-bottom:1rem">
                <span><strong>#${pedido.id}</strong> — ${pedido.cliente || ''}</span>
                <span>${pedido.cidade_origem}/${pedido.uf_origem} → ${pedido.cidade_destino}/${pedido.uf_destino}</span>
                <span style="color:#4ade80;font-weight:700">R$ ${Number(pedido.valor_frete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            </div>
            <div class="form-group">
                <label>Valor Confirmado (R$) *</label>
                <input type="number" id="receitaValor" value="${pedido.valor_frete || ''}" step="0.01" min="0">
            </div>
            <div class="form-group">
                <label>Observação</label>
                <textarea id="receitaObservacao" rows="2" placeholder="Alguma informação sobre a receita..."></textarea>
            </div>
            <div id="mensagemReceita" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarConfirmacaoReceita(${pedidoId})">Confirmar Receita</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalReceita').remove()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function salvarConfirmacaoReceita(pedidoId) {
    const valor = parseFloat(document.getElementById('receitaValor').value) || 0;
    const observacao = document.getElementById('receitaObservacao').value.trim();
    const msgEl = document.getElementById('mensagemReceita');

    try {
        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Comercial';
        const { error } = await supabase.from('ocorrencias').insert({
            pedido_id: parseInt(pedidoId),
            tipo: 'receita',
            descricao: observacao || 'Receita confirmada',
            usuario_nome: usuarioNome,
            usuario_perfil: 'comercial',
            dados_extras: JSON.stringify({ valor_confirmado: valor })
        });
        if (error) throw error;

        // Atualizar valor_frete se diferente
        if (valor && valor !== parseFloat(pedidosGlobais.find(p=>p.id==pedidoId)?.valor_frete||0)) {
            await supabase.from('pedidos').update({ valor_frete: valor }).eq('id', pedidoId);
        }

        document.getElementById('modalReceita').remove();
        exibirMensagem('mensagemComercial', '✅ Receita confirmada e enviada ao financeiro!', 'success');
        await carregarDadosDoSupabase();

    } catch(err) {
        msgEl.textContent = 'Erro: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// PARTE 3: FINANCEIRO — REGISTRAR PAGAMENTO
// ============================================

function abrirRegistrarPagamento(pedidoId) {
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const existing = document.getElementById('modalPagamento');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modalPagamento';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('modalPagamento').remove()">&times;</span>
            <h2>🏦 Registrar Pagamento</h2>
            <div class="status-resumo-info" style="margin-bottom:1rem">
                <span><strong>#${pedido.id}</strong> — ${pedido.cliente || ''}</span>
                <span style="color:#4ade80;font-weight:700">R$ ${Number(pedido.valor_frete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data do Pagamento *</label>
                    <input type="date" id="pagamentoData" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Banco *</label>
                    <select id="pagamentoBanco">
                        <option value="">Selecione...</option>
                        <option>Bradesco</option>
                        <option>Itaú</option>
                        <option>Santander</option>
                        <option>Banco do Brasil</option>
                        <option>Caixa Econômica</option>
                        <option>Nubank</option>
                        <option>Inter</option>
                        <option>Sicoob</option>
                        <option>Sicredi</option>
                        <option>Outro</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Valor Recebido (R$) *</label>
                    <input type="number" id="pagamentoValor" value="${pedido.valor_frete || ''}" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Forma de Pagamento</label>
                    <select id="pagamentoForma">
                        <option>TED/DOC</option>
                        <option>PIX</option>
                        <option>Boleto</option>
                        <option>Depósito</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Observação</label>
                <textarea id="pagamentoObs" rows="2" placeholder="Nº do comprovante, etc..."></textarea>
            </div>
            <div id="mensagemPagamento" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarPagamento(${pedidoId})">Registrar Pagamento</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalPagamento').remove()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function salvarPagamento(pedidoId) {
    const data = document.getElementById('pagamentoData').value;
    const banco = document.getElementById('pagamentoBanco').value;
    const valor = parseFloat(document.getElementById('pagamentoValor').value) || 0;
    const forma = document.getElementById('pagamentoForma').value;
    const obs = document.getElementById('pagamentoObs').value.trim();
    const msgEl = document.getElementById('mensagemPagamento');

    if (!data || !banco || !valor) {
        msgEl.textContent = 'Preencha data, banco e valor.';
        msgEl.className = 'message show error';
        return;
    }

    try {
        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
        const { error } = await supabase.from('ocorrencias').insert({
            pedido_id: parseInt(pedidoId),
            tipo: 'pagamento',
            descricao: `Pagamento via ${forma} — ${banco}${obs ? ' — ' + obs : ''}`,
            usuario_nome: usuarioNome,
            usuario_perfil: 'financeiro',
            dados_extras: JSON.stringify({ data_pagamento: data, banco, valor, forma })
        });
        if (error) throw error;

        document.getElementById('modalPagamento').remove();
        alert('✅ Pagamento registrado com sucesso!');
        await carregarFaturamento();

    } catch(err) {
        msgEl.textContent = 'Erro: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// ADMIN: GERENCIAR USUÁRIOS
// ============================================

async function carregarListaUsuarios() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('perfis')
            .select('*')
            .order('created_at', { ascending: false });

        const corpo = document.getElementById('corpoTabelaUsuarios');
        if (!corpo) return;

        if (error || !data || data.length === 0) {
            corpo.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        corpo.innerHTML = data.map(u => `
            <tr>
                <td>${u.nome || '—'}</td>
                <td>${u.email || '—'}</td>
                <td><span class="badge-perfil ${CORES_PERFIL[u.perfil] || ''}">${NOMES_PERFIL[u.perfil] || u.perfil}</span></td>
                <td>
                    <span class="status-ativo ${u.ativo ? 'ativo' : 'inativo'}">
                        ${u.ativo ? '● Ativo' : '○ Inativo'}
                    </span>
                </td>
                <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td class="acoes-td">
                    <button class="btn btn-secondary btn-sm" onclick="alterarPerfil(${u.id}, '${u.perfil}')">Perfil</button>
                    <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-primary'}" onclick="toggleAtivo(${u.id}, ${u.ativo})">
                        ${u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Erro ao carregar usuários:', e);
    }
}

function abrirModalNovoUsuario() {
    const modal = document.getElementById('modalNovoUsuario');
    if (modal) modal.classList.add('show');
}

async function criarNovoUsuario(e) {
    e.preventDefault();
    const nome   = document.getElementById('novoNome').value.trim();
    const email  = document.getElementById('novoEmail').value.trim();
    const senha  = document.getElementById('novaSenha').value;
    const perfil = document.getElementById('novoPerfil').value;
    const msgEl  = document.getElementById('mensagemNovoUsuario');

    msgEl.textContent = 'Criando usuário...';
    msgEl.className = 'message show';

    try {
        // 1. Criar usuário no Supabase Auth via Admin API (via Edge Function ou service role)
        // Como estamos no frontend, criamos o perfil e o usuário usa "Forgot Password" para definir senha
        // Alternativa: usar signUp e enviar e-mail de confirmação
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password: senha,
            options: { data: { nome } }
        });

        if (authError) throw authError;

        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuário não criado.');

        // 2. Criar perfil na tabela perfis
        const { error: perfilError } = await supabase
            .from('perfis')
            .insert({ user_id: userId, perfil, nome, email, ativo: true });

        if (perfilError) throw perfilError;

        msgEl.textContent = '✅ Usuário criado! Ele receberá um e-mail de confirmação.';
        msgEl.className = 'message show success';
        document.getElementById('formNovoUsuario').reset();
        setTimeout(() => {
            fecharModal('modalNovoUsuario');
            carregarListaUsuarios();
        }, 2000);

    } catch(err) {
        msgEl.textContent = 'Erro: ' + (err.message || 'Tente novamente.');
        msgEl.className = 'message show error';
    }
}

async function alterarPerfil(id, perfilAtualUsuario) {
    const novoPerfil = prompt(
        `Alterar perfil do usuário.\nPerfil atual: ${NOMES_PERFIL[perfilAtualUsuario] || perfilAtualUsuario}\n\nDigite o novo perfil:\nadmin / comercial / logistica / motorista / financeiro / fiscal`
    );
    if (!novoPerfil) return;

    const perfisValidos = ['admin','comercial','logistica','motorista','financeiro','fiscal'];
    if (!perfisValidos.includes(novoPerfil.toLowerCase().trim())) {
        alert('Perfil inválido. Use: ' + perfisValidos.join(', '));
        return;
    }

    const { error } = await supabase
        .from('perfis')
        .update({ perfil: novoPerfil.toLowerCase().trim() })
        .eq('id', id);

    if (error) {
        alert('Erro ao alterar perfil: ' + error.message);
    } else {
        carregarListaUsuarios();
    }
}

async function toggleAtivo(id, ativoAtual) {
    const acao = ativoAtual ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${acao} este usuário?`)) return;

    const { error } = await supabase
        .from('perfis')
        .update({ ativo: !ativoAtual })
        .eq('id', id);

    if (error) {
        alert('Erro: ' + error.message);
    } else {
        carregarListaUsuarios();
    }
}

// ============================================
// LOGOUT
// ============================================

async function fazerLogout() {
    await supabase.auth.signOut();
    perfilAtual = null;
    usuarioAtual = null;
    ocultarTodasTelas();
    mostrarLogin();

    ['loginEmail','loginSenha'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const erroEl = document.getElementById('loginErro');
    if (erroEl) erroEl.textContent = '';
    const btn = document.getElementById('btnLogin');
    if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

// ============================================
// MOTORISTA: LISTAR PEDIDOS ATRIBUÍDOS
// ============================================

async function carregarPedidosMotorista() {
    const lista = document.getElementById('pedidosMotoristaLista');
    if (!lista) return;

    // Recarregar dados
    if (supabase && carregarDadosDoSupabase) await carregarDadosDoSupabase();

    const nomeMotorista = document.getElementById('usuarioLogado')?.textContent || '';
    const pedidos = pedidosGlobais.filter(p =>
        p.motorista1 === nomeMotorista || p.motorista2 === nomeMotorista
    );

    if (pedidos.length === 0) {
        lista.innerHTML = '<p class="text-center text-muted">Nenhum pedido atribuído a você ainda.</p>';
        return;
    }

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    // Resumo do dia do motorista
    const ativos = pedidos.filter(p => !['Entregue', 'Cancelado'].includes(p.status));
    const emColeta = ativos.filter(p => p.status === 'Em Coleta').length;
    const emTransporte = ativos.filter(p => p.status === 'Em Transporte').length;
    const cegonhasDoMotorista = [...new Set(ativos.map(p => p.placaCegonha).filter(Boolean))];

    const resumoHTML = `
        <div class="motorista-resumo-bar">
            <div class="motorista-resumo-nums">
                <span class="mres-item"><strong>${ativos.length}</strong> carros na carga</span>
                <span class="mres-item" style="color:#a78bfa"><strong>${emColeta}</strong> a coletar</span>
                <span class="mres-item" style="color:#34d399"><strong>${emTransporte}</strong> em transporte</span>
            </div>
            ${cegonhasDoMotorista.map(placa => `
                <button class="btn-pdf-carga" onclick="gerarPdfMinhaCarga('${placa}')">
                    📄 PDF da Carga — ${placa}
                </button>
            `).join('')}
        </div>`;

    const rotaFn = (typeof rotaComTransbordoHTML === 'function')
        ? rotaComTransbordoHTML
        : (p) => `📍 ${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → 🏁 ${p.cidadeDestino || ''}/${p.ufDestino || ''}`;

    lista.innerHTML = resumoHTML + pedidos.map(p => {
        const cor = cores[p.status] || '#888';
        const podeFoto = p.status === 'Em Coleta';
        const podeCte = ['Em Coleta', 'Em Transporte'].includes(p.status);
        const podeOcorrencia = !['Entregue', 'Cancelado'].includes(p.status);
        return `
        <div class="motorista-pedido-card">
            <div class="mpedido-header">
                <span class="mpedido-id">#${p.id}</span>
                <span class="mpedido-status" style="color:${cor};background:${cor}20;border:1px solid ${cor}40">${p.status}</span>
            </div>
            <div class="mpedido-cliente">${p.cliente || '—'}</div>
            <div class="mpedido-rota">${rotaFn(p)}</div>
            <div class="mpedido-veiculo">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong> | 🚛 ${p.placaCegonha || '—'}</div>
            ${p.dataPrevColeta ? `<div class="mpedido-data">📅 Coleta: ${new Date(p.dataPrevColeta).toLocaleString('pt-BR')}</div>` : ''}
            <div class="mpedido-acoes">
                ${podeFoto ? `<button class="btn-motorista-acao btn-macao-foto" onclick="abrirEnvioFotoRapido(${p.id})">📸 Foto da Placa</button>` : ''}
                ${podeCte ? `<button class="btn-motorista-acao btn-macao-cte" onclick="abrirEnvioDocumentoRapido(${p.id})">📄 CTE</button>` : ''}
                ${podeOcorrencia ? `<button class="btn-motorista-acao btn-macao-ocorrencia" onclick="abrirRegistrarOcorrencia(${p.id})">⚠️ Ocorrência</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// PDF da carga do motorista — reaproveita o espelho de carga da logística
function gerarPdfMinhaCarga(placaCegonha) {
    if (typeof gerarEspelhoCarga === 'function') {
        gerarEspelhoCarga(placaCegonha);
    } else {
        exibirMensagemMotorista('Geração de PDF indisponível no momento.', 'error');
    }
}

function abrirEnvioFotoRapido(pedidoId) {
    // Abre o modal PRIMEIRO e só então pré-seleciona o pedido
    // (antes tentava setar o select antes de ele existir)
    abrirEnvioFoto();
    const sel = document.getElementById('uploadPedidoId');
    if (sel) sel.value = String(pedidoId);
}

function abrirEnvioDocumentoRapido(pedidoId) {
    abrirEnvioDocumento();
    const sel = document.getElementById('uploadPedidoId');
    if (sel) sel.value = String(pedidoId);
}