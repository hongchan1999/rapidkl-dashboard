import React, { useState } from 'react';
import { BellRing, X, ChevronRight, ChevronLeft } from 'lucide-react';

interface NotificationPanelProps {
  stops: {id:string, name:string, lat:number, lon:number}[];
  selectedRoute: string;
  targetStopId: string | null;
  setTargetStopId: (id: string | null) => void;
  threshold: number;
  setThreshold: (val: number) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (val: boolean) => void;
  t: (key: any) => string;
}

export default function NotificationPanel({
  stops, selectedRoute, targetStopId, setTargetStopId, 
  threshold, setThreshold, notificationsEnabled, setNotificationsEnabled, t
}: NotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false); // Default to closed accordion

  if (!selectedRoute || selectedRoute === 'ALL') return null;

  const togglePanel = () => setIsOpen(!isOpen);

  return (
    <div className="notification-panel glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div 
        className="panel-header" 
        onClick={togglePanel} 
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '16px',
          background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BellRing size={18} color="#0ea5e9" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{t('arrivalAlerts')}</h3>
        </div>
        <button className="icon-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          {isOpen ? <ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} /> : <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />}
        </button>
      </div>
      
      {isOpen && (
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', paddingTop: 0 }}>
          <div className="control-group" style={{ opacity: selectedRoute !== 'T152' ? 0.5 : 1 }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>{t('targetBusStop')}</label>
            <select 
              className="modern-select"
              value={targetStopId || ''}
              disabled={selectedRoute !== 'T152'}
              onChange={(e) => {
                setTargetStopId(e.target.value);
                // Auto-enable if disabled
                if (!notificationsEnabled && e.target.value) {
                  setNotificationsEnabled(true);
                }
              }}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: selectedRoute !== 'T152' ? 'not-allowed' : 'pointer' }}
            >
              <option value="" disabled>{t('selectStopOn')} {selectedRoute}</option>
              {stops.map((stop, i) => (
                <option key={`opt-${stop.id}`} value={stop.id}>
                  {i + 1}. {stop.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group" style={{ opacity: selectedRoute !== 'T152' ? 0.5 : 1 }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>{t('alertMeWhen')}</label>
            <select 
              className="modern-select"
              value={threshold}
              disabled={selectedRoute !== 'T152'}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: selectedRoute !== 'T152' ? 'not-allowed' : 'pointer' }}
            >
              <option value="1">1 {t('stopsAway')}</option>
              <option value="2">2 {t('stopsAway')}</option>
              <option value="3">3 {t('stopsAway')}</option>
              <option value="4">4 {t('stopsAway')}</option>
              <option value="5">5 {t('stopsAway')}</option>
            </select>
          </div>

          <div className="toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', opacity: selectedRoute !== 'T152' ? 0.5 : 1 }}>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={notificationsEnabled}
                disabled={selectedRoute !== 'T152'}
                onChange={(e) => {
                  if (e.target.checked && !targetStopId) {
                    alert(t('pleaseSelectTarget'));
                    return;
                  }
                  setNotificationsEnabled(e.target.checked);
                }}
                style={{ cursor: selectedRoute !== 'T152' ? 'not-allowed' : 'pointer' }}
              />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: '14px', fontWeight: 500, color: notificationsEnabled ? '#10b981' : '#94a3b8' }}>
              {notificationsEnabled ? t('alertsOn') : t('alertsOff')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
