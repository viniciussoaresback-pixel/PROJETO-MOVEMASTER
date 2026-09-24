/* ============================================================================
   CONTROLE DE PNEUS — perfil Manutenção/Oficina

   O que faz: guarda o estado atual de cada posição de pneu do veículo (o que
   está montado onde), rastreia cada pneu individualmente pela vida dele
   (entra numa posição, sai, vai para outra), e registra o histórico de
   movimentação. É a "Ficha de Movimentação de Pneus" do papel, agora no
   sistema.

   O que NÃO faz (decisão do usuário): não gera agendamento de manutenção —
   quem decide trocar é o responsável. Aqui é só registro.

   Dados em memória, preenchidos no login:
     pneusGlobais, pneuPosicoesGlobais, pneuMovimentosGlobais
   ============================================================================ */

let pneusGlobais = [];
let pneuPosicoesGlobais = [];
let _pneuVeiculoSel = null;   // placa do veículo aberto na tela

async function carregarDadosPneus(){
  if (typeof supabase === 'undefined' || !supabase) return;
  try {
    const [p, pos] = await Promise.all([
      supabase.from('pneus').select('*').order('codigo'),
      supabase.from('pneu_posicoes').select('*')
    ]);
    if (p && p.data) pneusGlobais = p.data;
    if (pos && pos.data) pneuPosicoesGlobais = pos.data;
  } catch(e){ console.warn('pneus:', e?.message); }
}
window.carregarDadosPneus = carregarDadosPneus;

function _pnEsc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* -------------------------------------------------------------------------
   MAPA DE POSIÇÕES POR TIPO DE VEÍCULO

   Cada tipo tem seu conjunto de posições. Códigos seguem a ficha:
     DE/DD          — dianteiro esquerdo / direito (eixo direcional, 1 pneu)
     T_E_n / T_D_n  — traseiro esquerdo/direito, eixo n, pneu 1 (interno) e 2 (externo)
     C_...          — posições da carreta
     EST            — estepe
   ------------------------------------------------------------------------- */
/* Config padrão pelo tipo, quando o veículo não tem config_eixos salva.
   Cada item é um eixo com o número de pneus. */
function _pnConfigPadrao(v){
  const tipo = String(v?.tipo || '').toLowerCase();
  const cavalo = [{ pneus:2 }];                      // direcional
  const eixosTras = tipo.includes('3 eixos') ? 2 : 1;
  for (let i=0;i<eixosTras;i++) cavalo.push({ pneus:4 });   // traseiros duplados

  const _pc = String(v?.placa_carreta || v?.placaCarreta || '').trim();
  const carreta = _pc.length >= 5 ? [{ pneus:4 },{ pneus:4 },{ pneus:4 }] : [];
  return { cavalo, carreta };
}

/* Configuração efetiva: a salva no veículo, ou o padrão. */
function _pnConfig(v){
  let cfg = v?.config_eixos || v?.configEixos;
  if (typeof cfg === 'string'){ try { cfg = JSON.parse(cfg); } catch(_){ cfg = null; } }
  if (!cfg || !Array.isArray(cfg.cavalo) || !cfg.cavalo.length) return _pnConfigPadrao(v);
  return { cavalo: cfg.cavalo, carreta: Array.isArray(cfg.carreta) ? cfg.carreta : [] };
}

/* Constrói as posições a partir da config. Um eixo de 2 pneus é 1 de cada
   lado (DE/DD ou 1 int por lado); de 4 é 2 de cada lado (int/ext). */
function _pnPosicoesDoVeiculo(v){
  const cfg = _pnConfig(v);
  const construir = (eixos, prefixo, rotBase) => {
    const out = [];
    eixos.forEach((eixo, idx) => {
      const linha = idx;
      const n = Number(eixo.pneus) || 2;
      const porLado = Math.max(1, Math.round(n / 2));
      const dir = idx === 0 && prefixo === 'T';   // 1º eixo do cavalo = direcional
      if (dir){
        out.push({ pos:'DE', rot:'Dianteiro Esq.', linha, lado:'e' });
        out.push({ pos:'DD', rot:'Dianteiro Dir.', linha, lado:'d' });
        return;
      }
      // Numera TODOS os pneus do lado (1..porLado): assim eixo de 6 vira
      // int/meio/ext sem repetir código. int = mais perto do centro.
      for (let k=1;k<=porLado;k++){
        const suf = porLado === 1 ? '' : String(k);
        const lbl = porLado === 1 ? '' : (porLado === 2 ? (k===1?'·int':'·ext') : `·${k}`);
        out.push({ pos:`${prefixo}E${idx+1}${suf}`, rot:`${rotBase} Esq. ${idx+1}${lbl}`, linha, lado:'e' });
        out.push({ pos:`${prefixo}D${idx+1}${suf}`, rot:`${rotBase} Dir. ${idx+1}${lbl}`, linha, lado:'d' });
      }
    });
    return out;
  };

  const cavalo = construir(cfg.cavalo, 'T', 'Tras.');
  cavalo.push({ pos:'EST', rot:'Estepe', linha:99, lado:'c' });

  const temCarreta = cfg.carreta.length > 0;
  const carreta = temCarreta ? construir(cfg.carreta, 'C', 'Carreta') : [];
  if (temCarreta) carreta.push({ pos:'CEST', rot:'Estepe carreta', linha:99, lado:'c' });

  return { cavalo, carreta, temCarreta };
}

function _pnPosOcupada(placa, parte, pos){
  return (pneuPosicoesGlobais||[]).find(x =>
    x.placa === placa && x.parte === parte && x.posicao === pos && x.pneu_id);
}
function _pnPneu(id){ return (pneusGlobais||[]).find(p => String(p.id)===String(id)); }

/* Cor do slot pelo sulco: novo (verde), meia-vida (amarelo), fim (vermelho),
   vazio (cinza). Os limites são os usuais de caminhão. */
function _pnCorSulco(sulco){
  const s = Number(sulco);
  if (isNaN(s)) return 'vazio';
  if (s >= 6) return 'bom';
  if (s >= 3) return 'meio';
  return 'ruim';
}

// =====================================================================
//  TELA PRINCIPAL
// =====================================================================
function renderizarControlePneus(){
  const cont = document.getElementById('painelPneus');
  if (!cont) return;

  const veiculos = (veiculosGlobais||[]).filter(v => v.placa && v.ativo !== false);
  if (!_pneuVeiculoSel && veiculos[0]) _pneuVeiculoSel = veiculos[0].placa;
  const v = veiculos.find(x => x.placa === _pneuVeiculoSel);

  cont.innerHTML = `
    <div class="pn-topo">
      <div class="pn-campo">
        <label>Veículo</label>
        <select onchange="_pnSelVeiculo(this.value)">
          ${veiculos.map(x => `<option value="${x.placa}" ${x.placa===_pneuVeiculoSel?'selected':''}>${x.placa} · ${x.tipo||''}${(x.placa_carreta||x.placaCarreta)?' + carreta':''}</option>`).join('')}
        </select>
      </div>
      <div class="pn-acoes-topo">
        <button class="btn btn-secondary btn-sm" onclick="_pnAbrirCadastroPneu()">➕ Cadastrar pneu</button>
        <button class="btn btn-secondary btn-sm" onclick="_pnAbrirEstoque()">📦 Estoque de pneus</button>
        <button class="btn btn-secondary btn-sm" onclick="_pnConfigurarEixos()">⚙️ Configurar eixos</button>
        <button class="btn btn-secondary btn-sm" onclick="_pnImprimirFicha()">🖨️ Ficha</button>
      </div>
    </div>
    ${v ? _pnDiagramaHTML(v) : '<p class="text-muted">Nenhum veículo da frota própria.</p>'}`;
}
window.renderizarControlePneus = renderizarControlePneus;

function _pnSelVeiculo(placa){ _pneuVeiculoSel = placa; renderizarControlePneus(); }
window._pnSelVeiculo = _pnSelVeiculo;

function _pnDiagramaHTML(v){
  const { cavalo, carreta, temCarreta } = _pnPosicoesDoVeiculo(v);
  const montados = (pneuPosicoesGlobais||[]).filter(x => x.placa === v.placa && x.pneu_id).length;
  const total = cavalo.length + carreta.length;

  const slot = (parte, def) => {
    const ocup = _pnPosOcupada(v.placa, parte, def.pos);
    const pneu = ocup ? _pnPneu(ocup.pneu_id) : null;
    const cor = ocup ? _pnCorSulco(ocup.sulco_mm) : 'vazio';
    return `
      <button class="pn-slot pn-slot-${cor}" onclick="_pnAbrirPosicao('${v.placa}','${parte}','${def.pos}')"
              title="${_pnEsc(def.rot)}">
        <span class="pn-slot-pos">${def.pos}</span>
        ${pneu ? `<span class="pn-slot-cod">${_pnEsc(pneu.codigo||('#'+pneu.id))}</span>
                  <span class="pn-slot-sulco">${ocup.sulco_mm!=null?ocup.sulco_mm+'mm':''}</span>`
               : '<span class="pn-slot-vazio">vazio</span>'}
      </button>`;
  };

  // agrupa por linha de eixo, para desenhar em fileiras
  const fileiras = (lista) => {
    const porLinha = {};
    lista.forEach(d => { (porLinha[d.linha] = porLinha[d.linha] || []).push(d); });
    return Object.keys(porLinha).sort((a,b)=>a-b).map(ln => {
      const esq = porLinha[ln].filter(d => d.lado==='e');
      const dir = porLinha[ln].filter(d => d.lado==='d');
      const centro = porLinha[ln].filter(d => d.lado==='c');
      if (centro.length) return `<div class="pn-fileira pn-fileira-centro">${centro.map(d=>slot(lista===carreta?'carreta':'cavalo',d)).join('')}</div>`;
      return `<div class="pn-fileira">
        <div class="pn-lado">${esq.map(d=>slot(lista===carreta?'carreta':'cavalo',d)).join('')}</div>
        <div class="pn-eixo-barra"></div>
        <div class="pn-lado">${dir.map(d=>slot(lista===carreta?'carreta':'cavalo',d)).join('')}</div>
      </div>`;
    }).join('');
  };

  return `
    <div class="pn-resumo-veic">
      <strong>${_pnEsc(v.placa)}</strong> · ${_pnEsc(v.tipo||'')}
      <span class="pn-resumo-cont">${montados} de ${total} posições com pneu</span>
    </div>
    <div class="pn-diagrama">
      <div class="pn-parte">
        <div class="pn-parte-tit">🚛 Cavalo</div>
        ${fileiras(cavalo)}
      </div>
      ${temCarreta ? `<div class="pn-parte">
        <div class="pn-parte-tit">🚚 Carreta</div>
        ${fileiras(carreta)}
      </div>` : ''}
    </div>
    <div class="pn-legenda">
      <span class="pn-lg pn-lg-bom">● bom (≥6mm)</span>
      <span class="pn-lg pn-lg-meio">● meia-vida (3–6mm)</span>
      <span class="pn-lg pn-lg-ruim">● trocar (&lt;3mm)</span>
      <span class="pn-lg pn-lg-vazio">● vazio</span>
    </div>`;
}

// =====================================================================
//  CONFIGURAR EIXOS DO VEÍCULO
//  Flexível: quantos eixos no cavalo e na carreta, e quantos pneus por eixo.
// =====================================================================
let _pnCfgEdit = null;

function _pnConfigurarEixos(){
  const v = (veiculosGlobais||[]).find(x => x.placa === _pneuVeiculoSel);
  if (!v){ alert('Escolha um veículo.'); return; }
  _pnCfgEdit = _pnConfig(v);
  // clona, para cancelar sem efeito
  _pnCfgEdit = { cavalo: _pnCfgEdit.cavalo.map(e => ({ pneus: Number(e.pneus)||2 })),
                 carreta: _pnCfgEdit.carreta.map(e => ({ pneus: Number(e.pneus)||4 })) };
  _pnRenderCfg(v);
}
window._pnConfigurarEixos = _pnConfigurarEixos;

function _pnRenderCfg(v){
  const old = document.getElementById('modalPneuCfg'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPneuCfg';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100085;padding:2vh 1vw';

  const linhaEixo = (parte, eixo, i) => {
    const dir = (parte === 'cavalo' && i === 0);
    return `<div class="pn-cfg-eixo">
      <span class="pn-cfg-num">Eixo ${i+1}${dir?' (direcional)':''}</span>
      <select onchange="_pnCfgSet('${parte}',${i},this.value)" ${dir?'disabled':''}>
        ${[2,4].map(n => `<option value="${n}" ${Number(eixo.pneus)===n?'selected':''}>${n} pneus</option>`).join('')}
      </select>
      ${!dir ? `<button class="pn-cfg-x" onclick="_pnCfgRemover('${parte}',${i})" title="Remover eixo">✕</button>` : '<span style="width:24px"></span>'}
    </div>`;
  };

  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:95%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">⚙️ Eixos de ${_pnEsc(v.placa)}</h2>
      <p class="text-muted" style="font-size:.83rem;margin:.2rem 0 1rem">Ajuste os eixos e quantos pneus cada um tem. Vale só para este veículo.</p>

      <div class="pn-cfg-bloco">
        <div class="pn-cfg-tit">🚛 Cavalo</div>
        ${_pnCfgEdit.cavalo.map((e,i) => linhaEixo('cavalo', e, i)).join('')}
        <button class="btn btn-secondary btn-sm" onclick="_pnCfgAdd('cavalo')">+ eixo no cavalo</button>
      </div>

      <div class="pn-cfg-bloco">
        <div class="pn-cfg-tit">🚚 Carreta ${_pnCfgEdit.carreta.length?'':'<span class="text-muted" style="font-weight:400">(sem carreta)</span>'}</div>
        ${_pnCfgEdit.carreta.map((e,i) => linhaEixo('carreta', e, i)).join('')}
        <button class="btn btn-secondary btn-sm" onclick="_pnCfgAdd('carreta')">+ eixo na carreta</button>
      </div>

      <div class="pn-cfg-total">Total: <strong>${_pnCfgTotal()}</strong> pneus (fora estepes)</div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="_pnCfgSalvar()">💾 Salvar configuração</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPneuCfg').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}
function _pnCfgTotal(){
  const soma = a => a.reduce((s,e)=>s+(Number(e.pneus)||0),0);
  return soma(_pnCfgEdit.cavalo) + soma(_pnCfgEdit.carreta);
}
function _pnCfgSet(parte,i,val){ _pnCfgEdit[parte][i].pneus = Number(val); _pnReabrirCfg(); }
function _pnCfgAdd(parte){ _pnCfgEdit[parte].push({ pneus: 4 }); _pnReabrirCfg(); }
function _pnCfgRemover(parte,i){ _pnCfgEdit[parte].splice(i,1); _pnReabrirCfg(); }
function _pnReabrirCfg(){ const v=(veiculosGlobais||[]).find(x=>x.placa===_pneuVeiculoSel); if(v)_pnRenderCfg(v); }
window._pnCfgSet=_pnCfgSet; window._pnCfgAdd=_pnCfgAdd; window._pnCfgRemover=_pnCfgRemover;

async function _pnCfgSalvar(){
  const v = (veiculosGlobais||[]).find(x => x.placa === _pneuVeiculoSel);
  if (!v) return;
  try {
    await supabase.from('veiculos').update({ config_eixos: _pnCfgEdit }).eq('id', v.id);
    v.config_eixos = _pnCfgEdit;
    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();
    document.getElementById('modalPneuCfg')?.remove();
    renderizarControlePneus();
    if (typeof mmToast === 'function') mmToast('⚙️ Eixos configurados.');
  } catch(e){
    if (/column|schema cache/i.test(e.message||'')){
      alert('Falta rodar o SQL que cria a coluna config_eixos. Rode o pneus-tabelas.sql e tente de novo.');
    } else alert('Erro ao salvar: '+(e.message||e));
  }
}
window._pnCfgSalvar = _pnCfgSalvar;

// =====================================================================
//  ABRIR UMA POSIÇÃO — montar, editar ou desmontar
// =====================================================================
function _pnAbrirPosicao(placa, parte, pos){
  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const ocup = _pnPosOcupada(placa, parte, pos);
  const pneu = ocup ? _pnPneu(ocup.pneu_id) : null;
  const disponiveis = (pneusGlobais||[]).filter(p =>
    p.situacao !== 'descartado' && !(pneuPosicoesGlobais||[]).some(x => String(x.pneu_id)===String(p.id)));

  const old = document.getElementById('modalPneuPos'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPneuPos';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100070;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:95%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">Posição ${pos} · ${_pnEsc(placa)}</h2>
      <p class="text-muted" style="font-size:.84rem;margin:.2rem 0 1rem">${_pnEsc(v?.tipo||'')} · ${parte === 'carreta' ? 'carreta' : 'cavalo'}</p>

      ${pneu ? `<div class="pn-atual">
        🛞 Montado: <strong>${_pnEsc(pneu.codigo||('#'+pneu.id))}</strong> · ${_pnEsc(pneu.medida||'')} · ${_pnEsc(pneu.tipo||'')}
      </div>` : ''}

      <div class="form-group">
        <label>Pneu nesta posição</label>
        <select id="pnPneuSel">
          <option value="">— vazia —</option>
          ${pneu ? `<option value="${pneu.id}" selected>${_pnEsc(pneu.codigo||('#'+pneu.id))} · ${_pnEsc(pneu.medida||'')} (montado)</option>` : ''}
          ${disponiveis.map(p => `<option value="${p.id}">${_pnEsc(p.codigo||('#'+p.id))} · ${_pnEsc(p.medida||'')} · ${_pnEsc(p.tipo||'')}</option>`).join('')}
        </select>
        <p class="text-muted" style="font-size:.74rem;margin:.3rem 0 0">Não achou o pneu? <a href="#" onclick="event.preventDefault();document.getElementById('modalPneuPos').remove();_pnAbrirCadastroPneu('${placa}','${parte}','${pos}')">cadastre um novo</a>.</p>
      </div>
      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:1"><label>Sulco (mm)</label>
          <input type="number" step="0.1" id="pnSulco" value="${ocup?.sulco_mm ?? ''}" placeholder="ex: 8"></div>
        <div class="form-group" style="flex:1"><label>Pressão</label>
          <input type="text" id="pnPressao" value="${_pnEsc(ocup?.pressao||'')}" placeholder="ex: 120 psi"></div>
      </div>
      <div class="form-group"><label>Km do veículo</label>
        <input type="number" id="pnKm" value="${ocup?.km_montagem ?? ''}" placeholder="hodômetro na montagem"></div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="_pnSalvarPosicao('${placa}','${parte}','${pos}')">💾 Salvar</button>
        ${pneu ? `<button class="btn" style="background:#7f1d1d;color:#fff" onclick="_pnDesmontar('${placa}','${parte}','${pos}')">⬇️ Desmontar</button>` : ''}
        <button class="btn btn-secondary" onclick="document.getElementById('modalPneuPos').remove()">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}
window._pnAbrirPosicao = _pnAbrirPosicao;

async function _pnSalvarPosicao(placa, parte, pos){
  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const pneuId = document.getElementById('pnPneuSel')?.value || '';
  const sulco = parseFloat(document.getElementById('pnSulco')?.value); 
  const pressao = document.getElementById('pnPressao')?.value.trim() || null;
  const km = parseFloat(document.getElementById('pnKm')?.value);
  const usuario = (typeof _usuarioAtualNome === 'function') ? _usuarioAtualNome() : 'Manutenção';

  if (!pneuId){ alert('Escolha um pneu, ou use "Desmontar" para esvaziar a posição.'); return; }

  try {
    const existente = _pnPosOcupada(placa, parte, pos);
    const registro = {
      veiculo_id: v?.id || null, placa, parte, posicao: pos, pneu_id: parseInt(pneuId),
      sulco_mm: isNaN(sulco)?null:sulco, pressao, km_montagem: isNaN(km)?null:km,
      montado_em: new Date().toISOString(), montado_por: usuario, atualizado_em: new Date().toISOString()
    };
    if (existente){
      await supabase.from('pneu_posicoes').update(registro).eq('id', existente.id);
      Object.assign(existente, registro);
    } else {
      const { data } = await supabase.from('pneu_posicoes').insert(registro).select();
      if (data && data[0]) pneuPosicoesGlobais.push(data[0]);
    }
    // pneu em uso
    await supabase.from('pneus').update({ situacao:'em_uso' }).eq('id', parseInt(pneuId));
    const pn = _pnPneu(pneuId); if (pn) pn.situacao = 'em_uso';
    // histórico
    await supabase.from('pneu_movimentos').insert({
      pneu_id: parseInt(pneuId), tipo:'montagem', veiculo_id: v?.id||null, placa, parte, posicao: pos,
      sulco_mm: isNaN(sulco)?null:sulco, pressao, km_veiculo: isNaN(km)?null:km, registrado_por: usuario
    });

    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();
    document.getElementById('modalPneuPos')?.remove();
    renderizarControlePneus();
    if (typeof mmToast === 'function') mmToast(`🛞 Pneu registrado na posição ${pos}.`);
  } catch(e){ alert('Não foi possível salvar a posição:\n\n' + (e.message||e)); }
}
window._pnSalvarPosicao = _pnSalvarPosicao;

async function _pnDesmontar(placa, parte, pos){
  const existente = _pnPosOcupada(placa, parte, pos);
  if (!existente) return;
  const motivo = prompt('Por que o pneu está saindo desta posição? (troca, desgaste, rodízio...)');
  if (motivo === null) return;
  const usuario = (typeof _usuarioAtualNome === 'function') ? _usuarioAtualNome() : 'Manutenção';
  try {
    await supabase.from('pneu_movimentos').insert({
      pneu_id: existente.pneu_id, tipo:'desmontagem', veiculo_id: existente.veiculo_id, placa, parte, posicao: pos,
      sulco_mm: existente.sulco_mm, pressao: existente.pressao, motivo: motivo||null, registrado_por: usuario
    });
    await supabase.from('pneu_posicoes').delete().eq('id', existente.id);
    pneuPosicoesGlobais = pneuPosicoesGlobais.filter(x => x.id !== existente.id);
    // o pneu volta ao estoque (não é descarte — isso é ação à parte)
    await supabase.from('pneus').update({ situacao:'em_estoque' }).eq('id', existente.pneu_id);
    const pn = _pnPneu(existente.pneu_id); if (pn) pn.situacao = 'em_estoque';

    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();
    document.getElementById('modalPneuPos')?.remove();
    renderizarControlePneus();
    if (typeof mmToast === 'function') mmToast(`⬇️ Pneu desmontado de ${pos} — voltou ao estoque.`);
  } catch(e){ alert('Erro ao desmontar: ' + (e.message||e)); }
}
window._pnDesmontar = _pnDesmontar;

// =====================================================================
//  CADASTRO DE PNEU
// =====================================================================
function _pnAbrirCadastroPneu(placaVolta, parteVolta, posVolta){
  const old = document.getElementById('modalPneuCad'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPneuCad';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100080;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:440px;width:95%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 12px">➕ Cadastrar pneu</h2>
      <div class="form-group"><label>Código / ID (fogo, DOT)</label>
        <input type="text" id="pnCod" placeholder="o número gravado no pneu"></div>
      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:1"><label>Medida</label>
          <input type="text" id="pnMedida" placeholder="295/80 R22.5"></div>
        <div class="form-group" style="flex:1"><label>Tipo</label>
          <select id="pnTipo"><option value="novo">Novo</option><option value="recapado">Recapado</option><option value="ressolado">Ressolado</option></select></div>
      </div>
      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:1"><label>Marca</label><input type="text" id="pnMarca" placeholder="opcional"></div>
        <div class="form-group" style="flex:1"><label>Modelo</label><input type="text" id="pnModelo" placeholder="opcional"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn btn-primary" style="flex:1" onclick="_pnSalvarCadastro('${placaVolta||''}','${parteVolta||''}','${posVolta||''}')">💾 Cadastrar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPneuCad').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}
window._pnAbrirCadastroPneu = _pnAbrirCadastroPneu;

async function _pnSalvarCadastro(placaVolta, parteVolta, posVolta){
  const codigo = document.getElementById('pnCod')?.value.trim();
  if (!codigo){ alert('Informe o código do pneu.'); return; }
  const usuario = (typeof _usuarioAtualNome === 'function') ? _usuarioAtualNome() : 'Manutenção';
  try {
    const { data, error } = await supabase.from('pneus').insert({
      codigo, medida: document.getElementById('pnMedida')?.value.trim()||null,
      tipo: document.getElementById('pnTipo')?.value||'novo',
      marca: document.getElementById('pnMarca')?.value.trim()||null,
      modelo: document.getElementById('pnModelo')?.value.trim()||null,
      data_entrada: new Date().toISOString().slice(0,10),
      situacao:'em_estoque', criado_por: usuario
    }).select();
    if (error){
      if (/duplicate|unique/i.test(error.message)){ alert('Já existe um pneu com esse código.'); return; }
      throw error;
    }
    if (data && data[0]) pneusGlobais.push(data[0]);
    document.getElementById('modalPneuCad')?.remove();
    if (typeof mmToast === 'function') mmToast(`➕ Pneu ${codigo} cadastrado.`);
    // volta para a posição que estava sendo preenchida, se veio de lá
    if (placaVolta && posVolta) _pnAbrirPosicao(placaVolta, parteVolta, posVolta);
    else _pnAbrirEstoque();
  } catch(e){ alert('Erro ao cadastrar: ' + (e.message||e)); }
}
window._pnSalvarCadastro = _pnSalvarCadastro;

// =====================================================================
//  ESTOQUE / LISTA DE PNEUS
// =====================================================================
function _pnAbrirEstoque(){
  const old = document.getElementById('modalPneuEstoque'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPneuEstoque';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100070;padding:2vh 1vw';
  const onde = (pneuId) => {
    const p = (pneuPosicoesGlobais||[]).find(x => String(x.pneu_id)===String(pneuId));
    return p ? `${p.placa} · ${p.posicao}` : '—';
  };
  const situ = { em_estoque:'📦 estoque', em_uso:'🛞 em uso', descartado:'🗑️ descartado' };
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:720px;width:96%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">📦 Estoque de pneus (${(pneusGlobais||[]).length})</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalPneuEstoque').remove()">✕</button>
      </div>
      <table class="atua-tabela">
        <thead><tr><th>Código</th><th>Medida</th><th>Tipo</th><th>Situação</th><th>Onde está</th><th></th></tr></thead>
        <tbody>${(pneusGlobais||[]).map(p => `<tr>
          <td><strong>${_pnEsc(p.codigo||('#'+p.id))}</strong></td>
          <td>${_pnEsc(p.medida||'—')}</td>
          <td>${_pnEsc(p.tipo||'—')}</td>
          <td>${situ[p.situacao]||p.situacao}</td>
          <td>${onde(p.id)}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="_pnHistoricoPneu(${p.id})">📜 histórico</button></td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:1.5rem">Nenhum pneu cadastrado ainda.</td></tr>'}</tbody>
      </table>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="document.getElementById('modalPneuEstoque').remove();_pnAbrirCadastroPneu()">➕ Cadastrar pneu</button>
    </div>`;
  document.body.appendChild(div);
}
window._pnAbrirEstoque = _pnAbrirEstoque;

async function _pnHistoricoPneu(pneuId){
  const p = _pnPneu(pneuId);
  let movs = [];
  try {
    const { data } = await supabase.from('pneu_movimentos').select('*')
      .eq('pneu_id', parseInt(pneuId)).order('registrado_em', { ascending:false });
    movs = data || [];
  } catch(_){}
  const rot = { montagem:'⬆️ Montado', desmontagem:'⬇️ Desmontado', rodizio:'🔄 Rodízio', descarte:'🗑️ Descartado' };
  const old = document.getElementById('modalPneuHist'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPneuHist';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100090;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:560px;width:95%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h2 style="margin:0">🛞 ${_pnEsc(p?.codigo||('#'+pneuId))}</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalPneuHist').remove()">✕</button>
      </div>
      <p class="text-muted" style="font-size:.83rem;margin:.2rem 0 1rem">${_pnEsc(p?.medida||'')} · ${_pnEsc(p?.tipo||'')} · ${movs.length} movimento(s)</p>
      ${movs.length ? `<div class="rp-tl">${movs.map(m => `
        <div class="rp-tl-item">
          <span class="rp-tl-data">${m.registrado_em?new Date(m.registrado_em).toLocaleDateString('pt-BR'):''}</span>
          <span class="rp-tl-txt">${rot[m.tipo]||m.tipo} ${m.placa?'· '+_pnEsc(m.placa):''} ${m.posicao?'· '+_pnEsc(m.posicao):''} ${m.sulco_mm!=null?'· '+m.sulco_mm+'mm':''}${m.motivo?' — '+_pnEsc(m.motivo):''}</span>
          <span class="rp-tl-quem">${_pnEsc(m.registrado_por||'')}</span>
        </div>`).join('')}</div>` : '<p class="text-muted">Sem movimentações registradas.</p>'}
    </div>`;
  document.body.appendChild(div);
}
window._pnHistoricoPneu = _pnHistoricoPneu;

// =====================================================================
//  IMPRESSÃO DA FICHA
// =====================================================================
function _pnImprimirFicha(){
  const cont = document.getElementById('painelPneus');
  if (!cont) return;
  const v = (veiculosGlobais||[]).find(x => x.placa === _pneuVeiculoSel);
  const j = window.open('', '_blank');
  if (!j){ alert('O navegador bloqueou a impressão.'); return; }
  j.document.write(`<html><head><title>Ficha de pneus — ${_pnEsc(_pneuVeiculoSel)}</title>
    <style>body{font-family:Arial;padding:20px}.pn-acoes-topo,.pn-legenda button,select{display:none}
    .pn-slot{border:1px solid #333;border-radius:6px;padding:6px;margin:3px;display:inline-block;min-width:70px;text-align:center;font-size:11px}
    .pn-fileira{display:flex;justify-content:center;gap:20px;margin:6px 0}.pn-parte-tit{font-weight:bold;margin:10px 0 4px}
    h2{font-size:16px}</style></head><body>
    <h2>Ficha de Movimentação de Pneus — ${_pnEsc(_pneuVeiculoSel)} (${_pnEsc(v?.tipo||'')})</h2>
    <div>Emitida em ${new Date().toLocaleString('pt-BR')}</div>
    ${v ? _pnDiagramaHTML(v) : ''}</body></html>`);
  j.document.close(); j.focus();
  setTimeout(() => j.print(), 300);
}
window._pnImprimirFicha = _pnImprimirFicha;
