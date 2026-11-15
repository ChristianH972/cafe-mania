import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from '../data/catalog';
import { getRecipeById } from '../data/recipes';
import {
  Customer,
  FloatingText,
  Particle,
  PlacedFurniture,
  StaffMember,
} from '../types/game';
import { TILE_H, TILE_W, gridToScreen } from './isoMath';

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

function drawWalls(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  gridSize: number,
  wallStyleId: string
) {
  const wallStyle = WALL_STYLES.find((w) => w.id === wallStyleId) ?? WALL_STYLES[0];
  const wallH = 84;

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

  // Right back wall (along y = 0, x from 0 to gridSize)
  const botRight = gridToScreen(gridSize, 0, originX, originY);
  ctx.beginPath();
  ctx.moveTo(topLeft.sx, topLeft.sy - wallH);
  ctx.lineTo(botRight.sx, botRight.sy - wallH);
  ctx.lineTo(botRight.sx, botRight.sy);
  ctx.lineTo(topLeft.sx, topLeft.sy);
  ctx.closePath();
  ctx.fillStyle = shadeColor(wallStyle.primary.startsWith('#') ? wallStyle.primary : '#fbe6c2', -10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,40,15,0.25)';
  ctx.stroke();

  // Right wall trim
  ctx.beginPath();
  ctx.moveTo(topLeft.sx, topLeft.sy - 12);
  ctx.lineTo(botRight.sx, botRight.sy - 12);
  ctx.lineTo(botRight.sx, botRight.sy);
  ctx.lineTo(topLeft.sx, topLeft.sy);
  ctx.closePath();
  ctx.fillStyle = wallStyle.secondary;
  ctx.fill();

  // Cute windows on right wall
  for (const wx of [2.5, 6.5]) {
    const p1 = gridToScreen(wx, 0, originX, originY);
    const p2 = gridToScreen(wx + 1.4, 0, originX, originY);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy - 64);
    ctx.lineTo(p2.sx, p2.sy - 64);
    ctx.lineTo(p2.sx, p2.sy - 26);
    ctx.lineTo(p1.sx, p1.sy - 26);
    ctx.closePath();
    ctx.fillStyle = '#bfe9ff';
    ctx.fill();
    ctx.strokeStyle = '#fff8ee';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Menu sign on left wall
  const m1 = gridToScreen(0, 3.2, originX, originY);
  const m2 = gridToScreen(0, 5.2, originX, originY);
  ctx.beginPath();
  ctx.moveTo(m1.sx, m1.sy - 62);
  ctx.lineTo(m2.sx, m2.sy - 62);
  ctx.lineTo(m2.sx, m2.sy - 28);
  ctx.lineTo(m1.sx, m1.sy - 28);
  ctx.closePath();
  ctx.fillStyle = '#3b2416';
  ctx.fill();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawFurnitureItem(
  ctx: CanvasRenderingContext2D,
  f: PlacedFurniture,
  originX: number,
  originY: number,
  timeSec: number,
  isSelected: boolean,
  isNeighborView?: boolean
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

    // Burners on top
    const topCenterY = sy + 4 - 26 + (TILE_H * 0.78) / 2;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(sx - 8, topCenterY - 2, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 8, topCenterY + 2, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

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

    // Cooking pan & status
    if (f.stove && f.stove.status !== 'idle') {
      const recipe = getRecipeById(f.stove.recipeId);
      // Pan
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.ellipse(sx + 2, topCenterY - 1, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();

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
    drawIsoBox(
      ctx,
      sx,
      sy + 4,
      TILE_W * 0.82,
      TILE_H * 0.82,
      24,
      item.accentColor,
      item.color,
      shadeColor(item.color, -24)
    );

    if (f.counter && f.counter.portions > 0 && f.counter.recipeId) {
      const recipe = getRecipeById(f.counter.recipeId);
      const topY = sy + 4 - 24 + (TILE_H * 0.82) / 2;
      // Serving tray
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(sx, topY, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dcdde1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(recipe?.emoji ?? '🍽️', sx, topY + 3);

      // Portion badge
      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.roundRect(sx + 8, topY - 18, 22, 14, 7);
      ctx.fill();
      ctx.font = 'bold 10px Nunito, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${f.counter.portions}`, sx + 19, topY - 8);
    }
  } else if (item.kind === 'table') {
    // Two cute chairs flanking the table (rotates with f.rotation)
    const chairOffsets =
      f.rotation % 2 === 0
        ? [
            { dx: -16, dy: -6 },
            { dx: 16, dy: 6 },
          ]
        : [
            { dx: 16, dy: -6 },
            { dx: -16, dy: 6 },
          ];
    for (const c of chairOffsets) {
      ctx.fillStyle = '#8d5524';
      ctx.beginPath();
      ctx.ellipse(sx + c.dx, sy + TILE_H / 2 + c.dy - 6, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Table pedestal
    ctx.fillStyle = '#5c3c24';
    ctx.fillRect(sx - 3, sy + 6, 6, 12);

    // Tabletop
    const topY = sy - 6;
    drawIsoDiamond(
      ctx,
      sx,
      topY,
      TILE_W * 0.68,
      TILE_H * 0.68,
      item.accentColor,
      item.color,
      2
    );

    if (item.id === 'table_vip') {
      // Checkered center accent
      drawIsoDiamond(
        ctx,
        sx,
        topY + 4,
        TILE_W * 0.34,
        TILE_H * 0.34,
        '#e74c3c'
      );
    }

    if (f.table?.hasFood && f.table.servedRecipeId) {
      const recipe = getRecipeById(f.table.servedRecipeId);
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(recipe?.emoji ?? '🍽️', sx, topY + 15);
    } else if (f.table?.dirty) {
      // Dirty plates
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath();
      ctx.ellipse(sx - 4, topY + 12, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = Math.sin(timeSec * 6) * 2;
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.roundRect(sx - 20, topY - 18 + pulse, 40, 17, 8);
      ctx.fill();
      ctx.font = 'bold 10px Nunito, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('🧹 LIMPAR', sx, topY - 6 + pulse);
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
  bubbleBg = '#ffffff'
) {
  const { sx, sy } = gridToScreen(gx, gy, originX, originY);
  const footY = sy + TILE_H / 2 + 2;
  const bob = isWalking ? Math.abs(Math.sin(animPhase * 8)) * 4 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(sx, footY, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  const legSwing = isWalking ? Math.sin(animPhase * 8) * 3 : 0;
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - 3, footY - 12 - bob);
  ctx.lineTo(sx - 4 + legSwing, footY - 2);
  ctx.moveTo(sx + 3, footY - 12 - bob);
  ctx.lineTo(sx + 4 - legSwing, footY - 2);
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
  } = params;

  ctx.clearRect(0, 0, width, height);

  // Warm 2010 background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#9ad7f5');
  bgGrad.addColorStop(0.55, '#d5f0c8');
  bgGrad.addColorStop(1, '#a9df90');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

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

  // Walls
  drawWalls(ctx, originX, originY, gridSize, wallStyleId);

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

  // Welcome door mat at (gridSize - 1, floor(gridSize / 2))
  const doorY = Math.floor(gridSize / 2);
  const doorPos = gridToScreen(gridSize - 1, doorY, originX, originY);
  drawIsoDiamond(ctx, doorPos.sx, doorPos.sy + 3, TILE_W * 0.72, TILE_H * 0.72, '#c0392b', '#f1c40f', 2);
  ctx.font = 'bold 9px Nunito, sans-serif';
  ctx.fillStyle = '#fff8ee';
  ctx.textAlign = 'center';
  ctx.fillText('ABERTO', doorPos.sx, doorPos.sy + TILE_H / 2 + 5);

  // Hover tile highlight
  if (hoverTile && hoverTile.x >= 0 && hoverTile.y >= 0 && hoverTile.x < gridSize && hoverTile.y < gridSize) {
    const { sx, sy } = gridToScreen(hoverTile.x, hoverTile.y, originX, originY);
    const occupied = furniture.some((f) => f.x === hoverTile.x && f.y === hoverTile.y);
    const highlightColor =
      placingCatalogId || editMode
        ? occupied
          ? 'rgba(231, 76, 60, 0.45)'
          : 'rgba(46, 204, 113, 0.45)'
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
          params.isNeighborView
        ),
    });
  }

  for (const c of customers) {
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

    drawables.push({
      depth: c.x + c.y + 0.2,
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
          bubbleBg
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

  void topCorner;
}
