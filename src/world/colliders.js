// Static 2D colliders (circles + oriented boxes) in a uniform grid, with a height range so
// characters can walk on top of low things or under arches.
const CELL = 16;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.all = [];
  }

  _key(i, j) {
    return i * 100003 + j;
  }

  _insert(c, minx, minz, maxx, maxz) {
    const i0 = Math.floor(minx / CELL),
      i1 = Math.floor(maxx / CELL);
    const j0 = Math.floor(minz / CELL),
      j1 = Math.floor(maxz / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this._key(i, j);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
    }
    this.all.push(c);
  }

  addCircle(x, z, r, y0 = -1e9, y1 = 1e9, tag = null) {
    const c = { type: 0, x, z, r, y0, y1, tag, enabled: true };
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  // box centered at x,z with half extents hx (local x), hz (local z), rotated by yaw (three.js rotation.y)
  addBox(x, z, hx, hz, yaw, y0 = -1e9, y1 = 1e9, tag = null) {
    const cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    const c = { type: 1, x, z, hx, hz, cos, sin, y0, y1, tag, enabled: true };
    const r = Math.hypot(hx, hz);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  // Push a circle (px,pz,radius) at height range [py, py+height] out of colliders. Returns adjusted {x,z,hit}
  resolve(px, pz, radius, py, height, out) {
    let x = px,
      z = pz,
      hit = false;
    const i0 = Math.floor((x - radius) / CELL),
      i1 = Math.floor((x + radius) / CELL);
    const j0 = Math.floor((z - radius) / CELL),
      j1 = Math.floor((z + radius) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this.grid.get(this._key(i, j));
        if (!arr) continue;
        for (const c of arr) {
          if (!c.enabled) continue;
          if (py + height < c.y0 || py > c.y1 - 0.35) continue; // step over / walk under
          if (c.type === 0) {
            const dx = x - c.x,
              dz = z - c.z;
            const d = Math.hypot(dx, dz);
            const min = c.r + radius;
            if (d < min && d > 1e-5) {
              x = c.x + (dx / d) * min;
              z = c.z + (dz / d) * min;
              hit = true;
            }
          } else {
            // to local: local x axis = (cos, -sin), local z axis = (sin, cos)
            const dx = x - c.x,
              dz = z - c.z;
            let lx = dx * c.cos - dz * c.sin;
            let lz = dx * c.sin + dz * c.cos;
            const ex = c.hx + radius,
              ez = c.hz + radius;
            if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
              const px2 = ex - Math.abs(lx),
                pz2 = ez - Math.abs(lz);
              if (px2 < pz2) lx = Math.sign(lx || 1) * ex;
              else lz = Math.sign(lz || 1) * ez;
              x = c.x + lx * c.cos + lz * c.sin;
              z = c.z - lx * c.sin + lz * c.cos;
              hit = true;
            }
          }
        }
      }
    }
    out.x = x;
    out.z = z;
    out.hit = hit;
    return out;
  }

  // Is the point inside any solid collider (used to keep the camera out of buildings/trees)?
  pointBlocked(x, z, y, pad = 0.3) {
    const arr = this.grid.get(this._key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return false;
    for (const c of arr) {
      if (!c.enabled || c.platform || y < c.y0 || y > c.y1) continue;
      if (c.type === 0) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      } else {
        const dx = x - c.x,
          dz = z - c.z;
        if (Math.abs(dx * c.cos - dz * c.sin) < c.hx + pad && Math.abs(dx * c.sin + dz * c.cos) < c.hz + pad) return true;
      }
    }
    return false;
  }

  // Highest walkable top (y1) under the point among colliders flagged as platforms
  platformAt(x, z, y) {
    let best = -Infinity;
    const arr = this.grid.get(this._key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return best;
    for (const c of arr) {
      if (!c.enabled || !c.platform) continue;
      let inside = false;
      if (c.type === 0) inside = Math.hypot(x - c.x, z - c.z) < c.r;
      else {
        const dx = x - c.x,
          dz = z - c.z;
        inside = Math.abs(dx * c.cos - dz * c.sin) < c.hx && Math.abs(dx * c.sin + dz * c.cos) < c.hz;
      }
      if (inside && c.y1 < y + 0.6 && c.y1 > best) best = c.y1;
    }
    return best;
  }
}
