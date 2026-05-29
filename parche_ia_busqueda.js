// PARCHE IA v5 — iframe pequeño debajo del buscador
// <script src="parche_ia_busqueda.js"></script> antes de </body>

(function(){

var css = document.createElement('style');
css.textContent =
  '@keyframes fstrip{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}' +
  '#ai-iframe-wrap{' +
    'display:none;' +
    'padding:0 12px 6px;' +
    'animation:fstrip .2s ease;' +
    'flex-shrink:0;' +
    'z-index:1055;' +
  '}' +
  '#ai-iframe{' +
    'width:100%;' +
    'height:52px;' +
    'border:none;' +
    'border-radius:10px;' +
    'background:transparent;' +
    'display:block;' +
  '}';
document.head.appendChild(css);

/* ── INSERTAR debajo de .search-wrap ── */
function insertWrap(){
  var sw = document.querySelector('.search-wrap');
  if(!sw){ setTimeout(insertWrap,200); return; }
  var wrap = document.createElement('div');
  wrap.id = 'ai-iframe-wrap';
  wrap.innerHTML = '<iframe id="ai-iframe" scrolling="no"></iframe>';
  sw.insertAdjacentElement('afterend', wrap);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',insertWrap);
else insertWrap();

/* ── ESTADO ── */
var _cache={}, _lastQ='', _timer=null, _hlPins=[], _dimPins=[];

/* ── WRAP handleSearch ── */
function wrapHandlers(){
  var origHandle = window.handleSearch;
  var origClear  = window.clearSearch;

  window.handleSearch = function(val){
    if(origHandle) origHandle(val);
    clearTimeout(_timer);
    if(!val||val.trim().length<3){ hide(); resetPins(); return; }
    showLoading();
    _timer = setTimeout(function(){ runAI(val.trim()); }, 480);
  };

  window.clearSearch = function(){
    if(origClear) origClear();
    _lastQ=''; hide(); resetPins();
  };
}
if(typeof window.handleSearch==='function') wrapHandlers();
else window.addEventListener('load', wrapHandlers);

/* ── IFRAME CONTENT ── */
function setIframeContent(html){
  var iframe = document.getElementById('ai-iframe');
  if(!iframe) return;
  var doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function showLoading(){
  var wrap = document.getElementById('ai-iframe-wrap');
  if(wrap) wrap.style.display='';
  setIframeContent(
    '<html><body style="margin:0;background:rgba(0,0,0,.5);border-radius:10px;display:flex;align-items:center;padding:0 12px;height:52px;gap:5px;">' +
    '<span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.6);animation:d .9s ease-in-out infinite;display:inline-block;"></span>' +
    '<span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.6);animation:d .9s ease-in-out .15s infinite;display:inline-block;"></span>' +
    '<span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.6);animation:d .9s ease-in-out .3s infinite;display:inline-block;"></span>' +
    '<style>@keyframes d{0%,100%{opacity:.2}50%{opacity:1}}body{font-family:Inter,sans-serif;}</style>' +
    '</body></html>'
  );
}

function hide(){
  var wrap = document.getElementById('ai-iframe-wrap');
  if(wrap) wrap.style.display='none';
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
    return {id:s.storeId||'',nombre:s.nombre_tienda||s.name||'',
            tipo:cfg.tipoNegocio||cfg.tipo||'',localidad:cfg.localidad||cfg.city||'',
            keywords:cfg.keywords||'',dist:dist,
            lat:isNaN(la)?'':''+la,lng:isNaN(ln)?'':''+ln};
  });

  var p='Directorio Querétaro. Busca:"'+q+'". Tiendas:'+JSON.stringify(ctx)+
    '\nSolo JSON:{"top":[{"id":"","nombre":"","tipo":"","localidad":"","dist":"","lat":"","lng":""}]}'+
    '\ntop máx 4. Si no hay, top=[].';

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
  }catch(e){ hide(); resetPins(); }
}

/* ── RENDER ── */
function render(res){
  var top=res.top||[];
  if(!top.length){ hide(); resetPins(); return; }

  // Construir filas para el iframe
  var rows = top.map(function(t){
    var near = t.dist && parseFloat(t.dist)<2;
    var color = near ? '#4ade80' : '#fdba74';
    var sub = [t.tipo, t.localidad].filter(Boolean).join(' · ');
    return '<div onclick="parent._aiGo(\''+t.lat+'\',\''+t.lng+'\',\''+t.id+'\')" style="'
      +'display:flex;align-items:center;gap:8px;padding:4px 12px;cursor:pointer;'
      +'border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;min-width:0;">'
      +'<div style="width:6px;height:6px;border-radius:50%;background:'+color+';flex-shrink:0;"></div>'
      +'<div style="flex:1;min-width:0;overflow:hidden;">'
      +'<div style="font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+( t.nombre||'Tienda')+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(sub||'')+'</div>'
      +'</div>'
      +'<div style="font-size:9px;font-weight:700;color:'+color+';flex-shrink:0;">'+(t.dist||'')+'</div>'
      +'</div>';
  }).join('');

  var totalH = top.length * 40;
  document.getElementById('ai-iframe').style.height = totalH+'px';

  setIframeContent(
    '<html><body style="margin:0;padding:0;background:rgba(0,0,0,.52);border-radius:10px;overflow:hidden;font-family:Inter,sans-serif;">'
    + rows
    + '</body></html>'
  );

  document.getElementById('ai-iframe-wrap').style.display='';
  highlightPins(top);
}

/* ── PINES ── */
function highlightPins(top){
  resetPins();
  if(!window.map||!window.L) return;
  var found=top.filter(function(t){return t.lat&&t.lng;})
               .map(function(t){return{lat:parseFloat(t.lat),lng:parseFloat(t.lng)};});
  if(!found.length) return;
  window.map.eachLayer(function(layer){
    if(!(layer instanceof window.L.Marker)) return;
    try{ var tt=layer.getTooltip&&layer.getTooltip();
      if(tt&&tt.getContent&&tt.getContent()==='Tu ubicación') return;
    }catch(e){}
    var pos=layer.getLatLng();
    var match=found.some(function(f){
      return Math.abs(pos.lat-f.lat)<0.0003&&Math.abs(pos.lng-f.lng)<0.0003;
    });
    var el=layer.getElement&&layer.getElement();
    if(!el) return;
    if(match){ el.style.cssText+='filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 10px #1a73e8)!important;transition:filter .2s;'; _hlPins.push(el); }
    else     { el.style.cssText+='opacity:0.45;transform:scale(0.85);transition:opacity .2s,transform .2s;'; _dimPins.push(el); }
  });
}

function resetPins(){
  _hlPins.forEach(function(el){ if(el){ el.style.filter=''; el.style.opacity=''; el.style.transform=''; } });
  _dimPins.forEach(function(el){ if(el){ el.style.opacity=''; el.style.transform=''; } });
  _hlPins=[]; _dimPins=[];
}

window._aiGo=function(lat,lng,id){
  if(!window.map) return;
  var la=parseFloat(lat),ln=parseFloat(lng);
  if(isNaN(la)||isNaN(ln)) return;
  window.map.setView([la,ln],17,{animate:true});
  if(id&&typeof window.openPopup==='function')
    setTimeout(function(){window.openPopup(id);},420);
};

})();
