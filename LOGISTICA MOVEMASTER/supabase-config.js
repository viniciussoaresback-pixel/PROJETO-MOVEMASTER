// ============================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================

const SUPABASE_URL = 'https://xxcqjiqgddjahzjkgopn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4Y3FqaXFnZGRqYWh6amtnb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTIxMjgsImV4cCI6MjA5OTYyODEyOH0.MIY2RRuhGShhUGiJ8J2yYNNejzUeFyjQ3gtvjTGkzQQ';

const bibliotecaOriginal = window.supabase;
var supabase = null;

function inicializarSupabase() {
    if (bibliotecaOriginal && typeof bibliotecaOriginal.createClient === 'function') {
        supabase = bibliotecaOriginal.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('? Supabase inicializado com sucesso!');
        verificarSessao();
    } else {
        console.error('? Biblioteca Supabase não encontrada.');
    }
}

// ============================================
// AUTENTICAÇÃO
// ============================================

async function verificarSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        mostrarApp(session.user.email);
    } else {
        mostrarLogin();
    }
}

function mostrarLogin() {
    document.getElementById('telaLogin').style.display = 'flex';
    document.getElementById('appPrincipal').style.display = 'none';

    const form = document.getElementById('formLogin');
    if (!form) return;

    // Clona para remover listeners antigos
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

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: senha
        });

        if (error) {
            erroEl.textContent = 'E-mail ou senha incorretos.';
            btn.textContent = 'Entrar';
            btn.disabled = false;
        } else {
            mostrarApp(data.user.email);
        }
    });
}

function mostrarApp(email) {
    document.getElementById('telaLogin').style.display = 'none';
    document.getElementById('appPrincipal').style.display = 'block';

    const usuarioEl = document.getElementById('usuarioLogado');
    if (usuarioEl) usuarioEl.textContent = email;
}

async function fazerLogout() {
    await supabase.auth.signOut();
    document.getElementById('appPrincipal').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'flex';

    const emailEl = document.getElementById('loginEmail');
    const senhaEl = document.getElementById('loginSenha');
    const erroEl  = document.getElementById('loginErro');
    if (emailEl) emailEl.value = '';
    if (senhaEl) senhaEl.value = '';
    if (erroEl)  erroEl.textContent = '';

    const btn = document.getElementById('btnLogin');
    if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }
}