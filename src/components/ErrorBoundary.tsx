// Barreira de erro de render.
//
// Sem uma barreira, um erro durante o render desmonta a árvore inteira do React e a
// aplicação vira uma tela em branco. Isso já acontecia aqui: os visualizadores 3D
// carregam recursos externos (o .glb do scan, a foto como textura) por suspense, e
// suspense trata "carregando", não trata "falhou" — a promise rejeitada sobe como erro
// de render.
//
// Uma funcionalidade opcional que falha não pode derrubar o resto da tela.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** O que mostrar no lugar do conteúdo que falhou. */
  fallback?: ReactNode;
  /** Chamado uma vez por falha, para registro. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * Quando muda, a barreira volta a tentar renderizar os filhos. Serve para que trocar de
   * foto ou de caso não deixe a área presa no estado de erro anterior.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] erro de render contido:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-foreground">Algo falhou nesta área</p>
          <p className="max-w-md text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
