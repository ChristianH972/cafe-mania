import React, { useEffect, useRef } from 'react';
import {
  Coins,
  Banknote,
  Flame,
  Smile,
  Volume2,
  VolumeX,
  Music,
  Pause,
  Play,
  FastForward,
  Star,
  RotateCcw,
} from 'lucide-react';
import { GameState } from '../types/game';
import { xpForNextLevel } from '../engine/gameLogic';
import { renderCharacterPreview } from '../engine/isoRenderer';

interface TopHudProps {
  state: GameState;
  musicEnabled: boolean;
  visitingNeighborName: string | null;
  onSetSpeed: (speed: 0 | 1 | 2) => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onResetGame: () => void;
  onExitNeighbor: () => void;
  onRenameCafe: (name: string) => void;
}

export const TopHud: React.FC<TopHudProps> = ({
  state,
  musicEnabled,
  visitingNeighborName,
  onSetSpeed,
  onToggleSound,
  onToggleMusic,
  onResetGame,
  onExitNeighbor,
  onRenameCafe,
}) => {
  const nextXp = xpForNextLevel(state.level);
  const xpPct = Math.min(100, Math.round((state.xp / nextXp) * 100));
  const chefCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chef = state.staff.find((s) => s.role === 'chef');

  useEffect(() => {
    if (!chefCanvasRef.current) return;
    renderCharacterPreview(
      chefCanvasRef.current,
      {
        role: 'chef',
        skinColor: chef?.skinColor ?? '#f5cba7',
        shirtColor: chef?.shirtColor ?? '#ffffff',
        hairColor: chef?.hairColor ?? '#4a235a',
        hairStyle: chef?.hairStyle ?? 'classic',
      },
      38,
      40
    );
  }, [chef?.skinColor, chef?.shirtColor, chef?.hairColor, chef?.hairStyle]);

  return (
    <header className="top-hud">
      <div className="hud-left">
        <div className="hud-chef-avatar" title={chef?.name ?? 'Chef'}>
          <canvas ref={chefCanvasRef} />
        </div>
        <div className="level-badge" title={`Nível ${state.level}`}>
          <Star className="level-star" size={26} fill="#ffd700" color="#b8860b" />
          <span>{state.level}</span>
        </div>
        <div className="cafe-identity">
          <div
            className="cafe-title"
            style={{ cursor: visitingNeighborName ? 'default' : 'pointer' }}
            title={visitingNeighborName ? undefined : 'Clique para renomear seu Café'}
            onClick={() => {
              if (visitingNeighborName) return;
              const next = window.prompt('Nome do seu Café Mania:', state.cafeName);
              if (next && next.trim()) onRenameCafe(next.trim().slice(0, 26));
            }}
          >
            {visitingNeighborName ? `Visitando: ${visitingNeighborName}` : `${state.cafeName} ✏️`}
          </div>
          <div className="xp-bar-wrap" title={`${state.xp} / ${nextXp} XP`}>
            <div className="xp-bar-fill" style={{ width: `${xpPct}%` }} />
            <span className="xp-bar-text">
              XP {state.xp}/{nextXp}
            </span>
          </div>
        </div>
      </div>

      <div className="hud-stats">
        <div className="stat-pill coins" title="Café Ouro">
          <Coins size={18} color="#f39c12" />
          <span>{state.coins.toLocaleString('pt-BR')}</span>
        </div>
        <div className="stat-pill cash" title="Café Grana">
          <Banknote size={18} color="#27ae60" />
          <span>{state.cash}</span>
        </div>
        <div className="stat-pill rating" title="Avaliação do Café (máx 105%)">
          <Smile size={18} color="#2ecc71" />
          <span>{Math.round(state.rating)}%</span>
        </div>
        <div className="stat-pill buzz" title="Popularidade (atrai mais clientes)">
          <Flame size={18} color="#e74c3c" />
          <span>{state.buzz}%</span>
        </div>
      </div>

      <div className="hud-controls">
        {visitingNeighborName ? (
          <button className="btn-glossy btn-danger" onClick={onExitNeighbor}>
            Voltar ao Meu Café
          </button>
        ) : (
          <>
            <div className="speed-group">
              <button
                className={`icon-btn ${state.speed === 0 ? 'active' : ''}`}
                onClick={() => onSetSpeed(0)}
                title="Pausar"
              >
                <Pause size={16} />
              </button>
              <button
                className={`icon-btn ${state.speed === 1 ? 'active' : ''}`}
                onClick={() => onSetSpeed(1)}
                title="Velocidade Normal (1x)"
              >
                <Play size={16} />
              </button>
              <button
                className={`icon-btn ${state.speed === 2 ? 'active' : ''}`}
                onClick={() => onSetSpeed(2)}
                title="Velocidade Rápida (2x)"
              >
                <FastForward size={16} />
              </button>
            </div>

            <button
              className="icon-btn"
              onClick={onToggleSound}
              title={state.soundEnabled ? 'Desativar Som' : 'Ativar Som'}
            >
              {state.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button
              className={`icon-btn ${musicEnabled ? 'active' : ''}`}
              onClick={onToggleMusic}
              title={musicEnabled ? 'Pausar Música Ambiente' : 'Tocar Música Lounge'}
            >
              <Music size={16} />
            </button>

            <button
              className="icon-btn"
              onClick={onResetGame}
              title="Reiniciar Save"
            >
              <RotateCcw size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
