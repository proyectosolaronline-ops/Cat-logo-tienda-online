// ═══════════════════════════════════════════════════════════════════
// PARCHE IA v2 — Búsqueda inteligente + Chips scroll + Pines reactivos
// USO: <script src="parche_ia_busqueda.js"></script> antes de </body>
// ═══════════════════════════════════════════════════════════════════

(function(){

/* ── ESTILOS ── */
var css = document.createElement('style');
css.textContent = [
  '@keyframes fadeInSum{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}',
  '@keyframes sdot{0%,100%{opacity:.2}50%{opacity:.8}}',

  /* panel contenedor — pegado debajo del buscador, oculto por defecto */
  '#ai-strip{',
    'display:none;',
    'padding:0 16px 8px;',
    'animation:fadeInSum .25s ease;',
  '}',

  /* scroll horizontal sin scrollbar visible */
  '#ai-strip-inner{',
    'display:flex;',
    'gap:6px;',
    'overflow-x:auto;',
    'overflow-y:hidden;',
    '-webkit-overflow-scrolling:touch;',
    'scrollbar-width:none;',      /* Firefox */
    'padding-bottom:2px;',
  '}',
  '#ai-strip-inner::-webkit-scrollbar{display:none;}',

  /* chip base */
  '.ai-chip{',
    'display:inline-flex;',
    'align-items:center;',
    'gap:4px;',
    'flex-shrink:0;',
    'border-radius:20px;',
    'padding:3px 10px;',
    'font-size:10px;',
    'font-weight:600;',
    'font-family:Inter,sans-serif;',
    'white-space:nowrap;',
    'cursor:pointer;',
    'transition:opacity .2s;',
    'border:1px solid transparent;',
  '}',
  '.ai-chip:active{opacity:.7;}',

  /* variantes */
  '.ai-chip.c-label{',
    'background:rgba(26,115,232,.12);',
    'border-color:rgba(26,115,232,.25);',
    'color:#93c5fd;',
    'cursor:default;',
  '}',
  '.ai-chip.c-near{',
    'background:rgba(22,163,74,.12);',
    'border-color:rgba(22,163,74,.3);',
    'color:#4ade80;',
  '}',
  '.ai-chip.c-far{',
    'background:rgba(249,115,22,.12);',
    'border-color:rgba(249,115,22,.25);',
    'color:#fdba74;',
  '}',

  /* sub-texto dentro del chip */
  '.ai-chip .csub{opacity:.55;font-weight:400;margin-left:2px;}',

  /* loading dots */
  '.ai-dots{display:flex;align-items:center;gap:4px;padding:4px 16px;}',
  '.ai-dot{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.4);animation:sdot 1s ease-in-out infinite;}',
  '.ai-dot:nth-child(2){animation-delay:.18s}',
  '.ai-dot:nth-child(3){animation-delay:.36s}',

  /* pin apagado cuando hay filtro activo */
  '.pin-dimmed{opacity:.22!important;filter:grayscale(80%);transition:opacity .3s,filter .3s;}',

].join('');
document.head.appendChild(css);

/* ── INYECTAR PANEL DEBAJO DE .search-wrap ── */
function insertPanel(){
  var wrap = document.querySelector('.search-wrap');
  if(!wrap){ setTimeout(insertPanel, 200); return; }
  var panel = document.createElement('div');
  panel.id = 'ai-strip';
  panel.innerHTML = '<div id="ai-strip-inner"></div>';
  wrap.insertAdjacentElement('afterend', panel);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertPanel);
else insertPanel();

/* ── CACHE Y ESTADO ── */
var _cache   = {};
var _lastQ   = '';
var _timer   = null;
var _dimmed  = [];   // markers actualmente apagados

/* ── WRAP DE handleSearch ── */
function wrapHandlers(){
  var origHandle = window.handleSearch;
  var origClear  = window.clearSearch;

  window.handleSearch = function(val){
    if(origHandle) origHandle(val);
    clearTimeout(_timer);
    var strip = document.getElementById('ai-strip');
    if(!val || val.trim().length < 3){
      hideStrip();
      undimAll();
      return;
    }
    // loading inmediato
    showLoading();
    _timer = setTimeout(function(){ runAI(val.trim()); }, 460);
  };

  window.clearSearch = function(){
    if(origClear) origClear();
    _lastQ = '';
    hideStrip();
    undimAll();
  };
}
if(typeof window.handleSearch === 'function') wrapHandlers();
else window.addEventListener('load', wrapHandlers);

/* ── LOADING ── */
function showLoading(){
  var strip = document.getElementById('ai-strip');
  var inner = document.getElementById('ai-strip-inner');
  if(!strip||!inner) return;
  inner.innerHTML = '<div class="ai-dots">'
    +'<div class="ai-dot"></div>'
    +'<div class="ai-dot"></div>'
    +'<div class="ai-dot"></div>'
    +'</div>';
  strip.style.display = '';
}

function hideStrip(){
  var strip = document.getElementById('ai-strip');
  if(strip) strip.style.display = 'none';
}

/* ── HAVERSINE LOCAL ── */
function hv(la1,ln1,la2,ln2){
  var R=6371,dL=(la2-la1)*Math.PI/180,dN=(ln2-ln1)*Math.PI/180;
  var a=Math.sin(dL/2)*Math.sin(dL/2)
      +Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
  return (R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1);
}

/* ── MAIN IA ── */
async function runAI(query){
  if(query === _lastQ && _cache[query]){ render(_cache[query]); return; }
  _lastQ = query;
  if(_cache[query]){ render(_cache[query]); return; }

  var stores = (window.nearbyStores && window.nearbyStores.length)
    ? window.nearbyStores : (window.ALL_STORES || []);

  var ctx = stores.slice(0,50).map(function(s){
    var cfg = s.config||{};
    var lat = parseFloat(cfg.locationLat), lng = parseFloat(cfg.locationLng);
    var dist = (window.userLat&&!isNaN(lat))? hv(window.userLat,window.userLng,lat,lng)+' km' : '';
    return {
      id       : s.storeId || s.id || '',
      nombre   : s.nombre_tienda||s.name||'',
      tipo     : cfg.tipoNegocio||cfg.businessType||cfg.tipo||'',
      localidad: cfg.localidad||cfg.city||'',
      keywords : cfg.keywords||'',
      dist     : dist,
      lat      : isNaN(lat)?'':lat,
      lng      : isNaN(lng)?'':lng
    };
  });

  var prompt =
    'Directorio de negocios Querétaro México. El usuario busca: "'+query+'".\n\n'+
    'Tiendas disponibles:\n'+JSON.stringify(ctx)+'\n\n'+
    'Responde SOLO con JSON válido sin markdown:\n'+
    '{"mensaje":"máx 5 palabras","top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}\n'+
    'top: máx 4 tiendas más relevantes. Si no hay coincidencias top=[].';

  try{
    var resp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:500,
        messages:[{role:'user',content:prompt}]
      })
    });
    var data = await resp.json();
    var text = (data.content||[]).map(function(b){return b.text||'';}).join('');
    text = text.replace(/```json|```/g,'').trim();
    var result = JSON.parse(text);
    _cache[query] = result;
    render(result);
  }catch(e){
    hideStrip();
    undimAll();
  }
}

/* ── RENDER CHIPS + PINES ── */
function render(result){
  var strip = document.getElementById('ai-strip');
  var inner = document.getElementById('ai-strip-inner');
  if(!strip||!inner) return;

  var top = result.top||[];

  if(!top.length){
    hideStrip();
    undimAll();
    return;
  }

  var html = '';

  // chip resumen (sin cursor)
  if(result.mensaje){
    html += '<span class="ai-chip c-label">🤖 '+result.mensaje+'</span>';
  }

  // chip por tienda
  top.forEach(function(t, i){
    var cls = (t.dist && parseFloat(t.dist)<2) ? 'c-near' : 'c-far';
    var sub = [t.tipo, t.localidad, t.dist].filter(Boolean).join(' · ');
    html += '<span class="ai-chip '+cls+'" '
          + 'onclick="window._aiChipClick(\''+t.lat+'\',\''+t.lng+'\',\''+t.id+'\')" '
          + 'title="Ver en mapa">'
          + (t.nombre||'Tienda')
          + (sub ? '<span class="csub">'+sub+'</span>' : '')
          + '</span>';
  });

  inner.innerHTML = html;
  strip.style.display = '';

  // Actualizar pines del mapa
  dimMarkersExcept(top);
}

/* ── DIMMING DE PINES ── */
function dimMarkersExcept(top){
  undimAll();
  if(!window.map) return;

  // Coordenadas de las tiendas encontradas
  var found = top.filter(function(t){ return t.lat && t.lng; }).map(function(t){
    return { lat: parseFloat(t.lat), lng: parseFloat(t.lng) };
  });
  if(!found.length) return;

  var L = window.L;
  if(!L) return;

  window.map.eachLayer(function(layer){
    if(!(layer instanceof L.Marker)) return;
    // Nunca apagar el marcador "Tu ubicación"
    try{
      var tt = layer.getTooltip ? layer.getTooltip() : null;
      if(tt && tt.getContent && tt.getContent()==='Tu ubicación') return;
    }catch(e){}

    var pos = layer.getLatLng();
    var isMatch = found.some(function(f){
      return Math.abs(pos.lat - f.lat) < 0.0002 && Math.abs(pos.lng - f.lng) < 0.0002;
    });

    if(!isMatch){
      var el = layer.getElement ? layer.getElement() : null;
      if(el){
        el.classList.add('pin-dimmed');
        _dimmed.push(el);
      }
    }
  });
}

function undimAll(){
  _dimmed.forEach(function(el){ if(el) el.classList.remove('pin-dimmed'); });
  _dimmed = [];
}

/* ── CLICK EN CHIP → volar al mapa ── */
window._aiChipClick = function(lat, lng, id){
  if(!window.map || !lat || !lng) return;
  var L = window.L;
  var la = parseFloat(lat), ln = parseFloat(lng);
  if(isNaN(la)||isNaN(ln)) return;
  window.map.setView([la, ln], 16, {animate:true});
  // abrir popup si existe openPopup
  if(id && typeof window.openPopup === 'function'){
    setTimeout(function(){ window.openPopup(id); }, 400);
  }
};

})();
