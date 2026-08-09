export type SpatialBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export class SpatialGrid<T extends SpatialBounds> {
  readonly cellSize: number;
  private readonly cells = new Map<string, T[]>();

  constructor(items: readonly T[], cellSize = 32) {
    this.cellSize = cellSize;
    items.forEach((item) => this.insert(item));
  }

  query(minX: number, maxX: number, minZ: number, maxZ: number): T[] {
    const result: T[] = [];
    const seen = new Set<T>();
    const minCellX = Math.floor(minX / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const minCellZ = Math.floor(minZ / this.cellSize);
    const maxCellZ = Math.floor(maxZ / this.cellSize);
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
    return result;
  }

  getOccupiedCells() {
    return [...this.cells.keys()].map((cellKey) => {
      const [x, z] = cellKey.split(":").map(Number);
      return { x, z };
    });
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

function key(x: number, z: number) {
  return `${x}:${z}`;
}
