import { getCatalogItem } from '../data/catalog';
import { GridPos, PlacedFurniture } from '../types/game';

export const TILE_W = 68;
export const TILE_H = 34;

export function gridToScreen(
  gx: number,
  gy: number,
  originX: number,
  originY: number
): { sx: number; sy: number } {
  const sx = originX + (gx - gy) * (TILE_W / 2);
  const sy = originY + (gx + gy) * (TILE_H / 2);
  return { sx, sy };
}

export function screenToGrid(
  sx: number,
  sy: number,
  originX: number,
  originY: number
): GridPos {
  const dx = sx - originX;
  const dy = sy - originY;
  const gx = Math.floor((dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2);
  const gy = Math.floor((dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2);
  return { x: gx, y: gy };
}

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  gridSize: number,
  furniture: PlacedFurniture[],
  allowGoalBlocked = true
): GridPos[] {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  const gx = Math.round(goalX);
  const gy = Math.round(goalY);

  if (sx === gx && sy === gy) return [];

  const blocked = new Set<string>();
  for (const f of furniture) {
    if (getCatalogItem(f.catalogId)?.kind === 'rug') continue;
    blocked.add(`${f.x},${f.y}`);
  }
  if (allowGoalBlocked) {
    blocked.delete(`${gx},${gy}`);
  }
  blocked.delete(`${sx},${sy}`);

  const queue: GridPos[] = [{ x: sx, y: sy }];
  const visited = new Set<string>([`${sx},${sy}`]);
  const parent = new Map<string, GridPos>();

  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === gx && curr.y === gy) {
      const path: GridPos[] = [];
      let trace: GridPos | undefined = curr;
      while (trace && !(trace.x === sx && trace.y === sy)) {
        path.unshift(trace);
        trace = parent.get(`${trace.x},${trace.y}`);
      }
      return path;
    }

    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      if (visited.has(key)) continue;
      if (blocked.has(key)) continue;
      visited.add(key);
      parent.set(key, curr);
      queue.push({ x: nx, y: ny });
    }
  }

  // Fallback direct step if path is blocked
  return [{ x: gx, y: gy }];
}

export function findBestAdjacentTile(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  gridSize: number,
  furniture: PlacedFurniture[]
): GridPos {
  const blocked = new Set<string>(
    furniture
      .filter((f) => getCatalogItem(f.catalogId)?.kind !== 'rug')
      .map((f) => `${f.x},${f.y}`)
  );
  const candidates = [
    { x: targetX + 1, y: targetY },
    { x: targetX, y: targetY + 1 },
    { x: targetX - 1, y: targetY },
    { x: targetX, y: targetY - 1 },
  ].filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < gridSize &&
      p.y < gridSize &&
      !blocked.has(`${p.x},${p.y}`)
  );

  if (candidates.length === 0) return { x: targetX, y: targetY };

  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY)
  );
  return candidates[0];
}

export function isPlacementValid(
  x: number,
  y: number,
  gridSize: number,
  furniture: PlacedFurniture[],
  ignoreInstanceId?: string | null,
  isRug = false
): boolean {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  if (isRug) {
    return !furniture.some(
      (f) =>
        f.x === x &&
        f.y === y &&
        f.instanceId !== ignoreInstanceId &&
        getCatalogItem(f.catalogId)?.kind === 'rug'
    );
  }
  const doorX = Math.floor(gridSize / 2);
  if (x === doorX && y === 0) return false; // Keep entrance doorway clear
  return !furniture.some(
    (f) =>
      f.x === x &&
      f.y === y &&
      f.instanceId !== ignoreInstanceId &&
      getCatalogItem(f.catalogId)?.kind !== 'rug'
  );
}
