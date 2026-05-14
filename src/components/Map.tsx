"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, CircleMarker, ZoomControl, LayerGroup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, MapPin, BellRing, Navigation, Train } from 'lucide-react';
import { BusData } from '../types';

// Fix for default Leaflet icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icon for Buses
const createStopIcon = (type: 'origin' | 'destination') => {
  let bgColor = type === 'origin' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'; // Transparent green/red
  let borderColor = type === 'origin' ? '#10b981' : '#ef4444';
  let size = 32;
  
  return L.divIcon({
    className: 'custom-special-stop-marker',
    html: `<div class="stop-icon-container" style="background: ${bgColor}; width: ${size}px; height: ${size}px; border-radius: 6px; position: relative; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); border: 2px solid ${borderColor}; backdrop-filter: blur(2px);">
             <div style="width: 8px; height: 8px; background: ${borderColor}; border-radius: 50%;"></div>
           </div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
};

const createRailStationIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-rail-station-marker',
    html: `<div style="background: white; width: 14px; height: 14px; border-radius: 50%; border: 3px solid ${color}; box-shadow: 0 0 4px rgba(0,0,0,0.5); box-sizing: border-box;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

const createStationLocationIcon = (name: string, badges: {short: string, color: string}[]) => {
  const badgesHtml = `
    <div class="rail-badge-container" style="display: flex; gap: 4px; align-items: center; white-space: nowrap; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); padding: 4px 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 6px rgba(0,0,0,0.3); position: absolute; left: 100%; top: 50%; transform: translate(8px, -50%);">
      <span style="color: #fff; font-size: 12px; font-weight: bold; margin-right: 4px;">${name}</span>
      ${badges.map(b => `<span style="background: #${b.color}; color: #fff; padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; line-height: 1;">${b.short}</span>`).join('')}
    </div>
  `;

  return L.divIcon({
    className: 'custom-station-location-marker',
    html: `<div class="station-location-icon-container" style="background: #ffffff; border: 2px solid #334155; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
             ${badgesHtml}
             <div style="width: 8px; height: 8px; background: #334155; border-radius: 50%;"></div>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function findNearestStopIndex(busLat: number, busLon: number, stops: {lat:number, lon:number}[]) {
  if (!stops || stops.length === 0) return -1;
  let minDistance = Infinity;
  let nearestIndex = -1;
  for (let i = 0; i < stops.length; i++) {
     const dist = getDistance(busLat, busLon, stops[i].lat, stops[i].lon);
     if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
     }
  }
  return nearestIndex;
}
const createBusIcon = (bus: BusData) => {
  let directionHtml = '';
  let isStationary = true;

  if (bus.speed !== undefined && bus.speed > 0.5) {
    isStationary = false;
    // Rotate an arrow SVG based on the bearing
    const rotation = bus.bearing || 0;
    directionHtml = `
      <div class="bus-direction-ring" style="transform: rotate(${rotation}deg);">
        <svg viewBox="0 0 24 24" width="16" height="16" class="direction-arrow">
          <path fill="#3b82f6" d="M12 2L22 22L12 18L2 22L12 2Z" stroke="white" stroke-width="2" />
        </svg>
      </div>
    `;
  } else {
    // Stationary indicator (e.g. a small pause/stop square or dot)
    directionHtml = `
      <div class="bus-stationary-indicator">
        <div class="stationary-dot"></div>
      </div>
    `;
  }

  return L.divIcon({
    className: 'custom-bus-marker',
    html: `
      <div class="bus-icon-wrapper">
        ${directionHtml}
        <div class="bus-icon-container ${isStationary ? 'stationary' : ''}">
          <div class="bus-route-label">${bus.routeId}</div>
        </div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
};

const createTargetIcon = () => {
  return L.divIcon({
    className: 'custom-target-marker',
    html: `<div class="target-icon-container"><div class="pulse"></div><div class="pin">📍</div></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
};

const createUserIcon = () => {
  return L.divIcon({
    className: 'custom-user-marker',
    html: `<div style="width: 16px; height: 16px; background-color: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};





interface MapProps {
  buses: BusData[];
  targetLocation: [number, number] | null;
  setTargetLocation: (loc: [number, number] | null) => void;
  radius: number;
  selectedRoute: string;
  shapes: [number, number][][];
  stops?: {id:string, name:string, lat:number, lon:number}[];
  selectedStopId?: string | null;
  onStopSelect?: (id: string) => void;
  routeInterchanges?: Record<string, any[]>;
  isOneWay?: boolean;
  showRailNetwork?: boolean;
  railMapData?: {shapes: any[], stations: any[]} | null;
  toggleRailNetwork?: () => void;
  t: (key: any) => string;
}

export default function Map({ buses, targetLocation, setTargetLocation, radius, selectedRoute, shapes, stops, selectedStopId, onStopSelect, routeInterchanges, isOneWay, showRailNetwork, railMapData, toggleRailNetwork, t }: MapProps) {
  const mapRef = useRef<L.Map>(null);
  
  // Center on KL initially, or specific route center if we had one
  const defaultCenter: [number, number] = [3.1390, 101.6869]; // KL Center
  const [center, setCenter] = useState<[number, number]>(defaultCenter);
  
  // GPS Tracking State
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);

  // Day/Night Mode State
  const [isDayMode, setIsDayMode] = useState(false);
  
  useEffect(() => {
    const hour = new Date().getHours();
    setIsDayMode(hour >= 7 && hour < 19);
  }, []);

  // Initialize Geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setLocationAccuracy(position.coords.accuracy);
        },
        (error) => {
          console.warn("Geolocation error:", error.message);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const handleLocateMe = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo(userLocation, 16, { duration: 1 });
    } else {
      alert("Locating... Please ensure location permissions are granted.");
    }
  };

  const resetView = () => {
    if (selectedRoute && mapRef.current) {
      const routeBuses = selectedRoute === 'ALL' ? buses : buses.filter(b => b.routeId === selectedRoute);
      if (routeBuses.length > 0) {
         const avgLat = routeBuses.reduce((sum, b) => sum + b.latitude, 0) / routeBuses.length;
         const avgLon = routeBuses.reduce((sum, b) => sum + b.longitude, 0) / routeBuses.length;
         mapRef.current.flyTo([avgLat, avgLon], 13, { duration: 0.8 });
      } else if (shapes && shapes.length > 0) {
         const firstShape = shapes[0];
         if (firstShape && firstShape.length > 0) {
            const midIndex = Math.floor(firstShape.length / 2);
            mapRef.current.flyTo(firstShape[midIndex], 13, { duration: 0.8 });
         }
      }
    }
  };

  const prevRouteRef = useRef<string | null>(null);

  // Only auto-center on the selected route when selectedRoute changes
  useEffect(() => {
     // initial snap without animation when switching routes
     if (selectedRoute && selectedRoute !== prevRouteRef.current && mapRef.current) {
        const routeBuses = selectedRoute === 'ALL' ? buses : buses.filter(b => b.routeId === selectedRoute);
        if (routeBuses.length > 0) {
           const avgLat = routeBuses.reduce((sum, b) => sum + b.latitude, 0) / routeBuses.length;
           const avgLon = routeBuses.reduce((sum, b) => sum + b.longitude, 0) / routeBuses.length;
           mapRef.current.setView([avgLat, avgLon], 13);
        } else if (shapes && shapes.length > 0) {
           const firstShape = shapes[0];
           if (firstShape && firstShape.length > 0) {
              const midIndex = Math.floor(firstShape.length / 2);
              mapRef.current.setView(firstShape[midIndex], 13);
           }
        }
        prevRouteRef.current = selectedRoute;
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute, buses, shapes]);

  // Fly to selected stop
  useEffect(() => {
    if (selectedStopId && stops && mapRef.current) {
      const stop = stops.find(s => s.id === selectedStopId);
      if (stop) {
        mapRef.current.flyTo([stop.lat, stop.lon], 16, { duration: 0.8 });
      }
    }
  }, [selectedStopId, stops]);

  return (
    <div className="map-wrapper">
      <MapContainer 
        center={defaultCenter} 
        zoom={12} 
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        ref={mapRef}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          url={isDayMode ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {shapes && shapes.map((shape, index) => {
          let currentShape = [...shape];
          // Connect Origin and Destination stops to the shape line to prevent gaps
          if (stops && stops.length > 0) {
            if (index === 0) {
              currentShape = [[stops[0].lat, stops[0].lon], ...currentShape];
            }
            if (index === shapes.length - 1) {
              currentShape = [...currentShape, [stops[stops.length - 1].lat, stops[stops.length - 1].lon]];
            }
          }
          
          return (
            <div key={`shape-group-${index}`}>
              {/* Outline for High Visibility */}
              <Polyline 
                positions={currentShape} 
                pathOptions={{ color: '#ffffff', weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round' }} 
              />
              {/* Main Vivid Route Line */}
              <Polyline 
                positions={currentShape} 
                pathOptions={{ color: '#10b981', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} 
              />
            </div>
          );
        })}

        {stops && stops.map((stop, index) => {
          const isSelected = stop.id === selectedStopId;
          const isOrigin = index === 0;
          const isDestination = index === stops.length - 1;
          
          if (isOrigin || isDestination) {
            let iconType: 'origin'|'destination' = isOrigin ? 'origin' : 'destination';
            
            return (
              <Marker
                key={`stop-${selectedRoute}-${stop.id}`}
                position={[stop.lat, stop.lon]}
                icon={createStopIcon(iconType)}
                eventHandlers={{ click: () => onStopSelect && onStopSelect(stop.id) }}
              >
                <Popup>
                  <div className="text-slate-800 font-medium">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Station</p>
                    <p>{stop.name}</p>
                  </div>
                </Popup>
              </Marker>
            );
          }

          return (
            <CircleMarker
              key={`stop-${selectedRoute}-${stop.id}`}
              center={[stop.lat, stop.lon]}
              radius={isSelected ? 8 : 4}
              pathOptions={{ 
                color: isSelected ? '#ffffff' : '#ffffff', 
                fillColor: isSelected ? '#f59e0b' : '#0ea5e9', 
                fillOpacity: isSelected ? 1 : 0.8, 
                weight: isSelected ? 2 : 1 
              }}
              eventHandlers={{
                click: () => onStopSelect && onStopSelect(stop.id)
              }}
            >
              <Popup>
                <div className="text-slate-800 font-medium">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Bus Stop</p>
                  <p>{stop.name}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Render physical Train Station Locations and Walking Paths */}
        {routeInterchanges && routeInterchanges[selectedRoute] && routeInterchanges[selectedRoute].map((interchange: any, idx: number) => {
           if (!interchange.lat || !interchange.lon) return null;
           
           const badges = interchange.railRoutes.map((r: any) => ({ short: r.short, color: r.color }));
           const connectedBusStops = stops?.filter(s => interchange.busStopIds && interchange.busStopIds.includes(s.id)) || [];
           
           return (
             <div key={`station-group-${idx}`}>
               <Marker 
                 position={[interchange.lat, interchange.lon]}
                 icon={createStationLocationIcon(interchange.name, badges)}
               >
                 <Popup>
                    <div className="text-slate-800 font-medium">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Train Station</p>
                      <p>{interchange.name}</p>
                    </div>
                 </Popup>
               </Marker>
               
               {/* Draw dotted walking paths */}
               {connectedBusStops.map(bs => (
                 <Polyline 
                   key={`walk-${interchange.name}-${bs.id}`}
                   positions={[[interchange.lat, interchange.lon], [bs.lat, bs.lon]]}
                   pathOptions={{ color: '#64748b', weight: 3, dashArray: '6, 6', opacity: 0.8 }}
                 />
               ))}
             </div>
           );
        })}

        {buses
          .filter(b => selectedRoute === 'ALL' || b.routeId === selectedRoute)
          .map((bus) => {
            const nearestIndex = findNearestStopIndex(bus.latitude, bus.longitude, stops || []);
            let nextStopStr = 'Unknown';
            let progressStr = '';
            if (stops && nearestIndex >= 0) {
               // If bus is stationary or very close to nearest stop, we might say it's AT the stop.
               // For simplicity, let's just say "Approaching Stop X" or the nearest stop itself.
               const currentOrNext = nearestIndex < stops.length - 1 ? nearestIndex + 1 : nearestIndex;
               nextStopStr = stops[currentOrNext].name;
               progressStr = `(Stop ${currentOrNext + 1}/${stops.length})`;
            }

            return (
              <Marker 
                key={bus.id} 
                position={[bus.latitude, bus.longitude]} 
                icon={createBusIcon(bus)}
              >
                <Popup className="bus-popup">
                  <div className="popup-content">
                    <h3>Route: {bus.routeId}</h3>
                    <p>Vehicle ID: {bus.id}</p>
                    <p>Status: {bus.speed !== undefined && bus.speed > 0.5 ? 'Moving' : 'Stationary'}</p>
                    {bus.speed !== undefined && bus.speed > 0.5 && <p>Speed: {(bus.speed * 3.6).toFixed(1)} km/h</p>}
                    {bus.bearing !== undefined && <p>Heading: {bus.bearing}°</p>}
                    <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}>
                       <p style={{ color: '#0ea5e9', fontWeight: 'bold' }}>Next Stop: {nextStopStr}</p>
                       <p style={{ fontSize: '10px' }}>Progress: {progressStr}</p>
                    </div>
                    <p style={{ marginTop: '8px' }}>Last Updated: {new Date(bus.timestamp * 1000).toLocaleTimeString()}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {targetLocation && (
          <>
            <Marker 
              position={targetLocation}
              icon={createTargetIcon()}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  setTargetLocation([position.lat, position.lng]);
                },
              }}
            >
              <Popup>
                Your notification target. Drag to move.
              </Popup>
            </Marker>
            <Circle 
              center={targetLocation} 
              radius={radius} 
              pathOptions={{ color: '#00f2fe', fillColor: '#4facfe', fillOpacity: 0.2 }}
            />
          </>
        )}

        {/* Full Rail Network Layer */}
        {showRailNetwork && railMapData && (
          <LayerGroup>
            {railMapData.shapes.map((shape, idx) => (
              <Polyline 
                key={`rail-shape-${idx}`}
                positions={shape.points}
                pathOptions={{ color: shape.color, weight: 4, opacity: 0.8 }}
              />
            ))}
            {railMapData.stations.map((station, idx) => (
              <Marker
                key={`rail-station-${idx}`}
                position={[station.lat, station.lon]}
                icon={createRailStationIcon(station.color)}
                zIndexOffset={500}
              >
                <Tooltip direction="bottom" offset={[0, 5]} opacity={0.8} permanent={false}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{station.name}</div>
                </Tooltip>
                <Popup className="station-popup">
                  <div style={{ padding: '4px' }}>
                    <strong style={{ color: 'var(--text-main)', fontSize: '14px', display: 'block', marginBottom: '2px' }}>{station.name}</strong>
                    <span style={{ fontSize: '11px', color: 'white', background: station.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{station.routeId} Station</span>
                    {station.connectedTrains && station.connectedTrains.length > 0 && (
                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--panel-border)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('connectingTrains')}:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {station.connectedTrains.map((train: any) => (
                            <span key={train.id} style={{ fontSize: '10px', background: train.color, color: 'white', fontWeight: 'bold', padding: '2px 4px', borderRadius: '4px' }}>
                              {train.id}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {station.connectedBuses && station.connectedBuses.length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--panel-border)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Connecting Buses:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {station.connectedBuses.map((bus: string) => (
                            <span key={bus} style={{ fontSize: '10px', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', padding: '2px 4px', borderRadius: '4px' }}>
                              {bus}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        )}

        {/* User GPS Location */}
        {userLocation && (
          <>
            <Marker position={userLocation} icon={createUserIcon()} zIndexOffset={1000}>
              <Popup>{t('youAreHere')}</Popup>
            </Marker>
            {locationAccuracy && locationAccuracy > 20 && (
              <Circle
                center={userLocation}
                radius={locationAccuracy}
                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, stroke: false }}
              />
            )}
          </>
        )}
      </MapContainer>
      {/* Floating Action Buttons */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toggleRailNetwork && (
          <button 
            onClick={toggleRailNetwork}
            className="glass-panel"
            style={{ 
              padding: '12px', 
              borderRadius: '50%', 
              cursor: 'pointer', 
              border: `1px solid ${showRailNetwork ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255,255,255,0.2)'}`, 
              background: showRailNetwork ? 'rgba(56, 189, 248, 0.2)' : 'var(--panel-bg)',
              boxShadow: showRailNetwork ? '0 0 15px rgba(56, 189, 248, 0.4)' : '0 4px 6px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={showRailNetwork ? "Hide Rail Network" : "Show Rail Network"}
          >
            <Train size={24} color={showRailNetwork ? "#38bdf8" : "var(--text-muted)"} />
          </button>
        )}

        <button 
          onClick={handleLocateMe}
          className="glass-panel"
          style={{ 
            padding: '12px', 
            borderRadius: '50%', 
            cursor: 'pointer', 
            border: '1px solid rgba(255,255,255,0.2)', 
            background: 'var(--panel-bg)',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={t('locateMe')}
        >
          <Navigation size={24} color="#3b82f6" fill={userLocation ? "#3b82f6" : "none"} />
        </button>

        <button 
          onClick={resetView}
          className="glass-panel"
          style={{ 
            padding: '12px', 
            borderRadius: '50%', 
            cursor: 'pointer', 
            border: '1px solid rgba(255,255,255,0.2)', 
            background: 'var(--panel-bg)',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={t('resetView')}
        >
          <MapPin size={24} color="#10b981" />
        </button>
      </div>
    </div>
  );
}
