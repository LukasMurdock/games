export type SpatialBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export class SpatialGrid<T extends SpatialBounds> {
  readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  private readonly seen = new Set<T>();

  constructor(items: readonly T[], cellSize = 32) {
    this.cellSize = cellSize;
    items.forEach((item) => this.insert(item));
  }

  /** Returned arrays may be shared with the grid; callers must not mutate them. */
  query(minX: number, maxX: number, minZ: number, maxZ: number): readonly T[] {
    const minCellX = Math.floor(minX / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const minCellZ = Math.floor(minZ / this.cellSize);
    const maxCellZ = Math.floor(maxZ / this.cellSize);
    // Point and small-radius queries usually touch one cell, which needs neither copying nor de-duplication.
    if (minCellX === maxCellX && minCellZ === maxCellZ) return this.cells.get(key(minCellX, minCellZ)) ?? EMPTY;
    const result: T[] = [];
    const seen = this.seen;
    seen.clear();
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const bucket = this.cells.get(key(cellX, cellZ));
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          result.push(item);
        }
      }
    }
    seen.clear();
    return result;
  }

  getOccupiedCells() {
    return [...this.cells.keys()].map((cellKey) => ({
      x: Math.floor(cellKey / KEY_SPAN) - KEY_OFFSET,
      z: (cellKey % KEY_SPAN) - KEY_OFFSET,
    }));
  }

  clear() {
    this.cells.clear();
  }

  private insert(item: T) {
    const minCellX = Math.floor(item.minX / this.cellSize);
    const maxCellX = Math.floor(item.maxX / this.cellSize);
    const minCellZ = Math.floor(item.minZ / this.cellSize);
    const maxCellZ = Math.floor(item.maxZ / this.cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const cellKey = key(cellX, cellZ);
        const bucket = this.cells.get(cellKey);
        if (bucket) bucket.push(item);
        else this.cells.set(cellKey, [item]);
      }
    }
  }
}

const EMPTY: readonly never[] = [];
// Cell coordinates stay far inside ±KEY_OFFSET for any map, so a packed integer is a unique, allocation-free key.
const KEY_OFFSET = 1 << 20;
const KEY_SPAN = KEY_OFFSET * 2;

function key(x: number, z: number) {
  return (x + KEY_OFFSET) * KEY_SPAN + (z + KEY_OFFSET);
}
