import{i as e,s as t}from"./lib.Bve9ZM-Z.js";import{l as n,o as r}from"./reality.BtujW9AI.js";import{a as i,c as a,i as o,l as s,n as c,o as l,r as u,s as d,t as f}from"./cell24.CCzbP_wV.js";var p=24,m=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
uniform mat4 uView, uProj;
out vec3 vW; out vec3 vN;
void main(){ vW = aPos; vN = aNor; gl_Position = uProj * uView * vec4(aPos, 1.); }`,h=`#version 300 es
precision highp float;
#define MAXP ${p}
in vec3 vW; in vec3 vN;
uniform vec3 uCam;
uniform vec4 uPl[MAXP];     // 世界坐标里的半空间：xyz·p ≤ w
uniform int uNP;
uniform float uPw[MAXP];    // 每面的圆角权重：面将消失时趋于 0，棱上的光随之收掉
uniform float uDream;       // 0 醒 · 1 梦
uniform float uCore;        // 光核强度
uniform vec3 uCoreC;
uniform float uRough;       // 体内磨砂度
uniform float uLine;        // 切面线可见度（关于页退场）
uniform float uLineY;       // 切面线在环境里的仰角（相机看向晶体中心的方向）
uniform float uEnter;       // 门：进入的进度 0..1
out vec4 o;

// 环境：淡丁香天顶、近白地平亮带、偏紫的下半球；左上柔光箱与左侧暗卡给轮廓，右后一盏很淡的粉白小灯
// r：粗糙度 0..1 —— 表面反射用 0（清楚），体内透射用较大值（光斑化开、暗卡变浅）
vec3 env(vec3 d, float r){
  float w = 1.0 + 3.0 * r;
  float y = d.y;
  vec3 top = vec3(0.90, 0.895, 0.97), hor = vec3(1.0, 0.975, 0.965), low = vec3(0.78, 0.745, 0.80);
  top = mix(top, vec3(0.94, 0.90, 0.95), uDream);
  vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.65 * w, y)) : mix(hor, low, smoothstep(0.0, 0.5 * w, -y));
  c += vec3(0.12, 0.10, 0.09) * exp(-pow(y / (0.06 * w), 2.0));
  c *= mix(1.0, 0.92, smoothstep(0.15, 0.95, d.z));
  float k = 1.0 - r * 0.6;
  c *= 1.0 - 0.30 * k * smoothstep(1.0 - 0.20 * w, 0.97, dot(d, normalize(vec3(-0.95, 0.05, -0.30))));
  c *= 1.0 - 0.15 * k * smoothstep(1.0 - 0.25 * w, 0.97, dot(d, normalize(vec3(0.85, -0.25, 0.45))));
  float key = smoothstep(1.0 - 0.10 * w, 0.975, dot(d, normalize(vec3(-0.50, 0.70, 0.50))));
  c += vec3(1.0, 0.99, 0.97) * 0.75 * k * key;
  c += vec3(1.0, 0.94, 0.96) * 0.30 * k * smoothstep(1.0 - 0.07 * w, 0.99, dot(d, normalize(vec3(0.75, 0.25, -0.60))));
  // 切面线：只在晶体背后那半边，细、偏丁香灰；粗糙时化开变淡
  if (uLine > 0.0) {
    float lw = 0.0035 * (1.0 + 4.0 * r);
    float ln = exp(-pow((y - uLineY) / lw, 2.0)) * smoothstep(0.1, -0.3, d.z) / (1.0 + 3.0 * r);
    c = mix(c, vec3(0.36, 0.34, 0.42), clamp(ln * uLine * 0.75, 0.0, 1.0));
  }
  return c;
}

// 射线 P + tT 在凸体内到出射面的距离；ni = 出射面序号
float exitT(vec3 P, vec3 T, out int ni){
  float tm = 1e9; ni = -1;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uNP) break;
    float dn = dot(uPl[i].xyz, T);
    if (dn > 1e-5) {
      float t = (uPl[i].w - dot(uPl[i].xyz, P)) / dn;
      if (t < tm) { tm = t; ni = i; }
    }
  }
  return max(tm, 0.0);
}

// 面上点到最近棱的距离（沿面量），nb = 那条棱另一侧的面法向
float edgeDist(vec3 P, vec3 N, out vec3 nb){
  float best = 1e9; nb = N;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uNP) break;
    vec3 n = uPl[i].xyz;
    float c = dot(n, N);
    if (c > 0.9995) continue;
    float e = (uPl[i].w - dot(n, P)) / sqrt(max(1e-4, 1.0 - c * c)) / max(uPw[i], 1e-3);
    if (e < best) { best = e; nb = n; }
  }
  return best;
}

float glowSeg(vec3 A, vec3 B){
  vec3 ab = B - A;
  float t = clamp(dot(uCoreC - A, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec3 q = A + ab * t - uCoreC;
  return exp(-dot(q, q) / 0.12) * length(ab);
}

void main(){
  vec3 N = normalize(vN);
  vec3 I = normalize(vW - uCam);
  vec3 V = -I;

  // 圆角棱：靠近棱时法线朝邻面弯过去
  vec3 nb;
  float e = edgeDist(vW, N, nb);
  float tb = 1.0 - smoothstep(0.0, 0.028, e);
  vec3 Nb = normalize(mix(N, normalize(N + nb), tb * tb));

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 refl = env(reflect(I, Nb), 0.0);

  // 透射：入射 → 至多三次体内全反射 → 出射
  float ior = 1.52;
  vec3 T = refract(I, Nb, 1.0 / ior);
  vec3 P = vW;
  float L = 0.0, g = 0.0, inner = 0.0;
  vec3 trans = vec3(0.0);
  bool done = false;
  float disp = mix(0.006, 0.018, uDream) * (1.0 + 3.0 * uEnter);
  for (int b = 0; b < 4; b++) {
    int ni;
    float t = exitT(P, T, ni);
    vec3 Q = P + T * t;
    L += t; g += glowSeg(P, Q);
    if (ni < 0) break;
    vec3 Ne = uPl[ni].xyz;
    if (b == 0) {
      vec3 dummy;
      inner = exp(-pow(edgeDist(Q, Ne, dummy) / 0.010, 2.0));
    }
    vec3 Tg = refract(T, -Ne, ior);
    if (dot(Tg, Tg) > 0.0) {
      vec3 Tr = refract(T, -Ne, ior - disp);
      vec3 Tb = refract(T, -Ne, ior + disp);
      if (dot(Tr, Tr) == 0.0) Tr = Tg;
      if (dot(Tb, Tb) == 0.0) Tb = Tg;
      float Fe = 0.04 + 0.96 * pow(1.0 - clamp(dot(Ne, Tg), 0.0, 1.0), 5.0);
      trans = vec3(env(Tr, uRough).r, env(Tg, uRough).g, env(Tb, uRough).b) * (1.0 - Fe);
      done = true;
      break;
    }
    T = reflect(T, -Ne);
    P = Q + T * 1e-4;
  }
  if (!done) trans = env(T, uRough) * 0.85;

  // 吸收：丁香色，梦里偏一点粉；光程越长越深
  vec3 k = mix(vec3(0.060, 0.064, 0.012), vec3(0.030, 0.058, 0.030), uDream);
  trans *= exp(-k * L) * 1.03;
  trans *= 1.0 - inner * 0.16;
  // 光核：沿光程积分后饱和，一团近白的微温
  float gc = 1.0 - exp(-g * uCore);
  vec3 glow = mix(vec3(1.0, 0.975, 0.955), vec3(1.0, 0.955, 0.965), uDream);
  trans = mix(trans, glow * 1.05, gc * mix(0.55, 0.95, uEnter));

  // 薄膜虹彩，只上在反射里
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + 1.8 * (1.0 - ndv)));
  refl *= mix(vec3(1.0), film, 0.16);
  vec3 col = mix(trans, refl, F);
  vec3 Lk = normalize(vec3(-0.50, 0.70, 0.50));
  float spec = pow(max(dot(Nb, normalize(Lk + V)), 0.0), 260.0);
  col += vec3(1.0) * spec * (0.9 + 0.6 * tb);
  col = mix(col, glow * 1.05, smoothstep(0.55, 1.0, uEnter));
  o = vec4(col, 1.0);
}`;function g(e,t,n,r){let i=1/Math.tan(e/2);return[i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0]}function _(e,t,n){let r=l(s(e,t)),i=l(c(n,r)),a=c(r,i);return[i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-u(i,e),-u(a,e),-u(r,e),1]}var v=[0,.55,6.2],y=_(v,[0,0,0],[0,1,0]),ee=g(.62,1,.1,50);function b(e,t,n,r,i,a){return[2*i/(t-e),0,0,0,0,2*i/(r-n),0,0,(t+e)/(t-e),(r+n)/(r-n),(a+i)/(i-a),-1,0,0,2*a*i/(i-a),0]}var x=900,te=1600,ne=-v[1]/Math.hypot(v[1],v[2]);function S(){let c=document.querySelector(`.nexus-slice`),l=c?.querySelector(`canvas`);if(!c||!l)return;let g=c.nexus??={grow:1,line:0},S=l.getContext(`webgl2`,{antialias:!0,alpha:!0,premultipliedAlpha:!0,failIfMajorPerformanceCaveat:!0});if(!S)return;let C=S,w=C.getExtension(`WEBGL_debug_renderer_info`),T=w?String(C.getParameter(w.UNMASKED_RENDERER_WEBGL)):``;if(/swiftshader|llvmpipe|softpipe|software|basic render/i.test(T))return;let E=C.createProgram();for(let[e,t]of[[C.VERTEX_SHADER,m],[C.FRAGMENT_SHADER,h]]){let n=C.createShader(e);C.shaderSource(n,t),C.compileShader(n),C.attachShader(E,n)}if(C.linkProgram(E),!C.getProgramParameter(E,C.LINK_STATUS))return;let D={};for(let e of[`uView`,`uProj`,`uCam`,`uPl`,`uNP`,`uPw`,`uDream`,`uCore`,`uCoreC`,`uRough`,`uLine`,`uLineY`,`uEnter`])D[e]=C.getUniformLocation(E,e);let O=new Float32Array(5184),k=new Float32Array(96),A=new Float32Array(p),j=C.createVertexArray();C.bindVertexArray(j);let M=C.createBuffer();C.bindBuffer(C.ARRAY_BUFFER,M),C.bufferData(C.ARRAY_BUFFER,O.byteLength,C.DYNAMIC_DRAW),C.enableVertexAttribArray(0),C.vertexAttribPointer(0,3,C.FLOAT,!1,24,0),C.enableVertexAttribArray(1),C.vertexAttribPointer(1,3,C.FLOAT,!1,24,12);let N=1-n(),P=0,F=.4,I=0,L=!1,R=(e=1)=>d(e,P,a(N));function z(e,t){let n=a(N),r=[0,0,0],c=0;for(let t of e){let e=[0,0,0];for(let n of t.pts)e=f(e,n);r=f(r,i(e,t.area/t.pts.length)),c+=t.area}r=i(r,1/Math.max(1e-9,c));let l=0;for(let t of e)l+=t.area*Math.abs(u(t.n,s(t.pts[0],r)))/3;let d=t??Math.cbrt(4/3/(l||1)),p=1.1,m=1.28-.16*n,h=Math.cos(F),g=Math.sin(F),_=e=>[h*e[0]-g*e[2],e[1],g*e[0]+h*e[2]],v=e=>_([e[0]*p,e[1]*p*m,e[2]*p]),y=0;return e.forEach((e,t)=>{let n=_([e.n[0]/p,e.n[1]/(p*m),e.n[2]/p]),c=o(n),l=i(n,1/c);k.set([l[0],l[1],l[2],(e.d-u(e.n,r))*d/c],t*4),A[t]=a(Math.min(1,e.area*d*d/.03));let f=e.pts.map(e=>v(i(s(e,r),d)));for(let e=1;e+1<f.length;e++)for(let t of[f[0],f[e],f[e+1]])O.set([t[0],t[1],t[2],l[0],l[1],l[2]],y),y+=6}),C.bindBuffer(C.ARRAY_BUFFER,M),C.bufferSubData(C.ARRAY_BUFFER,0,O,0,y),y/6}let B=null;function V(e){if(e!==!!B){if(e){let e=c.getBoundingClientRect();B={cx:e.left+e.width/2,cy:e.top+e.height/2,w:e.width},l.style.cssText=`position:fixed;inset:0;width:100vw;height:100vh;z-index:1000;opacity:1;pointer-events:none`,document.body.append(l)}else B=null,l.style.cssText=``,c.append(l)}}function H(){if(B){let e=Math.min(2,devicePixelRatio||1,te/Math.max(innerWidth,innerHeight)),t=Math.round(innerWidth*e),n=Math.round(innerHeight*e);(l.width!==t||l.height!==n)&&(l.width=t,l.height=n);return}let e=l.clientWidth,t=Math.max(64,Math.min(x,Math.round(e*Math.min(2,devicePixelRatio||1))));(l.width!==t||l.height!==t)&&(l.width=l.height=t)}function U(e){let t=[0,0,0],n=0;for(let r of e){let e=[0,0,0];for(let t of r.pts)e=f(e,t);t=f(t,i(e,r.area/r.pts.length)),n+=r.area}t=i(t,1/Math.max(1e-9,n));let r=0;for(let n of e)r+=n.area*Math.abs(u(n.n,s(n.pts[0],t)))/3;return Math.cbrt(4/3/(r||1))}let W=!1;function G(){let e=Math.max(0,Math.min(1,g.enter??0));V(e>0),H();let t=a(Math.max(0,Math.min(1,g.grow))),n=t>.002?R(t):[];if(C.viewport(0,0,l.width,l.height),C.clearColor(0,0,0,0),C.clear(C.COLOR_BUFFER_BIT),n.length<4){W=!0;return}W=!1;let r=z(n,t<1?U(R(1)):void 0),o=a(N);C.enable(C.CULL_FACE),C.cullFace(C.BACK),C.useProgram(E),C.bindVertexArray(j);let s=e>0?i(v,1-.8*e**1.6):v,c=ee;if(B){let e=.2*Math.tan(.31)/B.w;c=b(-B.cx*e,(innerWidth-B.cx)*e,(B.cy-innerHeight)*e,B.cy*e,.1,50)}C.uniformMatrix4fv(D.uView,!1,e>0?_(s,[0,0,0],[0,1,0]):y),C.uniformMatrix4fv(D.uProj,!1,c),C.uniform3fv(D.uCam,s),C.uniform4fv(D.uPl,k),C.uniform1i(D.uNP,n.length),C.uniform1fv(D.uPw,A),C.uniform1f(D.uDream,o),C.uniform1f(D.uCore,.5+.95*o+3*e),C.uniform3fv(D.uCoreC,[0,.04+.1*o,0]),C.uniform1f(D.uRough,.45-.12*o),C.uniform1f(D.uLine,g.line),C.uniform1f(D.uLineY,ne),C.uniform1f(D.uEnter,e),C.drawArrays(C.TRIANGLES,0,r)}let K=t(),q=null,J=0,Y=0,X=!1,Z=!1,Q=!1;requestAnimationFrame(()=>{N=1-n(),G(),c.classList.add(`is-live`),Z=!0,g.draw=()=>{Q||G()},$()});function re(e){let t=J?Math.min(.1,(e-J)/1e3):1/30;J=e;let r=1-n();N+=Math.sign(r-N)*Math.min(Math.abs(r-N),t/1.2);let i=a(N),o=g.hover??0;I+=Math.sign(o-I)*Math.min(Math.abs(o-I),t/.7);let s=1-a(I);if(P+=t*i*s,F+=t*(.06+.16*i)*s,Y+=t,(g.enter??0)>0)return;let c=s===0&&N===r&&g.grow>=1;c&&L||(L=c,!(g.grow<=.002&&W)&&(i<.02&&g.grow>=1&&I===o&&Y<1/15-.004||(Y=0,G())))}function $(){let t=Z&&!Q&&X&&!document.hidden&&!K;t&&!q?(J=0,q=e(re)):!t&&q&&(q(),q=null)}new IntersectionObserver(e=>{X=e[0].isIntersecting,$()}).observe(l),document.addEventListener(`visibilitychange`,$),K&&r(()=>{Z&&!Q&&(N=1-n(),G())}),l.addEventListener(`webglcontextlost`,()=>{Q=!0,g.draw=void 0,V(!1),c.classList.remove(`is-live`),$()})}S();