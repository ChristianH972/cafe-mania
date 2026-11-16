import React, { useEffect, useRef, useState } from 'react';
import { X, Lock, Star, Sparkles, Gift, Eye, UserPlus } from 'lucide-react';
import { EXPANSION_TIERS, FLOOR_STYLES, FURNITURE_CATALOG, WALL_STYLES } from '../data/catalog';
import {
  RECIPES,
  getMasteryNextTarget,
  getMasteryStars,
  isRecipeUnlocked,
} from '../data/recipes';
import {
  renderCharacterPreview,
  renderFurnitureThumbnail,
  renderStyleThumbnail,
} from '../engine/isoRenderer';
import { FurnitureKind, GameState, HairStyle, Neighbor, Recipe, StaffMember } from '../types/game';
import { ActiveModal } from './BottomDock';

const FurnitureThumbnail: React.FC<{ catalogId: string }> = ({ catalogId }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvasRef.current) {
      renderFurnitureThumbnail(canvasRef.current, catalogId);
    }
  }, [catalogId]);
  return <canvas ref={canvasRef} className="shop-thumb-canvas" />;
};

const StyleThumbnail: React.FC<{
  kind: 'floor' | 'wall';
  primary: string;
  secondary: string;
}> = ({ kind, primary, secondary }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvasRef.current) {
      renderStyleThumbnail(canvasRef.current, kind, primary, secondary);
    }
  }, [kind, primary, secondary]);
  return <canvas ref={canvasRef} className="shop-thumb-canvas" />;
};

const CharacterPreview: React.FC<{
  role: 'chef' | 'waiter';
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hairStyle: HairStyle;
}> = ({ role, skinColor, shirtColor, hairColor, hairStyle }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvasRef.current) {
      renderCharacterPreview(canvasRef.current, {
        role,
        skinColor,
        shirtColor,
        hairColor,
        hairStyle,
      });
    }
  }, [role, skinColor, shirtColor, hairColor, hairStyle]);
  return <canvas ref={canvasRef} className="shop-thumb-canvas" />;
};

const SKIN_OPTIONS = ['#fdebd0', '#f5cba7', '#e0ac69', '#c68642', '#8d5524'];
const HAIR_COLOR_OPTIONS = ['#2c3e50', '#6e2c00', '#d4ac0d', '#c0392b', '#8e44ad', '#95a5a6'];
const SHIRT_OPTIONS = ['#ffffff', '#2c3e50', '#c0392b', '#27ae60', '#2980b9', '#8e44ad', '#e84393'];
const HAIR_STYLE_OPTIONS: { id: HairStyle; label: string }[] = [
  { id: 'classic', label: 'Clássico' },
  { id: 'spiky', label: 'Topete' },
  { id: 'bob', label: 'Longo' },
  { id: 'ponytail', label: 'Rabo' },
  { id: 'curly', label: 'Cacheado' },
];

const FURNITURE_FILTERS: { id: 'all' | FurnitureKind; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'stove', label: 'Fogões' },
  { id: 'counter', label: 'Balcões' },
  { id: 'table', label: 'Mesas' },
  { id: 'chair', label: 'Cadeiras' },
  { id: 'decor', label: 'Decoração' },
];

interface ModalsProps {
  activeModal: ActiveModal;
  state: GameState;
  targetStoveId: string | null;
  onClose: () => void;
  onCookRecipe: (recipe: Recipe, stoveId: string | null) => void;
  onStartPlaceFurniture: (catalogId: string) => void;
  onBuyFloorStyle: (styleId: string) => void;
  onBuyWallStyle: (styleId: string) => void;
  onExpandCafe: (gridSize: number, price: number) => void;
  onHireWaiter: () => void;
  onUpdateStaff: (
    staffId: string,
    patch: Partial<Pick<StaffMember, 'name' | 'skinColor' | 'hairColor' | 'shirtColor' | 'hairStyle'>>
  ) => void;
  onClaimQuest: (questId: string) => void;
  onVisitNeighbor: (neighbor: Neighbor) => void;
  onGiftNeighbor: (neighborId: string) => void;
}

export const Modals: React.FC<ModalsProps> = ({
  activeModal,
  state,
  targetStoveId,
  onClose,
  onCookRecipe,
  onStartPlaceFurniture,
  onBuyFloorStyle,
  onBuyWallStyle,
  onExpandCafe,
  onHireWaiter,
  onUpdateStaff,
  onClaimQuest,
  onVisitNeighbor,
  onGiftNeighbor,
}) => {
  const [recipeCategory, setRecipeCategory] = useState<string>('Todos');
  const [shopTab, setShopTab] = useState<'furniture' | 'styles' | 'expansions' | 'staff'>('furniture');
  const [furnitureFilter, setFurnitureFilter] = useState<'all' | FurnitureKind>('all');

  if (!activeModal) return null;

  const waiterCount = state.staff.filter((s) => s.role === 'waiter').length;
  const nextWaiterCost = waiterCount * 350;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {activeModal === 'recipes' && '📖 Livro de Receitas'}
            {activeModal === 'shop' && '🛍️ Loja do Café Mania'}
            {activeModal === 'quests' && '🏆 Missões do Chef'}
            {activeModal === 'neighbors' && '👥 Vizinhos do Orkut (2010)'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {activeModal === 'recipes' && (
            <>
              <div className="recipes-summary-bar">
                <div className="recipes-summary-text">
                  <strong>
                    🍳 {RECIPES.filter((r) => isRecipeUnlocked(r, state)).length} / {RECIPES.length}{' '}
                    Receitas Desbloqueadas
                  </strong>
                  <span>Complete missões para liberar novos pratos no cardápio!</span>
                </div>
                <div className="recipes-summary-meter">
                  <div
                    className="recipes-summary-fill"
                    style={{
                      width: `${Math.round(
                        (RECIPES.filter((r) => isRecipeUnlocked(r, state)).length / RECIPES.length) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="filter-tabs">
                {['Todos', 'Bebidas', 'Salgados', 'Doces', 'Pratos'].map((cat) => (
                  <button
                    key={cat}
                    className={`tab-pill ${recipeCategory === cat ? 'active' : ''}`}
                    onClick={() => setRecipeCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="cards-grid">
                {RECIPES.filter(
                  (r) => recipeCategory === 'Todos' || r.category === recipeCategory
                ).map((r) => {
                  const unlocked = isRecipeUnlocked(r, state);
                  const locked = !unlocked;
                  const canAfford = state.coins >= r.cost;
                  const cookCount = state.recipeMastery[r.id] ?? 0;
                  const stars = getMasteryStars(cookCount);
                  const nextTarget = getMasteryNextTarget(cookCount);
                  const masteryPct =
                    stars >= 3 ? 100 : Math.min(100, Math.round((cookCount / nextTarget) * 100));
                  const netProfit = r.sellPrice * r.portions - r.cost;

                  return (
                    <div key={r.id} className={`item-card recipe-card ${locked ? 'locked' : ''}`}>
                      <div className="card-top">
                        <span className="recipe-cat-badge">{r.category}</span>
                        <div
                          className="stars-row"
                          title={`Maestria: preparado ${cookCount}x (${stars}/3 estrelas)`}
                        >
                          {[1, 2, 3].map((s) => (
                            <Star
                              key={s}
                              size={13}
                              fill={s <= stars ? '#f1c40f' : 'transparent'}
                              color={s <= stars ? '#d4ac0d' : '#ccc'}
                            />
                          ))}
                        </div>
                      </div>

                      <div
                        className="recipe-art-box"
                        style={{
                          background: `radial-gradient(circle at 50% 45%, #fffdf8 10%, ${r.color}33 100%)`,
                          borderColor: `${r.color}66`,
                        }}
                      >
                        <div className="recipe-plate-ring">
                          <span className="recipe-big-emoji">{r.emoji}</span>
                        </div>
                        <span className="recipe-xp-pill">+{r.xpPerCook} XP</span>
                      </div>

                      <h3>{r.name}</h3>
                      <p className="card-desc">{r.description}</p>

                      <div className="recipe-stats-pills">
                        <span className="r-pill">⏱️ {r.cookTimeSec}s</span>
                        <span className="r-pill">🍽️ {r.portions}x</span>
                        <span className="r-pill profit">💰 +{netProfit}🪙</span>
                      </div>

                      {!locked && (
                        <div className="mastery-mini-bar" title={`Preparado ${cookCount}x`}>
                          <div
                            className="mastery-mini-fill"
                            style={{ width: `${masteryPct}%` }}
                          />
                          <span>
                            {stars >= 3
                              ? `★ Mestre (${cookCount}x)`
                              : `Maestria ${cookCount}/${nextTarget}`}
                          </span>
                        </div>
                      )}

                      {locked ? (
                        <div className="locked-tag recipe-lock-reason">
                          <Lock size={13} />
                          <span>
                            {r.unlockQuestTitle
                              ? `Missão: ${r.unlockQuestTitle}`
                              : `Nível ${r.unlockLevel}`}
                          </span>
                        </div>
                      ) : (
                        <button
                          className="btn-glossy btn-primary"
                          disabled={!canAfford}
                          onClick={() => onCookRecipe(r, targetStoveId)}
                        >
                          🍳 Cozinhar · {r.cost} 🪙
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeModal === 'shop' && (
            <>
              <div className="filter-tabs">
                <button
                  className={`tab-pill ${shopTab === 'furniture' ? 'active' : ''}`}
                  onClick={() => setShopTab('furniture')}
                >
                  Móveis & Cozinha
                </button>
                <button
                  className={`tab-pill ${shopTab === 'styles' ? 'active' : ''}`}
                  onClick={() => setShopTab('styles')}
                >
                  Pisos & Paredes
                </button>
                <button
                  className={`tab-pill ${shopTab === 'expansions' ? 'active' : ''}`}
                  onClick={() => setShopTab('expansions')}
                >
                  Expansões ({state.gridSize}x{state.gridSize})
                </button>
                <button
                  className={`tab-pill ${shopTab === 'staff' ? 'active' : ''}`}
                  onClick={() => setShopTab('staff')}
                >
                  Equipe ({waiterCount} Garçons)
                </button>
              </div>

              {shopTab === 'furniture' && (
                <>
                  <div className="subfilter-tabs">
                    {FURNITURE_FILTERS.map((cat) => (
                      <button
                        key={cat.id}
                        className={`subtab-pill ${furnitureFilter === cat.id ? 'active' : ''}`}
                        onClick={() => setFurnitureFilter(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  <div className="cards-grid">
                    {FURNITURE_CATALOG.filter(
                      (item) => furnitureFilter === 'all' || item.kind === furnitureFilter
                    ).map((item) => {
                      const locked = state.level < item.unlockLevel;
                      const canAfford = state.coins >= item.price;
                      return (
                        <div key={item.id} className={`item-card shop-card ${locked ? 'locked' : ''}`}>
                          <div className="card-top">
                            <span className="buzz-tag">+{item.buzzBonus}% Buzz</span>
                            {item.speedMultiplier && item.speedMultiplier > 1 ? (
                              <span className="speed-tag">⚡ {item.speedMultiplier}x</span>
                            ) : (
                              <span className="level-mini-tag">Nv. {item.unlockLevel}</span>
                            )}
                          </div>
                          <div className="shop-thumb-box">
                            <FurnitureThumbnail catalogId={item.id} />
                          </div>
                          <h3>{item.name}</h3>
                          <p className="card-desc">{item.description}</p>
                          <div className="shop-price-row">
                            <span className="price-pill">🪙 {item.price}</span>
                            {item.cashPrice ? (
                              <span className="price-pill cash">ou 💵 {item.cashPrice}</span>
                            ) : null}
                          </div>
                          {locked ? (
                            <div className="locked-tag">
                              <Lock size={14} /> Nível {item.unlockLevel}
                            </div>
                          ) : (
                            <button
                              className="btn-glossy btn-primary"
                              disabled={!canAfford}
                              onClick={() => onStartPlaceFurniture(item.id)}
                            >
                              Comprar · {item.price} 🪙
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {shopTab === 'styles' && (
                <div className="styles-section">
                  <h3>Pisos</h3>
                  <div className="cards-grid">
                    {FLOOR_STYLES.map((fs) => {
                      const active = state.floorStyle === fs.id;
                      const locked = state.level < fs.unlockLevel;
                      return (
                        <div key={fs.id} className={`item-card shop-card ${locked ? 'locked' : ''}`}>
                          <div className="card-top">
                            <span className="buzz-tag">Piso</span>
                            <span className="level-mini-tag">Nv. {fs.unlockLevel}</span>
                          </div>
                          <div className="shop-thumb-box">
                            <StyleThumbnail kind="floor" primary={fs.primary} secondary={fs.secondary} />
                          </div>
                          <h3>{fs.name}</h3>
                          <div className="shop-price-row">
                            <span className="price-pill">
                              {fs.price === 0 ? '✨ Grátis' : `🪙 ${fs.price}`}
                            </span>
                          </div>
                          {locked ? (
                            <div className="locked-tag">
                              <Lock size={14} /> Nível {fs.unlockLevel}
                            </div>
                          ) : (
                            <button
                              className="btn-glossy btn-primary"
                              disabled={active || state.coins < fs.price}
                              onClick={() => onBuyFloorStyle(fs.id)}
                            >
                              {active ? '✓ Em Uso' : fs.price === 0 ? 'Aplicar' : `Comprar · ${fs.price} 🪙`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <h3 style={{ marginTop: 18 }}>Paredes</h3>
                  <div className="cards-grid">
                    {WALL_STYLES.map((ws) => {
                      const active = state.wallStyle === ws.id;
                      const locked = state.level < ws.unlockLevel;
                      return (
                        <div key={ws.id} className={`item-card shop-card ${locked ? 'locked' : ''}`}>
                          <div className="card-top">
                            <span className="buzz-tag">Parede</span>
                            <span className="level-mini-tag">Nv. {ws.unlockLevel}</span>
                          </div>
                          <div className="shop-thumb-box">
                            <StyleThumbnail kind="wall" primary={ws.primary} secondary={ws.secondary} />
                          </div>
                          <h3>{ws.name}</h3>
                          <div className="shop-price-row">
                            <span className="price-pill">
                              {ws.price === 0 ? '✨ Grátis' : `🪙 ${ws.price}`}
                            </span>
                          </div>
                          {locked ? (
                            <div className="locked-tag">
                              <Lock size={14} /> Nível {ws.unlockLevel}
                            </div>
                          ) : (
                            <button
                              className="btn-glossy btn-primary"
                              disabled={active || state.coins < ws.price}
                              onClick={() => onBuyWallStyle(ws.id)}
                            >
                              {active ? '✓ Em Uso' : ws.price === 0 ? 'Aplicar' : `Comprar · ${ws.price} 🪙`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {shopTab === 'expansions' && (
                <div className="cards-grid">
                  {EXPANSION_TIERS.map((tier) => {
                    const owned = state.gridSize >= tier.gridSize;
                    const locked = state.level < tier.unlockLevel;
                    const canAfford = state.coins >= tier.price;
                    return (
                      <div key={tier.gridSize} className={`item-card ${locked ? 'locked' : ''}`}>
                        <h3>📐 {tier.label}</h3>
                        <p className="card-desc">
                          Amplie o salão para colocar mais mesas, fogões e decorações!
                        </p>
                        {owned ? (
                          <div className="claimed-badge">✓ Desbloqueado</div>
                        ) : locked ? (
                          <div className="locked-tag">
                            <Lock size={14} /> Nível {tier.unlockLevel}
                          </div>
                        ) : (
                          <button
                            className="btn-glossy btn-primary"
                            disabled={!canAfford}
                            onClick={() => onExpandCafe(tier.gridSize, tier.price)}
                          >
                            Expandir ({tier.price} 🪙)
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {shopTab === 'staff' && (
                <div className="staff-section">
                  <div className="staff-box">
                    <UserPlus size={34} color="#e67e22" />
                    <h3>Contratar Novo Garçom</h3>
                    <p>
                      Garçons servem os clientes automaticamente a partir dos balcões e limpam mesas sujas!
                      Você tem atualmente <strong>{waiterCount}</strong> garçom(ns).
                    </p>
                    <button
                      className="btn-glossy btn-primary"
                      disabled={state.coins < nextWaiterCost || waiterCount >= 4}
                      onClick={onHireWaiter}
                    >
                      {waiterCount >= 4
                        ? 'Máximo de Garçons (4)'
                        : `Contratar Garçom (${nextWaiterCost} 🪙)`}
                    </button>
                  </div>

                  <h3 className="staff-custom-title">🎨 Customizar Chef & Garçons</h3>
                  <div className="staff-custom-grid">
                    {state.staff.map((member) => {
                      const skin = member.skinColor ?? '#f5cba7';
                      const shirt =
                        member.shirtColor ?? (member.role === 'chef' ? '#ffffff' : '#2c3e50');
                      const hair = member.hairColor ?? '#4a235a';
                      const hairStyle = member.hairStyle ?? 'classic';
                      return (
                        <div key={member.id} className="item-card staff-custom-card">
                          <div className="staff-custom-header">
                            <div className="staff-avatar-box">
                              <CharacterPreview
                                role={member.role}
                                skinColor={skin}
                                shirtColor={shirt}
                                hairColor={hair}
                                hairStyle={hairStyle}
                              />
                            </div>
                            <div className="staff-name-col">
                              <span className="buzz-tag">
                                {member.role === 'chef' ? '👨‍🍳 Chef' : '🤵 Garçom'}
                              </span>
                              <input
                                className="staff-name-input"
                                type="text"
                                maxLength={16}
                                value={member.name}
                                onChange={(e) =>
                                  onUpdateStaff(member.id, { name: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="custom-row">
                            <span className="custom-label">Pele</span>
                            <div className="swatch-row">
                              {SKIN_OPTIONS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`mini-swatch ${skin === c ? 'active' : ''}`}
                                  style={{ background: c }}
                                  onClick={() => onUpdateStaff(member.id, { skinColor: c })}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="custom-row">
                            <span className="custom-label">Cabelo</span>
                            <div className="swatch-row">
                              {HAIR_COLOR_OPTIONS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`mini-swatch ${hair === c ? 'active' : ''}`}
                                  style={{ background: c }}
                                  onClick={() => onUpdateStaff(member.id, { hairColor: c })}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="custom-row">
                            <span className="custom-label">Estilo</span>
                            <div className="hair-pills">
                              {HAIR_STYLE_OPTIONS.map((hs) => (
                                <button
                                  key={hs.id}
                                  type="button"
                                  className={`hair-pill ${hairStyle === hs.id ? 'active' : ''}`}
                                  onClick={() => onUpdateStaff(member.id, { hairStyle: hs.id })}
                                >
                                  {hs.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="custom-row">
                            <span className="custom-label">Roupa</span>
                            <div className="swatch-row">
                              {SHIRT_OPTIONS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`mini-swatch ${shirt === c ? 'active' : ''}`}
                                  style={{ background: c }}
                                  onClick={() => onUpdateStaff(member.id, { shirtColor: c })}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeModal === 'quests' && (
            <div className="list-stack">
              {state.quests.map((q) => {
                const done = q.currentCount >= q.targetCount;
                const pct = Math.min(100, Math.round((q.currentCount / q.targetCount) * 100));
                return (
                  <div key={q.id} className={`quest-row ${q.claimed ? 'claimed' : ''}`}>
                    <div className="quest-info">
                      <h4>{q.title}</h4>
                      <p>{q.description}</p>
                      {RECIPES.filter((r) => r.unlockQuestId === q.id).length > 0 && (
                        <div className="quest-unlock-pill">
                          📖 Desbloqueia:{' '}
                          {RECIPES.filter((r) => r.unlockQuestId === q.id)
                            .map((r) => `${r.emoji} ${r.name}`)
                            .join(', ')}
                        </div>
                      )}
                      <div className="quest-progress">
                        <div className="quest-fill" style={{ width: `${pct}%` }} />
                        <span>
                          {Math.min(q.currentCount, q.targetCount)} / {q.targetCount}
                        </span>
                      </div>
                    </div>
                    <div className="quest-reward">
                      <div className="reward-pills">
                        <span>+{q.rewardCoins} 🪙</span>
                        <span>+{q.rewardXp} XP</span>
                        {q.rewardCash > 0 && <span>+{q.rewardCash} 💵</span>}
                      </div>
                      {q.claimed ? (
                        <span className="claimed-badge">Concluída ✓</span>
                      ) : (
                        <button
                          className="btn-glossy btn-gold"
                          disabled={!done}
                          onClick={() => onClaimQuest(q.id)}
                        >
                          <Sparkles size={14} /> Resgatar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeModal === 'neighbors' && (
            <div className="list-stack">
              {state.neighbors.map((nb) => (
                <div key={nb.id} className="neighbor-row">
                  <div
                    className="neighbor-avatar"
                    style={{ background: nb.avatarColor }}
                  >
                    {nb.name[0]}
                  </div>
                  <div className="neighbor-info">
                    <h4>
                      {nb.name} — <span>{nb.cafeName}</span>
                    </h4>
                    <p>{nb.tagline}</p>
                    <small>Nível {nb.level} • {nb.helpedToday ? 'Ajudado hoje ✓' : 'Mesas esperando ajuda!'}</small>
                  </div>
                  <div className="neighbor-actions">
                    <button
                      className="btn-glossy btn-blue"
                      onClick={() => onVisitNeighbor(nb)}
                    >
                      <Eye size={14} /> Visitar
                    </button>
                    <button
                      className="btn-glossy btn-primary"
                      disabled={nb.giftedToday}
                      onClick={() => onGiftNeighbor(nb.id)}
                    >
                      <Gift size={14} /> {nb.giftedToday ? 'Enviado' : 'Presentear'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
