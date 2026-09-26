/* ============================================================================
   MOVEMASTER — roteirizador.js
   Mapa da viagem (estilo "Roteirizar CT-e" do Atua): origem → destino mais
   longe, com as entregas do meio no caminho, a linha da estrada e a distância.

   - Aparece em Viagens em andamento (card "Rastreador da rota") e abre em tela
     cheia pelo botão "Roteirizar" — também logo depois de criar a viagem.
   - Origem = cidade de onde a carga sai (a mais comum entre os carros).
     Destino final = a cidade de destino MAIS DISTANTE da origem. Os demais
     destinos viram paradas no caminho, em ordem de distância.
   - Mapa: Leaflet + OpenStreetMap (sem chave). Coordenadas das cidades pelo
     Nominatim (OSM) e trajeto pela estrada pelo OSRM. Tudo com cache no
     navegador: cada cidade é buscada uma vez só.
   - Sem internet / serviço fora: mostra a linha reta entre as cidades e a
     distância aproximada. Nunca trava a tela da viagem.
   ============================================================================ */
(function () {
  'use strict';

  const LEAFLET_JS  = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const CHAVE_GEO   = 'mm_geo_cidades_v1';
  const CHAVE_ROTA  = 'mm_rota_osrm_v1';

  // ---------- utilidades ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  function lerCache(chave){ try { return JSON.parse(localStorage.getItem(chave) || '{}') || {}; } catch (e) { return {}; } }
  function gravarCache(chave, obj){ try { localStorage.setItem(chave, JSON.stringify(obj)); } catch (e) {} }

  function distKm(a, b){
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- Leaflet sob demanda ----------
  let _leafletProm = null;
  function carregarLeaflet(){
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (_leafletProm) return _leafletProm;
    _leafletProm = new Promise((ok, falha) => {
      if (!document.querySelector('link[data-mm-leaflet]')){
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = LEAFLET_CSS; l.setAttribute('data-mm-leaflet', '1');
        document.head.appendChild(l);
      }
      const s = document.createElement('script');
      s.src = LEAFLET_JS; s.async = true;
      s.onload = () => ok(window.L);
      s.onerror = () => { _leafletProm = null; falha(new Error('Leaflet não carregou')); };
      document.head.appendChild(s);
    });
    return _leafletProm;
  }

  // ---------- geocodificação (Nominatim, 1 req/s, com cache) ----------
  let _filaGeo = Promise.resolve();
  function geocodificar(cidade, uf){
    const chave = norm(cidade) + '/' + norm(uf);
    const cache = lerCache(CHAVE_GEO);
    if (cache[chave]) return Promise.resolve(cache[chave]);
    // Enfileira: o Nominatim pede no máximo 1 consulta por segundo
    const p = _filaGeo.then(async () => {
      const c2 = lerCache(CHAVE_GEO);
      if (c2[chave]) return c2[chave];
      const q = new URLSearchParams({ city: cidade, state: uf || '', country: 'Brazil', format: 'json', limit: '1' });
      let ponto = null;
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?' + q.toString(), { headers: { 'Accept-Language': 'pt-BR' } });
        const j = await r.json();
        if (j && j[0]) ponto = { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
        if (!ponto){
          // Sem estado (UF digitada errada, cidade com nome composto)
          const r2 = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q: cidade + ', Brasil', format: 'json', limit: '1' }).toString());
          const j2 = await r2.json();
          if (j2 && j2[0]) ponto = { lat: parseFloat(j2[0].lat), lon: parseFloat(j2[0].lon) };
        }
      } catch (e) { /* sem rede: segue sem ponto */ }
      if (ponto){ const c3 = lerCache(CHAVE_GEO); c3[chave] = ponto; gravarCache(CHAVE_GEO, c3); }
      await new Promise(ok => setTimeout(ok, 1100));
      return ponto;
    });
    _filaGeo = p.catch(() => null);
    return p;
  }

  // ---------- trajeto pela estrada (OSRM) ----------
  async function tracarRota(pontos){
    const chave = pontos.map(p => p.lat.toFixed(3) + ',' + p.lon.toFixed(3)).join(';');
    const cache = lerCache(CHAVE_ROTA);
    if (cache[chave]) return cache[chave];
    try {
      const coords = pontos.map(p => p.lon + ',' + p.lat).join(';');
      const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=simplified&geometries=geojson');
      const j = await r.json();
      if (j && j.routes && j.routes[0]){
        const res = {
          km: Math.round(j.routes[0].distance / 1000),
          horas: j.routes[0].duration / 3600,
          linha: j.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
        };
        // Cache enxuto: guarda só as 40 últimas rotas
        const ks = Object.keys(cache); if (ks.length > 40) delete cache[ks[0]];
        cache[chave] = res; gravarCache(CHAVE_ROTA, cache);
        return res;
      }
    } catch (e) { /* cai na linha reta */ }
    let km = 0;
    for (let i = 1; i < pontos.length; i++) km += distKm(pontos[i-1], pontos[i]);
    return { km: Math.round(km * 1.25), horas: null, linha: pontos.map(p => [p.lat, p.lon]), aproximado: true };
  }

  // ---------- origem / destinos a partir dos carros da viagem ----------
  function cidadesDaViagem(carros){
    const cont = {};
    (carros || []).forEach(c => {
      if (!c.cidadeOrigem) return;
      const k = c.cidadeOrigem + '/' + (c.ufOrigem || '');
      cont[k] = (cont[k] || 0) + 1;
    });
    const origemK = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const origem = origemK ? { cidade: origemK.split('/')[0], uf: origemK.split('/')[1] || '' } : null;
    const vistos = new Set();
    const destinos = [];
    (carros || []).forEach(c => {
      if (!c.cidadeDestino) return;
      const k = norm(c.cidadeDestino) + '/' + norm(c.ufDestino);
      if (vistos.has(k)) return;
      vistos.add(k);
      destinos.push({ cidade: c.cidadeDestino, uf: c.ufDestino || '', qtd: 0 });
    });
    destinos.forEach(d => { d.qtd = (carros || []).filter(c => norm(c.cidadeDestino) === norm(d.cidade)).length; });
    return { origem, destinos };
  }

  // Resolve coordenadas e monta a sequência origem → paradas → destino mais longe
  async function montarRoteiro(carros){
    const { origem, destinos } = cidadesDaViagem(carros);
    if (!origem || !destinos.length) return { erro: 'Viagem sem origem/destino nos carros.' };
    const pOrig = await geocodificar(origem.cidade, origem.uf);
    if (!pOrig) return { erro: 'Não encontrei a cidade de origem (' + origem.cidade + ') no mapa.' };
    const ds = [];
    for (const d of destinos){
      const p = await geocodificar(d.cidade, d.uf);
      if (p) ds.push({ ...d, ...p, dist: distKm(pOrig, p) });
    }
    if (!ds.length) return { erro: 'Não encontrei as cidades de destino no mapa.' };
    ds.sort((a, b) => a.dist - b.dist);
    const final = ds[ds.length - 1];
    const paradas = ds.slice(0, -1).filter(d => d.dist > 5); // mesma cidade da origem não vira parada
    const seq = [{ ...origem, ...pOrig }, ...paradas, final];
    const rota = await tracarRota(seq);
    return { origem: { ...origem, ...pOrig }, paradas, final, seq, rota };
  }

  // ---------- desenho do mapa ----------
  function icone(L, cor){
    return L.divIcon({
      className: 'mm-rt-pin',
      html: `<span style="background:${cor}"></span>`,
      iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20]
    });
  }

  async function desenhar(el, carros, opcoes){
    opcoes = opcoes || {};
    if (!el) return null;
    el.innerHTML = '<div class="mm-rt-status">🗺️ Montando a rota…</div>';
    let L;
    try { L = await carregarLeaflet(); }
    catch (e) { el.innerHTML = '<div class="mm-rt-status">⚠️ Mapa indisponível sem internet.</div>'; return null; }
    const r = await montarRoteiro(carros);
    if (!document.body.contains(el)) return r; // tela mudou enquanto buscava
    if (r.erro){ el.innerHTML = `<div class="mm-rt-status">⚠️ ${esc(r.erro)}</div>`; return r; }
    el.innerHTML = '';
    if (el._mmMapa){ try { el._mmMapa.remove(); } catch (e) {} }
    const mapa = L.map(el, { zoomControl: true, scrollWheelZoom: !!opcoes.scrollZoom, attributionControl: true });
    el._mmMapa = mapa;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap'
    }).addTo(mapa);
    const linha = L.polyline(r.rota.linha, { color: '#2563eb', weight: 5, opacity: .85, dashArray: r.rota.aproximado ? '8 8' : null }).addTo(mapa);
    L.marker([r.origem.lat, r.origem.lon], { icon: icone(L, '#22c55e') }).addTo(mapa)
      .bindPopup(`<b>Origem</b><br>${esc(r.origem.cidade)}/${esc(r.origem.uf)}`);
    r.paradas.forEach(p => {
      L.marker([p.lat, p.lon], { icon: icone(L, '#f59e0b') }).addTo(mapa)
        .bindPopup(`<b>Entrega no caminho</b><br>${esc(p.cidade)}/${esc(p.uf)} · ${p.qtd} carro(s)`);
    });
    L.marker([r.final.lat, r.final.lon], { icon: icone(L, '#ef4444') }).addTo(mapa)
      .bindPopup(`<b>Destino final</b><br>${esc(r.final.cidade)}/${esc(r.final.uf)} · ${r.final.qtd} carro(s)`);
    mapa.fitBounds(linha.getBounds(), { padding: [24, 24] });
    setTimeout(() => { try { mapa.invalidateSize(); } catch (e) {} }, 150);
    return r;
  }

  function legendaHTML(){
    return `<div class="mm-rt-legenda">
      <span><i style="background:#22c55e"></i>Origem</span>
      <span><i style="background:#2563eb;border-radius:2px;height:4px"></i>Trajeto</span>
      <span><i style="background:#f59e0b"></i>Entrega no caminho</span>
      <span><i style="background:#ef4444"></i>Destino final</span>
    </div>`;
  }

  function resumoHTML(r){
    if (!r || r.erro || !r.rota) return '';
    const h = r.rota.horas;
    const tempo = h ? (h >= 1 ? Math.floor(h) + 'h' + String(Math.round((h % 1) * 60)).padStart(2, '0') : Math.round(h * 60) + 'min') : null;
    return `<span class="mm-rt-trecho">🟢 ${esc(r.origem.cidade)} → 🔴 ${esc(r.final.cidade)}${r.paradas.length ? ` <span class="text-muted">(+${r.paradas.length} parada${r.paradas.length > 1 ? 's' : ''})</span>` : ''}</span>
      <span class="mm-rt-km">${r.rota.aproximado ? '~' : ''}${r.rota.km.toLocaleString('pt-BR')} km</span>
      ${tempo ? `<span class="mm-rt-tempo" title="Tempo de direção estimado, sem paradas">⏱️ ${tempo}</span>` : ''}`;
  }

  // ---------- card embutido (Viagens em andamento) ----------
  function cardViagemHTML(rotaId){
    return `<div class="jv-mapa">
      <div class="jv-mapa-cab">
        <span class="jv-mapa-tit">🗺️ Rastreador da rota</span>
        <button class="btn btn-sm btn-secondary" onclick="mmAbrirRoteirizador(${Number(rotaId)})">🔍 Roteirizar</button>
      </div>
      <div class="jv-mapa-resumo" id="jvMapaResumo_${Number(rotaId)}"></div>
      <div class="jv-mapa-area" id="jvMapa_${Number(rotaId)}"></div>
      ${legendaHTML()}
    </div>`;
  }

  function carrosDaRota(rotaId){
    if (typeof _veiculosNaRota === 'function') return _veiculosNaRota(rotaId);
    return (window.pedidosGlobais || []).filter(p => String(p.rotaId || p.rota_id) === String(rotaId));
  }

  async function montarCardViagem(rotaId){
    const el = document.getElementById('jvMapa_' + rotaId);
    if (!el) return;
    const r = await desenhar(el, carrosDaRota(rotaId));
    const res = document.getElementById('jvMapaResumo_' + rotaId);
    if (res) res.innerHTML = resumoHTML(r);
  }

  // ---------- modal grande (estilo Atua) ----------
  async function abrirRoteirizador(rotaId, opcoes){
    opcoes = opcoes || {};
    const rota = (window.rotasGlobais || (typeof rotasGlobais !== 'undefined' ? rotasGlobais : [])).find(x => String(x.id) === String(rotaId));
    const carros = carrosDaRota(rotaId);
    document.getElementById('modalRoteirizador')?.remove();
    const div = document.createElement('div');
    div.id = 'modalRoteirizador';
    div.className = 'mm-rt-modal';
    div.innerHTML = `
      <div class="mm-rt-caixa">
        <div class="mm-rt-topo">
          <strong>🗺️ Roteirizar viagem${rota && rota.nome ? ' — ' + esc(rota.nome) : ''}</strong>
          <button class="mm-rt-x" title="Fechar" data-fechar>✕</button>
        </div>
        <div class="mm-rt-mapa" id="mmRtMapaGrande"></div>
        <div class="mm-rt-dica">💡 Origem = cidade de saída da carga · Destino final = o destino mais distante. Os outros destinos entram como paradas no caminho.</div>
        ${legendaHTML()}
        <div class="mm-rt-rodape">
          <div class="mm-rt-resumo" id="mmRtResumoGrande"></div>
          <div class="mm-rt-botoes">
            <button class="btn btn-primary" id="mmRtSalvar" disabled>💾 Salvar c/ distância</button>
            <button class="btn btn-secondary" data-fechar>Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);
    const fechar = () => { div.remove(); if (typeof opcoes.aoFechar === 'function') { try { opcoes.aoFechar(); } catch (e) {} } };
    div.querySelectorAll('[data-fechar]').forEach(b => b.onclick = fechar);
    div.addEventListener('click', e => { if (e.target === div) fechar(); });

    const r = await desenhar(document.getElementById('mmRtMapaGrande'), carros, { scrollZoom: true });
    const res = document.getElementById('mmRtResumoGrande');
    if (res) res.innerHTML = resumoHTML(r);
    const btn = document.getElementById('mmRtSalvar');
    if (btn && r && !r.erro && r.rota){
      btn.disabled = false;
      btn.innerHTML = `💾 Salvar c/ distância <span class="mm-rt-km-mini">${r.rota.km} km</span>`;
      btn.onclick = async () => {
        btn.disabled = true;
        // Coluna opcional: se o banco ainda não tem distancia_km, a tela segue
        // funcionando (o mapa é refeito a cada abertura).
        try {
          if (window.supabase && window.supabase.from){
            const { error } = await window.supabase.from('rotas_planejadas')
              .update({ distancia_km: r.rota.km }).eq('id', rotaId);
            if (error) throw error;
          }
          if (rota) rota.distancia_km = r.rota.km;
          const msg = '✅ Distância salva na viagem: ' + r.rota.km + ' km';
          if (typeof mmToast === 'function') mmToast(msg);
          else if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(msg);
          fechar();
        } catch (e) {
          btn.disabled = false;
          alert('Não consegui salvar a distância (' + (e.message || e) + ').\nSe for coluna ausente, rode o SQL sql/2026-09-26-melhorias.sql no Supabase.');
        }
      };
    }
  }

  window.mmRoteirizadorCardHTML = cardViagemHTML;
  window.mmRoteirizadorMontarCard = montarCardViagem;
  window.mmAbrirRoteirizador = abrirRoteirizador;
  window.mmRoteirizadorDesenhar = desenhar;
})();
