/* =========================================================================
   MOVEMASTER — Leitor de DACTE
   Extrai de um PDF de DACTE: número do CT-e, chave de acesso, tomador,
   origem, destino e as PLACAS DOS CARROS TRANSPORTADOS.

   Nada aqui grava no banco. A função devolve os dados lidos; quem decide
   o que fazer é a tela de conferência — documento fiscal não se preenche
   no escuro.
   ========================================================================= */

/* ---------- Extração das placas: a parte delicada ----------
   Nas OBSERVAÇÕES GERAIS aparecem três tipos de placa, e só uma interessa:

     "...VEICULO DO EMITENTE DE PLACA FDZ0I90..."   -> a CEGONHA   (ignorar)
     "...CONJUNTO PLACA ISY6J45..."                 -> a CARRETA   (ignorar)
     "SPIN TJA0H56"                                 -> o CARRO     (usar)
     "PLACA: FDZ0I90"  (rodapé)                     -> a CEGONHA   (ignorar)

   Os carros transportados vêm como "MODELO PLACA", um por linha. Então a
   regra é: pegar as placas da seção de observações e descartar as que
   estiverem precedidas de PLACA/CONJUNTO PLACA.
   ------------------------------------------------------------------- */

// Placa antiga (ABC1234) ou Mercosul (ABC1D23)
const _DACTE_RE_PLACA = /\b([A-Z]{3}\d[A-Z0-9]\d{2})\b/g;

function _dacteTrechoObservacoes(texto) {
  const ini = texto.search(/OBSERVA[ÇC][ÕO]ES\s+GERAIS/i);
  const corte = ini === -1 ? texto : texto.slice(ini);
  const fim = corte.search(/INFORMA[ÇC][ÕO]ES\s+ESPEC[ÍI]FICAS/i);
  return fim === -1 ? corte : corte.slice(0, fim);
}

// Identificador do carro transportado. Pode ser:
//   - placa antiga    ABC1234
//   - placa Mercosul  ABC1D23
//   - chassi          T3023502 (carro 0km, ainda sem placa)
// Regra: 7 a 17 caracteres, só letras e números, contendo letra E número.
// Exigir letra descarta sozinho RENAVAM, CIOT, CPF, protocolo e apólice,
// que são sequências só de dígitos.
const _DACTE_RE_ID = /\b(?=[A-Z0-9]{7,17}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{7,17}\b/g;

function _dactePlacasDosCarros(texto) {
  const obs = _dacteTrechoObservacoes(texto);

  // O caminhão e a carreta também aparecem aqui. Ficam de fora: vêm sempre
  // logo depois de "PLACA" ou "CONJUNTO PLACA".
  const ignorar = new Set();
  const reIgnorar = /(?:CONJUNTO\s+PLACA|PLACA)\s*:?\s*([A-Z0-9]{7,17})\b/gi;
  let m;
  while ((m = reIgnorar.exec(obs)) !== null) ignorar.add(m[1].toUpperCase());

  // Varre o texto inteiro das observações, e não linha a linha: quando o PDF
  // é montado, uma linha de carro pode acabar grudada na do CIOT ou do
  // seguro. Filtrando por linha, esses carros sumiam.
  const encontrados = [];
  _DACTE_RE_ID.lastIndex = 0;
  let t;
  while ((t = _DACTE_RE_ID.exec(obs)) !== null) {
    const id = t[0].toUpperCase();
    if (ignorar.has(id)) continue;
    if (encontrados.includes(id)) continue;
    encontrados.push(id);
  }
  return encontrados;
}

function _dacteNumeroCte(texto) {
  // "NÚMERO 59471" é o rótulo oficial do quadro do DACTE
  let m = texto.match(/N[ÚU]MERO\s+(\d{1,9})\b/i);
  if (m) return m[1];
  m = texto.match(/CT-e\s+(\d{3,9})\b/i);
  return m ? m[1] : null;
}

function _dacteChaveAcesso(texto) {
  // A chave vem em 11 blocos de 4 dígitos separados por espaço.
  // O espaço é obrigatório: sem ele, a busca acaba pegando pedaços de
  // inscrição estadual e protocolo, que também são sequências longas.
  let m = texto.match(/\b(\d{4}(?:\s+\d{4}){10})\b/);
  if (m) return m[1].replace(/\D/g, '');
  // Alguns emissores imprimem a chave sem separação
  m = texto.match(/Chave de acesso[\s\S]{0,80}?\b(\d{44})\b/i);
  return m ? m[1] : null;
}

function _dacteTomador(texto) {
  // O nome do tomador aparece após o rótulo, em outra posição do PDF.
  // Pegamos a primeira linha "de empresa" depois de TOMADOR.
  const i = texto.search(/\bTOMADOR\b/i);
  if (i === -1) return null;
  const depois = texto.slice(i, i + 1200).split('\n').map(l => l.trim());
  for (const linha of depois) {
    if (/^(TOMADOR|ENDERE|CNPJ|MUNIC|UF|PA[ÍI]S|FONE|CEP|INSC)/i.test(linha)) continue;
    if (/(LTDA|S\.?A\.?$|S\/A|EIRELI|ME$|MEI$|PARTICIPACOES)/i.test(linha)) return linha;
  }
  return null;
}

function _dacteTrecho(texto, rotulo) {
  // "INÍCIO DA PRESTAÇÃO 4108304 / PR - FOZ DO IGUACU"
  const re = new RegExp(rotulo + '[^\\n]*?\\d{7}\\s*\\/\\s*([A-Z]{2})\\s*-\\s*([^\\n]+)', 'i');
  const m = texto.match(re);
  if (!m) return null;
  return { uf: m[1].toUpperCase(), cidade: m[2].trim() };
}

/**
 * Lê o texto de um DACTE e devolve os campos.
 * @param {string} texto - texto extraído do PDF
 */
function lerDacteDeTexto(texto) {
  if (!texto) return null;
  const t = texto.replace(/\r/g, '');
  return {
    numeroCte: _dacteNumeroCte(t),
    chave: _dacteChaveAcesso(t),
    tomador: _dacteTomador(t),
    origem: _dacteTrecho(t, 'IN[ÍI]CIO\\s+DA\\s+PRESTA[ÇC][ÃA]O'),
    destino: _dacteTrecho(t, 'T[ÉE]RMINO\\s+DA\\s+PRESTA[ÇC][ÃA]O'),
    placas: _dactePlacasDosCarros(t)
  };
}


/* =========================================================================
   PDF com VÁRIOS CT-es
   Um mesmo arquivo pode ter 1 CT-e (carro avulso) ou vários (carga fechada).
   Cada DACTE ocupa uma ou mais páginas e repete o mesmo "NÚMERO" em todas
   ("FL 1/2", "FL 2/2"). Então agrupamos as páginas pelo número do CT-e:
   páginas seguidas com o mesmo número são o mesmo documento.
   ========================================================================= */

/**
 * @param {string[]} paginas - texto de cada página, na ordem
 * @returns {Array} um objeto por CT-e encontrado
 */
function lerDactesDePaginas(paginas) {
  if (!Array.isArray(paginas) || paginas.length === 0) return [];

  const blocos = [];
  let atual = null;

  paginas.forEach((textoPag, i) => {
    const num = _dacteNumeroCte(textoPag);

    // Página sem número legível: trata como continuação da anterior
    if (!num && atual) { atual.texto += '\n' + textoPag; atual.paginas.push(i + 1); return; }
    if (!num) return;

    if (atual && atual.numero === num) {
      atual.texto += '\n' + textoPag;
      atual.paginas.push(i + 1);
    } else {
      atual = { numero: num, texto: textoPag, paginas: [i + 1] };
      blocos.push(atual);
    }
  });

  return blocos.map(b => {
    const dados = lerDacteDeTexto(b.texto);
    return { ...dados, paginas: b.paginas };
  });
}

/**
 * Lê um arquivo PDF (File/Blob) e devolve os CT-es encontrados.
 * Exige o pdf.js carregado na página (window.pdfjsLib).
 */
async function lerDactePdf(arquivo) {
  if (!window.pdfjsLib) throw new Error('pdf.js não carregado.');
  const buffer = await arquivo.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;

  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pag = await pdf.getPage(n);
    const conteudo = await pag.getTextContent();

    // Reconstrói as linhas pela posição vertical: o pdf.js devolve pedaços
    // soltos, e sem remontar as linhas os rótulos se misturam aos valores.
    const linhas = {};
    conteudo.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      (linhas[y] = linhas[y] || []).push({ x: it.transform[4], s: it.str });
    });
    const texto = Object.keys(linhas)
      .sort((a, b) => b - a)
      .map(y => linhas[y].sort((a, b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');

    paginas.push(texto);
  }
  return lerDactesDePaginas(paginas);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { lerDacteDeTexto, lerDactesDePaginas };  // usado só nos testes
}

/* =========================================================================
   TELA DE CONFERÊNCIA
   Lê o(s) PDF(s), casa as placas com os carros da viagem e mostra o
   resultado para o fiscal conferir. Só grava depois da confirmação.
   ========================================================================= */

// _fiscalGruposPorRota é declarado em mod-11.js (quem preenche).
window._fiscalGruposPorRota = window._fiscalGruposPorRota || {};
var _dacteResultado = null;

function _normPlaca(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function _dacteAbrirLeitor(rotaId) {
  const grupos = window._fiscalGruposPorRota[rotaId] || [];
  if (!grupos.length) { alert('Nenhum carro nesta viagem para casar com o CT-e.'); return; }

  const div = document.createElement('div');
  div.id = 'dacteOverlay';
  div.className = 'dacte-overlay';
  div.innerHTML = `
    <div class="dacte-painel">
      <div class="dacte-topo">
        <strong>📄 Ler DACTE e preencher CT-es</strong>
        <button class="dacte-fechar" onclick="_dacteFechar()">✕</button>
      </div>
      <div class="dacte-corpo" id="dacteCorpo">
        <p class="text-muted" style="font-size:.85rem">
          Selecione os PDFs dos DACTEs. Pode ser um arquivo com vários CT-es
          ou vários arquivos — o sistema lê todos e casa pela placa do carro.
        </p>
        <input type="file" id="dacteArquivos" accept="application/pdf" multiple
               onchange="_dacteProcessar(${rotaId})"
               style="margin:10px 0;font-size:.85rem">
      </div>
    </div>`;
  document.body.appendChild(div);
}

function _dacteFechar() {
  const el = document.getElementById('dacteOverlay');
  if (el) el.remove();
  _dacteResultado = null;
}

async function _dacteProcessar(rotaId) {
  const corpo = document.getElementById('dacteCorpo');
  const arquivos = [...(document.getElementById('dacteArquivos')?.files || [])];
  if (!arquivos.length) return;

  corpo.innerHTML = '<p style="font-size:.9rem">⏳ Lendo os documentos...</p>';

  let ctes = [];
  const falhas = [];
  for (const arq of arquivos) {
    try {
      const lidos = await lerDactePdf(arq);
      lidos.forEach(c => ctes.push({ ...c, arquivo: arq.name }));
    } catch (e) {
      falhas.push(`${arq.name}: ${e.message || e}`);
    }
  }

  if (!ctes.length) {
    corpo.innerHTML = `<p style="color:#f59e0b;font-size:.88rem">
      Não consegui ler nenhum CT-e.${falhas.length ? '<br><span style="font-size:.78rem">' + falhas.join('<br>') + '</span>' : ''}
      <br><br>Se o PDF for escaneado (imagem), a leitura automática não funciona — nesse caso digite os números à mão.</p>`;
    return;
  }

  const grupos = window._fiscalGruposPorRota[rotaId] || [];
  const linhas = [];

  ctes.forEach(cte => {
    // Um CT-e pode cobrir vários carros: procura todo grupo que tenha
    // pelo menos uma das placas lidas.
    const alvos = grupos.filter(g => g.placas.some(pl => cte.placas.includes(pl)));
    const achadas = cte.placas.filter(pl => grupos.some(g => g.placas.includes(pl)));
    const perdidas = cte.placas.filter(pl => !achadas.includes(pl));
    linhas.push({ cte, alvos, perdidas });
  });

  _dacteResultado = { rotaId, linhas };

  const totalOk = linhas.filter(l => l.alvos.length).length;

  corpo.innerHTML = `
    <div class="dacte-resumo">
      Li <strong>${ctes.length}</strong> CT-e(s) · <strong>${totalOk}</strong> com carro correspondente nesta viagem.
    </div>
    <table class="dacte-tabela">
      <thead><tr><th>CT-e</th><th>Tomador</th><th>Trecho</th><th>Placas</th><th>Situação</th></tr></thead>
      <tbody>
        ${linhas.map((l, i) => {
          const c = l.cte;
          const ok = l.alvos.length > 0;
          return `<tr>
            <td><strong>${c.numeroCte || '—'}</strong><br>
                <span class="dacte-mini">${c.arquivo}</span></td>
            <td class="dacte-mini">${c.tomador || '—'}</td>
            <td class="dacte-mini">${c.origem ? c.origem.cidade : '—'} → ${c.destino ? c.destino.cidade : '—'}</td>
            <td class="dacte-mini">${c.placas.join(', ') || '—'}</td>
            <td>${ok
              ? `<span style="color:#22c55e">✅ ${l.alvos.length} grupo(s)</span>`
              : '<span style="color:#f59e0b">⚠️ nenhum carro desta viagem</span>'}
              ${l.perdidas.length ? `<br><span class="dacte-mini" style="color:#f59e0b">fora da viagem: ${l.perdidas.join(', ')}</span>` : ''}
              <label class="dacte-mini" style="display:block;margin-top:4px">
                <input type="checkbox" id="dacteUsar_${i}" ${ok ? 'checked' : 'disabled'}> aplicar
              </label>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${falhas.length ? `<p class="dacte-mini" style="color:#f59e0b">${falhas.join('<br>')}</p>` : ''}
    <div class="dacte-acoes">
      <button class="btn btn-secondary btn-sm" onclick="_dacteFechar()">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="_dacteAplicar()">✅ Preencher os CT-es marcados</button>
    </div>`;
}

async function _dacteAplicar() {
  if (!_dacteResultado) return;
  const { linhas } = _dacteResultado;

  // Um grupo só pode receber um CT-e: se dois documentos apontarem para o
  // mesmo grupo, avisa em vez de sobrescrever em silêncio.
  const destino = {};
  const conflitos = [];

  linhas.forEach((l, i) => {
    if (!document.getElementById(`dacteUsar_${i}`)?.checked) return;
    l.alvos.forEach(g => {
      if (destino[g.chave] && destino[g.chave].numero !== l.cte.numeroCte) {
        conflitos.push(`${g.chave}: CT-e ${destino[g.chave].numero} e ${l.cte.numeroCte}`);
      }
      destino[g.chave] = { numero: l.cte.numeroCte, ids: g.ids };
    });
  });

  if (conflitos.length) {
    alert('Dois CT-es diferentes apontam para o mesmo grupo de carros:\n\n'
      + conflitos.join('\n')
      + '\n\nConfira os documentos e tente de novo.');
    return;
  }

  const chaves = Object.keys(destino);
  if (!chaves.length) { alert('Nenhum CT-e marcado para aplicar.'); return; }

  let gravados = 0;
  for (const chave of chaves) {
    const { numero, ids } = destino[chave];
    try {
      if (typeof _salvarNumeroCteGrupoValor === 'function') {
        await _salvarNumeroCteGrupoValor(chave, ids, numero);
      }
      const campo = document.getElementById(`cteNum_${chave}`);
      if (campo) campo.value = numero;
      gravados++;
    } catch (e) {
      console.error('Falha ao gravar CT-e do grupo', chave, e);
    }
  }

  _dacteFechar();
  if (typeof exibirMensagem === 'function') {
    exibirMensagem('mensagemFiscal', `✅ ${gravados} CT-e(s) preenchidos automaticamente.`, 'success');
  }
}
