const fs = require('fs');
const path = require('path');

const EXTRACT_DIR = path.join(__dirname, 'gtfs_data');
const OUT_FILE = path.join(__dirname, 'public', 'stops.json');

function extractAllStops() {
    console.log("Extracting stops for all routes...");

    // 1. Map route_id -> trip_ids (from trips.txt)
    const routeTrips = {}; // route_id -> Set of trip_ids
    
    console.log("Reading trips.txt...");
    const tripsContent = fs.readFileSync(path.join(EXTRACT_DIR, 'trips.txt'), 'utf-8');
    const tripsLines = tripsContent.split('\n');
    const tHeaders = tripsLines[0].trim().split(',');
    const routeIdx = tHeaders.indexOf('route_id');
    const tripIdx = tHeaders.indexOf('trip_id');
    const directionIdx = tHeaders.indexOf('direction_id');
    
    // We want to capture trips for both directions if possible
    // Let's store up to 2 trips per route (one for direction 0, one for direction 1)
    const selectedTripsForRoute = {}; // route_id -> array of trip_ids
    const routeByTripId = {}; // trip_id -> route_id

    for (let i = 1; i < tripsLines.length; i++) {
        const line = tripsLines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        const rId = parts[routeIdx];
        const tId = parts[tripIdx];
        const dId = parts[directionIdx];
        
        if (rId && tId) {
            if (!routeTrips[rId]) routeTrips[rId] = {};
            // Just grab the first trip we see for each direction
            const dir = dId || '0';
            if (!routeTrips[rId][dir]) {
                routeTrips[rId][dir] = tId;
                routeByTripId[tId] = rId;
                
                if (!selectedTripsForRoute[rId]) selectedTripsForRoute[rId] = [];
                selectedTripsForRoute[rId].push(tId);
            }
        }
    }

    const allSelectedTripIds = new Set(Object.keys(routeByTripId));

    // 2. Read stop_times.txt to get stop_ids for selected trips
    console.log("Reading stop_times.txt...");
    const routeStops = {}; // route_id -> Set of stop_ids

    const stopTimesContent = fs.readFileSync(path.join(EXTRACT_DIR, 'stop_times.txt'), 'utf-8');
    const stopTimesLines = stopTimesContent.split('\n');
    const stHeaders = stopTimesLines[0].trim().split(',');
    const stTripIdx = stHeaders.indexOf('trip_id');
    const stStopIdx = stHeaders.indexOf('stop_id');

    for (let i = 1; i < stopTimesLines.length; i++) {
        const line = stopTimesLines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        const tId = parts[stTripIdx];
        const sId = parts[stStopIdx];

        if (allSelectedTripIds.has(tId)) {
            const rId = routeByTripId[tId];
            if (!routeStops[rId]) routeStops[rId] = new Set();
            routeStops[rId].add(sId);
        }
    }

    // Combine all needed stop_ids to fetch from stops.txt
    const allNeededStopIds = new Set();
    for (const sSet of Object.values(routeStops)) {
        sSet.forEach(id => allNeededStopIds.add(id));
    }

    // 3. Read stops.txt to get details
    console.log("Reading stops.txt...");
    const stopDetails = {}; // stop_id -> {lat, lon, name}

    const stopsContent = fs.readFileSync(path.join(EXTRACT_DIR, 'stops.txt'), 'utf-8');
    const stopsLines = stopsContent.split('\n');
    
    // Parse header to deal with quotes if needed
    const sHeaders = stopsLines[0].trim().split(',');
    const sIdIdx = sHeaders.indexOf('stop_id');
    const sNameIdx = sHeaders.indexOf('stop_name');
    const sLatIdx = sHeaders.indexOf('stop_lat');
    const sLonIdx = sHeaders.indexOf('stop_lon');

    for (let i = 1; i < stopsLines.length; i++) {
        const line = stopsLines[i].trim();
        if (!line) continue;
        
        // Handle basic CSV splitting (ignoring commas inside quotes for simplicity, 
        // since GTFS names rarely have commas, but we should be careful).
        // Let's just do a simple split and hope no commas in stop_names.
        const parts = line.split(',');
        const sId = parts[sIdIdx];
        
        if (allNeededStopIds.has(sId)) {
            // Reconstruct name if it was split
            let name = parts[sNameIdx];
            let lat = parts[sLatIdx];
            let lon = parts[sLonIdx];
            
            // If lat/lon are NaN due to commas in name shifting index
            if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
                // simple fallback: last two are lon/lat in standard GTFS usually, 
                // but let's just grab the last two items in the split array
                lon = parts[parts.length - 1];
                lat = parts[parts.length - 2];
                name = parts.slice(sNameIdx, parts.length - 2).join(',').replace(/"/g, '');
            } else {
                name = name.replace(/"/g, '');
            }

            stopDetails[sId] = {
                id: sId,
                name: name,
                lat: parseFloat(lat),
                lon: parseFloat(lon)
            };
        }
    }

    // 4. Build final JSON structure
    console.log("Building final JSON...");
    const finalData = {}; // route_id -> [ stop_details ]
    
    for (const [rId, stopSet] of Object.entries(routeStops)) {
        const stopsForRoute = [];
        for (const sId of stopSet) {
            const details = stopDetails[sId];
            if (details) {
                stopsForRoute.push(details);
            }
        }
        if (stopsForRoute.length > 0) {
            finalData[rId] = stopsForRoute;
        }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(finalData));
    console.log(`Saved ${Object.keys(finalData).length} routes' stops to stops.json`);
}

extractAllStops();
