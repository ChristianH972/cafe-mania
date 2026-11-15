import React, { useState } from 'react';
import { X, Lock, Star, Sparkles, Gift, Eye, UserPlus } from 'lucide-react';
import { EXPANSION_TIERS, FLOOR_STYLES, FURNITURE_CATALOG, WALL_STYLES } from '../data/catalog';
import { RECIPES, getMasteryStars } from '../data/recipes';
import { GameState, Neighbor, Recipe } from '../types/game';
import { ActiveModal } from './BottomDock';

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
  onClaimQuest,
  onVisitNeighbor,
  onGiftNeighbor,
}) => {
  const [recipeCategory, setRecipeCategory] = useState<string>('Todos');
  const [shopTab, setShopTab] = useState<'furniture' | 'styles' | 'expansions' | 'staff'>('furniture');

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
                  const locked = state.level < r.unlockLevel;
                  const canAfford = state.coins >= r.cost;
                  const cookCount = state.recipeMastery[r.id] ?? 0;
                  const stars = getMasteryStars(cookCount);

                  return (
                    <div key={r.id} className={`item-card ${locked ? 'locked' : ''}`}>
                      <div className="card-top">
                        <span className="card-emoji">{r.emoji}</span>
                        <div className="stars-row" title={`Preparado ${cookCount}x`}>
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
                      <h3>{r.name}</h3>
                      <p className="card-desc">{r.description}</p>
                      <div className="card-meta">
                        <span>⏱️ {r.cookTimeSec}s</span>
                        <span>🍽️ {r.portions} porções</span>
                        <span>💵 Venda: {r.sellPrice}🪙</span>
                      </div>
                      {locked ? (
                        <div className="locked-tag">
                          <Lock size={14} /> Nível {r.unlockLevel}
                        </div>
                      ) : (
                        <button
                          className="btn-glossy btn-primary"
                          disabled={!canAfford}
                          onClick={() => onCookRecipe(r, targetStoveId)}
                        >
                          Cozinhar ({r.cost} 🪙)
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
                <div className="cards-grid">
                  {FURNITURE_CATALOG.map((item) => {
                    const locked = state.level < item.unlockLevel;
                    const canAfford = state.coins >= item.price;
                    return (
                      <div key={item.id} className={`item-card ${locked ? 'locked' : ''}`}>
                        <div className="card-top">
                          <span
                            className="color-swatch"
                            style={{ background: item.color, borderColor: item.accentColor }}
                          />
                          <span className="buzz-tag">+{item.buzzBonus}% Buzz</span>
                        </div>
                        <h3>{item.name}</h3>
                        <p className="card-desc">{item.description}</p>
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
                            Comprar ({item.price} 🪙)
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {shopTab === 'styles' && (
                <div className="styles-section">
                  <h3>Pisos</h3>
                  <div className="cards-grid">
                    {FLOOR_STYLES.map((fs) => {
                      const active = state.floorStyle === fs.id;
                      const locked = state.level < fs.unlockLevel;
                      return (
                        <div key={fs.id} className="item-card">
                          <div className="style-preview">
                            <span style={{ background: fs.primary }} />
                            <span style={{ background: fs.secondary }} />
                          </div>
                          <h3>{fs.name}</h3>
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
                              {active ? 'Em Uso' : fs.price === 0 ? 'Aplicar' : `Comprar (${fs.price} 🪙)`}
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
                        <div key={ws.id} className="item-card">
                          <div className="style-preview">
                            <span style={{ background: ws.primary }} />
                            <span style={{ background: ws.secondary }} />
                          </div>
                          <h3>{ws.name}</h3>
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
                              {active ? 'Em Uso' : ws.price === 0 ? 'Aplicar' : `Comprar (${ws.price} 🪙)`}
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
                <div className="staff-box">
                  <UserPlus size={40} color="#e67e22" />
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
