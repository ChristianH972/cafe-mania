export interface GridPos {
  x: number;
  y: number;
}

export type Direction = 0 | 1 | 2 | 3;

export type FurnitureKind =
  | 'stove'
  | 'counter'
  | 'table'
  | 'chair'
  | 'decor';

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  category: 'Bebidas' | 'Salgados' | 'Doces' | 'Pratos';
  cookTimeSec: number;
  cost: number;
  sellPrice: number;
  portions: number;
  xpPerCook: number;
  xpPerServe: number;
  unlockLevel: number;
  unlockQuestId?: string;
  unlockQuestTitle?: string;
  color: string;
  description: string;
}

export interface FurnitureCatalogItem {
  id: string;
  name: string;
  kind: FurnitureKind;
  price: number;
  cashPrice?: number;
  unlockLevel: number;
  buzzBonus: number;
  color: string;
  accentColor: string;
  description: string;
  speedMultiplier?: number;
}

export interface StoveState {
  status: 'idle' | 'cooking' | 'ready' | 'burnt';
  recipeId: string | null;
  progress: number; // 0 to 1
  burnProgress: number; // 0 to 1
  spicedByNeighbor?: boolean;
}

export interface CounterState {
  recipeId: string | null;
  portions: number;
  maxPortions: number;
  freshness?: number; // 1 = fresh, 0 = spoiled
  spoiled?: boolean;
}

export interface TableState {
  occupiedByCustomerId: string | null;
  dirty: boolean;
  hasFood: boolean;
  servedRecipeId: string | null;
}

export interface ChairState {
  occupiedByCustomerId: string | null;
  dirty: boolean;
  hasFood: boolean;
  servedRecipeId: string | null;
}

export interface PlacedFurniture {
  instanceId: string;
  catalogId: string;
  x: number;
  y: number;
  rotation: Direction;
  stove?: StoveState;
  counter?: CounterState;
  table?: TableState;
  chair?: ChairState;
}

export type CustomerState =
  | 'entering'
  | 'walking_to_seat'
  | 'waiting_food'
  | 'eating'
  | 'leaving';

export type HairStyle = 'classic' | 'spiky' | 'bob' | 'ponytail' | 'curly';

export interface Customer {
  id: string;
  name: string;
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  hairStyle?: HairStyle;
  x: number;
  y: number;
  path: GridPos[];
  state: CustomerState;
  targetTableId: string | null;
  targetChairId?: string | null;
  desiredRecipeId: string | null;
  waitTimer: number;
  maxWaitTimer: number;
  eatTimer: number;
  mood: 'happy' | 'neutral' | 'impatient' | 'angry';
  animPhase: number;
}

export type StaffRole = 'chef' | 'waiter';

export interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  skinColor?: string;
  hairColor?: string;
  shirtColor?: string;
  hairStyle?: HairStyle;
  x: number;
  y: number;
  path: GridPos[];
  state: 'idle' | 'walking' | 'working';
  targetFurnitureId: string | null;
  carryingRecipeId: string | null;
  taskType: 'serve' | 'clean' | 'stock' | null;
  animPhase: number;
}

export interface FloatingText {
  id: string;
  gridX: number;
  gridY: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface Particle {
  id: string;
  gridX: number;
  gridY: number;
  offsetZ: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  kind: 'steam' | 'sparkle' | 'smoke' | 'heart';
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  metric:
    | 'dishes_cooked'
    | 'customers_served'
    | 'tables_cleaned'
    | 'furniture_bought'
    | 'neighbors_helped'
    | 'level_reached';
  targetCount: number;
  currentCount: number;
  rewardCoins: number;
  rewardXp: number;
  rewardCash: number;
  claimed: boolean;
}

export interface Neighbor {
  id: string;
  name: string;
  cafeName: string;
  level: number;
  avatarColor: string;
  hairColor: string;
  helpedToday: boolean;
  spicedToday: boolean;
  giftedToday: boolean;
  tagline: string;
  furniture: PlacedFurniture[];
  floorStyle: string;
  wallStyle: string;
}

export interface GameStats {
  dishesCooked: number;
  customersServed: number;
  tablesCleaned: number;
  furnitureBought: number;
  neighborsHelped: number;
  totalCoinsEarned: number;
}

export interface StyleOption {
  id: string;
  name: string;
  price: number;
  primary: string;
  secondary: string;
  unlockLevel: number;
}

export interface OfflineReport {
  elapsedMinutes: number;
  dishesFinished: number;
  customersServed: number;
  coinsEarned: number;
  xpEarned: number;
}

export interface GameState {
  cafeName: string;
  coins: number; // Café Ouro
  cash: number; // Café Grana
  xp: number;
  level: number;
  rating: number; // Avaliação 0 - 105%
  buzz: number; // Popularidade
  gridSize: number; // 8, 10, 12, 14
  floorStyle: string;
  wallStyle: string;
  furniture: PlacedFurniture[];
  customers: Customer[];
  staff: StaffMember[];
  recipeMastery: Record<string, number>;
  quests: Quest[];
  neighbors: Neighbor[];
  stats: GameStats;
  speed: 1 | 2 | 0;
  soundEnabled: boolean;
  lastSavedAt: number;
}
