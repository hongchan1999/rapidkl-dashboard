const fs = require('fs');
const path = require('path');

const EXTRACT_DIR = path.join(__dirname, 'gtfs_data');
const OUT_FILE = path.join(__dirname, 'public', 'shapes.json');

function extractAllShapes() {
    console.log("Extracting shapes for all routes...");

    // 1. Map route_id -> shape_id (from trips.txt)
    // A single route might have multiple shapes (e.g. inbound/outbound).
    // We'll just grab the first shape we encounter for each route to keep the file small,
    // or we can grab all of them. Let's grab all unique shape_ids for each route_id.
    const routeShapes = {}; // route_id -> Set of shape_ids
    
    console.log("Reading trips.txt...");
    const tripsContent = fs.readFileSync(path.join(EXTRACT_DIR, 'trips.txt'), 'utf-8');
    const tripsLines = tripsContent.split('\n');
    const tHeaders = tripsLines[0].trim().split(',');
    const routeIdx = tHeaders.indexOf('route_id');
    const shapeIdx = tHeaders.indexOf('shape_id');
    
    for (let i = 1; i < tripsLines.length; i++) {
        const line = tripsLines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        const rId = parts[routeIdx];
        const sId = parts[shapeIdx];
        
        if (rId && sId) {
            if (!routeShapes[rId]) routeShapes[rId] = new Set();
            routeShapes[rId].add(sId);
        }
    }

    // Convert sets to arrays and pick just the first shape to keep the download size small
    // Actually, outbound and inbound can have different shapes. Let's keep up to 2 shapes per route.
    const selectedShapes = {};
    const allSelectedShapeIds = new Set();
    
    for (const [rId, shapeSet] of Object.entries(routeShapes)) {
        const shapesArr = Array.from(shapeSet).slice(0, 2); // max 2 shapes (e.g., in/out)
        selectedShapes[rId] = shapesArr;
        shapesArr.forEach(sId => allSelectedShapeIds.add(sId));
    }

    // 2. Read shapes.txt and get points for our selected shape_ids
    console.log("Reading shapes.txt...");
    const shapePoints = {}; // shape_id -> array of {lat, lon, seq}
    
    const shapesContent = fs.readFileSync(path.join(EXTRACT_DIR, 'shapes.txt'), 'utf-8');
    const shapesLines = shapesContent.split('\n');
    const sHeaders = shapesLines[0].trim().split(',');
    const sidIdx = sHeaders.indexOf('shape_id');
    const latIdx = sHeaders.indexOf('shape_pt_lat');
    const lonIdx = sHeaders.indexOf('shape_pt_lon');
    const seqIdx = sHeaders.indexOf('shape_pt_sequence');
    
    for (let i = 1; i < shapesLines.length; i++) {
        const line = shapesLines[i].trim();
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

    // 3. Build final JSON structure
    console.log("Building final JSON...");
    const finalData = {}; // route_id -> [ [ [lat,lon], [lat,lon] ], ... ]
    
    for (const [rId, shapesArr] of Object.entries(selectedShapes)) {
        const shapesForRoute = [];
        for (const sId of shapesArr) {
            const points = shapePoints[sId];
            if (points) {
                points.sort((a, b) => a.seq - b.seq);
                const coordinates = points.map(p => [p.lat, p.lon]);
                shapesForRoute.push(coordinates);
            }
        }
        if (shapesForRoute.length > 0) {
            finalData[rId] = shapesForRoute;
        }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(finalData));
    console.log(`Saved ${Object.keys(finalData).length} routes to shapes.json`);
}

extractAllShapes();
