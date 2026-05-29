
// PARCHE IA v3 — strip discreto + pines sutiles
// <script src="parche_ia_busqueda.js"></script> antes de </body>

(function(){

/* ── ESTILOS ── */
var css = document.createElement('style');
css.textContent =
  '@keyframes fadeStrip{from{opacity:0}to{opacity:1}}' +

  /* contenedor — altura fija pequeña, pegado bajo el buscador */
  '#ai-strip{' +
    'display:none;' +
    'height:26px;' +
    'padding:0 12px;' +
    'animation:fadeStrip .2s ease;' +
  '}' +

  /* scroll horizontal limpio */
  '#ai-row{' +
    'display:flex;' +
    'align-items:center;' +
    'gap:5px;' +
    'height:100%;' +
    'overflow-x:auto;' +
    'overflow-y:hidden;' +
    '-webkit-overflow-scrolling:touch;' +
    'scrollbar-width:none;' +
  '}' +
  '#ai-row::-webkit-scrollbar{display:none;}' +

  /* chip — muy pequeño, semitransparente */
  '.aic{' +
    'display:inline-flex;' +
    'align-items:center;' +
    'gap:3px;' +
    'flex-shrink:0;' +
    'border-radius:20px;' +
    'padding:2px 8px;' +
    'font-size:9.5px;' +
    'font-weight:600;' +
    'font-family:Inter,sans-serif;' +
    'white-space:nowrap;' +
    'cursor:pointer;' +
    'opacity:.82;' +
    'border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.08);' +
    'color:rgba(255,255,255,.75);' +
    'transition:opacity .15s;' +
  '}' +
  '.aic:active{opacity:.5;}' +
  '.aic.near{border-color:rgba(74,222,128,.3);color:#4ade80;}' +
  '.aic .cs{opacity:.5;font-weight:400;}' +

  /* anillo de highlight en el pin — NO desplaza nada */
  '.pin-hl > div{' +
    'box-shadow:0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px rgba(26,115,232,.7)!important;' +
    'transition:box-shadow .25s;' +
  '}' +

  /* punto de carga */
  '@keyframes sdot{0%,100%{opacity:.2}50%{opacity:.9}}' +
  '.ai-dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.5);animation:sdot .9s ease-in-out infinite;flex-shrink:0;}' +
  '.ai-dot:nth-child(2){animation-delay:.15s}' +
  '.ai-dot:nth-child(3){animation-delay:.3s}';

document.head.appendChild(css);

/* ── PANEL ── */
function insertPanel(){
  var wrap = document.querySelector('.search-wrap');
  if(!wrap){ setTimeout(insertPanel,200); return; }
  var d = document.createElement('div');
  d.id = 'ai-strip';
  d.innerHTML = '<div id="ai-row"></div>';
  wrap.insertAdjacentElement('afterend', d);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',insertPanel);
else insertPanel();

/* ── ESTADO ── */
var _cache={}, _lastQ='', _timer=null, _hlPins=[];

/* ── WRAP handleSearch ── */
function wrap(){
  var oh = window.handleSearch;
  var oc = window.clearSearch;

  window.handleSearch = function(val){
    if(oh) oh(val);
    clearTimeout(_timer);
    if(!val||val.trim().length<3){ hide(); clearHL(); return; }
    showDots();
    _timer = setTimeout(function(){ runAI(val.trim()); }, 500);
  };

  window.clearSearch = function(){
    if(oc) oc();
    _lastQ=''; hide(); clearHL();
  };
}
if(typeof window.handleSearch==='function') wrap();
else window.addEventListener('load', wrap);

function showDots(){
  var strip=document.getElementById('ai-strip');
  var row=document.getElementById('ai-row');
  if(!strip||!row) return;
  row.innerHTML='<div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>';
  strip.style.display='';
}
function hide(){
  var s=document.getElementById('ai-strip');
  if(s) s.style.display='none';
}

/* ── HAVERSINE ── */
function hv(a,b,c,d){
  var R=6371,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180;
  var x=Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);
  return (R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1);
}

/* ── IA ── */
async function runAI(q){
  if(q===_lastQ&&_cache[q]){ render(_cache[q]); return; }
  _lastQ=q;
  if(_cache[q]){ render(_cache[q]); return; }

  var stores=(window.nearbyStores&&window.nearbyStores.length)?window.nearbyStores:(window.ALL_STORES||[]);
  var ctx=stores.slice(0,50).map(function(s){
    var cfg=s.config||{};
    var la=parseFloat(cfg.locationLat),ln=parseFloat(cfg.locationLng);
    var dist=(window.userLat&&!isNaN(la))?hv(window.userLat,window.userLng,la,ln)+' km':'';
    return {id:s.storeId||'',nombre:s.nombre_tienda||s.name||'',tipo:cfg.tipoNegocio||cfg.tipo||'',
            localidad:cfg.localidad||cfg.city||'',keywords:cfg.keywords||'',dist:dist,
            lat:isNaN(la)?'':''+la,lng:isNaN(ln)?'':''+ln};
  });

  var p='Directorio Querétaro. Usuario busca:"'+q+'". Tiendas:'+JSON.stringify(ctx)+
        '\nResponde SOLO JSON sin markdown:{"top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}'+
        '\ntop máx 4 más relevantes. Si no hay coincidencias top=[].';

  try{
    var r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:400,
        messages:[{role:'user',content:p}]})
    });
    var d=await r.json();
    var t=(d.content||[]).map(function(b){return b.text||'';}).join('');
    t=t.replace(/```json|```/g,'').trim();
    var res=JSON.parse(t);
    _cache[q]=res;
    render(res);
  }catch(e){ hide(); clearHL(); }
}

/* ── RENDER ── */
function render(res){
  var strip=document.getElementById('ai-strip');
  var row=document.getElementById('ai-row');
  if(!strip||!row) return;

  var top=res.top||[];
  if(!top.length){ hide(); clearHL(); return; }

  var html='';
  top.forEach(function(t){
    var near=t.dist&&parseFloat(t.dist)<2;
    var sub=[t.tipo,t.localidad,t.dist].filter(Boolean).join(' · ');
    html+='<span class="aic'+(near?' near':'')+'" '
         +'onclick="window._aiGo(\''+t.lat+'\',\''+t.lng+'\',\''+t.id+'\')">'
         +(t.nombre||'Tienda')
         +(sub?'<span class="cs"> '+sub+'</span>':'')
         +'</span>';
  });

  row.innerHTML=html;
  strip.style.display='';

  // resaltar pines coincidentes
  highlightPins(top);
}

/* ── HIGHLIGHT PINES (solo anillo, sin opacar nada) ── */
function highlightPins(top){
  clearHL();
  if(!window.map||!window.L) return;
  var found=top.filter(function(t){return t.lat&&t.lng;}).map(function(t){
    return {lat:parseFloat(t.lat),lng:parseFloat(t.lng)};
  });
  if(!found.length) return;
  window.map.eachLayer(function(layer){
    if(!(layer instanceof window.L.Marker)) return;
    try{ var tt=layer.getTooltip&&layer.getTooltip();
      if(tt&&tt.getContent&&tt.getContent()==='Tu ubicación') return;
    }catch(e){}
    var pos=layer.getLatLng();
    var match=found.some(function(f){
      return Math.abs(pos.lat-f.lat)<0.0002&&Math.abs(pos.lng-f.lng)<0.0002;
    });
    if(match){
      var el=layer.getElement&&layer.getElement();
      if(el){ el.classList.add('pin-hl'); _hlPins.push(el); }
    }
  });
}

function clearHL(){
  _hlPins.forEach(function(el){if(el)el.classList.remove('pin-hl');});
  _hlPins=[];
}

/* ── CLICK CHIP → volar al pin ── */
window._aiGo=function(lat,lng,id){
  if(!window.map||!lat||!lng) return;
  var la=parseFloat(lat),ln=parseFloat(lng);
  if(isNaN(la)||isNaN(ln)) return;
  window.map.setView([la,ln],17,{animate:true});
  if(id&&typeof window.openPopup==='function')
    setTimeout(function(){window.openPopup(id);},450);
};

})();
