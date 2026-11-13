(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const scene = $('#scene'), backdrop = $('#backdrop'), canvas = $('#refraction-canvas');
  const ctx = backdrop.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)');
  const state = {scene:'coast', material:'clear', refraction:72, blur:8, pressure:80, effects:!reducedTransparency.matches, theme:'light', renderer:'css', frames:0};
  const sceneNames = ['coast', 'spectrum', 'grid'];
  const sceneLabels = ['COASTLINE, A MOMENT OF CALM', 'SPECTRUM, A STUDY IN LIGHT', 'GRIDLINES, A NEW PERSPECTIVE'];
  const photo = new Image();
  let photoLoaded = false, pendingFrame = 0, sourceDirty = true, sceneWidth = 1, sceneHeight = 1;
  let gl, program, texture, blurTexture, cachedBlurRadius=-1;
  const blurredBackdrop=document.createElement('canvas'), paddedBackdrop=document.createElement('canvas');
  const blurPaint=blurredBackdrop.getContext('2d'), paddingPaint=paddedBackdrop.getContext('2d');
  const canCacheBlur=Boolean(blurPaint&&paddingPaint&&'filter' in blurPaint);
  const loc = {};
  const surfaces = Array.from(scene.querySelectorAll('.glass-surface')).map(element => ({element, face:element.querySelector(':scope > .glass-face'), pressure:0, velocity:0, target:0}));
  // Draw the parent before its nested selection. The foreground stays in native DOM.
  surfaces.sort((a,b) => a.element.classList.contains('scene-dock') ? -1 : b.element.classList.contains('scene-dock') ? 1 : 0);
  const lensSurface = surfaces.find(s => s.element.id === 'lens');
  const dock = $('.scene-dock'), selection = $('.scene-selection');
  const dockSurface = surfaces.find(s=>s.element===dock);
  const selectionSurface = surfaces.find(s=>s.element===selection);
  const dockMotion = {position:0, target:0, velocity:0};
  let dockDrag = null;
  const saved = new Set();
  try { const data = JSON.parse(localStorage.getItem('liquid-glass-scenes') || '[]'); if(Array.isArray(data)) data.filter(x=>sceneNames.includes(x)).forEach(x=>saved.add(x)); } catch {}
  let toastTimer;
  function toast(message) { const element=$('.toast'); element.textContent=message; element.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove('visible'),2200); }

  const vertex = `attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `precision highp float;
    uniform sampler2D u_source;
    uniform sampler2D u_blurred;
    uniform float u_cachedBlur;
    uniform vec2 u_resolution;
    uniform vec2 u_scene;
    uniform vec4 u_rects[5];
    uniform vec2 u_properties[5];
    uniform float u_strength;
    uniform float u_blur;
    uniform float u_tint;
    float sdf(vec2 p,vec2 halfSize,float r){vec2 q=abs(p)-halfSize+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
    vec3 sampleAt(vec2 p,float b){
      vec2 uv=clamp(p/u_scene,vec2(.001),vec2(.999));
      if(u_cachedBlur>.5){
        float clarity=1.-clamp(b/max(u_blur,.001),0.,1.);
        return mix(texture2D(u_blurred,uv).rgb,texture2D(u_source,uv).rgb,clarity);
      }
      vec2 d=vec2(b)/u_scene;
      vec3 c=texture2D(u_source,uv).rgb*.28;
      c+=texture2D(u_source,clamp(uv+vec2(d.x,0.),vec2(.001),vec2(.999))).rgb*.12;
      c+=texture2D(u_source,clamp(uv-vec2(d.x,0.),vec2(.001),vec2(.999))).rgb*.12;
      c+=texture2D(u_source,clamp(uv+vec2(0.,d.y),vec2(.001),vec2(.999))).rgb*.12;
      c+=texture2D(u_source,clamp(uv-vec2(0.,d.y),vec2(.001),vec2(.999))).rgb*.12;
      c+=texture2D(u_source,clamp(uv+d*.7,vec2(.001),vec2(.999))).rgb*.06;
      c+=texture2D(u_source,clamp(uv-d*.7,vec2(.001),vec2(.999))).rgb*.06;
      c+=texture2D(u_source,clamp(uv+vec2(d.x,-d.y)*.7,vec2(.001),vec2(.999))).rgb*.06;
      c+=texture2D(u_source,clamp(uv+vec2(-d.x,d.y)*.7,vec2(.001),vec2(.999))).rgb*.06;
      return c;
    }
    void main(){
      vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y)*u_scene/u_resolution;
      vec4 result=vec4(0.);
      for(int i=0;i<5;i++){
        vec4 rect=u_rects[i];
        vec2 halfSize=rect.zw*.5;
        vec2 p=pixel-rect.xy-halfSize;
        float radius=u_properties[i].x;
        float press=u_properties[i].y;
        float distance=sdf(p,halfSize,radius);
        if(distance<0.){
          float dx=sdf(p+vec2(.5,0.),halfSize,radius)-sdf(p-vec2(.5,0.),halfSize,radius);
          float dy=sdf(p+vec2(0.,.5),halfSize,radius)-sdf(p-vec2(0.,.5),halfSize,radius);
          vec2 normal=normalize(vec2(dx,dy)+vec2(.00001));
          float depth=-distance;
          float band=min(28.,halfSize.y*.55)*(1.+press*.32);
          float rim=1.-smoothstep(0.,band,depth);
          float bend=(-sin(rim*3.14159265)*(15.+press*34.)+pow(rim,9.)*(6.+press*10.))*u_strength;
          vec2 offset=normal*bend-p*(.018+press*.038)*u_strength;
          float blur=u_blur*(1.-press*.48);
          vec2 samplePoint=pixel+offset;
          vec3 color=sampleAt(samplePoint,blur);
          // Subpixel wavelength separation: stronger under pressure, capped at 1.5 px.
          float chroma=pow(rim,3.)*min(1.5,(.35+press*1.45)*u_strength);
          color.r=sampleAt(samplePoint+normal*chroma,blur).r;
          color.b=sampleAt(samplePoint-normal*chroma,blur).b;
          color=mix(color,vec3(1.),u_tint*(1.-press*.58));
          float lip=1.-smoothstep(.2,1.7,depth);
          float light=dot(normal,normalize(vec2(-.65,-.8)));
          color+=vec3(max(light,0.)*.48+max(-light,0.)*.14)*lip;
          color-=vec3(.05)*pow(rim,3.)*max(-light,0.);
          // A faint pearl-like spectrum sits just inside the lip, never across the face.
          float spectralBand=smoothstep(.8,2.,depth)*(1.-smoothstep(2.,5.,depth));
          float phase=atan(normal.y,normal.x)*1.3+depth*.45;
          vec3 spectrum=.5+.5*cos(phase+vec3(0.,2.0944,4.1888));
          float sheen=spectralBand*(.025+press*.045)*u_strength;
          color=mix(color,spectrum*.65+vec3(.35),sheen);
          result=vec4(color,smoothstep(0.,.7,depth));
        }
      }
      gl_FragColor=result;
    }`;
  function compile(type, code) { const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader; }
  function fallback() { state.renderer='css';scene.classList.add('no-webgl');canvas.hidden=true;$('#render-status').textContent='通透磨砂 · 兼容模式';$('#refraction').disabled=true; }
  function setupGL() {
    try {
      gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,powerPreference:'low-power',preserveDrawingBuffer:true});
      if(!gl) throw new Error('WebGL unavailable');
      program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      ['source','blurred','cachedBlur','resolution','scene','strength','blur','tint','rects[0]','properties[0]'].forEach(name=>loc[name]=gl.getUniformLocation(program,'u_'+name));
      function createTexture(unit){const t=gl.createTexture();gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;}
      texture=createTexture(gl.TEXTURE0);blurTexture=createTexture(gl.TEXTURE1);gl.uniform1i(loc.source,0);gl.uniform1i(loc.blurred,1);gl.uniform1f(loc.cachedBlur,canCacheBlur?1:0);cachedBlurRadius=-1;
      state.renderer='webgl';$('#render-status').textContent='实时光学折射';
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
      canvas.addEventListener('webglcontextrestored',()=>{setupGL();sourceDirty=true;updateControls();schedule();});
    } catch(error) { console.info('Glass rendering fallback:',error.message);fallback(); }
  }

  function coverImage(image) {
    const scale=Math.max(sceneWidth/image.naturalWidth,sceneHeight/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.drawImage(image,(sceneWidth-w)*.5,(sceneHeight-h)*.5,w,h);
  }
  function paintBackdrop() {
    const width=scene.clientWidth,height=scene.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    sceneWidth=width;sceneHeight=height;
    backdrop.width=Math.round(width*dpr);backdrop.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#2e788d';ctx.fillRect(0,0,width,height);
    if(state.scene==='coast') {
      if(photoLoaded)coverImage(photo);
      else {const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#096477');g.addColorStop(.55,'#75bdc0');g.addColorStop(1,'#ebe1c3');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
      const shade=ctx.createLinearGradient(0,0,width,height);shade.addColorStop(0,'#14374438');shade.addColorStop(.6,'#1437440a');shade.addColorStop(1,'#123b4222');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
    } else if(state.scene==='spectrum') {
      ctx.fillStyle='#1b2350';ctx.fillRect(0,0,width,height);
      const colors=[['#b3a9f9',.1,.2],['#ff9d83',.8,.7],['#8bd4e2',.8,.02],['#cc8be0',.22,.85]];
      for(const [color,x,y] of colors){const g=ctx.createRadialGradient(width*x,height*y,0,width*x,height*y,width*.75);g.addColorStop(0,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
      ctx.save();ctx.globalAlpha=.34;
      for(let i=0;i<75;i++){const t=i/74;ctx.strokeStyle=`rgba(255,255,255,${Math.sin(t*Math.PI)*.7})`;ctx.lineWidth=1;ctx.beginPath();for(let j=0;j<=100;j++){const x=j/100*width,y=height*(.38+t*.5+Math.sin(j/100*5.5+t*1.5)*.2);j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();
    } else {
      ctx.fillStyle='#e8eee9';ctx.fillRect(0,0,width,height);
      const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#e9ded5');g.addColorStop(.5,'#e0e8de');g.addColorStop(1,'#b3cdd9');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
      ctx.strokeStyle='#5a7f8a48';ctx.lineWidth=.7;ctx.beginPath();for(let x=0;x<width;x+=24){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=0;y<height;y+=24){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();
      ctx.fillStyle='#b9cbd1';ctx.beginPath();ctx.arc(width*.72,height*.49,Math.min(width,height)*.23,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#698a98';ctx.lineWidth=1.5;for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(width*.72,height*.49,24+i*14,0,Math.PI*2);ctx.stroke();}
    }
    const mobile=width<500;
    const textX=mobile?24:38;
    const fontSize=mobile?Math.min(width*.169,76):Math.min(width*.092,87);
    ctx.fillStyle=state.scene==='grid'?'#314b55':'#fff';
    ctx.font=`500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
    ctx.letterSpacing='-3px';
    const start=mobile?height*.255:height*.27;
    const words=state.scene==='spectrum'?['Light.','In motion.']:state.scene==='grid'?['A new','perspective.']:['Stay in','the flow.'];
    ctx.fillText(words[0],textX,start);ctx.fillText(words[1],textX,start+fontSize*1.04);
    ctx.letterSpacing='0px';ctx.font='10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';ctx.globalAlpha=.83;
    ctx.fillText(state.scene==='coast'?'慢下来，让灵感自然发生。':state.scene==='spectrum'?'每一道光，都有自己的形状。':'换个角度，发现不一样的日常。',textX,start+fontSize*1.04+28);
    ctx.globalAlpha=1;
    sourceDirty=true;schedule();
  }

  // Cache a smooth blur when its input changes, rather than blurring every frame.
  // Extend the actual edge pixels so the glass never samples transparent dark fringes.
  function paintBlurredBackdrop(radius){
    if(!canCacheBlur)return backdrop;
    const w=backdrop.width,h=backdrop.height,pad=Math.ceil(radius*backdrop.width/sceneWidth*3)+2;
    paddedBackdrop.width=w+pad*2;paddedBackdrop.height=h+pad*2;
    const xs=[[0,1,0,pad],[0,w,pad,w],[w-1,1,pad+w,pad]];
    const ys=[[0,1,0,pad],[0,h,pad,h],[h-1,1,pad+h,pad]];
    for(const [sx,sw,dx,dw] of xs)for(const [sy,sh,dy,dh] of ys)paddingPaint.drawImage(backdrop,sx,sy,sw,sh,dx,dy,dw,dh);
    blurredBackdrop.width=w;blurredBackdrop.height=h;
    blurPaint.filter=`blur(${radius*backdrop.width/sceneWidth}px)`;
    blurPaint.drawImage(paddedBackdrop,-pad,-pad);blurPaint.filter='none';
    return blurredBackdrop;
  }

  let previousTime=0;
  function schedule() {if(!pendingFrame&&!document.hidden)pendingFrame=requestAnimationFrame(render);}
  function render(time) {
    pendingFrame=0;
    const dt=Math.min((time-(previousTime||time-16))/1000,.032);previousTime=time;
    let animating=false;
    const amount=state.pressure/100;
    if(!dockDrag){
      if(reducedMotion.matches){dockMotion.position=dockMotion.target;dockMotion.velocity=0;}
      else {
        dockMotion.velocity+=((dockMotion.target-dockMotion.position)*500-dockMotion.velocity*42)*dt;
        dockMotion.position+=dockMotion.velocity*dt;
        if(Math.abs(dockMotion.target-dockMotion.position)<.0002&&Math.abs(dockMotion.velocity)<.001){dockMotion.position=dockMotion.target;dockMotion.velocity=0;}else animating=true;
      }
    }
    positionSelection();
    for(const s of surfaces){
      if(reducedMotion.matches || !state.effects){s.pressure=s.target;s.velocity=0;}
      else {s.velocity+=((s.target-s.pressure)*460-s.velocity*35)*dt;s.pressure+=s.velocity*dt;if(Math.abs(s.target-s.pressure)<.0003&&Math.abs(s.velocity)<.001){s.pressure=s.target;s.velocity=0;}else animating=true;}
      const p=reducedMotion.matches||!state.effects?0:s.pressure*amount;
      s.face.style.transform=`scale(${1+p*(s===lensSurface ? .095 : .07)},${1-p*(s===lensSurface ? .08 : .085)})`;
    }
    drawRanges(dt);
    if(gl&&state.renderer==='webgl'&&state.effects&&!gl.isContextLost()){
      canvas.hidden=false;const dpr=Math.min(devicePixelRatio||1,1.75),w=Math.round(sceneWidth*dpr),h=Math.round(sceneHeight*dpr);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.useProgram(program);gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      const blurRadius=state.blur*.11;
      if(sourceDirty||cachedBlurRadius!==blurRadius){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,blurTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,paintBlurredBackdrop(blurRadius));gl.activeTexture(gl.TEXTURE0);cachedBlurRadius=blurRadius;}
      if(sourceDirty){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,backdrop);sourceDirty=false;}
      gl.uniform2f(loc.resolution,w,h);gl.uniform2f(loc.scene,sceneWidth,sceneHeight);gl.uniform1f(loc.strength,state.refraction/100);gl.uniform1f(loc.blur,blurRadius);gl.uniform1f(loc.tint,state.material==='frosted'?.25:.045);
      const bounds=scene.getBoundingClientRect(),rects=[],properties=[];
      for(const s of surfaces){const r=s.face.getBoundingClientRect();rects.push(r.left-bounds.left,r.top-bounds.top,r.width,r.height);const computed=getComputedStyle(s.face);const radius=Math.min(parseFloat(computed.borderTopLeftRadius)*(1+s.pressure*.04),r.height/2);properties.push(radius,s.pressure*amount);}
      gl.uniform4fv(loc['rects[0]'],rects);gl.uniform2fv(loc['properties[0]'],properties);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);state.frames++;
    } else canvas.hidden=true;
    if(animating||ranges.some(r=>Math.abs(r.p-r.target)>.001))schedule();
    if(!animating)previousTime=0;
  }

  // The sliders use their actual track as an optical input, redrawn only on interaction.
  const ranges=Array.from(document.querySelectorAll('.range-shell')).map(shell=>({shell,input:shell.querySelector('input'),canvas:shell.querySelector('canvas'),p:0,target:0}));
  function drawRanges(dt) {
    for(const r of ranges){
      r.p=reducedMotion.matches?r.target:r.p+(r.target-r.p)*Math.min(1,dt*19);
      if(Math.abs(r.target-r.p)<.001)r.p=r.target;
      const w=r.shell.clientWidth,h=29,dpr=Math.min(devicePixelRatio||1,2),paint=r.canvas.getContext('2d');
      if(r.canvas.width!==Math.round(w*dpr)||r.canvas.height!==h*dpr){r.canvas.width=Math.round(w*dpr);r.canvas.height=h*dpr;}
      paint.setTransform(dpr,0,0,dpr,0,0);paint.clearRect(0,0,w,h);
      const dark=state.theme==='dark',progress=Number(r.input.value)/100,thumbX=12+progress*(w-24),y=14;
      paint.fillStyle=dark?'#37424a':'#e8ebef';paint.beginPath();paint.roundRect(0,y-2,w,4,2);paint.fill();
      paint.fillStyle='#1387f4';paint.beginPath();paint.roundRect(0,y-2,thumbX,4,2);paint.fill();
      const p=state.effects&&!reducedMotion.matches?r.p:0,tw=23+p*13,th=23-p*1.5;
      paint.save();paint.shadowColor='#20364b25';paint.shadowBlur=p?5:3;paint.shadowOffsetY=2;
      const fill=paint.createLinearGradient(0,y-th/2,0,y+th/2);fill.addColorStop(0,p?'#ffffff25':'#fff');fill.addColorStop(.5,p?'#ffffff08':'#f8fafc');fill.addColorStop(1,p?'#c5d4dc40':'#f1f5f7');
      paint.fillStyle=fill;paint.beginPath();paint.roundRect(thumbX-tw/2,y-th/2,tw,th,10);paint.fill();paint.shadowBlur=0;paint.shadowOffsetY=0;
      if(p>.02){paint.save();paint.clip();paint.strokeStyle='#1387f4';paint.lineWidth=3.5;paint.beginPath();paint.moveTo(thumbX-tw/2,y-1.5);paint.bezierCurveTo(thumbX-tw/3,y+3.8,thumbX-3,y-2,thumbX,y);paint.stroke();paint.strokeStyle=dark?'#4a5c68':'#d7dee3';paint.beginPath();paint.moveTo(thumbX,y);paint.bezierCurveTo(thumbX+tw/4,y+2,thumbX+tw/3,y-3.8,thumbX+tw/2,y-1);paint.stroke();paint.restore();}
      paint.strokeStyle=p?'#ffffffee':'#b9c6cf6f';paint.lineWidth=1;paint.beginPath();paint.roundRect(thumbX-tw/2+.5,y-th/2+.5,tw-1,th-1,10);paint.stroke();paint.restore();
    }
  }
  function updateControls(){
    for(const name of ['refraction','blur','pressure']){const input=$('#'+name);input.value=state[name];$('#'+name+'-value').innerHTML=`${state[name]}<span>%</span>`;input.disabled=!state.effects||(name==='refraction'&&state.renderer!=='webgl');}
    $('#effects').checked=state.effects;document.documentElement.dataset.effects=state.effects?'on':'off';
    canvas.hidden=!state.effects||state.renderer!=='webgl';
    scene.style.setProperty('--fallback-blur',`${state.blur*.11}px`);
    scene.style.setProperty('--fallback-tint',state.material==='frosted'?'#ffffff40':'#ffffff12');
    $('#render-status').textContent=!state.effects?'原始画面 · 效果已关闭':state.renderer==='webgl'?'实时光学折射':'通透磨砂 · 兼容模式';
    schedule();
  }
  function releaseAll(){finishDockDrag(true);for(const s of surfaces){s.target=0;delete s.element.dataset.pressed;}for(const r of ranges)r.target=0;schedule();}
  function press(surface,event){if(event&&!event.isPrimary)return;surface.target=1;surface.element.dataset.pressed='true';schedule();}
  for(const s of surfaces){
    if(s.element.classList.contains('scene-selection')||s.element.classList.contains('scene-dock'))continue;
    s.element.addEventListener('pointerdown',event=>{if(event.button!==0)return;press(s,event);});
    s.element.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();press(s);}});
    s.element.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){s.target=0;delete s.element.dataset.pressed;if(s!==lensSurface)s.element.click();schedule();}});
    s.element.addEventListener('blur',()=>{s.target=0;delete s.element.dataset.pressed;schedule();});
  }
  document.addEventListener('pointerup',releaseAll);document.addEventListener('pointercancel',releaseAll);addEventListener('blur',()=>{drag=null;releaseAll();});
  for(const r of ranges){
    r.input.addEventListener('input',()=>{state[r.input.id]=Number(r.input.value);updateControls();});
    r.input.addEventListener('pointerdown',()=>{r.target=1;schedule();});r.input.addEventListener('keydown',()=>{r.target=1;schedule();});r.input.addEventListener('keyup',()=>{r.target=0;schedule();});r.input.addEventListener('blur',()=>{r.target=0;schedule();});
  }
  for(const b of document.querySelectorAll('[data-material]'))b.addEventListener('click',()=>{
    state.material=b.dataset.material;state.blur=state.material==='frosted'?62:8;
    document.querySelectorAll('[data-material]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected));});
    $('.material-indicator').style.left=state.material==='frosted'?'50%':'4px';
    $('#material-description').textContent=state.material==='frosted'?'柔化背景的细节，让眼前的内容更加清晰。':'让背景自然透过，留下恰到好处的光。';updateControls();
  });
  $('#effects').addEventListener('change',event=>{state.effects=event.target.checked;releaseAll();updateControls();});
  function updateSaved(){const active=saved.has(state.scene);$('#favorite').setAttribute('aria-pressed',String(active));$('#favorite').setAttribute('aria-label',active?'取消收藏这个场景':'收藏这个场景');}
  function selectScene(name){
    if(!sceneNames.includes(name))return;state.scene=name;const index=sceneNames.indexOf(name);
    scene.style.setProperty('--scene-ink',name==='grid'?'#314b55':'#fff');
    dockMotion.target=index;
    document.querySelectorAll('[data-scene]').forEach(x=>{const active=x.dataset.scene===name;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
    $('#scene-count').innerHTML=`0${index+1} <i>/ 03</i>`;$('#scene-location').textContent=sceneLabels[index];
    backdrop.setAttribute('aria-label',`${['海岸摄影','彩色光谱','细线网格'][index]}与排版背景`);updateSaved();paintBackdrop();
  }
  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>selectScene(b.dataset.scene)));
  function positionSelection(){selection.style.left=`${5+dockMotion.position*(dock.clientWidth-10)/3}px`;}
  function pressDock(pressed){selectionSurface.target=pressed?1:0;dockSurface.target=pressed ? .35 : 0;dock.toggleAttribute('data-pressed',pressed);schedule();}
  function trackDock(clientX){
    const bounds=dock.getBoundingClientRect(),slot=(bounds.width-10)/3;
    // Preserve where the selected glass was grabbed; never tween pointer movement.
    dockMotion.position=Math.max(0,Math.min(2,(clientX-bounds.left-5-dockDrag.offset-slot/2)/slot));
    positionSelection();
    const name=sceneNames[Math.round(dockMotion.position)];
    if(name!==state.scene)selectScene(name);
    schedule();
  }
  function finishDockDrag(cancelled){
    if(!dockDrag)return;
    const {id,startScene}=dockDrag;dockDrag=null;delete dock.dataset.dragging;
    if(cancelled&&state.scene!==startScene)selectScene(startScene);
    dockMotion.target=sceneNames.indexOf(state.scene);pressDock(false);
    if(dock.hasPointerCapture(id))dock.releasePointerCapture(id);
    schedule();
  }
  dock.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||dockDrag)return;
    const bounds=dock.getBoundingClientRect(),slot=(bounds.width-10)/3;
    const center=bounds.left+5+(dockMotion.position+.5)*slot;
    const onGlass=Math.abs(event.clientX-center)<=slot/2;
    dockDrag={id:event.pointerId,startScene:state.scene,offset:onGlass?event.clientX-center:0};
    dockMotion.velocity=0;dock.dataset.dragging='true';dock.setPointerCapture(event.pointerId);
    pressDock(true);trackDock(event.clientX);
  });
  dock.addEventListener('pointermove',event=>{if(dockDrag?.id===event.pointerId)trackDock(event.clientX);});
  dock.addEventListener('pointerup',event=>{if(dockDrag?.id!==event.pointerId)return;trackDock(event.clientX);finishDockDrag(false);});
  dock.addEventListener('pointercancel',event=>{if(dockDrag?.id===event.pointerId)finishDockDrag(true);});
  dock.addEventListener('lostpointercapture',event=>{if(dockDrag?.id===event.pointerId)finishDockDrag(true);});
  // Pointer gestures already commit their selection; ignore the ensuing click.
  // Native keyboard and assistive-technology clicks keep their usual behavior.
  dock.addEventListener('click',event=>{if(event.detail>0){event.preventDefault();event.stopPropagation();}},true);
  dock.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-scene]'))return;
    const index=sceneNames.indexOf(event.target.dataset.scene);
    const next={ArrowLeft:Math.max(0,index-1),ArrowRight:Math.min(2,index+1),Home:0,End:2}[event.key];
    if(next!==undefined){event.preventDefault();selectScene(sceneNames[next]);dock.querySelectorAll('[data-scene]')[next].focus({preventScroll:true});}
    else if([' ','Enter'].includes(event.key))pressDock(true);
  });
  dock.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)&&!dockDrag)pressDock(false);});
  dock.addEventListener('focusout',()=>{if(!dockDrag)pressDock(false);});
  addEventListener('resize',()=>finishDockDrag(true),{passive:true});
  const nextScene=()=>selectScene(sceneNames[(sceneNames.indexOf(state.scene)+1)%3]);
  $('#scene-next').addEventListener('click',nextScene);$('#experience').addEventListener('click',nextScene);
  $('#favorite').addEventListener('click',()=>{saved.has(state.scene)?saved.delete(state.scene):saved.add(state.scene);try{localStorage.setItem('liquid-glass-scenes',JSON.stringify([...saved]));}catch{}updateSaved();toast(saved.has(state.scene)?'已收藏这一刻的光线':'已取消收藏');});
  const lens=$('#lens');let drag=null;let lensPosition={x:.61,y:.47};
  function moveLens(x,y){const marginX=lens.offsetWidth/2+12,marginY=lens.offsetHeight/2+14;const minY=Math.max(marginY,95),maxY=sceneHeight-marginY-85;lensPosition={x:Math.max(marginX,Math.min(sceneWidth-marginX,x))/sceneWidth,y:Math.max(minY,Math.min(maxY,y))/sceneHeight};lens.style.left=lensPosition.x*100+'%';lens.style.top=lensPosition.y*100+'%';schedule();}
  lens.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;const bounds=lens.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX-bounds.left-bounds.width/2,y:event.clientY-bounds.top-bounds.height/2};lens.setPointerCapture(event.pointerId);});
  lens.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;const bounds=scene.getBoundingClientRect();moveLens(event.clientX-bounds.left-drag.x,event.clientY-bounds.top-drag.y);});
  lens.addEventListener('lostpointercapture',()=>{drag=null;releaseAll();});
  lens.addEventListener('keydown',event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(directions[event.key]){event.preventDefault();const [dx,dy]=directions[event.key],step=event.shiftKey?25:10;moveLens(lensPosition.x*sceneWidth+dx*step,lensPosition.y*sceneHeight+dy*step);}});
  $('#reset').addEventListener('click',()=>{Object.assign(state,{material:'clear',refraction:72,blur:8,pressure:80,effects:!reducedTransparency.matches});$('[data-material=clear]').click();releaseAll();lensPosition={x:.61,y:.47};moveLens(sceneWidth*.61,sceneHeight*.47);selectScene('coast');updateControls();toast('已恢复最初的通透质感');});
  $('#theme').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';document.documentElement.dataset.theme=state.theme;$('#theme').setAttribute('aria-label',state.theme==='dark'?'切换浅色外观':'切换深色外观');$('#theme use').setAttribute('href',state.theme==='dark'?'#i-moon':'#i-sun');schedule();});
  reducedTransparency.addEventListener('change',()=>{state.effects=!reducedTransparency.matches;updateControls();});
  reducedMotion.addEventListener('change',()=>{releaseAll();schedule();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseAll();if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=0;}else{sourceDirty=true;schedule();}});
  const resizeObserver=new ResizeObserver(()=>{paintBackdrop();moveLens(lensPosition.x*sceneWidth,lensPosition.y*sceneHeight);schedule();});resizeObserver.observe(scene);for(const r of ranges)resizeObserver.observe(r.shell);
  photo.onload=()=>{photoLoaded=true;if(state.scene==='coast')paintBackdrop();};photo.onerror=()=>toast('海岸照片暂未加载，可切换光谱或网格');photo.src='assets/coast.jpg';
  setupGL();selectScene('coast');updateControls();
  window.glassLab=Object.freeze({getState:()=>({...state,pressed:surfaces.map(s=>({id:s.element.id||s.element.className,p:s.pressure})),lens:{...lensPosition}}),selectScene});
})();
