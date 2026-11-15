import React from 'react';
import {
  BookOpen,
  ShoppingBag,
  Trophy,
  Users,
  Move,
  Check,
} from 'lucide-react';

export type ActiveModal = 'recipes' | 'shop' | 'quests' | 'neighbors' | null;

interface BottomDockProps {
  activeModal: ActiveModal;
  editMode: boolean;
  claimableQuestsCount: number;
  visitingNeighbor: boolean;
  onOpenModal: (modal: ActiveModal) => void;
  onToggleEditMode: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  activeModal,
  editMode,
  claimableQuestsCount,
  visitingNeighbor,
  onOpenModal,
  onToggleEditMode,
}) => {
  if (visitingNeighbor) {
    return (
      <div className="bottom-dock">
        <div className="neighbor-hint">
          🧂 Clique nos fogões para TEMPERAR ou nas mesas sujas para LIMPAR e ganhar Café Ouro + XP!
        </div>
      </div>
    );
  }

  return (
    <nav className="bottom-dock">
      <button
        className={`dock-btn dock-orange ${activeModal === 'recipes' ? 'active' : ''}`}
        onClick={() => onOpenModal(activeModal === 'recipes' ? null : 'recipes')}
      >
        <BookOpen size={20} />
        <span>Receitas</span>
      </button>

      <button
        className={`dock-btn dock-blue ${activeModal === 'shop' ? 'active' : ''}`}
        onClick={() => onOpenModal(activeModal === 'shop' ? null : 'shop')}
      >
        <ShoppingBag size={20} />
        <span>Loja</span>
      </button>

      <button
        className={`dock-btn dock-gold ${activeModal === 'quests' ? 'active' : ''}`}
        onClick={() => onOpenModal(activeModal === 'quests' ? null : 'quests')}
      >
        <Trophy size={20} />
        <span>Missões</span>
        {claimableQuestsCount > 0 && (
          <span className="badge-count">{claimableQuestsCount}</span>
        )}
      </button>

      <button
        className={`dock-btn dock-purple ${activeModal === 'neighbors' ? 'active' : ''}`}
        onClick={() => onOpenModal(activeModal === 'neighbors' ? null : 'neighbors')}
      >
        <Users size={20} />
        <span>Vizinhos</span>
      </button>

      <button
        className={`dock-btn ${editMode ? 'dock-green active' : 'dock-slate'}`}
        onClick={onToggleEditMode}
      >
        {editMode ? <Check size={20} /> : <Move size={20} />}
        <span>{editMode ? 'Concluir' : 'Decorar'}</span>
      </button>
    </nav>
  );
};
