# MoveMaster modular v324

## Aplicar
1. Copie `app/modules/` inteira para o repositório
2. Substitua `app/index.html` e `app/sw.js`
3. Mantenha `script.js` antigo como backup por alguns dias
4. Commit + push

## Correções inclusas
- Bug `forceFull` (recursão infinita) → chama `carregarDadosDoSupabase()`
- `verificarDocumentoUnico` compara CNPJ/CPF só por dígitos (máscara não atrapalha)

## Teste
Login, status, alocação, cadastro cliente, F12 sem erros.
