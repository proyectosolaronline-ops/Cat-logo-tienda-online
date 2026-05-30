// PARCHE IA v9 — _queryBus como puente central popup ↔ barra ↔ mapa
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
  if(!sp){ setTimeout(insertBox,200); return; }
  var results = document.getElementById('searchResults');
  if(!results){ setTimeout(insertBox,200); return; }
  var box = document.createElement('div');
  box.id = 'ai-box';
  sp.insertBefore(box, results);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', insertBox);
else insertBox();

/* ══════════════════════════════════════════════
   ESTADO
══════════════════════════════════════════════ */
var _queryBus  = '';      // ← PUENTE CENTRAL
var _cache     = {};
var _timer     = null;
var _matchIds  = [];
var _hiddenEls = [];
var _grayEls   = [];

/* ══════════════════════════════════════════════
   PUENTE — setQuery()
   Único punto de entrada para cualquier cambio
   de texto, venga de popup o de barra
══════════════════════════════════════════════ */
function setQuery(val){
  _queryBus = val || '';

  // 1. Sincronizar AMBOS inputs visualmente
  var i1 = document.getElementById('searchInput');
  var i2 = document.getElementById('searchInput2');
  if(i1 && i1.value !== _queryBus) i1.value = _queryBus;
  if(i2 && i2.value !== _queryBus) i2.value = _queryBus;

  // 2. Disparar handleSearch del directorio → barra+mapa reaccionan normal
  if(typeof window.handleSearch === 'function') window.handleSearch(_queryBus);

  // 3. Limpiar timer IA anterior
  clearTimeout(_timer);

  if(!_queryBus || _queryBus.trim().length < 3){
    // Reset completo
    hideBox();
    resetMapa();
    _matchIds = [];
    return;
  }

  // 4. IA en paralelo con debounce
  showLoad();
  _timer = setTimeout(function(){ runAI(_queryBus.trim()); }, 500);
}

/* ══════════════════════════════════════════════
   ESCUCHAR INPUTS — popup y barra pasan por setQuery
══════════════════════════════════════════════ */
window.addEventListener('load', function(){
  var i1 = document.getElementById('searchInput');
  var i2 = document.getElementById('searchInput2');

  // Popup escribe → setQuery (puente)
  if(i2) i2.addEventListener('input', function(e){
    setQuery(e.target.value);
  });

  // Barra principal escribe → setQuery (puente)
  // pero solo si el cambio viene del usuario (no del sync)
  if(i1) i1.addEventListener('input', function(e){
    if(e.target.value !== _queryBus) setQuery(e.target.value);
  });

  // Botón X barra principal
  var clearBtn = document.getElementById('clearBtn');
  if(clearBtn) clearBtn.addEventListener('click', function(){
    setQuery('');
  });

  // Botón X searchPanel
  var closeBtn = document.querySelector('.sp-close');
  if(closeBtn) closeBtn.addEventListener('click', function(){
    setQuery('');
  });
});

/* ══════════════════════════════════════════════
   UI BOX
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
   IA — respeta nearbyStores 20km
══════════════════════════════════════════════ */
async function runAI(q){
  // Si el query cambió mientras esperaba, ignorar
  if(q !== _queryBus.trim()) return;

  if(_cache[q]){ render(_cache[q]); return; }

  var stores = (window.nearbyStores && window.nearbyStores.length)
    ? window.nearbyStores : (window.ALL_STORES||[]);

  var ctx = stores.map(function(s){
    var cfg=s.config||{};
    var la=parseFloat(cfg.locationLat), ln=parseFloat(cfg.locationLng);
    var dist=(window.userLat&&!isNaN(la))
      ? hv(window.userLat,window.userLng,la,ln)+' km':'';
    return {
      id       : s.storeId||'',
      nombre   : s.nombre_tienda||s.name||'',
      tipo     : cfg.tipoNegocio||cfg.tipo||'',
      localidad: cfg.localidad||cfg.city||'',
      keywords : cfg.keywords||'',
      dist     : dist,
      lat      : isNaN(la)?'':''+la,
      lng      : isNaN(ln)?'':''+ln
    };
  });

  var prompt =
    'Directorio Querétaro. Busca:"'+q+'". Tiendas:'+JSON.stringify(ctx)+
    '\nSolo JSON sin texto extra:'+
    '{"top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}'+
    '\ntop máx 4 más relevantes. Si no hay, top=[].';

  try{
    var r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model     :'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages  :[{role:'user',content:prompt}]
      })
    });
    var d   = await r.json();
    var txt = (d.content||[]).map(function(b){return b.text||'';}).join('');
    txt = txt.replace(/```json|```/g,'').trim();
    var res = JSON.parse(txt);
    _cache[q] = res;
    // Solo renderizar si el query sigue siendo el mismo
    if(q === _queryBus.trim()) render(res);
  }catch(e){ hideBox(); }
}

/* ══════════════════════════════════════════════
   PASO 2 — RENDER popup + filtrar mapa
══════════════════════════════════════════════ */
function render(res){
  var top = res.top||[];
  var box = document.getElementById('ai-box');
  if(!box) return;

  if(!top.length){ hideBox(); resetMapa(); return; }

  // Popup: lista selector
  box.innerHTML = top.map(function(t){
    var near  = t.dist && parseFloat(t.dist)<2;
    var color = near ? '#16a34a' : '#1a73e8';
    var sub   = [t.tipo,t.localidad].filter(Boolean).join(' · ');
    var lat=t.lat||'', lng=t.lng||'', id=t.id||'';
    return '<div class="ai-row" onclick="window._aiSeleccionar(\''+lat+'\',\''+lng+'\',\''+id+'\')">'+
      '<div class="ai-dot-c" style="background:'+color+';"></div>'+
      '<div style="flex:1;min-width:0;">'+
      '<div class="ai-name">'+(t.nombre||'Tienda')+'</div>'+
      (sub?'<div class="ai-sub">'+sub+'</div>':'')+
      '</div>'+
      '<div class="ai-km" style="color:'+color+';">'+(t.dist||'')+'</div>'+
      '</div>';
  }).join('');
  box.style.display = '';

  // Mapa: coincidentes en gris, resto oculto
  _matchIds = top.map(function(t){ return t.id; });
  aplicarFiltroMapa(_matchIds, null);
}

/* ══════════════════════════════════════════════
   FILTRO MAPA — solo display/opacity/filter
   NO toca tooltips ni estructura markers
══════════════════════════════════════════════ */
function aplicarFiltroMapa(matchIds, selectedId){
  resetMapa();
  if(!window.map||!window.L) return;

  window.map.eachLayer(function(layer){
    if(!(layer instanceof window.L.Marker)) return;

    // Nunca tocar marcador usuario
    try{
      var tt=layer.getTooltip&&layer.getTooltip();
      if(tt&&tt.getContent&&tt.getContent()==='Tu ubicación') return;
    }catch(e){}

    var el = layer.getElement&&layer.getElement();
    if(!el) return;

    var sid = _getStoreId(layer);

    if(!sid || matchIds.indexOf(sid)===-1){
      // No coincide → ocultar
      el.style.display = 'none';
      _hiddenEls.push(el);
    } else if(selectedId && sid===selectedId){
      // PASO 4 — seleccionada: normal
      el.style.opacity   = '1';
      el.style.filter    = '';
      el.style.transform = '';
    } else {
      // Coincide pero no seleccionada: gris
      el.style.opacity   = '0.45';
      el.style.filter    = 'grayscale(1)';
      el.style.transition= 'opacity .2s,filter .2s';
      _grayEls.push(el);
    }
  });
}

/* ══════════════════════════════════════════════
   OBTENER storeId por coordenadas
══════════════════════════════════════════════ */
function _getStoreId(layer){
  var pos    = layer.getLatLng();
  var stores = (window.nearbyStores&&window.nearbyStores.length)
    ? window.nearbyStores : (window.ALL_STORES||[]);
  var found  = null;
  stores.forEach(function(s){
    var cfg=s.config||{};
    var la=parseFloat(cfg.locationLat),ln=parseFloat(cfg.locationLng);
    if(!isNaN(la)&&!isNaN(ln)&&
       Math.abs(pos.lat-la)<0.0003&&
       Math.abs(pos.lng-ln)<0.0003){
      found=s.storeId;
    }
  });
  return found;
}

/* ══════════════════════════════════════════════
   RESET MAPA — restaura pins 20km intactos
══════════════════════════════════════════════ */
function resetMapa(){
  _hiddenEls.forEach(function(el){
    if(el) el.style.display='';
  });
  _grayEls.forEach(function(el){
    if(el){
      el.style.opacity   ='';
      el.style.filter    ='';
      el.style.transform ='';
      el.style.transition='';
    }
  });
  _hiddenEls=[];
  _grayEls  =[];
}

/* ══════════════════════════════════════════════
   PASO 3+4 — Click en popup → selecciona tienda
══════════════════════════════════════════════ */
window._aiSeleccionar = function(lat, lng, id){
  if(!window.map) return;
  var la=parseFloat(lat), ln=parseFloat(lng);
  if(isNaN(la)||isNaN(ln)) return;

  // Pin seleccionado normal, resto gris
  aplicarFiltroMapa(_matchIds, id);

  // Volar al pin
  window.map.setView([la,ln],17,{animate:true});

  // Abrir popup directorio sin tocarlo
  if(id && typeof window.openPopup==='function'){
    setTimeout(function(){ window.openPopup(id); },420);
  }
};

})();
