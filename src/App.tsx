import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { BottomDock, ActiveModal } from './components/BottomDock';
import { Modals } from './components/Modals';
import { TopHud } from './components/TopHud';
import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from './data/catalog';
import {
  computeBuzz,
  createInitialState,
  loadGameState,
  resetGameState,
  saveGameState,
} from './engine/gameLogic';
import { TILE_H, screenToGrid } from './engine/isoMath';
import { renderCafeScene } from './engine/isoRenderer';
import {
  SimulationEffects,
  addXpAndCoins,
  collectReadyStoveDirect,
  nextId,
  stepSimulation,
  syncQuests,
} from './engine/simulationStep';
import { GameState, Neighbor, OfflineReport, PlacedFurniture, Recipe } from './types/game';

export function App() {
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [uiState, setUiState] = useState<GameState>(() => {
    const loaded = loadGameState();
    if (loaded) {
      if (loaded.offlineReport) {
        setTimeout(() => setOfflineReport(loaded.offlineReport), 100);
      }
      return loaded.state;
    }
    return createInitialState();
  });

  const stateRef = useRef<GameState>(uiState);
  const effectsRef = useRef<SimulationEffects>({
    particles: [],
    floatingTexts: [],
    spawnTimer: 1.5,
    levelUpBanner: null,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<{ zoom: number; panX: number; panY: number }>({
    zoom: 1.28,
    panX: 0,
    panY: 0,
  });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0, moved: false });

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [targetStoveId, setTargetStoveId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [placingCatalogId, setPlacingCatalogId] = useState<string | null>(null);
  const [visitingNeighbor, setVisitingNeighbor] = useState<Neighbor | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  const [cookingStoveId, setCookingStoveId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  // Sync sound setting
  useEffect(() => {
    soundEngine.enabled = uiState.soundEnabled;
  }, [uiState.soundEnabled]);

  // ESC to cancel placement/edit, R to rotate selected furniture
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacingCatalogId(null);
        setSelectedFurnitureId(null);
        setCookingStoveId(null);
        setActiveModal(null);
      } else if ((e.key === 'r' || e.key === 'R') && editMode && selectedFurnitureId) {
        const furn = stateRef.current.furniture.find((f) => f.instanceId === selectedFurnitureId);
        if (furn) {
          furn.rotation = ((furn.rotation + 1) % 4) as 0 | 1 | 2 | 3;
          soundEngine.playClick();
          setUiState({ ...stateRef.current });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editMode, selectedFurnitureId]);

  // Auto-save every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      saveGameState(stateRef.current);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Main 60fps Canvas + Simulation loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let uiSyncAccum = 0;

    const loop = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!visitingNeighbor) {
        stepSimulation(stateRef.current, rawDt, effectsRef.current);
      }

      if (effectsRef.current.levelUpBanner !== null) {
        setLevelBanner(effectsRef.current.levelUpBanner);
        effectsRef.current.levelUpBanner = null;
        setTimeout(() => setLevelBanner(null), 3500);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const activeState = stateRef.current;
          const originX = rect.width / 2;
          const originY = rect.height / 2 - (activeState.gridSize * TILE_H) / 2 + 28;

          renderCafeScene({
            ctx,
            width: rect.width,
            height: rect.height,
            originX,
            originY,
            gridSize: visitingNeighbor ? 8 : activeState.gridSize,
            floorStyleId: visitingNeighbor ? visitingNeighbor.floorStyle : activeState.floorStyle,
            wallStyleId: visitingNeighbor ? visitingNeighbor.wallStyle : activeState.wallStyle,
            furniture: visitingNeighbor ? visitingNeighbor.furniture : activeState.furniture,
            customers: visitingNeighbor ? [] : activeState.customers,
            staff: visitingNeighbor ? [] : activeState.staff,
            particles: effectsRef.current.particles,
            floatingTexts: effectsRef.current.floatingTexts,
            hoverTile: hoverTileRef.current,
            editMode,
            selectedFurnitureId,
            placingCatalogId,
            timeSec: now / 1000,
            isNeighborView: Boolean(visitingNeighbor),
            zoom: cameraRef.current.zoom,
            panX: cameraRef.current.panX,
            panY: cameraRef.current.panY,
          });
          ctx.restore();
        }
      }

      uiSyncAccum += rawDt;
      if (uiSyncAccum >= 0.16) {
        uiSyncAccum = 0;
        setUiState({ ...stateRef.current });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [editMode, selectedFurnitureId, placingCatalogId, visitingNeighbor]);

  const getGridFromMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const { zoom, panX, panY } = cameraRef.current;
    const sx = (rawX - rect.width / 2 - panX) / zoom + rect.width / 2;
    const sy = (rawY - rect.height / 2 - panY) / zoom + rect.height / 2;
    const activeGrid = visitingNeighbor ? 8 : stateRef.current.gridSize;
    const originX = rect.width / 2;
    const originY = rect.height / 2 - (activeGrid * TILE_H) / 2 + 28;
    return screenToGrid(sx, sy, originX, originY);
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    cameraRef.current.zoom = Math.min(2.1, Math.max(0.7, cameraRef.current.zoom + delta));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: cameraRef.current.panX,
      origPanY: cameraRef.current.panY,
      moved: false,
    };
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 6) {
        dragRef.current.moved = true;
        cameraRef.current.panX = dragRef.current.origPanX + dx;
        cameraRef.current.panY = dragRef.current.origPanY + dy;
      }
    }
    hoverTileRef.current = getGridFromMouse(e);
  };

  const handleCanvasMouseUp = () => {
    dragRef.current.active = false;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    const pos = getGridFromMouse(e);
    if (!pos) return;
    const s = stateRef.current;
    if (pos.x < 0 || pos.y < 0 || pos.x >= s.gridSize || pos.y >= s.gridSize) return;

    // 1. Visiting neighbor interaction (Tempero + Limpar mesas)
    if (visitingNeighbor) {
      const target = visitingNeighbor.furniture.find((f) => f.x === pos.x && f.y === pos.y);
      if (target?.stove?.status === 'cooking' && !target.stove.spicedByNeighbor) {
        target.stove.spicedByNeighbor = true;
        target.stove.progress = Math.min(1, target.stove.progress + 0.25);
        s.stats.neighborsHelped += 1;
        addXpAndCoins(s, 35, 20, effectsRef.current, pos.x, pos.y);
        soundEngine.playCookReady();
        const nbRef = s.neighbors.find((n) => n.id === visitingNeighbor.id);
        if (nbRef) nbRef.spicedToday = true;
        setVisitingNeighbor({ ...visitingNeighbor });
        setUiState({ ...s });
        showToast('🧂 Você temperou o prato do vizinho! +35 Café Ouro +20 XP');
      } else if (target?.table?.dirty) {
        target.table.dirty = false;
        s.stats.neighborsHelped += 1;
        addXpAndCoins(s, 25, 15, effectsRef.current, pos.x, pos.y);
        soundEngine.playClean();
        const nbRef = s.neighbors.find((n) => n.id === visitingNeighbor.id);
        if (nbRef) {
          nbRef.helpedToday = visitingNeighbor.furniture.every((f) => !f.table?.dirty);
        }
        setVisitingNeighbor({ ...visitingNeighbor });
        setUiState({ ...s });
        showToast('🧹 Você ajudou seu vizinho! +25 Café Ouro +15 XP');
      }
      return;
    }

    const occupied = s.furniture.find((f) => f.x === pos.x && f.y === pos.y);

    // 2. Placing newly bought furniture
    if (placingCatalogId) {
      if (occupied) {
        showToast('Este espaço já está ocupado!');
        return;
      }
      const cat = getCatalogItem(placingCatalogId);
      if (!cat) return;
      if (s.coins < cat.price) {
        showToast('Moedas insuficientes!');
        setPlacingCatalogId(null);
        return;
      }

      s.coins -= cat.price;
      const newFurn: PlacedFurniture = {
        instanceId: nextId('furn'),
        catalogId: cat.id,
        x: pos.x,
        y: pos.y,
        rotation: 0,
      };
      if (cat.kind === 'stove') {
        newFurn.stove = { status: 'idle', recipeId: null, progress: 0, burnProgress: 0 };
      } else if (cat.kind === 'counter') {
        newFurn.counter = { recipeId: null, portions: 0, maxPortions: 0 };
      } else if (cat.kind === 'table') {
        newFurn.table = {
          occupiedByCustomerId: null,
          dirty: false,
          hasFood: false,
          servedRecipeId: null,
        };
      }

      s.furniture.push(newFurn);
      s.buzz = computeBuzz(s.furniture);
      s.stats.furnitureBought += 1;
      syncQuests(s);
      soundEngine.playBuy();
      setPlacingCatalogId(null);
      setUiState({ ...s });
      showToast(`${cat.name} posicionado!`);
      return;
    }

    // 3. Edit mode (move furniture)
    if (editMode) {
      if (occupied) {
        setSelectedFurnitureId(
          selectedFurnitureId === occupied.instanceId ? null : occupied.instanceId
        );
        soundEngine.playClick();
      } else if (selectedFurnitureId) {
        const moving = s.furniture.find((f) => f.instanceId === selectedFurnitureId);
        if (moving) {
          moving.x = pos.x;
          moving.y = pos.y;
          soundEngine.playClick();
          setSelectedFurnitureId(null);
          setUiState({ ...s });
        }
      }
      return;
    }

    // 4. Normal gameplay clicks
    if (!occupied) return;

    if (occupied.stove) {
      if (occupied.stove.status === 'idle') {
        setCookingStoveId(null);
        setTargetStoveId(occupied.instanceId);
        setActiveModal('recipes');
        soundEngine.playClick();
      } else if (occupied.stove.status === 'cooking') {
        setCookingStoveId(
          cookingStoveId === occupied.instanceId ? null : occupied.instanceId
        );
        soundEngine.playClick();
      } else if (occupied.stove.status === 'ready') {
        const ok = collectReadyStoveDirect(s, occupied, effectsRef.current);
        if (!ok) {
          showToast('Balcões cheios! Compre mais um Balcão na Loja.');
        } else {
          setUiState({ ...s });
        }
      } else if (occupied.stove.status === 'burnt') {
        occupied.stove.status = 'idle';
        occupied.stove.recipeId = null;
        occupied.stove.progress = 0;
        occupied.stove.burnProgress = 0;
        soundEngine.playClean();
        setUiState({ ...s });
        showToast('Fogão limpo!');
      }
    } else if (occupied.table?.dirty && !occupied.table.occupiedByCustomerId) {
      occupied.table.dirty = false;
      s.stats.tablesCleaned += 1;
      addXpAndCoins(s, 2, 2, effectsRef.current, occupied.x, occupied.y);
      soundEngine.playClean();
      setUiState({ ...s });
    }
  };

  const handleCookRecipe = (recipe: Recipe, stoveId: string | null) => {
    const s = stateRef.current;
    if (s.coins < recipe.cost) {
      showToast('Moedas insuficientes!');
      return;
    }

    const stove =
      (stoveId ? s.furniture.find((f) => f.instanceId === stoveId) : undefined) ??
      s.furniture.find((f) => f.stove?.status === 'idle');

    if (!stove || !stove.stove || stove.stove.status !== 'idle') {
      showToast('Nenhum fogão livre no momento!');
      return;
    }

    s.coins -= recipe.cost;
    stove.stove.status = 'cooking';
    stove.stove.recipeId = recipe.id;
    stove.stove.progress = 0;
    stove.stove.burnProgress = 0;

    soundEngine.playCookStart();
    setActiveModal(null);
    setTargetStoveId(null);
    setUiState({ ...s });
    showToast(`Preparando ${recipe.name}!`);
  };

  const handleStartPlaceFurniture = (catalogId: string) => {
    setPlacingCatalogId(catalogId);
    setActiveModal(null);
    setEditMode(false);
    soundEngine.playClick();
  };

  const handleBuyFloorStyle = (styleId: string) => {
    const fs = FLOOR_STYLES.find((f) => f.id === styleId);
    if (!fs) return;
    const s = stateRef.current;
    if (s.coins < fs.price) return;
    s.coins -= fs.price;
    s.floorStyle = fs.id;
    soundEngine.playBuy();
    setUiState({ ...s });
  };

  const handleBuyWallStyle = (styleId: string) => {
    const ws = WALL_STYLES.find((w) => w.id === styleId);
    if (!ws) return;
    const s = stateRef.current;
    if (s.coins < ws.price) return;
    s.coins -= ws.price;
    s.wallStyle = ws.id;
    soundEngine.playBuy();
    setUiState({ ...s });
  };

  const handleExpandCafe = (gridSize: number, price: number) => {
    const s = stateRef.current;
    if (s.coins < price || s.gridSize >= gridSize) return;
    s.coins -= price;
    s.gridSize = gridSize;
    soundEngine.playLevelUp();
    setActiveModal(null);
    setUiState({ ...s });
    showToast(`📐 Salão expandido para ${gridSize}x${gridSize}!`);
  };

  const handleHireWaiter = () => {
    const s = stateRef.current;
    const waiterCount = s.staff.filter((st) => st.role === 'waiter').length;
    const cost = waiterCount * 350;
    if (s.coins < cost || waiterCount >= 4) return;
    s.coins -= cost;
    s.staff.push({
      id: nextId('waiter'),
      role: 'waiter',
      name: `Garçom #${waiterCount + 1}`,
      x: 5,
      y: 5,
      path: [],
      state: 'idle',
      targetFurnitureId: null,
      carryingRecipeId: null,
      taskType: null,
      animPhase: 0,
    });
    soundEngine.playBuy();
    setUiState({ ...s });
    showToast('Novo garçom contratado!');
  };

  const handleClaimQuest = (questId: string) => {
    const s = stateRef.current;
    const q = s.quests.find((item) => item.id === questId);
    if (!q || q.claimed || q.currentCount < q.targetCount) return;
    q.claimed = true;
    s.cash += q.rewardCash;
    addXpAndCoins(s, q.rewardCoins, q.rewardXp, effectsRef.current);
    soundEngine.playQuestComplete();
    setUiState({ ...s });
    showToast(`Missão "${q.title}" resgatada!`);
  };

  const handleGiftNeighbor = (neighborId: string) => {
    const s = stateRef.current;
    const nb = s.neighbors.find((n) => n.id === neighborId);
    if (!nb || nb.giftedToday) return;
    nb.giftedToday = true;
    addXpAndCoins(s, 30, 10, effectsRef.current);
    soundEngine.playCoin();
    setUiState({ ...s });
    showToast(`Presente enviado para ${nb.name}! +30 🪙 +10 XP`);
  };

  const handleRotateSelected = () => {
    if (!selectedFurnitureId) return;
    const furn = stateRef.current.furniture.find((f) => f.instanceId === selectedFurnitureId);
    if (!furn) return;
    furn.rotation = ((furn.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    soundEngine.playClick();
    setUiState({ ...stateRef.current });
  };

  const handleInstantFinishStove = () => {
    if (!cookingStoveId) return;
    const s = stateRef.current;
    const stove = s.furniture.find((f) => f.instanceId === cookingStoveId);
    if (!stove?.stove || stove.stove.status !== 'cooking') return;
    if (s.cash < 1) {
      showToast('Café Grana insuficiente!');
      return;
    }
    s.cash -= 1;
    stove.stove.progress = 1;
    stove.stove.status = 'ready';
    stove.stove.burnProgress = 0;
    soundEngine.playCookReady();
    setCookingStoveId(null);
    setUiState({ ...s });
    showToast('⚡ Prato finalizado instantaneamente!');
  };

  const handleDiscardStove = () => {
    if (!cookingStoveId) return;
    const s = stateRef.current;
    const stove = s.furniture.find((f) => f.instanceId === cookingStoveId);
    if (!stove?.stove) return;
    stove.stove.status = 'idle';
    stove.stove.recipeId = null;
    stove.stove.progress = 0;
    stove.stove.burnProgress = 0;
    soundEngine.playClean();
    setCookingStoveId(null);
    setUiState({ ...s });
    showToast('Prato descartado.');
  };
  const handleSellSelected = () => {
    if (!selectedFurnitureId) return;
    const s = stateRef.current;
    const idx = s.furniture.findIndex((f) => f.instanceId === selectedFurnitureId);
    if (idx === -1) return;
    const item = s.furniture[idx];
    const cat = getCatalogItem(item.catalogId);
    const refund = Math.floor((cat?.price ?? 50) * 0.5);
    s.furniture.splice(idx, 1);
    s.coins += refund;
    s.buzz = computeBuzz(s.furniture);
    setSelectedFurnitureId(null);
    soundEngine.playCoin();
    setUiState({ ...s });
    showToast(`Móvel vendido por ${refund} 🪙`);
  };

  const claimableQuestsCount = uiState.quests.filter(
    (q) => !q.claimed && q.currentCount >= q.targetCount
  ).length;

  return (
    <div className="game-shell">
      <TopHud
        state={uiState}
        visitingNeighborName={visitingNeighbor?.cafeName ?? null}
        onSetSpeed={(sp) => {
          stateRef.current.speed = sp;
          setUiState({ ...stateRef.current });
        }}
        onToggleSound={() => {
          stateRef.current.soundEnabled = !stateRef.current.soundEnabled;
          soundEngine.enabled = stateRef.current.soundEnabled;
          setUiState({ ...stateRef.current });
        }}
        onResetGame={() => {
          if (window.confirm('Deseja reiniciar seu Café Mania do zero?')) {
            const fresh = resetGameState();
            stateRef.current = fresh;
            setUiState(fresh);
          }
        }}
        onExitNeighbor={() => setVisitingNeighbor(null)}
        onRenameCafe={(name) => {
          stateRef.current.cafeName = name;
          setUiState({ ...stateRef.current });
        }}
      />

      <main className="canvas-stage">
        <canvas
          ref={canvasRef}
          className="iso-canvas"
          onWheel={handleCanvasWheel}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onClick={handleCanvasClick}
        />

        <div className="camera-controls">
          <button
            title="Aproximar Zoom"
            onClick={() => {
              cameraRef.current.zoom = Math.min(2.1, cameraRef.current.zoom + 0.18);
            }}
          >
            +
          </button>
          <button
            title="Afastar Zoom"
            onClick={() => {
              cameraRef.current.zoom = Math.max(0.7, cameraRef.current.zoom - 0.18);
            }}
          >
            −
          </button>
          <button
            title="Centralizar Câmera"
            onClick={() => {
              cameraRef.current = { zoom: 1.28, panX: 0, panY: 0 };
            }}
          >
            ⟲
          </button>
        </div>

        {placingCatalogId && (
          <div className="floating-banner">
            📍 Clique em um piso livre para posicionar{' '}
            <strong>{getCatalogItem(placingCatalogId)?.name}</strong>
            <button onClick={() => setPlacingCatalogId(null)}>Cancelar</button>
          </div>
        )}

        {editMode && selectedFurnitureId && (
          <div className="floating-banner">
            ✏️ Clique em um piso vazio para mover:
            <button onClick={handleRotateSelected} title="Atalho: R">
              🔄 Girar (R)
            </button>
            <button className="sell-btn" onClick={handleSellSelected}>
              Vender (50%)
            </button>
            <button onClick={() => setSelectedFurnitureId(null)}>Desmarcar</button>
          </div>
        )}

        {cookingStoveId && !editMode && !visitingNeighbor && (
          <div className="floating-banner">
            🍳 Cozinhando no fogão:
            <button onClick={handleInstantFinishStove}>
              ⚡ Finalizar Agora (1 💵)
            </button>
            <button className="sell-btn" onClick={handleDiscardStove}>
              Descartar
            </button>
            <button onClick={() => setCookingStoveId(null)}>Fechar</button>
          </div>
        )}

        {toastMsg && <div className="toast-pill">{toastMsg}</div>}

        {levelBanner !== null && (
          <div className="levelup-banner">
            ⭐ SUBIU PARA O NÍVEL {levelBanner}! (+100 🪙 +1 💵)
          </div>
        )}
      </main>

      <BottomDock
        activeModal={activeModal}
        editMode={editMode}
        claimableQuestsCount={claimableQuestsCount}
        visitingNeighbor={Boolean(visitingNeighbor)}
        onOpenModal={(m) => {
          setTargetStoveId(null);
          setActiveModal(m);
          soundEngine.playClick();
        }}
        onToggleEditMode={() => {
          setEditMode((v) => !v);
          setSelectedFurnitureId(null);
          setPlacingCatalogId(null);
          soundEngine.playClick();
        }}
      />

      <Modals
        activeModal={activeModal}
        state={uiState}
        targetStoveId={targetStoveId}
        onClose={() => setActiveModal(null)}
        onCookRecipe={handleCookRecipe}
        onStartPlaceFurniture={handleStartPlaceFurniture}
        onBuyFloorStyle={handleBuyFloorStyle}
        onBuyWallStyle={handleBuyWallStyle}
        onExpandCafe={handleExpandCafe}
        onHireWaiter={handleHireWaiter}
        onClaimQuest={handleClaimQuest}
        onVisitNeighbor={(nb) => {
          setVisitingNeighbor(nb);
          setActiveModal(null);
          soundEngine.playClick();
        }}
        onGiftNeighbor={handleGiftNeighbor}
      />

      {offlineReport && (
        <div className="modal-backdrop" onClick={() => setOfflineReport(null)}>
          <div className="modal-window" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>☕ Enquanto você esteve fora...</h2>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p>Seus garçons continuaram trabalhando nos últimos <strong>{offlineReport.elapsedMinutes} min</strong>!</p>
              <div className="reward-pills" style={{ justifyContent: 'center', fontSize: 15 }}>
                <span>🍽️ {offlineReport.customersServed} atendidos</span>
                <span>🔥 {offlineReport.dishesFinished} pratos prontos</span>
              </div>
              <div className="reward-pills" style={{ justifyContent: 'center', fontSize: 16 }}>
                <span>+{offlineReport.coinsEarned} 🪙 Café Ouro</span>
                <span>+{offlineReport.xpEarned} XP</span>
              </div>
              <button className="btn-glossy btn-primary" onClick={() => setOfflineReport(null)}>
                Continuar Jogando!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
