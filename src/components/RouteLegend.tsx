import React, { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, ChevronRight, MapPin, Search } from 'lucide-react';

interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface RouteLegendProps {
  stops: Stop[];
  selectedRoute?: string;
  selectedStopId: string | null;
  onStopSelect: (stopId: string) => void;
  activeBuses?: any[];
  t: (key: any) => string;
}

export default function RouteLegend({ stops, selectedRoute, selectedStopId, onStopSelect, activeBuses, t }: RouteLegendProps) {
  const [isOpen, setIsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll to selected stop
  useEffect(() => {
    if (selectedStopId && isOpen && scrollRef.current) {
      const el = itemRefs.current[selectedStopId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedStopId, isOpen]);

  // If no specific route is selected or no stops available, don't show the panel
  if (selectedRoute === 'ALL' || !stops || stops.length === 0) {
    return null;
  }

  return (
    <div className={`route-legend-container ${isOpen ? 'open' : 'closed'}`}>
      {/* Toggle Button */}
      <button 
        className="legend-toggle-btn glass-panel"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? t('hideRouteLegend') : t('showRouteLegend')}
      >
        <MapIcon size={20} />
        {isOpen ? <ChevronRight size={18} /> : null}
      </button>

      {/* Main Panel */}
      <div className="legend-panel glass-panel">
        <div className="legend-header">
          <h3><MapIcon size={16} /> {t('routeLegend')}</h3>
          {selectedRoute && <span className="route-badge">{selectedRoute}</span>}
        </div>
        
        <div className="legend-stats">
          <p>{stops.length} {t('stopsTotal')}</p>
        </div>

        <div className="legend-timeline" ref={scrollRef}>
          {stops.map((stop, index) => {
            const isFirst = index === 0;
            const isLast = index === stops.length - 1;
            const isActive = selectedStopId === stop.id;

            return (
              <div 
                key={`${stop.id}-${index}`} 
                className={`timeline-item ${isActive ? 'active' : ''}`}
                ref={el => { itemRefs.current[stop.id] = el; }}
                onClick={() => onStopSelect(stop.id)}
              >
                <div className="timeline-graphic">
                  {/* The vertical line connecting stops */}
                  {!isFirst && <div className="timeline-line-top"></div>}
                  
                  {/* The dot for the stop */}
                  <div className={`timeline-dot ${isActive ? 'glow' : ''}`}></div>
                  
                  {/* The vertical line connecting to the next stop */}
                  {!isLast && <div className="timeline-line-bottom"></div>}
                </div>
                
                <div className="timeline-content">
                  <span className="stop-name">{stop.name}</span>
                  {isFirst && <span className="stop-badge origin">{t('origin')}</span>}
                  {isLast && <span className="stop-badge destination">{t('destination')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
