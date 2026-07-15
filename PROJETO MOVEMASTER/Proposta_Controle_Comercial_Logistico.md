# Reestruturação do controle comercial e logístico
### Transporte fracionado de veículos (0km e seminovos)

---

## 1. Diagnóstico: qual é o problema de verdade

A planilha atual não é um problema de "falta de fórmula". É um problema de **modelagem**. Hoje existe uma tabela só, orientada à *viagem do motorista* (cabeçalho com motorista, cegonha, data e rota + lista de veículos embaixo). Isso gera quatro consequências, todas que vocês já sentem:

| Sintoma relatado | Causa raiz |
|---|---|
| Muito copiar e colar | A mesma informação (cliente, endereço, motorista) é redigitada em toda viagem em vez de vir de um cadastro |
| Não guarda histórico | A linha é sobrescrita. Não existe registro de "era assim, virou assim, quem mudou" |
| Suscetível a erro | Não há tabela estruturada, nem validação, nem chave única. Nada impede o mesmo chassi em duas cargas |
| Não fecha faturamento do motorista | A planilha assume que **1 veículo = 1 motorista**. No fracionado com transbordo, isso é falso |

**O ponto central da reestruturação:** a unidade de controle não é a viagem — é o **veículo (chassi)**. É o veículo que tem frete, prazo, status, seguro, checklist, ocorrência e CT-e. A viagem/carga é só o agrupamento de veículos que um executante levou em um pedaço do caminho.

---

## 2. Modelo de dados proposto

Nove tabelas ligadas por chave, em vez de uma planilhona.

**Cadastros (digita uma vez, usa sempre)**
1. **CLIENTES** — CNPJ, contato, prazo de pagamento, tabela de preço
2. **LOCAIS** — concessionárias e pátios: endereço, horário de recebimento, restrições, contato
3. **MOTORISTAS** (inclui agregados e terceiros) — vínculo, CNH e validade, **regra de remuneração** e parâmetro
4. **CEGONHAS** — cavalo, carreta, capacidade de vagas, própria ou de terceiro

**Movimento**

5. **PEDIDOS** *(comercial)* — cliente, data da solicitação, **responsável comercial que lançou**, solicitante do cliente, status comercial, prazo prometido
6. **ITENS_PEDIDO** *(1 linha por veículo — o coração)* — chassi, placa, modelo, tipo (0km/seminovo), **valor FIPE**, origem, destino, **valor do frete**, status operacional e todas as datas (confirmação de rota, previsão e realização de coleta e entrega)
7. **CARGAS** *(logística)* — data programada, cegonha, motorista/terceiro, **responsável pela montagem da rota**, tipo de operação (frota ou terceiro), status
8. **TRECHOS** *(a peça que hoje não existe)* — liga veículo ↔ carga ↔ executante, com km e peso do rateio
9. **CHECKLIST**, **OCORRENCIAS**, **HISTORICO_LOG** — apoio e auditoria

---

## 3. O rateio do faturamento do motorista (o que você pediu)

O problema: *"nem sempre o motorista faz o transporte total do veículo; pode ser dividido com um terceiro ou com outro motorista da rota, e cada um recebe sua parte."*

A solução é separar **dois conceitos que hoje estão colados**:

**a) Rateio da RECEITA** — quanto do frete daquele veículo "pertence" a cada pedaço do caminho.
Padrão sugerido: **proporcional ao km rodado no trecho**. Simples, auditável e difícil de contestar. O modelo permite sobrescrever o percentual manualmente quando a negociação for outra (50/50, por exemplo), com uma trava: a soma dos trechos de um veículo **tem que fechar 100%**, senão a linha acusa "REVISAR".

**b) REMUNERAÇÃO do executante** — quanto essa pessoa/empresa recebe pelo trecho que fez. Três regras cobrem praticamente tudo:
- `%_FRETE` → % sobre a receita do trecho (típico de agregado e terceiro)
- `R$/KM` → valor por km rodado (típico de motorista de frota)
- `FIXO_VEICULO` → valor fechado por veículo transportado

**Exemplo real, já montado na planilha (veículo IT-001, frete R$ 1.400, Campinas → Cascavel):**

| Trecho | Executante | Km | Peso | Receita do trecho | Regra | A receber |
|---|---|---|---|---|---|---|
| Campinas → Registro | João (frota) | 400 | 47,1% | R$ 658,82 | 12% do frete | **R$ 79,06** |
| Registro → Cascavel | Cegonha Sul (terceiro) | 450 | 52,9% | R$ 741,18 | 70% do frete | **R$ 518,82** |
| | | 850 | **100%** | R$ 1.400,00 | | R$ 597,88 |

A partir daí, tudo se resolve sozinho: faturamento do motorista no mês, custo por carga, margem por veículo, margem por cliente, quanto foi pago a terceiros.

---

## 4. Status e responsáveis (o que a reunião levantou)

**Status do veículo:** `AGUARDANDO_ROTA` → `EM_ROTA` → `ROTA_CONFIRMADA` → `COLETADO` → `EM_TRANSITO` → `ENTREGUE` → `FATURADO` (ou `CANCELADO`)

Cada mudança de status carimba data, hora e usuário. É isso que resolve, de uma vez:
- em qual rota o veículo está e se a rota já foi confirmada;
- data de confirmação, data de coleta, previsão de entrega;
- **lembrete ao comercial**: todo veículo em `ROTA_CONFIRMADA` com coleta prevista para D+1 dispara aviso ao responsável comercial para confirmar que o carro está no local. Isso é uma regra automática, não um post-it;
- **quem fez o quê**: `RESPONSAVEL_COMERCIAL` no pedido, `RESPONSAVEL_LOGISTICA` na carga.

---

## 5. Onde cada item do backlog é atendido

| Necessidade levantada | Onde resolve |
|---|---|
| Pedido registrado como histórico | `HISTORICO_LOG` + status com data/hora (automático só em sistema) |
| Cadastro do cliente | `CLIENTES` |
| Responsável por quem pegou/inseriu o pedido | `PEDIDOS.RESPONSAVEL_COMERCIAL` |
| Painel de rota e motorista | `PAINEL` + `CARGAS` |
| Responsável pela montagem da rota | `CARGAS.RESPONSAVEL_LOGISTICA` |
| Rota quando terceiro e quando frota | `CARGAS.TIPO_OPERACAO` + `MOTORISTAS.VINCULO` |
| Status do pedido, datas de confirmação, coleta e previsão de entrega | `ITENS_PEDIDO` (status + 5 campos de data) |
| Lembrete ao comercial sobre confirmação do carro no local | Regra automática sobre status `ROTA_CONFIRMADA` |
| Confirmação de realização do checklist | `CHECKLIST` + flags em `CARGAS` |
| Campo de ocorrência por veículo, com histórico por cliente | `OCORRENCIAS` (chaveada por `ID_ITEM` e `ID_CLIENTE`) |
| Romaneio de coleta e entrega | `ROMANEIO` (gerado de `CARGAS` + `TRECHOS`) |
| Seguro pela tabela FIPE buscando pela placa | `ITENS_PEDIDO.VALOR_FIPE` × taxa. **Requer API de consulta placa→FIPE — não existe em planilha** |
| Cadastro de motorista e veículo | `MOTORISTAS` + `CEGONHAS` |
| Cálculo de faturamento por motorista | `FATURAMENTO_MOTORISTA` (via `TRECHOS`) |
| Finalização do transporte com checklist | Status `ENTREGUE` só libera com checklist de entrega concluído |
| Espelho de informação para emissão de CT-e | `ITENS_PEDIDO` já tem os 100% dos campos: cliente, origem/UF, destino/UF, modelo, chassi/placa, valor |

---

## 6. Ferramenta: o que eu recomendaria

A planilha anexa **é o modelo de dados executável**. Ela serve para duas coisas: rodar como controle de transição já no mês que vem, e servir de especificação para quem for construir o sistema. Mas ela **não resolve** três coisas, e é honesto dizer isso ao cliente:

- **histórico automático** (em planilha, o log depende de alguém digitar — ninguém digita);
- **permissão por perfil** (comercial não deveria editar o rateio da logística);
- **alertas e checklist em campo com foto** (o motorista não vai abrir Excel no pátio).

**Caminho sugerido, em três ondas:**

| Onda | O quê | Prazo típico |
|---|---|---|
| **1 — agora** | Migrar para o modelo relacional. Congelar o "copia e cola". Cadastros preenchidos, status disciplinado, rateio por trecho rodando | 2 a 4 semanas |
| **2 — curto prazo** | Subir o mesmo modelo em uma plataforma low-code (AppSheet, Ninox, Baserow/Airtable) ou banco + front. Ganha histórico automático, permissão, app de checklist no celular com foto e assinatura, alertas | 1 a 3 meses |
| **3 — fiscal** | CT-e, averbação e seguro precisam de um TMS ou de integração fiscal. Aqui a decisão é comprar um TMS com módulo de cegonha e integrar, ou integrar um emissor de CT-e ao sistema próprio | conforme volume |

Se a empresa emite CT-e em volume relevante, provavelmente vale avaliar um TMS de mercado já na onda 2, usando este modelo como checklist de aderência — em vez de construir do zero e depois descobrir o custo do fiscal.

---

## 7. Decisões que precisam ser tomadas com o cliente antes de construir

1. **Rateio padrão**: por km é o default proposto. É assim que eles pensam hoje, ou o critério real é outro (número de veículos, valor da diária)?
2. **A remuneração do motorista incide sobre o frete cheio ou sobre o frete menos custos** (pedágio, combustível, avaria)? Isso muda a fórmula.
3. **Avaria**: quando o veículo passa por dois executantes, de quem é a responsabilidade? O checklist de transbordo é o que define isso — e por isso ele precisa existir.
4. **Quem pode alterar valor de frete depois da rota fechada?** Sugestão: ninguém sem log.
5. **FIPE por placa**: precisa contratar uma API de consulta. Definir se a base é FIPE mesmo ou nota fiscal (para 0km, o valor da NF costuma ser o correto para seguro).
