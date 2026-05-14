const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const RAIL_DIR = path.join(__dirname, '..', 'tmp', 'rail_data');
const KTMB_DIR = path.join(__dirname, '..', 'tmp', 'ktmb_data');
const OUT_FILE = path.join(__dirname, '..', 'public', 'rail_map.json');
const INTERCHANGES_FILE = path.join(__dirname, '..', 'public', 'interchanges.json');

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
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

function processRapidKL() {
  console.log("Loading RapidKL routes...");
  const routes = loadCsv(RAIL_DIR, 'routes.txt');
  const routeMap = {};
  for (const r of routes) {
    routeMap[r.route_id] = {
      id: r.route_short_name || r.route_id,
      name: r.route_long_name,
      color: '#' + (r.route_color || '000000'),
    };
  }

  console.log("Loading RapidKL trips...");
  const trips = loadCsv(RAIL_DIR, 'trips.txt');
  const shapeToRoute = {};
  for (const t of trips) {
    if (t.shape_id) {
      shapeToRoute[t.shape_id] = t.route_id;
    }
  }

  console.log("Loading RapidKL shapes...");
  const shapes = loadCsv(RAIL_DIR, 'shapes.txt');
  const shapesData = {};
  for (const row of shapes) {
    const sId = row.shape_id;
    if (!shapesData[sId]) shapesData[sId] = [];
    shapesData[sId].push({
      lat: parseFloat(row.shape_pt_lat),
      lon: parseFloat(row.shape_pt_lon),
      seq: parseInt(row.shape_pt_sequence, 10),
    });
  }

  const routeShapes = [];
  for (const sId in shapesData) {
    const rId = shapeToRoute[sId];
    if (!rId) continue;
    const route = routeMap[rId];
    if (!route) continue;

    const points = shapesData[sId].sort((a, b) => a.seq - b.seq).map(p => [p.lat, p.lon]);
    routeShapes.push({
      routeId: route.id,
      color: route.color,
      points: points
    });
  }

  console.log("Loading RapidKL stations...");
  const stops = loadCsv(RAIL_DIR, 'stops.txt');
  const stations = stops.map(s => {
    let rId = s.route_id;
    if (rId === 'MRT' && s.stop_id.startsWith('KG')) rId = 'KGL';
    if (rId === 'MRT' && s.stop_id.startsWith('PY')) rId = 'PYL';
    if (rId === 'Monorail') rId = 'MRL';
    if (rId === 'BRT') rId = 'BRT';

    let color = '#ffffff';
    if (routeMap[rId]) {
      color = routeMap[rId].color;
    }

    return {
      id: s.stop_id,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
      routeId: routeMap[rId] ? routeMap[rId].id : rId,
      color: color
    };
  });

  return { shapes: routeShapes, stations };
}

function processKTMB() {
  console.log("Loading KTMB routes...");
  const routes = loadCsv(KTMB_DIR, 'routes.txt');
  // Include only commuter lines if needed, but user said whole Malaysia is fine
  const routeMap = {};
  for (const r of routes) {
    routeMap[r.route_id] = {
      id: r.route_short_name || r.route_id,
      name: r.route_long_name,
      color: '#' + (r.route_color || '000000'),
    };
  }

  console.log("Loading KTMB stops...");
  const stops = loadCsv(KTMB_DIR, 'stops.txt');
  const stopMap = {};
  for (const s of stops) {
    stopMap[s.stop_id] = {
      id: s.stop_id,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon)
    };
  }

  console.log("Loading KTMB stop_times to build shapes...");
  const stopTimes = loadCsv(KTMB_DIR, 'stop_times.txt');
  const tripStops = {}; // trip_id -> array of stop_id in sequence
  for (const st of stopTimes) {
    if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
    tripStops[st.trip_id].push({
      stop_id: st.stop_id,
      seq: parseInt(st.stop_sequence, 10)
    });
  }

  const trips = loadCsv(KTMB_DIR, 'trips.txt');
  // Group trips by route_id
  const routeTrips = {};
  for (const t of trips) {
    if (!routeTrips[t.route_id]) routeTrips[t.route_id] = [];
    routeTrips[t.route_id].push(t.trip_id);
  }

  const routeShapes = [];
  // For each route, find the trip with the most stops to represent its shape
  for (const rId in routeTrips) {
    const route = routeMap[rId];
    if (!route) continue;

    let longestTrip = null;
    let maxStops = 0;
    for (const tId of routeTrips[rId]) {
       const sts = tripStops[tId];
       if (sts && sts.length > maxStops) {
          maxStops = sts.length;
          longestTrip = sts;
       }
    }

    if (longestTrip) {
       const sorted = longestTrip.sort((a, b) => a.seq - b.seq);
       const points = [];
       for (const st of sorted) {
         const stop = stopMap[st.stop_id];
         if (stop) {
           points.push([stop.lat, stop.lon]);
         }
       }
       if (points.length > 1) {
         routeShapes.push({
           routeId: route.id,
           color: route.color,
           points: points
         });
       }
    }
  }

  // Identify which stations actually belong to which route based on trips
  const stationsMap = {};
  for (const t of trips) {
    const rId = t.route_id;
    const route = routeMap[rId];
    if (!route) continue;
    const sts = tripStops[t.trip_id];
    if (!sts) continue;
    for (const st of sts) {
      const stop = stopMap[st.stop_id];
      if (stop) {
        stationsMap[stop.id] = {
           id: stop.id,
           name: stop.name,
           lat: stop.lat,
           lon: stop.lon,
           routeId: route.id,
           color: route.color
        };
      }
    }
  }

  return { shapes: routeShapes, stations: Object.values(stationsMap) };
}

function main() {
  const rapid = processRapidKL();
  const ktmb = processKTMB();

  const allShapes = [...rapid.shapes, ...ktmb.shapes];
  const allStations = [...rapid.stations, ...ktmb.stations];

  console.log("Loading interchanges to find connected bus routes...");
  let interchanges = {};
  try {
    interchanges = JSON.parse(fs.readFileSync(INTERCHANGES_FILE, 'utf8'));
  } catch (e) {
    console.error("Could not load interchanges.json");
  }

  // Map Station Name -> Array of Bus Routes
  const stationBusMap = {};
  for (const busRoute in interchanges) {
    for (const stationMatch of interchanges[busRoute]) {
       const sName = stationMatch.name.toLowerCase();
       if (!stationBusMap[sName]) stationBusMap[sName] = new Set();
       stationBusMap[sName].add(busRoute);
    }
  }

  // Attach connected buses to stations
  for (const station of allStations) {
    const sName = station.name.toLowerCase();
    if (stationBusMap[sName]) {
      station.connectedBuses = Array.from(stationBusMap[sName]);
    } else {
      station.connectedBuses = [];
    }
    
    // Calculate connected trains
    const connectedTrainsMap = new Map();
    for (const otherStation of allStations) {
      if (station.routeId === otherStation.routeId) continue;
      
      const dist = getDistance(station.lat, station.lon, otherStation.lat, otherStation.lon);
      const sName = station.name.toLowerCase().replace(/ station/g, '');
      const oName = otherStation.name.toLowerCase().replace(/ station/g, '');
      const nameMatch = sName === oName || sName.includes(oName) || oName.includes(sName);
      
      if (dist <= 150 || nameMatch) {
        if (!connectedTrainsMap.has(otherStation.routeId)) {
          connectedTrainsMap.set(otherStation.routeId, {
            id: otherStation.routeId,
            color: otherStation.color
          });
        }
      }
    }
    station.connectedTrains = Array.from(connectedTrainsMap.values());
  }

  const output = {
    shapes: allShapes,
    stations: allStations
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output));
  console.log(`Saved rail map data to ${OUT_FILE}`);
}

main();
