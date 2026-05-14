const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

// The download URL (following redirect)
const URL = "https://api.data.gov.my/gtfs-static/prasarana/?category=rapid-bus-kl";
const ZIP_PATH = path.join(__dirname, 'gtfs.zip');
const EXTRACT_DIR = path.join(__dirname, 'gtfs_data');

async function downloadGtfs() {
  console.log("Downloading GTFS Static...");
  // Use curl to download the zip to avoid dealing with node's follow-redirects
  const { execSync } = require('child_process');
  execSync(`curl.exe -L "${URL}" -o gtfs.zip`);
  console.log("Downloaded gtfs.zip");
}

async function extractGtfs() {
    console.log("Extracting GTFS...");
    const { execSync } = require('child_process');
    if (!fs.existsSync(EXTRACT_DIR)) {
        fs.mkdirSync(EXTRACT_DIR);
    }
    // Using powershell Expand-Archive
    execSync(`powershell -command "Expand-Archive -Force gtfs.zip -DestinationPath gtfs_data"`);
    console.log("Extracted gtfs_data");
}

async function processShapes() {
    console.log("Processing shapes for 1302 and 854...");
    
    // 1. Find route_id for T152 and T... wait, 1302 IS the route_id! 
    // In GTFS, trips.txt maps route_id -> trip_id -> shape_id
    // Let's find shape_ids for route 1302 and 854
    const targetRoutes = ['1302', '854'];
    const routeShapes = {}; // route_id -> Set of shape_ids
    
    const tripsContent = fs.readFileSync(path.join(EXTRACT_DIR, 'trips.txt'), 'utf-8');
    const tripsLines = tripsContent.split('\n');
    const headers = tripsLines[0].trim().split(',');
    const routeIdx = headers.indexOf('route_id');
    const shapeIdx = headers.indexOf('shape_id');
    
    for (let i = 1; i < tripsLines.length; i++) {
        const line = tripsLines[i].trim();
        if (!line) continue;
        // GTFS might have quotes, but let's do a simple split
        const parts = line.split(',');
        const rId = parts[routeIdx];
        const sId = parts[shapeIdx];
        
        if (targetRoutes.includes(rId)) {
            if (!routeShapes[rId]) routeShapes[rId] = new Set();
            routeShapes[rId].add(sId);
        }
    }
    
    console.log("Found shape IDs:", routeShapes);
    
    // We only need one shape per route (usually inbound and outbound, so maybe 2 shapes).
    // Let's grab all points for the first shape we found for each route.
    const selectedShapes = {};
    for (const rId of targetRoutes) {
        if (routeShapes[rId] && routeShapes[rId].size > 0) {
            selectedShapes[rId] = Array.from(routeShapes[rId]);
        }
    }
    
    const shapePoints = {}; // shape_id -> array of {lat, lon, seq}
    
    const shapesContent = fs.readFileSync(path.join(EXTRACT_DIR, 'shapes.txt'), 'utf-8');
    const shapesLines = shapesContent.split('\n');
    const sHeaders = shapesLines[0].trim().split(',');
    const sidIdx = sHeaders.indexOf('shape_id');
    const latIdx = sHeaders.indexOf('shape_pt_lat');
    const lonIdx = sHeaders.indexOf('shape_pt_lon');
    const seqIdx = sHeaders.indexOf('shape_pt_sequence');
    
    const allSelectedShapeIds = new Set();
    Object.values(selectedShapes).forEach(arr => arr.forEach(id => allSelectedShapeIds.add(id)));
    
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
    
    // Sort and format output
    for (const rId of targetRoutes) {
        if (!selectedShapes[rId]) {
            console.log(`No shapes found for route ${rId}`);
            continue;
        }
        
        const shapesForRoute = [];
        for (const sId of selectedShapes[rId]) {
            const points = shapePoints[sId] || [];
            points.sort((a, b) => a.seq - b.seq);
            const coordinates = points.map(p => [p.lat, p.lon]);
            shapesForRoute.push(coordinates);
        }
        
        fs.writeFileSync(
            path.join(__dirname, 'public', `route_${rId}.json`), 
            JSON.stringify(shapesForRoute)
        );
        console.log(`Saved route_${rId}.json with ${shapesForRoute.length} path(s)`);
    }
}

async function run() {
    try {
        await downloadGtfs();
        await extractGtfs();
        await processShapes();
    } catch(e) {
        console.error(e);
    }
}

run();
