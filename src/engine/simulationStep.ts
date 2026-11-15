import { getCatalogItem } from '../data/catalog';
import { RECIPES, getRecipeById } from '../data/recipes';
import { soundEngine } from '../audio/soundEngine';
import {
  Customer,
  FloatingText,
  GameState,
  Particle,
  PlacedFurniture,
  StaffMember,
} from '../types/game';
import { xpForNextLevel } from './gameLogic';
import { findPath } from './isoMath';

const CUSTOMER_NAMES = [
  'Lucas', 'Mariana', 'Pedro', 'Camila', 'Rafael', 'Beatriz', 'Thiago', 'Larissa', 'Bruno', 'Amanda',
];
const SKIN_TONES = ['#f5cba7', '#e0ac69', '#8d5524', '#c68642', '#ffdbac'];
const HAIR_COLORS = ['#2c3e50', '#5c3317', '#d4ac0d', '#922b21', '#1b2631'];
const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e84393'];

let uidCounter = 1;
export function nextId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}`;
}

export interface SimulationEffects {
  particles: Particle[];
  floatingTexts: FloatingText[];
  spawnTimer: number;
  levelUpBanner: number | null;
}

export function addXpAndCoins(
  state: GameState,
  coinsDelta: number,
  xpDelta: number,
  effects: SimulationEffects,
  gx?: number,
  gy?: number
): void {
  if (coinsDelta > 0) {
    state.coins += coinsDelta;
    state.stats.totalCoinsEarned += coinsDelta;
    if (gx !== undefined && gy !== undefined) {
      effects.floatingTexts.push({
        id: nextId('ft'),
        gridX: gx,
        gridY: gy,
        text: `+${coinsDelta} 🪙`,
        color: '#ffd700',
        life: 1.4,
        maxLife: 1.4,
      });
    }
  }
  if (xpDelta > 0) {
    state.xp += xpDelta;
    while (state.xp >= xpForNextLevel(state.level)) {
      state.xp -= xpForNextLevel(state.level);
      state.level += 1;
      state.cash += 1;
      state.coins += 100;
      effects.levelUpBanner = state.level;
      soundEngine.playLevelUp();
    }
  }
  syncQuests(state);
}

export function syncQuests(state: GameState): void {
  for (const q of state.quests) {
    if (q.claimed) continue;
    switch (q.metric) {
      case 'dishes_cooked':
        q.currentCount = state.stats.dishesCooked;
        break;
      case 'customers_served':
        q.currentCount = state.stats.customersServed;
        break;
      case 'tables_cleaned':
        q.currentCount = state.stats.tablesCleaned;
        break;
      case 'furniture_bought':
        q.currentCount = state.stats.furnitureBought;
        break;
      case 'neighbors_helped':
        q.currentCount = state.stats.neighborsHelped;
        break;
      case 'level_reached':
        q.currentCount = state.level;
        break;
    }
  }
}

function moveAlongPath(
  entity: { x: number; y: number; path: { x: number; y: number }[]; animPhase: number },
  dt: number,
  speedTilesPerSec: number
): boolean {
  if (entity.path.length === 0) return true;
  const target = entity.path[0];
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);
  const step = speedTilesPerSec * dt;

  entity.animPhase += dt;
  if (dist <= step) {
    entity.x = target.x;
    entity.y = target.y;
    entity.path.shift();
  } else {
    entity.x += (dx / dist) * step;
    entity.y += (dy / dist) * step;
  }
  return entity.path.length === 0;
}

function stepStoves(state: GameState, dt: number, effects: SimulationEffects): void {
  for (const f of state.furniture) {
    if (!f.stove) continue;
    const cat = getCatalogItem(f.catalogId);
    const speedMult = cat?.speedMultiplier ?? 1;

    if (f.stove.status === 'cooking' && f.stove.recipeId) {
      const recipe = getRecipeById(f.stove.recipeId);
      if (!recipe) continue;
      f.stove.progress += (dt * speedMult) / recipe.cookTimeSec;

      if (Math.random() < dt * 2.5) {
        effects.particles.push({
          id: nextId('p'),
          gridX: f.x + (Math.random() - 0.5) * 0.25,
          gridY: f.y + (Math.random() - 0.5) * 0.25,
          offsetZ: 28,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          vz: 18,
          color: 'rgba(255,255,255,0.75)',
          size: 3 + Math.random() * 2,
          life: 0.9,
          maxLife: 0.9,
          kind: 'steam',
        });
      }

      if (f.stove.progress >= 1) {
        f.stove.progress = 1;
        f.stove.status = 'ready';
        f.stove.burnProgress = 0;
        soundEngine.playCookReady();
      }
    } else if (f.stove.status === 'ready') {
      // Forgiving 50s window before burning
      f.stove.burnProgress += dt / 50;
      if (f.stove.burnProgress >= 1) {
        f.stove.status = 'burnt';
        f.stove.burnProgress = 1;
        soundEngine.playBurnt();
      }
    } else if (f.stove.status === 'burnt') {
      if (Math.random() < dt * 3) {
        effects.particles.push({
          id: nextId('p'),
          gridX: f.x,
          gridY: f.y,
          offsetZ: 28,
          vx: 0,
          vy: 0,
          vz: 20,
          color: 'rgba(60,60,60,0.6)',
          size: 4,
          life: 1,
          maxLife: 1,
          kind: 'smoke',
        });
      }
    }
  }
}

function stepCustomers(state: GameState, dt: number, effects: SimulationEffects): void {
  const doorX = state.gridSize - 1;
  const doorY = Math.floor(state.gridSize / 2);
  const hasJukebox = state.furniture.some((f) => f.catalogId === 'decor_jukebox');

  // Spawn customers
  effects.spawnTimer -= dt;
  const freeTables = state.furniture.filter(
    (f) => f.table && !f.table.occupiedByCustomerId && !f.table.dirty
  );
  const maxCustomers = state.furniture.filter((f) => f.table).length + 1;

  if (effects.spawnTimer <= 0 && freeTables.length > 0 && state.customers.length < maxCustomers) {
    const interval = Math.max(2.2, 6.0 - state.buzz * 0.035);
    effects.spawnTimer = interval;

    const chosenTable = freeTables[Math.floor(Math.random() * freeTables.length)];
    const availableCounters = state.furniture.filter(
      (f) => f.counter && f.counter.portions > 0 && f.counter.recipeId
    );
    const unlocked = RECIPES.filter((r) => r.unlockLevel <= state.level);
    const desired =
      availableCounters.length > 0
        ? availableCounters[Math.floor(Math.random() * availableCounters.length)].counter!.recipeId
        : unlocked[Math.floor(Math.random() * unlocked.length)].id;

    const customer: Customer = {
      id: nextId('cust'),
      name: CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)],
      skinColor: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      shirtColor: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
      x: doorX,
      y: doorY,
      path: findPath(doorX, doorY, chosenTable.x, chosenTable.y, state.gridSize, state.furniture, true),
      state: 'walking_to_seat',
      targetTableId: chosenTable.instanceId,
      desiredRecipeId: desired,
      waitTimer: hasJukebox ? 38 : 28,
      maxWaitTimer: hasJukebox ? 38 : 28,
      eatTimer: 4.5,
      mood: 'happy',
      animPhase: 0,
    };

    chosenTable.table!.occupiedByCustomerId = customer.id;
    state.customers.push(customer);
  }

  // Update each customer
  const toRemove = new Set<string>();

  for (const c of state.customers) {
    if (c.state === 'walking_to_seat') {
      const arrived = moveAlongPath(c, dt, 2.5);
      if (arrived) {
        c.state = 'waiting_food';
      }
    } else if (c.state === 'waiting_food') {
      c.waitTimer -= dt;
      const ratio = c.waitTimer / c.maxWaitTimer;
      c.mood = ratio > 0.5 ? 'happy' : ratio > 0.22 ? 'impatient' : 'angry';

      if (c.waitTimer <= 0) {
        // Leave angry
        const table = state.furniture.find((f) => f.instanceId === c.targetTableId);
        if (table?.table) {
          table.table.occupiedByCustomerId = null;
        }
        state.rating = Math.max(0, Math.round((state.rating - 4) * 10) / 10);
        c.state = 'leaving';
        c.mood = 'angry';
        c.path = findPath(c.x, c.y, doorX, doorY, state.gridSize, state.furniture, true);
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        const table = state.furniture.find((f) => f.instanceId === c.targetTableId);
        const recipe = getRecipeById(table?.table?.servedRecipeId ?? c.desiredRecipeId);
        const isVipTable = table?.catalogId === 'table_gold';
        const tip = isVipTable ? 6 : Math.floor(state.buzz / 25);
        const earned = (recipe?.sellPrice ?? 15) + tip;
        const xpEarned = recipe?.xpPerServe ?? 4;

        if (table?.table) {
          table.table.occupiedByCustomerId = null;
          table.table.hasFood = false;
          table.table.servedRecipeId = null;
          table.table.dirty = true;
        }

        state.stats.customersServed += 1;
        state.rating = Math.min(105, Math.round((state.rating + 1.5) * 10) / 10);
        addXpAndCoins(state, earned, xpEarned, effects, c.x, c.y);
        soundEngine.playCoin();

        c.state = 'leaving';
        c.mood = 'happy';
        c.path = findPath(c.x, c.y, doorX, doorY, state.gridSize, state.furniture, true);
      }
    } else if (c.state === 'leaving') {
      const arrived = moveAlongPath(c, dt, 2.7);
      if (arrived) {
        toRemove.add(c.id);
      }
    }
  }

  if (toRemove.size > 0) {
    state.customers = state.customers.filter((c) => !toRemove.has(c.id));
  }
}

function stepStaff(state: GameState, dt: number, effects: SimulationEffects): void {
  for (const s of state.staff) {
    if (s.state === 'walking') {
      const arrived = moveAlongPath(s, dt, 3.3);
      if (arrived) {
        handleStaffArrival(state, s, effects);
      }
      continue;
    }

    // Idle: pick a task
    if (s.role === 'chef') {
      assignChefTask(state, s);
    } else {
      assignWaiterTask(state, s);
    }
  }
}

function assignChefTask(state: GameState, chef: StaffMember): void {
  // Look for ready stove that can be moved to an available counter
  const readyStove = state.furniture.find((f) => f.stove?.status === 'ready' && f.stove.recipeId);
  if (!readyStove) return;

  const hasCounterSpace = state.furniture.some(
    (f) =>
      f.counter &&
      (f.counter.portions === 0 ||
        (f.counter.recipeId === readyStove.stove!.recipeId && f.counter.portions < f.counter.maxPortions))
  );
  if (!hasCounterSpace) return;

  chef.targetFurnitureId = readyStove.instanceId;
  chef.taskType = 'stock';
  chef.state = 'walking';
  chef.path = findPath(chef.x, chef.y, readyStove.x, readyStove.y, state.gridSize, state.furniture, true);
}

function assignWaiterTask(state: GameState, waiter: StaffMember): void {
  // Priority 1: serve waiting customer if counter has food
  const waitingCustomer = state.customers.find((c) => c.state === 'waiting_food' && c.targetTableId);
  if (waitingCustomer) {
    const matchingCounter =
      state.furniture.find(
        (f) => f.counter && f.counter.portions > 0 && f.counter.recipeId === waitingCustomer.desiredRecipeId
      ) ?? state.furniture.find((f) => f.counter && f.counter.portions > 0);

    if (matchingCounter) {
      waiter.targetFurnitureId = matchingCounter.instanceId;
      waiter.taskType = 'serve';
      waiter.state = 'walking';
      waiter.path = findPath(
        waiter.x,
        waiter.y,
        matchingCounter.x,
        matchingCounter.y,
        state.gridSize,
        state.furniture,
        true
      );
      return;
    }
  }

  // Priority 2: clean dirty table
  const dirtyTable = state.furniture.find((f) => f.table?.dirty && !f.table.occupiedByCustomerId);
  if (dirtyTable) {
    waiter.targetFurnitureId = dirtyTable.instanceId;
    waiter.taskType = 'clean';
    waiter.state = 'walking';
    waiter.path = findPath(waiter.x, waiter.y, dirtyTable.x, dirtyTable.y, state.gridSize, state.furniture, true);
  }
}

function handleStaffArrival(
  state: GameState,
  s: StaffMember,
  effects: SimulationEffects
): void {
  const target = state.furniture.find((f) => f.instanceId === s.targetFurnitureId);

  if (s.role === 'chef' && s.taskType === 'stock') {
    if (!s.carryingRecipeId && target?.stove?.status === 'ready' && target.stove.recipeId) {
      const recipeId = target.stove.recipeId;
      const recipe = getRecipeById(recipeId);
      target.stove.status = 'idle';
      target.stove.recipeId = null;
      target.stove.progress = 0;
      target.stove.burnProgress = 0;

      state.stats.dishesCooked += 1;
      state.recipeMastery[recipeId] = (state.recipeMastery[recipeId] ?? 0) + 1;
      addXpAndCoins(state, 0, recipe?.xpPerCook ?? 10, effects, target.x, target.y);

      const counter =
        state.furniture.find(
          (f) => f.counter && f.counter.recipeId === recipeId && f.counter.portions > 0
        ) ?? state.furniture.find((f) => f.counter && f.counter.portions === 0);

      if (counter) {
        s.carryingRecipeId = recipeId;
        s.targetFurnitureId = counter.instanceId;
        s.path = findPath(s.x, s.y, counter.x, counter.y, state.gridSize, state.furniture, true);
        return;
      }
    } else if (s.carryingRecipeId && target?.counter) {
      const recipe = getRecipeById(s.carryingRecipeId);
      const portions = recipe?.portions ?? 8;
      if (target.counter.portions === 0 || target.counter.recipeId === s.carryingRecipeId) {
        target.counter.recipeId = s.carryingRecipeId;
        target.counter.portions += portions;
        target.counter.maxPortions = Math.max(target.counter.maxPortions, target.counter.portions);
      }
      s.carryingRecipeId = null;
    }
  } else if (s.role === 'waiter' && s.taskType === 'serve') {
    if (!s.carryingRecipeId && target?.counter && target.counter.portions > 0 && target.counter.recipeId) {
      const waitingCustomer =
        state.customers.find(
          (c) => c.state === 'waiting_food' && c.desiredRecipeId === target.counter!.recipeId
        ) ?? state.customers.find((c) => c.state === 'waiting_food');

      if (waitingCustomer && waitingCustomer.targetTableId) {
        const table = state.furniture.find((f) => f.instanceId === waitingCustomer.targetTableId);
        if (table) {
          target.counter.portions -= 1;
          s.carryingRecipeId = target.counter.recipeId;
          if (target.counter.portions <= 0) {
            target.counter.recipeId = null;
            target.counter.maxPortions = 0;
          }
          s.targetFurnitureId = table.instanceId;
          s.path = findPath(s.x, s.y, table.x, table.y, state.gridSize, state.furniture, true);
          return;
        }
      }
    } else if (s.carryingRecipeId && target?.table) {
      const customer = state.customers.find(
        (c) => c.targetTableId === target.instanceId && c.state === 'waiting_food'
      );
      if (customer) {
        target.table.hasFood = true;
        target.table.servedRecipeId = s.carryingRecipeId;
        customer.state = 'eating';
      }
      s.carryingRecipeId = null;
    }
  } else if (s.role === 'waiter' && s.taskType === 'clean') {
    if (target?.table?.dirty && !target.table.occupiedByCustomerId) {
      target.table.dirty = false;
      state.stats.tablesCleaned += 1;
      addXpAndCoins(state, 2, 2, effects, target.x, target.y);
      soundEngine.playClean();
    }
  }

  s.state = 'idle';
  s.targetFurnitureId = null;
  s.taskType = null;
}

export function stepSimulation(
  state: GameState,
  rawDt: number,
  effects: SimulationEffects
): void {
  const dt = rawDt * state.speed;

  // Update particles & floating texts even when paused? Only when speed > 0 or always smoothly
  for (const p of effects.particles) {
    p.gridX += p.vx * rawDt;
    p.gridY += p.vy * rawDt;
    p.offsetZ += p.vz * rawDt;
    p.life -= rawDt;
  }
  effects.particles = effects.particles.filter((p) => p.life > 0);

  for (const ft of effects.floatingTexts) {
    ft.life -= rawDt;
  }
  effects.floatingTexts = effects.floatingTexts.filter((ft) => ft.life > 0);

  if (state.speed === 0) return;

  stepStoves(state, dt, effects);
  stepCustomers(state, dt, effects);
  stepStaff(state, dt, effects);
}

export function collectReadyStoveDirect(
  state: GameState,
  stove: PlacedFurniture,
  effects: SimulationEffects
): boolean {
  if (!stove.stove || stove.stove.status !== 'ready' || !stove.stove.recipeId) return false;
  const recipeId = stove.stove.recipeId;
  const recipe = getRecipeById(recipeId);

  const counter =
    state.furniture.find(
      (f) => f.counter && f.counter.recipeId === recipeId && f.counter.portions > 0
    ) ?? state.furniture.find((f) => f.counter && f.counter.portions === 0);

  if (!counter?.counter) return false;

  stove.stove.status = 'idle';
  stove.stove.recipeId = null;
  stove.stove.progress = 0;
  stove.stove.burnProgress = 0;

  counter.counter.recipeId = recipeId;
  counter.counter.portions += recipe?.portions ?? 8;
  counter.counter.maxPortions = Math.max(counter.counter.maxPortions, counter.counter.portions);

  state.stats.dishesCooked += 1;
  state.recipeMastery[recipeId] = (state.recipeMastery[recipeId] ?? 0) + 1;
  addXpAndCoins(state, 0, recipe?.xpPerCook ?? 10, effects, stove.x, stove.y);
  soundEngine.playCookReady();
  return true;
}
