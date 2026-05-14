import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface RouteSearchProps {
  routes: string[];
  selectedRoute: string;
  onSelect: (route: string) => void;
  t: (key: any) => string;
}

function getCategory(routeId: string): string {
  if (routeId === 'ALL') return "General";
  
  // Local Council / Smart Selangor
  if (routeId.startsWith('PJ')) return "Petaling Jaya City Bus";
  if (routeId.startsWith('AJ')) return "Smart Selangor Ampang Jaya";
  if (routeId.startsWith('SA')) return "Smart Selangor Shah Alam";
  if (routeId.startsWith('MPS')) return "Smart Selangor Selayang";
  if (routeId.startsWith('KJ')) return "Smart Selangor Kajang";
  if (routeId.startsWith('HLB')) return "Smart Selangor Hulu Langat";
  if (routeId.includes('PAVBJ')) return "Pavilion Shuttle";
  
  if (routeId.startsWith('P') && !routeId.startsWith('PJ')) return "Nadiputra Putrajaya";
  if (routeId.startsWith('B') || routeId.includes('BRT')) return "BRT Sunway Line";
  if (routeId.startsWith('T')) return "Feeder Bus (MRT/LRT)";
  
  const match = routeId.match(/^[A-Z]*(\d)/);
  if (match) {
    switch(match[1]) {
      case '1': return "100s - Jalan Ipoh Corridor";
      case '2': return "200s - Jalan Pahang Corridor";
      case '3': return "300s - Ampang Corridor";
      case '4': return "400s - Cheras Corridor";
      case '5': return "500s - Sungai Besi Corridor";
      case '6': return "600s - Klang Lama Corridor";
      case '7': return "700s - Lebuhraya Persekutuan";
      case '8': return "800s - Damansara Corridor";
    }
  }
  return "Other Routes";
}

export default function RouteSearch({ routes, selectedRoute, onSelect, t }: RouteSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = query.toLowerCase();
    const all = ['ALL', ...routes.filter(r => r !== 'ALL')]; // Ensure ALL is always present
    return all.filter(r => r.toLowerCase().includes(q));
  }, [routes, query]);

  const groupedRoutes = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredRoutes.forEach(r => {
      const cat = getCategory(r);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    });
    return groups;
  }, [filteredRoutes]);

  return (
    <div className="route-search-wrapper" ref={wrapperRef}>
      <div 
        className="route-search-input-box" 
        onClick={() => setIsOpen(true)}
      >
        <Search size={16} className="search-icon" />
        <input 
          type="text" 
          placeholder={t('searchRoute')}
          value={isOpen ? query : (selectedRoute === 'ALL' ? 'All Routes' : selectedRoute)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="route-input"
        />
        <ChevronDown size={16} className="chevron" />
      </div>

      {isOpen && (
        <div className="route-search-dropdown glass-panel">
          {Object.keys(groupedRoutes).length === 0 ? (
            <div className="no-results">{t('noResults')}</div>
          ) : (
            Object.keys(groupedRoutes).sort().map(category => (
              <div key={category} className="route-category">
                <div className="category-header">{category}</div>
                <div className="category-items">
                  {groupedRoutes[category].map(route => (
                    <button
                      key={route}
                      className={`route-item ${selectedRoute === route ? 'active' : ''}`}
                      onClick={() => {
                        onSelect(route);
                        setIsOpen(false);
                        setQuery("");
                      }}
                    >
                      {route === 'ALL' ? 'All Routes' : route}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
