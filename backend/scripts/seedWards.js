require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Ward = require('../models/Ward');

const seedWards = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI or MONGODB_URI must be set');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const geojsonPath = path.join(__dirname, '..', 'wards.geojson');
    if (!fs.existsSync(geojsonPath)) {
      console.error('wards.geojson not found at', geojsonPath);
      console.log('Please create a wards.geojson file with GeoJSON Polygon features.');
      process.exit(1);
    }

    const raw = fs.readFileSync(geojsonPath, 'utf-8');
    const geojson = JSON.parse(raw);

    if (!geojson.features || !Array.isArray(geojson.features)) {
      console.error('Invalid GeoJSON: expected a FeatureCollection with features array');
      process.exit(1);
    }

    let upserted = 0;
    for (const feature of geojson.features) {
      const props = feature.properties || {};
      const name = props.name || props.ward_name || `Ward-${upserted + 1}`;
      const slaHours = props.sla_hours || 168;

      if (!feature.geometry || feature.geometry.type !== 'Polygon') {
        console.warn(`Skipping feature "${name}": geometry must be Polygon`);
        continue;
      }

      await Ward.updateOne(
        { name },
        {
          $set: {
            name,
            boundary: {
              type: 'Polygon',
              coordinates: feature.geometry.coordinates,
            },
            slaHours,
          },
        },
        { upsert: true }
      );
      upserted++;
    }

    console.log(`Seeded ${upserted} wards successfully`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
};

seedWards();
