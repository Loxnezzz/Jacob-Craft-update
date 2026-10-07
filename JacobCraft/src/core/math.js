// Minimal matrix / vector helpers (column-major, WebGL conventions).

export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function fract(x) { return x - Math.floor(x); }
export function mod(a, n) { return ((a % n) + n) % n; }

export const vec3 = {
  create(x = 0, y = 0, z = 0) { return [x, y, z]; },
  len(a) { return Math.hypot(a[0], a[1], a[2]); },
  normalize(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
};

export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  identity(m) {
    m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m;
  },
  copy(out, a) { out.set(a); return out; },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  ortho(out, l, r, b, t, n, f) {
    out.fill(0);
    out[0] = 2 / (r - l);
    out[5] = 2 / (t - b);
    out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l);
    out[13] = -(t + b) / (t - b);
    out[14] = -(f + n) / (f - n);
    out[15] = 1;
    return out;
  },
  lookAt(out, eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },
  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  translate(out, a, x, y, z) {
    if (out !== a) out.set(a);
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return out;
  },
  scale(out, a, x, y, z) {
    if (out !== a) out.set(a);
    for (let i = 0; i < 4; i++) { out[i] *= x; out[4 + i] *= y; out[8 + i] *= z; }
    return out;
  },
  rotateX(out, a, r) {
    const s = Math.sin(r), c = Math.cos(r);
    if (out !== a) out.set(a);
    for (let i = 0; i < 4; i++) {
      const y = a[4 + i], z = a[8 + i];
      out[4 + i] = y * c + z * s;
      out[8 + i] = z * c - y * s;
    }
    return out;
  },
  rotateY(out, a, r) {
    const s = Math.sin(r), c = Math.cos(r);
    if (out !== a) out.set(a);
    for (let i = 0; i < 4; i++) {
      const x = a[i], z = a[8 + i];
      out[i] = x * c - z * s;
      out[8 + i] = x * s + z * c;
    }
    return out;
  },
  rotateZ(out, a, r) {
    const s = Math.sin(r), c = Math.cos(r);
    if (out !== a) out.set(a);
    for (let i = 0; i < 4; i++) {
      const x = a[i], y = a[4 + i];
      out[i] = x * c + y * s;
      out[4 + i] = y * c - x * s;
    }
    return out;
  },
  transformPoint(m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  },
};

// Extract 6 frustum planes from a view-projection matrix. Plane: [a,b,c,d] with ax+by+cz+d >= 0 inside.
export function frustumPlanes(m, out = []) {
  const p = (a, b, c, d) => {
    const l = Math.hypot(a, b, c) || 1;
    return [a / l, b / l, c / l, d / l];
  };
  out[0] = p(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  out[1] = p(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  out[2] = p(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  out[3] = p(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  out[4] = p(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  out[5] = p(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  return out;
}

export function aabbInFrustum(planes, minx, miny, minz, maxx, maxy, maxz) {
  for (let i = 0; i < 6; i++) {
    const p = planes[i];
    const x = p[0] > 0 ? maxx : minx;
    const y = p[1] > 0 ? maxy : miny;
    const z = p[2] > 0 ? maxz : minz;
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
  }
  return true;
}
