"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Bus, MapPin, BellRing, Settings, RefreshCw, Crosshair, Menu, X, Train } from 'lucide-react';
import { BusData } from '../types';
import RouteSearch from '../components/RouteSearch';
import NotificationPanel from '../components/NotificationPanel';
import RouteLegend from '../components/RouteLegend';
import { Language, getTranslation } from '../i18n';

// Dynamically import Map component with SSR disabled
const Map = dynamic(() => import('../components/Map'), { 
  ssr: false,
  loading: () => <div className="map-loading"><RefreshCw className="spin-icon" size={40} /><p>Loading Map...</p></div>
});

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



function sendPushNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

function playNotificationSound() {
  if (typeof window !== 'undefined') {
    const audio = new Audio('/bell.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
  }
}

function getCurrentFrequency(frequencies: any) {
  if (!frequencies) return null;
  const now = new Date();
  const day = now.getDay();
  let serviceId = 'MonFri';
  if (day === 0) serviceId = 'Sun';
  if (day === 6) serviceId = 'Sat';
  
  const h = now.getHours();
  const m = now.getMinutes();
  const nowSecs = h * 3600 + m * 60 + now.getSeconds();
  
  const dayFreqs = frequencies[serviceId];
  if (!dayFreqs) return null;
  
  const result: Record<string, number | null> = {};
  for (const dir of ['0', '1']) {
    const dirFreqs = dayFreqs[dir] || [];
    let currentHeadway = null;
    for (const f of dirFreqs) {
       const [sh, sm, ss] = f.start.split(':').map(Number);
       const [eh, em, es] = f.end.split(':').map(Number);
       const startSecs = sh * 3600 + sm * 60 + (ss || 0);
       const endSecs = eh * 3600 + em * 60 + (es || 0);
       if (nowSecs >= startSecs && nowSecs <= endSecs) {
         currentHeadway = f.headway;
         break;
       }
    }
    result[dir] = currentHeadway;
  }
  return result;
}

function getRailSchedule(schedules: any, dir: string) {
  if (!schedules) return null;
  const now = new Date();
  const day = now.getDay();
  let serviceId = 'MonFri';
  if (day === 0) serviceId = 'Sun';
  if (day === 6) serviceId = 'Sat';
  
  const dayScheds = schedules[serviceId];
  if (!dayScheds) return null;
  
  const dirScheds = dayScheds[dir];
  if (!dirScheds || dirScheds.length === 0) return null;
  
  const h = now.getHours();
  const m = now.getMinutes();
  const currentTotal = h * 60 + m;
  
  let last = null;
  let next = null;
  
  for (const timeStr of dirScheds) {
    const [th, tm] = timeStr.split(':').map(Number);
    const timeTotal = th * 60 + tm;
    if (timeTotal <= currentTotal) {
      last = timeStr;
    } else if (timeTotal > currentTotal && !next) {
      next = timeStr;
    }
  }
  
  return { last, next };
}

export default function Home() {
  const [lang, setLang] = useState<Language>('en');
  const t = useCallback((key: Parameters<typeof getTranslation>[1]) => getTranslation(lang, key), [lang]);

  const [buses, setBuses] = useState<BusData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedRoute, setSelectedRoute] = useState<string>('T2020');
  const [routeShapes, setRouteShapes] = useState<Record<string, [number, number][][]>>({});
  const [routeStops, setRouteStops] = useState<Record<string, {id:string, name:string, lat:number, lon:number}[][]>>({});
  const [routeSchedules, setRouteSchedules] = useState<Record<string, Record<string, string[]>>>({});
  const [routeInterchanges, setRouteInterchanges] = useState<Record<string, any[]>>({});
  const [selectedDirection, setSelectedDirection] = useState<number>(0);
  
  // Notification states
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [targetStopId, setTargetStopId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(3); // Default 3 stops
  const [notifiedBuses, setNotifiedBuses] = useState<Set<string>>(new Set());
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);

  // Weather State
  const [weather, setWeather] = useState<{temp: number, code: number} | null>(null);

  // Toast Notification State
  const [toasts, setToasts] = useState<{id: number, message: string}[]>([]);

  const addToast = useCallback((msg: string) => {
    setToasts(prev => {
      if (prev.some(t => t.message === msg)) return prev;
      return [...prev, { id: Date.now() + Math.random(), message: msg }];
    });
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Rail Network State
  const [showRailNetwork, setShowRailNetwork] = useState(false);
  const [railMapData, setRailMapData] = useState<{shapes: any[], stations: any[]} | null>(null);
  const railNetworkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Toggle Rail Network with 1 minute timer
  const toggleRailNetwork = useCallback(async () => {
    if (showRailNetwork) {
       setShowRailNetwork(false);
       if (railNetworkTimerRef.current) clearTimeout(railNetworkTimerRef.current);
    } else {
       if (!railMapData) {
         try {
           const res = await fetch('/rail_map.json');
           const data = await res.json();
           setRailMapData(data);
         } catch (e) {
           console.error("Failed to load rail map", e);
         }
       }
       setShowRailNetwork(true);
       if (railNetworkTimerRef.current) clearTimeout(railNetworkTimerRef.current);
       railNetworkTimerRef.current = setTimeout(() => {
          setShowRailNetwork(false);
          addToast("Rail Network auto-hidden after 1 minute");
       }, 60000);
    }
  }, [showRailNetwork, railMapData, addToast]);


  // Route change timeout logic
  useEffect(() => {
    const timer = setTimeout(() => {
      addToast(t('pleaseRefresh')); 
      playNotificationSound();
    }, 10 * 1000); // 10 seconds

    return () => clearTimeout(timer);
  }, [selectedRoute, t]);

  // Manual close required for toast now.

  // Timetable tracking
  const alertedSchedules = useRef<Set<string>>(new Set());

  const fetchBuses = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/buses');
      const data = await res.json();
      if (data.success) {
        setBuses((prevBuses: BusData[]) => {
          const now = Date.now();
          const newBuses = data.buses.map((b: BusData) => ({ ...b, localLastSeen: now }));
          
          const busMap = new globalThis.Map<string, BusData>();
          
          // Keep old buses that haven't expired (2 minutes TTL)
          prevBuses.forEach((b: BusData) => {
             if (now - (b.localLastSeen || now) < 2 * 60 * 1000) {
               busMap.set(b.id, b);
             }
          });
          
          // Add or update with fresh buses
          newBuses.forEach((b: BusData) => {
             busMap.set(b.id, b);
          });
          
          return Array.from(busMap.values());
        });
        setLastUpdated(new Date());
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to fetch data");
    } finally {
      setIsFetching(false);
    }
  }, []);

  // Poll every 15 seconds
  useEffect(() => {
    fetchBuses();
    const interval = setInterval(fetchBuses, 15000);
    return () => clearInterval(interval);
  }, [fetchBuses]);

  // Request Notification Permission
  useEffect(() => {
    if (!notificationsEnabled) return;

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
          if (permission !== 'granted') {
            setNotificationsEnabled(false);
            alert('Notification permission denied. Please allow notifications in your browser settings.');
          }
        });
      }
    } else {
      setNotificationsEnabled(false);
      alert('Push notifications are not supported on this browser/device (e.g. older iOS Safari).');
    }
  }, [notificationsEnabled]);

  // Fetch shapes and stops once on mount
  useEffect(() => {
    fetch('/shapes.json').then(res => res.json()).then(setRouteShapes).catch(console.error);
    fetch('/stops.json').then(res => res.json()).then(setRouteStops).catch(console.error);
    fetch('/schedules.json').then(res => res.json()).then(setRouteSchedules).catch(console.error);
    fetch('/interchanges.json').then(res => res.json()).then(setRouteInterchanges).catch(console.error);
    
    // Fetch Weather
    fetch('https://api.open-meteo.com/v1/forecast?latitude=3.139&longitude=101.686&current=weather_code,temperature_2m')
      .then(res => res.json())
      .then(data => {
         if (data.current) {
            setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
         }
      }).catch(console.error);

    // Check Day/Night mode
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 19) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, []);


  // Timetable Watcher (Dynamic for selected route)
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      
      const schedule = routeSchedules[selectedRoute]?.[selectedDirection];
      if (!schedule) return;

      for (const timeStr of schedule) {
        const [schH, schM] = timeStr.split(':').map(Number);
        
        // Convert to minutes since midnight for easy comparison
        const nowMins = h * 60 + m;
        const schMins = schH * 60 + schM;
        
        // If bus is between 5 and 10 minutes late
        if (nowMins - schMins >= 5 && nowMins - schMins < 10) {
           const scheduleKey = `${now.toDateString()}-${selectedRoute}-${selectedDirection}-${timeStr}`;
           if (!alertedSchedules.current.has(scheduleKey)) {
              // Check if any bus is near the origin stop
              const stops = routeStops[selectedRoute]?.[selectedDirection];
              if (stops && stops.length > 0) {
                 const origin = stops[0];
                 const activeBuses = buses.filter(b => b.routeId === selectedRoute && (b.directionId === undefined || b.directionId === selectedDirection));
                 
                 // Are any buses near origin (within 1000m)?
                 let busAtOrigin = false;
                 for (const b of activeBuses) {
                    if (getDistance(b.latitude, b.longitude, origin.lat, origin.lon) < 1000) {
                       busAtOrigin = true;
                       break;
                    }
                 }
                 
                 if (!busAtOrigin) {
                    sendPushNotification(`Route ${selectedRoute} Delay`, `No bus detected at origin for the ${timeStr} scheduled departure.`);
                    alertedSchedules.current.add(scheduleKey);
                 }
              }
           }
        }
      }
    };
    
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, [buses, routeStops, routeSchedules, selectedRoute, selectedDirection]);

  // Stop-based Arrival Notifications
  useEffect(() => {
    if (!notificationsEnabled || !targetStopId || buses.length === 0) return;

    const stops = routeStops[selectedRoute]?.[selectedDirection] || [];
    const targetStopIndex = stops.findIndex(s => s.id === targetStopId);
    if (targetStopIndex === -1) return;

    const filteredBuses = buses.filter(b => b.routeId === selectedRoute);
    
    filteredBuses.forEach(bus => {
      const busIndex = findNearestStopIndex(bus.latitude, bus.longitude, stops);
      
      if (busIndex !== -1) {
         // Bus is approaching if its index is before the target index, and within threshold
         // e.g. target is 10, bus is 7. diff is 3.
         const stopsAway = targetStopIndex - busIndex;
         
         if (stopsAway >= 0 && stopsAway <= threshold) {
            if (!notifiedBuses.has(bus.id)) {
              addToast(t('busArriving'));
              playNotificationSound();
              // Optionally still trigger native push if enabled
              sendPushNotification(`Bus Approaching!`, t('busArriving'));
              
              setNotifiedBuses(prev => {
                const next = new Set(prev);
                next.add(bus.id);
                return next;
              });
            }
         } else if (stopsAway < 0 || stopsAway > threshold + 1) {
            // Bus has passed the stop or is far away, reset notification state
            if (notifiedBuses.has(bus.id)) {
                setNotifiedBuses(prev => {
                    const next = new Set(prev);
                    next.delete(bus.id);
                    return next;
                });
            }
         }
      }
    });
  }, [buses, targetStopId, threshold, notificationsEnabled, selectedRoute, routeStops, selectedDirection, notifiedBuses]);

  const activeRouteIds = buses.map(b => b.routeId);
  const staticRouteIds = Object.keys(routeStops);
  const uniqueRoutes = Array.from(new Set([...activeRouteIds, ...staticRouteIds])).sort();
  
  if (!uniqueRoutes.includes(selectedRoute)) uniqueRoutes.push(selectedRoute);

  const activeBuses = buses.filter(b => selectedRoute === 'ALL' || (b.routeId === selectedRoute && (b.directionId === undefined || b.directionId === selectedDirection)));

  const formatTimeUntil = (mins: number) => {
    if (mins < 60) return `${mins}${t('minsDepart')}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m depart`; // Can adjust to t('hours') and t('mins') if needed
  };

  const formatTimeAgo = (mins: number) => {
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m ago`;
  };

  const sortedInterchanges = useMemo(() => {
     if (!routeInterchanges[selectedRoute]) return [];
     const interchanges = [...routeInterchanges[selectedRoute]];
     const currentStops = routeStops[selectedRoute]?.[selectedDirection] || [];
     
     const getStopIndex = (interchange: any) => {
        let minIndex = Infinity;
        if (!interchange.busStopIds) return minIndex;
        interchange.busStopIds.forEach((id: string) => {
           const idx = currentStops.findIndex(s => s.id === id);
           if (idx !== -1 && idx < minIndex) {
              minIndex = idx;
           }
        });
        return minIndex;
     };
     
     interchanges.sort((a, b) => getStopIndex(a) - getStopIndex(b));
     return interchanges.filter(i => getStopIndex(i) !== Infinity);
  }, [routeInterchanges, routeStops, selectedRoute, selectedDirection]);

  let routeScheduleStatus: any = null;
  const currentSchedule = routeSchedules[selectedRoute]?.[selectedDirection];
  
  if (currentSchedule && currentSchedule.length > 0) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let last = null;
    let next = null;
    for (const timeStr of currentSchedule) {
      const [h, m] = timeStr.split(':').map(Number);
      const schMins = h * 60 + m;
      if (schMins <= nowMins) {
        last = { timeStr, minsAgo: nowMins - schMins };
      } else if (!next) {
        next = { timeStr, minsUntil: schMins - nowMins };
      }
    }
    
    if (!next) {
      const firstBus = currentSchedule[0];
      const [h, m] = firstBus.split(':').map(Number);
      next = { timeStr: firstBus + ' ' + t('tomorrow'), minsUntil: (24 * 60 - nowMins) + (h * 60 + m) };
    }
    
    routeScheduleStatus = { last, next };
  }

  // Determine weather display
  let weatherEmoji = '⛅';
  let weatherText = 'Cloudy';
  if (weather) {
     if (weather.code <= 0) { weatherEmoji = '☀️'; weatherText = 'Clear'; }
     else if (weather.code <= 3) { weatherEmoji = '⛅'; weatherText = 'Cloudy'; }
     else if (weather.code <= 48) { weatherEmoji = '🌫️'; weatherText = 'Fog'; }
     else if (weather.code <= 67) { weatherEmoji = '🌧️'; weatherText = 'Rain'; }
     else if (weather.code <= 77) { weatherEmoji = '❄️'; weatherText = 'Snow'; }
     else { weatherEmoji = '⛈️'; weatherText = 'Storm'; }
  }

  return (
    <main className="app-container">
      {/* Floating In-App Toasts Stack */}
      <div style={{ position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className="glass-panel toast-popup"
            style={{
              padding: '16px 24px',
              borderRadius: '16px',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid var(--success)',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(16, 185, 129, 0.3)',
              animation: 'slideDown 0.3s ease-out',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: '300px',
              justifyContent: 'center'
            }}
          >
            <BellRing size={20} color="#10b981" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '15px', flex: 1 }}>{toast.message}</span>
            <button 
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px'
              }}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      {/* Sidebar Panel */}
      {isLeftPanelOpen ? (
        <aside className="glass-panel sidebar">
          <button 
            className="close-btn" 
            onClick={() => setIsLeftPanelOpen(false)} 
            style={{position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer'}}
          >
            <X size={20} />
          </button>
          <div className="sidebar-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div className="logo-container">
                 <div className="logo-icon"><Bus size={24} color="#fff" /></div>
                 <h1 style={{ color: 'var(--text-main)' }}>RapidTracker</h1>
              </div>
              <select 
                value={lang} 
                onChange={e => setLang(e.target.value as Language)}
                style={{ background: 'var(--panel-bg)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '4px 8px', outline: 'none' }}
              >
                <option value="en">EN</option>
                <option value="ms">MS</option>
                <option value="zh">ZH</option>
              </select>
            </div>
            <div className={`status-indicator ${isFetching ? 'fetching' : ''}`}>
               <div className="dot"></div>
               <span>{isFetching ? t('updating') : t('live')}</span>
            </div>
          </div>

          <div className="sidebar-section">
            <h2><MapPin size={18} /> {t('routeFilter')}</h2>
            <RouteSearch 
              routes={uniqueRoutes}
              selectedRoute={selectedRoute}
              onSelect={(r) => {
                setSelectedRoute(r);
                setSelectedStopId(null);
                setSelectedDirection(0);
              }}
              t={t}
            />
            {/* Direction Toggle */}
            {routeStops[selectedRoute] && routeStops[selectedRoute].length > 1 && (
              <div className="direction-toggle" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setSelectedDirection(0)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: selectedDirection === 0 ? 'var(--success)' : 'transparent', color: selectedDirection === 0 ? '#fff' : 'var(--text-main)', cursor: 'pointer' }}
                >{t('outbound')}</button>
                <button 
                  onClick={() => setSelectedDirection(1)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: selectedDirection === 1 ? 'var(--success)' : 'transparent', color: selectedDirection === 1 ? '#fff' : 'var(--text-main)', cursor: 'pointer' }}
                >{t('inbound')}</button>
              </div>
            )}
            <div className="stats-box">
               <span>{t('activeBuses')}:</span>
               <strong>{activeBuses.length}</strong>
            </div>
            
            {routeScheduleStatus && (
              <div className="schedule-box" style={{ marginTop: '16px', background: 'var(--panel-bg)', borderRadius: '12px', padding: '16px', border: '1px solid var(--panel-border)' }}>
                <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: 'var(--text-muted)' }}>{t('timetable')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   {routeScheduleStatus.last ? (
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                       <span style={{ color: 'var(--text-main)' }}>{t('lastBus')} ({routeScheduleStatus.last.timeStr})</span>
                       <span style={{ color: 'var(--error)' }}>{t('departed')} {formatTimeAgo(routeScheduleStatus.last.minsAgo)}</span>
                     </div>
                   ) : <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t('noEarlierBuses')}</div>}
                   
                   {routeScheduleStatus.next ? (
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                       <span style={{ color: 'var(--text-main)' }}>{t('nextBus')} ({routeScheduleStatus.next.timeStr})</span>
                       <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>~{formatTimeUntil(routeScheduleStatus.next.minsUntil)}</span>
                     </div>
                   ) : <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t('noMoreBuses')}</div>}
                </div>
              </div>
            )}

            {sortedInterchanges && sortedInterchanges.length > 0 && (
              <div className="interchange-box" style={{ marginTop: '16px', background: 'var(--panel-bg)', borderRadius: '12px', padding: '16px', border: '1px solid var(--panel-border)' }}>
                <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: 'var(--text-muted)' }}>{t('connectingTrains')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sortedInterchanges.map((interchange: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 'bold' }}>{interchange.name}</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' }}>
                         {interchange.railRoutes.map((r: any, ridx: number) => (
                            <span key={ridx} style={{ background: `#${r.color}`, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{r.short}</span>
                         ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                     const allRailRoutes = new globalThis.Map();
                     sortedInterchanges.forEach((interchange: any) => {
                        interchange.railRoutes.forEach((rr: any) => {
                           if (!allRailRoutes.has(rr.id)) {
                              allRailRoutes.set(rr.id, rr);
                           }
                        });
                     });
                     const uniqueRailRoutes = Array.from(allRailRoutes.values());
                     return uniqueRailRoutes.map((railRoute: any, ridx: number) => {
                        const freqs = getCurrentFrequency(railRoute.frequencies);
                        if (!freqs) return null;
                        return (
                          <div key={ridx} style={{ fontSize: '13px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <span style={{ background: `#${railRoute.color}`, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{railRoute.short}</span>
                              <strong style={{ color: 'var(--text-main)', fontSize: '13px' }}>{railRoute.name}</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                               {Object.values(freqs).every(h => h === null) ? (
                                 <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', padding: '4px 0' }}>
                                   {t('serviceEnded') || 'Service Ended for Today'}
                                 </div>
                               ) : Object.keys(freqs).map(dir => {
                                 const headway = freqs[dir];
                                 const sched = getRailSchedule(railRoute.schedules, dir);
                                 const headsign = railRoute.headsigns?.[dir];
                                 if (!headsign || (!headway && !sched?.next)) return null;
                                 
                                 return (
                                   <div key={dir} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                     <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>{headsign}</span>
                                     {sched && (sched.last || sched.next) ? (
                                       <span style={{ fontSize: '11px', textAlign: 'right', color: 'var(--success)' }}>
                                         Last: {sched.last || '--'} <br /> Next: {sched.next || '--'}
                                       </span>
                                     ) : (
                                       <span style={{ color: 'var(--success)' }}>{t('every')} {headway} {t('mins')}</span>
                                     )}
                                   </div>
                                 );
                               })}
                            </div>
                          </div>
                        );
                     });
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-footer">
            {error && <div className="error-toast">{error}</div>}
            <p>{t('lastUpdated')} {lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--'}</p>
          </div>
        </aside>
      ) : (
        <button 
          className="glass-panel left-panel-toggle" 
          onClick={() => setIsLeftPanelOpen(true)}
          style={{ 
            position: 'absolute', 
            top: 20, 
            left: 20, 
            zIndex: 1000, 
            padding: '12px', 
            cursor: 'pointer', 
            borderRadius: '12px', 
            border: '1px solid rgba(255,255,255,0.1)', 
            background: 'rgba(15, 23, 42, 0.85)' 
          }}
        >
          <Bus size={24} color="#10b981" />
        </button>
      )}

      {/* Map Area */}
      <div className="map-container">
        {weather && (
          <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'var(--panel-bg)', backdropFilter: 'blur(8px)', padding: '6px 16px', borderRadius: '24px', border: '1px solid var(--panel-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
             <span style={{ fontSize: '16px' }}>{weatherEmoji}</span>
             <span>{weather.temp}°C</span>
          </div>
        )}

        <Map 
          buses={activeBuses} 
          targetLocation={null}
          setTargetLocation={() => {}}
          radius={500}
          selectedRoute={selectedRoute}
          shapes={routeShapes[selectedRoute]?.[selectedDirection] ? [routeShapes[selectedRoute][selectedDirection]] : []}
          stops={routeStops[selectedRoute]?.[selectedDirection] || []}
          selectedStopId={selectedStopId}
          onStopSelect={setSelectedStopId}
          routeInterchanges={routeInterchanges}
          isOneWay={routeStops[selectedRoute] ? routeStops[selectedRoute].length === 1 : false}
          showRailNetwork={showRailNetwork}
          railMapData={railMapData}
          toggleRailNetwork={toggleRailNetwork}
          t={t}
        />
        
        {!isRightPanelOpen ? (
          <div 
            className="right-panel-toggle glass-panel" 
            onClick={() => setIsRightPanelOpen(true)}
            style={{ position: 'absolute', top: 20, right: 20, padding: 12, borderRadius: 12, cursor: 'pointer', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Menu size={24} color="#0ea5e9" />
          </div>
        ) : (
          <div className="right-panels-container glass-panel" style={{ padding: '24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 24px))', borderRadius: '0', background: 'var(--panel-bg)', backdropFilter: 'blur(16px)', borderLeft: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '100dvh' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
              <button onClick={() => setIsRightPanelOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 'bold' }}>
                <X size={24} /> {t('close')}
              </button>
            </div>
            
            <NotificationPanel 
              stops={routeStops[selectedRoute]?.[selectedDirection] || []}
              selectedRoute={selectedRoute}
              targetStopId={targetStopId}
              setTargetStopId={setTargetStopId}
              threshold={threshold}
              setThreshold={setThreshold}
              notificationsEnabled={notificationsEnabled}
              setNotificationsEnabled={setNotificationsEnabled}
              t={t}
            />
            
            <div style={{ marginTop: '24px' }}>
              <RouteLegend 
                stops={routeStops[selectedRoute]?.[selectedDirection] || []}
                activeBuses={activeBuses}
                selectedStopId={selectedStopId}
                onStopSelect={setSelectedStopId}
                t={t}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
