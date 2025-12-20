// Keyboard Shortcuts Manager for Workbench
import { useEffect, useCallback } from 'react';
import { ToolType } from '@/components/workbench/ToolPanel';
import { toast } from 'sonner';

interface ShortcutConfig {
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: ToolType) => void;
  onEscape: () => void;
  onSpaceDown: () => void;
  onSpaceUp: () => void;
}

export const KEYBOARD_SHORTCUTS = [
  { key: 'Z', description: 'Desfazer' },
  { key: 'Shift+Z', description: 'Refazer' },
  { key: 'Espaço', description: 'Pan (arrastar)' },
  { key: '1', description: 'Selecionar' },
  { key: '2', description: 'Vetor de Correção' },
  { key: '3', description: 'Área de Intervenção' },
  { key: '4', description: 'Marcação Cirúrgica' },
  { key: '5', description: 'Anotar' },
  { key: '6', description: 'Borracha' },
  { key: '7', description: 'Medir' },
  { key: '8', description: 'Ângulo' },
  { key: 'Esc', description: 'Sair da ferramenta' },
];

const TOOL_MAP: Record<string, ToolType> = {
  '1': 'select',
  '2': 'correction_vector',
  '3': 'intervention_area',
  '4': 'surgical_marking',
  '5': 'annotate',
  '6': 'eraser',
  '7': 'measure',
  '8': 'angle',
};

export function useKeyboardShortcuts({
  onUndo,
  onRedo,
  onToolChange,
  onEscape,
  onSpaceDown,
  onSpaceUp,
}: ShortcutConfig) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Undo/Redo
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        onRedo();
      } else {
        onUndo();
      }
      return;
    }

    // Tool shortcuts (1-8)
    if (TOOL_MAP[e.key]) {
      e.preventDefault();
      onToolChange(TOOL_MAP[e.key]);
      return;
    }

    // Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }

    // Space for pan
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      onSpaceDown();
      return;
    }
  }, [onUndo, onRedo, onToolChange, onEscape, onSpaceDown]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onSpaceUp();
    }
  }, [onSpaceUp]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
}
