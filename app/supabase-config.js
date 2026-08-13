// ============================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================

const SUPABASE_URL = 'https://xxcqjiqgddjahzjkgopn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4Y3FqaXFnZGRqYWh6amtnb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTIxMjgsImV4cCI6MjA5OTYyODEyOH0.MIY2RRuhGShhUGiJ8J2yYNNejzUeFyjQ3gtvjTGkzQQ';

const bibliotecaOriginal = window.supabase;
var supabase = null;
var perfilAtual = null;
var usuarioAtual = null;
var perfilLogado = null;   // linha completa da tabela perfis (inclui motorista_id)

// Mapa de permissões por perfil
const PERMISSOES = {
    admin:      ['comercial','meusPedidos','painel','logistica','equipes','faturamento','cadastros','diretoria','manutencao','orcamento','cobranca'],
    comercial:  ['comercial','meusPedidos','painel','equipes','cadastros','orcamento','cobranca'],
    logistica:  ['painel','logistica','equipes','comercial','cadastros'],
    financeiro: ['faturamento','cobranca'],
    motorista:  ['motorista'],
    fiscal:     ['fiscal'],
    diretoria:  ['diretoria'],
    manutencao: ['manutencao']
};

const NOMES_PERFIL = {
    admin:      'Administrador',
    comercial:  'Comercial',
    logistica:  'Logística',
    motorista:  'Motorista',
    financeiro: 'Financeiro',
    fiscal:     'Fiscal (CTE)',
    diretoria:  'Diretoria',
    manutencao: 'Manutenção / Oficina'
};

const CORES_PERFIL = {
    admin:      'badge-admin',
    comercial:  'badge-comercial',
    logistica:  'badge-logistica',
    motorista:  'badge-motorista',
    financeiro: 'badge-financeiro',
    fiscal:     'badge-fiscal',
    diretoria:  'badge-diretoria',
    manutencao: 'badge-manutencao'
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

        if (error) {
            // Erro na consulta (geralmente RLS bloqueando a leitura do próprio perfil)
            console.error('Erro ao buscar perfil:', error);
            mostrarSemPermissao('Erro ao buscar seu perfil: ' + error.message + ' — Informe este erro ao administrador.');
            return;
        }

        if (!data) {
            // Login existe no Auth, mas não há linha ativa na tabela perfis
            mostrarSemPermissao('Seu login existe, mas não há perfil ativo vinculado a ele. Peça ao administrador para verificar seu cadastro (perfil não criado ou desativado).');
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
        const identificador = document.getElementById('loginEmail').value.trim();
        const senha = document.getElementById('loginSenha').value;
        const erroEl = document.getElementById('loginErro');
        const btn = document.getElementById('btnLogin');

        btn.textContent = 'Entrando...';
        btn.disabled = true;
        erroEl.textContent = '';

        const falhou = (msg) => {
            erroEl.textContent = msg || 'Dados de acesso incorretos.';
            btn.textContent = 'Entrar';
            btn.disabled = false;
        };

        try {
            // E-mail entra direto. CPF/telefone passam pela função que
            // descobre o e-mail correspondente no servidor.
            if (/\S+@\S+\.\S+/.test(identificador)) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: identificador, password: senha
                });
                if (error) return falhou();
                usuarioAtual = data.user;
                await carregarPerfilUsuario(data.user);
                return;
            }

            const { data: resp, error } = await supabase.functions.invoke('acesso', {
                body: { acao: 'login', identificador, senha }
            });

            if (error || resp?.error || !resp?.access_token) {
                const detalhe = (error?.message || '').toLowerCase();
                if (detalhe.includes('not found') || detalhe.includes('failed to send')) {
                    return falhou('Login por CPF/telefone indisponível. Use seu e-mail ou avise o administrador.');
                }
                return falhou(resp?.error);
            }

            // Assume a sessão devolvida pela função
            const { data: sess, error: erroSessao } = await supabase.auth.setSession({
                access_token: resp.access_token,
                refresh_token: resp.refresh_token
            });
            if (erroSessao || !sess?.user) return falhou();

            usuarioAtual = sess.user;
            await carregarPerfilUsuario(sess.user);
        } catch (err) {
            falhou('Não foi possível entrar. Tente novamente.');
        }
    });
}

// ============================================
// RECUPERAÇÃO DE SENHA
// ============================================

function abrirRecuperarSenha() {
    const existente = document.getElementById('modalRecuperarSenha');
    if (existente) existente.remove();

    const preenchido = document.getElementById('loginEmail')?.value.trim() || '';

    const modal = document.createElement('div');
    modal.id = 'modalRecuperarSenha';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:440px">
            <span class="close" onclick="document.getElementById('modalRecuperarSenha').remove()">&times;</span>
            <h2>🔑 Recuperar senha</h2>
            <p class="text-muted" style="margin-bottom:1rem;font-size:0.88rem;line-height:1.5">
                Informe seu <strong>e-mail, CPF ou telefone</strong>. Enviaremos um link
                para criar uma nova senha no e-mail do seu cadastro.
            </p>
            <div class="form-group">
                <label for="recIdentificador">E-mail, CPF ou telefone</label>
                <input type="text" id="recIdentificador" value="${preenchido.replace(/"/g, '&quot;')}"
                    placeholder="seu@email.com, CPF ou telefone">
            </div>
            <div id="mensagemRecuperar" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btnEnviarRecuperacao" onclick="enviarRecuperacaoSenha()">Enviar link</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalRecuperarSenha').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('recIdentificador')?.focus(), 100);
}

async function enviarRecuperacaoSenha() {
    const ident = document.getElementById('recIdentificador')?.value.trim() || '';
    const msgEl = document.getElementById('mensagemRecuperar');
    const btn = document.getElementById('btnEnviarRecuperacao');

    if (!ident) {
        msgEl.textContent = 'Informe seu e-mail, CPF ou telefone.';
        msgEl.className = 'message show error';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    // Mesma mensagem sempre: não revela se o cadastro existe
    const sucesso = () => {
        msgEl.innerHTML = '✅ Se este cadastro existir, enviamos um link para o e-mail vinculado a ele.<br><span class="text-sm">Verifique também a caixa de spam.</span>';
        msgEl.className = 'message show success';
        btn.textContent = 'Enviar link';
        btn.disabled = false;
    };

    try {
        const redirect = window.location.origin + window.location.pathname;

        if (/\S+@\S+\.\S+/.test(ident)) {
            await supabase.auth.resetPasswordForEmail(ident, { redirectTo: redirect });
            return sucesso();
        }

        const { error } = await supabase.functions.invoke('acesso', {
            body: { acao: 'recuperar', identificador: ident, redirect }
        });
        if (error) {
            const d = (error.message || '').toLowerCase();
            if (d.includes('not found') || d.includes('failed to send')) {
                msgEl.textContent = 'Recuperação por CPF/telefone indisponível. Tente pelo e-mail ou avise o administrador.';
                msgEl.className = 'message show error';
                btn.textContent = 'Enviar link';
                btn.disabled = false;
                return;
            }
        }
        sucesso();
    } catch (e) {
        msgEl.textContent = 'Não foi possível enviar agora. Tente novamente.';
        msgEl.className = 'message show error';
        btn.textContent = 'Enviar link';
        btn.disabled = false;
    }
}

// Quando a pessoa volta pelo link do e-mail, o Supabase dispara o evento
// PASSWORD_RECOVERY — aí mostramos a tela de definir nova senha.
function prepararTelaNovaSenha() {
    if (!supabase) return;

    supabase.auth.onAuthStateChange((evento) => {
        if (evento === 'PASSWORD_RECOVERY') {
            ocultarTodasTelas();
            const tela = document.getElementById('telaNovaSenha');
            if (tela) tela.style.display = 'flex';
        }
    });

    const form = document.getElementById('formNovaSenhaRecuperacao');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const s1 = document.getElementById('recSenha1').value;
        const s2 = document.getElementById('recSenha2').value;
        const erroEl = document.getElementById('recErro');
        const btn = document.getElementById('btnSalvarNovaSenha');

        erroEl.textContent = '';

        if (s1.length < 6) {
            erroEl.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
            return;
        }
        if (s1 !== s2) {
            erroEl.textContent = 'As senhas não são iguais.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const { error } = await supabase.auth.updateUser({ password: s1 });

        if (error) {
            erroEl.textContent = 'Não foi possível salvar: ' + error.message;
            btn.disabled = false;
            btn.textContent = 'Salvar nova senha';
            return;
        }

        // Senha trocada: volta para o login limpo
        await supabase.auth.signOut();
        document.getElementById('telaNovaSenha').style.display = 'none';
        mostrarLogin();
        const erroLogin = document.getElementById('loginErro');
        if (erroLogin) {
            erroLogin.style.color = '#4ade80';
            erroLogin.textContent = '✅ Senha alterada! Entre com a nova senha.';
        }
    });
}

document.addEventListener('DOMContentLoaded', prepararTelaNovaSenha);

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

// Grava o último acesso do usuário na tabela perfis.
// É "melhor esforço": se a coluna não existir ou o RLS bloquear,
// só loga um aviso no console e NUNCA impede o login.
function registrarUltimoAcesso(userId) {
    if (!supabase || !userId) return;
    try {
        supabase
            .from('perfis')
            .update({ ultimo_acesso: new Date().toISOString() })
            .eq('user_id', userId)
            .then(({ error }) => {
                if (error) console.warn('Último acesso não registrado:', error.message);
            });
    } catch (e) {
        console.warn('Último acesso não registrado:', e);
    }
}

// Mostrar/ocultar senha (botão próprio — o nativo do navegador
// não aparece em todos, e some no app instalado em tela cheia)
function alternarVerSenha(campoId, botao) {
    const campo = document.getElementById(campoId);
    if (!campo) return;
    const oculto = campo.type === 'password';
    campo.type = oculto ? 'text' : 'password';
    botao.textContent = oculto ? '🙈' : '👁';
    botao.setAttribute('aria-label', oculto ? 'Ocultar senha' : 'Mostrar senha');
    botao.setAttribute('title', oculto ? 'Ocultar senha' : 'Mostrar senha');
    botao.classList.toggle('ativo', oculto);
    campo.focus();
}

function mostrarAppComPerfil(email, perfilData) {
    ocultarTodasTelas();
    document.getElementById('appPrincipal').style.display = 'block';

    // Guarda o perfil logado (usado para achar a carga do motorista pelo vínculo)
    perfilLogado = perfilData;

    // Registrar último acesso (nunca pode travar o login)
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

    // Ligar a central de notificações
    if (typeof iniciarMonitorNotificacoes === 'function') iniciarMonitorNotificacoes();
    if (typeof iniciarRealtime === 'function') iniciarRealtime();
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

    // Reordena os botões visíveis conforme a ordem definida em PERMISSOES
    abas.forEach(tab => {
        const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
        if (btn && btn.parentNode) btn.parentNode.appendChild(btn);
    });

    // Card de Cadastro de Clientes: visível para todos os perfis que têm a aba Cadastros
    const cardCli = document.getElementById('cardCadastroClientes');
    if (cardCli) cardCli.style.display = '';

    // Ativar primeira aba permitida
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (abas.length > 0) {
        const primeiraAba = abas[0];
        const sec = document.getElementById(primeiraAba);
        if (sec) sec.classList.add('active');
        const btn = document.querySelector(`.nav-btn[data-tab="${primeiraAba}"]`);
        if (btn) btn.classList.add('active');

        // Renderiza o conteúdo da aba inicial (os dados podem ainda estar
        // carregando, por isso a pequena espera).
        setTimeout(() => {
            if (primeiraAba === 'diretoria' && typeof renderizarDiretoria === 'function') renderizarDiretoria();
            if (primeiraAba === 'painel'    && typeof carregarPainel === 'function')      carregarPainel();
            if (primeiraAba === 'logistica' && typeof carregarLogistica === 'function')   carregarLogistica();
            if (primeiraAba === 'manutencao' && typeof carregarManutencao === 'function') carregarManutencao();
            if (primeiraAba === 'faturamento' && typeof renderizarSolicitacoesEPI === 'function') renderizarSolicitacoesEPI();
            if (typeof popularResponsaveisComercial === 'function') popularResponsaveisComercial();
        }, 600);
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

    // Passa a se comportar REALMENTE como o perfil escolhido (respeita as restrições).
    perfilAtual = perfil;
    aplicarPermissoes(perfil);
}

function voltarParaAdmin() {
    perfilAtual = 'admin'; // restaura o raio-x do admin
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
                <div id="avisoNotificacoes"></div>
                <div class="motorista-acoes">
                    <div class="motorista-acao-card" onclick="abrirEnvioFoto()">
                        <span class="motorista-icon">📸</span>
                        <h3>Foto da Placa</h3>
                        <p>Envie a foto da placa para confirmar a coleta</p>
                        <button class="btn btn-primary">Enviar Foto</button>
                    </div>
                    <div class="motorista-acao-card" onclick="abrirSolicitacaoEPI()">
                        <span class="motorista-icon">🦺</span>
                        <h3>Solicitar EPI / Uniforme</h3>
                        <p>Peça reposição de item desgastado ou novo insumo</p>
                        <button class="btn btn-primary">Solicitar</button>
                    </div>
                </div>
                <div class="message" id="mensagemMotorista"></div>
            </div>
            <div class="card" id="cardExtratoMotorista">
                <div class="painel-header-bar">
                    <h2>📄 Meu extrato</h2>
                    <button class="btn btn-secondary btn-sm" onclick="carregarExtratoMotorista()">↻ Atualizar</button>
                </div>
                <div id="extratoMotoristaResumo" class="extrato-resumo"></div>
                <div id="extratoMotoristaLista"><p class="text-muted">Carregando…</p></div>
            </div>
            <div class="card" id="cardSolicitacaoEPI" style="display:none">
                <h2>🦺 Solicitar EPI / Uniforme</h2>
                <div class="epi-motorista-form">
                    <div class="manut-toolbar-campo">
                        <label for="epiMotItem">Item</label>
                        <select id="epiMotItem"></select>
                    </div>
                    <div class="manut-toolbar-campo">
                        <label for="epiMotTamanho">Tamanho / especificação</label>
                        <input type="text" id="epiMotTamanho" placeholder="Ex.: G, 42, manga longa...">
                    </div>
                    <div class="manut-toolbar-campo" style="min-width:150px">
                        <label for="epiMotUrgencia">Urgência</label>
                        <select id="epiMotUrgencia">
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                        </select>
                    </div>
                </div>
                <div class="message" id="mensagemEPIMotorista"></div>
                <div class="manut-acoes">
                    <button class="btn btn-primary" onclick="enviarSolicitacaoEPIMotorista()">Enviar solicitação</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('cardSolicitacaoEPI').style.display='none'">Fechar</button>
                </div>
                <h3 style="margin-top:1.2rem">Minhas solicitações</h3>
                <div id="listaMinhasEPI"><p class="text-muted">Carregando...</p></div>
            </div>
            <div class="card">
                <h2>Meus Pedidos</h2>
                <div id="pedidosMotoristaLista" class="motorista-pedidos-lista">
                    <p class="text-center text-muted">Carregando pedidos...</p>
                </div>
            </div>`;
        // Carregar pedidos do motorista
        setTimeout(() => carregarPedidosMotorista(), 300);
        setTimeout(() => { if (typeof carregarExtratoMotorista === 'function') carregarExtratoMotorista(); }, 700);
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
                <div id="resumoCteFiscal"></div>
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Cegonha</th>
                                <th>Veículos</th>
                                <th>Motorista</th>
                                <th>Valor Total</th>
                                <th>Gerado / CTE</th>
                                <th>Gerado por</th>
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
            const resumoEl = document.getElementById('resumoCteFiscal');
            if (resumoEl) resumoEl.innerHTML = '';
            return;
        }

        // Resumo: quantas cargas ainda faltam emitir o CTE
        const pendentesCte = pdfs.filter(p => p.cte_emitido !== true).length;
        const resumoEl = document.getElementById('resumoCteFiscal');
        if (resumoEl) {
            resumoEl.innerHTML = `
                <div class="cte-resumo ${pendentesCte > 0 ? 'cte-resumo-alerta' : ''}">
                    <span class="cte-resumo-num">${pendentesCte}</span>
                    <span>carga(s) com CTE ${pendentesCte === 1 ? 'pendente' : 'pendentes'} de emissão</span>
                </div>`;
        }

        corpo.innerHTML = pdfs.map(pdf => {
            let extras = {};
            try { extras = JSON.parse(pdf.dados_extras || '{}'); } catch(e) {}

            // Formato atual: dados da cegonha. Formato antigo (por pedido):
            // tinha só { pedido, historico... } — daí caía tudo como "—".
            // Aqui recuperamos o que der a partir do pedido embutido.
            const pedAntigo = extras.pedido || null;

            const placaCegonha = extras.placa_cegonha || pedAntigo?.placaCegonha || '—';
            const totalPedidos = extras.total_pedidos ?? (pedAntigo ? 1 : '—');
            const valorBase = extras.total_frete ?? (pedAntigo ? parseFloat(pedAntigo.valorFrete) || 0 : null);
            const totalFrete = (valorBase !== null && valorBase !== undefined)
                ? 'R$ ' + Number(valorBase).toLocaleString('pt-BR', {minimumFractionDigits:2})
                : '—';
            const gerado = pdf.created_at ? new Date(pdf.created_at).toLocaleString('pt-BR') : '—';

            // Buscar motorista da cegonha
            const veiculo = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : []).find(v => v.placa === placaCegonha);
            const motorista = veiculo?.motorista_padrao || '—';

            // Status de emissão do CTE (guardado no próprio registro do espelho)
            const emitido = pdf.cte_emitido === true;
            const linkCte = (emitido && pdf.cte_numero)
                ? `<br><span class="link-cte-maisfrete" title="Número do CTE">🧾 CTE nº ${pdf.cte_numero}</span>`
                : '';
            const seloEmitido = emitido
                ? `<span class="selo-cte-ok" title="Emitido por ${pdf.cte_emitido_por || '—'}${pdf.cte_emitido_em ? ' em ' + new Date(pdf.cte_emitido_em).toLocaleString('pt-BR') : ''}">✅ CTE emitido</span>${linkCte}`
                : `<span class="selo-cte-pend">⏳ Pendente</span>`;

            // Detecta pedidos que já têm CTE emitido de OUTRO espelho (transbordo).
            // Não emitir CTE de novo — só atualizar o manifesto.
            let avisoCteExistente = '';
            if (!emitido && typeof ctePorPedido !== 'undefined' && ctePorPedido) {
                const pedidosIds = Array.isArray(extras.pedidos_ids) ? extras.pedidos_ids : [];
                const jaEmitidos = pedidosIds.filter(id => ctePorPedido[id]?.emitido);
                if (jaEmitidos.length > 0) {
                    avisoCteExistente = `<br><span class="aviso-cte-transbordo-linha" title="Estes carros já têm CTE emitido de outro espelho — só atualize o manifesto">⚠️ ${jaEmitidos.length} carro(s) com CTE já emitido</span>`;
                }
            }

            return `<tr class="${emitido ? 'linha-cte-emitido' : ''}">
                <td><strong style="color:#f97316">${placaCegonha}</strong></td>
                <td><span style="background:rgba(249,115,22,0.12);color:#f97316;padding:0.15rem 0.5rem;border-radius:4px;font-weight:700">${totalPedidos} veículo(s)</span>${avisoCteExistente}</td>
                <td>${motorista}</td>
                <td style="color:#4ade80;font-weight:600">${totalFrete}</td>
                <td style="font-size:0.78rem">${gerado}<br>${seloEmitido}</td>
                <td style="font-size:0.75rem;color:var(--text-muted)">${pdf.usuario_nome || '—'}</td>
                <td class="fiscal-acoes-td">
                    <button class="btn btn-secondary btn-sm" onclick="regerarEspelhoCarga('${placaCegonha}', '${pdf.id}')" ${placaCegonha === '—' ? 'disabled title="Registro sem cegonha identificada"' : ''}>📄 Ver / Imprimir</button>
                    <button class="btn ${emitido ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleCteEmitido('${pdf.id}', ${emitido})">
                        ${emitido ? '↩️ Desmarcar' : '✅ Marcar emitido'}
                    </button>
                    ${!emitido ? `<button class="btn btn-danger btn-sm" onclick="excluirEspelhoCarga('${pdf.id}')" title="Excluir este espelho (ex.: duplicado)">🗑️ Excluir</button>` : ''}
                </td>
            </tr>`;
        }).join('');

    } catch(e) {
        console.error('Erro ao carregar dados fiscal:', e);
    }
}

// Marca / desmarca a emissão do CTE de um espelho de carga
async function excluirEspelhoCarga(pdfId) {
    if (!supabase || !pdfId) return;
    // Segurança: só permite excluir espelho NÃO emitido
    try {
        const { data } = await supabase.from('ocorrencias')
            .select('cte_emitido, espelho_cegonha, descricao').eq('id', pdfId).maybeSingle();
        if (data?.cte_emitido === true) {
            alert('Este espelho já tem CTe emitido e não pode ser excluído. Se precisar, use "Desmarcar" primeiro.');
            return;
        }
        const alvo = data?.espelho_cegonha || 'esta cegonha';
        if (!confirm(`Excluir o espelho de carga de ${alvo}?\n\nUse isto para remover registros duplicados ou criados por engano. Não afeta os pedidos nem o faturamento já emitido.`)) return;
        const { error } = await supabase.from('ocorrencias').delete().eq('id', pdfId);
        if (error) throw error;
        if (typeof carregarDadosFiscal === 'function') carregarDadosFiscal();
    } catch (e) {
        alert('Erro ao excluir espelho: ' + (e.message || e));
    }
}

async function toggleCteEmitido(pdfId, jaEmitido) {
    if (!supabase) return;
    const novoValor = !jaEmitido;

    // Ao MARCAR emitido, avisar se algum carro deste espelho já tem CTE em outro
    // espelho (caso de transbordo). O CTE não deve ser emitido de novo.
    if (novoValor && typeof ctePorPedido !== 'undefined' && ctePorPedido) {
        try {
            const { data: esp } = await supabase.from('ocorrencias')
                .select('dados_extras').eq('id', pdfId).maybeSingle();
            let extras = {};
            try { extras = JSON.parse(esp?.dados_extras || '{}'); } catch (_) {}
            const ids = Array.isArray(extras.pedidos_ids) ? extras.pedidos_ids : [];
            const jaTem = ids.filter(id => ctePorPedido[id]?.emitido);
            if (jaTem.length > 0) {
                const seguir = confirm(
                    `⚠️ ATENÇÃO — ${jaTem.length} carro(s) desta carga JÁ TÊM CTE EMITIDO.\n\n` +
                    `Isso costuma acontecer quando os carros vieram de transbordo (outra cegonha). ` +
                    `O CTE original deles continua valendo — normalmente basta ATUALIZAR o manifesto no Mais Frete, sem emitir CTE de novo.\n\n` +
                    `Deseja continuar mesmo assim?`
                );
                if (!seguir) return;
            }
        } catch (_) {}
    }

    if (novoValor && !confirm('Confirmar que o CTE desta carga já foi emitido?')) return;
    if (!novoValor && !confirm('Desmarcar a emissão do CTE desta carga?')) return;

    // Ao emitir, pede o número do CTE (Mais Frete) para vincular/identificar
    let cteNumero = null;
    if (novoValor) {
        cteNumero = (prompt('Número do CTE (do Mais Frete) — opcional, ajuda a localizar depois:') || '').trim() || null;
    }

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Fiscal';
    try {
        const dados = {
            cte_emitido: novoValor,
            cte_emitido_por: novoValor ? usuarioNome : null,
            cte_emitido_em: novoValor ? new Date().toISOString() : null
        };
        if (novoValor) dados.cte_numero = cteNumero; else dados.cte_numero = null;
        const { error } = await supabase.from('ocorrencias').update(dados).eq('id', pdfId);
        if (error) throw error;
        carregarDadosFiscal();
    } catch (e) {
        alert('Erro ao atualizar o status do CTE: ' + e.message);
    }
}

// Regerar o espelho a partir da placa da cegonha
// Apenas VISUALIZA o espelho — não registra nada.
// (antes isto chamava a geração completa e criava um espelho novo
//  a cada clique do fiscal, multiplicando as linhas duplicadas)
function regerarEspelhoCarga(placaCegonha, espelhoId) {
    if (typeof gerarEspelhoCarga === 'function') {
        // registrar:false = só visualiza. espelhoId = usa o retrato salvo,
        // então reimprimir mostra exatamente o documento original.
        gerarEspelhoCarga(placaCegonha, { registrar: false, espelhoId });
    }
}

// ============================================
// PARTE 3: MOTORISTA — ENVIO DE FOTO DA PLACA
// ============================================

// ============================================
// NOTIFICAÇÕES PUSH (motorista)
// No iPhone só funciona com o app adicionado à Tela de Início.
// ============================================

// Chave pública VAPID (pode ficar no código — é pública por natureza)
const VAPID_PUBLICA = 'BCH1mbE0c4enN4ONTEnY93LTD9PbMzscfUMLx0Jw9JyxqMn8Ae1a0SpP1XjjEY44GPhJJVfs_Mc3gOFMQWsRqyg';

function base64ParaUint8(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function pushSuportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function appInstalado() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

async function ativarNotificacoes() {
    if (!pushSuportado()) {
        exibirMensagemMotorista('Este aparelho não suporta notificações.', 'error');
        return false;
    }

    const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ehIOS && !appInstalado()) {
        exibirMensagemMotorista(
            'No iPhone é preciso primeiro adicionar o Movemaster à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abrir por lá.',
            'error');
        return false;
    }

    try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
            exibirMensagemMotorista('Notificações não autorizadas. Você pode liberar depois nos Ajustes do celular.', 'error');
            return false;
        }

        const registro = await navigator.serviceWorker.ready;

        // Reaproveita a assinatura existente, se houver
        let assinatura = await registro.pushManager.getSubscription();
        if (!assinatura) {
            assinatura = await registro.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64ParaUint8(VAPID_PUBLICA)
            });
        }

        const dados = assinatura.toJSON();
        const { error } = await supabase.from('push_assinaturas').upsert({
            user_id: usuarioAtual?.id,
            perfil_id: perfilLogado?.id || null,
            endpoint: dados.endpoint,
            assinatura: dados,
            user_agent: navigator.userAgent.slice(0, 300)
        }, { onConflict: 'endpoint' });

        if (error) throw error;

        exibirMensagemMotorista('🔔 Notificações ativadas! Você será avisado sobre suas cargas.', 'success');
        atualizarBotaoNotificacoes();
        return true;
    } catch (e) {
        console.warn('Erro ao ativar notificações:', e);
        exibirMensagemMotorista('Não foi possível ativar as notificações: ' + e.message, 'error');
        return false;
    }
}

// Mostra/esconde o convite conforme o estado atual
async function atualizarBotaoNotificacoes() {
    const area = document.getElementById('avisoNotificacoes');
    if (!area) return;

    if (!pushSuportado()) { area.innerHTML = ''; return; }

    const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ehIOS && !appInstalado()) {
        area.innerHTML = `
            <div class="aviso-notif aviso-notif-info">
                📲 Para receber avisos, adicione o Movemaster à Tela de Início e abra por lá.
            </div>`;
        return;
    }

    if (Notification.permission === 'granted') {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) { area.innerHTML = ''; return; }   // tudo certo, não polui a tela
        } catch (e) {}
    }

    if (Notification.permission === 'denied') {
        area.innerHTML = `
            <div class="aviso-notif aviso-notif-info">
                🔕 Notificações bloqueadas neste aparelho. Libere em Ajustes → Notificações → Movemaster.
            </div>`;
        return;
    }

    area.innerHTML = `
        <div class="aviso-notif">
            <span>🔔 Ative os avisos para saber na hora quando uma foto for reprovada ou uma carga mudar.</span>
            <button class="btn-ativar-notif" onclick="ativarNotificacoes()">Ativar</button>
        </div>`;
}

function abrirEnvioFoto() {
    ocrResultadoAtual = null;
    const pedidosMotorista = obterPedidosMotorista();
    if (pedidosMotorista.length === 0) {
        // Diferenciar "sem vínculo" de "sem carga no status certo"
        const { motoristaVinculado } = nomesDoMotoristaLogado();
        const todosMeus = pedidosDoMotorista();
        let msg;
        if (todosMeus.length > 0) {
            msg = 'Você tem cargas, mas nenhuma em coleta/transporte agora.';
        } else if (!motoristaVinculado) {
            msg = 'Seu login não está vinculado a um cadastro de motorista. Peça ao administrador.';
        } else {
            msg = 'Nenhuma carga atribuída a você no momento.';
        }
        exibirMensagemMotorista(msg, 'error');
        return;
    }

    const opcoes = pedidosMotorista.map(p => `<option value="${p.id}">#${p.id} — ${p.cliente || ''} · ${p.modelo || ''} ${p.placa || ''} (${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''})</option>`).join('');

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

// ---- Identificação do motorista logado (fonte única de verdade) ----
// Usada tanto pela lista de cargas quanto pelos modais de foto/ocorrência.
function normNomeMotorista(s) {
    return (s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
}

// Devolve os nomes que identificam o motorista logado nos pedidos.
// 1º) pelo vínculo perfis.motorista_id  2º) fallback pelo nome do login
function nomesDoMotoristaLogado() {
    const nomes = new Set();

    let motoristaVinculado = null;
    if (perfilLogado?.motorista_id) {
        motoristaVinculado = (motoristasGlobais || [])
            .find(m => String(m.id) === String(perfilLogado.motorista_id));
    }
    if (!motoristaVinculado) {
        const nomeLogin = normNomeMotorista(perfilLogado?.nome || document.getElementById('usuarioLogado')?.textContent);
        motoristaVinculado = (motoristasGlobais || [])
            .find(m => normNomeMotorista(m.nome) === nomeLogin);
    }

    if (motoristaVinculado?.nome) nomes.add(normNomeMotorista(motoristaVinculado.nome));
    if (perfilLogado?.nome) nomes.add(normNomeMotorista(perfilLogado.nome));
    return { nomes, motoristaVinculado };
}

// Pedidos do motorista logado, opcionalmente filtrados por status
function pedidosDoMotorista(statusPermitidos) {
    const { nomes } = nomesDoMotoristaLogado();
    return pedidosGlobais.filter(p => {
        const meu = nomes.has(normNomeMotorista(p.motorista1)) || nomes.has(normNomeMotorista(p.motorista2));
        if (!meu) return false;
        return statusPermitidos ? statusPermitidos.includes(p.status) : true;
    });
}

function obterPedidosMotorista() {
    return pedidosDoMotorista(['Em Coleta', 'Em Transporte', 'Intenção Agendada']);
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
            ${tipo === 'foto_placa' ? `
            <div class="dica-foto-placa">
                <div class="dica-foto-titulo">📸 Como tirar uma foto boa:</div>
                <ul class="dica-foto-lista">
                    <li>Aproxime até a placa ocupar boa parte da tela</li>
                    <li>Mantenha a foto <strong>reta</strong> (não inclinada)</li>
                    <li>Evite reflexo ou sombra em cima da placa</li>
                    <li>Limpe a placa se estiver muito suja</li>
                </ul>
            </div>` : ''}
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

// ============================================
// OCR de placa (Tesseract.js no navegador)
// + compressão da foto antes de enviar (economiza storage)
// ============================================

// Regex de placas brasileiras: antiga (ABC1234) e Mercosul (ABC1D23)
const _REGEX_PLACA_BR = /\b([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})\b/g;

// Comprime uma imagem de câmera em JPEG ~1024px, qualidade 0.8.
// Reduz ~20x o tamanho sem perda visível pra leitura de placa.
async function _comprimirFotoPlaca(arquivo) {
    if (!arquivo || !arquivo.type || !arquivo.type.startsWith('image/')) return arquivo;
    try {
        const bitmap = await createImageBitmap(arquivo);
        const MAX = 1024;
        const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * escala);
        const h = Math.round(bitmap.height * escala);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        if (!blob) return arquivo;
        return new File([blob], (arquivo.name || 'foto').replace(/\.[a-z]+$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) {
        console.warn('Não consegui comprimir a foto:', e);
        return arquivo; // se falhar, envia o original mesmo
    }
}

// Carrega o Tesseract dinamicamente (do CDN). Fica em cache no navegador.
let _tesseractPromise = null;
function _carregarTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tesseractPromise) return _tesseractPromise;
    _tesseractPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.async = true;
        s.onload = () => resolve(window.Tesseract);
        s.onerror = () => reject(new Error('Não consegui carregar o OCR (sem internet?).'));
        document.head.appendChild(s);
    });
    return _tesseractPromise;
}

// Roda OCR na foto e tenta encontrar padrão de placa brasileira.
// Retorna { placaLida, confianca (0-100), textoBruto } ou null se falhar.
async function _rodarOCRPlaca(arquivo, statusCb) {
    try {
        if (statusCb) statusCb('Carregando OCR...');
        const T = await _carregarTesseract();
        if (statusCb) statusCb('Lendo a placa da foto...');
        const { data } = await T.recognize(arquivo, 'eng', {
            // limita para caracteres válidos de placa
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        });
        const bruto = (data?.text || '').toUpperCase().replace(/\s+/g, '');
        // procura padrão de placa brasileira
        let match = null;
        const casos = [...bruto.matchAll(_REGEX_PLACA_BR)];
        if (casos.length) match = casos[0][1].replace(/[- ]/g, '');
        // fallback: pega 7 caracteres alfanuméricos seguidos, se não achou padrão
        if (!match) {
            const m2 = bruto.match(/[A-Z0-9]{7}/);
            if (m2) match = m2[0];
        }
        // confiança média retornada pelo Tesseract (nível do documento)
        const conf = Math.round(Number(data?.confidence) || 0);
        return { placaLida: match || null, confianca: conf, textoBruto: bruto.slice(0, 60) };
    } catch (e) {
        console.warn('OCR falhou:', e);
        return null;
    }
}

// Normaliza placa para comparação: só letras/números, maiúsculas
function _normalizarPlaca(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Compara e devolve o veredito conforme os campos do banco
// (usados em atualizarStatusOCR / renderizarValidacaoPlacas)
function _decidirVereditoOCR(placaPedido, resultado) {
    if (!resultado) return { veredito: 'indisponivel', validacao_logistica: 'pendente' };
    const alvo = _normalizarPlaca(placaPedido);
    const lida = _normalizarPlaca(resultado.placaLida);
    if (!lida) return { veredito: 'ilegivel', validacao_logistica: 'pendente' };
    if (alvo && alvo === lida) return { veredito: 'confere', validacao_logistica: 'auto_ok' };
    // Se só 1 caractere de diferença, ainda cai como divergente pro humano checar
    return { veredito: 'diverge', validacao_logistica: 'pendente' };
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
    const progressTxt = document.getElementById('progressBarTexto');
    progressWrap.style.display = 'block';
    progressInner.style.width = '10%';
    if (progressTxt) progressTxt.textContent = 'Preparando foto...';

    // Se é foto de placa: comprimir e rodar OCR ANTES do upload
    let arquivoFinal = arquivo;
    let ocrResultado = null;
    let ocrVeredito = { veredito: null, validacao_logistica: null };
    let placaPedidoRef = null;

    if (tipo === 'foto_placa') {
        try {
            arquivoFinal = await _comprimirFotoPlaca(arquivo);
            progressInner.style.width = '25%';
            if (progressTxt) progressTxt.textContent = 'Lendo a placa...';
            ocrResultado = await _rodarOCRPlaca(arquivoFinal, (msg) => { if (progressTxt) progressTxt.textContent = msg; });

            // Placa esperada do pedido
            try {
                const ped = (typeof pedidosGlobais !== 'undefined' ? pedidosGlobais : [])
                    .find(p => String(p.id) === String(pedidoId));
                placaPedidoRef = ped?.placa || null;
            } catch (_) {}

            ocrVeredito = _decidirVereditoOCR(placaPedidoRef, ocrResultado);
        } catch (e) { console.warn('OCR/compressão falhou (segue sem):', e); }
        progressInner.style.width = '40%';
    }

    try {
        // 1. Upload para Supabase Storage
        if (progressTxt) progressTxt.textContent = 'Enviando...';
        const ext = (arquivoFinal.name || arquivo.name || 'foto').split('.').pop();
        const nomeArquivo = `${tipo}/${pedidoId}/${Date.now()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('movemaster-arquivos')
            .upload(nomeArquivo, arquivoFinal, { upsert: true });

        if (uploadError) {
            // Identifica qual etapa falhou, para não confundir com o erro da tabela
            const msg = (uploadError.message || '').toLowerCase();
            if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('unauthorized')) {
                throw new Error('Sem permissão para enviar o arquivo (Storage). Peça ao administrador para rodar a correção de RLS do bucket movemaster-arquivos.');
            }
            if (msg.includes('bucket') && msg.includes('not found')) {
                throw new Error('O bucket "movemaster-arquivos" não existe no Supabase Storage.');
            }
            throw uploadError;
        }
        progressInner.style.width = '60%';

        // 2. Pegar URL pública
        const { data: urlData } = supabase.storage
            .from('movemaster-arquivos')
            .getPublicUrl(nomeArquivo);

        const arquivoUrl = urlData?.publicUrl || '';
        progressInner.style.width = '80%';

        // 3. Registrar na tabela ocorrencias (com resultado do OCR se houver)
        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Motorista';
        const registroBase = {
            pedido_id: parseInt(pedidoId),
            tipo,
            descricao: observacao || null,
            arquivo_url: arquivoUrl,
            arquivo_path: nomeArquivo,
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'motorista'
        };
        if (tipo === 'foto_placa' && ocrResultado) {
            registroBase.ocr_placa_lida = ocrResultado.placaLida || null;
            registroBase.ocr_confianca = ocrResultado.confianca || null;
            registroBase.ocr_veredito = ocrVeredito.veredito;
            registroBase.validacao_logistica = ocrVeredito.validacao_logistica;
            if (ocrVeredito.validacao_logistica === 'auto_ok') {
                registroBase.validado_por = 'OCR automático';
                registroBase.validado_em = new Date().toISOString();
            }
        }
        const { error: ocorrErr } = await supabase.from('ocorrencias').insert(registroBase);

        if (ocorrErr) {
            const msg = (ocorrErr.message || '').toLowerCase();
            if (msg.includes('row-level security') || msg.includes('policy')) {
                throw new Error('Arquivo enviado, mas sem permissão para registrar na tabela de ocorrências. Peça ao administrador para rodar a correção de RLS.');
            }
            throw ocorrErr;
        }
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

        // Tocar o sino do COMERCIAL responsável (bate-e-volta da ocorrência)
        if (typeof notificar === 'function') {
            const pedOc = (typeof pedidosGlobais !== 'undefined' ? pedidosGlobais : [])
                .find(p => String(p.id) === String(pedidoId)) || {};
            notificar({
                perfil: 'comercial', nome: pedOc.responsavelComercial, pedidoId: parseInt(pedidoId), tipo: 'acao',
                titulo: '⚠️ Ocorrência no seu pedido',
                mensagem: `${pedOc.cliente ? pedOc.cliente + ' · ' : ''}[${tipo}] ${descricao} — aguarda seu retorno.`
            });
        }

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
                <span>${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''} → ${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}</span>
                <span style="color:#4ade80;font-weight:700">R$ ${Number(pedido.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            </div>
            <div class="form-group">
                <label>Valor Confirmado (R$) *</label>
                <input type="number" id="receitaValor" value="${pedido.valorFrete || ''}" step="0.01" min="0">
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
                <td class="col-nome">${u.nome || '—'}</td>
                <td class="col-email" title="${(u.email || '').replace(/"/g, '&quot;')}">${u.email || '—'}</td>
                <td class="col-perfil"><span class="badge-perfil ${CORES_PERFIL[u.perfil] || ''}">${NOMES_PERFIL[u.perfil] || u.perfil}</span></td>
                <td class="col-status">
                    <span class="status-pill ${u.ativo ? 'ativo' : 'inativo'}">
                        <span class="status-dot"></span>${u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td class="col-criado">${u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td class="col-acoes">
                    <div class="acoes-wrap">
                        <button class="btn btn-secondary btn-sm" onclick='abrirEdicaoLogin(${JSON.stringify(u).replace(/'/g, "&#39;")})' title="Editar nome, e-mail, CPF, telefone e senha">✏️ Login</button>
                        <button class="btn btn-secondary btn-sm" onclick="alterarPerfil(${u.id}, '${u.perfil}')">Perfil</button>
                        ${u.perfil === 'motorista' ? `<button class="btn btn-sm ${u.motorista_id ? 'btn-secondary' : 'btn-primary'}" onclick="abrirVinculoMotorista(${u.id}, '${(u.nome||'').replace(/'/g, "\\'")}', ${u.motorista_id || 'null'})" title="${u.motorista_id ? 'Vinculado ao cadastro de motorista' : 'SEM vínculo — o motorista não vê as cargas!'}">${u.motorista_id ? '🔗 Vinculado' : '⚠️ Vincular'}</button>` : ''}
                        <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-primary'}" onclick="toggleAtivo(${u.id}, ${u.ativo})">
                            ${u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Erro ao carregar usuários:', e);
    }
}

// ============================================
// VÍNCULO: login do motorista ↔ cadastro de motorista
// Sem esse vínculo, o motorista não enxerga as cargas dele.
// ============================================

// ============================================
// ADMIN: EDITAR DADOS DE ACESSO DO USUÁRIO
// (nome, e-mail, CPF, telefone e senha)
// ============================================

function abrirEdicaoLogin(u) {
    const existente = document.getElementById('modalEdicaoLogin');
    if (existente) existente.remove();

    const v = (x) => (x == null ? '' : String(x).replace(/"/g, '&quot;'));

    const modal = document.createElement('div');
    modal.id = 'modalEdicaoLogin';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:560px">
            <span class="close" onclick="document.getElementById('modalEdicaoLogin').remove()">&times;</span>
            <h2>✏️ Editar Acesso</h2>
            <p class="text-muted text-sm" style="margin-bottom:1rem">
                Perfil: <strong>${NOMES_PERFIL[u.perfil] || u.perfil}</strong>
                ${u.ativo ? '' : ' · <span style="color:#ef4444">inativo</span>'}
            </p>

            <div class="form-row">
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="edLogNome" value="${v(u.nome)}">
                </div>
                <div class="form-group">
                    <label>E-mail (login)</label>
                    <input type="email" id="edLogEmail" value="${v(u.email)}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>CPF <span class="text-muted text-sm">(entra por ele)</span></label>
                    <input type="text" id="edLogCpf" value="${v(u.cpf)}" maxlength="14" oninput="mascaraCPF(this)" placeholder="000.000.000-00">
                </div>
                <div class="form-group">
                    <label>Telefone <span class="text-muted text-sm">(entra por ele)</span></label>
                    <input type="tel" id="edLogTelefone" value="${v(u.telefone)}" maxlength="15" oninput="mascaraTelefone(this)" placeholder="(00) 00000-0000">
                </div>
            </div>

            <div class="bloco-nova-senha">
                <label class="checkbox-destaque" style="font-size:0.85rem">
                    <input type="checkbox" id="edLogTrocarSenha" onchange="document.getElementById('edLogGrupoSenha').style.display = this.checked ? '' : 'none'">
                    <span>Definir uma nova senha para este usuário</span>
                </label>
                <div id="edLogGrupoSenha" style="display:none;margin-top:0.7rem">
                    <div class="campo-senha">
                        <input type="password" id="edLogSenha" minlength="6" placeholder="Nova senha (mínimo 6 caracteres)">
                        <button type="button" class="btn-olho-senha" onclick="alternarVerSenha('edLogSenha', this)"
                            aria-label="Mostrar senha" title="Mostrar senha">👁</button>
                    </div>
                    <p class="text-muted text-sm" style="margin-top:0.4rem">
                        A senha muda na hora. Combine com a pessoa antes — ela não recebe aviso automático.
                    </p>
                </div>
            </div>

            <div id="mensagemEdicaoLogin" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btnSalvarLogin" onclick="salvarEdicaoLogin(${u.id})">💾 Salvar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalEdicaoLogin').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarEdicaoLogin(perfilId) {
    const msgEl = document.getElementById('mensagemEdicaoLogin');
    const btn = document.getElementById('btnSalvarLogin');

    const nome     = document.getElementById('edLogNome').value.trim();
    const email    = document.getElementById('edLogEmail').value.trim();
    const cpf      = document.getElementById('edLogCpf').value.trim();
    const telefone = document.getElementById('edLogTelefone').value.trim();
    const trocar   = document.getElementById('edLogTrocarSenha').checked;
    const senha    = trocar ? document.getElementById('edLogSenha').value : null;

    const erro = (m) => {
        msgEl.textContent = m;
        msgEl.className = 'message show error';
        btn.disabled = false;
        btn.textContent = '💾 Salvar';
    };

    if (!nome)  return erro('O nome é obrigatório.');
    if (!email) return erro('O e-mail é obrigatório (é o login principal).');
    if (trocar && (!senha || senha.length < 6)) return erro('A nova senha precisa ter pelo menos 6 caracteres.');

    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const { data, error } = await supabase.functions.invoke('atualizar-usuario', {
            body: { perfil_id: perfilId, nome, email, cpf, telefone, nova_senha: senha }
        });

        if (error) {
            const d = (error.message || '').toLowerCase();
            if (d.includes('not found') || d.includes('failed to send')) {
                return erro('A função "atualizar-usuario" ainda não foi publicada no Supabase.');
            }
            return erro(error.message || 'Falha ao salvar.');
        }
        if (data?.error) return erro(data.error);

        const avisos = [];
        if (data?.email_alterado) avisos.push('e-mail alterado');
        if (data?.senha_alterada) avisos.push('senha redefinida');

        document.getElementById('modalEdicaoLogin').remove();
        carregarListaUsuarios();
        alert('✅ Acesso atualizado' + (avisos.length ? ' (' + avisos.join(' e ') + ')' : '') + '.');
    } catch (e) {
        erro('Erro inesperado: ' + e.message);
    }
}

async function abrirVinculoMotorista(perfilId, nomeLogin, motoristaIdAtual) {
    if (!supabase) return;

    const existing = document.getElementById('modalVinculoMotorista');
    if (existing) existing.remove();

    let motoristas = [];
    try {
        const { data } = await supabase.from('motoristas').select('id, nome, cpf').order('nome');
        motoristas = data || [];
    } catch (e) { /* segue com lista vazia */ }

    const opcoes = ['<option value="">— Sem vínculo —</option>']
        .concat(motoristas.map(m =>
            `<option value="${m.id}" ${String(m.id) === String(motoristaIdAtual) ? 'selected' : ''}>${m.nome}${m.cpf ? ' — ' + m.cpf : ''}</option>`
        )).join('');

    const modal = document.createElement('div');
    modal.id = 'modalVinculoMotorista';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px">
            <span class="close" onclick="document.getElementById('modalVinculoMotorista').remove()">&times;</span>
            <h2>🔗 Vincular Login ao Motorista</h2>
            <p class="text-muted" style="margin-bottom:1rem">
                Login: <strong>${nomeLogin}</strong><br>
                Escolha o cadastro de motorista correspondente. É esse vínculo que faz as cargas
                aparecerem no celular dele — o nome do login não precisa ser igual ao do cadastro.
            </p>
            <div class="form-group">
                <label>Cadastro de motorista</label>
                <select id="selectVinculoMotorista">${opcoes}</select>
            </div>
            ${motoristas.length === 0 ? '<p class="message show error">Nenhum motorista cadastrado. Cadastre em Cadastros → Motorista primeiro.</p>' : ''}
            <div id="mensagemVinculoMotorista" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarVinculoMotorista(${perfilId})">Salvar vínculo</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalVinculoMotorista').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarVinculoMotorista(perfilId) {
    const msgEl = document.getElementById('mensagemVinculoMotorista');
    const valor = document.getElementById('selectVinculoMotorista').value;
    try {
        const { error } = await supabase.from('perfis')
            .update({ motorista_id: valor ? parseInt(valor) : null })
            .eq('id', perfilId);
        if (error) throw error;
        document.getElementById('modalVinculoMotorista').remove();
        carregarListaUsuarios();
    } catch (e) {
        if (msgEl) {
            msgEl.textContent = 'Erro ao salvar: ' + e.message + (e.message.includes('motorista_id') ? ' — rode a migração de vínculo do motorista.' : '');
            msgEl.className = 'message show error';
        }
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
        `Alterar perfil do usuário.\nPerfil atual: ${NOMES_PERFIL[perfilAtualUsuario] || perfilAtualUsuario}\n\nDigite o novo perfil:\nadmin / comercial / logistica / motorista / financeiro / fiscal / diretoria`
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

    // Identificação do motorista logado (mesma lógica usada nos modais)
    const { motoristaVinculado } = nomesDoMotoristaLogado();
    const pedidos = pedidosDoMotorista();

    if (pedidos.length === 0) {
        const semVinculo = !motoristaVinculado;
        lista.innerHTML = semVinculo
            ? `<div class="aviso-sem-vinculo">
                 <strong>⚠️ Seu login ainda não está vinculado a um cadastro de motorista.</strong>
                 <p>Por isso as cargas não aparecem aqui. Peça ao administrador para vincular seu login
                 (<em>${perfilLogado?.nome || ''}</em>) ao seu cadastro de motorista.</p>
               </div>`
            : '<p class="text-center text-muted">Nenhuma carga atribuída a você no momento.</p>';
        return;
    }

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    // ---- Fotos REPROVADAS pela logística: avisar o motorista ----
    let alertaReprovadasHTML = '';
    try {
        const idsMeusPedidos = pedidos.map(p => p.id);
        if (idsMeusPedidos.length > 0) {
            const { data: reprovadas } = await supabase.from('ocorrencias')
                .select('*')
                .eq('tipo', 'foto_placa')
                .eq('validacao_logistica', 'reprovada')
                .in('pedido_id', idsMeusPedidos)
                .order('validado_em', { ascending: false });

            // Só alerta as que ainda não foram reenviadas
            const pendentesReenvio = (reprovadas || []).filter(r => !r.reenviada);

            if (pendentesReenvio.length > 0) {
                alertaReprovadasHTML = pendentesReenvio.map(r => {
                    const p = pedidos.find(x => String(x.id) === String(r.pedido_id));
                    return `
                    <div class="alerta-foto-reprovada">
                        <div class="afr-titulo">📸 Foto reprovada — reenviar</div>
                        <div class="afr-pedido">#${r.pedido_id} · ${p?.modelo || ''} <strong>${p?.placa || ''}</strong></div>
                        <div class="afr-motivo">${r.motivo_reprovacao || 'A logística pediu uma nova foto da placa.'}</div>
                        ${r.validado_por ? `<div class="afr-quem">Por ${r.validado_por}${r.validado_em ? ' · ' + new Date(r.validado_em).toLocaleString('pt-BR') : ''}</div>` : ''}
                        <button class="btn-refazer-foto" onclick="reenviarFotoPlaca(${r.pedido_id}, ${r.id})">📷 Tirar nova foto</button>
                    </div>`;
                }).join('');
            }
        }
    } catch (e) {
        console.warn('Não foi possível verificar fotos reprovadas:', e.message);
    }

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

    if (typeof atualizarBotaoNotificacoes === 'function') atualizarBotaoNotificacoes();

    lista.innerHTML = alertaReprovadasHTML + resumoHTML + pedidos.map(p => {
        const cor = cores[p.status] || '#888';
        const podeFoto = p.status === 'Em Coleta';
        const podeOcorrencia = !['Entregue', 'Cancelado'].includes(p.status);
        const emRota = !['Pendente','Entregue','Cancelado'].includes(p.status);
        return `
        <div class="motorista-pedido-card" style="--mp-cor:${cor}">
            <div class="mpedido-header">
                <span class="mpedido-id">#${p.id}</span>
                <span class="mpedido-status" style="color:${cor};background:${cor}20;border:1px solid ${cor}40">${emRota ? '<span class="mp-pulse"></span>' : ''}${p.status}</span>
            </div>
            <div class="mpedido-cliente">${p.cliente || '—'}</div>
            <div class="mpedido-rota">${rotaFn(p)}</div>
            <div class="mpedido-veiculo">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong> | 🚛 ${p.placaCegonha || '—'}</div>
            ${p.dataPrevColeta ? `<div class="mpedido-data">📅 Coleta: ${new Date(p.dataPrevColeta).toLocaleString('pt-BR')}</div>` : ''}
            <div class="mpedido-acoes">
                ${podeFoto ? `<button class="btn-motorista-acao btn-macao-foto" onclick="abrirEnvioFotoRapido(${p.id})">📸 Foto da Placa</button>` : ''}
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

// Reenviar foto após reprovação: apaga o arquivo reprovado do Storage
// (não serve mais e ocupa espaço), marca a reprovação como tratada
// e abre a câmera já no pedido certo.
async function reenviarFotoPlaca(pedidoId, ocorrenciaId) {
    try {
        if (supabase && ocorrenciaId) {
            // Descobrir o caminho do arquivo para removê-lo
            const { data: oc } = await supabase.from('ocorrencias')
                .select('arquivo_path, arquivo_url')
                .eq('id', ocorrenciaId).maybeSingle();

            const caminho = oc?.arquivo_path || caminhoDoStorage(oc?.arquivo_url);
            if (caminho) {
                const { error: errDel } = await supabase.storage
                    .from('movemaster-arquivos').remove([caminho]);
                if (errDel) console.warn('Arquivo reprovado não removido:', errDel.message);
            }

            await supabase.from('ocorrencias')
                .update({ reenviada: true, arquivo_url: null, arquivo_path: null })
                .eq('id', ocorrenciaId);
        }
    } catch (e) {
        console.warn('Não foi possível limpar a foto reprovada:', e.message);
    }
    abrirEnvioFotoRapido(pedidoId);
}

// Extrai o caminho interno do Storage a partir da URL pública
// (necessário para registros antigos, que não guardavam arquivo_path)
function caminhoDoStorage(url) {
    if (!url) return null;
    const marcador = '/movemaster-arquivos/';
    const i = url.indexOf(marcador);
    if (i === -1) return null;
    return decodeURIComponent(url.substring(i + marcador.length).split('?')[0]);
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
