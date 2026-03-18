// netlify/functions/dealers.js

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function regionFor(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Unknown";

  if (lat >= 55.7) return "Highlands";
  if (lat >= 55.3 && lng < -3.6) return "Scotland (Glasgow)";
  if (lat >= 55.7 && lng >= -3.6) return "Scotland (Edinburgh)";
  if (lat >= 54.4 && lng < -5.3) return "Northern Ireland (Belfast)";
  if (lat >= 53.6 && lng < -2.6) return "Merseyside (Liverpool)";
  if (lat >= 53.2 && lng < -1.7) return "North West (Manchester)";
  if (lat >= 53.6 && lng >= -1.8 && lng < -0.5) return "Yorkshire (Leeds)";
  if (lat >= 54.7 && lng >= -2.2) return "North East (Newcastle)";
  if (lat >= 52.7 && lng < -1.9) return "West Midlands (Birmingham)";
  if (lat >= 52.7 && lng >= -1.9 && lng < 0.3) return "East Midlands (Nottingham)";
  if (lat >= 52.2 && lng >= 0.3) return "East Anglia (Norwich)";
  if (lat >= 51.2 && lng < -2.8) return "Wales (Cardiff)";
  if (lat <= 50.9 && lng < -2.5) return "South West (Cornwall)";
  if (lat <= 51.6 && lng < -2.0) return "South West (Bristol)";
  if (lat <= 51.1 && lng >= -2.0 && lng < 0.5) return "South Coast";
  if (lat <= 51.8 && lng >= -0.9 && lng <= 1.7) return "London & South East";
  if (lat >= 51.3 && lat <= 51.7 && lng >= -0.35 && lng <= 0.2) return "London (Central)";
  return "UK Overview";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS_HEADERS }, body: "" };
  }

  try {
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE_ID = process.env.AIRTABLE_TABLE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    if (!BASE_ID || !TABLE_ID || !TOKEN) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing Airtable env vars" }),
      };
    }

    const view = "Published";
    const pageSize = 100;
    let offset = null;
    const allRecords = [];

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
      url.searchParams.set("pageSize", String(pageSize));
      url.searchParams.set("view", view);
      if (offset) url.searchParams.set("offset", offset);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          statusCode: res.status,
          headers: { ...CORS_HEADERS, "content-type": "text/plain" },
          body: text,
        };
      }

      const data = await res.json();
      allRecords.push(...(data.records || []));
      offset = data.offset || null;
    } while (offset);

    const rows = allRecords.map((r) => {
      const lat = Number(r.fields["Latitude"]);
      const lng = Number(r.fields["Longitude"]);

      return {
        id: r.id,
        dealerId: r.fields["Dealer ID"],
        name: r.fields["Dealer Name"],
        address: r.fields["Site Address"],
        postcode: r.fields["Postcode"],
        auditor: r.fields["Auditor"],
        auditFrequency: r.fields["Audit Frequency"],
        status: r.fields["Dealer Status"],
        lat,
        lng,
        region: regionFor(lat, lng),
      };
    });

    const activeRows = rows.filter((d) => norm(d.status) === "active");
    const mappableRows = activeRows.filter(
      (d) => Number.isFinite(d.lat) && Number.isFinite(d.lng)
    );

    function dedupe(list) {
      const seen = new Set();
      const out = [];

      for (const d of list) {
        const key = norm(d.dealerId || d.name || d.id);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(d);
      }

      return out;
    }

    const uniqueActiveDealers = dedupe(activeRows);
    const mappedDealers = dedupe(mappableRows);

    const regionCounts = {};
    for (const d of mappedDealers) {
      const key = d.region || "Unknown";
      regionCounts[key] = (regionCounts[key] || 0) + 1;
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
      body: JSON.stringify({
        count_records: allRecords.length,
        count_active: activeRows.length,
        count_unique_dealers: uniqueActiveDealers.length,
        count_mapped_dealers: mappedDealers.length,
        region_counts: regionCounts,
        dealers: mappedDealers,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
