// Divisão de frete por km — trabalha em CENTAVOS para não ter erro de float.
// Sobra de centavos vai para o último trecho, então a soma bate exatamente.
function dividirFretePorKm(freteCentavos, trechos) {
    const kms = trechos.map(t => Math.max(0, Number(t.km) || 0));
    const kmTotal = kms.reduce((s, k) => s + k, 0);
    const n = trechos.length;
    let valores;
    if (kmTotal <= 0) {
        // Sem km ainda: divide igualmente (placeholder até digitarem os km)
        const base = Math.floor(freteCentavos / n);
        valores = Array(n).fill(base);
    } else {
        valores = kms.map(k => Math.floor(freteCentavos * k / kmTotal));
    }
    const alocado = valores.reduce((s, v) => s + v, 0);
    const resto = freteCentavos - alocado;
    if (n > 0) valores[n - 1] += resto; // sobra no último
    return valores;
}

// helpers de teste
const reais = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
function testar(nome, freteR, trechos, esperado) {
    const cent = Math.round(freteR * 100);
    const out = dividirFretePorKm(cent, trechos);
    const soma = out.reduce((s, v) => s + v, 0);
    const ok = soma === cent && (!esperado || JSON.stringify(out) === JSON.stringify(esperado));
    console.log(`${ok ? '✅' : '❌'} ${nome}: [${out.map(reais).join(', ')}] soma=${reais(soma)} (frete=${reais(cent)})`);
    if (!ok && esperado) console.log('   esperado:', esperado.map(reais));
}

testar('2 trechos 300/200km de R$1000', 1000, [{km:300},{km:200}], [60000,40000]);
testar('3 trechos iguais 100km de R$1000 (resto)', 1000, [{km:100},{km:100},{km:100}]);
testar('1 trecho direto R$850', 850, [{km:420}]);
testar('sem km ainda (igual) 3x de R$999,99', 999.99, [{km:0},{km:0},{km:0}]);
testar('valores quebrados 137/263/91 de R$1234,56', 1234.56, [{km:137},{km:263},{km:91}]);

module.exports = { dividirFretePorKm };
