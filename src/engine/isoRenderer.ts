import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from '../data/catalog';
import { getRecipeById } from '../data/recipes';
import {
  Customer,
  FloatingText,
  HairStyle,
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

/**
 * Draws a 2D quad mapped onto the left or right vertical face of an isoBox.
 * u in [0..1] goes left->right across the face; v in [0..1] goes bottom->top.
 */
function drawIsoFaceQuad(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  heightPx: number,
  side: 'left' | 'right',
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  fill: string,
  stroke?: string
) {
  const pt = (u: number, v: number) => {
    const x = side === 'left' ? cx - (w / 2) * (1 - u) : cx + (w / 2) * u;
    const baseY = side === 'left' ? cy + h / 2 + (h / 2) * u : cy + h - (h / 2) * u;
    return { x, y: baseY - heightPx * v };
  };
  const a = pt(u0, v0);
  const b = pt(u1, v0);
  const c = pt(u1, v1);
  const d = pt(u0, v1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
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

  // Striped 2010 awning & CAFÉ MANIA sign above door
  const awningY = dMidY - doorH - 12;
  const stripeW = 8;
  for (let i = -3; i <= 2; i++) {
    ctx.fillStyle = Math.abs(i) % 2 === 0 ? '#c0392b' : '#fff8ee';
    ctx.beginPath();
    ctx.moveTo(dMidX + i * stripeW, awningY);
    ctx.lineTo(dMidX + (i + 1) * stripeW, awningY);
    ctx.lineTo(dMidX + (i + 1) * stripeW + 2, awningY + 10);
    ctx.lineTo(dMidX + i * stripeW + 2, awningY + 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#922b21';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(dMidX - 24, awningY, 48, 10);

  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.roundRect(dMidX - 31, dMidY - doorH - 30, 62, 17, 6);
  ctx.fill();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 9px Fredoka, Nunito, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('CAFÉ MANIA', dMidX, dMidY - doorH - 18);

  // Windows on right wall flanking the door (2010 style with curtains & reflection)
  const windowPositions = [1.3, gridSize - 2.3].filter(
    (wx) => wx >= 0.5 && wx + 1.4 <= gridSize && (wx + 1.4 <= doorX - 0.2 || wx >= doorX + 1.2)
  );
  for (const wx of windowPositions) {
    const p1 = gridToScreen(wx, 0, originX, originY);
    const p2 = gridToScreen(wx + 1.4, 0, originX, originY);
    const midX = (p1.sx + p2.sx) / 2;
    const midY = (p1.sy + p2.sy) / 2;

    // Outer window frame
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

    // Sky reflection streak
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.sx + 6, p1.sy - 32);
    ctx.lineTo(p1.sx + 18, p1.sy - 60);
    ctx.stroke();

    // Cute side curtain drapes
    ctx.fillStyle = 'rgba(231, 76, 60, 0.72)';
    ctx.beginPath();
    ctx.moveTo(p1.sx + 1, p1.sy - 65);
    ctx.lineTo(p1.sx + 10, p1.sy - 61);
    ctx.lineTo(p1.sx + 7, p1.sy - 27);
    ctx.lineTo(p1.sx + 1, p1.sy - 27);
    ctx.closePath();
    ctx.fill();

    // Cross muntins
    ctx.beginPath();
    ctx.moveTo(midX, midY - 66);
    ctx.lineTo(midX, midY - 26);
    ctx.moveTo(p1.sx, p1.sy - 46);
    ctx.lineTo(p2.sx, p2.sy - 46);
    ctx.strokeStyle = '#fff8ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wooden sill
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p1.sx - 2, p1.sy - 25);
    ctx.lineTo(p2.sx + 2, p2.sy - 25);
    ctx.stroke();
  }

  // Menu blackboard on left wall with 3D frame, chalk text & eraser ledge
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
  ctx.strokeStyle = '#b9770e';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Chalk lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1.5;
  for (const offset of [55, 47, 39]) {
    ctx.beginPath();
    ctx.moveTo(m1.sx - 7, m1.sy - offset + 4);
    ctx.lineTo(m2.sx + 7, m2.sy - offset - 4);
    ctx.stroke();
  }
  // Chalk ledge + chalk piece
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(m1.sx, m1.sy - 27);
  ctx.lineTo(m2.sx, m2.sy - 27);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect((m1.sx + m2.sx) / 2 - 4, (m1.sy + m2.sy) / 2 - 30, 5, 2);
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

  // 3D curb edge along café sidewalk
  const curbStart = gridToScreen(-6, -1, originX, originY);
  const curbEnd = gridToScreen(gridSize + 6, -1, originX, originY);
  ctx.strokeStyle = '#9aa5b1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(curbStart.sx - TILE_W / 2, curbStart.sy + TILE_H / 2);
  ctx.lineTo(curbEnd.sx + TILE_W / 2, curbEnd.sy + TILE_H / 2);
  ctx.stroke();

  // Manhole cover on avenue + fire hydrant on sidewalk
  const manhole = gridToScreen(Math.max(1, doorX - 2), -2.9, originX, originY);
  ctx.fillStyle = '#2f3640';
  ctx.beginPath();
  ctx.ellipse(manhole.sx, manhole.sy + 6, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#57606f';
  ctx.lineWidth = 1;
  ctx.stroke();

  const hydrant = gridToScreen(Math.max(0.5, doorX - 2.6), -1.1, originX, originY);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(hydrant.sx - 2.5, hydrant.sy - 8, 5, 10);
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(hydrant.sx, hydrant.sy - 8, 3, 0, Math.PI * 2);
  ctx.fill();

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

  // Helper to draw a true elongated 3D isometric car along the X avenue axis
  const drawPrism = (
    gx: number,
    gy: number,
    lenX: number,
    widY: number,
    z0: number,
    zH: number,
    topCol: string,
    leftCol: string,
    rightCol: string
  ) => {
    const hx = lenX / 2;
    const hy = widY / 2;
    // 4 base corners in grid space (shifted to tile center +0.5,+0.5 is not needed since we pass exact center)
    const pTop = gridToScreen(gx - hx, gy - hy, originX, originY);
    const pRight = gridToScreen(gx + hx, gy - hy, originX, originY);
    const pFront = gridToScreen(gx + hx, gy + hy, originX, originY);
    const pLeft = gridToScreen(gx - hx, gy + hy, originX, originY);
    const zTop = z0 + zH;

    // Left visible face (pLeft -> pFront, facing +y)
    ctx.beginPath();
    ctx.moveTo(pLeft.sx, pLeft.sy - z0);
    ctx.lineTo(pFront.sx, pFront.sy - z0);
    ctx.lineTo(pFront.sx, pFront.sy - zTop);
    ctx.lineTo(pLeft.sx, pLeft.sy - zTop);
    ctx.closePath();
    ctx.fillStyle = leftCol;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Right visible face (pFront -> pRight, facing +x)
    ctx.beginPath();
    ctx.moveTo(pFront.sx, pFront.sy - z0);
    ctx.lineTo(pRight.sx, pRight.sy - z0);
    ctx.lineTo(pRight.sx, pRight.sy - zTop);
    ctx.lineTo(pFront.sx, pFront.sy - zTop);
    ctx.closePath();
    ctx.fillStyle = rightCol;
    ctx.fill();
    ctx.stroke();

    // Top face
    ctx.beginPath();
    ctx.moveTo(pTop.sx, pTop.sy - zTop);
    ctx.lineTo(pRight.sx, pRight.sy - zTop);
    ctx.lineTo(pFront.sx, pFront.sy - zTop);
    ctx.lineTo(pLeft.sx, pLeft.sy - zTop);
    ctx.closePath();
    ctx.fillStyle = topCol;
    ctx.fill();
    ctx.stroke();
  };

  const drawDetailedCar = (
    gx: number,
    gy: number,
    dir: 1 | -1,
    bodyTop: string,
    bodyLeft: string,
    bodyRight: string
  ) => {
    const center = gridToScreen(gx, gy, originX, originY);
    // Elongated asphalt shadow
    const sA = gridToScreen(gx - 0.65, gy, originX, originY);
    const sB = gridToScreen(gx + 0.65, gy, originX, originY);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sA.sx, sA.sy + 14);
    ctx.lineTo(sB.sx, sB.sy + 14);
    ctx.stroke();

    // Wheels on camera-facing side (+y) with silver hubcaps
    for (const wxOff of [-0.36, 0.36]) {
      const wPos = gridToScreen(gx + wxOff, gy + 0.27, originX, originY);
      ctx.fillStyle = '#1e272e';
      ctx.beginPath();
      ctx.ellipse(wPos.sx, wPos.sy + 13, 5, 4.2, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath();
      ctx.ellipse(wPos.sx, wPos.sy + 13, 2.2, 1.8, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lower body chassis (elongated along X!)
    drawPrism(gx, gy, 1.26, 0.56, -12, 9, bodyTop, bodyLeft, bodyRight);

    // Cabin roof (shorter & slightly set back so there's a clear front hood!)
    const cabinGx = gx - dir * 0.08;
    drawPrism(cabinGx, gy, 0.64, 0.48, -3, 8, bodyTop, '#546e7a', '#37474f');

    // Side window glass strip on cabin
    const winA = gridToScreen(cabinGx - 0.24, gy + 0.25, originX, originY);
    const winB = gridToScreen(cabinGx + 0.24, gy + 0.25, originX, originY);
    ctx.strokeStyle = '#bfe9ff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(winA.sx, winA.sy - 1);
    ctx.lineTo(winB.sx, winB.sy - 1);
    ctx.stroke();

    // Headlights (front) & Taillights (back)
    const frontPos = gridToScreen(gx + dir * 0.63, gy + 0.14, originX, originY);
    const rearPos = gridToScreen(gx - dir * 0.63, gy + 0.14, originX, originY);
    ctx.fillStyle = 'rgba(255, 245, 157, 0.35)';
    ctx.beginPath();
    ctx.arc(frontPos.sx + dir * 6, frontPos.sy + 7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.arc(frontPos.sx, frontPos.sy + 6, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(rearPos.sx, rearPos.sy + 6, 2, 0, Math.PI * 2);
    ctx.fill();

    void center;
  };

  // Animated 2010 cartoon cars driving along the avenue
  const car1X = ((timeSec * 1.9) % (gridSize + 12)) - 6;
  drawDetailedCar(car1X, -2.35, 1, '#e74c3c', '#c0392b', '#962d22');

  const car2X = gridSize + 6 - ((timeSec * 1.45 + 5) % (gridSize + 12));
  drawDetailedCar(car2X, -3.7, -1, '#3498db', '#2980b9', '#1f618d');

  // Street lamps with warm glow halo & layered trees
  for (const lx of [1, gridSize - 1]) {
    const lamp = gridToScreen(lx, -1.25, originX, originY);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(lamp.sx - 2, lamp.sy - 36, 4, 42);
    ctx.fillStyle = 'rgba(255, 234, 167, 0.28)';
    ctx.beginPath();
    ctx.arc(lamp.sx, lamp.sy - 38, 12, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(tPos.sx, tPos.sy + 14, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7b4b2a';
    ctx.fillRect(tPos.sx - 4, tPos.sy - 8, 8, 22);
    ctx.fillStyle = '#1e8449';
    ctx.beginPath();
    ctx.arc(tPos.sx, tPos.sy - 18, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(tPos.sx - 9, tPos.sy - 13, 12, 0, Math.PI * 2);
    ctx.arc(tPos.sx + 9, tPos.sy - 13, 12, 0, Math.PI * 2);
    ctx.arc(tPos.sx, tPos.sy - 24, 13, 0, Math.PI * 2);
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

    // Oven window (flips face based on rotation, warm pulsing glow when cooking)
    const ovenGlow = f.stove?.status === 'cooking'
      ? `rgba(255, ${Math.round(145 + Math.sin(timeSec * 8) * 25)}, 55, 1)`
      : '#2c3e50';
    ctx.fillStyle = ovenGlow;
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
    // Oven glass reflection
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (f.rotation % 2 === 0) {
      ctx.moveTo(sx - 14, sy + 3);
      ctx.lineTo(sx - 8, sy - 1);
    } else {
      ctx.moveTo(sx + 14, sy + 3);
      ctx.lineTo(sx + 8, sy - 1);
    }
    ctx.stroke();
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
      const cat = recipe?.category;

      // Animated blue/orange flame ring when cooking
      if (f.stove.status === 'cooking') {
        const flicker = Math.sin(timeSec * 18) * 1.2;
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY + 1, 7 + flicker * 0.4, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f39c12';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY + 0.5, 4.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cat === 'Bebidas') {
        // Kettle / Coffee pot
        ctx.fillStyle = '#bdc3c7';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 2, 7, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(sx - 4, topCenterY - 10, 12, 8);
        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 10, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (cat === 'Doces') {
        // Baking tin / cake pan
        ctx.fillStyle = '#d4ac0d';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 3, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f7dc6f';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (cat === 'Pratos') {
        // Deep stockpot with two handles & lid
        ctx.fillStyle = '#5d6d7e';
        ctx.fillRect(sx - 6, topCenterY - 8, 16, 7);
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 1, 8, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#aab7b8';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 8, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(sx + 2, topCenterY - 10, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Classic frying pan
        ctx.fillStyle = '#2d3436';
        ctx.beginPath();
        ctx.ellipse(sx + 2, topCenterY - 1, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = '#1e272e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 9, topCenterY - 1);
        ctx.lineTo(sx + 15, topCenterY + 2);
        ctx.stroke();
      }

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

    // Classic 2010 stack of clean plates tucked on lower shelf
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(sx - 13, sy + 1, 10, 9);
    for (let pi = 0; pi < 3; pi++) {
      ctx.fillStyle = '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(sx - 8, sy + 8 - pi * 2.2, 4.2, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#bdc3c7';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

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
      // Ceramic plate + silver cutlery + cup on table edge
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(plateX, plateY + 1, 7.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dcdde1';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // Fork & knife ticks
      ctx.strokeStyle = '#95a5a6';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(plateX - 9, plateY - 1);
      ctx.lineTo(plateX - 9, plateY + 3);
      ctx.moveTo(plateX + 9, plateY - 1);
      ctx.lineTo(plateX + 9, plateY + 3);
      ctx.stroke();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(recipe?.emoji ?? '🍽️', plateX, plateY + 1);
    } else if (f.chair?.dirty) {
      // Dirty plate with crumbs & crumpled napkin
      ctx.fillStyle = '#d5dbdb';
      ctx.beginPath();
      ctx.ellipse(plateX, plateY, 7, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a04000';
      ctx.beginPath();
      ctx.arc(plateX - 1.5, plateY, 1.1, 0, Math.PI * 2);
      ctx.arc(plateX + 2, plateY - 0.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8f9f9';
      ctx.fillRect(plateX + 4, plateY - 2, 4, 3);

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
      drawIsoBox(ctx, sx, sy + 6, 22, 12, 12, '#b9770e', '#d35400', '#a04000');
      ctx.fillStyle = '#1e8449';
      ctx.beginPath();
      ctx.arc(sx, sy - 11, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(sx - 7, sy - 9, 8.5, 0, Math.PI * 2);
      ctx.arc(sx + 7, sy - 9, 8.5, 0, Math.PI * 2);
      ctx.arc(sx, sy - 16, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.id === 'decor_divider') {
      // Decorative partition screen (rotates with R)
      const dirX = f.rotation % 2 === 0 ? 1 : -1;
      const p1x = sx - dirX * 18;
      const p1y = sy + 8;
      const p2x = sx + dirX * 18;
      const p2y = sy + 24;
      // Wood frame
      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(p2x, p2y - 30);
      ctx.lineTo(p1x, p1y - 30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3e220f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner bamboo/cream slats
      ctx.fillStyle = '#f5cba7';
      ctx.beginPath();
      ctx.moveTo(p1x + dirX * 3, p1y - 3);
      ctx.lineTo(p2x - dirX * 3, p2y - 3);
      ctx.lineTo(p2x - dirX * 3, p2y - 26);
      ctx.lineTo(p1x + dirX * 3, p1y - 26);
      ctx.closePath();
      ctx.fill();
    } else if (item.id === 'decor_cashier') {
      // Wooden counter + cash drawer + vintage register
      const bw = TILE_W * 0.78;
      const bh = TILE_H * 0.78;
      drawIsoBox(ctx, sx, sy + 4, bw, bh, 21, '#a0522d', '#8b4513', '#5c3317');
      drawIsoFaceQuad(ctx, sx, sy + 4, bw, bh, 21, 'left', 0.12, 0.88, 0.12, 0.85, '#6e3410', '#4a230b');
      drawIsoBox(ctx, sx, sy - 17, TILE_W * 0.82, TILE_H * 0.82, 3, '#f5cba7', '#d49a6a', '#b57b4c');
      // Register body & cash drawer
      drawIsoBox(ctx, sx, sy - 19, 22, 12, 11, '#d5dbdb', '#95a5a6', '#7f8c8d');
      drawIsoFaceQuad(ctx, sx, sy - 19, 22, 12, 11, 'left', 0.15, 0.85, 0.1, 0.45, '#5d6d7e');
      // Green LED price display on top
      drawIsoBox(ctx, sx + 2, sy - 30, 12, 7, 6, '#2c3e50', '#1e272e', '#111');
      drawIsoFaceQuad(ctx, sx + 2, sy - 30, 12, 7, 6, 'left', 0.18, 0.82, 0.25, 0.75, '#2ecc71');
    } else if (item.id === 'decor_fridge') {
      // Tall classic double-door refrigerator with aligned doors, handles & magnets
      const fw = TILE_W * 0.68;
      const fh = TILE_H * 0.68;
      const fH = 42;
      drawIsoBox(ctx, sx, sy + 4, fw, fh, fH, '#ffffff', '#e5e8e8', '#bdc3c7');
      // Freezer door (top) & main door (bottom) mapped flush on left face
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.08, 0.92, 0.64, 0.95, '#f2f4f4', '#aeb6bf');
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.08, 0.92, 0.05, 0.6, '#f8f9f9', '#aeb6bf');
      // Metallic handles
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.78, 0.84, 0.69, 0.88, '#7f8c8d');
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.78, 0.84, 0.34, 0.55, '#7f8c8d');
      // Colorful fridge magnets
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.22, 0.32, 0.75, 0.82, '#e74c3c');
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.38, 0.48, 0.78, 0.85, '#f1c40f');
      drawIsoFaceQuad(ctx, sx, sy + 4, fw, fh, fH, 'left', 0.26, 0.36, 0.42, 0.49, '#3498db');
    } else if (item.id === 'decor_vending') {
      // Classic red soda vending machine with flush illuminated showcase
      const vw = TILE_W * 0.68;
      const vh = TILE_H * 0.68;
      const vH = 40;
      drawIsoBox(ctx, sx, sy + 4, vw, vh, vH, '#e74c3c', '#c0392b', '#922b21');
      // Illuminated glass showcase on left face
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.12, 0.72, 0.34, 0.9, '#dff9fb', '#ffffff');
      // Drink shelves & colorful cans inside
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.18, 0.3, 0.72, 0.82, '#e67e22');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.36, 0.48, 0.72, 0.82, '#2ecc71');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.54, 0.66, 0.72, 0.82, '#3498db');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.18, 0.3, 0.46, 0.56, '#9b59b6');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.36, 0.48, 0.46, 0.56, '#f1c40f');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.54, 0.66, 0.46, 0.56, '#e74c3c');
      // Coin panel & dispenser flap
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.78, 0.9, 0.5, 0.85, '#ecf0f1', '#7f8c8d');
      drawIsoFaceQuad(ctx, sx, sy + 4, vw, vh, vH, 'left', 0.18, 0.68, 0.08, 0.24, '#1e272e', '#7f8c8d');
    } else if (item.id === 'decor_arcade') {
      // Retro arcade cabinet with flush glowing screen, marquee & joystick deck
      const aw = TILE_W * 0.64;
      const ah = TILE_H * 0.64;
      const aH = 36;
      drawIsoBox(ctx, sx, sy + 4, aw, ah, aH, '#f1c40f', '#2980b9', '#1f618d');
      // Marquee header & glowing CRT screen on left face
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.12, 0.88, 0.84, 0.95, '#e74c3c', '#f1c40f');
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.14, 0.86, 0.48, 0.8, '#1e272e', '#7f8c8d');
      const pxCol = Math.sin(timeSec * 6) > 0 ? '#2ecc71' : '#f1c40f';
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.32, 0.52, 0.58, 0.7, pxCol);
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.6, 0.72, 0.54, 0.64, '#e84393');
      // Control deck & coin door
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.1, 0.9, 0.36, 0.46, '#34495e', '#f1c40f');
      drawIsoFaceQuad(ctx, sx, sy + 4, aw, ah, aH, 'left', 0.34, 0.66, 0.08, 0.28, '#2c3e50', '#7f8c8d');
    } else if (item.id === 'decor_pool') {
      // Emerald green billiard table on 4 wooden legs (not a solid block!)
      const pCenterY = sy + TILE_H / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(sx, pCenterY + 2, 23, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const leg of [
        { x: sx, y: sy + 7, c: '#3e220f' },
        { x: sx - 20, y: sy + 17, c: '#5c3317' },
        { x: sx + 20, y: sy + 17, c: '#3e220f' },
        { x: sx, y: sy + 26, c: '#5c3317' },
      ]) {
        ctx.fillStyle = leg.c;
        ctx.fillRect(leg.x - 2.2, leg.y - 12, 4.4, 12);
      }
      const pTop = sy - 11;
      drawIsoBox(ctx, sx, pTop, TILE_W * 0.88, TILE_H * 0.88, 5, '#6e2c00', '#5c3317', '#3e220f');
      drawIsoDiamond(ctx, sx, pTop - 4, TILE_W * 0.76, TILE_H * 0.76, '#27ae60', '#1e8449', 1);
      // 4 corner pockets
      ctx.fillStyle = '#111';
      for (const [px, py] of [
        [sx, pTop - 3],
        [sx - 19, pTop + 6],
        [sx + 19, pTop + 6],
        [sx, pTop + 15],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Cue ball & colored balls
      for (const [bx, by, col] of [
        [sx - 7, pTop + 6, '#ffffff'],
        [sx + 4, pTop + 5, '#f1c40f'],
        [sx + 7, pTop + 7, '#e74c3c'],
        [sx + 4, pTop + 8, '#3498db'],
      ] as [number, number, string][]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (item.id === 'decor_jukebox') {
      // Detailed 2010 Jukebox with glowing neon arch & speaker grille
      const jw = 34;
      const jh = 18;
      const jH = 30;
      drawIsoBox(ctx, sx, sy + 4, jw, jh, jH, '#f1c40f', '#2980b9', '#1f618d');
      drawIsoFaceQuad(ctx, sx, sy + 4, jw, jh, jH, 'left', 0.16, 0.84, 0.12, 0.55, '#f39c12', '#f1c40f');
      drawIsoFaceQuad(ctx, sx, sy + 4, jw, jh, jH, 'left', 0.2, 0.8, 0.62, 0.88, '#dff9fb', '#ffffff');
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵', sx + Math.sin(timeSec * 3) * 4, sy - 34);
    } else if (item.id === 'decor_espresso') {
      // Juice / Espresso dispenser on wooden base
      const ew = 34;
      const eh = 18;
      const eH = 22;
      drawIsoBox(ctx, sx, sy + 4, ew, eh, eH, '#ecf0f1', '#c0392b', '#962d22');
      drawIsoFaceQuad(ctx, sx, sy + 4, ew, eh, eH, 'left', 0.18, 0.82, 0.12, 0.65, '#2c3e50', '#95a5a6');
      drawIsoFaceQuad(ctx, sx, sy + 4, ew, eh, eH, 'left', 0.36, 0.64, 0.18, 0.45, '#ffffff');
      drawIsoFaceQuad(ctx, sx, sy + 4, ew, eh, eH, 'left', 0.72, 0.82, 0.72, 0.82, '#2ecc71');
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☕', sx, sy - 20 + Math.sin(timeSec * 3) * 1.5);
    } else {
      // Animated Chocolate fountain
      drawIsoBox(ctx, sx, sy + 4, 36, 18, 12, '#d4af37', '#b7950b', '#9a7d0a');
      const flow = (timeSec * 10) % 6;
      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 12, 12, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(sx, sy - 21, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Shimmering chocolate drip lines
      ctx.strokeStyle = '#8b4513';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy - 20);
      ctx.lineTo(sx - 6, sy - 13 + flow * 0.4);
      ctx.moveTo(sx + 4, sy - 20);
      ctx.lineTo(sx + 5, sy - 13 + ((flow + 3) % 6) * 0.4);
      ctx.stroke();
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
  isEating = false,
  hairStyle: HairStyle = 'classic',
  mood: 'happy' | 'neutral' | 'impatient' | 'angry' = 'happy',
  labelName?: string,
  carryingTray = false
) {
  const { sx, sy } = gridToScreen(gx, gy, originX, originY);
  const seatDrop = isSeated ? 5 : 0;
  const footY = sy + TILE_H / 2 + 2;
  const eatBob = isEating ? Math.sin(animPhase * 12) * 1.4 : 0;
  const bob = (isWalking ? Math.abs(Math.sin(animPhase * 8)) * 3.5 : 0) - seatDrop + eatBob;

  // Shadow (skip ground shadow when seated on a chair)
  if (!isSeated) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx, footY, 10.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legs + shoes
  const legSwing = isWalking ? Math.sin(animPhase * 8) * 3.2 : 0;
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isSeated) {
    ctx.moveTo(sx - 3.2, footY - 12 - bob);
    ctx.lineTo(sx - 4.2, footY - 5);
    ctx.moveTo(sx + 3.2, footY - 12 - bob);
    ctx.lineTo(sx + 4.2, footY - 5);
  } else {
    ctx.moveTo(sx - 3.2, footY - 12 - bob);
    ctx.lineTo(sx - 4 + legSwing, footY - 2);
    ctx.moveTo(sx + 3.2, footY - 12 - bob);
    ctx.lineTo(sx + 4 - legSwing, footY - 2);
  }
  ctx.stroke();

  // Shoes
  if (!isSeated) {
    ctx.fillStyle = '#1e272e';
    ctx.beginPath();
    ctx.ellipse(sx - 4 + legSwing, footY - 1.5, 2.8, 1.8, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 4 - legSwing, footY - 1.5, 2.8, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arms (behind/beside torso)
  const armSwing = isWalking ? Math.sin(animPhase * 8) * 3 : 0;
  ctx.strokeStyle = shadeColor(shirtColor, -14);
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  // Left arm
  ctx.moveTo(sx - 7.5, footY - 23 - bob);
  ctx.lineTo(sx - 10.5, footY - 14 - bob - armSwing);
  // Right arm (raised if carrying tray!)
  if (carryingTray) {
    ctx.moveTo(sx + 7.5, footY - 23 - bob);
    ctx.lineTo(sx + 13, footY - 25 - bob);
  } else {
    ctx.moveTo(sx + 7.5, footY - 23 - bob);
    ctx.lineTo(sx + 10.5, footY - 14 - bob + armSwing);
  }
  ctx.stroke();

  // Hands
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(sx - 10.5, footY - 14 - bob - armSwing, 2.1, 0, Math.PI * 2);
  if (carryingTray) {
    ctx.arc(sx + 13, footY - 25 - bob, 2.1, 0, Math.PI * 2);
  } else {
    ctx.arc(sx + 10.5, footY - 14 - bob + armSwing, 2.1, 0, Math.PI * 2);
  }
  ctx.fill();

  // Torso (Chibi jacket/shirt)
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  ctx.roundRect(sx - 8.5, footY - 26 - bob, 17, 16, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Shirt collar
  ctx.fillStyle = role === 'waiter' ? '#ffffff' : shadeColor(shirtColor, 26);
  ctx.beginPath();
  ctx.moveTo(sx - 4, footY - 26 - bob);
  ctx.lineTo(sx, footY - 22 - bob);
  ctx.lineTo(sx + 4, footY - 26 - bob);
  ctx.closePath();
  ctx.fill();

  if (role === 'chef') {
    // White chef apron + pocket + buttons
    ctx.fillStyle = '#fdfefe';
    ctx.beginPath();
    ctx.roundRect(sx - 5.5, footY - 21 - bob, 11, 11, 2);
    ctx.fill();
    ctx.strokeStyle = '#d5dbdb';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Red neckerchief
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(sx - 4, footY - 25.5 - bob);
    ctx.lineTo(sx, footY - 22 - bob);
    ctx.lineTo(sx + 4, footY - 25.5 - bob);
    ctx.closePath();
    ctx.fill();
  } else if (role === 'waiter') {
    // Waiter apron + red bow tie
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(sx - 5.5, footY - 17 - bob, 11, 7, 2);
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(sx - 3.5, footY - 24.5 - bob);
    ctx.lineTo(sx, footY - 23 - bob);
    ctx.lineTo(sx - 3.5, footY - 21.5 - bob);
    ctx.moveTo(sx + 3.5, footY - 24.5 - bob);
    ctx.lineTo(sx, footY - 23 - bob);
    ctx.lineTo(sx + 3.5, footY - 21.5 - bob);
    ctx.fill();
  }

  // Silver serving tray when carrying food
  if (carryingTray) {
    ctx.fillStyle = '#ecf0f1';
    ctx.beginPath();
    ctx.ellipse(sx + 13, footY - 27 - bob, 7.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#95a5a6';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Head (Chibi proportion)
  const headY = footY - 34.5 - bob;
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(sx, headY, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Subtle rosy cheeks
  ctx.fillStyle = 'rgba(255, 118, 117, 0.28)';
  ctx.beginPath();
  ctx.ellipse(sx - 5.2, headY + 2, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(sx + 5.2, headY + 2, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Expressive Eyes with white highlight
  ctx.fillStyle = '#1e272e';
  ctx.beginPath();
  ctx.arc(sx - 3.4, headY - 0.5, 1.7, 0, Math.PI * 2);
  ctx.arc(sx + 3.4, headY - 0.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx - 3.9, headY - 1.1, 0.6, 0, Math.PI * 2);
  ctx.arc(sx + 2.9, headY - 1.1, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Mouth / Mood expression
  ctx.strokeStyle = '#6c3428';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (isEating) {
    ctx.fillStyle = '#c0392b';
    ctx.arc(sx, headY + 3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === 'angry') {
    // Angry eyebrows + frown
    ctx.moveTo(sx - 5, headY - 3.2);
    ctx.lineTo(sx - 1.8, headY - 2.2);
    ctx.moveTo(sx + 5, headY - 3.2);
    ctx.lineTo(sx + 1.8, headY - 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, headY + 5, 2.3, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (mood === 'impatient') {
    ctx.moveTo(sx - 2.2, headY + 3.8);
    ctx.lineTo(sx + 2.2, headY + 3.8);
    ctx.stroke();
  } else {
    // Happy smile
    ctx.arc(sx, headY + 2.6, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // Hair styles (drawn over top of head, under chef hat if chef)
  ctx.fillStyle = hairColor;
  if (hairStyle === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(sx - 9.5, headY - 2);
    ctx.lineTo(sx - 7, headY - 12);
    ctx.lineTo(sx - 2.5, headY - 9);
    ctx.lineTo(sx, headY - 14);
    ctx.lineTo(sx + 3, headY - 9);
    ctx.lineTo(sx + 7.5, headY - 12);
    ctx.lineTo(sx + 9.5, headY - 2);
    ctx.arc(sx, headY - 2, 9.5, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
  } else if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.arc(sx, headY - 2, 10, Math.PI * 0.9, Math.PI * 0.1);
    ctx.lineTo(sx + 10.2, headY + 6);
    ctx.lineTo(sx + 7.5, headY + 6);
    ctx.lineTo(sx + 7.5, headY - 1);
    ctx.lineTo(sx - 7.5, headY - 1);
    ctx.lineTo(sx - 7.5, headY + 6);
    ctx.lineTo(sx - 10.2, headY + 6);
    ctx.closePath();
    ctx.fill();
  } else if (hairStyle === 'ponytail') {
    // Side ponytail
    ctx.beginPath();
    ctx.ellipse(sx + 9.5, headY - 2, 3.5, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, headY - 2.5, 9.6, Math.PI, 0);
    ctx.fill();
  } else if (hairStyle === 'curly') {
    for (const [cx, cy, r] of [
      [-6.5, -7, 4.2],
      [0, -9, 4.8],
      [6.5, -7, 4.2],
      [-8.5, -2.5, 3.6],
      [8.5, -2.5, 3.6],
    ]) {
      ctx.beginPath();
      ctx.arc(sx + cx, headY + cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Classic bangs
    ctx.beginPath();
    ctx.arc(sx, headY - 2.5, 9.6, Math.PI, 0);
    ctx.fill();
  }

  // Chef Hat (pleated toque on top)
  if (role === 'chef') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(sx - 7.5, headY - 16, 15, 9, 3);
    ctx.arc(sx - 3.5, headY - 17, 5, 0, Math.PI * 2);
    ctx.arc(sx + 3.5, headY - 17, 5, 0, Math.PI * 2);
    ctx.arc(sx, headY - 19, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Staff name badge under feet
  if (labelName) {
    ctx.font = 'bold 9px Nunito, sans-serif';
    ctx.textAlign = 'center';
    const textW = Math.min(72, ctx.measureText(labelName).width + 8);
    ctx.fillStyle = 'rgba(44, 24, 16, 0.72)';
    ctx.beginPath();
    ctx.roundRect(sx - textW / 2, footY + 3, textW, 13, 6);
    ctx.fill();
    ctx.fillStyle = '#fff8ee';
    ctx.fillText(labelName, sx, footY + 12.5);
  }

  // Thought / carried item bubble
  if (bubbleText) {
    const bubbleY = headY - (role === 'chef' ? 35 : 27);
    ctx.fillStyle = bubbleBg;
    ctx.beginPath();
    ctx.roundRect(sx - 16, bubbleY, 32, 20, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2d3436';
    ctx.fillText(bubbleText, sx, bubbleY + 14.5);
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
      c.state === 'leaving' && c.mood === 'happy' ? '❤️' : undefined,
      '#ffffff',
      false,
      false,
      c.hairStyle ?? 'classic',
      c.mood
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
          isEating,
          c.hairStyle ?? 'classic',
          c.mood
        ),
    });
  }

  for (const s of staff) {
    const carried = getRecipeById(s.carryingRecipeId);
    const defaultShirt = s.role === 'chef' ? '#ffffff' : '#2c3e50';
    drawables.push({
      depth: s.x + s.y + 0.22,
      draw: () =>
        drawCharacter(
          ctx,
          s.x,
          s.y,
          s.skinColor ?? '#f5cba7',
          s.shirtColor ?? defaultShirt,
          s.hairColor ?? '#4a235a',
          originX,
          originY,
          s.animPhase,
          s.path.length > 0,
          s.role,
          carried ? carried.emoji : undefined,
          '#ffffff',
          false,
          false,
          s.hairStyle ?? 'classic',
          'happy',
          s.name,
          Boolean(carried)
        ),
    });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) {
    d.draw();
  }

  // Particles (steam, smoke, sparkle stars, hearts)
  for (const p of particles) {
    const { sx, sy } = gridToScreen(p.gridX, p.gridY, originX, originY);
    const alpha = Math.max(0, p.life / p.maxLife);
    const py = sy - p.offsetZ;
    ctx.globalAlpha = alpha;
    if (p.kind === 'heart') {
      ctx.font = `${Math.round(p.size * 3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.fillText('♥', sx, py);
    } else if (p.kind === 'sparkle') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const r = p.size * 1.4;
      ctx.moveTo(sx, py - r);
      ctx.lineTo(sx + r * 0.35, py - r * 0.35);
      ctx.lineTo(sx + r, py);
      ctx.lineTo(sx + r * 0.35, py + r * 0.35);
      ctx.lineTo(sx, py + r);
      ctx.lineTo(sx - r * 0.35, py + r * 0.35);
      ctx.lineTo(sx - r, py);
      ctx.lineTo(sx - r * 0.35, py - r * 0.35);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
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

export function renderCharacterPreview(
  canvas: HTMLCanvasElement,
  opts: {
    role: 'chef' | 'waiter';
    skinColor: string;
    shirtColor: string;
    hairColor: string;
    hairStyle: HairStyle;
  },
  width = 84,
  height = 90
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

  const scale = 1.25;
  ctx.scale(scale, scale);
  const cx = width / (2 * scale);
  const cy = (height * 0.56) / scale;

  drawCharacter(
    ctx,
    0,
    0,
    opts.skinColor,
    opts.shirtColor,
    opts.hairColor,
    cx,
    cy,
    0,
    false,
    opts.role,
    undefined,
    '#ffffff',
    false,
    false,
    opts.hairStyle,
    'happy',
    undefined,
    opts.role === 'waiter'
  );
  ctx.restore();
}
