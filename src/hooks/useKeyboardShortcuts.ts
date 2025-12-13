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
  { key: '2', description: 'Puxar Pele' },
  { key: '3', description: 'Volume' },
  { key: '4', description: 'Incisão' },
  { key: '5', description: 'Sutura' },
  { key: '6', description: 'Anotar' },
  { key: '7', description: 'Borracha' },
  { key: 'Esc', description: 'Sair da ferramenta' },
];

const TOOL_MAP: Record<string, ToolType> = {
  '1': 'select',
  '2': 'warp',
  '3': 'volume',
  '4': 'incision',
  '5': 'suture',
  '6': 'annotate',
  '7': 'eraser',
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

    // Tool shortcuts (1-7)
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
