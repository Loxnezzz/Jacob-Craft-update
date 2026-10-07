export const CHUNK = 16;
export const HEIGHT = 192;
export const SEA = 63;
export const CHUNK_AREA = CHUNK * CHUNK;
export const CHUNK_VOL = CHUNK_AREA * HEIGHT;

// local index inside a chunk column: x fastest, then z, then y
export function idx(x, y, z) { return (y << 8) | (z << 4) | x; }

// Face order used everywhere: +X, -X, +Y, -Y, +Z, -Z
export const FACE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// Horizontal facing used in block meta: 0=N(-Z) 1=E(+X) 2=S(+Z) 3=W(-X)
export const FACING_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// face index for facing
export const FACING_TO_FACE = [5, 0, 4, 1];

export function chunkKey(cx, cz) { return cx + ',' + cz; }
