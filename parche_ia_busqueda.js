// PARCHE IA v7 — Selector popup + visualizador mapa, sin romper directorio
// <script src="parche_ia_busqueda.js"></script> antes de </body>
(function(){

/* ══════════════════════════════════════════════
   ESTILOS
══════════════════════════════════════════════ */
var css = document.createElement('style');
css.textContent =
  '@keyframes fai{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}' +
  '#ai-box{' +
    'display:none;' +
    'margin:0 12px 8px;' +
    'border-radius:12px;' +
    'overflow:hidden;' +
    'background:rgba(26,115,232,.10);' +
    'border:1px solid rgba(26,115,232,.25);' +
    'animation:fai .2s ease;' +
    'flex-shrink:0;' +
  '}' +
  '.ai-row{' +
    'display:flex;align-items:center;gap:10px;' +
    'padding:7px 12px;cursor:pointer;' +
    'border-bottom:1px solid rgba(0,0,0,.05);' +
    'transition:background .12s;' +
  '}' +
  '.ai-row:last-child{border-bottom:none;}' +
  '.ai-row:active{background:rgba(26,115,232,.08);}' +
  '.ai-dot-c{width:7px;height:7px;border-radius:50%;flex-shrink:0;}' +
  '.ai-name{font-size:12px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}' +
  '.ai-sub{font-size:10px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
  '.ai-km{font-size:10px;font-weight:700;flex-shrink:0;}' +
  '.ai-load{display:flex;align-items:center;gap:5px;padding:10px 14px;}' +
  '.ai-load span{font-size:11px;color:#888;font-family:Inter,sans-serif;}' +
  '@keyframes sdot{0%,100%{opacity:.2}50%{opacity:1}}' +
  '.ald{width:4px;height:4px;border-radius:50%;background:#aaa;animation:sdot .9s ease-in-out infinite;display:inline-block;}' +
  '.ald:nth-child(2){animation-delay:.15s}.ald:nth-child(3){animation-delay:.3s}';
document.head.appendChild(css);

/* ══════════════════════════════════════════════
   INSERTAR #ai-box dentro del searchPanel
══════════════════════════════════════════════ */
function insertBox(){
  var sp = document.getElementById('searchPanel');
  if(!sp){ setTimeout(insertBox, 200); return; }
  var results = document.getElementById('searchResults');
  if(!results){ setTimeout(insertBox, 200); return; }
  var box = document.createElement('div');
  box.id = 'ai-box';
  sp.insertBefore(box, results);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', insertBox);
else insertBox();

/* ══════════════════════════════════════════════
   ESTADO INTERNO — no toca nada del directorio
══════════════════════════════════════════════ */
var _cache     = {};
var _lastQ     = '';
var _timer     = null;
var _hiddenLayers = []; // layers ocultados por búsqueda
var _modoFiltro   = false; // true = hay filtro activo

/* ══════════════════════════════════════════════
   ESCUCHAR INPUTS — sin pisar handleSearch
══════════════════════════════════════════════ */
window.addEventListener('load', function(){
  var i1 = document.getElementById('searchInput');
  var i2 = document.getElementById('searchInput2');
  if(i1) i1.addEventListener('input', function(e){ onInput(e.target.value); });
  if(i2) i2.addEventListener('input', function(e){ onInput(e.target.value); });

  // Resetear al borrar / cerrar
  var closeBtn = document.querySelector('.sp-close');
  if(closeBtn) closeBtn.addEventListener('click', function(){ resetFiltro(); });

  // Detectar cuando clearSearch vacía el input (click en ✕)
  var clearBtn = document.getElementById('clearBtn');
  if(clearBtn) clearBtn.addEventListener('click', function(){ resetFiltro(); });
});

function onInput(val){
  clearTimeout(_timer);
  if(!val || val.trim().length < 3){
    hideBox();
    resetFiltro();
    return;
  }
  showLoad();
  _timer = setTimeout(function(){ runAI(val.trim()); }, 500);
}

/* ══════════════════════════════════════════════
   UI DEL BOX
══════════════════════════════════════════════ */
function showLoad(){
  var box = document.getElementById('ai-box');
  if(!box) return;
  box.style.display = '';
  box.innerHTML =
    '<div class="ai-load">' +
    '<div class="ald"></div><div class="ald"></div><div class="ald"></div>' +
    '<span>Buscando con IA…</span></div>';
}
function hideBox(){
  var box = document.getElementById('ai-box');
  if(box){ box.style.display='none'; box.innerHTML=''; }
}

/* ══════════════════════════════════════════════
   HAVERSINE
══════════════════════════════════════════════ */
function hv(a,b,c,d){
  var R=6371,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180;
  var x=Math.sin(dL/2)*Math.sin(dL/2)+
        Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
  return (R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1);
}

/* ══════════════════════════════════════════════
   IA — busca en nearbyStores (radio 20km activo)
══════════════════════════════════════════════ */
async function runAI(q){
  if(_cache[q]){ render(_cache[q], q); return; }
  _lastQ = q;

  // SIEMPRE usa nearbyStores — respeta el radio 20km del directorio
  var stores = (window.nearbyStores && window.nearbyStores.length)
    ? window.nearbyStores
    : (window.ALL_STORES || []);

  var ctx = stores.map(function(s){
    var cfg = s.config || {};
    var la  = parseFloat(cfg.locationLat), ln = parseFloat(cfg.locationLng);
    var dist= (window.userLat && !isNaN(la))
              ? hv(window.userLat, window.userLng, la, ln) + ' km' : '';
    return {
      id       : s.storeId || '',
      nombre   : s.nombre_tienda || s.name || '',
      tipo     : cfg.tipoNegocio || cfg.tipo || '',
      localidad: cfg.localidad || cfg.city || '',
      keywords : cfg.keywords || '',
      dist     : dist,
      lat      : isNaN(la) ? '' : '' + la,
      lng      : isNaN(ln) ? '' : '' + ln
    };
  });

  var prompt =
    'Directorio Querétaro. Busca:"' + q + '". Tiendas:' + JSON.stringify(ctx) +
    '\nSolo JSON sin texto extra:' +
    '{"top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}' +
    '\ntop máx 4 más relevantes dentro del radio. Si no hay coincidencias, top=[].';

  try{
    var r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model      : 'claude-sonnet-4-20250514',
        max_tokens : 400,
        messages   : [{role:'user', content: prompt}]
      })
    });
    var d   = await r.json();
    var txt = (d.content||[]).map(function(b){ return b.text||''; }).join('');
    txt = txt.replace(/```json|```/g,'').trim();
    var res = JSON.parse(txt);
    _cache[q] = res;
    render(res, q);
  } catch(e){
    hideBox();
    resetFiltro();
  }
}

/* ══════════════════════════════════════════════
   PASO 2+3 — RENDER popup + filtrar mapa
══════════════════════════════════════════════ */
function render(res, q){
  var top = res.top || [];
  var box = document.getElementById('ai-box');
  if(!box) return;

  if(!top.length){
    hideBox();
    resetFiltro();
    return;
  }

  // Pintar filas del popup (selector)
  box.innerHTML = top.map(function(t){
    var near  = t.dist && parseFloat(t.dist) < 2;
    var color = near ? '#16a34a' : '#1a73e8';
    var sub   = [t.tipo, t.localidad].filter(Boolean).join(' · ');
    var lat   = t.lat || '', lng = t.lng || '', id = t.id || '';
    return '<div class="ai-row" onclick="window._aiSeleccionar(\'' + lat + '\',\'' + lng + '\',\'' + id + '\')">' +
      '<div class="ai-dot-c" style="background:' + color + ';"></div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div class="ai-name">' + (t.nombre || 'Tienda') + '</div>' +
      (sub ? '<div class="ai-sub">' + sub + '</div>' : '') +
      '</div>' +
      '<div class="ai-km" style="color:' + color + ';">' + (t.dist || '') + '</div>' +
      '</div>';
  }).join('');
  box.style.display = '';

  // PASO 2 — mapa muestra SOLO pins coincidentes (en gris, esperando click)
  filtrarMapa(top, null);
}

/* ══════════════════════════════════════════════
   FILTRAR MAPA
   matchIds  = ids que coinciden con búsqueda
   selectedId = id seleccionado por usuario (paso 4)
══════════════════════════════════════════════ */
function filtrarMapa(top, selectedId){
  // Restaurar primero sin tocar estructura
  _restaurarLayers();
  _modoFiltro = true;

  if(!window.map || !window.L) return;

  var matchIds = top.map(function(t){ return t.id; });

  window.map.eachLayer(function(layer){
    if(!(layer instanceof window.L.Marker)) return;

    // Nunca tocar marcador de ubicación del usuario
    try{
      var tt = layer.getTooltip && layer.getTooltip();
      if(tt && tt.getContent && tt.getContent() === 'Tu ubicación') return;
    }catch(e){}

    var el = layer.getElement && layer.getElement();
    if(!el) return;

    // Identificar a qué tienda pertenece este layer
    var storeId = _getLayerStoreId(layer);

    if(!storeId || matchIds.indexOf(storeId) === -1){
      // No coincide → ocultar
      el.style.display = 'none';
      _hiddenLayers.push(el);
    } else {
      // Coincide → mostrar en gris si no es la seleccionada
      if(selectedId && storeId === selectedId){
        // PASO 4 — pin seleccionado: normal (sin tocar estilos originales)
        el.style.opacity   = '';
        el.style.filter    = '';
        el.style.transform = '';
      } else {
        // PASO 2/3 — coincide pero no seleccionada: gris, esperando click
        el.style.opacity   = '0.45';
        el.style.filter    = 'grayscale(1)';
        el.style.transition= 'opacity .2s, filter .2s';
      }
    }
  });
}

/* ══════════════════════════════════════════════
   OBTENER storeId de un layer
   Busca por coordenadas en nearbyStores/ALL_STORES
══════════════════════════════════════════════ */
function _getLayerStoreId(layer){
  var pos = layer.getLatLng();
  var stores = (window.nearbyStores && window.nearbyStores.length)
    ? window.nearbyStores : (window.ALL_STORES || []);
  var found = null;
  stores.forEach(function(s){
    var cfg = s.config || {};
    var la  = parseFloat(cfg.locationLat);
    var ln  = parseFloat(cfg.locationLng);
    if(!isNaN(la) && !isNaN(ln) &&
       Math.abs(pos.lat - la) < 0.0003 &&
       Math.abs(pos.lng - ln) < 0.0003){
      found = s.storeId;
    }
  });
  return found;
}

/* ══════════════════════════════════════════════
   RESTAURAR todos los layers al estado original
   Solo display, opacity, filter, transform
   SIN tocar tooltips ni estructura
══════════════════════════════════════════════ */
function _restaurarLayers(){
  // Restaurar ocultos
  _hiddenLayers.forEach(function(el){
    if(el) el.style.display = '';
  });
  _hiddenLayers = [];

  // Restaurar grises (todos los markers visibles)
  if(window.map && window.L){
    window.map.eachLayer(function(layer){
      if(!(layer instanceof window.L.Marker)) return;
      var el = layer.getElement && layer.getElement();
      if(!el) return;
      el.style.opacity   = '';
      el.style.filter    = '';
      el.style.transform = '';
      el.style.transition= '';
    });
  }
  _modoFiltro = false;
}

/* ══════════════════════════════════════════════
   RESET COMPLETO — al borrar texto
   Restaura pins 20km, limpia box
══════════════════════════════════════════════ */
function resetFiltro(){
  hideBox();
  _restaurarLayers();
  _lastQ = '';
}

/* ══════════════════════════════════════════════
   PASO 3+4 — Usuario selecciona tienda en popup
   Pin seleccionado normal, resto grises, abre popup
══════════════════════════════════════════════ */
window._aiSeleccionar = function(lat, lng, id){
  if(!window.map) return;
  var la = parseFloat(lat), ln = parseFloat(lng);
  if(isNaN(la) || isNaN(ln)) return;

  // Reconstruir top del cache para mantener el filtro
  var q   = _lastQ;
  var res = _cache[q] || {top:[]};
  var top = res.top || [];

  // PASO 4 — actualizar mapa: seleccionada normal, resto grises
  filtrarMapa(top, id);

  // Volar al pin seleccionado
  window.map.setView([la, ln], 17, {animate: true});

  // Abrir popup del directorio sin tocarlo
  if(id && typeof window.openPopup === 'function'){
    setTimeout(function(){ window.openPopup(id); }, 420);
  }
};

/* ══════════════════════════════════════════════
   PASO 5 — Escuchar clearSearch original
   Cuando el usuario borra → reset completo
══════════════════════════════════════════════ */
var _origClearSearch = window.clearSearch;
window.clearSearch = function(){
  resetFiltro();
  if(typeof _origClearSearch === 'function') _origClearSearch();
};

})();
