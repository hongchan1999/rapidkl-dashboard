import { NextResponse } from 'next/server';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import fs from 'fs';
import path from 'path';

// Load route map and trip directions once
let routeMap: Record<string, string> = {};
let tripDirections: Record<string, number> = {};
try {
  const mapPath = path.join(process.cwd(), 'public', 'route_map.json');
  routeMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  const dirsPath = path.join(process.cwd(), 'public', 'trip_directions.json');
  tripDirections = JSON.parse(fs.readFileSync(dirsPath, 'utf-8'));
} catch (e) {
  console.error("Could not load mapping files", e);
}

// Tell Next.js not to cache this API route statically
export const dynamic = 'force-dynamic';
export const revalidate = 15;

export async function GET() {
  try {
    const urls = [
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder"
    ];

    const responses = await Promise.all(
      urls.map(url => fetch(url, { cache: 'no-store' }))
    );
    
    const buses = [];

    for (const res of responses) {
      if (!res.ok) {
        console.error(`Failed to fetch GTFS data: ${res.url} - ${res.status} ${res.statusText}`);
        continue;
      }
      
      const buffer = await res.arrayBuffer();
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
      
      for (const entity of feed.entity) {
        if (entity.vehicle && entity.vehicle.position) {
          let timestamp = Date.now() / 1000;
          if (entity.vehicle.timestamp) {
              timestamp = typeof (entity.vehicle.timestamp as any).toNumber === 'function' 
                ? (entity.vehicle.timestamp as any).toNumber() 
                : Number(entity.vehicle.timestamp);
          }
          
          let rawRouteId = entity.vehicle.trip?.routeId || 'Unknown';
          let displayRouteId = routeMap[rawRouteId] || rawRouteId;
          
          let tripId = entity.vehicle.trip?.tripId || '';
          let directionId = tripDirections[tripId] ?? 0;
          
          buses.push({
            id: entity.vehicle.vehicle?.id || entity.id,
            routeId: displayRouteId,
            directionId: directionId,
            latitude: entity.vehicle.position.latitude,
            longitude: entity.vehicle.position.longitude,
            timestamp: timestamp,
            bearing: entity.vehicle.position.bearing,
            speed: entity.vehicle.position.speed
          });
        }
      }
    }
    
    return NextResponse.json({ success: true, count: buses.length, buses });
    
  } catch (error) {
    console.error("Error fetching GTFS Realtime data:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
