(function(){let e=Math.PI*2,t=3.6,n=.5,r=4.8,i=[.75,1,1.25],a=[{step:2,beats:2.5,dy:-4,gain:.9,q:4,grid:0,smooth:!0},{step:3,beats:5.2,dy:4,gain:.5,q:5,grid:.5,smooth:!1},{step:5,beats:7.8,dy:-8,gain:.42,q:6,grid:0,smooth:!0}],o={step:1,beats:0,dy:0,gain:.8,q:4,grid:0},s=[0,-1,-2,-1,-3],c=a.length;function l(e,t=1){let n=e.length/2,r=new Float32Array(n);for(let t=1;t<n;t++)r[t]=r[t-1]+Math.hypot(e[2*t]-e[2*t-2],e[2*t+1]-e[2*t-1]);return{xy:e,L:r,len:r[n-1],amp:t}}function u(c){let l=c,u=(t,r,i)=>Math.sin(t*n*e+r*2.6)*i+Math.sin(t*n*2.7+r*1.3)*i*.4,d=e=>{let t=Math.floor((e-.5*l)/l)%s.length;return s[(t+s.length)%s.length]},f=e=>{let t=l*16,n=(e%t+t)%t/t;return-3*(n<.5?n*2:2-n*2)};function p(e,n,a,o,s,c=0){let d=s*.5,f=Math.sqrt(o*o+s*s)/2+60,p=26*a.step,m=i[Math.min(2,Math.floor(e%3/3*3))],h=a.smooth?0:a.q*m*Math.max(0,Math.min(1,(n-.1)/.9)),g=a.smooth?0:p*n,_=t*(1+(r*a.gain-1)*n),v=e-a.beats*l*n,y=a.dy*n+c,b=g>=p-.6,x=``,S=!0,C=0,w=0,T=0;for(let e=-f;e<=f;e+=p){let t=e/600,n=u(t,v,_);h>.05&&(n=Math.round(n/h)*h);let r=o/2+e,i=d+n+y;S?(x=`M`+r.toFixed(1)+` `+i.toFixed(1),T=i,S=!1):b&&Math.abs(i-T)<.05?x+=`H`+r.toFixed(1):b?(x+=`H`+r.toFixed(1)+`V`+i.toFixed(1),T=i):(g>.5&&(x+=`L`+(C+g).toFixed(1)+` `+w.toFixed(1)),x+=`L`+r.toFixed(1)+` `+i.toFixed(1),T=i),C=r,w=i}return x}let m=(e,t,n)=>{let r=e.grid*l*t,i=Math.floor((n-r)/l)*l+r;return t===0?n:i+(1-t)*(n-i)};function h(e,n,a,o,s=0){let c=26*a.step,d=i[Math.min(2,Math.floor(e%3/3*3))],f=a.smooth?0:a.q*d*Math.max(0,Math.min(1,(n-.1)/.9)),p=a.smooth?0:c*n,m=t*(1+(r*a.gain-1)*n)*o.amp,h=e-a.beats*l*n,g=(a.dy*n+s)*o.amp,_=p>=c-.6,{xy:v,L:y,len:b}=o,x=y.length-1,S=1,C=[],w=(e,t)=>{for(;S<x&&y[S]<e;)S++;let n=S-1,r=y[S]-y[n]||1,i=Math.max(0,Math.min(1,(e-y[n])/r)),a=v[2*S]-v[2*n],o=v[2*S+1]-v[2*n+1],s=Math.hypot(a,o)||1;C.push(v[2*n]+a*i-o/s*t,v[2*n+1]+o*i+a/s*t)},T=b/2,E=!0,D=0,O=0,k=0;for(let e=0;e<=b;e+=c){let t=u((e-T)/600,h,m);f>.05&&(t=Math.round(t/f)*f);let n=t+g;E?(w(e,n),k=n,E=!1):_&&Math.abs(n-k)<.05?w(e,n):_?(w(e,k),w(e,n),k=n):(p>.5&&w(D+p,O),w(e,n),k=n),D=e,O=n}return C}let g=e=>{let t=``;for(let n=0;n<e.length;n+=2)t+=(n?`L`:`M`)+e[n].toFixed(1)+` `+e[n+1].toFixed(1);return t},_=NaN,v=a.map(()=>NaN),y=a.map(()=>NaN),b=NaN,x=NaN,S=NaN,C=NaN,w=NaN;return{step(e,t,n,r){let i=t!==x||n!==S||r!==C;if(!i&&e===b)return null;b=e,x=t,S=n,C=r,w=NaN;let s={main:null,echoes:a.map(()=>null),echoesOn:t>.02},c=m(o,t,e);if((i||c!==_)&&(_=c,s.main=p(c,t,o,n,r)),s.echoesOn)for(let o=0;o<a.length;o++){let c=a[o];if(c.smooth){s.echoes[o]=p(e,t,c,n,r,f(e)*t);continue}let l=m(c,t,e),u=d(e);(i||l!==v[o]||u!==y[o])&&(v[o]=l,y[o]=u,s.echoes[o]=p(l,t,c,n,r,u*t))}return s},stepCurve(e,t,n,r){let i=t!==x||r!==w;if(!i&&e===b)return null;b=e,x=t,w=r,S=NaN;let s={main:null,echoes:a.map(()=>null),echoesOn:t>.02},c=m(o,t,e);if((i||c!==_)&&(_=c,s.main=g(h(c,t,o,n))),s.echoesOn)for(let r=0;r<a.length;r++){let o=a[r];if(o.smooth){s.echoes[r]=g(h(e,t,o,n,f(e)*t));continue}let c=m(o,t,e),l=d(e);(i||c!==v[r]||l!==y[r])&&(v[r]=c,y[r]=l,s.echoes[r]=g(h(c,t,o,n,l*t)))}return s},mainCurve(e,t,n){return h(m(o,t,e),t,o,n)}}}function d(e=33.333333333333336){let t=e-(performance.timeOrigin+performance.now())%e-6;return t<8&&(t+=e),t}var f=class{pts=/* @__PURE__ */ new Float32Array(32768);np=0;polys=[];ops=[];ring=null;nx=0;ny=1;reset(){this.np=0,this.polys.length=0,this.ops.length=0,this.ring=null}begin(){return this.polys.push(this.np,0),this.polys.length/2-1}add(e,t,n){if(this.np*3+3>this.pts.length){let e=new Float32Array(this.pts.length*2);e.set(this.pts),this.pts=e}let r=this.np*3;this.pts[r]=e,this.pts[r+1]=t,this.pts[r+2]=n,this.np++,this.polys[this.polys.length-1]++}};let p=e=>Math.min(1,Math.max(0,e));var m=class{a=/* @__PURE__ */ new Float32Array(65536);n=0;need(e){if(this.n+e<=this.a.length)return;let t=this.a.length*2;for(;t<this.n+e;)t*=2;let n=new Float32Array(t);n.set(this.a.subarray(0,this.n)),this.a=n}};function h(e,t=!0){let n=e.getContext(`webgl2`,{alpha:!0,premultipliedAlpha:!0,antialias:t,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:`low-power`});if(!n)return null;let r=(e,t)=>{let r=n.createProgram();for(let[i,a]of[[n.VERTEX_SHADER,e],[n.FRAGMENT_SHADER,t]]){let e=n.createShader(i);n.shaderSource(e,a),n.compileShader(e),n.attachShader(r,e)}if(n.linkProgram(r),!n.getProgramParameter(r,n.LINK_STATUS))throw Error(n.getProgramInfoLog(r)??`link`);return r},i,a,o,s;try{i=r(`#version 300 es
in vec2 aP;
in vec2 aM;
in float aS;
in float aL;
uniform vec2 uRes;
uniform float uHw;
uniform float uDpr;
out vec2 vPos;
out float vD;
out float vL;
void main() {
  vec2 p = aP + aM * (aS * uHw);
  vPos = p;
  vD = aS * uHw * uDpr;
  vL = aL;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`,`#version 300 es
precision highp float;
in vec2 vPos;
in float vD;
in float vL;
uniform vec2 uDash;
uniform vec2 uWin;
uniform float uCore;
uniform float uCov;
uniform float uDpr;
uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uC2;
uniform vec3 uG;
uniform int uRing;
uniform vec4 uE;
uniform vec4 uR;
out vec4 o;
// 到椭圆的近似有符号距离（CSS px，外正内负）
float ell(vec2 q, vec2 r) {
  float k = length(q / r);
  float g = length(q / (r * r));
  return (k - 1.0) * k / max(g, 1e-6);
}
void main() {
  float cov = clamp(uCore + 0.5 - abs(vD), 0.0, 1.0) * uCov;
  vec4 c = uC0;
  if (uG.z > 0.0) {
    float t = clamp(length(vPos - uG.xy) / uG.z, 0.0, 1.0);
    c = t < 0.55 ? mix(uC0, uC1, t / 0.55) : mix(uC1, uC2, (t - 0.55) / 0.45);
  }
  if (uRing == 1) {
    vec2 d = vPos - uE.xy;
    vec2 q = vec2(d.x * uE.z + d.y * uE.w, -d.x * uE.w + d.y * uE.z);
    cov *= clamp(0.5 - ell(q, uR.xy) * uDpr, 0.0, 1.0) * clamp(0.5 + ell(q, uR.zw) * uDpr, 0.0, 1.0);
  }
  if (uDash.x > 0.0) {
    float m = mod(vL, uDash.x + uDash.y);
    cov *= clamp(min(m, uDash.x - m) * uDpr + 0.5, 0.0, 1.0);
  }
  if (uWin.y >= uWin.x) cov *= clamp((vL - uWin.x) * uDpr + 0.5, 0.0, 1.0) * clamp((uWin.y - vL) * uDpr + 0.5, 0.0, 1.0);
  float a = c.a * cov;
  o = vec4(c.rgb * a, a);
}`),a=r(`#version 300 es
in vec2 aP;
uniform vec2 uRes;
void main() {
  vec2 c = aP / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`,`#version 300 es
precision mediump float;
uniform float uA;
out vec4 o;
void main() { o = vec4(0.0, 0.0, 0.0, uA); }`),o=r(`#version 300 es
uniform vec2 uRes;
uniform vec3 uC;
out vec2 vPos;
void main() {
  vec2 k = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 p = uC.xy + k * (uC.z + 1.0);
  vPos = p;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`,`#version 300 es
precision highp float;
in vec2 vPos;
uniform vec3 uC;
uniform vec4 uCol;
uniform int uSoft;
uniform float uDpr;
out vec4 o;
void main() {
  float d = length(vPos - uC.xy);
  float cov = uSoft == 1 ? clamp(1.0 - d / uC.z, 0.0, 1.0) : clamp((uC.z - d) * uDpr + 0.5, 0.0, 1.0);
  float a = uCol.a * cov;
  o = vec4(uCol.rgb * a, a);
}`),s=r(`#version 300 es
out vec2 vUv;
void main() {
  vec2 k = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vUv = k;
  gl_Position = vec4(k.x * 2.0 - 1.0, 1.0 - k.y * 2.0, 0.0, 1.0);
}`,`#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uA;
out vec4 o;
void main() { o = texture(uTex, vUv) * uA; }`)}catch{return null}let c=(e,t)=>Object.fromEntries(t.map(t=>[t,n.getUniformLocation(e,t)])),l=c(i,[`uRes`,`uHw`,`uDpr`,`uCore`,`uCov`,`uC0`,`uC1`,`uC2`,`uG`,`uRing`,`uE`,`uR`,`uDash`,`uWin`]),u=c(a,[`uRes`,`uA`]),d=c(o,[`uRes`,`uC`,`uCol`,`uSoft`,`uDpr`]),f=c(s,[`uTex`,`uA`]),h=n.createVertexArray(),g=n.createBuffer();n.bindVertexArray(h),n.bindBuffer(n.ARRAY_BUFFER,g);let _=n.getAttribLocation(i,`aP`),v=n.getAttribLocation(i,`aM`),y=n.getAttribLocation(i,`aS`),b=n.getAttribLocation(i,`aL`);n.enableVertexAttribArray(_),n.vertexAttribPointer(_,2,n.FLOAT,!1,24,0),n.enableVertexAttribArray(v),n.vertexAttribPointer(v,2,n.FLOAT,!1,24,8),n.enableVertexAttribArray(y),n.vertexAttribPointer(y,1,n.FLOAT,!1,24,16),n.enableVertexAttribArray(b),n.vertexAttribPointer(b,1,n.FLOAT,!1,24,20);let x=n.createVertexArray(),S=/* @__PURE__ */ new Map,C=n.createVertexArray(),w=n.createBuffer();n.bindVertexArray(C),n.bindBuffer(n.ARRAY_BUFFER,w);let T=n.getAttribLocation(a,`aP`);n.enableVertexAttribArray(T),n.vertexAttribPointer(T,2,n.FLOAT,!1,8,0),n.bindVertexArray(null),n.disable(n.DEPTH_TEST),n.enable(n.BLEND),n.clearColor(0,0,0,0);let E=1,D=1,O=1,k=new m,A=new m,j=[],M=/* @__PURE__ */ new Map;function N(e,t,n){let r=e.pts,i=k.n/6,a=!1,o=0,s=0;for(;s<n;){for(;s<n&&r[(t+s)*3+2]!==1;)s++;let e=s;for(s++;s<n&&r[(t+s)*3+2]===2;)s++;let i=s,c=i-e;if(c<2)continue;k.need((c*2+2)*6);let l=k.a,u=r[(t+e)*3],d=r[(t+e)*3+1],f=Math.hypot(r[(t+i-1)*3]-u,r[(t+i-1)*3+1]-d)<.5&&c>3,p=n=>{let i=(t+e+n)*3,a=r[i+3]-r[i],o=r[i+4]-r[i+1],s=Math.hypot(a,o);return s>1e-6?[-o/s,a/s]:[NaN,NaN]},m=f?p(c-2):[NaN,NaN];for(let n=0;n<c;n++){let i=n<c-1?p(n):f?p(0):[NaN,NaN];Number.isNaN(i[0])&&(i=m),Number.isNaN(m[0])&&(m=i);let s=m[0]+i[0],u=m[1]+i[1],d=Math.hypot(s,u);if(Number.isNaN(d)||d<1e-6)s=Number.isNaN(i[0])?0:i[0],u=Number.isNaN(i[1])?1:i[1];else{s/=d,u/=d;let e=Math.min(2,1/Math.max(.5,s*i[0]+u*i[1]));s*=e,u*=e}let h=(t+e+n)*3,g=r[h],_=r[h+1];n&&(o+=Math.hypot(g-r[h-3],_-r[h-2])),n===0&&a&&(l.set(l.subarray(k.n-6,k.n),k.n),k.n+=6,l[k.n++]=g,l[k.n++]=_,l[k.n++]=s,l[k.n++]=u,l[k.n++]=1,l[k.n++]=o),l[k.n++]=g,l[k.n++]=_,l[k.n++]=s,l[k.n++]=u,l[k.n++]=1,l[k.n++]=o,l[k.n++]=g,l[k.n++]=_,l[k.n++]=s,l[k.n++]=u,l[k.n++]=-1,l[k.n++]=o,Number.isNaN(i[0])||(m=i)}a=!0}j.push(i,k.n/6-i)}function P(e,t,n){let r=e.polys[2*t],i=e.polys[2*t+1],a=e.pts,o=A.n/2;A.need(i*4);let s=A.a,c=e.nx*n,l=e.ny*n;for(let e=0;e<i;e++){let t=(r+e)*3;s[A.n++]=a[t],s[A.n++]=a[t+1],s[A.n++]=a[t]+c,s[A.n++]=a[t+1]+l}M.set(t,[o,A.n/2-o])}return{kind:`gl`,resize(t,r,i){E=t,D=r,O=i,e.width=Math.round(E*O),e.height=Math.round(D*O),n.viewport(0,0,e.width,e.height)},draw(e){if(n.clear(n.COLOR_BUFFER_BIT),!e.ops.length)return;k.n=0,A.n=0,j.length=0,M.clear();let t=e.polys.length/2;for(let n=0;n<t;n++)N(e,e.polys[2*n],e.polys[2*n+1]);for(let t of e.ops)t.t===`band`&&P(e,t.p,t.band);n.bindBuffer(n.ARRAY_BUFFER,g),n.bufferData(n.ARRAY_BUFFER,k.a.subarray(0,k.n),n.STREAM_DRAW),n.bindBuffer(n.ARRAY_BUFFER,w),n.bufferData(n.ARRAY_BUFFER,A.a.subarray(0,A.n),n.STREAM_DRAW),n.useProgram(i),n.uniform2f(l.uRes,E,D),n.uniform1f(l.uDpr,O);let r=e.ring;r&&(n.uniform4f(l.uE,r.x,r.y,Math.cos(r.rot),Math.sin(r.rot)),n.uniform4f(l.uR,r.ox,r.oy,r.ix,r.iy)),n.useProgram(a),n.uniform2f(u.uRes,E,D),n.useProgram(o),n.uniform2f(d.uRes,E,D),n.uniform1f(d.uDpr,O);let c=null,m=null;for(let t of e.ops){let e=t.t===`band`||t.t===`line`&&!!t.out;if(e!==m&&(m=e,m?n.blendFunc(n.ZERO,n.ONE_MINUS_SRC_ALPHA):n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA)),t.t===`img`){if(t.a<=.001)continue;let e=S.get(t.src);e||S.set(t.src,e={tex:n.createTexture(),ver:NaN}),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,e.tex),e.ver!==t.ver&&(e.ver=t.ver,n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t.src),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE)),c!==s&&(n.useProgram(c=s),n.bindVertexArray(x),n.uniform1i(f.uTex,0)),n.uniform1f(f.uA,p(t.a)),n.drawArrays(n.TRIANGLE_STRIP,0,4);continue}if(t.t===`dot`){c!==o&&(n.useProgram(c=o),n.bindVertexArray(x));let e=t.c;n.uniform3f(d.uC,t.x,t.y,t.r),n.uniform4f(d.uCol,e[0]/255,e[1]/255,e[2]/255,p(e[3])),n.uniform1i(d.uSoft,+!!t.soft),n.drawArrays(n.TRIANGLE_STRIP,0,4);continue}if(t.t===`band`){let e=M.get(t.p);if(!e||e[1]<4)continue;c!==a&&(n.useProgram(c=a),n.bindVertexArray(C)),n.uniform1f(u.uA,p(t.a)),n.drawArrays(n.TRIANGLE_STRIP,e[0],e[1]);continue}let g=j[2*t.p],_=j[2*t.p+1];if(_<4)continue;c!==i&&(n.useProgram(c=i),n.bindVertexArray(h));let v=t.w*O,y=Math.max(v,1)/2;n.uniform1f(l.uCore,y),n.uniform1f(l.uCov,Math.min(1,v)),n.uniform1f(l.uHw,(y+1)/O);let b=t.c;n.uniform4f(l.uC0,b[0]/255,b[1]/255,b[2]/255,p(b[3]));let w=t.g;if(w){let[e,t,r]=w.s;n.uniform4f(l.uC0,e[0]/255,e[1]/255,e[2]/255,p(e[3])),n.uniform4f(l.uC1,t[0]/255,t[1]/255,t[2]/255,p(t[3])),n.uniform4f(l.uC2,r[0]/255,r[1]/255,r[2]/255,p(r[3])),n.uniform3f(l.uG,w.x,w.y,w.r)}else n.uniform3f(l.uG,0,0,0);n.uniform1i(l.uRing,t.ring&&r?1:0),n.uniform2f(l.uDash,t.dash?t.dash[0]:0,t.dash?t.dash[1]:0),n.uniform2f(l.uWin,t.win?t.win[0]:1,t.win?t.win[1]:0),n.drawArrays(n.TRIANGLE_STRIP,g,_)}n.bindVertexArray(null)}}}let g={width:1.2,op:.62,color:`umber`},_=[{width:1.15,op:.34,color:`amber`,dash:[]},{width:1.05,op:.26,color:`wake`,dash:[]},{width:.95,op:.19,color:`dream`,dash:[5,7]}],v,y,b,x=0,S=0,C=1,w=0,T,E=!1,D=!1,O=!1,k=0,A=NaN,j=null,M=0,N=0,P=1,F=e=>(Number.isNaN(A)?e:performance.timeOrigin+e-A)/1e3,I=0,L=null,R=Array.from({length:c},()=>null),z=`#d8ccbe`,B=e=>{let t=Math.max(0,Math.min(1,e));return t*t*(3-2*t)};function V(e){let t=e.match(/\d+(\.\d+)?/g);if(e.startsWith(`rgb`)&&t)return t.slice(0,3).map(Number);let n=e.replace(`#`,``);return[0,2,4].map(e=>parseInt(n.slice(e,e+2),16))}let H=(e,t,n)=>e.map((e,r)=>Math.round(e+(t[r]-e)*n));function ee(e,t,n){return`rgb(${H(V(e),V(t),n).join(`,`)})`}function U(e){let{xy:t,L:n}=j,r=1;for(;r<n.length-1&&n[r]<e;)r++;let i=Math.max(0,Math.min(1,(e-n[r-1])/(n[r]-n[r-1]||1)));return[t[2*r-2]+(t[2*r]-t[2*r-2])*i,t[2*r-1]+(t[2*r+1]-t[2*r-1])*i]}function te(e,t,n){let[r,i]=U(e),a=y.createRadialGradient(r,i,0,r,i,t);a.addColorStop(0,`rgba(154,134,196,${n})`),a.addColorStop(1,`rgba(154,134,196,0)`),y.fillStyle=a,y.beginPath(),y.arc(r,i,t,0,Math.PI*2),y.fill()}function ne(){y.setTransform(1,0,0,1,0,0),y.clearRect(0,0,v.width,v.height);let e=x/2,t=S*.5;if(y.setTransform(C,0,0,C,0,0),j||(y.translate(e,t),y.rotate(14*Math.PI/180),y.translate(-e,-t)),y.miterLimit=4,O)for(let e=0;e<_.length;e++){let t=R[e];if(!t)continue;let n=_[e];y.globalAlpha=n.op*w,y.strokeStyle=T[n.color],y.lineWidth=n.width,y.lineCap=`butt`,y.lineJoin=`miter`,y.setLineDash(n.dash),y.stroke(t)}if(L){if(y.globalAlpha=g.op*(1+N*.15),y.strokeStyle=N>.001?ee(T[g.color],z,N):T[g.color],y.lineWidth=g.width,y.lineCap=`round`,y.lineJoin=`round`,j&&P<1){let e=j.len*1.04,t=B(P)*(e/2+40);y.setLineDash([0,Math.max(0,e/2-t),2*t,e*4])}else y.setLineDash([]);y.stroke(L),y.setLineDash([])}if(j&&P<1){let e=B(P)*(j.len/2+40);y.globalAlpha=1-B(Math.max(0,(P-.85)/.15));for(let t of[-1,1])te(j.len/2+t*e,10,.95)}}let W=null,G=new f,K=null,q=Array.from({length:c},()=>null),J=Math.cos(14*Math.PI/180),Y=Math.sin(14*Math.PI/180),X=[154,134,196];function Z(e){let t=G.begin(),n=!j,r=x/2,i=S*.5,a=0,o=0,s=e=>{if(!n)return G.add(a,o,e);let t=a-r,s=o-i;G.add(r+t*J-s*Y,i+t*Y+s*J,e)},c=/([MLHV])([^MLHV]*)/g,l;for(;l=c.exec(e);){let e=l[2].trim().split(/[\s,]+/).map(Number);l[1]===`M`||l[1]===`L`?(a=e[0],o=e[1],s(l[1]===`M`?1:2)):l[1]===`H`?(a=e[0],s(2)):(o=e[0],s(2))}return t}function re(){let e=W;G.reset();let t=G.ops;if(O)for(let e=0;e<_.length;e++){let n=q[e];if(!n)continue;let r=_[e],i=V(T[r.color]);t.push({t:`line`,p:Z(n),w:r.width,c:[i[0],i[1],i[2],r.op*w],dash:r.dash.length?[r.dash[0],r.dash[1]]:null})}if(K){let e=V(T[g.color]),n=N>.001?H(e,V(z),N):e,r=null;if(j&&P<1){let e=j.len*1.04,t=B(P)*(e/2+40);r=[e/2-t,e/2+t]}t.push({t:`line`,p:Z(K),w:g.width,c:[n[0],n[1],n[2],g.op*(1+N*.15)],win:r})}if(j&&P<1){let e=B(P)*(j.len/2+40),n=(1-B(Math.max(0,(P-.85)/.15)))*.95;for(let r of[-1,1]){let[i,a]=U(j.len/2+r*e);t.push({t:`dot`,x:i,y:a,r:10,c:[X[0],X[1],X[2],n],soft:!0})}}e.draw(G)}function Q(e,t=!1){I=e,k=performance.now();let n=j?b.stepCurve(I,w,j,M):b.step(I,w,x,S);if(n)n.main&&(K=n.main,W||(L=new Path2D(n.main))),n.echoes.forEach((e,t)=>{e&&(q[t]=e,W||(R[t]=new Path2D(e)))}),O=n.echoesOn;else if(!t)return;W?re():ne()}function $(e,t,n){if(x=e,S=t,C=n,W)return W.resize(x,S,C);v.width=Math.round(x*C),v.height=Math.round(S*C)}let ie=typeof self.requestAnimationFrame==`function`;function ae(){setTimeout(()=>{ie?self.requestAnimationFrame(oe):oe(performance.now())},d())}function oe(e){D||Q(F(e)),ae()}self.onmessage=e=>{let t=e.data;if(t.type===`init`){v=t.canvas;try{W=h(v,!1)}catch{W=null}if(!W){let e=v.getContext(`2d`);if(!e||typeof Path2D!=`function`){self.postMessage({type:`fail`});return}y=e}if(b=u(t.beat),w=t.d,T=t.colors,E=t.still,typeof t.origin==`number`&&(A=t.origin),$(t.W,t.H,t.dpr),Q(F(performance.now()),!0),self.postMessage({type:`ready`}),E)return;ae(),setInterval(()=>{!D&&performance.now()-k>500&&Q(F(performance.now()))},400);return}(y||W)&&(t.type===`size`?($(t.W,t.H,t.dpr),Q(I,!0)):t.type===`mix`?(w=t.d,T=t.colors,Q(I,!0)):t.type===`spine`?(j=t.xy?l(t.xy,t.amp??1):null,M++,N=t.dark,P=t.reveal,Q(I,!0)):t.type===`hidden`&&(D=t.hidden))}})();