// Thin WebGL2 helpers: programs, textures, framebuffers.

export function createProgram(gl, vsSrc, fsSrc, name = 'program') {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      console.error(`[${name}] ${type === gl.VERTEX_SHADER ? 'VS' : 'FS'} compile error:\n${log}\n${lines}`);
      throw new Error(`Shader compile failed (${name}): ${log}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    console.error(`[${name}] link error: ${log}`);
    throw new Error(`Program link failed (${name}): ${log}`);
  }
  // uniform locations cache
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    uniforms[nm] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u: uniforms, name };
}

export function createTexture2D(gl, w, h, opts = {}) {
  const {
    internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, data = null,
    min = gl.LINEAR, mag = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mips = false,
  } = opts;
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  t.width = w; t.height = h;
  return t;
}

export function createDepthTexture(gl, w, h, compare = false, internal) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal || gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, compare ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, compare ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (compare) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }
  t.width = w; t.height = h;
  return t;
}

export function createFBO(gl, colors, depth) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const bufs = [];
  colors.forEach((t, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  if (bufs.length) gl.drawBuffers(bufs); else { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) console.error('FBO incomplete', st.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  fb.colors = colors; fb.depth = depth;
  fb.width = (colors[0] || depth).width; fb.height = (colors[0] || depth).height;
  return fb;
}

// Fullscreen triangle VAO (no attributes; uses gl_VertexID)
export function fullscreenVS() {
  return `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
}
