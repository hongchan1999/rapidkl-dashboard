const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');

const URLS = [
  "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
  "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl"
];

const TEMP_DIR = path.join(__dirname, '..', 'tmp');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SCHEDULES_FILE = path.join(PUBLIC_DIR, 'schedules.json');

const ROUTE_MAP_FILE = path.join(PUBLIC_DIR, 'route_map.json');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

let globalRouteMap = {};
try {
  globalRouteMap = JSON.parse(fs.readFileSync(ROUTE_MAP_FILE, 'utf8'));
} catch (e) {
  console.log("Could not load route_map.json");
}

const schedules = {}; // { [route_short_name]: { "0": [], "1": [] } }

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
}

function processGtfs(zipPath) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TEMP_DIR, true);

  console.log('Parsing routes.txt...');
  const routesCsv = fs.readFileSync(path.join(TEMP_DIR, 'routes.txt'), 'utf8');
  const routes = parse(routesCsv, { columns: true, skip_empty_lines: true });
  const localRouteMap = {};
  for (const r of routes) {
    localRouteMap[r.route_id] = globalRouteMap[r.route_id] || r.route_short_name || r.route_id;
  }

  console.log('Parsing trips.txt...');
  const tripsCsv = fs.readFileSync(path.join(TEMP_DIR, 'trips.txt'), 'utf8');
  const trips = parse(tripsCsv, { columns: true, skip_empty_lines: true });
  const tripMap = {};
  for (const t of trips) {
    tripMap[t.trip_id] = {
      route_short_name: localRouteMap[t.route_id],
      direction_id: t.direction_id || "0"
    };
  }

  console.log('Parsing stop_times.txt...');
  const stopTimesCsv = fs.readFileSync(path.join(TEMP_DIR, 'stop_times.txt'), 'utf8');
  const stopTimes = parse(stopTimesCsv, { columns: true, skip_empty_lines: true });
  
  for (const st of stopTimes) {
    if (st.stop_sequence === "1") {
      const trip = tripMap[st.trip_id];
      if (!trip) continue;
      
      const routeName = trip.route_short_name;
      const dir = trip.direction_id;
      
      if (!schedules[routeName]) schedules[routeName] = {};
      if (!schedules[routeName][dir]) schedules[routeName][dir] = [];
      
      let departure = st.departure_time.trim();
      // Keep only HH:MM format
      let [h, m] = departure.split(':');
      h = h.padStart(2, '0');
      m = m.padStart(2, '0');
      const formattedTime = `${h}:${m}`;
      
      if (!schedules[routeName][dir].includes(formattedTime)) {
        schedules[routeName][dir].push(formattedTime);
      }
    }
  }
}

async function main() {
  for (let i = 0; i < URLS.length; i++) {
    console.log(`Downloading GTFS feed ${i + 1}/${URLS.length}...`);
    const zipPath = path.join(TEMP_DIR, `feed_${i}.zip`);
    await downloadFile(URLS[i], zipPath);
    console.log(`Processing GTFS feed ${i + 1}...`);
    processGtfs(zipPath);
  }

  console.log('Sorting schedules...');
  for (const route in schedules) {
    for (const dir in schedules[route]) {
      schedules[route][dir].sort((a, b) => {
        const [ah, am] = a.split(':').map(Number);
        const [bh, bm] = b.split(':').map(Number);
        return (ah * 60 + am) - (bh * 60 + bm);
      });
    }
  }

  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
  console.log(`Successfully generated schedules for ${Object.keys(schedules).length} routes at ${SCHEDULES_FILE}`);
}

main().catch(console.error);
