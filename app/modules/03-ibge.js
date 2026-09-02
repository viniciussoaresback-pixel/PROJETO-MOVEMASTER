/* ==========================================================================
   MODULE: 03-ibge.js
   Estados e cidades IBGE
   Linhas originais: 383-449
   ========================================================================== */

// ============================================
// ESTADOS E CIDADES (IBGE)
// ============================================

async function carregarEstadosIBGE() {
    try {
        const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        if (!resp.ok) throw new Error();
        estadosBrasil = await resp.json();
        preencherSelectEstados();
    } catch {
        carregarEstadosManual();
    }
}

function carregarEstadosManual() {
    estadosBrasil = [
        {sigla:'AC',nome:'Acre'},{sigla:'AL',nome:'Alagoas'},{sigla:'AM',nome:'Amazonas'},
        {sigla:'BA',nome:'Bahia'},{sigla:'CE',nome:'Ceará'},{sigla:'DF',nome:'Distrito Federal'},
        {sigla:'ES',nome:'Espírito Santo'},{sigla:'GO',nome:'Goiás'},{sigla:'MA',nome:'Maranhão'},
        {sigla:'MG',nome:'Minas Gerais'},{sigla:'MS',nome:'Mato Grosso do Sul'},{sigla:'MT',nome:'Mato Grosso'},
        {sigla:'PA',nome:'Pará'},{sigla:'PB',nome:'Paraíba'},{sigla:'PE',nome:'Pernambuco'},
        {sigla:'PI',nome:'Piauí'},{sigla:'PR',nome:'Paraná'},{sigla:'RJ',nome:'Rio de Janeiro'},
        {sigla:'RN',nome:'Rio Grande do Norte'},{sigla:'RO',nome:'Rondônia'},{sigla:'RR',nome:'Roraima'},
        {sigla:'RS',nome:'Rio Grande do Sul'},{sigla:'SC',nome:'Santa Catarina'},{sigla:'SE',nome:'Sergipe'},
        {sigla:'SP',nome:'São Paulo'},{sigla:'TO',nome:'Tocantins'}
    ];
    preencherSelectEstados();
}

function preencherSelectEstados() {
    ['ufOrigem','ufDestino'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione o estado</option>';
        estadosBrasil.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.sigla; opt.textContent = `${e.sigla} — ${e.nome}`;
            sel.appendChild(opt);
        });
    });
}

async function carregarCidadesIBGE(sigla, selectID) {
    if (!sigla) return;
    try {
        const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios?orderBy=nome`);
        if (!resp.ok) throw new Error();
        const cidades = await resp.json();
        preencherSelectCidades(cidades, selectID);
    } catch {
        const sel = document.getElementById(selectID);
        if (sel) { sel.innerHTML = '<option value="">Erro ao carregar cidades</option>'; }
    }
}

function preencherSelectCidades(cidades, selectID) {
    const sel = document.getElementById(selectID);
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a cidade</option>';
    cidades.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nome; opt.textContent = c.nome;
        sel.appendChild(opt);
    });
}

