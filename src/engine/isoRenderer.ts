import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from '../data/catalog';
import { getRecipeById } from '../data/recipes';
import {
  Customer,
  FloatingText,
  Particle,
  PlacedFurniture,
  StaffMember,
} from '../types/game';
import { TILE_H, TILE_W, gridToScreen, isPlacementValid } from './isoMath';

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  originX: number;
  originY: number;
  gridSize: number;
  floorStyleId: string;
  wallStyleId: string;
  furniture: PlacedFurniture[];
  customers: Customer[];
  staff: StaffMember[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  hoverTile: { x: number; y: number } | null;
  editMode: boolean;
  selectedFurnitureId: string | null;
  placingCatalogId: string | null;
  timeSec: number;
  isNeighborView?: boolean;
  zoom?: number;
  panX?: number;
  panY?: number;
}

function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  lineWidth = 1
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  heightPx: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
  outline = 'rgba(60,30,10,0.28)'
) {
  const topY = cy - heightPx;

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, topY + h / 2);
  ctx.lineTo(cx, topY + h);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + w / 2, topY + h / 2);
  ctx.lineTo(cx, topY + h);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.stroke();

  // Top face
  drawIsoDiamond(ctx, cx, topY, w, h, topColor, outline, 1);
}

function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return `rgb(${r}, ${g}, ${b})`;
}

let smoothedDoorOpen = 0;
let lastDoorTime = 0;

function drawWalls(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  gridSize: number,
  wallStyleId: string,
  doorOpenProgress: number
) {
  const wallStyle = WALL_STYLES.find((w) => w.id === wallStyleId) ?? WALL_STYLES[0];
  const wallH = 84;
  const doorX = Math.floor(gridSize / 2);
  const doorH = 56;

  // Left back wall (along x = 0, y from 0 to gridSize)
  const topLeft = gridToScreen(0, 0, originX, originY);
  const botLeft = gridToScreen(0, gridSize, originX, originY);
  ctx.beginPath();
  ctx.moveTo(topLeft.sx, topLeft.sy - wallH);
  ctx.lineTo(botLeft.sx, botLeft.sy - wallH);
  ctx.lineTo(botLeft.sx, botLeft.sy);
  ctx.lineTo(topLeft.sx, topLeft.sy);
  ctx.closePath();
  ctx.fillStyle = wallStyle.primary;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,40,15,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left wall trim
  ctx.beginPath();
  ctx.moveTo(topLeft.sx, topLeft.sy - 12);
  ctx.lineTo(botLeft.sx, botLeft.sy - 12);
  ctx.lineTo(botLeft.sx, botLeft.sy);
  ctx.lineTo(topLeft.sx, topLeft.sy);
  ctx.closePath();
  ctx.fillStyle = wallStyle.secondary;
  ctx.fill();

  // Right back wall (along y = 0) split around doorway [doorX, doorX + 1]
  const rightWallColor = shadeColor(
    wallStyle.primary.startsWith('#') ? wallStyle.primary : '#fbe6c2',
    -10
  );
  const dLeft = gridToScreen(doorX, 0, originX, originY);
  const dRight = gridToScreen(doorX + 1, 0, originX, originY);
  const botRight = gridToScreen(gridSize, 0, originX, originY);

  // Segment 1: 0 -> doorX
  ctx.beginPath();
  ctx.moveTo(topLeft.sx, topLeft.sy - wallH);
  ctx.lineTo(dLeft.sx, dLeft.sy - wallH);
  ctx.lineTo(dLeft.sx, dLeft.sy);
  ctx.lineTo(topLeft.sx, topLeft.sy);
  ctx.closePath();
  ctx.fillStyle = rightWallColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,40,15,0.25)';
  ctx.stroke();

  // Segment 2: doorX + 1 -> gridSize
  ctx.beginPath();
  ctx.moveTo(dRight.sx, dRight.sy - wallH);
  ctx.lineTo(botRight.sx, botRight.sy - wallH);
  ctx.lineTo(botRight.sx, botRight.sy);
  ctx.lineTo(dRight.sx, dRight.sy);
  ctx.closePath();
  ctx.fillStyle = rightWallColor;
  ctx.fill();
  ctx.stroke();

  // Lintel above doorway
  ctx.beginPath();
  ctx.moveTo(dLeft.sx, dLeft.sy - wallH);
  ctx.lineTo(dRight.sx, dRight.sy - wallH);
  ctx.lineTo(dRight.sx, dRight.sy - doorH);
  ctx.lineTo(dLeft.sx, dLeft.sy - doorH);
  ctx.closePath();
  ctx.fillStyle = rightWallColor;
  ctx.fill();
  ctx.stroke();

  // Right wall trim (segments)
  for (const [a, b] of [
    [topLeft, dLeft],
    [dRight, botRight],
  ]) {
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy - 12);
    ctx.lineTo(b.sx, b.sy - 12);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(a.sx, a.sy);
    ctx.closePath();
    ctx.fillStyle = wallStyle.secondary;
    ctx.fill();
  }

  // Door frame
  ctx.strokeStyle = '#5c3317';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(dLeft.sx, dLeft.sy);
  ctx.lineTo(dLeft.sx, dLeft.sy - doorH);
  ctx.lineTo(dRight.sx, dRight.sy - doorH);
  ctx.lineTo(dRight.sx, dRight.sy);
  ctx.stroke();

  // Animated glass double doors
  const dMidX = (dLeft.sx + dRight.sx) / 2;
  const dMidY = (dLeft.sy + dRight.sy) / 2;
  ctx.fillStyle = 'rgba(170, 230, 255, 0.55)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;

  const p = Math.max(0, Math.min(1, doorOpenProgress));
  if (p < 0.02) {
    // Closed double glass doors
    ctx.beginPath();
    ctx.moveTo(dLeft.sx + 2, dLeft.sy - 2);
    ctx.lineTo(dLeft.sx + 2, dLeft.sy - doorH + 2);
    ctx.lineTo(dRight.sx - 2, dRight.sy - doorH + 2);
    ctx.lineTo(dRight.sx - 2, dRight.sy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle glass reflection streak
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(dLeft.sx + 7, dLeft.sy - 12);
    ctx.lineTo(dLeft.sx + 13, dLeft.sy - doorH + 12);
    ctx.stroke();

    // Center divider & brass handles
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dMidX, dMidY);
    ctx.lineTo(dMidX, dMidY - doorH);
    ctx.stroke();

    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(dMidX - 3, dMidY - doorH * 0.45, 2, 5);
    ctx.fillRect(dMidX + 1, dMidY - doorH * 0.45, 2, 5);
  } else {
    // Smoothly swinging inward into the cafe
    const leftEdgeX = dMidX + (dLeft.sx - 12 - dMidX) * p;
    const leftEdgeY = dMidY + (dLeft.sy + 9 - dMidY) * p;
    const rightEdgeX = dMidX + (dRight.sx - 12 - dMidX) * p;
    const rightEdgeY = dMidY + (dRight.sy + 9 - dMidY) * p;

    // Left door leaf
    ctx.beginPath();
    ctx.moveTo(dLeft.sx + 1, dLeft.sy - 1);
    ctx.lineTo(dLeft.sx + 1, dLeft.sy - doorH + 1);
    ctx.lineTo(leftEdgeX, leftEdgeY - doorH + 1);
    ctx.lineTo(leftEdgeX, leftEdgeY - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right door leaf
    ctx.beginPath();
    ctx.moveTo(dRight.sx - 1, dRight.sy - 1);
    ctx.lineTo(dRight.sx - 1, dRight.sy - doorH + 1);
    ctx.lineTo(rightEdgeX, rightEdgeY - doorH + 1);
    ctx.lineTo(rightEdgeX, rightEdgeY - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Awning / CAFÉ MANIA sign above door
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.roundRect(dMidX - 30, dMidY - doorH - 28, 60, 17, 6);
  ctx.fill();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 9px Fredoka, Nunito, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('CAFÉ MANIA', dMidX, dMidY - doorH - 16);

  // Windows on right wall flanking the door
  const windowPositions = [1.3, gridSize - 2.3].filter(
    (wx) => wx >= 0.5 && wx + 1.4 <= gridSize && (wx + 1.4 <= doorX - 0.2 || wx >= doorX + 1.2)
  );
  for (const wx of windowPositions) {
    const p1 = gridToScreen(wx, 0, originX, originY);
    const p2 = gridToScreen(wx + 1.4, 0, originX, originY);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy - 66);
    ctx.lineTo(p2.sx, p2.sy - 66);
    ctx.lineTo(p2.sx, p2.sy - 26);
    ctx.lineTo(p1.sx, p1.sy - 26);
    ctx.closePath();
    ctx.fillStyle = '#bfe9ff';
    ctx.fill();
    ctx.strokeStyle = '#fff8ee';
    ctx.lineWidth = 3;
    ctx.stroke();

    const midX = (p1.sx + p2.sx) / 2;
    const midY = (p1.sy + p2.sy) / 2;
    ctx.beginPath();
    ctx.moveTo(midX, midY - 66);
    ctx.lineTo(midX, midY - 26);
    ctx.strokeStyle = '#fff8ee';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Menu blackboard on left wall with chalk lines
  const m1 = gridToScreen(0, 2.2, originX, originY);
  const m2 = gridToScreen(0, 4.4, originX, originY);
  ctx.beginPath();
  ctx.moveTo(m1.sx, m1.sy - 64);
  ctx.lineTo(m2.sx, m2.sy - 64);
  ctx.lineTo(m2.sx, m2.sy - 28);
  ctx.lineTo(m1.sx, m1.sy - 28);
  ctx.closePath();
  ctx.fillStyle = '#2d3b32';
  ctx.fill();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5;
  for (const offset of [54, 46, 38]) {
    ctx.beginPath();
    ctx.moveTo(m1.sx - 6, m1.sy - offset + 4);
    ctx.lineTo(m2.sx + 6, m2.sy - offset - 4);
    ctx.stroke();
  }
}

function drawExterior(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  gridSize: number,
  timeSec: number
) {
  const doorX = Math.floor(gridSize / 2);

  // Extended neighborhood grass around the café
  for (let gx = -6; gx <= gridSize + 6; gx++) {
    for (let gy = -6; gy <= gridSize + 4; gy++) {
      if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) continue;
      const gPos = gridToScreen(gx, gy, originX, originY);
      const isAlt = (gx + gy) % 2 === 0;
      drawIsoDiamond(
        ctx,
        gPos.sx,
        gPos.sy,
        TILE_W,
        TILE_H,
        isAlt ? '#8bd46e' : '#82cc65'
      );
    }
  }

  // Top-right sidewalk along y = -1 (where customers walk in from!)
  for (let ix = -6; ix <= gridSize + 6; ix++) {
    const sw = gridToScreen(ix, -1, originX, originY);
    const tone = ix % 2 === 0 ? '#e5e9f0' : '#d8dee9';
    drawIsoDiamond(ctx, sw.sx, sw.sy, TILE_W, TILE_H, tone, 'rgba(0,0,0,0.08)', 1);
  }

  // Asphalt avenue along y = -2, -3, -4
  for (let ix = -6; ix <= gridSize + 6; ix++) {
    for (let ry = -4; ry <= -2; ry++) {
      const road = gridToScreen(ix, ry, originX, originY);
      drawIsoDiamond(ctx, road.sx, road.sy, TILE_W, TILE_H, '#4b525c', 'rgba(255,255,255,0.02)', 1);
    }
  }

  // Opposite sidewalk across the street at y = -5
  for (let ix = -6; ix <= gridSize + 6; ix++) {
    const opp = gridToScreen(ix, -5, originX, originY);
    const tone = ix % 2 === 0 ? '#dfe4ea' : '#ced6e0';
    drawIsoDiamond(ctx, opp.sx, opp.sy, TILE_W, TILE_H, tone, 'rgba(0,0,0,0.08)', 1);
  }

  // Yellow dashed road divider along y = -2.5
  for (let ix = -5; ix <= gridSize + 5; ix += 2) {
    const d1 = gridToScreen(ix + 0.15, -2.55, originX, originY);
    const d2 = gridToScreen(ix + 1.05, -2.55, originX, originY);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(d1.sx, d1.sy + TILE_H / 2);
    ctx.lineTo(d2.sx, d2.sy + TILE_H / 2);
    ctx.stroke();
  }

  // White crosswalk stripes in front of the door
  for (let lane = 0; lane < 3; lane++) {
    const cw = gridToScreen(doorX + 0.5, -2 - lane * 0.85, originX, originY);
    drawIsoDiamond(ctx, cw.sx, cw.sy + 5, TILE_W * 0.24, TILE_H * 0.48, '#ecf0f1');
  }

  // Animated 2010 cartoon cars driving along the avenue
  const car1X = ((timeSec * 1.9) % (gridSize + 12)) - 6;
  const car1Pos = gridToScreen(car1X, -2.15, originX, originY);
  drawIsoBox(ctx, car1Pos.sx, car1Pos.sy + 2, 34, 18, 12, '#e74c3c', '#c0392b', '#962d22');
  drawIsoBox(ctx, car1Pos.sx, car1Pos.sy - 9, 22, 12, 8, '#dff9fb', '#95afc0', '#7f8fa6');

  const car2X = gridSize + 6 - ((timeSec * 1.45 + 5) % (gridSize + 12));
  const car2Pos = gridToScreen(car2X, -3.55, originX, originY);
  drawIsoBox(ctx, car2Pos.sx, car2Pos.sy + 2, 34, 18, 12, '#3498db', '#2980b9', '#1f618d');
  drawIsoBox(ctx, car2Pos.sx, car2Pos.sy - 9, 22, 12, 8, '#dff9fb', '#95afc0', '#7f8fa6');

  // Street lamps & trees along opposite sidewalk (y = -5.3) and café sidewalk (y = -1.2)
  for (const lx of [1, gridSize - 1]) {
    const lamp = gridToScreen(lx, -1.25, originX, originY);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(lamp.sx - 2, lamp.sy - 36, 4, 42);
    ctx.fillStyle = '#ffeaa7';
    ctx.beginPath();
    ctx.arc(lamp.sx, lamp.sy - 38, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const tx of [0, gridSize - 1, gridSize + 2]) {
    const tPos = gridToScreen(tx, -5.3, originX, originY);
    ctx.fillStyle = '#7b4b2a';
    ctx.fillRect(tPos.sx - 4, tPos.sy - 8, 8, 22);
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(tPos.sx, tPos.sy - 20, 18, 0, Math.PI * 2);
    ctx.arc(tPos.sx - 10, tPos.sy - 13, 12, 0, Math.PI * 2);
    ctx.arc(tPos.sx + 10, tPos.sy - 13, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFurnitureItem(
  ctx: CanvasRenderingContext2D,
  f: PlacedFurniture,
  originX: number,
  originY: number,
  timeSec: number,
  isSelected: boolean,
  isNeighborView?: boolean,
  allFurniture: PlacedFurniture[] = []
) {
  const item = getCatalogItem(f.catalogId);
  if (!item) return;

  const { sx, sy } = gridToScreen(f.x, f.y, originX, originY);

  if (isSelected) {
    drawIsoDiamond(ctx, sx, sy, TILE_W, TILE_H, 'rgba(255, 224, 102, 0.45)', '#f39c12', 2);
  }

  if (item.kind === 'stove') {
    const bodyColor = item.color;
    drawIsoBox(
      ctx,
      sx,
      sy + 4,
      TILE_W * 0.78,
      TILE_H * 0.78,
      26,
      '#484c56',
      bodyColor,
      shadeColor(bodyColor, -22)
    );

    // Burners on top (4 classic grates with metallic crossbars)
    const topCenterY = sy + 4 - 26 + (TILE_H * 0.78) / 2;
    const isCooking = f.stove?.status === 'cooking';
    const burnerCoords: [number, number][] = [
      [-8, -2],
      [8, 2],
      [0, -6],
      [0, 5],
    ];
    for (let bi = 0; bi < burnerCoords.length; bi++) {
      const [bx, by] = burnerCoords[bi];
      ctx.fillStyle = isCooking && bi === 1 ? '#e67e22' : '#222';
      ctx.beginPath();
      ctx.ellipse(sx + bx, topCenterY + by, 5, 2.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx + bx - 4, topCenterY + by);
      ctx.lineTo(sx + bx + 4, topCenterY + by);
      ctx.moveTo(sx + bx, topCenterY + by - 2.2);
      ctx.lineTo(sx + bx, topCenterY + by + 2.2);
      ctx.stroke();
    }

    // Control knobs on front panel
    ctx.fillStyle = '#ecf0f1';
    const knobSide = f.rotation % 2 === 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(sx + knobSide * (6 + k * 4.5), sy - 11 + k * 2.2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Oven window (flips face based on rotation)
    ctx.fillStyle = f.stove?.status === 'cooking' ? '#ff9f43' : '#2c3e50';
    ctx.beginPath();
    if (f.rotation % 2 === 0) {
      ctx.moveTo(sx - 16, sy - 6);
      ctx.lineTo(sx - 4, sy);
      ctx.lineTo(sx - 4, sy + 11);
      ctx.lineTo(sx - 16, sy + 5);
    } else {
      ctx.moveTo(sx + 16, sy - 6);
      ctx.lineTo(sx + 4, sy);
      ctx.lineTo(sx + 4, sy + 11);
      ctx.lineTo(sx + 16, sy + 5);
    }
    ctx.closePath();
    ctx.fill();
    // Oven handle
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (f.rotation % 2 === 0) {
      ctx.moveTo(sx - 15, sy - 7);
      ctx.lineTo(sx - 5, sy - 2);
    } else {
      ctx.moveTo(sx + 15, sy - 7);
      ctx.lineTo(sx + 5, sy - 2);
    }
    ctx.stroke();

    // Cooking pan & status
    if (f.stove && f.stove.status !== 'idle') {
      const recipe = getRecipeById(f.stove.recipeId);
      // Pan with metallic rim highlight
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.ellipse(sx + 2, topCenterY - 1, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#95a5a6';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Pan handle
      ctx.strokeStyle = '#1e272e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 9, topCenterY - 1);
      ctx.lineTo(sx + 15, topCenterY + 2);
      ctx.stroke();

      if (f.stove.status === 'cooking') {
        // Progress bar above stove
        const barW = 44;
        const barH = 7;
        const bx = sx - barW / 2;
        const by = sy - 46;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.roundRect(bx - 1, by - 1, barW + 2, barH + 2, 4);
        ctx.fill();
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.roundRect(bx, by, Math.max(4, barW * f.stove.progress), barH, 3);
        ctx.fill();

        if (recipe) {
          ctx.font = '15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(recipe.emoji, sx, by - 5);
        }
        if (isNeighborView && !f.stove.spicedByNeighbor) {
          const pulse = Math.sin(timeSec * 5) * 2;
          ctx.fillStyle = '#9b59b6';
          ctx.beginPath();
          ctx.roundRect(sx - 28, by - 36 + pulse, 56, 17, 8);
          ctx.fill();
          ctx.font = 'bold 9px Nunito, sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText('🧂 TEMPERAR', sx, by - 24 + pulse);
        }
      } else if (f.stove.status === 'ready') {
        const bounce = Math.sin(timeSec * 5) * 4;
        ctx.fillStyle = '#27ae60';
        ctx.beginPath();
        ctx.roundRect(sx - 24, sy - 58 + bounce, 48, 22, 11);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 11px Nunito, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${recipe?.emoji ?? '🍽️'} OK!`, sx, sy - 43 + bounce);
      } else if (f.stove.status === 'burnt') {
        const bounce = Math.sin(timeSec * 7) * 2;
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.roundRect(sx - 26, sy - 56 + bounce, 52, 20, 10);
        ctx.fill();
        ctx.font = 'bold 10px Nunito, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('🔥 QUEIMOU', sx, sy - 42 + bounce);
      }
    }
  } else if (item.kind === 'counter') {
    // Base cabinet
    drawIsoBox(
      ctx,
      sx,
      sy + 4,
      TILE_W * 0.8,
      TILE_H * 0.8,
      21,
      item.color,
      item.color,
      shadeColor(item.color, -24)
    );
    // Overhanging marble/wood countertop
    drawIsoBox(
      ctx,
      sx,
      sy - 17,
      TILE_W * 0.86,
      TILE_H * 0.86,
      4,
      item.accentColor,
      shadeColor(item.accentColor, -14),
      shadeColor(item.accentColor, -24)
    );
    // Cabinet door panel outlines & handles
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 18, sy - 6);
    ctx.lineTo(sx - 4, sy + 1);
    ctx.lineTo(sx - 4, sy + 11);
    ctx.lineTo(sx - 18, sy + 4);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sx + 18, sy - 6);
    ctx.lineTo(sx + 4, sy + 1);
    ctx.lineTo(sx + 4, sy + 11);
    ctx.lineTo(sx + 18, sy + 4);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(sx - 6, sy + 2, 1.5, 0, Math.PI * 2);
    ctx.arc(sx + 6, sy + 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (f.counter && f.counter.portions > 0 && f.counter.recipeId) {
      const recipe = getRecipeById(f.counter.recipeId);
      const topY = sy + 4 - 24 + (TILE_H * 0.82) / 2;
      // Serving tray (greenish tint if spoiled)
      ctx.fillStyle = f.counter.spoiled ? '#a3cb38' : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(sx, topY, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = f.counter.spoiled ? '#556b2f' : '#dcdde1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.counter.spoiled ? '🤢' : (recipe?.emoji ?? '🍽️'), sx, topY + 3);

      if (f.counter.spoiled) {
        const bounce = Math.sin(timeSec * 6) * 2;
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.roundRect(sx - 28, topY - 30 + bounce, 56, 17, 8);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = 'bold 9px Nunito, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('🗑️ LIMPAR', sx, topY - 19 + bounce);
      } else {
        // Portion badge
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.roundRect(sx + 8, topY - 18, 22, 14, 7);
        ctx.fill();
        ctx.font = 'bold 10px Nunito, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${f.counter.portions}`, sx + 19, topY - 8);

        // Freshness bar
        const fresh = Math.max(0, Math.min(1, f.counter.freshness ?? 1));
        const barW = 28;
        const barH = 4;
        const bx = sx - barW / 2;
        const by = topY - 22;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(bx - 1, by - 1, barW + 2, barH + 2, 2);
        ctx.fill();
        ctx.fillStyle = fresh > 0.5 ? '#2ecc71' : fresh > 0.25 ? '#f1c40f' : '#e74c3c';
        ctx.beginPath();
        ctx.roundRect(bx, by, Math.max(2, barW * fresh), barH, 2);
        ctx.fill();
      }
    }
  } else if (item.kind === 'table') {
    const centerY = sy + TILE_H / 2;
    const legColor = item.id === 'table_gold' ? '#b7950b' : '#5c3c24';
    const legShade = item.id === 'table_gold' ? '#9a7d0a' : '#3e2716';

    // Soft floor shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.ellipse(sx, centerY + 2, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4 Isometric table legs (back, left, right, front) — 13px tall
    const tableLegs = [
      { x: sx, y: sy + 7, shade: legShade },
      { x: sx - 20, y: sy + 17, shade: legColor },
      { x: sx + 20, y: sy + 17, shade: legShade },
      { x: sx, y: sy + 26, shade: legColor },
    ];
    for (const leg of tableLegs) {
      ctx.fillStyle = leg.shade;
      ctx.fillRect(leg.x - 2, leg.y - 13, 4, 13);
      ctx.fillStyle = '#2d1c10';
      ctx.beginPath();
      ctx.ellipse(leg.x, leg.y, 2.5, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Under-apron / saia da mesa
    drawIsoBox(
      ctx,
      sx,
      sy - 11,
      TILE_W * 0.72,
      TILE_H * 0.72,
      3,
      shadeColor(item.color, -12),
      shadeColor(item.color, -18),
      shadeColor(item.color, -30)
    );

    // 3D Tabletop filling 1x1 tile cleanly above the legs
    const topBoxY = sy - 16;
    drawIsoBox(
      ctx,
      sx,
      topBoxY,
      TILE_W * 0.88,
      TILE_H * 0.88,
      5,
      item.accentColor,
      item.color,
      shadeColor(item.color, -22)
    );

    const surfaceTopY = topBoxY - 5;

    // Tablecloth & tabletop details
    if (item.id === 'table_vip') {
      drawIsoDiamond(ctx, sx, surfaceTopY + 7, TILE_W * 0.46, TILE_H * 0.46, '#e74c3c');
      drawIsoDiamond(ctx, sx, surfaceTopY + 11, TILE_W * 0.22, TILE_H * 0.22, '#ffffff');
    } else if (item.id === 'table_pink') {
      drawIsoDiamond(ctx, sx, surfaceTopY + 4, TILE_W * 0.66, TILE_H * 0.66, '#f8a5c2', '#ffffff', 1.2);
    } else if (item.id === 'table_gold') {
      drawIsoDiamond(ctx, sx, surfaceTopY + 5, TILE_W * 0.62, TILE_H * 0.62, '#9b59b6', '#f7dc6f', 1.5);
    } else {
      ctx.strokeStyle = 'rgba(120, 65, 25, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 12, surfaceTopY + 12);
      ctx.lineTo(sx + 10, surfaceTopY + 22);
      ctx.moveTo(sx - 4, surfaceTopY + 8);
      ctx.lineTo(sx + 16, surfaceTopY + 18);
      ctx.stroke();
    }

    // Cute tabletop centerpiece
    ctx.fillStyle = item.id === 'table_gold' ? '#f1c40f' : '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, surfaceTopY + 15, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = item.id === 'table_pink' ? '#e84393' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(sx, surfaceTopY + 12.5, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'chair') {
    const centerY = sy + TILE_H / 2;
    const legColor = item.id === 'chair_gold' ? '#b7950b' : '#5c3c24';
    const legShade = item.id === 'chair_gold' ? '#9a7d0a' : '#3e2716';

    // Soft floor shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.ellipse(sx, centerY + 2, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4 Isometric chair legs touching floor and supporting seat
    const chairLegs = [
      { x: sx, y: centerY - 5, shade: legShade },
      { x: sx - 10, y: centerY, shade: legColor },
      { x: sx + 10, y: centerY, shade: legShade },
      { x: sx, y: centerY + 5, shade: legColor },
    ];
    for (const leg of chairLegs) {
      ctx.fillStyle = leg.shade;
      ctx.fillRect(leg.x - 1.3, leg.y - 8, 2.6, 8);
    }

    // Seat frame + cushion sitting on top of the 8px legs
    drawIsoBox(
      ctx,
      sx,
      centerY - 14,
      24,
      12,
      4,
      item.accentColor,
      item.color,
      shadeColor(item.color, -22)
    );
    drawIsoDiamond(ctx, sx, centerY - 16, 18, 9, shadeColor(item.accentColor, 10));

    // Auto-detect adjacent table so chair backrest faces away from table
    const adjTable = allFurniture.find(
      (t) => t.table && Math.abs(t.x - f.x) + Math.abs(t.y - f.y) === 1
    );
    let rot = f.rotation % 4;
    if (adjTable && f.rotation === 0) {
      if (adjTable.x > f.x) rot = 0; // table front-right -> backrest top-left
      else if (adjTable.y > f.y) rot = 1; // table front-left -> backrest top-right
      else if (adjTable.x < f.x) rot = 2; // table back-left -> backrest bottom-right
      else if (adjTable.y < f.y) rot = 3; // table back-right -> backrest bottom-left
    }

    // Backrest posts aligned along the true isometric edge of the seat
    const edgeConfigs = [
      // 0: top-left edge
      { p1: { dx: -9, dy: -12 }, p2: { dx: -1, dy: -16 }, rail: { dx: -5, dy: -14 } },
      // 1: top-right edge
      { p1: { dx: 1, dy: -16 }, p2: { dx: 9, dy: -12 }, rail: { dx: 5, dy: -14 } },
      // 2: bottom-right edge
      { p1: { dx: 9, dy: -11 }, p2: { dx: 1, dy: -7 }, rail: { dx: 5, dy: -9 } },
      // 3: bottom-left edge
      { p1: { dx: -9, dy: -11 }, p2: { dx: -1, dy: -7 }, rail: { dx: -5, dy: -9 } },
    ][rot];

    ctx.fillStyle = item.color;
    ctx.fillRect(sx + edgeConfigs.p1.dx - 1.2, centerY + edgeConfigs.p1.dy - 12, 2.4, 12);
    ctx.fillRect(sx + edgeConfigs.p2.dx - 1.2, centerY + edgeConfigs.p2.dy - 12, 2.4, 12);
    ctx.fillStyle = shadeColor(item.accentColor, -8);
    ctx.fillRect(
      sx + (edgeConfigs.p1.dx + edgeConfigs.p2.dx) / 2 - 1,
      centerY + (edgeConfigs.p1.dy + edgeConfigs.p2.dy) / 2 - 10,
      2,
      10
    );
    drawIsoBox(
      ctx,
      sx + edgeConfigs.rail.dx,
      centerY + edgeConfigs.rail.dy - 13,
      11,
      5,
      3,
      item.accentColor,
      item.color,
      shadeColor(item.color, -20)
    );

    // Position food/dirty plate toward the adjacent table edge
    let plateX = sx;
    let plateY = sy - 6;
    if (adjTable) {
      const tblScreen = gridToScreen(adjTable.x, adjTable.y, originX, originY);
      plateX = sx + (tblScreen.sx - sx) * 0.65;
      plateY = sy + (tblScreen.sy - sy) * 0.65 - 6;
    }

    if (f.chair?.hasFood && f.chair.servedRecipeId) {
      const recipe = getRecipeById(f.chair.servedRecipeId);
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(recipe?.emoji ?? '🍽️', plateX, plateY);
    } else if (f.chair?.dirty) {
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath();
      ctx.ellipse(plateX, plateY, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = Math.sin(timeSec * 6) * 2;
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.roundRect(sx - 20, sy - 28 + pulse, 40, 17, 8);
      ctx.fill();
      ctx.font = 'bold 10px Nunito, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('🧹 LIMPAR', sx, sy - 16 + pulse);
    }
  } else if (item.kind === 'decor') {
    if (item.id === 'decor_plant') {
      drawIsoBox(ctx, sx, sy + 6, 22, 12, 12, '#a04000', '#d35400', '#a04000');
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(sx, sy - 12, 13, 0, Math.PI * 2);
      ctx.arc(sx - 8, sy - 8, 9, 0, Math.PI * 2);
      ctx.arc(sx + 8, sy - 8, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.id === 'decor_jukebox') {
      drawIsoBox(ctx, sx, sy + 4, 34, 18, 34, '#f1c40f', '#2980b9', '#1f618d');
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(sx, sy - 26, 10, Math.PI, 0);
      ctx.fill();
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵', sx + Math.sin(timeSec * 3) * 4, sy - 38);
    } else if (item.id === 'decor_espresso') {
      drawIsoBox(ctx, sx, sy + 4, 34, 18, 22, '#bdc3c7', '#c0392b', '#962d22');
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☕', sx, sy - 16);
    } else {
      // Chocolate fountain
      drawIsoBox(ctx, sx, sy + 4, 36, 18, 12, '#d4af37', '#b7950b', '#9a7d0a');
      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 12, 12, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(sx, sy - 21, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  skinColor: string,
  shirtColor: string,
  hairColor: string,
  originX: number,
  originY: number,
  animPhase: number,
  isWalking: boolean,
  role: 'customer' | 'chef' | 'waiter',
  bubbleText?: string,
  bubbleBg = '#ffffff',
  isSeated = false,
  isEating = false
) {
  const { sx, sy } = gridToScreen(gx, gy, originX, originY);
  const seatDrop = isSeated ? 5 : 0;
  const footY = sy + TILE_H / 2 + 2;
  const eatBob = isEating ? Math.sin(animPhase * 12) * 1.4 : 0;
  const bob = (isWalking ? Math.abs(Math.sin(animPhase * 8)) * 4 : 0) - seatDrop + eatBob;

  // Shadow (skip ground shadow when seated on a chair)
  if (!isSeated) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, footY, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legs (tucked when seated)
  const legSwing = isWalking ? Math.sin(animPhase * 8) * 3 : 0;
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isSeated) {
    ctx.moveTo(sx - 3, footY - 12 - bob);
    ctx.lineTo(sx - 4, footY - 5);
    ctx.moveTo(sx + 3, footY - 12 - bob);
    ctx.lineTo(sx + 4, footY - 5);
  } else {
    ctx.moveTo(sx - 3, footY - 12 - bob);
    ctx.lineTo(sx - 4 + legSwing, footY - 2);
    ctx.moveTo(sx + 3, footY - 12 - bob);
    ctx.lineTo(sx + 4 - legSwing, footY - 2);
  }
  ctx.stroke();

  // Body
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  ctx.roundRect(sx - 8, footY - 26 - bob, 16, 16, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (role === 'waiter') {
    // Bow tie
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(sx, footY - 23 - bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(sx, footY - 33 - bob, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.arc(sx - 3, footY - 33 - bob, 1.3, 0, Math.PI * 2);
  ctx.arc(sx + 3, footY - 33 - bob, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Hair or Chef Hat
  if (role === 'chef') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(sx - 7, footY - 48 - bob, 14, 10, 4);
    ctx.arc(sx, footY - 48 - bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dcdde1';
    ctx.stroke();
  } else {
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(sx, footY - 36 - bob, 8.5, Math.PI, 0);
    ctx.fill();
  }

  // Thought bubble
  if (bubbleText) {
    ctx.fillStyle = bubbleBg;
    ctx.beginPath();
    ctx.roundRect(sx - 16, footY - 64 - bob, 32, 20, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2d3436';
    ctx.fillText(bubbleText, sx, footY - 49 - bob);
  }
}

export function renderCafeScene(params: RenderParams): void {
  const {
    ctx,
    width,
    height,
    originX,
    originY,
    gridSize,
    floorStyleId,
    wallStyleId,
    furniture,
    customers,
    staff,
    particles,
    floatingTexts,
    hoverTile,
    editMode,
    selectedFurnitureId,
    placingCatalogId,
    timeSec,
    zoom = 1,
    panX = 0,
    panY = 0,
  } = params;

  ctx.clearRect(0, 0, width, height);

  // Warm 2010 background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#9ad7f5');
  bgGrad.addColorStop(0.55, '#d5f0c8');
  bgGrad.addColorStop(1, '#a9df90');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height / 2);

  // Exterior sidewalk, street & awning
  drawExterior(ctx, originX, originY, gridSize, timeSec);

  // Cafe floor slab shadow
  const topCorner = gridToScreen(0, 0, originX, originY);
  const rightCorner = gridToScreen(gridSize, 0, originX, originY);
  const botCorner = gridToScreen(gridSize, gridSize, originX, originY);
  const leftCorner = gridToScreen(0, gridSize, originX, originY);

  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.moveTo(leftCorner.sx, leftCorner.sy);
  ctx.lineTo(botCorner.sx, botCorner.sy);
  ctx.lineTo(rightCorner.sx, rightCorner.sy);
  ctx.lineTo(rightCorner.sx, rightCorner.sy + 12);
  ctx.lineTo(botCorner.sx, botCorner.sy + 12);
  ctx.lineTo(leftCorner.sx, leftCorner.sy + 12);
  ctx.closePath();
  ctx.fill();

  // Check if any customer is near the doorway to swing doors open smoothly
  const doorX = Math.floor(gridSize / 2);
  const doorTarget = customers.some(
    (c) => Math.abs(c.x - doorX) < 1.25 && c.y >= -1.6 && c.y <= 1.25
  )
    ? 1
    : 0;
  const dtDoor = lastDoorTime > 0 ? Math.min(0.1, Math.max(0.001, timeSec - lastDoorTime)) : 0.016;
  lastDoorTime = timeSec;
  smoothedDoorOpen += (doorTarget - smoothedDoorOpen) * Math.min(1, dtDoor * 8);

  // Draw customers currently outside on the sidewalk (y < -0.15) BEFORE the wall so they walk behind it
  const outsideCustomers = customers
    .filter((c) => c.y < -0.15)
    .sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const c of outsideCustomers) {
    drawCharacter(
      ctx,
      c.x,
      c.y,
      c.skinColor,
      c.shirtColor,
      c.hairColor,
      originX,
      originY,
      c.animPhase,
      c.path.length > 0,
      'customer',
      c.state === 'leaving' && c.mood === 'happy' ? '❤️' : undefined
    );
  }

  // Walls
  drawWalls(ctx, originX, originY, gridSize, wallStyleId, smoothedDoorOpen);

  // Floor tiles
  const floorStyle = FLOOR_STYLES.find((f) => f.id === floorStyleId) ?? FLOOR_STYLES[0];
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const { sx, sy } = gridToScreen(x, y, originX, originY);
      const isAlt = (x + y) % 2 === 0;
      const fill = isAlt ? floorStyle.primary : floorStyle.secondary;
      const stroke = editMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)';
      drawIsoDiamond(ctx, sx, sy, TILE_W, TILE_H, fill, stroke, 1);
    }
  }

  // Welcome door mat inside the entrance at (doorX, 0)
  const doorPos = gridToScreen(doorX, 0, originX, originY);
  drawIsoDiamond(ctx, doorPos.sx, doorPos.sy + 3, TILE_W * 0.72, TILE_H * 0.72, '#c0392b', '#f1c40f', 2);
  ctx.font = 'bold 9px Nunito, sans-serif';
  ctx.fillStyle = '#fff8ee';
  ctx.textAlign = 'center';
  ctx.fillText('ABERTO', doorPos.sx, doorPos.sy + TILE_H / 2 + 5);

  // Hover tile highlight
  if (hoverTile && hoverTile.x >= 0 && hoverTile.y >= 0 && hoverTile.x < gridSize && hoverTile.y < gridSize) {
    const { sx, sy } = gridToScreen(hoverTile.x, hoverTile.y, originX, originY);
    const valid = isPlacementValid(
      hoverTile.x,
      hoverTile.y,
      gridSize,
      furniture,
      selectedFurnitureId
    );
    const highlightColor =
      placingCatalogId || editMode
        ? valid
          ? 'rgba(46, 204, 113, 0.45)'
          : 'rgba(231, 76, 60, 0.45)'
        : 'rgba(255, 255, 255, 0.25)';
    drawIsoDiamond(ctx, sx, sy, TILE_W, TILE_H, highlightColor, '#ffffff', 1.5);
  }

  // Depth-sorted entities
  type Drawable = { depth: number; draw: () => void };
  const drawables: Drawable[] = [];

  for (const f of furniture) {
    drawables.push({
      depth: f.x + f.y + 0.01,
      draw: () =>
        drawFurnitureItem(
          ctx,
          f,
          originX,
          originY,
          timeSec,
          f.instanceId === selectedFurnitureId,
          params.isNeighborView,
          furniture
        ),
    });
  }

  for (const c of customers) {
    if (c.y < -0.15) continue;
    const recipe = getRecipeById(c.desiredRecipeId);
    let bubble: string | undefined;
    let bubbleBg = '#ffffff';
    if (c.state === 'waiting_food') {
      bubble = c.mood === 'angry' ? '😠' : recipe?.emoji ?? '🍽️';
      if (c.mood === 'impatient') bubbleBg = '#ffeaa7';
      if (c.mood === 'angry') bubbleBg = '#fab1a0';
    } else if (c.state === 'eating') {
      bubble = '😋';
    } else if (c.state === 'leaving' && c.mood === 'happy') {
      bubble = '❤️';
    }

    const isSeated = c.state === 'waiting_food' || c.state === 'eating';
    const isEating = c.state === 'eating';
    drawables.push({
      depth: c.x + c.y + 0.16,
      draw: () =>
        drawCharacter(
          ctx,
          c.x,
          c.y,
          c.skinColor,
          c.shirtColor,
          c.hairColor,
          originX,
          originY,
          c.animPhase,
          c.path.length > 0,
          'customer',
          bubble,
          bubbleBg,
          isSeated,
          isEating
        ),
    });
  }

  for (const s of staff) {
    const carried = getRecipeById(s.carryingRecipeId);
    drawables.push({
      depth: s.x + s.y + 0.22,
      draw: () =>
        drawCharacter(
          ctx,
          s.x,
          s.y,
          '#f5cba7',
          s.role === 'chef' ? '#ffffff' : '#2c3e50',
          '#4a235a',
          originX,
          originY,
          s.animPhase,
          s.path.length > 0,
          s.role,
          carried ? carried.emoji : undefined
        ),
    });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) {
    d.draw();
  }

  // Particles
  for (const p of particles) {
    const { sx, sy } = gridToScreen(p.gridX, p.gridY, originX, originY);
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy - p.offsetZ, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating texts
  for (const ft of floatingTexts) {
    const { sx, sy } = gridToScreen(ft.gridX, ft.gridY, originX, originY);
    const progress = 1 - ft.life / ft.maxLife;
    ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
    ctx.font = 'bold 14px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, sx, sy - 30 - progress * 28);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, sx, sy - 30 - progress * 28);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  void topCorner;
}

export function renderFurnitureThumbnail(
  canvas: HTMLCanvasElement,
  catalogId: string,
  width = 110,
  height = 88
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const scale = 1.08;
  ctx.scale(scale, scale);
  const cx = width / (2 * scale);
  const cy = (height * 0.48) / scale;

  // Pedestal tile
  drawIsoDiamond(ctx, cx, cy, TILE_W * 0.92, TILE_H * 0.92, '#f8e6ce', '#e2c39d', 1.2);

  const dummy: PlacedFurniture = {
    instanceId: 'preview',
    catalogId,
    x: 0,
    y: 0,
    rotation: 0,
  };

  drawFurnitureItem(ctx, dummy, cx, cy, 0, false, false, [dummy]);
  ctx.restore();
}

export function renderStyleThumbnail(
  canvas: HTMLCanvasElement,
  kind: 'floor' | 'wall',
  primary: string,
  secondary: string,
  width = 110,
  height = 74
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (kind === 'floor') {
    const cx = width / 2;
    const cy = 22;
    const tw = 34;
    const th = 17;
    const tiles = [
      { gx: 0, gy: 0, color: primary },
      { gx: 1, gy: 0, color: secondary },
      { gx: 0, gy: 1, color: secondary },
      { gx: 1, gy: 1, color: primary },
    ];
    for (const t of tiles) {
      const sx = cx + (t.gx - t.gy) * (tw / 2);
      const sy = cy + (t.gx + t.gy) * (th / 2);
      drawIsoDiamond(ctx, sx, sy, tw, th, t.color, 'rgba(0,0,0,0.12)', 1);
    }
  } else {
    const cx = width / 2;
    const baseY = 58;
    const wallH = 38;
    const dx = 34;
    const dy = 17;

    // Left wall face
    ctx.beginPath();
    ctx.moveTo(cx, baseY - wallH - dy);
    ctx.lineTo(cx - dx, baseY - wallH);
    ctx.lineTo(cx - dx, baseY);
    ctx.lineTo(cx, baseY - dy);
    ctx.closePath();
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.stroke();

    // Right wall face
    ctx.beginPath();
    ctx.moveTo(cx, baseY - wallH - dy);
    ctx.lineTo(cx + dx, baseY - wallH);
    ctx.lineTo(cx + dx, baseY);
    ctx.lineTo(cx, baseY - dy);
    ctx.closePath();
    ctx.fillStyle = shadeColor(primary, -12);
    ctx.fill();
    ctx.stroke();

    // Baseboard trim
    ctx.beginPath();
    ctx.moveTo(cx - dx, baseY - 7);
    ctx.lineTo(cx, baseY - dy - 7);
    ctx.lineTo(cx + dx, baseY - 7);
    ctx.lineTo(cx + dx, baseY);
    ctx.lineTo(cx, baseY - dy);
    ctx.lineTo(cx - dx, baseY);
    ctx.closePath();
    ctx.fillStyle = secondary;
    ctx.fill();
  }

  ctx.restore();
}
