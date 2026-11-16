import { getCatalogItem } from '../data/catalog';
import { getRecipeById } from '../data/recipes';
import { INITIAL_NEIGHBORS, INITIAL_QUESTS } from '../data/questsAndNeighbors';
import { GameState, OfflineReport, PlacedFurniture } from '../types/game';

const STORAGE_KEY = 'cafe_mania_2010_save_v2';

export function xpForNextLevel(level: number): number {
  return Math.floor(140 * Math.pow(1.45, level - 1));
}

export function computeBuzz(furniture: PlacedFurniture[]): number {
  let buzz = 25;
  for (const f of furniture) {
    const item = getCatalogItem(f.catalogId);
    if (item) buzz += item.buzzBonus;
  }
  return Math.min(100, buzz);
}

export function createInitialState(): GameState {
  const initialFurniture: PlacedFurniture[] = [
    {
      instanceId: 'stove_1',
      catalogId: 'stove_retro',
      x: 1,
      y: 1,
      rotation: 0,
      stove: { status: 'idle', recipeId: null, progress: 0, burnProgress: 0 },
    },
    {
      instanceId: 'stove_2',
      catalogId: 'stove_retro',
      x: 2,
      y: 1,
      rotation: 0,
      stove: { status: 'cooking', recipeId: 'espresso', progress: 0.35, burnProgress: 0 },
    },
    {
      instanceId: 'counter_1',
      catalogId: 'counter_classic',
      x: 1,
      y: 3,
      rotation: 0,
      counter: { recipeId: 'pao_frances', portions: 6, maxPortions: 6, freshness: 1, spoiled: false },
    },
    {
      instanceId: 'counter_2',
      catalogId: 'counter_classic',
      x: 2,
      y: 3,
      rotation: 0,
      counter: { recipeId: null, portions: 0, maxPortions: 0 },
    },
    {
      instanceId: 'table_1',
      catalogId: 'table_wood',
      x: 3,
      y: 3,
      rotation: 0,
      table: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'chair_1',
      catalogId: 'chair_wood',
      x: 3,
      y: 4,
      rotation: 0,
      chair: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'table_2',
      catalogId: 'table_wood',
      x: 5,
      y: 3,
      rotation: 0,
      table: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'chair_2',
      catalogId: 'chair_wood',
      x: 5,
      y: 4,
      rotation: 0,
      chair: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'table_3',
      catalogId: 'table_wood',
      x: 3,
      y: 5,
      rotation: 0,
      table: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'chair_3',
      catalogId: 'chair_wood',
      x: 4,
      y: 5,
      rotation: 0,
      chair: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
    },
    {
      instanceId: 'decor_1',
      catalogId: 'decor_plant',
      x: 6,
      y: 1,
      rotation: 0,
    },
    {
      instanceId: 'cashier_1',
      catalogId: 'decor_cashier',
      x: 6,
      y: 2,
      rotation: 0,
    },
  ];

  return {
    cafeName: 'Café Mania Retrô',
    coins: 260,
    cash: 6,
    xp: 0,
    level: 1,
    rating: 78,
    buzz: computeBuzz(initialFurniture),
    gridSize: 8,
    floorStyle: 'checker_classic',
    wallStyle: 'cream_classic',
    furniture: initialFurniture,
    customers: [],
    staff: [
      {
        id: 'chef_1',
        role: 'chef',
        name: 'Chef Você',
        x: 3,
        y: 2,
        path: [],
        state: 'idle',
        targetFurnitureId: null,
        carryingRecipeId: null,
        taskType: null,
        animPhase: 0,
      },
      {
        id: 'waiter_1',
        role: 'waiter',
        name: 'Garçom Léo',
        x: 4,
        y: 4,
        path: [],
        state: 'idle',
        targetFurnitureId: null,
        carryingRecipeId: null,
        taskType: null,
        animPhase: 0,
      },
    ],
    recipeMastery: {
      pao_frances: 1,
    },
    quests: INITIAL_QUESTS.map((q) => ({ ...q })),
    neighbors: INITIAL_NEIGHBORS.map((n) => ({ ...n })),
    stats: {
      dishesCooked: 0,
      customersServed: 0,
      tablesCleaned: 0,
      furnitureBought: 0,
      neighborsHelped: 0,
      totalCoinsEarned: 0,
    },
    speed: 1,
    soundEnabled: true,
    lastSavedAt: Date.now(),
    inventory: {},
    spiceCharges: 3,
    lastSpiceAt: Date.now(),
  };
}

export function simulateOfflineProgress(state: GameState, now = Date.now()): OfflineReport | null {
  const elapsedSec = Math.max(0, (now - (state.lastSavedAt || now)) / 1000);
  if (elapsedSec < 20) return null;

  let dishesFinished = 0;
  let customersServed = 0;
  let coinsEarned = 0;
  let xpEarned = 0;

  // 1. Advance cooking stoves
  for (const f of state.furniture) {
    if (f.stove?.status === 'cooking' && f.stove.recipeId) {
      const recipe = getRecipeById(f.stove.recipeId);
      const cat = getCatalogItem(f.catalogId);
      if (recipe) {
        const speed = cat?.speedMultiplier ?? 1;
        f.stove.progress = Math.min(1, f.stove.progress + (elapsedSec * speed) / recipe.cookTimeSec);
        if (f.stove.progress >= 1) {
          f.stove.status = 'ready';
          dishesFinished += 1;
        }
      }
    }
  }

  // 2. Serve offline customers from counters
  const maxOfflineCustomers = Math.floor(elapsedSec / 12);
  let remainingToServe = Math.min(maxOfflineCustomers, 75);

  for (const f of state.furniture) {
    if (!f.counter || f.counter.portions <= 0 || !f.counter.recipeId || remainingToServe <= 0) {
      continue;
    }
    const recipe = getRecipeById(f.counter.recipeId);
    const servedFromThis = Math.min(f.counter.portions, remainingToServe);
    f.counter.portions -= servedFromThis;
    remainingToServe -= servedFromThis;
    customersServed += servedFromThis;

    const earn = servedFromThis * (recipe?.sellPrice ?? 14);
    const xp = servedFromThis * (recipe?.xpPerServe ?? 4);
    coinsEarned += earn;
    xpEarned += xp;

    if (f.counter.portions <= 0) {
      f.counter.recipeId = null;
      f.counter.maxPortions = 0;
    }
  }

  if (coinsEarned > 0 || xpEarned > 0) {
    state.coins += coinsEarned;
    state.stats.totalCoinsEarned += coinsEarned;
    state.stats.customersServed += customersServed;
    state.xp += xpEarned;
    while (state.xp >= xpForNextLevel(state.level)) {
      state.xp -= xpForNextLevel(state.level);
      state.level += 1;
      state.cash += 1;
      state.coins += 100;
    }
  }

  if (dishesFinished === 0 && customersServed === 0) return null;

  return {
    elapsedMinutes: Math.max(1, Math.round(elapsedSec / 60)),
    dishesFinished,
    customersServed,
    coinsEarned,
    xpEarned,
  };
}

export function saveGameState(state: GameState): void {
  try {
    const toSave = { ...state, lastSavedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadGameState(): { state: GameState; offlineReport: OfflineReport | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || !Array.isArray(parsed.furniture)) return null;
    if (typeof parsed.rating !== 'number') parsed.rating = 78;

    // Merge newly added quests into existing saves
    if (Array.isArray(parsed.quests)) {
      for (const iq of INITIAL_QUESTS) {
        if (!parsed.quests.some((q) => q.id === iq.id)) {
          parsed.quests.push({ ...iq });
        }
      }
    }

    // Migrate legacy saves without separate chairs to 1x1 table + chair
    const hasAnyChair = parsed.furniture.some((f) => f.chair);
    if (!hasAnyChair) {
      let idx = 1;
      const occupied = new Set(parsed.furniture.map((f) => `${f.x},${f.y}`));
      const tables = parsed.furniture.filter((f) => f.table);
      for (const tbl of tables) {
        tbl.table!.occupiedByCustomerId = null;
        const dirs = [
          { x: tbl.x, y: tbl.y + 1 },
          { x: tbl.x + 1, y: tbl.y },
          { x: tbl.x - 1, y: tbl.y },
          { x: tbl.x, y: tbl.y - 1 },
        ];
        const spot = dirs.find(
          (d) =>
            d.x >= 0 &&
            d.y >= 0 &&
            d.x < parsed.gridSize &&
            d.y < parsed.gridSize &&
            !occupied.has(`${d.x},${d.y}`)
        );
        if (spot) {
          occupied.add(`${spot.x},${spot.y}`);
          parsed.furniture.push({
            instanceId: `migrated_chair_${idx++}`,
            catalogId: 'chair_wood',
            x: spot.x,
            y: spot.y,
            rotation: 0,
            chair: { occupiedByCustomerId: null, dirty: false, hasFood: false, servedRecipeId: null },
          });
        }
      }
      parsed.customers = [];
    }

    const offlineReport = simulateOfflineProgress(parsed, Date.now());
    return { state: parsed, offlineReport };
  } catch {
    return null;
  }
}

export function resetGameState(): GameState {
  localStorage.removeItem(STORAGE_KEY);
  return createInitialState();
}
