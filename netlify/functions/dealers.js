console.log("ENV CHECK", {
  hasToken: !!process.env.AIRTABLE_TOKEN,
  tokenLen: process.env.AIRTABLE_TOKEN ? process.env.AIRTABLE_TOKEN.length : 0,
  base: process.env.AIRTABLE_BASE_ID,
  table: process.env.AIRTABLE_TABLE_ID,
});

// netlify/functions/dealers.js

export const handler = async () => {
  try {
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE_ID = process.env.AIRTABLE_TABLE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    // If you do NOT have a view called "Published", set this to null
    const view = "Published";

    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    if (view) url.searchParams.set("view", view);
    url.searchParams.set("pageSize", "100");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        headers: { "content-type": "text/plain" },
        body: text,
      };
    }

    const data = await res.json();

    const dealers = (data.records || [])
      .map((r) => ({
        id: r.id,
        name: r.fields.Name,
        lat: Number(r.fields.Latitude),
        lng: Number(r.fields.Longitude),
        address: r.fields.Address,
        website: r.fields.Website,
        phone: r.fields.Phone,
      }))
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
      body: JSON.stringify({ dealers }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};

