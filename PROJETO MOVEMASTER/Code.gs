// ============================================
// GOOGLE APPS SCRIPT - INTEGRAÇÃO COM SHEETS
// ============================================

function doGet() {
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setWidth(1200)
    .setHeight(800)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  return html;
}

// ============================================
// OBTER DADOS DO SHEETS
// ============================================

function obterDadosDoSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  const dados = {
    clientes: obterListaDoSheets('⚙️ Configurações', 'A:A'),
    motoristas: obterListaDoSheets('⚙️ Configurações', 'B:B'),
    cegonhas: obterListaDoSheets('⚙️ Configurações', 'C:C'),
    pedidos: obterPedidosDoSheets()
  };
  
  return dados;
}

function obterListaDoSheets(nomePlanilha, coluna) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomePlanilha);
    if (!sheet) return [];
    
    const range = sheet.getRange(coluna);
    const valores = range.getValues();
    
    // Filtrar valores vazios e remover duplicatas
    return valores
      .flat()
      .filter(v => v && v.toString().trim() !== '')
      .filter((v, i, a) => a.indexOf(v) === i);
  } catch (e) {
    Logger.log('Erro ao obter lista: ' + e.toString());
    return [];
  }
}

function obterPedidosDoSheets() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('🗄️ BD_Pedidos');
    if (!sheet) return [];
    
    const dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) return []; // Apenas cabeçalho
    
    const cabecalho = dados[0];
    const pedidos = [];
    
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const pedido = {};
      
      cabecalho.forEach((col, index) => {
        pedido[col] = linha[index];
      });
      
      pedidos.push(pedido);
    }
    
    return pedidos;
  } catch (e) {
    Logger.log('Erro ao obter pedidos: ' + e.toString());
    return [];
  }
}

// ============================================
// SALVAR PEDIDO NO SHEETS
// ============================================

function salvarPedidoNoSheets(pedido) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBD = spreadsheet.getSheetByName('🗄️ BD_Pedidos');
    
    if (!sheetBD) {
      return {
        sucesso: false,
        erro: 'Planilha BD_Pedidos não encontrada'
      };
    }
    
    // Gerar ID do pedido
    const ultimaLinha = sheetBD.getLastRow();
    const novoID = ultimaLinha > 1 ? ultimaLinha : 1;
    
    // Preparar dados para inserção
    const novaLinha = [
      novoID,                           // ID do Pedido
      new Date(),                       // Data de Inserção
      pedido.cliente,                   // Cliente
      pedido.dataSolicitacao,           // Data de Solicitação
      pedido.modelo,                    // Modelo
      pedido.placa,                     // Placa
      pedido.cidadeOrigem,              // Cidade Origem
      pedido.ufOrigem,                  // UF Origem
      pedido.cidadeDestino,             // Cidade Destino
      pedido.ufDestino,                 // UF Destino
      pedido.enderecoColeta,            // Endereço Coleta
      pedido.enderecoEntrega,           // Endereço Entrega
      pedido.valorFrete,                // Valor do Frete
      pedido.responsavelComercial,      // Responsável Comercial
      'Pendente',                       // Status
      '',                               // Rota
      '',                               // Motorista 1
      '',                               // % Motorista 1
      '',                               // Motorista 2
      '',                               // % Motorista 2
      '',                               // Placa Cegonha
      '',                               // Data Previsão Coleta
      ''                                // Data Previsão Entrega
    ];
    
    // Inserir nova linha
    sheetBD.appendRow(novaLinha);
    
    return {
      sucesso: true,
      id: novoID,
      pedido: Object.assign({}, pedido, { id: novoID, status: 'Pendente' })
    };
  } catch (e) {
    return {
      sucesso: false,
      erro: e.toString()
    };
  }
}

// ============================================
// ATUALIZAR PEDIDO NO SHEETS
// ============================================

function atualizarPedidoNoSheets(pedidoID, alteracoes) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBD = spreadsheet.getSheetByName('🗄️ BD_Pedidos');
    
    if (!sheetBD) {
      return {
        sucesso: false,
        erro: 'Planilha BD_Pedidos não encontrada'
      };
    }
    
    const dados = sheetBD.getDataRange().getValues();
    const cabecalho = dados[0];
    
    // Encontrar a linha do pedido
    let linhaEncontrada = -1;
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] == pedidoID) {
        linhaEncontrada = i + 1; // +1 porque getRange usa índice 1-based
        break;
      }
    }
    
    if (linhaEncontrada === -1) {
      return {
        sucesso: false,
        erro: 'Pedido não encontrado'
      };
    }
    
    // Mapear índices das colunas
    const indiceRota = cabecalho.indexOf('Rota');
    const indiceMotorista1 = cabecalho.indexOf('Motorista 1');
    const indicePercent1 = cabecalho.indexOf('% Motorista 1');
    const indiceMotorista2 = cabecalho.indexOf('Motorista 2');
    const indicePercent2 = cabecalho.indexOf('% Motorista 2');
    const indicePlacaCegonha = cabecalho.indexOf('Placa Cegonha');
    const indiceDataColeta = cabecalho.indexOf('Data Previsão Coleta');
    const indiceDataEntrega = cabecalho.indexOf('Data Previsão Entrega');
    const indiceStatus = cabecalho.indexOf('Status');
    
    // Atualizar valores
    if (indiceRota !== -1) sheetBD.getRange(linhaEncontrada, indiceRota + 1).setValue(alteracoes.rota);
    if (indiceMotorista1 !== -1) sheetBD.getRange(linhaEncontrada, indiceMotorista1 + 1).setValue(alteracoes.motorista1);
    if (indicePercent1 !== -1) sheetBD.getRange(linhaEncontrada, indicePercent1 + 1).setValue(alteracoes.percentMotorista1);
    if (indiceMotorista2 !== -1) sheetBD.getRange(linhaEncontrada, indiceMotorista2 + 1).setValue(alteracoes.motorista2 || '');
    if (indicePercent2 !== -1) sheetBD.getRange(linhaEncontrada, indicePercent2 + 1).setValue(alteracoes.percentMotorista2 || 0);
    if (indicePlacaCegonha !== -1) sheetBD.getRange(linhaEncontrada, indicePlacaCegonha + 1).setValue(alteracoes.placaCegonha);
    if (indiceDataColeta !== -1) sheetBD.getRange(linhaEncontrada, indiceDataColeta + 1).setValue(alteracoes.dataPrevColeta);
    if (indiceDataEntrega !== -1) sheetBD.getRange(linhaEncontrada, indiceDataEntrega + 1).setValue(alteracoes.dataPrevEntrega);
    if (indiceStatus !== -1) sheetBD.getRange(linhaEncontrada, indiceStatus + 1).setValue(alteracoes.status);
    
    return {
      sucesso: true,
      mensagem: 'Pedido atualizado com sucesso'
    };
  } catch (e) {
    return {
      sucesso: false,
      erro: e.toString()
    };
  }
}

// ============================================
// CALCULAR FATURAMENTO
// ============================================

function calcularFaturamentoPorMotorista() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBD = spreadsheet.getSheetByName('🗄️ BD_Pedidos');
    
    if (!sheetBD) {
      return [];
    }
    
    const dados = sheetBD.getDataRange().getValues();
    const cabecalho = dados[0];
    
    const indiceMotorista1 = cabecalho.indexOf('Motorista 1');
    const indicePercent1 = cabecalho.indexOf('% Motorista 1');
    const indiceMotorista2 = cabecalho.indexOf('Motorista 2');
    const indicePercent2 = cabecalho.indexOf('% Motorista 2');
    const indiceValor = cabecalho.indexOf('Valor do Frete');
    
    const faturamento = {};
    
    for (let i = 1; i < dados.length; i++) {
      const motorista1 = dados[i][indiceMotorista1];
      const percent1 = dados[i][indicePercent1];
      const motorista2 = dados[i][indiceMotorista2];
      const percent2 = dados[i][indicePercent2];
      const valor = dados[i][indiceValor];
      
      if (motorista1 && percent1) {
        if (!faturamento[motorista1]) {
          faturamento[motorista1] = 0;
        }
        faturamento[motorista1] += valor * (percent1 / 100);
      }
      
      if (motorista2 && percent2) {
        if (!faturamento[motorista2]) {
          faturamento[motorista2] = 0;
        }
        faturamento[motorista2] += valor * (percent2 / 100);
      }
    }
    
    return faturamento;
  } catch (e) {
    Logger.log('Erro ao calcular faturamento: ' + e.toString());
    return {};
  }
}
