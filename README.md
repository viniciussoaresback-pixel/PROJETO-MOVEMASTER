# 🚚 MoveMaster — Controle Logístico e Comercial

Sistema interno desenvolvido para centralizar e otimizar a **operação comercial e logística** da empresa: pedidos, rotas, alocação de frota, faturamento, fiscal (CTE), manutenção e acompanhamento em tempo real.

> **Status:** Em produção  
> **Deploy:** [projeto-movemaster.vercel.app](https://projeto-movemaster.vercel.app)  
> **Build:** v326 · Service Worker v327

---

## 📋 Visão Geral

O MoveMaster é uma aplicação web (PWA) que substitui planilhas e processos manuais por um fluxo digital completo, com controle de acesso por perfil e interface otimizada tanto para desktop quanto para celular (motoristas e equipes de campo).

### Principais módulos de negócio

| Módulo | Descrição |
|--------|-----------|
| **Comercial** | Criação de pedidos, reservas com timer, orçamentos, confirmações e acompanhamento de viagens |
| **Logística** | Alocação de motoristas/veículos, rotas, corredores, status de coleta/entrega e last-mile |
| **Painel** | Acompanhamento em tempo real de cargas e operações |
| **Fiscal** | Área de documentos fiscais (CTE) e espelhamento |
| **Financeiro** | Faturamento, tabela de frete, remuneração por trecho, cobrança, conferência e relatórios |
| **Cadastros** | Clientes, motoristas, veículos, equipes e corredores |
| **Manutenção** | Agendamentos e controle de oficina |
| **EPI / Uniforme** | Solicitação e controle de equipamentos |
| **Diretoria** | Dashboard executivo com indicadores, faturamento, frota e performance comercial |
| **Equipes** | Gestão de coletas e entregas por equipes de campo |
| **Motorista** | App de campo (cargas, foto de placa, ocorrências) |

---

## 👥 Perfis de Acesso

| Perfil | Acesso principal |
|--------|------------------|
| **Administrador** | Acesso total + gestão de usuários |
| **Comercial** | Pedidos, viagens, orçamentos, cobrança, cadastros |
| **Logística** | Painel, alocação, rotas, equipes |
| **Financeiro** | Conferência, frete, remuneração, relatórios, EPI |
| **Fiscal** | Área fiscal (CTE), pedidos e painel |
| **Diretoria** | Dashboard executivo |
| **Manutenção** | Oficina e agendamentos |
| **Equipe** | Coletas e entregas |
| **Motorista** | App de campo (cargas e ocorrências) |

Login aceita **e-mail, CPF ou telefone**.

---

## 🛠️ Stack Tecnológica

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Backend / Banco:** [Supabase](https://supabase.com) (Auth + PostgreSQL + Edge Functions)
- **PWA:** Service Worker + Manifest (instalável no celular)
- **Deploy:** Vercel
- **APIs externas:** IBGE (estados e municípios)
- **Extras:** Temas claro/escuro, toasts, gráficos, exportação (CSV/PDF), importação Excel (Evo)

---

## 📁 Estrutura do Projeto

```text
PROJETO-MOVEMASTER/
└── app/
    ├── index.html                 # Página principal (carrega os módulos em ordem)
    ├── modules/
    │   ├── mod-01.js              # Core: globals, performance, init, dados
    │   ├── mod-02.js … mod-12.js  # Lógica da aplicação (carregar nesta ordem)
    │   └── …
    ├── supabase-config.js         # Auth, perfis e permissões
    ├── styles.css                 # Estilos base
    ├── refinamento*.css           # Refinamentos de UI / tema
    ├── graficos.js / graficos-core.js
    ├── toasts.js / exportar.js / split.js
    ├── sw.js                      # Service Worker (PWA) — rede primeiro
    ├── manifest.json
    ├── vercel.json                # Headers de cache
    └── ícones / logos
```

> A lógica que antes ficava em um único `script.js` foi **dividida em 12 módulos** (`mod-01` … `mod-12`).  
> A ordem dos `<script>` no `index.html` é **obrigatória** — não reordene.

### Performance (front)

Após ações (status, alocação, etc.), o app evita recarregar o sistema inteiro:

- atualização local em memória (`atualizarPedidoLocal` / `upsertPedidoLocal`)
- ou reload **leve** só de pedidos/rotas (`somentePedidos`)
- reload completo (`forceFull`) apenas quando necessário (ex.: cadastros)

---

## 🚀 Como rodar localmente

### Pré-requisitos

- Conta no Supabase com o projeto e tabelas configurados
- Navegador moderno

### Passos

1. Clone o repositório:

```bash
git clone https://github.com/viniciussoaresback-pixel/PROJETO-MOVEMASTER.git
cd PROJETO-MOVEMASTER/app
```

2. Configure as credenciais em `supabase-config.js`:

```js
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'sua-anon-key';
```

3. Suba um servidor local (não abra o HTML só como arquivo):

```bash
python -m http.server 5500
# ou Live Server no VS Code
```

4. Acesse `http://localhost:5500`

> O sistema depende de Auth, tabelas e **RLS** no Supabase. Sem isso, login e dados não funcionam.

---

## 🔐 Segurança

- Autenticação via Supabase Auth
- Controle de acesso por perfil no frontend (menu e fluxos)
- Row Level Security (RLS) no Postgres — acesso anônimo às tabelas críticas deve permanecer desabilitado
- Service Worker **não** guarda dados do Supabase em cache
- Recuperação de senha por e-mail / CPF / telefone

---

## 📱 PWA

- Instalável na tela inicial (Android e iOS)
- Offline: esqueleto do app (HTML/CSS/JS dos módulos)
- Estratégia: **rede primeiro** — dados de operação sempre ao vivo quando há conexão
- Pensado para motoristas e equipes de campo

---

## 📦 Deploy (Vercel)

Configuração recomendada:

| Campo | Valor |
|--------|--------|
| **Root Directory** | `app` |
| **Build Command** | *(vazio — site estático)* |
| **Output Directory** | `.` |

O `vercel.json` já define headers de cache adequados para o Service Worker e os assets.

---

## 🗺️ Roadmap

- [x] Modularização do front (`modules/mod-01` … `mod-12`)
- [x] Melhorias de performance (reload leve / update local)
- [x] Fechamento de acesso anônimo em tabelas sensíveis (RLS)
- [ ] Organização dos módulos por domínio (comercial, logística, etc.)
- [ ] Documentação do schema do banco
- [ ] Testes automatizados dos fluxos críticos
- [ ] Paginação / filtros em listagens grandes
- [ ] RLS por perfil (motorista/equipe só vê o que é dele)

---

## 👨‍💻 Autor

Desenvolvido por **Vinicius Soares**  

Projeto interno da empresa — focado na operação real de logística e comercial.

---

## 📄 Licença

Uso interno / proprietário.  

Não é um projeto open-source destinado a redistribuição pública.
