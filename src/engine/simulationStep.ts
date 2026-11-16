import { getCatalogItem } from '../data/catalog';
import { RECIPES, getRecipeById } from '../data/recipes';
import { soundEngine } from '../audio/soundEngine';
import {
  Customer,
  FloatingText,
  GameState,
  HairStyle,
  Particle,
  PlacedFurniture,
  StaffMember,
} from '../types/game';
import { xpForNextLevel } from './gameLogic';
import { findBestAdjacentTile, findPath } from './isoMath';

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

function findAdjacentTable(
  chair: PlacedFurniture,
  furniture: PlacedFurniture[]
): PlacedFurniture | undefined {
  return furniture.find(
    (f) =>
      f.table &&
      Math.abs(f.x - chair.x) + Math.abs(f.y - chair.y) === 1
  );
}

function stepCustomers(state: GameState, dt: number, effects: SimulationEffects): void {
  const doorX = Math.floor(state.gridSize / 2);
  const doorY = 0;
  const hasJukebox = state.furniture.some((f) => f.catalogId === 'decor_jukebox');

  // Spawn customers on free chairs adjacent to tables
  effects.spawnTimer -= dt;
  const validSeats = state.furniture
    .filter((f) => f.chair)
    .map((chair) => ({ chair, table: findAdjacentTable(chair, state.furniture) }))
    .filter((pair): pair is { chair: PlacedFurniture; table: PlacedFurniture } => Boolean(pair.table));

  const freeSeats = validSeats.filter(
    ({ chair }) => !chair.chair!.occupiedByCustomerId && !chair.chair!.dirty
  );
  const maxCustomers = validSeats.length + 1;

  if (effects.spawnTimer <= 0 && freeSeats.length > 0 && state.customers.length < maxCustomers) {
    const interval = Math.max(2.2, 6.0 - state.buzz * 0.035);
    effects.spawnTimer = interval;

    const { chair: chosenChair, table: chosenTable } =
      freeSeats[Math.floor(Math.random() * freeSeats.length)];
    const availableCounters = state.furniture.filter(
      (f) => f.counter && !f.counter.spoiled && f.counter.portions > 0 && f.counter.recipeId
    );
    const unlocked = RECIPES.filter((r) => r.unlockLevel <= state.level);
    const desired =
      availableCounters.length > 0
        ? availableCounters[Math.floor(Math.random() * availableCounters.length)].counter!.recipeId
        : unlocked[Math.floor(Math.random() * unlocked.length)].id;

    const spawnFromLeft = Math.random() < 0.5;
    const sidewalkY = -1;
    const spawnX = spawnFromLeft ? -2.5 : state.gridSize + 2.5;
    const insidePath = findPath(doorX, doorY, chosenChair.x, chosenChair.y, state.gridSize, state.furniture, true);

    const hairStyles: HairStyle[] = ['classic', 'spiky', 'bob', 'ponytail', 'curly'];
    const customer: Customer = {
      id: nextId('cust'),
      name: CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)],
      skinColor: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      shirtColor: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
      hairStyle: hairStyles[Math.floor(Math.random() * hairStyles.length)],
      x: spawnX,
      y: sidewalkY,
      path: [
        { x: doorX, y: sidewalkY },
        { x: doorX, y: doorY },
        ...insidePath,
      ],
      state: 'walking_to_seat',
      targetTableId: chosenTable.instanceId,
      targetChairId: chosenChair.instanceId,
      desiredRecipeId: desired,
      waitTimer: hasJukebox ? 38 : 28,
      maxWaitTimer: hasJukebox ? 38 : 28,
      eatTimer: 4.5,
      mood: 'happy',
      animPhase: 0,
    };

    chosenChair.chair!.occupiedByCustomerId = customer.id;
    state.customers.push(customer);
  }

  // Update each customer
  const toRemove = new Set<string>();

  for (const c of state.customers) {
    if (c.state === 'walking_to_seat') {
      const arrived = moveAlongPath(c, dt, 2.5);
      if (arrived) {
        const chair = state.furniture.find((f) => f.instanceId === c.targetChairId);
        if (chair) {
          c.x = chair.x;
          c.y = chair.y;
        }
        c.state = 'waiting_food';
      }
    } else if (c.state === 'waiting_food') {
      c.waitTimer -= dt;
      const ratio = c.waitTimer / c.maxWaitTimer;
      c.mood = ratio > 0.5 ? 'happy' : ratio > 0.22 ? 'impatient' : 'angry';

      if (c.waitTimer <= 0) {
        // Leave angry
        const chair = state.furniture.find((f) => f.instanceId === c.targetChairId);
        if (chair?.chair) {
          chair.chair.occupiedByCustomerId = null;
        }
        state.rating = Math.max(0, Math.round((state.rating - 4) * 10) / 10);
        c.state = 'leaving';
        c.mood = 'angry';
        const exitX = Math.random() < 0.5 ? -2.5 : state.gridSize + 2.5;
        c.path = [
          ...findPath(c.x, c.y, doorX, doorY, state.gridSize, state.furniture, true),
          { x: doorX, y: -1 },
          { x: exitX, y: -1 },
        ];
      }
    } else if (c.state === 'eating') {
      c.eatTimer -= dt;
      if (c.eatTimer <= 0) {
        const chair = state.furniture.find((f) => f.instanceId === c.targetChairId);
        const table = state.furniture.find((f) => f.instanceId === c.targetTableId);
        const recipe = getRecipeById(chair?.chair?.servedRecipeId ?? c.desiredRecipeId);
        const isVipTable = table?.catalogId === 'table_gold';
        const tip = isVipTable ? 6 : Math.floor(state.buzz / 25);
        const earned = (recipe?.sellPrice ?? 15) + tip;
        const xpEarned = recipe?.xpPerServe ?? 4;

        if (chair?.chair) {
          chair.chair.occupiedByCustomerId = null;
          chair.chair.hasFood = false;
          chair.chair.servedRecipeId = null;
          chair.chair.dirty = true;
        }

        state.stats.customersServed += 1;
        state.rating = Math.min(105, Math.round((state.rating + 1.5) * 10) / 10);
        addXpAndCoins(state, earned, xpEarned, effects, c.x, c.y);
        soundEngine.playCoin();

        // Celebratory heart & golden sparkles
        effects.particles.push(
          {
            id: nextId('p'),
            gridX: c.x,
            gridY: c.y,
            offsetZ: 34,
            vx: 0,
            vy: 0,
            vz: 24,
            color: '#e84393',
            size: 4.5,
            life: 1.0,
            maxLife: 1.0,
            kind: 'heart',
          },
          {
            id: nextId('p'),
            gridX: c.x - 0.15,
            gridY: c.y,
            offsetZ: 26,
            vx: -0.2,
            vy: 0,
            vz: 20,
            color: '#f1c40f',
            size: 3.5,
            life: 0.75,
            maxLife: 0.75,
            kind: 'sparkle',
          },
          {
            id: nextId('p'),
            gridX: c.x + 0.15,
            gridY: c.y,
            offsetZ: 26,
            vx: 0.2,
            vy: 0,
            vz: 22,
            color: '#f1c40f',
            size: 3.5,
            life: 0.75,
            maxLife: 0.75,
            kind: 'sparkle',
          }
        );

        c.state = 'leaving';
        c.mood = 'happy';
        const exitX = Math.random() < 0.5 ? -2.5 : state.gridSize + 2.5;
        c.path = [
          ...findPath(c.x, c.y, doorX, doorY, state.gridSize, state.furniture, true),
          { x: doorX, y: -1 },
          { x: exitX, y: -1 },
        ];
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
      !f.counter.spoiled &&
      (f.counter.portions === 0 ||
        (f.counter.recipeId === readyStove.stove!.recipeId && f.counter.portions < f.counter.maxPortions))
  );
  if (!hasCounterSpace) return;

  chef.targetFurnitureId = readyStove.instanceId;
  chef.taskType = 'stock';
  chef.state = 'walking';
  const adj = findBestAdjacentTile(chef.x, chef.y, readyStove.x, readyStove.y, state.gridSize, state.furniture);
  chef.path = findPath(chef.x, chef.y, adj.x, adj.y, state.gridSize, state.furniture, false);
}

function assignWaiterTask(state: GameState, waiter: StaffMember): void {
  // Priority 1: serve waiting customer if counter has food
  const waitingCustomer = state.customers.find((c) => c.state === 'waiting_food' && c.targetTableId);
  if (waitingCustomer) {
    const matchingCounter =
      state.furniture.find(
        (f) =>
          f.counter &&
          !f.counter.spoiled &&
          f.counter.portions > 0 &&
          f.counter.recipeId === waitingCustomer.desiredRecipeId
      ) ?? state.furniture.find((f) => f.counter && !f.counter.spoiled && f.counter.portions > 0);

    if (matchingCounter) {
      waiter.targetFurnitureId = matchingCounter.instanceId;
      waiter.taskType = 'serve';
      waiter.state = 'walking';
      const adj = findBestAdjacentTile(
        waiter.x,
        waiter.y,
        matchingCounter.x,
        matchingCounter.y,
        state.gridSize,
        state.furniture
      );
      waiter.path = findPath(
        waiter.x,
        waiter.y,
        adj.x,
        adj.y,
        state.gridSize,
        state.furniture,
        false
      );
      return;
    }
  }

  // Priority 2: clean dirty chair/seat
  const dirtySeat = state.furniture.find((f) => f.chair?.dirty && !f.chair.occupiedByCustomerId);
  if (dirtySeat) {
    waiter.targetFurnitureId = dirtySeat.instanceId;
    waiter.taskType = 'clean';
    waiter.state = 'walking';
    const adj = findBestAdjacentTile(
      waiter.x,
      waiter.y,
      dirtySeat.x,
      dirtySeat.y,
      state.gridSize,
      state.furniture
    );
    waiter.path = findPath(waiter.x, waiter.y, adj.x, adj.y, state.gridSize, state.furniture, false);
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
          (f) =>
            f.counter &&
            !f.counter.spoiled &&
            f.counter.recipeId === recipeId &&
            f.counter.portions > 0
        ) ?? state.furniture.find((f) => f.counter && !f.counter.spoiled && f.counter.portions === 0);

      if (counter) {
        s.carryingRecipeId = recipeId;
        s.targetFurnitureId = counter.instanceId;
        const adj = findBestAdjacentTile(s.x, s.y, counter.x, counter.y, state.gridSize, state.furniture);
        s.path = findPath(s.x, s.y, adj.x, adj.y, state.gridSize, state.furniture, false);
        return;
      }
    } else if (s.carryingRecipeId && target?.counter && !target.counter.spoiled) {
      const recipe = getRecipeById(s.carryingRecipeId);
      const portions = recipe?.portions ?? 8;
      if (target.counter.portions === 0 || target.counter.recipeId === s.carryingRecipeId) {
        target.counter.recipeId = s.carryingRecipeId;
        target.counter.portions += portions;
        target.counter.maxPortions = Math.max(target.counter.maxPortions, target.counter.portions);
        target.counter.freshness = 1;
        target.counter.spoiled = false;
      }
      s.carryingRecipeId = null;
    }
  } else if (s.role === 'waiter' && s.taskType === 'serve') {
    if (
      !s.carryingRecipeId &&
      target?.counter &&
      !target.counter.spoiled &&
      target.counter.portions > 0 &&
      target.counter.recipeId
    ) {
      const waitingCustomer =
        state.customers.find(
          (c) => c.state === 'waiting_food' && c.desiredRecipeId === target.counter!.recipeId
        ) ?? state.customers.find((c) => c.state === 'waiting_food');

      if (waitingCustomer && waitingCustomer.targetChairId) {
        const chair = state.furniture.find((f) => f.instanceId === waitingCustomer.targetChairId);
        if (chair) {
          target.counter.portions -= 1;
          s.carryingRecipeId = target.counter.recipeId;
          if (target.counter.portions <= 0) {
            target.counter.recipeId = null;
            target.counter.maxPortions = 0;
            target.counter.freshness = 1;
            target.counter.spoiled = false;
          }
          s.targetFurnitureId = chair.instanceId;
          const adj = findBestAdjacentTile(s.x, s.y, chair.x, chair.y, state.gridSize, state.furniture);
          s.path = findPath(s.x, s.y, adj.x, adj.y, state.gridSize, state.furniture, false);
          return;
        }
      }
    } else if (s.carryingRecipeId && target?.chair) {
      const customer = state.customers.find(
        (c) => c.targetChairId === target.instanceId && c.state === 'waiting_food'
      );
      if (customer) {
        target.chair.hasFood = true;
        target.chair.servedRecipeId = s.carryingRecipeId;
        customer.state = 'eating';
      }
      s.carryingRecipeId = null;
    }
  } else if (s.role === 'waiter' && s.taskType === 'clean') {
    if (target?.chair?.dirty && !target.chair.occupiedByCustomerId) {
      target.chair.dirty = false;
      state.stats.tablesCleaned += 1;
      addXpAndCoins(state, 2, 2, effects, target.x, target.y);
      soundEngine.playClean();
    }
  }

  s.state = 'idle';
  s.targetFurnitureId = null;
  s.taskType = null;
}

function stepCounters(state: GameState, dt: number, effects: SimulationEffects): void {
  for (const f of state.furniture) {
    if (!f.counter || f.counter.portions <= 0 || f.counter.spoiled) continue;
    const current = f.counter.freshness ?? 1;
    // 180s window for dishes on the counter before spoiling
    const next = current - dt / 180;
    if (next <= 0) {
      f.counter.freshness = 0;
      f.counter.spoiled = true;
      state.buzz = Math.max(0, state.buzz - 2);
      effects.floatingTexts.push({
        id: nextId('ft'),
        gridX: f.x,
        gridY: f.y,
        text: '🤢 Estragou!',
        color: '#e74c3c',
        life: 1.5,
        maxLife: 1.5,
      });
    } else {
      f.counter.freshness = next;
    }
  }
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
  stepCounters(state, dt, effects);
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
      (f) =>
        f.counter &&
        !f.counter.spoiled &&
        f.counter.recipeId === recipeId &&
        f.counter.portions > 0
    ) ?? state.furniture.find((f) => f.counter && !f.counter.spoiled && f.counter.portions === 0);

  if (!counter?.counter) return false;

  stove.stove.status = 'idle';
  stove.stove.recipeId = null;
  stove.stove.progress = 0;
  stove.stove.burnProgress = 0;

  counter.counter.recipeId = recipeId;
  counter.counter.portions += recipe?.portions ?? 8;
  counter.counter.maxPortions = Math.max(counter.counter.maxPortions, counter.counter.portions);
  counter.counter.freshness = 1;
  counter.counter.spoiled = false;

  state.stats.dishesCooked += 1;
  state.recipeMastery[recipeId] = (state.recipeMastery[recipeId] ?? 0) + 1;
  addXpAndCoins(state, 0, recipe?.xpPerCook ?? 10, effects, stove.x, stove.y);
  soundEngine.playCookReady();
  return true;
}
