# 🚚 MoveMaster — Controle Logístico e Comercial

Sistema interno desenvolvido para centralizar e otimizar a **operação comercial e logística** da empresa: pedidos, rotas, alocação de frota, faturamento, fiscal (CTE), manutenção e acompanhamento em tempo real.

> **Status:** Em produção  
> **Deploy:** [projeto-movemaster.vercel.app](https://projeto-movemaster.vercel.app)

---

## 📋 Visão Geral

O MoveMaster é uma aplicação web (PWA) que substitui planilhas e processos manuais por um fluxo digital completo, com controle de acesso por perfil e interface otimizada tanto para desktop quanto para celular (motoristas e equipes de campo).

### Principais módulos

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
| **Motorista** | Interface simplificada para motoristas (cargas, foto de placa, ocorrências) |

---

## 👥 Perfis de Acesso

O sistema possui controle de permissões por perfil:

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
- **Extras:** Temas claro/escuro, toasts, gráficos, exportação (CSV/PDF)

---

## 📁 Estrutura do Projeto

PROJETO-MOVEMASTER/
└── app/
├── index.html              # Página principal
├── script.js               # Lógica principal da aplicação
├── supabase-config.js      # Configuração e autenticação Supabase
├── styles.css              # Estilos base
├── refinamento*.css        # Refinamentos de UI
├── graficos.js / graficos-core.js
├── toasts.js
├── exportar.js
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # Manifesto PWA
├── vercel.json             # Configuração de headers (cache)
└── ícones / logos


---

## 🚀 Como rodar localmente

### Pré-requisitos
- Conta no Supabase com o projeto configurado
- Navegador moderno

### Passos

1. Clone o repositório:
```bash
git clone https://github.com/viniciussoaresback-pixel/PROJETO-MOVEMASTER.git
cd PROJETO-MOVEMASTER/app

const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'sua-anon-key';

--

🔐 Segurança

Autenticação via Supabase Auth
Controle de acesso por perfil (frontend + validação de sessão)
Row Level Security (RLS) no banco (deve estar configurado no Supabase)
Service Worker não armazena dados sensíveis do Supabase em cache
Recuperação de senha por e-mail / CPF / telefone

--

📱 PWA (Progressive Web App)
O MoveMaster pode ser instalado na tela inicial do celular:

Funciona offline no esqueleto da aplicação
Estratégia de cache: rede primeiro (dados sempre atualizados quando há conexão)
Otimizado para uso por motoristas e equipes de campo

--

📦 Deploy (Vercel)
O projeto está preparado para deploy na Vercel. O arquivo vercel.json já configura os headers de cache corretos para o Service Worker e assets.
Recomendação de configuração na Vercel:

Root Directory: app
Build Command: (deixar vazio — é estático)
Output Directory: .

--

🗺️ Roadmap / Melhorias futuras

 Modularização do script.js (quebra em módulos por domínio)
 Documentação completa do schema do banco
 Testes automatizados
 Melhorias de performance em listagens grandes
 Versionamento de API / Edge Functions

--

👨‍💻 Autor
Desenvolvido por Vinicius Soares

Projeto interno da empresa — focado em resolver a operação real de logística e comercial.

--

📄 Licença
Uso interno / proprietário.

Não é um projeto open-source destinado a redistribuição pública.

--

