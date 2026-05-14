const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');

const URL = "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl";
const TEMP_DIR = path.join(__dirname, '..', 'tmp');
const RAIL_DIR = path.join(TEMP_DIR, 'rail_data');

if (!fs.existsSync(RAIL_DIR)) fs.mkdirSync(RAIL_DIR, { recursive: true });

async function main() {
  const dest = path.join(TEMP_DIR, 'rail.zip');
  console.log('Downloading...');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Failed to fetch`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  
  console.log('Unzipping...');
  const zip = new AdmZip(dest);
  zip.extractAllTo(RAIL_DIR, true);

  console.log('Parsing routes.txt...');
  const routesCsv = fs.readFileSync(path.join(RAIL_DIR, 'routes.txt'), 'utf8');
  const routes = parse(routesCsv, { columns: true, skip_empty_lines: true });
  console.log(routes.slice(0, 5));
  
  console.log('Parsing stops.txt...');
  const stopsCsv = fs.readFileSync(path.join(RAIL_DIR, 'stops.txt'), 'utf8');
  const stops = parse(stopsCsv, { columns: true, skip_empty_lines: true });
  console.log("Total stops:", stops.length);
  console.log(stops.slice(0, 5));
}
main().catch(console.error);
