// CollapsiblePanel - Wrapper for collapsible side panels
import { useState, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  children: ReactNode;
  side: 'left' | 'right';
  title: string;
  description?: string;
  defaultOpen?: boolean;
  width?: string;
  icon?: ReactNode;
}

export function CollapsiblePanel({
  children,
  side,
  title,
  description,
  defaultOpen = true,
  width = 'w-72',
  icon,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const ChevronIcon = side === 'left' 
    ? (isOpen ? ChevronLeft : ChevronRight)
    : (isOpen ? ChevronRight : ChevronLeft);

  return (
    <div
      className={cn(
        "shrink-0 h-full min-h-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out relative",
        isOpen ? width : "w-10",
        side === 'left' ? "border-r border-border" : "border-l border-border"
      )}
    >
      {/* Toggle Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-3 z-10 h-6 w-6 bg-card border border-border shadow-sm hover:bg-accent",
              side === 'left' ? "-right-3" : "-left-3"
            )}
            onClick={() => setIsOpen(!isOpen)}
          >
            <ChevronIcon className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side === 'left' ? 'right' : 'left'}>
          {isOpen ? `Fechar ${title.toLowerCase()}` : `Abrir ${title.toLowerCase()}`}
        </TooltipContent>
      </Tooltip>

      {/* Panel Content */}
      {isOpen ? (
        <div className="h-full min-h-0 flex flex-col bg-card">
          {/* Header with title and help */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <div>
                <h3 className="font-semibold text-sm text-foreground">{title}</h3>
                {description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
                )}
              </div>
            </div>
            {description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={side === 'left' ? 'right' : 'left'} className="max-w-[200px]">
                  <p className="text-xs">{description}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>
        </div>
      ) : (
        // Collapsed state - show rotated title
        <div className="h-full flex items-center justify-center bg-card">
          <span 
            className="text-xs font-medium text-muted-foreground whitespace-nowrap"
            style={{ 
              writingMode: 'vertical-rl', 
              textOrientation: 'mixed',
              transform: side === 'left' ? 'rotate(180deg)' : 'none'
            }}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
