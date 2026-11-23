'use strict';

const $ = id => document.getElementById(id);
const canvas = $('world');
const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false});
if (!gl) {
  $('menu').hidden = true;
  $('error').textContent = 'O jogo precisa de WebGL. Abra este arquivo no Chrome, Edge ou Firefox com a aceleração gráfica ativada.';
  $('error').hidden = false;
} else {
  run();
}

function run() {
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const norm = (x, y, z) => {
    const length = Math.hypot(x,y,z) || 1;
    return [x/length,y/length,z/length];
  };
  const shade = (hex) => {
    const n = parseInt(hex,16);
    return [(n>>16)/255, ((n>>8)&255)/255, (n&255)/255];
  };
  const colors = Object.fromEntries(Object.entries({
    navy:'1b3449', ink:'16314b', deep:'185468', teal:'24778a', aqua:'53e1cc',
    mint:'a9ffe5', white:'fff2d8', cream:'f1e9ce', lime:'d5fa74', pink:'f14584',
    peach:'ffae8c', purple:'286d85', lilac:'b29de9', darkPurple:'403d70',
    deck:'dd834f', deck2:'e69a5c', orange:'ff9b59', rust:'ab4254', leaf:'208b65', leafLight:'63c479', sand:'eacb91', rock:'a99b87', moss:'8da753', bark:'997457', jade:'438d68', foam:'c5efe1', coral:'e96351', plum:'a83d81', sucker:'ffc196', flannel:'d88a46', binding:'e7b877', porcelain:'fcf1d4', sole:'343d41', lensBlue:'386779',
    fur:'b87647', muzzle:'f3d6a8', ear:'774537', wet:'18222b', iris:'945527', brass:'d5984c', nickel:'a4c2c3', suede:'804934', rescue:'f44838', sail:'ebdaba', indigo:'274a69', shark:'528da1', belly:'ddeddf', gill:'cd446b', rose:'ef9f9c', stripe:'e8973c', ocean:'087a94', black:'182e43', red:'e96673', gold:'ffe8a3', blue:'50aacc'
  }).map(([name,hex]) => [name,shade(hex)]));

  const vertexSource = `
    uniform float effect;
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec4 paint;
    uniform vec3 tint;
    varying vec3 surfaceColor;
    varying float finish;
    varying vec3 objectPos;
    uniform vec3 center, size, eye, side, up, forward;
    uniform vec2 yaw, tilt, bank, lens, shadowCenter;
    uniform float passKind, seaLevel;
    varying vec3 world, n;
    varying float distanceZ, localY;
    vec3 rotate(vec3 p) {
      p.xy=vec2(bank.x*p.x-bank.y*p.y,bank.y*p.x+bank.x*p.y);
      p = vec3(p.x, tilt.x*p.y+tilt.y*p.z, -tilt.y*p.y+tilt.x*p.z);
      return vec3(yaw.x*p.x+yaw.y*p.z,p.y,-yaw.y*p.x+yaw.x*p.z);
    }
    void main() {
      surfaceColor=paint.rgb*mix(vec3(1.),tint,mod(paint.a,2.));
      finish=floor(paint.a*.5); objectPos=position;
      world = center + rotate(position*size);
      n = rotate(normal/max(size,vec3(.001)));
      if(effect>4.5 && effect<5.5){
        float f=position.x;
        vec3 root=vec3(-10.4,-1.4,109.);
        vec3 spine=mix(root,center,f)+vec3(0,3.6*sin(f*3.14159265),0);
        vec3 tangent=normalize(center-root+vec3(0,11.3097*cos(f*3.14159265),0));
        vec3 axis=normalize(cross(tangent,vec3(0,1,0)));
        vec3 axis2=normalize(cross(axis,tangent));
        n=normalize(axis*position.y+axis2*position.z);
        float cap=sqrt(clamp((1.-f)*19.,0.,1.));
        world=spine+n*mix(1.22,.59,f)*cap;
        surfaceColor=mix(tint,vec3(.99,.62,.50),smoothstep(.12,.91,-n.z)*.61);
      }
      localY = clamp(position.y,-.5,.5);
      if(passKind>2.5){
        gl_Position=vec4(position.x*2.,position.z*2.,.9999,1.);
        distanceZ=1.;return;
      }
      if(passKind>.5 && passKind<1.5){
        vec2 lightUV=(world.xz-world.y*vec2(.68,.53)-shadowCenter)/vec2(24.,35.);
        gl_Position=vec4(lightUV,-world.y/43.,1.);distanceZ=0.;return;
      }
      vec3 projected=world;
      if(passKind>1.5) projected.y=2.*seaLevel-world.y;
      vec3 v = projected-eye;
      distanceZ = dot(v,forward);
      gl_Position = vec4(dot(v,side)*lens.x,dot(v,up)*lens.y,
        distanceZ*1.00125-.24015,distanceZ);
    }`;
  const fragmentSource = `
    precision highp float;
    uniform float passKind, shadowsOn, mirrorOn, seaLevel;
    uniform sampler2D shadows, mirror, bay, deckPrint;
    uniform float hasBay, deckReady;
    uniform vec2 shadowCenter, viewportSize, lens;
    uniform vec3 forward,side,up;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise2(vec2 p){
      vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
    }
    vec3 sky(vec3 ray,float ti){
      if(hasBay>.5){
        float longitude=atan(ray.x,ray.z);
        float u=1.-abs(mod(.5+longitude*.546,2.)-1.);
        vec2 uv=vec2(u,clamp(.286+asin(clamp(ray.y,-1.,1.))*1.22,0.005,.995));
        return texture2D(bay,uv).rgb;
      }
      float h=max(0.,ray.y);
      vec3 col=mix(vec3(1.,.735,.57),vec3(.24,.50,.77),1.-exp(-h*3.7));
      vec3 sun=normalize(vec3(.52,.19,.85));
      float sd=max(0.,dot(ray,sun));
      col+=vec3(.54,.29,.1)*pow(sd,38.)+vec3(.55,.52,.34)*smoothstep(.99835,.9992,sd);
      vec2 cloud=ray.xz*2.6/(max(.035,ray.y)+.10)+vec2(.011*ti,0);
      float vapor=.56*noise2(cloud)+.28*noise2(cloud*2.)+.16*noise2(cloud*4.);
      return mix(col,vec3(1.,.86,.77),smoothstep(.46,.75,vapor)*smoothstep(.012,.17,h)*.63);
    }
    uniform vec3 eye;
    varying vec3 surfaceColor;
    varying float finish;
    varying vec3 objectPos;
    uniform float effect, opacity, tide;
    varying vec3 world, n;
    varying float distanceZ, localY;
    void main() {
      if(passKind>2.5){
        vec2 ndc=(gl_FragCoord.xy/viewportSize*2.-1.)/lens;
        gl_FragColor=vec4(sky(normalize(forward+side*ndc.x+up*ndc.y),tide),1);return;
      }
      if(passKind>.5 && passKind<1.5){
        float depth=clamp(.5-world.y/86.,0.,.999);
        float low=fract(depth*255.);
        gl_FragColor=vec4(depth-low/255.,low,0.,1.);return;
      }
      if(passKind>1.5 && world.y<seaLevel+.02) discard;
      vec3 tint=surfaceColor;
      vec3 color=tint;
      vec3 N=normalize(n), V=normalize(eye-world), L=normalize(vec3(.68,1.,.53));
      vec2 suv=(world.xz-world.y*vec2(.68,.53)-shadowCenter)/vec2(48.,70.)+.5;
      float visibility=1.;
      if(shadowsOn>.5 && passKind<.5 && all(lessThan(abs(suv-.5),vec2(.494)))){
        float occlusion=0., receiver=.5-world.y/86.-(.0007+.001*(1.-max(0.,dot(N,L))));
        for(int ix=-1;ix<=1;ix++)for(int iy=-1;iy<=1;iy++){
          vec2 enc=texture2D(shadows,suv+vec2(float(ix),float(iy))*.00105).rg;
          occlusion+=step(dot(enc,vec2(1.,1./255.)),receiver);
        }
        visibility-=occlusion/9.*.70;
      }
      bool printed=deckReady>.5 && world.y>-.008 && world.y<.009 && N.y>.98 && effect<.5;
      if(printed) tint=texture2D(deckPrint,vec2((world.x+14.)/28.,world.z/136.)).rgb;
      if(effect < .5 || effect>4.5) {
        float l = max(0.,dot(normalize(n),normalize(vec3(-.43,.85,-.39))));
        float sunlit=max(0.,dot(N,L)), hemi=N.y*.5+.5;
        vec3 indirect=mix(vec3(.44,.38,.44),vec3(.69,.77,.83),hemi);
        float gloss=effect<.5 && tint.g>tint.r*1.05 ? 64.:34.;
        float highlight=pow(max(0.,dot(N,normalize(L+V))),gloss);
        float rim=pow(1.-max(dot(N,V),0.),3.);
        color=tint*(indirect*.74+sunlit*visibility*vec3(.68,.57,.47));
        if(effect>5.5 && effect<6.5){
          vec2 stone=N.y>.65?world.xz:vec2(atan(world.z,world.x)*5.1,world.y);
          vec2 tile=stone/vec2(1.64,.73);
          tile.x+=.5*mod(floor(tile.y),2.);
          vec2 seam=min(fract(tile),1.-fract(tile));
          float mortar=1.-smoothstep(.006,.035,min(seam.x*1.64,seam.y*.73));
          float relief=.93+.11*hash(floor(tile))+.04*(noise2(stone*9.)-.5);
          color*=mix(1.,relief*(1.-.24*mortar),1.-smoothstep(12.,42.,distanceZ));
        }
        color+=vec3(1.,.86,.63)*highlight*visibility*.28+vec3(.28,.43,.51)*rim*.26;
        if(finish>.5){
          vec3 R=reflect(-V,N);
          float front=max(0.,dot(N,normalize(vec3(-.35,.53,-.78))));
          color+=tint*front*.19;
          if(finish<1.5){
            float yarn=(sin(objectPos.y*370.)*sin((objectPos.x+objectPos.z)*260.));
            color*=1.+.034*yarn*(1.-smoothstep(3.,12.,distanceZ));
            color+=tint*.095*rim;
          } else if(finish<3.5){
            float horizon=smoothstep(-.24,.35,R.y);
            vec3 softEnv=mix(vec3(.36,.41,.38),vec3(.67,.79,.87),horizon);
            vec3 env=mix(softEnv,sky(R,tide),.20);
            float optical=step(2.5,finish);
            color=mix(color,env*mix(tint+vec3(.18),vec3(.68,.82,.9),optical),mix(.37,.14,optical)+rim*.18);
            color+=pow(max(0.,dot(N,normalize(L+V))),82.)*vec3(.85,.79,.67);
          } else if(finish>4.5){
            float y=objectPos.y,z=objectPos.z;
            float freckle=noise2(objectPos.xz*31.+objectPos.y*9.);
            if(finish<5.5){
              float flank=smoothstep(-.11,.025,-y+.14*z+.019*sin(objectPos.z*22.));
              color=mix(color,vec3(.82,.88,.79)*(.68+.32*hemi),flank*.91);
              color*=.94+.082*freckle;
            }else{
              color=mix(color,vec3(.97,.69,.62)*(.63+.37*hemi),.29+.18*rim);
              color+=vec3(.19,.12,.06)*smoothstep(.73,.88,freckle)*smoothstep(.04,.28,y);
            }
          } else {
            float fibers=noise2(vec2(objectPos.x+objectPos.z*.73,objectPos.y*.42)*123.);
            color*=.97+.065*fibers;
            color+=tint*.14*front;
            color+=vec3(.98,.63,.35)*rim*.18;
          }
        }
        if(finish>.5 && finish<3.5)color+=.045*hemi*vec3(1.,.91,.75);
        color+=vec3(.024,.012,.002)*localY;
        if(!printed && tint.r>.82 && tint.g>.42 && tint.g<.64 && tint.b<.42 && world.y>-.01 && world.y<.015 && normalize(n).y>.95){
          vec2 tile=fract(vec2(world.x/3.1+mod(floor(world.z/3.5),2.)*.5,world.z/3.5));
          float edge=min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y));
          color*=mix(.78,1.,smoothstep(.002,.012,edge));
          float bolt=length(vec2(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y))-vec2(.045));
          color*=mix(.6,1.,smoothstep(.009,.016,bolt));
        }
        color += vec3(.065,.031,.042)*max(0.,dot(normalize(n),vec3(.8,.2,.1)));
      } else if(effect < 1.5) {
        vec2 p=world.xz;
        float a=p.x*.63+p.y*.87+tide*1.35, b=p.x*1.37-p.y*.47-tide*1.72;
        float c=p.y*2.95+2.3*sin(p.x*.53+tide*.54)-tide*1.9;
        vec2 ripple=vec2(.025*cos(a)+.029*cos(b),.034*cos(a)-.017*cos(b)+.029*cos(c));
        vec3 wn=normalize(vec3(-ripple.x,1.,-ripple.y));
        vec3 reflected=reflect(-V,wn);
        float fres=pow(1.-max(0.,dot(wn,V)),2.3);
        vec3 environment=sky(reflected,tide);
        if(mirrorOn>.5){
          vec4 surface=texture2D(mirror,clamp(gl_FragCoord.xy/viewportSize+ripple*.041,vec2(.003),vec2(.997)));
          environment=mix(environment,surface.rgb,surface.a);
        }
        float sparkle=pow(max(0.,dot(reflected,normalize(vec3(.52,.19,.85)))),180.);
        float offshore=smoothstep(16.,115.,distanceZ);
        float caustic=smoothstep(.82,.99,.5+.5*sin(c+sin(b)*1.8))*smoothstep(.15,.8,noise2(p*.28))*.13;
        color=mix(vec3(.035,.56,.59)+vec3(.0,.09,.07)*sin(a)*.32+caustic*.38,environment,.11+.39*fres);
        color=mix(color,sky(normalize(world-eye),tide),offshore*.36);
        color+=vec3(1.,.72,.40)*sparkle*1.35;
        color*=mix(.73,1.,visibility);
      }
      float fog = smoothstep(37.,155.,distanceZ)*.62;
      if(effect>.5 && effect<1.5){color=mix(color,sky(normalize(world-eye),tide),smoothstep(80.,182.,distanceZ));fog*=.09;}
      if(effect > 2.5 && effect < 3.5) fog = smoothstep(28.,156.,distanceZ)*.39;
      gl_FragColor = vec4(mix(color,vec3(.88,.64,.60),fog),opacity);
    }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  for (const key of ['position','normal']) gl.enableVertexAttribArray(gl.getAttribLocation(program,key));
  const attributes = ['position','normal'].map(key => gl.getAttribLocation(program,key));
  const u = Object.fromEntries(['center','size','eye','side','up','forward','yaw','tilt','bank','lens','tint','effect','opacity','tide','seaLevel','passKind','shadowCenter','shadowsOn','mirrorOn','shadows','mirror','viewportSize','bay','hasBay','deckPrint','deckReady'].map(key => [key,gl.getUniformLocation(program,key)]));

  function target(w,h,smooth){
    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    const filter=smooth?gl.LINEAR:gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const depth=gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
    const fb=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    const ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.bindTexture(gl.TEXTURE_2D,null);
    return {texture,fb,w,h,ready};
  }
  const rendererInfo=gl.getExtension('WEBGL_debug_renderer_info');
  const software=rendererInfo && /swiftshader|llvmpipe|software/i.test(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL));
  const shadowMap=target(software?512:1024,software?512:1024,false), reflection=target(software?256:512,software?144:288,true);
  let renderScale=software?.72:1, slowFrames=0, fastFrames=0,qualityMode='auto';
  try{const saved=localStorage.getItem('mare-render-quality');if(['high','light'].includes(saved))qualityMode=saved;}catch{}
  function setQuality(){
    qualityMode=$('quality').value||'auto';
    renderScale=qualityMode==='high'?1:qualityMode==='light'?.65:software?.72:1;
    slowFrames=fastFrames=0;shadowAt=mirrorAt=-1;
    try{localStorage.setItem('mare-render-quality',qualityMode);}catch{}
    resize();
  }
  $('quality').value=qualityMode;
  if(qualityMode==='high')renderScale=1;
  if(qualityMode==='light')renderScale=.65;
  $('quality').addEventListener('change',setQuality);
  // Both samplers stay complete, including on passes that render into their usual texture.
  const dummy=target(1,1,false);
  gl.uniform1i(u.shadows,0);gl.uniform1i(u.mirror,1);
  const paintAttribute=gl.getAttribLocation(program,'paint');
  gl.vertexAttrib4f(paintAttribute,1,1,1,1);
  function textureUnit(unit,sampler){
    const tex=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([212,220,204,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.uniform1i(sampler,unit);
    return (source,mipmap=false)=>{
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      if(mipmap){
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        const aniso=gl.getExtension('EXT_texture_filter_anisotropic');
        if(aniso)gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      }
      gl.activeTexture(gl.TEXTURE0);
    };
  }
  const uploadBay=textureUnit(2,u.bay),uploadDeck=textureUnit(3,u.deckPrint);
  const bayImage=$('bay-art');
  function loadBay(){if(bayImage.naturalWidth){uploadBay(bayImage);gl.uniform1f(u.hasBay,1);}}
  bayImage.addEventListener('load',loadBay);loadBay();
  function samplers(shadow,reflection){
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,shadow);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,reflection);
  }
  function beginTarget(target,pass,clear){
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.fb);gl.viewport(0,0,target.w,target.h);
    gl.uniform1f(u.passKind,pass);gl.clearColor(clear,clear,clear,clear);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  }
  let shadowAt=-1,mirrorAt=-1;
  function uploadMesh(data,indices,painted=false){
    const stride=painted?10:6;
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    const use32=data.length/stride>65535;
    if(use32&&!gl.getExtension('OES_element_index_uint')){
      const expanded=new Float32Array(indices.length*stride);
      for(let i=0;i<indices.length;i++){
        for(let j=0;j<stride;j++)expanded[i*stride+j]=data[indices[i]*stride+j];
      }
      gl.bufferData(gl.ARRAY_BUFFER,expanded,gl.STATIC_DRAW);
      return {buffer,count:indices.length,data,indices,painted};
    }
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const elements=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,use32?new Uint32Array(indices):new Uint16Array(indices),gl.STATIC_DRAW);
    return {buffer,elements,type:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,count:indices.length,data,indices,painted};
  }
  function mesh(build){
    const data=[],indices=[],lookup=new Map();
    function vertex(v){
      const key=v.map(x=>Math.round(x*100000)).join(',');
      let index=lookup.get(key);
      if(index===undefined){index=data.length/6;lookup.set(key,index);data.push(...v);}
      indices.push(index);
    }
    const triangle=(a,b,c)=>{vertex(a);vertex(b);vertex(c);};
    const quad=(a,b,c,d)=>{triangle(a,b,c);triangle(a,c,d);};
    build(triangle,quad);
    return uploadMesh(data,indices);
  }
  function boxMesh(round) {
    return mesh((triangle,quad) => {
      const grid = round ? [-.5,-.38,.38,.5] : [-.5,.5];
      for (let axis=0;axis<3;axis++) for (const sign of [-1,1]) {
        const point = (a,b) => {
          const p = [0,0,0];
          p[axis] = sign*.5;
          p[(axis+1)%3] = a;
          p[(axis+2)%3] = b;
          if (!round) {
            const normal = [0,0,0];
            normal[axis] = sign;
            return [...p,...normal];
          }
          const inner = p.map(v => clamp(v,-.38,.38));
          const n = norm(...p.map((v,i) => v-inner[i]));
          return [...inner.map((v,i) => v+n[i]*.12),...n];
        };
        for (let a=1;a<grid.length;a++) for (let b=1;b<grid.length;b++) {
          quad(point(grid[a-1],grid[b-1]),point(grid[a],grid[b-1]),point(grid[a],grid[b]),point(grid[a-1],grid[b]));
        }
      }
    });
  }
  const cube = boxMesh(false), soft = boxMesh(true);
  const ball = mesh((triangle,quad) => {
    const point = (i,j) => {
      const a = i*TAU/16, b = j*Math.PI/10;
      const n = [Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];
      return [...n.map(v => v*.5),...n];
    };
    for (let i=0;i<16;i++) for (let j=0;j<10;j++) quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
  });
  function drumMesh(sides) {
    return mesh((triangle,quad) => {
      for(let i=0;i<sides;i++) {
        const a = i*TAU/sides, b = (i+1)*TAU/sides;
        const x = Math.cos(a), z = Math.sin(a), X = Math.cos(b), Z = Math.sin(b);
        quad([x*.5,-.5,z*.5,x,0,z],[X*.5,-.5,Z*.5,X,0,Z],
          [X*.5,.5,Z*.5,X,0,Z],[x*.5,.5,z*.5,x,0,z]);
        for(const sign of [-1,1]) triangle([0,sign*.5,0,0,sign,0],
          [x*.5,sign*.5,z*.5,0,sign,0],[X*.5,sign*.5,Z*.5,0,sign,0]);
      }
    });
  }
  const drum = drumMesh(20), hex = drumMesh(6);
  const cliff = mesh((triangle,quad) => {
    const corners = [[.49,.09],[.27,.44],[-.17,.47],[-.45,.25],[-.46,-.23],[-.07,-.49],[.39,-.35]];
    const heights = [.48,.43,.5,.38,.47,.41,.4];
    for(let i=0;i<corners.length;i++) {
      const j=(i+1)%corners.length, [x,z]=corners[i], [X,Z]=corners[j];
      const n=norm(Z-z,.12,x-X);
      const a=[x*.78,heights[i],z*.78], b=[X*.78,heights[j],Z*.78];
      quad([x,-.5,z,...n],[X,-.5,Z,...n],[...b,...n],[...a,...n]);
      triangle([...a,0,1,0],[...b,0,1,0],[0,.46,0,0,1,0]);
    }
  });
  const plane = mesh((triangle,quad) => {
    quad([-.5,0,-.5,0,1,0],[.5,0,-.5,0,1,0],[.5,0,.5,0,1,0],[-.5,0,.5,0,1,0]);
  });
  let boundMesh;
  function draw(mesh,x,y,z,sx,sy,sz,color,yaw=0,tilt=0,effect=0,opacity=1,roll=0) {
    if (boundMesh !== mesh) {
      boundMesh = mesh;
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      if(mesh.elements)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.elements);
      const stride=mesh.painted?40:24;
      for(let i=0;i<attributes.length;i++) gl.vertexAttribPointer(attributes[i],3,gl.FLOAT,false,stride,i*12);
      if(mesh.painted){
        gl.enableVertexAttribArray(paintAttribute);gl.vertexAttribPointer(paintAttribute,4,gl.FLOAT,false,stride,24);
      }else{
        gl.disableVertexAttribArray(paintAttribute);gl.vertexAttrib4f(paintAttribute,1,1,1,1);
      }
    }
    gl.uniform3f(u.center,x,y,z);
    gl.uniform3f(u.size,sx,sy,sz);
    gl.uniform3fv(u.tint,typeof color==='string' ? colors[color] : color);
    gl.uniform2f(u.yaw,Math.cos(yaw),Math.sin(yaw));
    gl.uniform2f(u.tilt,Math.cos(tilt),Math.sin(tilt));
    gl.uniform2f(u.bank,Math.cos(roll),Math.sin(roll));
    gl.uniform1f(u.effect,effect);
    gl.uniform1f(u.opacity,opacity);
    if(mesh.elements)gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);
    else gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }

  let COURSE_END = 126;
  const TIME_LIMIT = 90;
  const QUALIFY = 6;
  let checkpoints = [3.5,34.5,80];
  let course = [
    {x:0,z:13,w:18,l:26,c:'deck'},
    {x:0,z:39,w:16,l:18,c:'deck2'},
    {x:-5.55,z:62.25,w:4.6,l:21.5,c:'purple'},
    {x:0,z:62.25,w:4.6,l:21.5,c:'purple'},
    {x:5.55,z:62.25,w:4.6,l:21.5,c:'purple'},
    {x:0,z:86.25,w:17,l:20.5,c:'deck'},
    {x:0,z:115.75,w:18,l:31.5,c:'deck2'}
  ];
  const trackObjects = [];
  const scenery = [];
  const add = (list,...args) => list.push(args);
  function deck(p) {
    const {x,z,w,l,c} = p;
    add(trackObjects,cube,x,-1.13,z,w-.36,1.4,l-.4,'deep');
    add(trackObjects,cube,x,-.22,z,w,.44,l,c);
    add(trackObjects,cube,x,-.45,z,w+.15,.14,l+.12,'aqua');
    for (const dir of [-1,1]) {
      add(trackObjects,cube,x+dir*(w/2-.23),.012,z,.12,.024,l-.4,c==='purple'?'lilac':'mint');
      for (let mark=z-l/2+2.2;mark<z+l/2-.9;mark+=3.8) {
        add(trackObjects,cube,x+dir*(w/2-.54),.018,mark,.2,.031,1.14,'white');
      }
    }
    for (let mark=z-l/2+3.5; mark<z+l/2-1.5; mark+=4.8) {
      add(trackObjects,cube,x,.012,mark,.105,.027,1.75,c==='purple'?'lilac':'aqua');
    }
    for (const dir of [-1,1]) {
      add(trackObjects,hex,x+dir*w*.27,-2.23,z,w*.23,2.25,3.4,'ink',.48);
    }
  }
  for (const p of course) deck(p);

  function stripe(x,z,width,color) {
    for (let i=-3;i<=3;i++) add(trackObjects,cube,x+i*width/7,.022,z,width/7-.07,.034,.37,color);
  }
  for(const [z,w] of [[25.55,15],[47.55,13],[95.75,14],[100.35,15]]) stripe(0,z,w,'gold');
  for(const lane of [-5.55,0,5.55]) stripe(lane,72.55,3.8,'gold');
  function checker(z,w) {
    const square=w/18;
    for(let i=0;i<18;i++) for(let j=0;j<2;j++) {
      add(trackObjects,cube,(i-8.5)*square,.028,z+(j-.5)*square,square,.03,square,(i+j)%2?'navy':'white');
    }
  }
  checker(6.5,17.4);
  checker(COURSE_END,17.4);
  for(const z of checkpoints.slice(1)) {
    add(trackObjects,cube,0,.026,z,15,.038,.13,'lime');
    for(const dir of [-1,1]) {
      add(trackObjects,soft,dir*7.2,.54,z,.31,1.04,.34,'mint');
      add(trackObjects,soft,dir*7.2,1.11,z,.48,.35,.45,'lime',.45,0,2);
    }
  }
  for(const dir of [-1,1]) {
    const x=dir*8.35;
    add(trackObjects,soft,x,2.05,COURSE_END,1.1,4.05,1.12,'rust');
    for(let j=0;j<4;j++) add(trackObjects,cube,x,.6+j*.9,COURSE_END,1.12,.35,1.14,'peach');
    add(trackObjects,soft,x,4.25,COURSE_END,1.4,.52,1.43,'mint');
  }
  add(trackObjects,soft,0,4.22,COURSE_END,17.45,.76,1.06,'aqua');
  for(let j=-8;j<=8;j++) add(trackObjects,cube,j,4.23,COURSE_END-.53,.53,.29,.055,j%2?'navy':'white');

  // Buoys, cliffs and a lighthouse give the course landmarks.
  let seed = 8473;
  function random() {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed/4294967296;
  }
  for (const sign of [-1,1]) {
    for(let i=0;i<18;i++) {
      const z=i*8+random()*4-9;
      const x=sign*(12+random()*9);
      const c=i%2?'peach':'mint';
      add(scenery,drum,x,-3.32,z,1.55,.4,1.55,'navy');
      add(scenery,ball,x,-2.84,z,1.29,1.07,1.29,c);
      add(scenery,drum,x,-2.22,z,.08,.82,.08,'white');
      add(scenery,soft,x+.24,-1.92,z,.49,.25,.075,c,sign*.35);
    }
    for(let i=0;i<5;i++) {
      const x=sign*(27+random()*25), z=8+random()*156;
      const w=5+random()*7, h=1+random()*4;
      add(scenery,cliff,x,-3.4+h*.31,z,w,h,w*.83,i%2?'sand':'deep',random()*TAU);
      if(i%3===0) add(scenery,cliff,x,-3.36+h*.74,z,w*.64,.44,w*.56,'deck',.4);
    }
  }
  add(scenery,hex,22,-.7,106,11,5.7,10,'darkPurple',.23);
  add(scenery,hex,22,2.17,106,10.5,.38,9.5,'deck',.23);
  for(let i=0;i<7;i++) add(scenery,drum,22,3+i*1.27,106,3.55-i*.22,1.29,3.55-i*.22,i%2?'rust':'white');
  add(scenery,drum,22,11.56,106,2.8,.39,2.8,'ink');
  add(scenery,drum,22,12.38,106,1.76,1.48,1.76,'gold',0,0,2);
  add(scenery,drum,22,13.24,106,2.97,.31,2.97,'rust');
  add(scenery,ball,22,13.59,106,1.83,.72,1.83,'rust');
  for(const [x,z] of [[-8.5,7],[8.5,7],[-7.6,44],[7.6,44],[-8.1,91],[8.1,91]]) {
    add(trackObjects,drum,x,1.18,z,.12,2.38,.12,'white');
    add(trackObjects,ball,x,2.43,z,.23,.23,.23,'gold');
  }


  const hoop = mesh((triangle,quad)=>{
    const point=(i,j)=>{
      const t=i*TAU/40, a=j*TAU/8, ct=Math.cos(t), st=Math.sin(t), ca=Math.cos(a), sa=Math.sin(a);
      return [ct*(.46+.04*ca),st*(.46+.04*ca),.04*sa,ct*ca,st*ca,sa];
    };
    for(let i=0;i<40;i++) for(let j=0;j<8;j++) quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
  });
  const frond = mesh((tri,quad)=>{
    for(let i=0;i<6;i++){
      const p=(n,edge)=>{
        const t=n/6;
        return [edge*Math.sin(t*Math.PI)*.38,Math.sin(t*Math.PI)*.48-t*t*.18-Math.abs(edge)*.13*Math.sin(t*Math.PI),t,edge*.34,.9,-.16];
      };
      for(const side of [-1,1]) quad(p(i,0),p(i,side),p(i+1,side),p(i+1,0));
    }
  });
  // Layered beach profiles keep the shoreline shallow; rocks break up its silhouette.
  const islet=mesh((tri,quad)=>{
    const rings=[[-.53,.21],[-.36,.43],[-.17,.52],[.02,.49],[.16,.39],[.25,.21],[.27,.006]];
    const point=(i,j)=>{
      const a=i*TAU/23, [y,r]=rings[j],warp=1+.072*Math.sin(3*a+.3)+.062*Math.sin(5*a);
      const slope=j<2?.35:j===2?.60:.9;
      return [r*warp*Math.sin(a),y+.022*Math.sin(a*3)*r,r*warp*Math.cos(a),Math.sin(a)*(1-slope),slope,Math.cos(a)*(1-slope)];
    };
    for(let i=0;i<23;i++)for(let j=0;j<rings.length-1;j++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
  });
  const trunk=mesh((tri,quad)=>{
    const point=(i,j)=>{
      const t=j/14,a=i*TAU/11, r=(.49-.19*t)*(j%2?.91:1);
      return [.90*t*t+r*Math.cos(a),t,.31*t*t+r*Math.sin(a),Math.cos(a),.06,Math.sin(a)];
    };
    for(let j=0;j<14;j++)for(let i=0;i<11;i++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
  });
  const palmLeaf=mesh((tri,quad)=>{
    const arch=t=>.50*Math.sin(Math.PI*t)-.23*t*t;
    for(let k=0;k<14;k++){
      const t=k/14, next=(k+1)/14;
      quad([-.018,arch(t),t,0,1,0],[.018,arch(t),t,0,1,0],[.013,arch(next),next,0,1,0],[-.013,arch(next),next,0,1,0]);
      const width=.48*Math.sin(Math.PI*(.055+t*.90))*(1-.3*t);
      for(const side of [-1,1]){
        const root=[0,arch(t),t,side*.12,.94,-.14], ridge=[side*width*.62,arch(t)-.036,t+.098,side*.2,.85,.08];
        const tip=[side*width,arch(t)-.19,t+.148,side*.56,.73,.06],end=[0,arch(next),next,side*.12,.95,.06];
        quad(root,ridge,tip,end);
      }
    }
  });
  for(const [x,z,h] of [[-16,17,7],[17,25,6],[-20,42,9],[23,59,7],[-17,81,8],[22,95,6],[-19,115,7],[17,130,8]]){
    add(scenery,islet,x,-2.68,z,11,5.1,9.3,'sand',z);
    add(scenery,islet,x-.48,-1.84,z+.25,6.4,1.95,5.9,'moss',z+.20);
    const base=-1.38;
    add(scenery,trunk,x,base,z,.81,h,.84,'bark',0);
    for(let k=0;k<11;k++)add(scenery,palmLeaf,x+.73,base+h,z+.26,2.35,2.65,3.68+(k%3)*.39,k%3===1?'leafLight':'jade',k*TAU/11+z,(k%3-1)*.08);
    for(let k=0;k<4;k++) add(scenery,ball,x+.71+Math.sin(k*2)*.31,base+h-.21,z+.24+Math.cos(k*2)*.28,.42,.56,.42,'bark');
    for(let k=0;k<9;k++){
      const a=k*2.39+z,r=1.07+(k%3)*.77,X=x+Math.sin(a)*r,Z=z+Math.cos(a)*r;
      add(scenery,islet,X,-1.59-(k%3)*.16,Z,1.9+(k%2),2.45,2.2,k%3===0?'rock':k%3===1?'leaf':'moss',a);
      if(k%2===0)for(let j=0;j<4;j++)add(scenery,frond,X,-1.11,Z,.84,1.34,1.38,k%3?'jade':'leafLight',a+j*1.55,-.24);
    }
    for(let k=0;k<4;k++){
      const a=k*1.76+z;
      add(scenery,islet,x+Math.sin(a)*4.22,-2.94,z+Math.cos(a)*3.91,1.77,3.16,1.6,'rock',a);
    }
  }
  // Each spring launches toward a landing point. Holding left/right trims the arc.
  let springs=[
    {x:-4.6,z:23,w:3,targetX:-4.6,forward:12.6,lift:8.2},
    {x:6.7,z:45,w:2.5,targetX:10.65,forward:14.1,lift:12.2},
    {x:10.65,z:69,w:2.55,targetX:5.6,forward:14,lift:9.9},
    {x:-4.8,z:93.2,w:3,targetX:-7.35,forward:12.7,lift:9.1}
  ];
  const bypass={x:10.65,z:64,w:3.35,l:15,c:'purple'};
  course.push(bypass);
  deck(bypass);
  for(const p of springs){
    add(trackObjects,soft,p.x,.10,p.z,p.w+.12,.19,2.66,'navy');
    for(const s of [-1,1])add(trackObjects,soft,p.x+s*(p.w*.5-.11),.20,p.z,.18,.20,2.54,'orange');
  }
  let gates=[{x:-4.6,y:2.25,z:29},{x:9,y:4.15,z:53},{x:8.4,y:2.95,z:75.5},{x:-6.57,y:2.65,z:100.5}];
  const squidX=-11.8,squidZ=109;
  // An oversized luminous lifebuoy frames the finish line.
  add(trackObjects,hoop,0,4.3,127.9,18.6,15.8,9.7,'orange');
  add(trackObjects,hoop,0,4.3,127.75,17.65,15.05,5.3,'gold',0,0,2);
  for(let i=0;i<9;i++){
    const a=.24+i*(Math.PI-.48)/8;
    add(trackObjects,ball,9.15*Math.cos(a),4.3+7.8*Math.sin(a),127.5,.47,.47,.47,'mint',0,0,2);
  }
  let attacks=[{x:-4.8,z:103.8,offset:0},{x:1.6,z:111,offset:2.2}];
  const cycle=t=>((t%4.4)+4.4)%4.4;
  function tentacleEnd(a,t){
    const phase=cycle(t+a.offset);
    if(phase<1.45) return 4.8+.32*Math.sin(phase*8);
    if(phase<1.67) return mix(4.8,.52,(phase-1.45)/.22);
    if(phase<2.48) return .52;
    return mix(.52,4.8,clamp((phase-2.48)/1.15,0,1));
  }
  const armTube=mesh((triangle,quad)=>{
    const point=(i,j)=>{
      const a=j*TAU/16;
      return [i/24,Math.cos(a),Math.sin(a),0,1,0];
    };
    for(let i=0;i<24;i++)for(let j=0;j<16;j++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
  });
  function drawFestival(t){
    for(let i=0;i<gates.length;i++){
      const g=gates[i];
      if(g.tidal && !farol.low(t))continue;
      const turn=atFarol?farol.yaw(g.z):0;
      draw(hoop,...coursePoint(g.x,g.y,g.z),3.15,3.15,3.15,player.gates.has(i)?'teal':'gold',turn,0,2);
      for(let k=0;k<3;k++){
        const a=t*2+k*TAU/3;
        draw(ball,...coursePoint(g.x+1.5*Math.cos(a),g.y+1.5*Math.sin(a),g.z),.24,.24,.24,'white',0,0,2);
      }
    }
    if(atFarol){farol.drawSignals(t);return;}
    if(shipyard) {drawShipyard(t);return;}
    drawKraken(t);
    for(const a of attacks){
      const phase=cycle(t+a.offset), height=tentacleEnd(a,t);
      const baseX=-10.4;
      const warn=phase<1.67;
      draw(drum,a.x,.055,a.z,3.05,.04,3.05,warn && Math.sin(phase*23)>0?'gold':'rust');
      draw(armTube,a.x,height,a.z,1,1,1,'plum',0,0,5);
      for(let j=0;j<7;j++){
        const f=.16+j*.12,x=mix(baseX,a.x,f),z=mix(squidZ,a.z,f);
        const y=mix(-1.4,height,f)+3.6*Math.sin(f*Math.PI);
        const d=mix(1.22,.59,f);
        draw(hoop,x,y-.1,z-d*.88,d*.66,d*.62,d*.93,'sucker');
      }
    }
  }

  // Merge fixed geometry by material so palm islands and deck details share draw calls.
  function bakeStatic(objects){
    const groups=new Map();
    for(const [model,x,y,z,w,h,d,color,yaw=0,tilt=0,effect=0] of objects){
      const key=color+'-'+effect+'-'+Math.floor(z/32);
      if(!groups.has(key)) groups.set(key,{data:[],indices:[],color,effect,zmin:Infinity,zmax:-Infinity});
      const group=groups.get(key), verts=group.data,offset=verts.length/6;
      for(const index of model.indices)group.indices.push(offset+index);
      const co=Math.cos(yaw),si=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt);
      const v=model.data;
      for(let i=0;i<v.length;i+=6){
        const vx=v[i]*w, vy=v[i+1]*h, vz=v[i+2]*d, rz=ct*vz-st*vy;
        const nx=v[i+3]/w, ny=v[i+4]/h, nz=v[i+5]/d, rn=ct*nz-st*ny;
        const worldZ=z-si*vx+co*rz;
        group.zmin=Math.min(group.zmin,worldZ);group.zmax=Math.max(group.zmax,worldZ);
        verts.push(x+co*vx+si*rz,y+ct*vy+st*vz,worldZ,co*nx+si*rn,ct*ny+st*nz,-si*nx+co*rn);
      }
    }
    return [...groups.values()].map(group=>{
      const model=uploadMesh(group.data,group.indices);
      const batch=[model,0,0,0,1,1,1,group.color,0,0,group.effect];
      batch.near=group.zmin;batch.far=group.zmax;
      return batch;
    });
  }
  // String pennants across the checkpoints and paint broad stripes on their pylons.
  const pennant=mesh((tri)=>{
    tri([-.5,.5,0,0,0,-1],[.5,.5,0,0,0,-1],[.06,-.5,.08,0,0,-1]);
  });
  for(const z of [34.5,80]){
    for(const sign of [-1,1]){
      add(trackObjects,drum,sign*7.85,2.35,z,.23,4.7,.23,'navy');
      for(let n=0;n<4;n++)add(trackObjects,drum,sign*7.85,1.55+n*.74,z,.246,.29,.246,'peach');
      add(trackObjects,ball,sign*7.85,4.8,z,.48,.48,.48,'gold');
    }
    for(let n=0;n<21;n++){
      const x=(n-10)*.75,y=4.05+.0067*x*x;
      add(trackObjects,cube,x,y+.19,z,.78,.045,.06,'navy');
      add(trackObjects,pennant,x,y-.04,z,.62,.51,.3,['aqua','pink','gold','cream'][n%4],0,.1);
    }
  }
  for(let i=0;i<13;i++){
    const x=(i%2?1:-1)*(17+(i*13)%28),z=25+i*8,y=7.4+Math.sin(i*1.2)*3.1;
    for(const sign of [-1,1])add(scenery,frond,x+sign*.15,y,z,.49,.75,1.12,'cream',sign*1.32,-.18);
  }
  for(const [x,z] of [[-16,17],[17,25],[-20,42],[23,59],[-17,81],[22,95],[-19,115],[17,130]]){
    for(let j=0;j<1;j++)add(scenery,hoop,x,-3.37,z,10.57,9.45,.10,'foam',z,Math.PI/2);
  }

  // The deck uses one mipmapped, world-aligned painting. Gaps never receive paint.
  function paintBoardwalk(){
    if(!document.createElement)return;
    const sheet=document.createElement('canvas');
    sheet.width=1024;sheet.height=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const ctx=sheet.getContext('2d',{alpha:false});
    if (!ctx) return;
    const W=sheet.width,H=sheet.height;
    ctx.setTransform(W/28,0,0,H/136,W/2,0);
    const box=(x,z,w,l,c)=>{ctx.fillStyle=c;ctx.fillRect(x,136-z-l,w,l);};
    const line=(x1,z1,x2,z2,c,width)=>{
      ctx.beginPath();ctx.strokeStyle=c;ctx.lineWidth=width;
      ctx.moveTo(x1,136-z1);ctx.lineTo(x2,136-z2);ctx.stroke();
    };
    const type=(s,x,z,height,color,align='center')=>{
      ctx.save();ctx.translate(x,136-z);ctx.scale(.01,.01);
      ctx.font='italic 900 '+Math.round(height*100)+'px Segoe UI,Arial,sans-serif';
      ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(s,0,0);ctx.restore();
    };
    box(-14,0,28,136,'#c69a68');
    const woods=['#d3a775','#dbb484','#dfa876','#cda077','#e2b588','#d9ae80'];
    for(let row=0;row<195;row++){
      const z=row*.72;
      for(let x=-19+random()*3;x<14;){
        const w=4+random()*3.6;
        box(x,z,w-.035,.705,woods[Math.floor(random()*woods.length)]);
        line(x,z+.02,x+w-.036,z+.02,'#936f50',.025);
        line(x,z+.682,x+w-.036,z+.682,'#f2d3a2',.022);
        for(let k=0;k<13;k++){
          const origin=x+random()*w, end=Math.min(x+w-.06,origin+.3+random()*2.9);
          const v=z+.07+random()*.53;
          ctx.beginPath();ctx.moveTo(origin,136-v);
          ctx.bezierCurveTo(origin+.25,136-v-.032,end-.25,136-v+.03,end,136-v);
          ctx.strokeStyle=k%3?'rgba(100,57,30,.115)':'rgba(255,233,190,.40)';
          ctx.lineWidth=.008+random()*.016;ctx.stroke();
        }
        for(const bolt of [x+.09,x+w-.13]){
          box(bolt,z+.12,.046,.054,'#826e5a');box(bolt,z+.53,.046,.054,'#826e5a');
        }
        x+=w;
      }
    }
    for(const p of course){
      const start=p.z-p.l/2, end=p.z+p.l/2, half=p.w/2;
      if(p.c==='purple')box(p.x-half,start,p.w,p.l,'rgba(12,104,111,.77)');
      for(const side of [-1,1]){
        const edge=p.x+side*half;
        box(edge-(side>0?.88:0),start,.88,p.l,'#184f59');
        box(edge-(side>0?.99:-.93),start,.06,p.l,'#fff0c6');
        for(let z=start+.4;z<end;z+=1.16){
          const x=edge-side*.43;
          line(x-.20,z,x+.20,Math.min(end,z+.40),'#62c9b7',.125);
        }
      }
    }
    for(const [x,z,w,l,col] of [[0,7.8,14.7,3.6,'#da6c40'],[0,30.4,13.5,2.4,'#207e82'],[0,76.3,14.4,2.6,'#207e82'],[0,120.3,15.5,3.25,'#c75c3b']]){
      box(x-w/2,z,w,l,col);box(x-w/2,z+.12,w,.07,'#fff1cb');box(x-w/2,z+l-.18,w,.07,'#fff1cb');
    }
    type('TURBO  MARÉ',0,9.6,2.08,'#fff0cb');
    type('RECIFE',0,31.65,1.55,'#e6f5d5');
    type('CANAL',0,77.6,1.56,'#e6f5d5');
    type('CHEGADA',0,122,1.97,'#fff1ca');
    for(const p of springs){
      for(let i=0;i<3;i++)for(const s of [-1,1])line(p.x,p.z-1.5-i*.62,p.x+s*.79,p.z-1.9-i*.62,'#fff1bc',.17);
    }
    for(const [x,z] of [[-6,17],[5.4,40],[-5.6,60],[4.8,84],[-6.2,113]]){
      ctx.beginPath();ctx.lineWidth=.09;ctx.strokeStyle='#b87950';ctx.arc(x,136-z,1.02,0,TAU);ctx.stroke();
      type('»',x,z+.09,1.62,'#986b4f');
    }
    ctx.setTransform(1,0,0,1,0,0);
    for(let i=0;i<24000;i++){
      ctx.fillStyle=i%2?'rgba(52,49,35,.10)':'rgba(255,244,215,.25)';
      ctx.fillRect(random()*W,random()*H,.5+random()*2,.6+random()*3);
    }
    uploadDeck(sheet,true);gl.uniform1f(u.deckReady,1);
  }
  paintBoardwalk();

  function beam(list,a,b,width,color){
    const [dx,dy,dz]=b.map((v,i)=>v-a[i]), length=Math.hypot(dx,dy,dz);
    add(list,drum,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,length,width,color,
      Math.atan2(dx,dz),-Math.acos(clamp(dy/length,-1,1)));
  }
  // Rounded hull, curved canvas triangles and visible rigging on the moored dinghies.
  const hull=mesh((tri,quad)=>{
    const ribs=[[-.5,.008,.23],[-.41,.31,.04],[-.2,.47,-.03],[.12,.49,-.06],[.38,.3,.05],[.5,.012,.27]];
    for(let j=1;j<ribs.length;j++){
      for(const sign of [-1,1]){
        const points=(r,upper)=>[sign*r[1]*(upper?1:.42),upper?.32+r[2]:-.36+r[2],r[0],sign*.85,.13,Math.sign(r[0])*.3];
        quad(points(ribs[j-1],1),points(ribs[j],1),points(ribs[j],0),points(ribs[j-1],0));
      }
      const top=(r,sign)=>[r[1]*sign,.32+r[2],r[0],0,1,0];
      quad(top(ribs[j-1],-1),top(ribs[j-1],1),top(ribs[j],1),top(ribs[j],-1));
    }
  });
  function sailPanel(v0,v1,left){
    return mesh((tri,quad)=>{
      const point=(v,u)=>{
        const width=(1-v)*1.75+.035;
        return [left*u*width,.13+3.34*v,.44*Math.sin(Math.PI*u)*Math.sin(Math.PI*(v+.13))+.1*u,0,.05,-1];
      };
      for(let j=0;j<5;j++)quad(point(v0,j/5),point(v1,j/5),point(v1,(j+1)/5),point(v0,(j+1)/5));
    });
  }
  const canvasSails=[];
  for(let band=0;band<5;band++)canvasSails.push(sailPanel(band/5,(band+1)/5,1));
  const jib=sailPanel(0,1,-1);
  for(const [x,z,angle,suit] of [[12.8,15,-.47,'red'],[-15.7,33,.86,'teal'],[16.4,72,.35,'orange'],[-16,91,-.22,'aqua'],[14.7,116,.55,'red']]){
    const y=-3.14;
    add(scenery,hull,x,y,z,1.8,1.05,4.9,'navy',angle);
    add(scenery,hull,x,y+.14,z,1.85,.86,4.94,suit,angle);
    add(scenery,drum,x,y+2.05,z,.085,4.05,.085,'cream');
    for(let j=0;j<5;j++)add(scenery,canvasSails[j],x,y+.36,z,1.15,1,.95,j===2?suit:'white',angle);
    add(scenery,jib,x,y+.46,z, .72,.86,.7,'cream',angle);
    add(scenery,pennant,x+.22,y+4,z,.55,.29,.18,suit,angle);
  }
  // Race pontoons have bolted rub rails and chained rubber fenders below the running surface.
  for(const p of course){
    for(const s of [-1,1]){
      const x=p.x+s*p.w*.5;
      add(trackObjects,cube,x,-.31,p.z,.24,.48,p.l,'navy');
      for(let z=p.z-p.l*.5+1.1;z<p.z+p.l*.5-.6;z+=2.2){
        add(trackObjects,soft,x,-.105,z,.34,.23,1.97,'cream');
        add(trackObjects,cube,x,-.275,z,.37,.09,1.85,'orange');
      }
      for(let z=p.z-p.l*.5+3.4;z<p.z+p.l*.5-1;z+=6.4){
        add(trackObjects,hoop,x+s*.17,-.83,z,1.27,1.34,2.15,'ink',Math.PI/2);
        beam(trackObjects,[x+s*.18,-.12,z],[x+s*.17,-.47,z+.03],.067,'sand');
      }
    }
  }
  // Inflatable pylons mark the route above the moving obstacles.
  for(const z of [24.6,46.1,94.8,124]){
    const x=z===46.1?7.54:8.33;
    for(const s of [-1,1]){
      add(trackObjects,drum,s*x,.16,z,.86,.31,.86,'navy');
      add(trackObjects,drum,s*x,.99,z,.48,1.42,.48,'orange');
      add(trackObjects,drum,s*x,1.32,z,.50,.26,.50,'white');
      add(trackObjects,ball,s*x,1.72,z,.48,.4,.48,'orange');
    }
  }

  let fixedScene=bakeStatic(trackObjects.concat(scenery));
  let bumpers = [
    {z:13.5,width:2.6,s:5.5,p:0,w:1.4},
    {z:19.5,width:2.6,s:5.4,p:1.1,w:1.4},
    {z:107.1,width:2.92,s:6.3,p:.6,w:1.9},
    {z:115,width:2.92,s:6.4,p:2.1,w:2.1}
  ];
  let spinners = [
    {x:0,z:39,r:6.55,w:1.8,p:.8},
    {x:-5.55,z:65,r:1.95,w:3.45,p:0},
    {x:0,z:65,r:1.95,w:-3.45,p:1.2},
    {x:5.55,z:65,r:1.95,w:3.45,p:2.1},
    {x:0,z:86.5,r:5.65,w:-2.16,p:1.25},
    {x:0,z:121,r:7.3,w:2.52,p:.4}
  ];
  const bay={course,checkpoints,springs,gates,attacks,spinners,bumpers,fixedScene,finish:COURSE_END};
  const yard={
    course:[[0,12,17,28],[0,32,15,12],[-6,46.5,3.2,17],[0,64,16.4,20],
      [3.2,81.5,9.7,15],[0,104,17,24]].map(([x,z,w,l])=>({x,z,w,l})),
    checkpoints:[3.5,31,67],springs:[],attacks:[],spinners:[],bumpers:[],finish:109,
    gates:[{x:1.5,y:1.85,z:53},{x:3.3,y:2.3,z:90.5}]
  };
  const farol=createFarol({mesh,drum,cube,soft,ball,cliff,beam,add,bakeStatic,draw});
  let activeTrack=bay,shipyard=false,atFarol=false;
  function coursePoint(x,y,z){return atFarol?farol.world(x,y,z):[x,y,z];}
  const bridgeZ=46, bridgeWidth=4.5, bridgeLength=10.8;
  const bridgeX=t=>1.4+3.4*Math.sin(t*.77);
  const cranes=[{z:20,phase:0},{z:66,phase:1.8},{z:101,phase:3.7}];
  const loadX=(c,t)=>5.9*Math.sin(t*.93+c.phase);
  const loadBottom=(c,t)=>.45+2.05*(.5+.5*Math.sin(t*1.31+c.phase));
  function onBridge(x,z,t){
    return shipyard && Math.abs(z-bridgeZ)<=bridgeLength/2+.12 && Math.abs(x-bridgeX(t))<=bridgeWidth/2+.12;
  }
  // The same corrugated shell is drawn at different scales on ships and crane slings.
  let cargoShell;
  function makeCargoShell(){
    const parts=[[cube,0,0,0,.98,.96,.98,'suit']];
    for(const side of [-1,1]){
      for(let i=-5;i<=5;i++) parts.push([cube,side*.49,0,i*.082,.026,.88,.035,'suit']);
      for(const y of [-.47,.47]) parts.push([cube,side*.49,y,0,.028,.045,1.01,'indigo']);
      for(const x of [-.39,.39])parts.push([cube,x,0,side*.495,.025,.90,.022,'nickel']);
      for(const x of [-.47,.47])for(const y of [-.46,.46])parts.push([cube,x,y,side*.5,.075,.08,.04,'brass']);
    }
    return assemble(parts);
  }
  function buildYard(){
    const fixed=[];
    for(const p of yard.course){
      add(fixed,cube,p.x,-.34,p.z,p.w,.68,p.l,'shark');
      for(const side of [-1,1]){
        const x=p.x+side*(p.w/2-.18);
        add(fixed,cube,x,.017,p.z,.32,.034,p.l,'flannel');
        for(let z=p.z-p.l/2+.6;z<p.z+p.l/2;z+=1.65)
          add(fixed,cube,x,.041,z,.32,.025,.61,'ink');
      }
      for(let z=p.z-p.l/2+2;z<p.z+p.l/2-.4;z+=3.8){
        add(fixed,cube,p.x,.014,z,p.w-.8,.025,.05,'indigo');
        if(p.w>5)add(fixed,cube,p.x,.027,z,.13,.03,1.55,'cream');
      }
    }
    for(const z of [6.5,yard.finish]){
      for(let i=0;i<20;i++)for(let j=0;j<2;j++)
        add(fixed,cube,(i-9.5)*.82,.045,z+j*.64,.82,.028,.64,(i+j)%2?'ink':'white');
    }
    for(const z of yard.checkpoints.slice(1))add(fixed,cube,0,.04,z,14,.045,.19,'lime');
    for(const z of [...cranes.map(c=>c.z),bridgeZ,yard.finish]){
      const high=z===yard.finish?8.1:9.8;
      for(const side of [-1,1]){
        const x=side*8.9;
        for(const dz of [-1.15,1.15]){
          add(fixed,cube,x,-.48,z+dz,2.1,1.55,1.8,'navy');
          add(fixed,cube,x,(high-1)/2,z+dz,.45,high+1,.44,'flannel');
          for(let y=.8;y<high-1;y+=2.5){
            beam(fixed,[x,y,z+dz],[x,y+2.45,z-dz],.15,'brass');
          }
        }
        add(fixed,soft,x,high+.4,z,1.25,.38,3.1,'indigo');
        add(fixed,ball,x,high+.73,z,.42,.52,.42,'orange',0,0,2);
      }
      for(const dz of [-.63,.63]){
        for(const y of [high-.72,high+.12])add(fixed,cube,0,y,z+dz,18.4,.27,.24,'flannel');
        for(let i=0;i<12;i++)beam(fixed,[-9+i*1.5,high-.69,z+dz],[-7.5+i*1.5,high+.11,z+dz],.11,'brass');
      }
      add(fixed,soft,-7.9,high-1.26,z,1.55,1.55,1.8,'orange');
      add(fixed,cube,-7.88,high-1.12,z-.91,1.25,.72,.05,'lensBlue');
    }
    for(const [x,z] of [[-15,18],[18,46],[-17,77],[16,100]]){
      add(fixed,hull,x,-2.8,z,8.1,3.3,25,'navy');
      add(fixed,cube,x,-1.86,z,7.4,.6,19,'rust');
      for(let j=0;j<3;j++)for(let k=0;k<2;k++){
        const xx=x+(k-.5)*3, zz=z+(j-1)*5.7;
        for(let layer=0;layer<1+(j+k)%2;layer++){
          const y=-.32+layer*2.45, c=['rust','teal','orange','shark'][(j+k+layer)%4];
          add(fixed,cube,xx,y,zz,2.84,2.45,5.55,c);
          for(let rib=-2;rib<=2;rib++)add(fixed,cube,xx,y,zz+rib*1.03,2.94,2.25,.13,c);
        }
      }
    }
    cargoShell=makeCargoShell();
    return bakeStatic(fixed);
  }
  function selectTrack(track){
    const next=track==='farol'?farol:track==='estaleiro'?yard:bay;
    if(next===activeTrack)return;
    activeTrack=next;shipyard=next===yard;atFarol=next===farol;
    if(shipyard && !yard.fixedScene)yard.fixedScene=buildYard();
    if(atFarol && !farol.fixedScene)farol.fixedScene=farol.build();
    ({course,checkpoints,springs,gates,attacks,spinners,bumpers,fixedScene}=next);
    COURSE_END=next.finish;
    gl.uniform1f(u.deckReady,next===bay?1:0);
  }
  function drawShipyard(t){
    function load(x,z,bottom,w,h,d,tint){
      draw(cargoShell,x,bottom+h/2,z,w,h,d,tint);
      draw(soft,x,9.12,z,2.15,.69,1.75,'navy');
      for(const side of [-1,1])draw(soft,x+side*w*.46,bottom+h+.07,z,.14,.14,d*.95,'flannel');
      const cableHeight=8.85-(bottom+h+.27);
      for(const side of [-1,1])for(const end of [-1,1])
        draw(drum,x+side*w*.42,8.85-cableHeight/2,z+end*d*.40,.07,cableHeight,.07,'ink');
    }
    load(bridgeX(t),bridgeZ,-2.25,bridgeWidth,2.25,bridgeLength,'teal');
    for(const c of cranes)load(loadX(c,t),c.z,loadBottom(c,t),3.05,1.55,2.1,'rescue');
  }
  function updateObstacles(t) {
    for(const b of bumpers) {
      b.x = Math.sin(t*b.w+b.p)*b.s;
      b.v = Math.cos(t*b.w+b.p)*b.s*b.w;
    }
    for(const s of spinners) s.a=t*s.w+s.p;
  }
  function drawObstacles(t) {
    if(activeTrack!==bay)return;
    for(const b of bumpers)drawCrab(b,t,Math.abs(player.z-b.z)<36);
    for(const s of spinners){
      draw(s.pivot,s.x,0,s.z,1,1,1,'white');
      draw(s.baton,s.x,.61,s.z,1,1,1,'white',s.a);
    }
    for(const p of springs)drawSpring(p,t);
    for(const [x,z,sign] of [[-8.5,7,1],[8.5,7,-1],[-7.6,44,1],[7.6,44,-1],[-8.1,91,1],[8.1,91,-1]]) {
      draw(soft,x+sign*.46,2.12,z+Math.sin(t*3+z)*.11,.97,.43,.062,sign>0?'lime':'pink',Math.sin(t*3+z)*.22);
    }
  }

  const botSpeeds = [8.7,6.2,8.1,7.35,6.45,6.75,6.1,6.5,7.75,7.02];
  const costumes = ['aqua','pink','lilac','orange','blue','lime','peach','purple','red','gold'];
  const gaps = [{edge:26,landing:30},{edge:48,landing:51.5},
    {edge:73,landing:76},{edge:96.5,landing:100}];
  const keys = new Set();
  const stick = {x:0,z:0,id:null,ox:0,oy:0};
  const camera = {x:0,y:0,z:0,tx:0,ty:0,tz:0,ready:false};
  let racers, player, finishers, particles, mode = 'menu', resumeMode;
  let countdown, elapsed, obstacleTime, menuTime = 0, lastCount, lastStamp, accumulator=0;
  let lastTap=-1, tapCount=0;
  let jumpPressed=0, divePressed=0, notice=0, gapHint=false, best=0, muted=false, audio=null;
  try {
    best = Number(localStorage.getItem('turbo-mare-kraken-best')) || 0;
    muted = localStorage.getItem('turbo-mare-muted') === 'true';
  } catch {}
  const save = (key,value) => {try {localStorage.setItem(key,value);} catch {}};
  const format = (time) => Math.floor(time/60)+':'+String(Math.floor(time%60)).padStart(2,'0');
  const timeResult = (time) => time.toFixed(2).replace('.',',')+' s';

  let training=false, beatIndex=-1, online=null, room=null, lastNetSend=0, rankSignature='';
  let offlineCup=null;
  const botNames=['Bot Coral','Bot Recife','Bot Âncora','Bot Farol'];
  const cupPilots=['Você',...botNames,'Bot Brisa'];
  const netFields=['x','y','z','vx','vy','vz','a','stride','bank','landing','hit','stun','dive','flight','boost','wait','cp','result','raceTime','falls'];
  function freshRace() {
    const track=online?.track ?? (offlineCup && cupTracks[offlineCup.leg]);
    selectTrack(track);
    const heat=(atFarol?3:shipyard?2:1)+'/'+(online?.heats||3);
    $('progress-name').textContent=track?heat+' · '+(atFarol?'Farol da Ressaca':shipyard?'Estaleiro à Deriva':'Baía do Kraken'):'Circuito do Kraken';
    $('cup-leg').hidden=!track;
    $('cup-leg').textContent=heat;
    seed = 9137;
    const grid = [[0,4.5],[-3.8,5.7],[3.8,5.7],[-1.85,5.3],[1.85,5.35],
      [-5.8,4],[-2.85,2.9],[2.85,2.9],[5.8,4],[0,2]];
    racers = grid.map(([x,z],i) => ({
      i,x:atFarol?x*.48:x,z,y:0,vx:0,vz:0,vy:0,a:0,stride:i*.7,wait:0,stun:0,hit:0,dive:0,
      cp:0,ground:true,coyote:.12,result:0,raceTime:0,falls:0,speed:botSpeeds[i]+random()*.24,
      lane:[-5.55,0,5.55][(i*2)%3], bias:x*.79, reaction:.2+random()*.6,
      error:random(), nextJump:0,flight:0,boost:0,gates:new Set(),springLock:0
    }));
    if(training) racers=racers.slice(0,1);
    if(offlineCup){
      racers=racers.slice(0,cupPilots.length);
      racers.forEach((r,i)=>{r.name=cupPilots[i];r.left=false;});
    }
    if (online) {
      // Na partida rápida, os lugares 7 a 10 do grid são bots simulados pelo anfitrião.
      racers = racers.filter(r=>online.members.some(m=>m.slot===r.i) || (online.bots && r.i>=6));
      for(const r of racers) {
        const m=online.members.find(m=>m.slot===r.i);
        r.left=false;
        if(!m) {r.bot=true; r.name=botNames[r.i-6]; r.pilot=r.i%4; continue;}
        r.name=m.name; r.pilot=m.pilot; r.reaction=.2; r.bias=0;
      }
    }
    player = online ? racers.find(r=>r.i===online.slot) : racers[0];
    beatIndex=-1;
    finishers = [];
    particles = [];
    for(const p of springs)p.firedAt=-20;
    countdown=3.15;
    elapsed=obstacleTime=notice=0;
    lastCount=-1;
    gapHint=false;
    $('toast').hidden=true;
    updateObstacles(0);
    updateHUD();
  }
  function setMode(next) {
    mode=next;
    $('quality-row').hidden=next!=='paused';
    $('celebrate').textContent='';
    document.body.dataset.mode=next;
    $('menu').hidden=next!=='menu';
    $('hud').hidden=next==='menu'||next==='dock';
    $('dock').hidden=next!=='dock';
    $('room-ranks').hidden=(!online&&!offlineCup) || !['race','countdown'].includes(next);
    $('touch').hidden=next!=='race';
    $('pause').disabled=!['countdown','race'].includes(next);
    $('modal').hidden=!['paused','result'].includes(next);
    $('offline-board').hidden=!offlineCup || next!=='result';
    if(next!=='countdown' && next!=='race') $('count').hidden=true;
  }
  function startRace() {
    unlockSound();
    clearControls();
    freshRace();
    camera.ready=false;shadowAt=mirrorAt=-1;
    setMode('countdown');
    $('world').focus();
  }
  function showMenu() {
    offlineCup=null;
    freshRace();
    clearControls();
    camera.ready=false;
    setMode('menu');
    $('play').focus();
  }
  function pauseRace() {
    if (online) {
      clearControls();
      if ($('race-exit').open) $('race-exit').close();
      else {
        $('exit-info').textContent='Os pilotos que ficarem na sala poderão terminar esta corrida.';
        $('race-exit').showModal();
      }
      return;
    }
    if (mode==='paused') {
      setMode(resumeMode);
      $('world').focus();
    } else if (mode==='countdown'||mode==='race') {
      resumeMode=mode;
      clearControls();
      setMode('paused');
      $('modal-tag').textContent=offlineCup?'Copa das Marés · Offline':'Circuito do Kraken';
      $('modal-title').textContent='Em pausa';
      $('modal-text').textContent='Volte à corrida quando quiser.';
      $('modal-main').textContent='Continuar';
      $('modal-restart').hidden=false;
      $('modal-main').focus();
    }
  }
  function startOfflineCup() {
    training=false;
    offlineCup={leg:0,board:cupPilots.map((name,slot)=>({name,slot,scores:cupTracks.map(()=>null)}))};
    startRace();
  }
  function finishOfflineLeg() {
    const {leg,board}=offlineCup;
    scoreCupLeg(board,leg,raceResults());
    const final=leg===cupTracks.length-1;
    const ranked=rankCup(board);
    const first=ranked[0];
    let place=0;
    $('offline-rows').replaceChildren(...ranked.map((row,i)=>{
      if(i===0 || compareCupScores(row,ranked[i-1])!==0)place=i+1;
      const tr=document.createElement('tr');
      [place+'º '+row.name,...row.scores.map(value=>value??'—'),cupTotal(row)].forEach((value,j)=>{
        const cell=document.createElement(j===0?'th':'td');
        if(j===0)cell.scope='row';
        cell.textContent=value;tr.append(cell);
      });
      return tr;
    }));
    const playerScore=board[0].scores[leg];
    const winners=ranked.filter(row=>compareCupScores(first,row)===0);
    setMode('result');
    clearControls();
    $('modal-tag').textContent='Copa das Marés · Offline';
    $('modal-title').textContent=final?'Pódio da Copa':(leg===0?'Placar após a Baía':'Placar após o Estaleiro');
    $('modal-text').textContent=final?
      (winners.length>1?'Vitória compartilhada · '+winners.map(row=>row.name).join(', ')+'.':
        first.slot===0?'Você venceu a Copa com '+cupTotal(first)+' pontos!':first.name+' venceu a Copa com '+cupTotal(first)+' pontos.'):
      'Você marcou '+playerScore+' '+(playerScore===1?'ponto':'pontos')+'. Próxima prova: '+(leg===0?'Estaleiro à Deriva.':'Farol da Ressaca.');
    $('modal-main').textContent=final?'Revanche':'Próxima prova';
    $('modal-restart').hidden=true;
    $('modal-main').focus();
  }
  function advanceResult() {
    if(mode==='paused'){pauseRace();return;}
    if(!offlineCup){startRace();return;}
    if(offlineCup.leg===cupTracks.length-1){startOfflineCup();return;}
    offlineCup.leg++;
    startRace();
  }
  function finishRace(success) {
    setMode('result');
    clearControls();
    const record = !training && success && (!best || player.raceTime<best);
    if(record) {
      best=player.raceTime;
      save('turbo-mare-kraken-best',best);
    }
    $('modal-tag').textContent=record?'Novo recorde pessoal':'Circuito do Kraken';
    $('modal-title').textContent=training?'Treino concluído!':success?'Você se classificou!':'Fim da corrida';
    const desc = training?'Circuito completo em '+timeResult(player.raceTime)+'.':success ? player.result+'º lugar entre 10 corredores em '+timeResult(player.raceTime)+'.'
      : elapsed>=TIME_LIMIT ? 'O tempo acabou.' : 'As seis vagas foram preenchidas.';
    $('modal-text').textContent=desc+' '+player.gates.size+'/4 anéis. '+player.falls+' '+(player.falls===1?'queda':'quedas')+'.'
      +(best && !record?' Melhor tempo: '+timeResult(best)+'.':'');
    $('modal-main').textContent='Correr de novo';
    $('modal-restart').hidden=true;
    $('modal-main').focus();
    if(success) {
      if(document.createDocumentFragment){
        const pieces=document.createDocumentFragment();
        for(let i=0;i<49;i++){
          const piece=document.createElement('i');
          piece.style.left=((i*37)%101)+'%';
          piece.style.background=['#70ffd7','#ffb743','#ff688d','#fff3cc'][i%4];
          piece.style.animationDelay=((i%11)*.09)+'s';
          piece.style.animationDuration=(1.55+i%7*.17)+'s';
          pieces.appendChild(piece);
        }
        $('celebrate').appendChild(pieces);
      }
      tone(440,.19,'triangle',0);
      tone(554,.2,'triangle',.11);
      tone(659,.3,'triangle',.22);
    } else tone(170,.35,'triangle');
  }

  function unlockSound() {
    if(muted || !window.AudioContext) return;
    try {
      audio ??= new AudioContext();
      if(audio.state==='suspended') audio.resume().catch(()=>{});
    } catch {}
  }
  function tone(freq,duration,type='sine',delay=0,slide=1,volume=.097) {
    if(muted || !audio || audio.state!=='running') return;
    const now=audio.currentTime+delay;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(freq,now);
    oscillator.frequency.exponentialRampToValueAtTime(freq*slide,now+duration);
    gain.gain.setValueAtTime(.001,now);
    gain.gain.exponentialRampToValueAtTime(volume,now+.013);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now+duration+.01);
  }
  function soundButton() {
    $('sound').textContent=muted?'×':'♫';
    $('sound').ariaLabel=$('sound').title=muted?'Ativar som':'Desativar som';
  }
  soundButton();
  $('sound').addEventListener('click',()=>{
    muted=!muted;
    save('turbo-mare-muted',String(muted));
    soundButton();
    if(!muted) {unlockSound();tone(450,.15,'triangle');}
  });
  $('play').addEventListener('click',()=>{training=false;startRace();});
  $('offline-cup').addEventListener('click',startOfflineCup);
  $('practice').addEventListener('click',()=>{training=true;startRace();});
  $('pause').addEventListener('click',pauseRace);
  $('modal-main').addEventListener('click',advanceResult);
  $('modal-restart').addEventListener('click',startRace);
  $('modal-menu').addEventListener('click',showMenu);
  $('world').tabIndex=-1;
  window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey) return;
    const key=event.code;
    if(key==='Escape' && !event.repeat) {
      if ($('room').open) return;
      if (online) event.preventDefault();
      pauseRace();return;
    }
    if ($('race-exit').open) return;
    if(key==='KeyR' && !online && mode==='race' && !event.repeat) {startRace();return;}
    if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(key)) return;
    if(!['race','countdown'].includes(mode)) return;
    event.preventDefault();
    if(!event.repeat && key==='Space') jumpPressed=.145;
    if(!event.repeat && key.startsWith('Shift')) divePressed=.14;
    keys.add(key);
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{clearControls();if(!online && ['countdown','race'].includes(mode)) pauseRace();});
  function clearControls() {
    keys.clear();
    jumpPressed=divePressed=0;
    lastTap=-1;
    stick.id=null;
    moveStick();
  }
  // Metade esquerda: o joystick nasce onde o dedo encosta e o acompanha quando ele passa do limite.
  // Metade direita: um toque pula na hora e um segundo toque logo depois mergulha.
  const STICK_RADIUS=32, STICK_FOLLOW=46, DOUBLE_TAP=300;
  function placeStick(x,y) {
    const box=$('stick'), half=box.offsetWidth/2||56;
    stick.ox=clamp(x,half*.6,innerWidth-half*.6);
    stick.oy=clamp(y,half*.6,innerHeight-half*.6);
    box.classList.add('active');
    box.style.left=stick.ox-half+'px';
    box.style.top=stick.oy-half+'px';
  }
  function moveStick(event) {
    let dx=0,dy=0;
    if(event) {
      dx=event.clientX-stick.ox;
      dy=event.clientY-stick.oy;
      const length=Math.hypot(dx,dy);
      if(length>STICK_FOLLOW) {
        const pull=(length-STICK_FOLLOW)/length;
        placeStick(stick.ox+dx*pull,stick.oy+dy*pull);
        dx=event.clientX-stick.ox;
        dy=event.clientY-stick.oy;
      }
    } else {
      const box=$('stick');
      box.classList.remove('active');
      box.style.left=box.style.top='';
    }
    const length=Math.hypot(dx,dy), scale=Math.max(STICK_RADIUS,length);
    stick.x=dx/scale;
    stick.z=-dy/scale;
    $('nub').style.transform='translate(-50%, -50%) translate('+stick.x*STICK_RADIUS+'px,'+(-stick.z*STICK_RADIUS)+'px)';
  }
  const moveZone=$('move-zone');
  moveZone.addEventListener('pointerdown',event=>{
    event.preventDefault();
    if (stick.id!==null) return;
    stick.id=event.pointerId;
    moveZone.setPointerCapture(event.pointerId);
    placeStick(event.clientX,event.clientY);
    moveStick(event);
  });
  moveZone.addEventListener('pointermove',event=>{if(stick.id===event.pointerId) moveStick(event);});
  for(const type of ['pointerup','pointercancel','lostpointercapture']) moveZone.addEventListener(type,event=>{
    if(stick.id!==event.pointerId) return;
    stick.id=null;
    moveStick();
  });
  function tapRing(x,y,dive) {
    const ring=document.createElement('i');
    ring.className='tap-ring'+(dive?' dive':'');
    ring.style.left=x+'px';
    ring.style.top=y+'px';
    $('touch').append(ring);
    ring.addEventListener('animationend',()=>ring.remove());
  }
  $('action-zone').addEventListener('pointerdown',event=>{
    event.preventDefault();
    const dive=lastTap>=0 && event.timeStamp-lastTap<DOUBLE_TAP;
    if(dive) {
      jumpPressed=0;
      divePressed=.14;
      lastTap=-1;
    } else {
      jumpPressed=.145;
      lastTap=event.timeStamp;
    }
    tapRing(event.clientX,event.clientY,dive);
    if(++tapCount===6) $('touch').classList.add('learned');
  });
  for(const id of ['move-zone','action-zone']) $(id).addEventListener('contextmenu',event=>event.preventDefault());

  function floor(x,z) {
    if(atFarol)return farol.floor(x,z,obstacleTime);
    return course.some(p=>Math.abs(x-p.x)<=p.w/2+.13 && Math.abs(z-p.z)<=p.l/2+.13) || onBridge(x,z,obstacleTime);
  }
  function splash(r) {
    for(let i=0;i<12;i++) particles.push({x:r.x,y:waterAtRacer(r),z:r.z,
      vx:(random()-.5)*6,vy:1.5+random()*4,vz:(random()-.5)*6,life:.22+random()*.45});
  }
  function waterAtRacer(r){return atFarol?farol.water(obstacleTime)-farol.height(r.x,r.z): -3.29;}
  function respawn(r) {
    r.x=r.i===0?0:r.bias*.65;
    r.y=0;
    r.z=checkpoints[r.cp]-(r.i%3)*.33;
    r.vx=r.vy=r.vz=0;
    r.ground=true;
    r.a=r.dive=r.stun=r.hit=r.nextJump=r.flight=r.boost=r.springLock=0;
  }
  function playerInput() {
    return [
      stick.x+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),
      stick.z+Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),
      jumpPressed>0,divePressed>0
    ];
  }
  function botInput(r) {
    let lane = r.bias;
    let jump=false, dive=false;
    if(elapsed<r.reaction) return [0,0,false,false];
    if(shipyard){
      const route=r.z<55?-5.95+(r.i%3-1)*.5:r.z<69?0:2.9+(r.i%3-1)*.53;
      return [clamp((route-r.x)*1.1,-.86,.86),1,r.ground&&r.z>87.7&&r.z<89&&r.nextJump<=0,false];
    }
    if(atFarol){
      const route=.06+(r.i%5)*.15;
      return [clamp((route-r.x)*1.2,-.75,.75),1,false,false];
    }
    if(r.z>37 && r.z<76) lane=r.lane;
    if(r.z>122) lane=clamp(r.bias,-5.6,5.6);
    lane+=Math.sin(r.z*.25+r.i)*.38;
    for (const b of bumpers) {
      const dz=b.z-r.z;
      if(dz>0 && dz<5 && Math.abs(r.x-b.x)<2.6) {
        lane += r.x<b.x ? -2.1 : 2.1;
        jump ||= dz<1.65;
      }
    }
    for (const s of spinners) {
      const dz=s.z-r.z;
      if(dz>-.5 && dz<2.6 && Math.abs(r.x-s.x)<s.r+.4 && r.error<.76) {
        jump ||= dz<1.65+r.error*.5;
      }
    }
    const gap=gaps.find(g=>r.z>=g.edge-1.2 && r.z<g.landing);
    if(gap && r.z>gap.edge-(.68+r.error*.41)) jump=true;
    if(gap && !r.ground && r.vy<2 && r.error>.67) dive=true;
    const dx=clamp((lane-r.x)*.9,-.86,.86);
    return [dx,1,jump&&r.nextJump<=0,dive];
  }
  function knock(r,x,z) {
    if (r.hit>0) return;
    const d=Math.hypot(x,z)||1;
    r.vx=x*10/d;
    r.vz=z*10/d;
    r.vy=4.6;
    r.y=Math.max(.065,r.y);
    r.hit=.64;
    r.flight=0;
    r.stun=.49;
    r.ground=false;
    r.coyote=r.dive=0;
    if(r===player) tone(126,.21,'triangle',0,.49);
  }
  function collideObstacles(r) {
    if(shipyard)for(const c of cranes){
      const x=r.x-loadX(c,obstacleTime), z=r.z-c.z, bottom=loadBottom(c,obstacleTime);
      if(Math.abs(x)<1.82 && Math.abs(z)<1.32 && r.y+1.58>bottom && r.y<bottom+1.55)
        knock(r,Math.cos(obstacleTime*.93+c.phase),Math.sign(z)||-1);
    }
    for(const a of attacks){
      if(tentacleEnd(a,obstacleTime)<1.24 && r.y<1.23 && Math.hypot(r.x-a.x,r.z-a.z)<1.36) knock(r,r.x-a.x,1.45);
    }
    for(const b of bumpers) {
      const x=r.x-b.x, z=r.z-b.z;
      if(r.y<1.4 && Math.abs(x)<b.width/2+.34 && Math.abs(z)<1.01) {
        knock(r,(Math.abs(b.v)>1?Math.sign(b.v):Math.sign(x))*1.35,Math.sign(z||-1));
      }
    }
    for(const s of spinners) {
      const x=r.x-s.x,z=r.z-s.z;
      const co=Math.cos(s.a),si=Math.sin(s.a);
      const along=x*co-z*si, across=x*si+z*co;
      if(r.y<.82 && Math.abs(along)<s.r+.24 && Math.abs(across)<.56) {
        const dir=Math.sign(-s.w*along)||1;
        knock(r,si*dir,co*dir);
      }
    }
  }
  function moveRacer(r,dt) {
    if(r.result || r.left) return;
    if(r.wait>0) {
      r.wait-=dt;
      if(r.wait<=0) respawn(r);
      return;
    }
    r.boost=Math.max(0,r.boost-dt);
    r.springLock=Math.max(0,r.springLock-dt);
    if(r.ground && r.springLock<=0 && r.vz>1){
      const p=springs.find(p=>Math.abs(r.x-p.x)<p.w/2 && Math.abs(r.z-p.z)<1.1);
      if(p){
        p.firedAt=obstacleTime;
        r.flight=2*p.lift/19.8;
        r.vx=(p.targetX-r.x)/r.flight;
        r.vy=p.lift;r.vz=p.forward;r.y=.12;r.ground=false;r.coyote=0;r.dive=0;r.stun=0;r.springLock=1.6;
        if(r===player){notify(p===springs[1]?'Atalho do recife!':'Impulso!');tone(240,.25,'triangle',0,2.7);}
      }
    }
    r.landing=Math.max(0,(r.landing||0)-dt);
    r.hit=Math.max(0,r.hit-dt);
    r.nextJump=Math.max(0,r.nextJump-dt);
    r.coyote=r.ground?.105:Math.max(0,r.coyote-dt);
    let [x,z,jump,dive]=r===player?playerInput():online&&!r.bot?room.control(r.i,dt):botInput(r);
    const magnitude=Math.hypot(x,z);
    if(magnitude>1) {x/=magnitude;z/=magnitude;}
    if(r.flight>0){
      r.flight=Math.max(0,r.flight-dt);
      if(r===player || (online && !r.bot)) r.vx=clamp(r.vx+x*dt*3,-7,7);
    } else if(r.stun<=0) {
      if(jump && r.coyote>0 && r.dive<=0) {
        r.vy=9.35;
        r.ground=false;
        r.coyote=0;
        r.nextJump=.39;
        if(online && r!==player && !r.bot) room.consume(r.i,'jump');
        if(r===player) {jumpPressed=0;tone(320,.13,'triangle',0,1.65);}
      }
      if(dive && r.dive<=0 && !r.dove && r.y>-.32) {
        if(magnitude<.14) {x=Math.sin(r.a);z=Math.cos(r.a);}
        const direction=Math.hypot(x,z)||1;
        r.vx=x/direction*13.2;
        r.vz=z/direction*13.2;
        r.vy=r.ground?3.5:clamp(r.vy*.28,-2,2.7)+1.3;
        r.y=Math.max(r.y,.075);
        r.ground=false;
        r.coyote=0;
        r.dive=.54;
        r.dove=true;
        if(online && r!==player && !r.bot) room.consume(r.i,'dive');
        if(r===player) {divePressed=0;tone(285,.17,'triangle',0,.57);}
      }
      if(r.dive<=0) {
        const speed=(r.bot||(!online&&r!==player)?r.speed:8.7)*(r.boost>0?1.53:1);
        const a=1-Math.exp(-dt*(r.ground?18:8));
        r.vx=mix(r.vx,x*speed,a);
        r.vz=mix(r.vz,z*speed,a);
      } else {
        r.dive=Math.max(0,r.dive-dt);
      }
    } else {
      r.stun=Math.max(0,r.stun-dt);
      const drag=Math.exp(-dt*(r.ground?8:2.4));
      r.vx*=drag;
      r.vz*=drag;
    }
    const speed=Math.hypot(r.vx,r.vz);
    if(speed>.28 && r.stun<=0) {
      const target=Math.atan2(r.vx,r.vz);
      const turn=Math.atan2(Math.sin(target-r.a),Math.cos(target-r.a));
      r.bank=mix(r.bank||0,clamp(turn*3,-1,1),1-Math.exp(-dt*9));
      r.a+=turn*Math.min(1,dt*18);
    }
    if(r===player && (r.flight>0||r.boost>0) && Math.floor(elapsed*32)!==r.trailTick){
      r.trailTick=Math.floor(elapsed*32);
      for(const side of [-1,1]) particles.push({x:r.x+side*.22,y:r.y+.56,z:r.z-.23,vx:side*.18,vy:.35,vz:-2.6,life:.38,trail:true});
    }
    if(speed<=.28)r.bank=(r.bank||0)*Math.exp(-9*dt);
    r.stride+=dt*speed*1.95;
    if(r.ground && onBridge(r.x,r.z,obstacleTime-dt))r.x+=bridgeX(obstacleTime)-bridgeX(obstacleTime-dt);
    const oldHeight=atFarol && !r.ground?farol.height(r.x,r.z):null;
    r.x+=r.vx*dt;
    r.z+=r.vz*dt*(atFarol?farol.distanceScale(r.x,r.z):1);
    const prevY=r.y;
    if(oldHeight!==null)r.y+=oldHeight-farol.height(r.x,r.z);
    r.vy-=19.8*dt;
    r.y+=r.vy*dt;
    if(r.vy<=0 && prevY>=-.018 && r.y<=0 && floor(r.x,r.z)) {
      if(!r.ground && r.vy<-3) r.landing=Math.min(.19,-r.vy*.014);
      if(r.dive>0) {r.stun=.24;r.dive=0;}
      r.y=r.vy=0;
      r.ground=true;
      r.dove=false;
    } else {
      r.ground=false;
    }
    for(let i=0;i<gates.length;i++){
      const g=gates[i];
      if(g.tidal && !farol.low(obstacleTime))continue;
      if(!r.gates.has(i) && Math.abs(r.z-g.z)<.42 && Math.hypot(r.x-g.x,r.y+.85-g.y)<1.54){
        r.gates.add(i);r.boost=2.35;
        if(r===player){notify('Anel de turbo!');tone(540,.22,'sine',0,1.8);}
      }
    }
    if(r.y>-1) collideObstacles(r);
    if(r.y < waterAtRacer(r)) {
      splash(r);
      r.wait=.65+r.reaction*.44;
      r.falls++;
      if(r===player) {notify('De volta ao checkpoint');tone(92,.26,'sine',0,.62);}
      return;
    }
    if(r.y>=-.04 && floor(r.x,r.z)) {
      if(r.cp<checkpoints.length-1 && r.z>=checkpoints[r.cp+1] && r.z<checkpoints[r.cp+1]+7) {
        r.cp++;
        if(r===player) {
          notify('Checkpoint alcançado');
          tone(523,.15,'triangle');
          tone(698,.17,'triangle',.09);
        }
      }
      if (r.z>=COURSE_END && r.z<=COURSE_END+2 && Math.abs(r.x)<8.65) {
        finishers.push(r);
        r.result=finishers.length;
        r.raceTime=elapsed;
        r.vx=r.vy=r.vz=r.dive=r.stun=0;
        r.y=0;
        r.a=Math.PI;
      }
    }
  }

  function separateRacers() {
    for(let i=0;i<racers.length;i++) {
      const a=racers[i];
      if(a.left || a.wait>0 || a.result || a.y<-.3) continue;
      for(let j=i+1;j<racers.length;j++) {
        const b=racers[j];
        if(b.left || b.wait>0 || b.result || Math.abs(b.y-a.y)>.7) continue;
        const x=a.x-b.x,z=a.z-b.z,d=Math.hypot(x,z);
        if(d>=.72) continue;
        const push=(.72-d)*.44;
        const px=d>.001?x/d*push:push;
        const pz=d>.001?z/d*push:0;
        a.x+=px;
        b.x-=px;
        a.z+=pz;
        b.z-=pz;
      }
    }
  }
  function notify(text) {
    $('toast').textContent=text;
    $('toast').hidden=false;
    notice=1.55;
  }
  function updateHUD() {
    const rank = player.result || 1 + racers.filter(r=>!r.left && r!==player&&(r.result||progressOf(r)>progressOf(player)+.04)).length;
    document.body.dataset.turbo='off';
    const percent = Math.floor(clamp((progressOf(player)-4.5)/(COURSE_END-4.5),0,1)*100);
    $('place').textContent=training?'Treino':rank+'º';
    $('field-size').textContent=training?'':'/ '+racers.length;
    $('sector').textContent=atFarol?(player.z<64?farol.tideLabel(obstacleTime):player.z<136?'Farol · Rampa em espiral':'Farol · Galeria da lanterna'):
      shipyard?(player.z<30?'Estaleiro · Pórtico de carga':player.z<54?'Estaleiro · Doca seca':player.z<90?'Estaleiro · Cais de montagem':'Estaleiro · Doca de chegada'):
      player.z<35?'Píer de largada':player.z<77?(player.x>8?'Atalho do recife':'Passagem do recife'):player.z<100?'Canal da mola':'Baía do Kraken';
    $('ring-score').textContent='◎ '+player.gates.size+'/'+gates.length;
    document.body.dataset.turbo=(player.boost>0||player.flight>0)?'on':'off';
    $('percent').textContent=percent+'%';
    $('fill').style.width=percent+'%';
    $('time').textContent=training?format(elapsed):format(Math.ceil(Math.max(0,TIME_LIMIT-elapsed)));
    if (online || offlineCup) {
      $('slots').previousElementSibling.textContent='Chegada';
      $('slots').textContent=finishers.length+' / '+racers.filter(r=>!r.left || r.result).length;
      const labels=roomOrder().map((r,i)=>(i+1)+'º  '+r.name+(online&&r===player?' (você)':'')+' · '+roomScore(r)+(r.i===online?.leaderSlot?' · Anfitrião':''));
      const signature=JSON.stringify(labels);
      if(signature!==rankSignature) {
        rankSignature=signature;
        $('race-list').replaceChildren(...labels.map(label=>{const li=document.createElement('li');li.textContent=label;return li;}));
      }
      return;
    }
    if($('slots').previousElementSibling) $('slots').previousElementSibling.textContent='Vagas';
    $('slots').textContent=training?'Livre':Math.max(0,QUALIFY-finishers.length)+' / '+QUALIFY;
  }
  function roomOrder() {
    return racers.slice().sort((a,b)=>(a.result||999)-(b.result||999)||Number(a.left)-Number(b.left)||progressOf(b)-progressOf(a)||a.i-b.i);
  }
  function raceResults() {
    return roomOrder().map(r=>({name:r.name,slot:r.i,score:roomScore(r),eligible:!!r.result||(!r.left&&r.cp>0)}));
  }
  function roomScore(r) {
    if(r.result) return r.result+'º · '+timeResult(r.raceTime);
    if(r.left) return 'Saiu';
    return Math.floor(clamp((progressOf(r)-4.5)/(COURSE_END-4.5),0,1)*100)+'%';
  }
  function progressOf(r) {return r.wait>0?checkpoints[r.cp]:r.z;}
  function playRaceBeat() {
    const beat=Math.floor(elapsed/.212);
    if(beat!==beatIndex){
      beatIndex=beat;
      const notes=[146.83,0,220,0,174.61,196,0,130.81,146.83,0,261.63,220,0,196,174.61,0];
      const note=notes[beat%notes.length];
      if(note) tone(note,.11,'triangle',0,.985,.032);
      if(beat%4===0) tone(104,.105,'sine',0,.40,.065);
      if(beat%8===6) tone(741,.045,'triangle',0,.62,.024);
    }
  }
  function step(dt) {
    if (online && !online.host) { clientStep(dt); return; }
    if(mode==='dock'){
      dockTime+=dt;
      obstacleTime+=dt*.6;
      updateObstacles(obstacleTime);
      return;
    }
    if(mode==='menu') {
      menuTime+=dt;
      updateObstacles(menuTime+1.35);
      return;
    }
    if(mode==='paused'||mode==='result') return;
    if(mode==='countdown') {
      countdown-=dt;
      obstacleTime+=dt*.4;
      updateObstacles(obstacleTime);
      const n=Math.ceil(countdown-.14);
      if(n!==lastCount) {
        lastCount=n;
        $('count').textContent=n>0?n:'VAI!';
        $('count').hidden=false;
        tone(n>0?370:735,n>0?.11:.25,'triangle');
      }
      if(countdown<=0) setMode('race');
      return;
    }
    elapsed+=dt;
    playRaceBeat();
    obstacleTime+=dt;
    updateObstacles(obstacleTime);
    for(const r of racers) moveRacer(r,dt);
    separateRacers();
    if(shipyard && !gapHint && player.z>29 && player.z<38){
      gapHint=true;notify('Cais à esquerda ou salto pelo contêiner!');
    } else if(activeTrack===bay && !gapHint && !player.flight && player.z>20 && player.z<25.8) {
      gapHint=true;
      notify(matchMedia('(pointer:coarse)').matches?'Pule para atravessar o vão':'Espaço para atravessar o vão');
    }
    if (online && (racers.every(r=>r.result||r.left||r.bot) || elapsed>=TIME_LIMIT)) {
      room.finish(raceResults());
      return;
    }
    if(offlineCup && (racers.every(r=>r.result) || elapsed>=TIME_LIMIT)){
      finishOfflineLeg();
      return;
    }
    if(!online && !offlineCup && (player.result||finishers.length>=QUALIFY||(!training && elapsed>=TIME_LIMIT))) {
      updateHUD();
      finishRace(player.result>0 && player.result<=QUALIFY);
      return;
    }
    jumpPressed=Math.max(0,jumpPressed-dt);
    divePressed=Math.max(0,divePressed-dt);
    if(elapsed>.72) $('count').hidden=true;
    if(notice>0 && (notice-=dt)<=0) $('toast').hidden=true;
    for (const p of particles) {
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      p.vy-=12*dt;p.life-=dt;
    }
    particles=particles.filter(p=>p.life>0 && p.y>-3.38);
  }

  // Rigid pieces share vertex-painted geometry. Suit color is selected per pilot.
  const materialFinish={navy:1,indigo:1,sail:1,rescue:1,suede:1,brass:2,nickel:2,wet:3,iris:3,fur:4,muzzle:4,ear:4,shark:5,rose:6,lensBlue:3,belly:1,flannel:1,binding:1,sole:1};
  function assemble(parts){
    const packed=[],indices=[];
    for(const [form,x,y,z,w,h,d,material,yaw=0,pitch=0,roll=0] of parts){
      const offset=packed.length/10;for(const index of form.indices)indices.push(offset+index);
      const team=material==='suit';
      const tint=team?[1,1,1]:colors[material];
      const finishCode=team?1:materialFinish[material]||0;
      const cr=Math.cos(roll),sr=Math.sin(roll);
      const co=Math.cos(yaw),si=Math.sin(yaw),ct=Math.cos(pitch),st=Math.sin(pitch);
      const src=form.data;
      for(let i=0;i<src.length;i+=6){
        const ox=src[i]*w,oy=src[i+1]*h,px=cr*ox-sr*oy,py=sr*ox+cr*oy,pz=src[i+2]*d,rz=ct*pz-st*py;
        const bx=src[i+3]/w,by=src[i+4]/h,nx=cr*bx-sr*by,ny=sr*bx+cr*by,nz=src[i+5]/d,rn=ct*nz-st*ny;
        const normal=norm(co*nx+si*rn,ct*ny+st*nz,-si*nx+co*rn);
        packed.push(x+co*px+si*rz,y+ct*py+st*pz,z-si*px+co*rz,...normal,...tint,finishCode*2+(team?1:0));
      }
    }
    return uploadMesh(packed,indices,true);
  }
  // Section of an ellipsoid with a slight barrel shape around the visor.
  function helmetSkin(bottom,top,from,to){
    return mesh((tri,quad)=>{
      const point=(i,j)=>{
        const t=mix(from,to,i/30),a=mix(bottom,top,j/6);
        const ca=Math.cos(a),sa=Math.sin(a),ct=Math.cos(t),st=Math.sin(t);
        const width=Math.pow(Math.max(.000001,ca),.81);
        const n=norm(st*ca/.53,sa/.43,ct*ca/.49);
        return [.53*width*st,.45*sa,.49*width*ct,...n];
      };
      for(let i=0;i<30;i++)for(let j=0;j<6;j++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
    });
  }
  const fullShell=helmetSkin(-Math.PI/2,Math.PI/2,0,TAU);
  const largeBand=helmetSkin(-.41,.31,-Math.PI,Math.PI);
  const cockpit=helmetSkin(-.36,.26,-1.34,1.34);
  const crest=helmetSkin(.31,1.55,-.245,.245);
  const napeStripe=helmetSkin(.31,1.55,Math.PI-.245,Math.PI+.245);
  const flashStripe=helmetSkin(.37,.415,0,TAU);
  const foil=mesh((tri,quad)=>{
    const outline=[[-.40,-.46],[-.48,.02],[-.19,.32],[.44,.57],[.5,.39],[.15,-.34]];
    for(let j=0;j<outline.length;j++){
      const [z,y]=outline[j],[Z,Y]=outline[(j+1)%outline.length];
      for(const sign of [-1,1])tri([sign*.5,0,0,sign,.1,.1],[sign*.24,y,z,sign,.3,.2],[sign*.24,Y,Z,sign,.3,.2]);
      quad([-.24,y,z,-.3,.6,.4],[.24,y,z,.3,.6,.4],[.24,Y,Z,.3,.6,.4],[-.24,Y,Z,-.3,.6,.4]);
    }
  });
  const headParts=[
    [fullShell,0,0,0,1,1,1,'cream'],
    [largeBand,0,0,0,1.023,1,1.023,'suit'],
    [cockpit,0,0,0,1.054,1,1.064,'ink'],
    [crest,0,.004,0,1.014,1.013,1.014,'suit'],
    [napeStripe,0,.004,0,1.014,1.013,1.014,'suit'],
    [flashStripe,0,.005,0,1.011,1.013,1.011,'gold'],
    [soft,0,-.036,-.504,.27,.117,.039,'navy'],
    [soft,0,-.031,-.528,.17,.037,.015,'mint']
  ];
  for(const sign of [-1,1]){
    headParts.push(
      [foil,sign*.50,.19,-.08,.169,.57,-.44,'orange'],
      [ball,sign*.519,-.016,-.05,.23,.298,.298,'navy'],
      [ball,sign*.576,-.016,-.05,.18,.222,.222,'gold'],
      [ball,sign*.617,-.016,-.05,.12,.135,.135,'suit'],
      [ball,sign*.164,-.013,.492,.106,.138,.045,'mint',sign*.22],
      [soft,sign*.254,.064,.450,.082,.014,.029,'blue',sign*.43],
      [ball,sign*.17,-.078,-.463,.048,.05,.034,'cream']);
  }
  const helmet=assemble(headParts);
  // A spline sweeps elliptical cross sections along a centreline. Rings share smooth
  // normals calculated from the actual tapered surface, including fins and bent tubing.
  function sculpt(knots,sides=16,steps=3,preferred=[1,0,0],horizontal=false){
    const rows=[], count=(knots.length-1)*steps;
    for(let i=0;i<=count;i++){
      const t=Math.min(i/steps,knots.length-1.000001),k=Math.floor(t),v=t-k;
      const a=knots[Math.max(0,k-1)],b=knots[k],c=knots[k+1],d=knots[Math.min(knots.length-1,k+2)];
      rows.push(b.map((value,j)=>.5*(2*value+(-a[j]+c[j])*v+
        (2*a[j]-5*value+4*c[j]-d[j])*v*v+(-a[j]+3*value-3*c[j]+d[j])*v*v*v)));
    }
    const points=rows.map((row,i)=>{
      const lo=rows[Math.max(i-1,0)],hi=rows[Math.min(i+1,count)];
      const t=norm(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]);
      if(horizontal)return Array.from({length:sides},(_,j)=>[row[0]+Math.cos(j*TAU/sides)*Math.max(.001,row[3]),row[1],row[2]+Math.sin(j*TAU/sides)*Math.max(.001,row[4])]);
      const axis=Math.abs(t[0]*preferred[0]+t[1]*preferred[1]+t[2]*preferred[2])>.96?[0,0,1]:preferred;
      const dot=t[0]*axis[0]+t[1]*axis[1]+t[2]*axis[2];
      const U=norm(...axis.map((n,j)=>n-dot*t[j])),B=cross(t,U);
      return Array.from({length:sides},(_,j)=>{
        const a=j*TAU/sides,cu=Math.cos(a)*Math.max(.001,row[3]),sv=Math.sin(a)*Math.max(.001,row[4]);
        return U.map((u,k)=>row[k]+cu*u+sv*B[k]);
      });
    });
    const verts=points.map((ring,i)=>ring.map((p,j)=>{
      const left=ring[(j+sides-1)%sides],right=ring[(j+1)%sides];
      const low=points[Math.max(0,i-1)][j],high=points[Math.min(count,i+1)][j];
      let n=norm(...cross(right.map((v,k)=>v-left[k]),high.map((v,k)=>v-low[k])));
      if(n.reduce((sum,v,k)=>sum+v*(p[k]-rows[i][k]),0)<0)n=n.map(v=>-v);
      return [...p,...n];
    }));
    return mesh((tri,quad)=>{
      for(let i=0;i<count;i++)for(let j=0;j<sides;j++){
        const n=(j+1)%sides;quad(verts[i][j],verts[i][n],verts[i+1][n],verts[i+1][j]);
      }
      for(const i of [0,count]){
        const j=i===0?1:count-1, cap=norm(...rows[i].slice(0,3).map((v,k)=>v-rows[j][k]));
        for(let k=0;k<sides;k++)tri([...rows[i].slice(0,3),...cap],[...points[i][k],...cap],[...points[i][(k+1)%sides],...cap]);
      }
    });
  }
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  const solid=(model,mat)=>[model,0,0,0,1,1,1,mat];
  const tube=(nodes,mat,sides=10)=>solid(sculpt(nodes,sides),mat);
  const loft=(nodes,mat,sides=24)=>solid(sculpt(nodes,sides,3,[1,0,0],true),mat);
  const cable=(points,r,mat)=>tube(points.map(p=>[...p,r,r]),mat,8);
  const orb=(x,y,z,w,h,d,mat)=>[ball,x,y,z,w,h,d,mat];
  function crewHead(kind){
    const parts=[],eyes=[],pendants=[];
    let eyeX=.195,eyeY=.025,eyeZ=.358,eyeAngle=.20,eyeH=.174;
    if(kind==='Lontra'){
      parts.push(loft([[0,-.365,.01,.09,.11],[0,-.29,.035,.36,.29],[0,-.10,.04,.485,.36],
        [0,.12,.012,.47,.357],[0,.29,-.027,.37,.29],[0,.365,-.044,.08,.09]],'fur',28));
      for(const s of [-1,1]){
        parts.push(orb(.387*s,.218,-.038,.278,.282,.167,'fur'),
          orb(.403*s,.225,.025,.171,.178,.092,'ear'),
          orb(.118*s,-.112,.362,.354,.220,.263,'muzzle'),
          orb(.268*s,-.079,.287,.226,.127,.118,'muzzle'));
        for(const [x,y] of [[.14,-.105],[.194,-.128],[.176,-.158]])
          parts.push(orb(s*x,y,.487-2.4*(x-.13)**2,.021,.018,.015,'suede'));
        parts.push(cable([[s*.187,.137,.314],[s*.223,.156,.30],[s*.299,.135,.279]],.024,'ear'));
      }
      parts.push(orb(0,-.192,.328,.31,.144,.19,'muzzle'),orb(0,-.042,.483,.161,.098,.080,'wet'));
      for(const s of [-1,1]){
        parts.push(cable([[s*.201,-.123,.481],[s*.30,-.117,.469],[s*.418,-.102,.448]],.006,'muzzle'),
          cable([[s*.195,-.152,.470],[s*.312,-.159,.445],[s*.40,-.164,.418]],.005,'muzzle'));
      }
      parts.push(cable([[0,-.091,.477],[0,-.136,.466],[.043,-.151,.459]],.009,'ear'));
      // A stitched flying cap wraps the nape. Brass-rimmed goggles rest above the eyes.
      parts.push([helmetSkin(-.52,.94,1.28,TAU-1.28),0,-.005,-.005,.952,.96,.81,'indigo'],
        cable([[-.36,.246,.155],[-.19,.301,.235],[0,.311,.256],[.19,.301,.235],[.36,.246,.155]],.052,'suede'));
      for(const s of [-1,1])parts.push([ball,s*.171,.256,.249,.309,.197,.148,'brass',s*.25],
        [ball,s*.171,.261,.309,.225,.135,.072,'lensBlue',s*.25],
        [soft,s*.181,.285,.345,.09,.013,.009,'mint',s*.25],
        [soft,s*.416,-.005,-.088,.073,.145,.094,'brass']);
      parts.push(cable([[-.29,.24,-.242],[-.21,.28,-.278],[0,.30,-.312],[.21,.28,-.278],[.29,.24,-.242]],.012,'gold'));
    }else if(kind==='Tubarão'){
      eyeX=.324;eyeY=.083;eyeZ=.344;eyeAngle=.42;eyeH=.166;
      parts.push(loft([[0,-.32,.035,.08,.11],[0,-.24,.074,.37,.32],[0,-.06,.096,.49,.42],
        [0,.122,.01,.46,.381],[0,.276,-.042,.31,.283],[0,.32,-.10,.08,.07]],'shark',28));
      parts.push(orb(0,-.158,.271,.73,.254,.53,'belly'),orb(0,-.117,.427,.46,.095,.217,'ink'),
        orb(0,-.048,.34,.78,.258,.487,'shark'),
        tube([[0,.23,-.115,.15,.16],[0,.40,-.14,.103,.15],[0,.59,-.21,.055,.096],[0,.7,-.33,.004,.006]],'shark'));
      for(const s of [-1,1]){
        parts.push(orb(s*.217,-.025,.541,.048,.023,.022,'ink'),cable([[s*.285,.192,.293],[s*.341,.188,.257],[s*.393,.158,.187]],.022,'indigo'));
        for(let k=0;k<3;k++)parts.push([soft,s*(.443-k*.011),-.037,-.004-k*.068,.021,.096,.018,'indigo',0,.22]);
        for(let k=0;k<2;k++)parts.push(tube([[s*(.094+k*.081),-.114,.515-k*.027,.032,.024],
          [s*(.096+k*.080),-.163,.511-k*.027,.003,.004]],'cream'));
        parts.push([foil,s*.436,-.091,-.123,.185,.265,-.46,'shark']);
      }
    }else if(kind==='Axolote'){
      eyeX=.234;eyeY=.041;eyeZ=.331;eyeH=.157;
      parts.push(loft([[0,-.325,.02,.06,.06],[0,-.25,.028,.32,.25],[0,-.067,.036,.469,.341],
        [0,.137,-.012,.464,.314],[0,.245,-.03,.34,.258],[0,.302,-.056,.056,.056]],'rose',26));
      for(const s of [-1,1]){
        parts.push(orb(s*.30,-.072,.302,.119,.065,.037,'gill'));
        for(let j=0;j<3;j++){
          const x=.36,y=.16-j*.10,endX=.54+(j===1?.17:.08),endY=.47-j*.28;
          pendants.push(tube([[s*x,y,-.027,.065,.079],[s*(x+.11),y+.04,-.043,.073,.065],
            [s*endX,endY,-.075,.017,.014]],'gill'));
          for(let k=1;k<4;k++){
            const t=k*.20,px=mix(x,endX,t),py=mix(y,endY,t);
            pendants.push(tube([[s*px,py,-.066,.036,.032],[s*(px+.067),py+.077,-.063,.025,.022],
              [s*(px+.081),py+.132,-.102,.003,.003]],k%2?'peach':'coral',9));
          }
        }
      }
      parts.push(cable([[-.108,-.10,.348],[-.054,-.133,.357],[.033,-.143,.357],[.11,-.11,.349]],.013,'plum'));
    }
    for(const s of [-1,1]){
      eyes.push([ball,s*eyeX,0,eyeZ,.159,eyeH,.087,'porcelain',s*eyeAngle],
        [ball,s*(eyeX+.012),.002,eyeZ+.034,.122,eyeH*.84,.073,'iris',s*eyeAngle],
        [ball,s*(eyeX+.012),.006,eyeZ+.062,.081,eyeH*.64,.033,'wet',s*eyeAngle],
        orb(s*eyeX-.003,.030,eyeZ+.087,.040,.042,.020,'white'),
        orb(s*eyeX+.031,-.016,eyeZ+.083,.015,.015,.012,'mint'));
    }
    return {head:assemble(parts),eyes:assemble(eyes),eyeY,frills:pendants.length?assemble(pendants):null};
  }
  const pilots=['Lontra','Tubarão','Axolote','Marujo'];
  const heads=[crewHead(pilots[0]),crewHead(pilots[1]),crewHead(pilots[2]),{head:helmet}];
  const suitBody=assemble([
    loft([[0,-.255,0,.185,.14],[0,-.19,0,.27,.20],[0,-.02,0,.335,.231],[0,.169,0,.356,.237],[0,.269,0,.234,.174]],'suit',22),
    [drum,0,-.181,0,.54,.095,.408,'suede'],[soft,0,-.181,.213,.175,.098,.048,'brass'],
    orb(0,.043,-.174,.48,.449,.248,'indigo'),
    [soft,0,.047,-.295,.29,.273,.071,'sail'],
    [soft,-.057,.051,-.337,.039,.173,.022,'indigo'],
    [hoop,.042,.053,-.34,.109,.168,.22,'indigo'],
    [drum,0,.27,0,.52,.121,.415,'rescue'],
    cable([[0,-.127,.208],[0,-.015,.234],[0,.108,.231],[0,.213,.184]],.015,'brass'),
    [soft,0,.146,.230,.043,.070,.026,'nickel'],
    ...[-1,1].flatMap(s=>[
      [soft,s*.140,-.023,.215,.181,.121,.058,'flannel',s*.23],
      [soft,s*.139,.018,.249,.191,.049,.022,'binding',s*.23],
      orb(s*.14,.009,.260,.027,.023,.015,'brass'),
      cable([[s*.064,.178,.223],[s*.107,.185,.217],[s*.145,.183,.210]],.013,'cream')
    ]),
    ...[-1,1].flatMap(s=>[
      tube([[s*.133,-.163,.182,.049,.028],[s*.225,.043,.173,.061,.037],[s*.206,.22,.11,.059,.04],
        [s*.186,.252,-.02,.054,.04],[s*.174,.17,-.201,.053,.035],[s*.146,-.13,-.207,.05,.033]],'indigo'),
      [soft,s*.209,.035,.207,.094,.074,.038,'brass',s*.31],
      orb(s*.229,-.027,-.24,.141,.335,.147,'nickel'),
      [drum,s*.229,-.005,-.24,.143,.085,.145,'rescue'],
      [drum,s*.229,-.188,-.24,.121,.062,.122,'ink']])
  ]);
  const upperLeg=assemble([orb(0,-.106,0,.22,.267,.230,'indigo'),orb(0,-.196,.016,.203,.154,.183,'suit')]);
  const lowerLeg=assemble([orb(0,-.089,0,.174,.231,.176,'indigo'),[drum,0,-.145,0,.181,.052,.187,'cream']]);
  const shoe=assemble([
    loft([[0,-.055,.056,.145,.194],[0,-.025,.075,.156,.237],[0,.021,.068,.16,.239],
      [0,.077,.032,.153,.184],[0,.125,-.008,.096,.086]],'orange',20),
    [soft,0,-.057,.072,.306,.049,.448,'navy'],
    [soft,0,.071,.129,.209,.038,.064,'sail',0,-.18],
    [soft,0,.089,.067,.18,.036,.053,'sail',0,-.25],
    ...[-1,1].flatMap(s=>[cable([[s*.145,-.012,-.038],[s*.157,.009,.026],[s*.141,.042,.098],[s*.093,.06,.153]],.010,'cream'),
      [soft,s*.135,.003,-.057,.020,.028,.06,'rescue']]),
    [soft,0,.075,-.111,.101,.085,.054,'rescue']
  ]);
  const sleeve=assemble([orb(0,-.083,0,.244,.25,.249,'suit'),[drum,0,-.17,0,.195,.059,.196,'sail']]);
  const mitt=assemble([orb(0,-.081,0,.154,.202,.161,'navy'),[drum,0,-.129,0,.19,.066,.184,'brass'],
    orb(0,-.21,.016,.224,.216,.205,'suede'),orb(-.072,-.174,.081,.096,.119,.091,'suede')]);
  const tailOtter=assemble([tube([[0,0,0,.17,.14],[0,-.095,-.131,.149,.12],[0,-.135,-.32,.104,.094],
    [0,-.11,-.51,.065,.063],[0,-.041,-.647,.008,.008]],'fur',16)]);
  const tailShark=assemble([tube([[0,0,0,.153,.13],[0,-.071,-.22,.114,.092],[0,-.017,-.42,.054,.055]],'shark'),
    tube([[0,-.205,-.525,.005,.009],[0,-.11,-.443,.057,.04],[0,-.024,-.422,.079,.06],[0,.15,-.48,.057,.064],[0,.281,-.594,.007,.007]],'shark')]);
  const tailAxolotl=assemble([tube([[0,0,0,.133,.127],[0,-.061,-.179,.106,.13],[0,-.034,-.382,.075,.114],
    [0,.091,-.544,.018,.008]],'rose'),tube([[0,.045,-.052,.014,.06],[0,.132,-.191,.022,.077],[0,.118,-.392,.014,.046],[0,.09,-.53,.004,.005]],'gill')]);
  const tails=[tailOtter,tailShark,tailAxolotl,null];
  const kerchief=assemble([tube([[0,0,0,.077,.056],[-.045,-.023,-.107,.106,.033],[-.095,-.085,-.224,.094,.022],
    [-.13,-.103,-.344,.061,.013],[-.201,-.100,-.426,.005,.005]],'rescue',12)]);
  let pilotIndex=0;
  try{const saved=Number(localStorage.getItem('mare-pilot'));if(Number.isInteger(saved)&&saved>=0&&saved<4)pilotIndex=saved;}catch{}
  let dockTime=0,dockAngle=.27,previousPilot=0;
  $('crew-open').addEventListener('click',()=>{
    previousPilot=pilotIndex;dockTime=0;dockAngle=.27;
    $('crew-motion').value='idle';$('crew-name').textContent=pilots[pilotIndex];
    camera.ready=false;shadowAt=mirrorAt=-1;setMode('dock');$('crew-next').focus();
  });
  function cyclePilot(delta){
    pilotIndex=(pilotIndex+delta+pilots.length)%pilots.length;
    $('crew-name').textContent=pilots[pilotIndex];
  }
  function closeDock(saveChoice){
    if(saveChoice){try{localStorage.setItem('mare-pilot',pilotIndex);}catch{}}
    else pilotIndex=previousPilot;
    showMenu();
  }
  $('crew-prev').addEventListener('click',()=>cyclePilot(-1));
  $('crew-next').addEventListener('click',()=>cyclePilot(1));
  $('crew-back').addEventListener('click',()=>closeDock(false));
  $('crew-use').addEventListener('click',()=>closeDock(true));
  window.addEventListener('keydown',e=>{
    if(mode!=='dock'||e.target===$('crew-motion'))return;
    if(e.code==='Escape')closeDock(false);
    if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();cyclePilot(e.code==='ArrowLeft'?-1:1);}
  });
  let dockFinger=null,lastFingerX=0;
  canvas.addEventListener('pointerdown',e=>{
    if(mode!=='dock')return;dockFinger=e.pointerId;lastFingerX=e.clientX;canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(mode==='dock'&&e.pointerId===dockFinger){dockAngle+=(e.clientX-lastFingerX)*.013;lastFingerX=e.clientX;}
  });
  canvas.addEventListener('lostpointercapture',()=>{dockFinger=null;});
  function drawPodium(){
    draw(drum,0,.064,4.5,2.5,.12,2.5,'ink');
    draw(drum,0,.132,4.5,2.49,.04,2.49,'brass');
    draw(drum,0,.168,4.5,2.39,.048,2.39,'teal');
  }
  function previewPilot(){
    const pose=$('crew-motion').value,t=dockTime, phase=t%2.2;
    const jumping=(pose==='jump'||pose==='dive')&&phase<.91;
    const plunge=pose==='dive'&&jumping&&phase>.29;
    return {...player,x:0,z:4.5,y:.185+(jumping?(1-phase/.91)*phase*3.1:0),a:Math.PI+dockAngle+.06*Math.sin(t*.8),
      stride:t*10.5,vx:0,vz:pose==='run'?6:0,vy:jumping?3.1-6.8*phase:0,ground:!jumping,dive:plunge?.5:0,
      landing:!jumping&&(pose==='jump'||pose==='dive')?Math.max(0,.19-(phase-.91)):0};
  }

  function drawRacer(r){
    if(r.left||r.wait>0||r.y<waterAtRacer(r))return;
    const [rx,ry,rz]=coursePoint(r.x,r.y,r.z);
    const kind=r.pilot ?? (pilotIndex+r.i)%heads.length, kit=heads[kind],suit=costumes[r.i];
    const time=mode==='dock'?dockTime:obstacleTime, speed=Math.hypot(r.vx,r.vz);
    const motion=clamp(speed/7,0,1), gait=r.ground?Math.sin(r.stride)*motion:0;
    const air=r.ground?0:1, tuck=air*clamp(.48+r.vy*.058,.13,1);
    const crouch=clamp((r.landing||0)*4.6,0,1), stun=clamp(r.stun*2.8,0,1);
    const dive=clamp(r.dive*8,0,1), idle=Math.sin(time*2.8+r.i);
    const bank=clamp((r.bank||0)*-.14+gait*.054+Math.sin(time*18+r.i)*stun*.28,-.5,.5);
    const pitch=-dive*1.21+stun*.65-motion*.105-.16*crouch;
    const sc=(online?r===player:r.i===0)?1.15:1.08, yaw=r.a+(atFarol?farol.yaw(r.z):0), co=Math.cos(yaw), si=Math.sin(yaw);
    const bob=(1-Math.cos(r.stride*2))*.034*motion*(1-air)-.115*crouch+.014*idle*(1-motion);
    // Forward kinematics: each distal segment starts at its parent's rotated endpoint.
    function limb(model,x,y,z,bend=0,twist=0,roll=0,scaleY=1){
      const Y=y-.61, cb=Math.cos(bank),sb=Math.sin(bank),ct=Math.cos(pitch),st=Math.sin(pitch);
      const dx=cb*x-sb*Y,hy=sb*x+cb*Y,dy=ct*hy+st*z+.61+bob,dz=ct*z-st*hy;
      draw(model,rx+(co*dx+si*dz)*sc,ry+dy*sc,rz+(-si*dx+co*dz)*sc,sc,sc*scaleY,sc,suit,yaw+twist,pitch+bend,0,1,bank+roll);
    }
    const hip=.510,hipLift=air*.055;
    for(const sign of [-1,1]){
      const phase=r.stride+(sign>0?0:Math.PI), stride=Math.sin(phase)*motion*(1-air);
      const hipAngle=stride*.92+.31*crouch+tuck*(sign>0?.94:.48)-dive*.35;
      const kneeAngle=hipAngle-(.12+Math.max(0,-Math.cos(phase))*.94*motion*(1-air)+tuck*.82+crouch*.75);
      const legX=sign*.171, z=sign*gait*.026;
      limb(upperLeg,legX,hip+hipLift,z,hipAngle);
      const ky=hip+hipLift-.217*Math.cos(hipAngle),kz=z+.217*Math.sin(hipAngle);
      limb(lowerLeg,legX,ky,kz,kneeAngle);
      limb(shoe,legX,ky-.207*Math.cos(kneeAngle),kz+.207*Math.sin(kneeAngle),kneeAngle*.44+.11*stride);
      const shoulder=-stride*.87+tuck*.43+dive*1.27+stun*Math.sin(time*20+sign)*.41;
      const elbow=shoulder+.28+motion*.52+tuck*.25, ax=sign*.356,ay=1.01,az=-.005;
      limb(sleeve,ax,ay,az,shoulder,sign*.09,-sign*(.12+.19*air));
      limb(mitt,ax+sign*(.035+.035*air),ay-.185*Math.cos(shoulder),az+.185*Math.sin(shoulder),elbow,sign*.1,-sign*.10);
    }
    limb(suitBody,0,.789,0,0,gait*.096);
    const tailSwing=Math.sin(r.stride-.48)*motion*.30+idle*.11+(r.bank||0)*.13;
    if(tails[kind])limb(tails[kind],0,.57,-.168,-.05+tuck*.24-crouch*.38,tailSwing);
    limb(kerchief,-.12,1.081,-.14,.24*motion+Math.sin(time*8+r.i)*(.08+.18*motion),-.29+gait*.20);
    const nod=-pitch*.35+.036*Math.cos(r.stride*2)*motion+.025*idle;
    const look=clamp(gait*.066+(r.bank||0)*.19+.075*idle*(1-motion),-.36,.36);
    const hy=1.433- .025*crouch;
    limb(kit.head,0,hy,.018,nod,look,-bank*.40);
    if(kit.eyes){
      const blink=Math.pow(Math.max(0,Math.cos(time*1.7+r.i*.77)),135);
      limb(kit.eyes,0,hy+kit.eyeY,.018,nod,look,-bank*.40,1-.90*blink);
    }
    if(kit.frills)limb(kit.frills,0,hy,.018,nod+Math.sin(time*5+r.i)*.06,look,-bank*.42);
    if(r.boost>0||r.flight>0)for(const s of [-1,1]){
      const x=s*.23,z=-.27;
      draw(ball,rx+co*x+si*z,ry+.45,rz-si*x+co*z,.12,.28+Math.sin(time*28)*.06,.15,'mint',yaw,-.65,2);
    }
    if(r===player&&mode!=='dock')draw(drum,rx,ry+2.45+idle*.042,rz,.16,.065,.16,'lime',0,0,2);
  }
  // Sliding obstacle: the crab shell rides on a toothed carriage. Fingers rotate on separate pivots.
  const machineShell=loft([[0,-.40,.03,.34,.29],[0,-.30,.04,.73,.41],[0,-.09,.02,.97,.51],
    [0,.13,.024,.90,.50],[0,.265,.07,.62,.36],[0,.323,.075,.20,.18]],'coral',28);
  const legsByPhase=[[],[]];
  const crabParts=[machineShell,orb(0,-.06,-.347,1.47,.355,.346,'peach'),
    [soft,0,-.141,-.499,.67,.077,.043,'ink']];
  for(const s of [-1,1]){
    crabParts.push(
      tube([[s*.33,.11,-.26,.109,.117],[s*.38,.289,-.274,.081,.10],[s*.438,.34,-.292,.092,.088]],'brass'),
      orb(s*.441,.349,-.298,.30,.292,.289,'cream'),orb(s*.441,.352,-.409,.209,.191,.10,'wet'),
      orb(s*.441-.036,.388,-.455,.064,.056,.029,'mint'),
      cable([[s*.09,.301,-.012],[s*.29,.27,-.165],[s*.55,.185,-.257],[s*.73,.04,-.316]],.021,'brass'));
    for(let j=0;j<3;j++){
      const z=.33-j*.26;
      const phase=(j+(s>0?1:0))%2;
      legsByPhase[phase].push(tube([[s*.59,-.10,z,.10,.10],[s*.83,-.038,z+.025,.094,.10],
        [s*1.03,-.224,z-.004,.058,.064],[s*1.08,-.47,z-.066,.034,.042]],j%2?'brass':'nickel',10),
        orb(s*.86,-.082,z,.133,.15,.137,'navy'),orb(s*1.08,-.45,z-.066,.074,.096,.127,'ink'));
    }
    for(let j=0;j<4;j++)crabParts.push(orb(s*(.36+j*.096),.265-j*.045,.124,.057,.043,.057,'sucker'));
  }
  const crabShell=assemble(crabParts), legSets=legsByPhase.map(assemble),pincers=[],thumbs=[];
  for(const s of [-1,1]){
    pincers.push(assemble([
      tube([[0,-.07,0,.084,.10],[s*.067,.010,-.008,.201,.155],[s*.164,.161,-.005,.205,.147],
        [s*.204,.306,.005,.141,.103],[s*.161,.422,-.030,.079,.059],[s*.058,.508,-.038,.010,.010]],'coral',20),
      orb(s*.026,.02,-.121,.22,.219,.063,'brass'),orb(s*.026,.02,-.153,.12,.12,.042,'wet'),
      cable([[s*.119,.167,-.154],[s*.164,.266,-.125],[s*.179,.332,-.092]],.019,'peach')
    ]));
    thumbs.push(assemble([tube([[0,-.035,0,.094,.084],[-s*.091,.058,-.020,.118,.097],
      [-s*.113,.189,-.018,.077,.07],[-s*.054,.292,-.011,.012,.013]],'orange',16)]));
  }
  const wheelPieces=[
    [drum,0,0,0,.355,.12,.355,'ink',0,Math.PI/2],
    [drum,0,0,-.065,.275,.045,.275,'brass',0,Math.PI/2],
    orb(0,0,-.098,.085,.085,.052,'nickel')
  ];
  for(let i=0;i<5;i++){
    const a=i*TAU/5;wheelPieces.push(orb(Math.cos(a)*.084,Math.sin(a)*.084,-.092,.061,.061,.014,'navy'));
  }
  const driveWheel=assemble(wheelPieces);
  function drawCrab(b,t,detailed){
    const x=b.x,z=b.z,w=b.width/2.6;
    const bounce=.024*Math.cos(t*b.w*3+b.p), tilt=-.031*Math.sin(t*b.w+b.p);
    draw(cube,0,.046,z,15,.035,.253,'ink');
    draw(crabShell,x,.779+bounce,z,w,1,1,'white',0,0,0,1,tilt);
    for(let i=0;i<2;i++){
      const s=i===0?-1:1, pivotX=x+s*.983*w, h=.765+bounce+s*tilt;
      const scuttle=Math.sin(b.x*3.1+b.p+i*Math.PI);
      draw(legSets[i],x+scuttle*.067*w,.762+bounce+Math.max(0,-scuttle)*.077,z,w,1,1,'white',0,scuttle*.07,0,1,tilt+scuttle*.085);
      const anticipation=Math.pow(Math.abs(Math.sin(t*b.w+b.p+.23)),4);
      const jaw=.13+.33*anticipation;
      draw(pincers[i],pivotX,h,z-.246,w,1,1,'white',0,-.13,0,1,-s*.16);
      draw(thumbs[i],pivotX+s*.031,h+.068,z-.278,w,1,1,'white',0,-.11,0,1,s*jaw);
      if(detailed)draw(driveWheel,x+s*.55*w,.253,z-.395,1,1,1,'white',0,0,0,1,-x*3.5);
    }
  }
  // Hydrofoil cross sections twist along the padded sweepers, with inset livery bands.
  function rotorWing(start,end,r,sign){
    const sample=(v,a)=>{
      const t=mix(start,end,v),w=.16+.14*Math.sin(t*Math.PI)+.07*t;
      const z=sign*(.125*Math.sin(t*Math.PI)+.097*t);
      return [sign*(.32+(r-.41)*t),.038*Math.sin(t*Math.PI)+.175*Math.sin(a),z+w*Math.cos(a)];
    };
    return mesh((tri,quad)=>{
      const point=(i,j)=>{
        const v=i/5,a=j*TAU/14,p=sample(v,a),along=sample(v+.002,a),around=sample(v,a+.002);
        const n=norm(...cross(around.map((x,k)=>x-p[k]),along.map((x,k)=>x-p[k]))).map(x=>-x*sign);
        return [...p,...n];
      };
      for(let i=0;i<5;i++)for(let j=0;j<14;j++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));
    });
  }
  for(const rotor of spinners){
    const r=rotor.r,base=r>2?1:.66;
    const fixed=[
      [drum,0,.09,0,base*2.16,.17,base*2.16,'navy'],
      tube([[0,.14,0,.85*base,.85*base],[0,.23,0,.86*base,.86*base],[0,.335,0,.64*base,.64*base],
        [0,.37,0,.42*base,.42*base]],'orange',26),
      [drum,0,.46,0,.66,.28,.66,'nickel']
    ];
    for(let k=0;k<10;k++){
      const a=k*TAU/10;fixed.push([hex,.72*base*Math.sin(a),.27,.72*base*Math.cos(a),.098,.063,.098,'brass',a]);
    }
    rotor.pivot=assemble(fixed);
    const blades=[[drum,0,0,0,.81,.32,.81,'brass'],orb(0,.11,0,.69,.34,.69,'aqua'),
      [hex,0,.264,0,.20,.094,.20,'nickel']];
    const borders=[0,.12,.30,.35,.40,.64,.78,.83,.88,1];
    for(const s of [-1,1]){
      for(let j=1;j<borders.length;j++){
        const mat=['navy','coral','cream','indigo','coral','orange','cream','indigo','coral'][j-1];
        blades.push(solid(rotorWing(borders[j-1],borders[j],r,s),mat));
      }
      blades.push(orb(s*(r-.10),0,s*.097,.271,.41,.47,'navy'),orb(s*(r-.075),.141,s*.093,.157,.102,.181,'lime'));
    }
    rotor.baton=assemble(blades);
  }
  const springWire=solid(sculpt(Array.from({length:29},(_,i)=>{
    const a=i*TAU/7,t=i/28;
    return [.165*Math.cos(a),t*.36,.165*Math.sin(a),.033,.033];
  }),8,2),'nickel');
  const coil=assemble([springWire]);
  for(const p of springs){
    const plate=[[soft,0,0,0,p.w*.91,.129,2.31,'indigo'],[soft,0,.055,0,p.w*.81,.072,2.13,'teal']];
    for(let j=-1;j<=1;j++)for(const s of [-1,1]){
      plate.push([soft,s*.357,.107,j*.546,.89,.038,.19,'lime',s*.437]);
    }
    for(const s of [-1,1])for(const end of [-1,1])plate.push([hex,s*(p.w*.39),.094,end*.915,.10,.041,.10,'brass']);
    p.plate=assemble(plate);
  }
  function drawSpring(p,t){
    const age=Math.max(0,t-(p.firedAt??-20));
    const pulse=age<.9?Math.exp(-5.6*age)*Math.sin(19*age):0;
    const dip=.68*pulse, pitch=-.115-.22*pulse;
    for(const s of [-1,1]){
      draw(coil,p.x+s*p.w*.306,.15,p.z+.67,1,.74+dip,1,'white');
    }
    draw(p.plate,p.x,.37+pulse*.18,p.z,1,1,1,'white',0,pitch);
  }
  const mantle=assemble([
    loft([[0,-3.9,0,1.8,1.5],[0,-2.6,.02,3.33,2.97],[.03,-.64,.12,4.42,3.76],[.16,1.65,.30,4.30,3.88],
      [.32,3.69,.64,3.16,2.83],[.48,4.89,.95,1.67,1.46],[.56,5.28,1.15,.11,.11]],'plum',36),
    ...[-1,1].flatMap(s=>[
      tube([[s*3.62,.63,.69,.56,.59],[s*4.31,1.19,.85,.52,.52],[s*4.66,1.68,.92,.14,.16],[s*4.84,1.81,.95,.021,.017]],'gill'),
      ...Array.from({length:7},(_,j)=>orb(s*(2.14+j%4*.34),.55+Math.floor(j/4)*.31,-3.38+j%4*.234,.19,.145,.14,'sucker')),
      orb(s*1.52,1.31,-3.21,2.21,2.32,1.62,'cream'),
      tube([[s*.75,2.31,-3.33,.12,.10],[s*1.56,2.57,-3.16,.22,.18],[s*2.27,2.42,-2.94,.09,.08]],'gill',12)
    ]),
    orb(0,-.09,-3.63,1.04,.52,.22,'ink'),orb(0,-.21,-3.749,.57,.16,.083,'sucker')
  ]);
  function drawKraken(t){
    const breath=1+.015*Math.sin(t*1.32),heave=.14*Math.sin(t*1.1),y=.98+heave;
    draw(mantle,squidX,y,squidZ,1,breath,1,'white');
    const look=clamp((player.x-squidX)*.02,-.31,.31), blink=Math.pow(Math.max(0,Math.cos(t*1.47)),108);
    for(const s of [-1,1]){
      draw(ball,squidX+s*1.52+look,y+1.34*breath,squidZ-3.94,1.09,1.41*(1-.82*blink),.46,'wet');
      draw(ball,squidX+s*1.52+look-.17,y+1.62*breath,squidZ-4.159,.29,.34*(1-.82*blink),.09,'mint');
    }
  }
  function resize() {
    const quality=Math.min(devicePixelRatio||1,1.55,1920/innerWidth,1220/innerHeight)*renderScale;
    const width=Math.max(1,Math.round(innerWidth*quality)),height=Math.max(1,Math.round(innerHeight*quality));
    if(width===canvas.width && height===canvas.height) return;
    canvas.width=width;
    canvas.height=height;
    gl.viewport(0,0,width,height);
    const aspect=width/height, vertical=aspect<.93?1.14:1.75;
    gl.uniform2f(u.lens,vertical/aspect,vertical);
  }
  window.addEventListener('resize',resize);
  function render(dt) {
    if(mode==='menu') return;
    const portrait=innerWidth/innerHeight<.93;
    const inDock=mode==='dock', lineup=inDock?[previewPilot()]:racers;
    const px=inDock?0:player.x,pz=inDock?4.5:player.z;
    const zFollow=player.wait>0?checkpoints[player.cp]:pz;
    const xFollow=player.wait>0?0:px;
    const height=Math.max(0,player.y)*.32;
    const swing=mode==='countdown'?clamp((countdown-.45)/2.6,0,1):0;
    const orbit=swing*swing*(3.-2.*swing)*2.44;
    const distance=portrait?8.55:6.95;
    const impact=(player.landing||0)*1.05;
    const inspectionLift=inDock?(lineup[0].y-.185)*.65:0;
    const position=inDock?[.44,1.78+inspectionLift,4.5-(portrait?4.05:3.62),0,1.22+inspectionLift,4.5]:
      [...coursePoint(xFollow*.82+Math.sin(orbit)*distance+(atFarol?12*swing:0),
        3.65+height-impact+swing*(atFarol?8:-.95),zFollow-Math.cos(orbit)*distance),
       ...coursePoint(xFollow*.96+.13*player.vx-(atFarol?8*swing:0),1.04+height+(atFarol?5*swing:0),zFollow+5.85*(1.-swing))];
    const alpha=camera.ready?1-Math.exp(-dt*10):1;
    camera.ready=true;
    ['x','y','z','tx','ty','tz'].forEach((key,i)=>camera[key]=mix(camera[key],position[i],alpha));
    const {x,y,z,tx,ty,tz}=camera;
    const f=norm(tx-x,ty-y,tz-z), s=norm(f[2],0,-f[0]);
    const up=[f[1]*s[2],f[2]*s[0]-f[0]*s[2],-f[1]*s[0]];
    const speedZoom=player.boost>0||player.flight>0 ? .91:1;
    camera.zoom=mix(camera.zoom||1,speedZoom,Math.min(1,dt*5));
    const lens=(inDock?(portrait?1.53:1.93):portrait?1.14:1.75)*camera.zoom;
    gl.uniform2f(u.lens,lens/(canvas.width/canvas.height),lens);
    gl.uniform3f(u.eye,x,y,z);
    gl.uniform3fv(u.forward,f);
    gl.uniform3fv(u.side,s);
    gl.uniform3fv(u.up,up);
    gl.uniform1f(u.tide,obstacleTime);
    const seaLevel=atFarol?farol.water(obstacleTime):-3.4;
    gl.uniform1f(u.seaLevel,seaLevel);
    gl.uniform2f(u.viewportSize,canvas.width,canvas.height);
    const stamp=performance.now();
    samplers(dummy.texture,dummy.texture);
    if(shadowMap.ready && (stamp-shadowAt>(software?160:48) || shadowAt<0)){
      shadowAt=stamp;
      const [sx,,sz]=coursePoint(px,0,pz+12);
      gl.uniform2f(u.shadowCenter,Math.round(sx*4)/4,Math.round(sz*4)/4);
      beginTarget(shadowMap,1,1);
      for(const batch of fixedScene)if(atFarol || (batch.far>pz-31&&batch.near<pz+53))draw(...batch);
      drawFestival(obstacleTime);drawObstacles(obstacleTime);
      if(inDock)drawPodium();
      for(const r of lineup) if(Math.abs(r.z-pz)<(software?20:46))drawRacer(r);
    }
    if(reflection.ready && (stamp-mirrorAt>(qualityMode==='light'?480:software?280:90) || mirrorAt<0)){
      mirrorAt=stamp;beginTarget(reflection,2,0);
      for(const batch of fixedScene)if(atFarol||batch.far>pz-18||swing>.15)draw(...batch);
      drawFestival(obstacleTime);drawObstacles(obstacleTime);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
    samplers(shadowMap.texture,reflection.texture);
    gl.uniform1f(u.shadowsOn,shadowMap.ready?1:0);gl.uniform1f(u.mirrorOn,reflection.ready?1:0);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(u.passKind,3);gl.depthMask(false);
    draw(plane,0,0,0,1,1,1,'white');
    gl.depthMask(true);gl.uniform1f(u.passKind,0);
    draw(plane,x,seaLevel,z,750,1,750,'ocean',0,0,1);
    for(const batch of fixedScene)if(atFarol||batch.far>pz-18||swing>.15)draw(...batch);
    drawFestival(obstacleTime);drawObstacles(obstacleTime);
    if(inDock)drawPodium();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if(atFarol)farol.drawLight(obstacleTime);
    for(const r of lineup) if(!r.left&&r.wait<=0&&floor(r.x,r.z)) {
      const size=.88+Math.max(0,r.y)*.12;
      draw(drum,...coursePoint(r.x,.033,r.z),1.12*size,.008,.88*size,'navy',0,0,2,.29/(1+Math.max(0,r.y)));
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for(const r of lineup) drawRacer(r);
    for(const p of particles) draw(ball,...coursePoint(p.x,p.y,p.z),p.trail?.15:.12,.12,p.trail?.5:.12,p.trail?'gold':'mint',0,0,2);
  }

  function snapshot() {
    return {mode, elapsed, countdown, obstacleTime, pads:springs.map(p=>p.firedAt),
      motion:racers.map(r=>[r.coyote,r.springLock,r.nextJump,Number(!!r.dove)]),
      racers:racers.map(r=>[...netFields.map(k=>Math.round((r[k]||0)*1000)/1000),Number(r.ground),
        [...r.gates].reduce((mask,n)=>mask|(1<<n),0),Number(r.left)])};
  }
  function applySnapshot(s, exact=false) {
    if(!online || !['race','countdown'].includes(s?.mode) || ![s.elapsed,s.countdown,s.obstacleTime].every(Number.isFinite) ||
        !Array.isArray(s.racers) || s.racers.length!==racers.length ||
        !s.racers.every(row=>Array.isArray(row)&&row.length===netFields.length+3&&row.every(Number.isFinite)) ||
        !Array.isArray(s.pads) || s.pads.length!==springs.length || !s.pads.every(Number.isFinite)) return;
    if(s.motion && (!Array.isArray(s.motion) || s.motion.length!==racers.length ||
      !s.motion.every(row=>Array.isArray(row)&&row.length===4&&row.every(Number.isFinite)))) return;
    if(mode!==s.mode) setMode(s.mode);
    elapsed=s.elapsed; countdown=s.countdown; obstacleTime=s.obstacleTime;
    if (online.stalled) { online.stalled=false; $('toast').hidden=true; }
    online.age=0; updateObstacles(obstacleTime);
    springs.forEach((p,i)=>p.firedAt=s.pads[i]);
    const previous={gates:player.gates.size,cp:player.cp,falls:player.falls,dive:player.dive,flight:player.flight,ground:player.ground};
    racers.forEach((r,i)=>{
      const row=s.racers[i];
      const target={x:row[0],y:row[1],z:row[2]};
      if(exact || !r.target || Math.hypot(r.x-target.x,r.z-target.z)>3) Object.assign(r,target);
      r.target=target;
      for(let n=3;n<netFields.length;n++) r[netFields[n]]=row[n];
      r.cp=clamp(Math.trunc(r.cp),0,checkpoints.length-1);
      r.ground=!!row[netFields.length]; r.left=online.departed.has(r.i)||!!row[netFields.length+2];
      if(s.motion) [r.coyote,r.springLock,r.nextJump,r.dove]=s.motion[i];
      r.gates=new Set(gates.map((_,n)=>n).filter(n=>row[netFields.length+1] & (1<<n)));
    });
    if (mode==='race') {
      playRaceBeat();
      if(player.cp>previous.cp) {notify('Checkpoint alcançado');tone(523,.15,'triangle');}
      else if(player.gates.size>previous.gates) {notify('Anel de turbo!');tone(540,.22,'sine',0,1.8);}
      else if(player.falls>previous.falls) {notify('De volta ao checkpoint');tone(92,.26,'sine',0,.62);}
      else if(player.flight>0 && !previous.flight) {notify('Impulso!');tone(240,.25,'triangle',0,2.7);}
      else if(player.dive>0 && !previous.dive) tone(285,.17,'triangle',0,.57);
      else if(previous.ground && !player.ground && player.vy>4) tone(320,.13,'triangle',0,1.65);
    }
    finishers=racers.filter(r=>r.result).sort((a,b)=>a.result-b.result);
    const count=Math.ceil(countdown-.14);
    $('count').hidden=mode!=='countdown' && elapsed>.72;
    $('count').textContent=count>0?count:'VAI!';
    if (mode==='countdown' && lastCount!==count) {lastCount=count;tone(count>0?370:735,.13,'triangle');}
    updateHUD();
    return true;
  }
  function clientStep(dt) {
    if(notice>0 && (notice-=dt)<=0) $('toast').hidden=true;
    online.age=(online.age||0)+dt;
    if (online.age>5 && !online.stalled) {
      online.stalled=true; notice=0;
      $('toast').textContent='Sincronizando a corrida com os outros pilotos…'; $('toast').hidden=false;
    }
    if (online.age<.12 && mode==='race') {obstacleTime+=dt;updateObstacles(obstacleTime);}
    for(const r of racers) if(r.target) {
      const lead=mode==='race' && !r.result && !r.wait?Math.min(.07,online.age):0;
      const alpha=1-Math.exp(-30*dt);
      r.x=mix(r.x,r.target.x+r.vx*lead,alpha);
      r.z=mix(r.z,r.target.z+r.vz*lead*(atFarol?farol.distanceScale(r.target.x,r.target.z):1),alpha);
      r.y=mix(r.y,r.target.y+r.vy*lead,alpha);
    }
  }
  if (window.createTurboRoom) {
    room=window.createTurboRoom({
      pilot:()=>pilotIndex,
      begin(session) {online={...session,departed:new Set()}; training=false;rankSignature='';lastNetSend=-100;startRace();},
      apply:applySnapshot,
      checkpoint:()=>online?snapshot():null,
      authority(isHost,state,seat) {
        if(!online) return;
        if(state) applySnapshot(state,true);
        online.host=isHost; online.leaderSlot=seat;
        notify(isHost?'Você assumiu a sala.':(racers.find(r=>r.i===seat)?.name||'Outro piloto')+' assumiu a sala.');
        updateHUD();
        lastNetSend=-100;
        lastStamp=undefined;
        accumulator=0;
      },
      gone(seat) {
        if(!online) return;
        online.departed.add(seat);
        const r=racers.find(r=>r.i===seat);
        if(r) r.left=true;
      },
      reset() {
        online=null;
        if ($('race-exit').open) $('race-exit').close();
        showMenu();
      }
    });
    $('race-stay').addEventListener('click',()=>$('race-exit').close());
    $('race-leave').addEventListener('click',()=>room.leave());
  }
  // Menu cover and game graphics are embedded for offline play.
  freshRace();
  resize();
  let hudTimer=0;
  function frame(stamp) {
    const wall=(stamp-(lastStamp??stamp))/1000;
    if(qualityMode==='auto'&&(mode==='race'||mode==='countdown')){
      slowFrames=wall>.039?slowFrames+1:Math.max(0,slowFrames-1);
      fastFrames=wall>.001&&wall<.02?fastFrames+1:0;
      if(slowFrames>=5 && renderScale>.48){renderScale=Math.max(.48,renderScale*.83);slowFrames=0;resize();}
      if(fastFrames>180 && renderScale<1){renderScale=Math.min(1,renderScale+.08);fastFrames=0;resize();}
    }
    const dt=Math.min(.32,wall);
    lastStamp=stamp;
    accumulator+=dt;
    while(accumulator>=1/120) {
      step(1/120);
      accumulator-=1/120;
    }
    if(mode==='race' && (hudTimer+=dt)>.095) {
      updateHUD();
      hudTimer=0;
    }
    if (online && stamp-lastNetSend>=50) {
      lastNetSend=stamp;
      if(online.host) room.state(snapshot());
      else {
        const [x,z,j,d]=playerInput();
        room.input([x,z,Number(j),Number(d)]);
        jumpPressed=divePressed=0;
      }
    }
    render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
