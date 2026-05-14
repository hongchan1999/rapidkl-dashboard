const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RAIL_DIR = path.join(__dirname, '..', 'tmp', 'rail_data');
const KTMB_DIR = path.join(__dirname, '..', 'tmp', 'ktmb_data');

const BUS_STOPS_FILE = path.join(PUBLIC_DIR, 'stops.json');
const INTERCHANGES_FILE = path.join(PUBLIC_DIR, 'interchanges.json');

// Haversine distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function loadCsv(dir, filename) {
  try {
    const file = fs.readFileSync(path.join(dir, filename), 'utf8');
    return parse(file, { columns: true, skip_empty_lines: true, bom: true });
  } catch (e) {
    return [];
  }
}

function main() {
  console.log("Loading Rail Routes...");
  const routesCsv = loadCsv(RAIL_DIR, 'routes.txt');
  const ktmbRoutesCsv = loadCsv(KTMB_DIR, 'routes.txt');
  const allRoutesCsv = [...routesCsv, ...ktmbRoutesCsv];
  
  const railRoutes = {}; // route_id -> details
  for (const r of allRoutesCsv) {
    let shortName = r.route_short_name || r.route_id;
    if (r.route_id.startsWith('KC') || r.route_id.startsWith('KA') || r.route_id.startsWith('100')) {
      shortName = "KTM";
      if (r.route_long_name.includes('Pelabuhan Klang') || r.route_long_name.includes('Port Klang')) shortName = 'PKL';
      if (r.route_long_name.includes('Pulau Sebang') || r.route_long_name.includes('Seremban')) shortName = 'SBL';
    }
    
    railRoutes[r.route_id] = {
      id: r.route_id,
      name: r.route_long_name,
      short: shortName,
      color: r.route_color || '000000',
      frequencies: { 'MonFri': { '0': [], '1': [] }, 'Sat': { '0': [], '1': [] }, 'Sun': { '0': [], '1': [] } },
      schedules: { 'MonFri': { '0': [], '1': [] }, 'Sat': { '0': [], '1': [] }, 'Sun': { '0': [], '1': [] } },
      headsigns: { '0': '', '1': '' }
    };
  }

  console.log("Loading Rail Trips...");
  const tripsCsv = loadCsv(RAIL_DIR, 'trips.txt');
  const ktmbTripsCsv = loadCsv(KTMB_DIR, 'trips.txt');
  const allTripsCsv = [...tripsCsv, ...ktmbTripsCsv];
  
  const tripMap = {};
  for (const t of allTripsCsv) {
    tripMap[t.trip_id] = t;
    if (railRoutes[t.route_id]) {
      if (t.trip_headsign) {
        railRoutes[t.route_id].headsigns[t.direction_id] = t.trip_headsign;
      } else if (!railRoutes[t.route_id].headsigns[t.direction_id]) {
        // Fallback for KTM headsigns
        railRoutes[t.route_id].headsigns[t.direction_id] = t.direction_id === '0' ? 'Outbound' : 'Inbound';
      }
    }
  }

  console.log("Loading Rail Frequencies...");
  const freqCsv = loadCsv(RAIL_DIR, 'frequencies.txt');
  for (const f of freqCsv) {
    const trip = tripMap[f.trip_id];
    if (!trip) continue;
    const r = railRoutes[trip.route_id];
    if (!r) continue;
    
    // Normalize time (sometimes it's 24:00:00 or 25:00:00)
    // We just store the raw string, the frontend can parse it.
    if (r.frequencies[trip.service_id] && r.frequencies[trip.service_id][trip.direction_id]) {
      r.frequencies[trip.service_id][trip.direction_id].push({
        start: f.start_time,
        end: f.end_time,
        headway: parseInt(f.headway_secs) / 60
      });
    }
  }
  
  console.log("Computing KTMB Pseudo-Frequencies...");
  const ktmbStopTimes = loadCsv(KTMB_DIR, 'stop_times.txt');
  const ktmbFirstStops = {}; // trip_id -> departure_time in seconds
  for (const st of ktmbStopTimes) {
    if (!ktmbFirstStops[st.trip_id] || parseInt(st.stop_sequence) < ktmbFirstStops[st.trip_id].seq) {
      const parts = st.departure_time.trim().split(':');
      const secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2] || 0);
      ktmbFirstStops[st.trip_id] = { seq: parseInt(st.stop_sequence), time: secs };
    }
  }
  
  // Group by route and direction and service
  const ktmbGroups = {};
  for (const t of ktmbTripsCsv) {
    const fsData = ktmbFirstStops[t.trip_id];
    if (!fsData) continue;
    
    let serviceId = 'MonFri';
    if (t.service_id.includes('weekend')) serviceId = 'Sat'; // Simplified
    
    const key = `${t.route_id}|${t.direction_id}|${serviceId}`;
    if (!ktmbGroups[key]) ktmbGroups[key] = [];
    ktmbGroups[key].push(fsData.time);
  }
  
  for (const key in ktmbGroups) {
    const times = ktmbGroups[key].sort((a,b)=>a-b);
    const [routeId, dirId, serviceId] = key.split('|');
    const r = railRoutes[routeId];
    if (!r) continue;
    
    // Calculate average headway or just use 60 mins as fallback
    let avgHeadway = 60;
    if (times.length > 1) {
      let totalDiff = 0;
      for (let i=1; i<times.length; i++) totalDiff += (times[i] - times[i-1]);
      avgHeadway = Math.round((totalDiff / (times.length - 1)) / 60);
    }
    
    const formatTime = (secs) => {
      const h = Math.floor(secs / 3600).toString().padStart(2, '0');
      const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    };
    
    const minTime = times[0];
    const maxTime = times[times.length - 1];
    
    const formattedTimes = times.map(t => {
      const h = Math.floor(t / 3600).toString().padStart(2, '0');
      const m = Math.floor((t % 3600) / 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    });
    
    if (r.frequencies[serviceId] && r.frequencies[serviceId][dirId]) {
      r.frequencies[serviceId][dirId].push({
        start: formatTime(minTime),
        end: formatTime(maxTime + 3600), // add 1 hour to end time for buffer
        headway: avgHeadway
      });
      r.schedules[serviceId][dirId] = formattedTimes;
      // Duplicate Sat to Sun for KTMB if weekend
      if (serviceId === 'Sat') {
        r.frequencies['Sun'][dirId].push({
          start: formatTime(minTime),
          end: formatTime(maxTime + 3600),
          headway: avgHeadway
        });
        r.schedules['Sun'][dirId] = [...formattedTimes];
      }
    }
  }

  console.log("Loading Rail Stops...");
  const stopsCsv = loadCsv(RAIL_DIR, 'stops.txt');
  const ktmbStopsCsv = loadCsv(KTMB_DIR, 'stops.txt');
  const allStopsCsv = [...stopsCsv, ...ktmbStopsCsv];
  
  const stopToRoute = {};
  for (const st of ktmbStopTimes) {
    const t = tripMap[st.trip_id];
    if (t) {
      stopToRoute[st.stop_id] = t.route_id;
    }
  }
  
  const railStops = [];
  for (const s of allStopsCsv) {
    railStops.push({
      id: s.stop_id,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
      route_id: s.route_id || stopToRoute[s.stop_id]
    });
  }

  console.log("Loading Bus Stops...");
  const busStopsData = JSON.parse(fs.readFileSync(BUS_STOPS_FILE, 'utf8'));

  console.log("Computing Interchanges...");
  const interchanges = {}; // bus_route -> [ { station_name, routes: [ rail_route_id ] } ]

  for (const busRoute in busStopsData) {
    // Check both directions
    const dirs = busStopsData[busRoute];
    const foundStations = new Map(); // station_name -> { routeIds: Set, busStopIds: Set }

    for (const dirStops of dirs) {
      if (!dirStops) continue;
      for (const bs of dirStops) {
        for (const rs of railStops) {
          const dist = getDistance(bs.lat, bs.lon, rs.lat, rs.lon);
          if (dist <= 150) {
             let rId = rs.route_id;
             if (rId === 'MRT' && rs.id.startsWith('KG')) rId = 'KGL';
             if (rId === 'MRT' && rs.id.startsWith('PY')) rId = 'PYL';
             
             if (!foundStations.has(rs.name)) {
               foundStations.set(rs.name, { routeIds: new Set(), busStopIds: new Set(), lat: rs.lat, lon: rs.lon });
             }
             foundStations.get(rs.name).routeIds.add(rId);
             foundStations.get(rs.name).busStopIds.add(bs.id);
          }
        }
      }
    }

    if (foundStations.size > 0) {
      interchanges[busRoute] = [];
      for (const [name, data] of foundStations.entries()) {
        interchanges[busRoute].push({
          name: name,
          lat: data.lat,
          lon: data.lon,
          busStopIds: Array.from(data.busStopIds),
          railRoutes: Array.from(data.routeIds).map(id => railRoutes[id]).filter(Boolean)
        });
      }
    }
  }

  fs.writeFileSync(INTERCHANGES_FILE, JSON.stringify(interchanges, null, 2));
  console.log(`Saved interchanges for ${Object.keys(interchanges).length} bus routes to ${INTERCHANGES_FILE}`);
}

main();
