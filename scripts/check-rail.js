const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

async function check(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(url, "Failed", res.status);
      return;
    }
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    console.log(url, "Entities:", feed.entity.length);
    if (feed.entity.length > 0) {
      console.log("Sample entity keys:", Object.keys(feed.entity[0]));
      if (feed.entity[0].tripUpdate) {
         console.log("Has Trip Updates!");
      }
      if (feed.entity[0].vehicle) {
         console.log("Has Vehicle Positions!");
      }
    }
  } catch (e) {
    console.log(url, "Error:", e.message);
  }
}

async function main() {
  await check("https://api.data.gov.my/gtfs-realtime/trip-updates/prasarana?category=rapid-rail-kl");
  await check("https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl");
}
main();
