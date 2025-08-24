const db = require('../config/database');

class GSCProperty {
  static async create(siteUrl, propertyType, displayName) {
    const query = `
      INSERT INTO gsc_properties (site_url, property_type, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (site_url)
      DO UPDATE SET 
        property_type = $2,
        display_name = $3,
        is_active = true,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await db.query(query, [siteUrl, propertyType, displayName]);
    return result.rows[0];
  }

  static async findAll() {
    const query = 'SELECT * FROM gsc_properties WHERE is_active = true ORDER BY display_name';
    const result = await db.query(query);
    return result.rows;
  }

  static async findBySiteUrl(siteUrl) {
    const query = 'SELECT * FROM gsc_properties WHERE site_url = $1 AND is_active = true';
    const result = await db.query(query, [siteUrl]);
    return result.rows[0] || null;
  }

  static async deactivate(siteUrl) {
    const query = 'UPDATE gsc_properties SET is_active = false WHERE site_url = $1';
    await db.query(query, [siteUrl]);
  }

  static async bulkUpsert(properties) {
    if (properties.length === 0) return;

    const values = properties.map((_, index) => {
      const offset = index * 3;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    }).join(', ');

    const params = properties.flatMap(p => [p.siteUrl, p.propertyType, p.displayName]);

    const query = `
      INSERT INTO gsc_properties (site_url, property_type, display_name)
      VALUES ${values}
      ON CONFLICT (site_url)
      DO UPDATE SET 
        property_type = EXCLUDED.property_type,
        display_name = EXCLUDED.display_name,
        is_active = true,
        updated_at = NOW()
    `;

    await db.query(query, params);
  }
}

module.exports = GSCProperty;