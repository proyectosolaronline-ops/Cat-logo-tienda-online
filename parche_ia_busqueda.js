// PARCHE IA v6 — iframe dentro del searchPanel (z-index respetado)
// <script src="parche_ia_busqueda.js"></script> antes de </body>
(function(){

/* ── ESTILOS ── */
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

/* ── INSERTAR #ai-box dentro del searchPanel, antes de sp-results ── */
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

/* ── ESTADO ── */
var _cache={}, _lastQ='', _timer=null, _hlPins=[], _dimPins=[];

/* ── ESCUCHAR INPUT — sin tocar handleSearch ── */
window.addEventListener('load', function(){
  var i1 = document.getElementById('searchInput');
  var i2 = document.getElementById('searchInput2');
  if(i1) i1.addEventListener('input', function(e){ onInput(e.target.value); });
  if(i2) i2.addEventListener('input', function(e){ onInput(e.target.value); });

  // limpiar al cerrar panel
  var closeBtn = document.querySelector('.sp-close');
  if(closeBtn) closeBtn.addEventListener('click', function(){ hide(); resetPins(); });
});

function onInput(val){
  clearTimeout(_timer);
  if(!val || val.trim().length < 3){ hide(); resetPins(); return; }
  showLoad();
  _timer = setTimeout(function(){ runAI(val.trim()); }, 500);
}

/* ── UI ── */
function showLoad(){
  var box = document.getElementById('ai-box');
  if(!box) return;
  box.style.display = '';
  box.innerHTML = '<div class="ai-load"><div class="ald"></div><div class="ald"></div><div class="ald"></div><span>Buscando con IA…</span></div>';
}
function hide(){
  var box = document.getElementById('ai-box');
  if(box){ box.style.display='none'; box.innerHTML=''; }
}

/* ── HAVERSINE ── */
function hv(a,b,c,d){
  var R=6371,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180;
  var x=Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
  return (R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1);
}

/* ── IA ── */
async function runAI(q){
  if(q===_lastQ && _cache[q]){ render(_cache[q]); return; }
  _lastQ = q;
  if(_cache[q]){ render(_cache[q]); return; }

  var stores = (window.nearbyStores&&window.nearbyStores.length)
    ? window.nearbyStores : (window.ALL_STORES||[]);

  var ctx = stores.slice(0,50).map(function(s){
    var cfg=s.config||{};
    var la=parseFloat(cfg.locationLat), ln=parseFloat(cfg.locationLng);
    var dist=(window.userLat&&!isNaN(la))? hv(window.userLat,window.userLng,la,ln)+' km':'';
    return {id:s.storeId||'', nombre:s.nombre_tienda||s.name||'',
            tipo:cfg.tipoNegocio||cfg.tipo||'', localidad:cfg.localidad||cfg.city||'',
            keywords:cfg.keywords||'', dist:dist,
            lat:isNaN(la)?'':''+la, lng:isNaN(ln)?'':''+ln};
  });

  var p = 'Directorio Querétaro. Busca:"'+q+'". Tiendas:'+JSON.stringify(ctx)+
    '\nSolo JSON sin texto extra:{"top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}'+
    '\ntop máx 4 más relevantes. Si no hay, top=[].';

  try{
    var r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-20250514', max_tokens:400,
        messages:[{role:'user',content:p}]})
    });
    var d = await r.json();
    var t = (d.content||[]).map(function(b){return b.text||'';}).join('');
    t = t.replace(/```json|```/g,'').trim();
    var res = JSON.parse(t);
    _cache[q] = res;
    render(res);
  }catch(e){ hide(); resetPins(); }
}

/* ── RENDER ── */
function render(res){
  var top = res.top||[];
  var box = document.getElementById('ai-box');
  if(!box) return;
  if(!top.length){ hide(); resetPins(); return; }

  box.innerHTML = top.map(function(t){
    var near  = t.dist && parseFloat(t.dist) < 2;
    var color = near ? '#16a34a' : '#1a73e8';
    var sub   = [t.tipo, t.localidad].filter(Boolean).join(' · ');
    var lat   = t.lat||'', lng=t.lng||'', id=t.id||'';
    return '<div class="ai-row" onclick="window._aiGo(\''+lat+'\',\''+lng+'\',\''+id+'\')">'
      + '<div class="ai-dot-c" style="background:'+color+';"></div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="ai-name">'+(t.nombre||'Tienda')+'</div>'
      + (sub?'<div class="ai-sub">'+sub+'</div>':'')
      + '</div>'
      + '<div class="ai-km" style="color:'+color+';">'+(t.dist||'')+'</div>'
      + '</div>';
  }).join('');

  box.style.display = '';
  highlightPins(top);
}

/* ── PINES ── */
function highlightPins(top){
  resetPins();
  if(!window.map||!window.L) return;
  var found = top.filter(function(t){return t.lat&&t.lng;})
                 .map(function(t){return{lat:parseFloat(t.lat),lng:parseFloat(t.lng)};});
  if(!found.length) return;
  window.map.eachLayer(function(layer){
    if(!(layer instanceof window.L.Marker)) return;
    try{ var tt=layer.getTooltip&&layer.getTooltip();
      if(tt&&tt.getContent&&tt.getContent()==='Tu ubicación') return;
    }catch(e){}
    var pos   = layer.getLatLng();
    var match = found.some(function(f){
      return Math.abs(pos.lat-f.lat)<0.0003 && Math.abs(pos.lng-f.lng)<0.0003;
    });
    var el = layer.getElement&&layer.getElement();
    if(!el) return;
    if(match){
      el.style.filter = 'drop-shadow(0 0 5px #fff) drop-shadow(0 0 8px #1a73e8)';
      el.style.transition = 'filter .2s';
      _hlPins.push(el);
    } else {
      el.style.opacity = '0.4';
      el.style.transform = 'scale(0.82)';
      el.style.transition = 'opacity .2s,transform .2s';
      _dimPins.push(el);
    }
  });
}

function resetPins(){
  _hlPins.forEach(function(el){
    if(el){ el.style.filter=''; el.style.transition=''; }
  });
  _dimPins.forEach(function(el){
    if(el){ el.style.opacity=''; el.style.transform=''; el.style.transition=''; }
  });
  _hlPins=[]; _dimPins=[];
}

/* ── CLICK FILA → volar al pin ── */
window._aiGo = function(lat,lng,id){
  if(!window.map) return;
  var la=parseFloat(lat), ln=parseFloat(lng);
  if(isNaN(la)||isNaN(ln)) return;
  window.map.setView([la,ln],17,{animate:true});
  if(id && typeof window.openPopup==='function')
    setTimeout(function(){ window.openPopup(id); }, 420);
};

})();
