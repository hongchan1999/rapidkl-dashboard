const fs = require('fs');
const path = require('path');

const EXTRACT_DIRS = [
    path.join(__dirname, 'gtfs_data'),
    path.join(__dirname, 'gtfs_data_mrt')
];
const SHAPES_OUT_FILE = path.join(__dirname, 'public', 'shapes.json');
const STOPS_OUT_FILE = path.join(__dirname, 'public', 'stops.json');
const ROUTE_MAP_FILE = path.join(__dirname, 'public', 'route_map.json');
const TRIP_DIRS_FILE = path.join(__dirname, 'public', 'trip_directions.json');

function extractData() {
    console.log("Extracting shapes, stops, and trip directions...");
    const finalShapesData = {}; 
    const finalStopsData = {}; 
    const globalRouteMap = {};
    const globalTripDirections = {};

    for (const dir of EXTRACT_DIRS) {
        if (!fs.existsSync(dir)) continue;
        console.log("Processing directory:", dir);
        const isMrt = dir.includes('mrt');

        const routeNames = {};
        const routesContent = fs.readFileSync(path.join(dir, 'routes.txt'), 'utf-8');
        const rLines = routesContent.split('\n');
        const rHeaders = rLines[0].trim().split(',');
        const rIdIdx = rHeaders.indexOf('route_id');
        const rShortNameIdx = rHeaders.indexOf('route_short_name');
        const rLongNameIdx = rHeaders.indexOf('route_long_name');
        
        for (let i = 1; i < rLines.length; i++) {
            const line = rLines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const rId = parts[rIdIdx];
            let rShortName = parts[rShortNameIdx];
            if (!rShortName && rLongNameIdx !== -1) rShortName = parts[rLongNameIdx];
            if (rId && rShortName) {
                const clean = rShortName.replace(/"/g, '');
                routeNames[rId] = clean;
                globalRouteMap[rId] = clean;
            }
        }

        const tripsInfo = {}; // trip_id -> {rId, dirId, sId, stops: []}
        const tripsContent = fs.readFileSync(path.join(dir, 'trips.txt'), 'utf-8');
        const tLines = tripsContent.split('\n');
        const tHeaders = tLines[0].trim().split(',');
        const tRIdIdx = tHeaders.indexOf('route_id');
        const tSIdIdx = tHeaders.indexOf('shape_id');
        const tTIdIdx = tHeaders.indexOf('trip_id');
        const tDIdIdx = tHeaders.indexOf('direction_id');

        for (let i = 1; i < tLines.length; i++) {
            const line = tLines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const tId = parts[tTIdIdx];
            if (tId) {
                const dirId = parts[tDIdIdx] || '0';
                tripsInfo[tId] = {
                    rId: parts[tRIdIdx],
                    sId: parts[tSIdIdx],
                    dirId: dirId,
                    stops: []
                };
                globalTripDirections[tId] = parseInt(dirId);
            }
        }

        const stopTimesContent = fs.readFileSync(path.join(dir, 'stop_times.txt'), 'utf-8');
        const stLines = stopTimesContent.split('\n');
        const stHeaders = stLines[0].trim().split(',');
        const stTIdIdx = stHeaders.indexOf('trip_id');
        const stSIdIdx = stHeaders.indexOf('stop_id');
        const stSeqIdx = stHeaders.indexOf('stop_sequence');

        for (let i = 1; i < stLines.length; i++) {
            const line = stLines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const tId = parts[stTIdIdx];
            if (tripsInfo[tId]) {
                tripsInfo[tId].stops.push({
                    stopId: parts[stSIdIdx],
                    seq: parseInt(parts[stSeqIdx] || '0')
                });
            }
        }

        const routeStopsByDir = {}; // rId -> dirId -> best tId
        for (const [tId, info] of Object.entries(tripsInfo)) {
            const rId = info.rId;
            const dId = info.dirId;
            if (!routeStopsByDir[rId]) routeStopsByDir[rId] = {};
            const existingBestTId = routeStopsByDir[rId][dId];
            if (!existingBestTId || info.stops.length > tripsInfo[existingBestTId].stops.length) {
                routeStopsByDir[rId][dId] = tId;
            }
        }

        const selectedTrips = {}; // rId -> [tIds]
        const allSelectedShapeIds = new Set();
        const allNeededStopIds = new Set();

        for (const [rId, dirs] of Object.entries(routeStopsByDir)) {
            let tripsToUse = Object.values(dirs);
            
            selectedTrips[rId] = tripsToUse;
            tripsToUse.forEach(tId => {
                allSelectedShapeIds.add(tripsInfo[tId].sId);
                tripsInfo[tId].stops.forEach(st => allNeededStopIds.add(st.stopId));
            });
        }

        const shapePoints = {};
        const shapesContent = fs.readFileSync(path.join(dir, 'shapes.txt'), 'utf-8');
        const sLines = shapesContent.split('\n');
        const sHeaders = sLines[0].trim().split(',');
        const sidIdx = sHeaders.indexOf('shape_id');
        const latIdx = sHeaders.indexOf('shape_pt_lat');
        const lonIdx = sHeaders.indexOf('shape_pt_lon');
        const seqIdx = sHeaders.indexOf('shape_pt_sequence');

        for (let i = 1; i < sLines.length; i++) {
            const line = sLines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const sId = parts[sidIdx];
            if (allSelectedShapeIds.has(sId)) {
                if (!shapePoints[sId]) shapePoints[sId] = [];
                shapePoints[sId].push({
                    lat: parseFloat(parts[latIdx]),
                    lon: parseFloat(parts[lonIdx]),
                    seq: parseInt(parts[seqIdx])
                });
            }
        }

        const stopDetails = {};
        const stopsContent = fs.readFileSync(path.join(dir, 'stops.txt'), 'utf-8');
        const stpLines = stopsContent.split('\n');
        const stpHeaders = stpLines[0].trim().split(',');
        const sIdIdx = stpHeaders.indexOf('stop_id');
        const sNameIdx = stpHeaders.indexOf('stop_name');
        const sLatIdx = stpHeaders.indexOf('stop_lat');
        const sLonIdx = stpHeaders.indexOf('stop_lon');

        for (let i = 1; i < stpLines.length; i++) {
            const line = stpLines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const sId = parts[sIdIdx];
            if (allNeededStopIds.has(sId)) {
                let name = parts[sNameIdx];
                let lat = parts[sLatIdx];
                let lon = parts[sLonIdx];
                if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
                    lon = parts[parts.length - 1];
                    lat = parts[parts.length - 2];
                    name = parts.slice(sNameIdx, parts.length - 2).join(',').replace(/"/g, '');
                } else {
                    name = name.replace(/"/g, '');
                }
                stopDetails[sId] = { id: sId, name: name, lat: parseFloat(lat), lon: parseFloat(lon) };
            }
        }

        for (const [rId, tIds] of Object.entries(selectedTrips)) {
            // Shapes
            const shapesForRoute = [];
            for (const tId of tIds) {
                const sId = tripsInfo[tId].sId;
                const points = shapePoints[sId];
                if (points) {
                    points.sort((a, b) => a.seq - b.seq);
                    shapesForRoute.push(points.map(p => [p.lat, p.lon]));
                }
            }
            if (shapesForRoute.length > 0) {
                const finalKey = routeNames[rId] || rId;
                finalShapesData[finalKey] = shapesForRoute;
            }

            // Stops
            const stopsByDir = [];
            for (const tId of tIds) {
                const sequence = tripsInfo[tId].stops;
                sequence.sort((a, b) => a.seq - b.seq);
                const dirStops = [];
                for (const st of sequence) {
                    if (dirStops.length > 0 && dirStops[dirStops.length - 1].id === st.stopId) continue;
                    const details = stopDetails[st.stopId];
                    if (details) {
                        dirStops.push(details);
                    }
                }

                if (isMrt && dirStops.length > 0) {
                    const firstStop = dirStops[0];
                    const lastStop = dirStops[dirStops.length - 1];
                    const isRailOrigin = firstStop.name.match(/(MRT|LRT|KTM|MONORAIL)/i);
                    if (isRailOrigin && lastStop.id !== firstStop.id) {
                        dirStops.push({ ...firstStop, id: firstStop.id + '_return' });
                    }
                }

                if (dirStops.length > 0) {
                    stopsByDir.push(dirStops);
                }
            }

            if (stopsByDir.length > 0) {
                const finalKey = routeNames[rId] || rId;
                finalStopsData[finalKey] = stopsByDir;
            }
        }
    }

    fs.writeFileSync(SHAPES_OUT_FILE, JSON.stringify(finalShapesData));
    console.log(`Saved ${Object.keys(finalShapesData).length} total routes to shapes.json`);

    fs.writeFileSync(STOPS_OUT_FILE, JSON.stringify(finalStopsData));
    console.log(`Saved ${Object.keys(finalStopsData).length} total routes' stops to stops.json`);

    fs.writeFileSync(ROUTE_MAP_FILE, JSON.stringify(globalRouteMap));
    console.log(`Saved route_map.json with mappings`);

    fs.writeFileSync(TRIP_DIRS_FILE, JSON.stringify(globalTripDirections));
    console.log(`Saved trip_directions.json with mappings`);
}

extractData();
