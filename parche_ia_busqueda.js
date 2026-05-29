// ═══════════════════════════════════════════════════════════════════
// PARCHE IA — Búsqueda inteligente (3 chars) + Resumen discreto
// Directorio Easylink
//
// INSTRUCCIÓN: Agrega <script src="parche_ia_busqueda.js"></script>
// justo antes del </body> en tu index.html
// ═══════════════════════════════════════════════════════════════════

/* ══ 1. PANEL RESUMEN DISCRETO ══
   Se inserta debajo del buscador (.search-wrap)
   Muestra chips: nombre · tipo · localidad · km
*/
(function insertSummaryPanel(){
  function tryInsert(){
    var wrap = document.querySelector('.search-wrap');
    if(!wrap){ setTimeout(tryInsert, 200); return; }

    var panel = document.createElement('div');
    panel.id = 'ai-summary-panel';
    panel.style.cssText = 'display:none;padding:0 16px 8px;z-index:1040;';
    panel.innerHTML = '<div id="ai-summary-inner" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:22px;"></div>';
    wrap.insertAdjacentElement('afterend', panel);

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes fadeInSum{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}',
      '#ai-summary-panel{animation:fadeInSum .3s ease;}',
      '#ai-summary-inner .sum-chip{',
        'display:inline-flex;align-items:center;gap:3px;',
        'border-radius:20px;padding:3px 9px;',
        'font-size:10px;font-weight:600;white-space:nowrap;',
        'font-family:Inter,sans-serif;line-height:1.4;',
      '}',
      '#ai-summary-inner .sum-chip.s-blue{background:rgba(26,115,232,.15);border:1px solid rgba(26,115,232,.3);color:#93c5fd;}',
      '#ai-summary-inner .sum-chip.s-green{background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.3);color:#4ade80;}',
      '#ai-summary-inner .sum-chip.s-orange{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);color:#fdba74;}',
      '#ai-summary-inner .sum-chip .sum-sub{opacity:.6;font-weight:400;}',
      '.sum-loading{font-size:10px;color:rgba(255,255,255,.45);font-family:Inter,sans-serif;display:flex;align-items:center;gap:4px;}',
      '.sum-dot{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.5);animation:sdot 1s ease-in-out infinite;}',
      '.sum-dot:nth-child(2){animation-delay:.18s}.sum-dot:nth-child(3){animation-delay:.36s}',
      '@keyframes sdot{0%,100%{opacity:.25}50%{opacity:1}}'
    ].join('');
    document.head.appendChild(style);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tryInsert);
  } else {
    tryInsert();
  }
})();

/* ══ 2. OVERRIDE HANDLERS DE BÚSQUEDA ══ */

var _aiDebounce  = null;
var _aiCache     = {};
var _lastAiQuery = '';

// Esperar a que handleSearch original esté definido, luego envolver
(function wrapHandlers(){
  function doWrap(){
    var origHandle = window.handleSearch;
    var origClear  = window.clearSearch;

    window.handleSearch = function(val){
      if(origHandle) origHandle(val);        // ← lógica original intacta
      clearTimeout(_aiDebounce);
      var panel = document.getElementById('ai-summary-panel');
      if(!val || val.trim().length < 3){
        if(panel) panel.style.display = 'none';
        return;
      }
      _aiDebounce = setTimeout(function(){ runAISearch(val.trim()); }, 480);
    };

    window.clearSearch = function(){
      if(origClear) origClear();
      _lastAiQuery = '';
      var panel = document.getElementById('ai-summary-panel');
      if(panel) panel.style.display = 'none';
    };
  }

  // El script principal puede cargarse después; esperamos
  if(typeof window.handleSearch === 'function'){
    doWrap();
  } else {
    window.addEventListener('load', doWrap);
  }
})();

/* ══ 3. MOTOR IA ══ */

async function runAISearch(query){
  if(query === _lastAiQuery) return;
  _lastAiQuery = query;

  var panel = document.getElementById('ai-summary-panel');
  var inner = document.getElementById('ai-summary-inner');
  if(!panel || !inner) return;

  // Loading
  panel.style.display = '';
  inner.innerHTML = '<span class="sum-loading">'
    + '<span class="sum-dot"></span><span class="sum-dot"></span><span class="sum-dot"></span>'
    + '<span style="margin-left:3px;">Buscando con IA…</span></span>';

  // Cache hit
  if(_aiCache[query]){
    renderSummary(_aiCache[query]);
    return;
  }

  // Construir contexto con tiendas disponibles
  var stores = (window.nearbyStores && window.nearbyStores.length)
    ? window.nearbyStores
    : (window.ALL_STORES || []);

  function hvKm(la1,ln1,la2,ln2){
    var R=6371,dL=(la2-la1)*Math.PI/180,dN=(ln2-ln1)*Math.PI/180;
    var a=Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
    return (R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1);
  }

  var ctx = stores.slice(0, 50).map(function(s){
    var cfg = s.config || {};
    var lat = parseFloat(cfg.locationLat), lng = parseFloat(cfg.locationLng);
    var dist = (window.userLat && !isNaN(lat))
      ? hvKm(window.userLat, window.userLng, lat, lng) + ' km'
      : '';
    return {
      nombre    : s.nombre_tienda || s.name || '',
      tipo      : cfg.tipoNegocio || cfg.businessType || cfg.tipo || '',
      localidad : cfg.localidad || cfg.city || '',
      colonia   : cfg.colonia || '',
      keywords  : cfg.keywords || '',
      descripcion: cfg.description || '',
      dist      : dist
    };
  });

  var prompt =
    'Eres el asistente de un directorio de negocios en Querétaro, México.\n' +
    'El usuario busca: "' + query + '".\n\n' +
    'Tiendas disponibles:\n' + JSON.stringify(ctx) + '\n\n' +
    'Responde ÚNICAMENTE con JSON válido (sin markdown):\n' +
    '{"encontrados":N,"top":[{"nombre":"","tipo":"","localidad":"","dist":""}],"mensaje":""}\n' +
    'Reglas: top máximo 3 tiendas más relevantes. ' +
    'Si no hay coincidencias top=[]. ' +
    'mensaje: frase muy corta ≤6 palabras, ej: "2 zapaterías a menos de 3 km".';

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        model     : 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages  : [{ role: 'user', content: prompt }]
      })
    });
    var data = await resp.json();
    var text = (data.content || []).map(function(b){ return b.text||''; }).join('');
    text = text.replace(/```json|```/g,'').trim();
    var result = JSON.parse(text);
    _aiCache[query] = result;
    renderSummary(result);
  } catch(e){
    if(panel) panel.style.display = 'none';
  }
}

/* ══ 4. RENDER DEL RESUMEN ══ */

function renderSummary(result){
  var panel = document.getElementById('ai-summary-panel');
  var inner = document.getElementById('ai-summary-inner');
  if(!panel || !inner) return;

  if(!result || (!result.encontrados && !(result.top && result.top.length))){
    panel.style.display = 'none';
    return;
  }

  var html = '';

  // Chip de resumen general
  if(result.mensaje){
    html += '<span class="sum-chip s-blue">🤖 ' + result.mensaje + '</span>';
  }

  // Chips por tienda
  (result.top || []).forEach(function(t){
    var nombre = t.nombre || 'Tienda';
    var info   = [t.tipo, t.localidad, t.dist].filter(Boolean).join(' · ');
    var cls    = (t.dist && parseFloat(t.dist) < 2) ? 's-green' : 's-orange';
    html += '<span class="sum-chip ' + cls + '">'
         + nombre
         + (info ? ' <span class="sum-sub">' + info + '</span>' : '')
         + '</span>';
  });

  inner.innerHTML = html || '';
  panel.style.display = html ? '' : 'none';
}
