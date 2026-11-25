import{r as e,s as t}from"./lib.Bve9ZM-Z.js";import{l as n,o as r}from"./reality.BtujW9AI.js";var i=3,a=.62,o=1e3/12,s=[`#fdfeff`,`#f2f7fc`,`#dbe5f1`,`#9db0c4`],c=[`#fdfeff`,`#f5f3fb`,`#e0d8ee`,`#b2a5c9`],l=t=>{let[n,r,i]=e(t);return[n/255,r/255,i/255]},u=(e,t,n)=>e.map((e,r)=>e+(t[r]-e)*n),d=`#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`,f=`#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;
uniform float uGlow;
uniform float uDither;
uniform vec3 uP[4];
/* 静域：x = 中心（画布 px，自左） · y = 半宽 · z = 羽化（都是画布 px） */
uniform vec3 uCalm;
/* 1 = 窄屏：正文列几乎占满宽度，静域改为「中间一条安静的带」，雾从上下两头渗进来 */
uniform float uLeak;
/* 洞：xy = 中心（画布 px，自下往上） · z = 半径；w > 0 才画（404 那一页） */
uniform vec4 uHole;

out vec4 o;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
    mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}
/* 与 wander/light.js 的 field() 逐行对应：两次域扭曲，再取第三次 fbm */
float field(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(
    fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.03),
    fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.025)
  );
  return fbm(p + 1.9 * r);
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  /* 场自己走得很慢，再叠一点整体平移，免得盯着像静止 */
  vec2 pan = vec2(uTime * 0.0042 + 12.4, uTime * -0.0031 - 7.9);
  float t = uTime * 0.55;
  /* 实测：这套 fbm 的取值基本落在 0.06–0.50（均值 0.24、标准差 0.09）。
     直接按 0.30/0.42 截会几乎全落进第 0 档、画面是一片白 —— 这里把它的 10–90 分位铺满 0–1，
     雾才有明暗。 */
  float raw = field(uv * (1.05 * uZoom) + pan, t);
  float v = clamp((raw - 0.10) / 0.34, 0.0, 1.0);

  /* 整体不走到最亮芯：外侧也只是一层浅雾，静域与外侧才不像两种材料 */
  v *= 0.72;

  /* 正文列：雾在字底下只留一口气 —— 不是压成一块平色，是把起伏收到十六分之一。
     形状用高斯，不用 smoothstep：
       · 高斯没有「边」，两条尾巴自然而然地落进雾里，到哪儿都量不出一条界线；
       · 高斯左右对称、中心就在正文列正中 —— 垫底不会偏，也不会歪。
     不做任何沿纵轴的摆动。量过：±16px 的摆动落到屏幕上就是一块看得出倾斜的纸，
     人眼对这种长直线比对我调参数敏感得多。 */
  float dx = abs(gl_FragCoord.x - uCalm.x);
  /* uCalm.y < 0 = 这一页没有正文列（404）：不压静域，整片照常走 */
  float calm = uCalm.y < 0.0 ? 0.0 : exp(-pow(dx / (uCalm.y * 1.45 + uCalm.z), 2.0));
  calm = smoothstep(0.0, 1.0, calm);
  /* 窄屏：静下来的不只是中间那条列，而是整片正文；雾从上下的边缘进来，
     离上下边缘越近越像原来那场雾 */
  if (uLeak > 0.5) {
    float dTop = gl_FragCoord.y / uRes.y;
    float edge = 1.0 - smoothstep(0.0, 0.42, min(dTop, 1.0 - dTop));
    calm *= 1.0 - edge * 0.92;
  }
  v = mix(v, 0.30 + (v - 0.30) * 0.06, calm);

  vec3 col = mix(uP[0], uP[1], smoothstep(0.10, 0.54, v));
  col = mix(col, uP[2], smoothstep(0.54, 0.90, v));
  float band = smoothstep(0.62, 0.76, v) * (1.0 - smoothstep(0.80, 0.96, v));
  col = mix(col, uP[3], band * 0.55 * uGlow);
  col = mix(col, uP[3], smoothstep(0.90, 1.0, v) * uGlow * 0.6);
  col = min(col, vec3(1.0));

  /* 洞（404）：同一片雾在正中塌成一个安静的坑 —— 没有边、没有圈，
     只是那一片的起伏被抹平、整体沉下去一点，边界沿角向与噪声一起不规则地挪。
     读到的应该是「这里什么都没有」，不是「这里盖了一个圆」。 */
  if (uHole.w > 0.5) {
    float dh = length(gl_FragCoord.xy - uHole.xy);
    float ang = atan(gl_FragCoord.y - uHole.y, gl_FragCoord.x - uHole.x);
    /* 边界随角度慢慢起伏，再叠一层场自己的噪声：过渡带很宽，看不出线在哪 */
    float rz = uHole.z * (1.06 + 0.10 * sin(ang * 2.0 + 1.7) + 0.055 * sin(ang * 3.0 - 0.6) + 0.05 * (raw - 0.24));
    float inside = 1.0 - smoothstep(rz * 0.34, rz * 1.16, dh);
    /* 坑底是「沉下去」的那种暗：比周围的雾暗一线，而且起伏被抹平 */
    /* 沉下去的那一层仍是雾色，只是更低更平 —— 压过头就变成一块灰板，
       字要落在雾上，不是落在板上 */
    vec3 floorCol = mix(uP[1], uP[2], 0.36);
    /* 坑心再亮一点、坑沿略暗一点：读起来是一处被雾绕开的空地，
       而不是一块压暗的补丁（补丁会跟字抢注意力） */
    col = mix(col, mix(floorCol, uP[0], 0.34), inside * 0.95);
  }

  /* 醒面：细柔近零抖动（64 阶光学晶雾）；梦面：3px 有序 Bayer 抖动（28 阶 + 0.72 强度） */
  float q = mix(28.0, 64.0, clamp((0.72 - uDither) / 0.62, 0.0, 1.0));
  col = floor(col * q + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * uDither) / q;

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;function p(e){let t=window.innerWidth||1;if(e?.dataset.calm===`none`)return[t/2,-1,1];let n=e?.getBoundingClientRect(),r=!!n&&n.width>8,i=r?n.width:Math.min(t-48,672);return[r?n.left+n.width/2:t/2,i/2,Math.max(72,i*.12)]}function m(){let e=document.querySelector(`#mist`);if(!e)return()=>{};let m=e,_=h(m);if(!_)return()=>{};let v=g(_,d,f);if(!v)return()=>{};_.useProgram(v);let y=_.createBuffer();_.bindBuffer(_.ARRAY_BUFFER,y),_.bufferData(_.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),_.STATIC_DRAW);let b=_.getAttribLocation(v,`p`);_.enableVertexAttribArray(b),_.vertexAttribPointer(b,2,_.FLOAT,!1,0,0);let x={res:_.getUniformLocation(v,`uRes`),time:_.getUniformLocation(v,`uTime`),zoom:_.getUniformLocation(v,`uZoom`),glow:_.getUniformLocation(v,`uGlow`),dither:_.getUniformLocation(v,`uDither`),palette:_.getUniformLocation(v,`uP`),calm:_.getUniformLocation(v,`uCalm`),leak:_.getUniformLocation(v,`uLeak`),hole:_.getUniformLocation(v,`uHole`)},S=s.map(l),C=c.map(l),w=()=>{let e=n(),t=S.flatMap((t,n)=>u(C[n],t,e));_.uniform3fv(x.palette,new Float32Array(t)),_.uniform1f(x.dither,.72-.62*e)};w(),_.uniform1f(x.zoom,a),_.uniform1f(x.glow,1);let T=m.dataset.calm===`none`?m:document.querySelector(m.dataset.calm??`.page-body`),E=()=>{let e=Math.max(2,Math.ceil((window.innerWidth||1)/i)),t=Math.max(2,Math.ceil((window.innerHeight||1)/i));(m.width!==e||m.height!==t)&&(m.width=e,m.height=t),_.viewport(0,0,e,t),_.uniform2f(x.res,e,t);let n=p(T).map(e=>e/i);_.uniform3f(x.calm,n[0],n[1],n[2]),_.uniform1f(x.leak,+((window.innerWidth||1)<760));let r=m.dataset.hole===`1`,a=Math.max(34,Math.min(window.innerWidth||1,900)*.2)/i;_.uniform4f(x.hole,e/2,t*.52,a,+!!r)};E();let D=33.7,O=0,k=e=>{O&&(D+=Math.min(e-O,250)/1e3),O=e,_.uniform1f(x.time,D),_.drawArrays(_.TRIANGLES,0,3)},A=0,j=0,M=!0,N=e=>{j=0,M&&(k(e),A=window.setTimeout(()=>{A=0,M&&(j=requestAnimationFrame(N))},o))},P=()=>{!M||A||j||(A=window.setTimeout(()=>{A=0,M&&(j=requestAnimationFrame(N))},o))},F=()=>{M=!1,clearTimeout(A),A=0,j&&cancelAnimationFrame(j),j=0},I=()=>{document.hidden?F():(O=0,M=!0,P())},L=!0;r(()=>{L&&w()}),window.addEventListener(`resize`,E,{passive:!0}),document.addEventListener(`visibilitychange`,I);let R=()=>{L=!1,F(),window.removeEventListener(`resize`,E),document.removeEventListener(`visibilitychange`,I),m.removeEventListener(`webglcontextlost`,z)};function z(e){e.preventDefault(),R(),m.hidden=!0}return m.addEventListener(`webglcontextlost`,z),t()?(k(performance.now()),M=!1):P(),R}function h(e){let t=null;try{t=e.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:`low-power`})}catch{return null}if(!t)return null;let n=``;try{let e=t.getExtension(`WEBGL_debug_renderer_info`);n=e?String(t.getParameter(e.UNMASKED_RENDERER_WEBGL)):``}catch{}return/swiftshader|llvmpipe|softpipe|basic render|software/i.test(n)?null:t}function g(e,t,n){let r=(t,n)=>{let r=e.createShader(t);return r?(e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(console.warn(`[mist] shader: `+e.getShaderInfoLog(r)),e.deleteShader(r),null)):null},i=r(e.VERTEX_SHADER,t),a=r(e.FRAGMENT_SHADER,n);if(!i||!a)return null;let o=e.createProgram();return o?(e.attachShader(o,i),e.attachShader(o,a),e.linkProgram(o),e.deleteShader(i),e.deleteShader(a),e.getProgramParameter(o,e.LINK_STATUS)?o:(console.warn(`[mist] link: `+e.getProgramInfoLog(o)),e.deleteProgram(o),null)):null}m();