export interface BusData {
  id: string;
  routeId: string;
  directionId?: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  bearing?: number;
  speed?: number;
  localLastSeen?: number; // timestamp in milliseconds when the bus was last received from API
}
