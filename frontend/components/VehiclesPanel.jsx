import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "../src/api";

export default function VehiclesPanel({ source, profileId = null, refreshKey }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ source, limit: 50 });
      if (profileId) qs.set("profileId", profileId);
      const r = await apiGet(`/api/bot/vehicles?${qs}`);
      if (r?.ok) setVehicles(r.vehicles || []);
    } finally {
      setLoading(false);
    }
  }, [source, profileId]);

  // Load on mount and whenever the bot completes a run (refreshKey = lastRunAt)
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>
          Recent findings{vehicles.length > 0 ? ` (${vehicles.length})` : ""}
        </strong>
        <button onClick={load} disabled={loading} style={{ fontSize: 12, padding: "2px 8px" }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!loading && vehicles.length === 0 && (
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          No vehicles found yet. Run the bot to start.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vehicles.map((v) => (
          <VehicleCard key={v.id} v={v} />
        ))}
      </div>
    </div>
  );
}

function VehicleCard({ v }) {
  const isNew = v.change_type === "NEW";
  const isPriceChange = v.change_type === "PRICE_CHANGED";
  const date = v.detected_at ? new Date(v.detected_at).toLocaleString() : null;

  return (
    <div style={{
      display: "flex",
      gap: 10,
      padding: "8px 10px",
      border: "1px solid #e5e7eb",
      borderRadius: 6,
      background: "#fff",
    }}>
      {v.image && (
        <img
          src={v.image}
          alt=""
          style={{ width: 88, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 4,
            background: isNew ? "#dcfce7" : "#fef9c3",
            color: isNew ? "#15803d" : "#854d0e",
          }}>
            {isNew ? "NEW" : "PRICE CHANGED"}
          </span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{v.source}</span>
        </div>

        <div style={{
          fontWeight: 600,
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {v.vehicle_link
            ? <a href={v.vehicle_link} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>
                {v.title || v.vehicle_link}
              </a>
            : (v.title || "—")}
        </div>

        <div style={{ fontSize: 12, color: "#374151", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {v.price && <span><strong>{v.price}</strong></span>}
          {isPriceChange && v.old_price && (
            <span style={{ color: "#9ca3af", textDecoration: "line-through" }}>{v.old_price}</span>
          )}
          {v.year && <span style={{ color: "#6b7280" }}>{v.year}</span>}
          {v.odometer && <span style={{ color: "#6b7280" }}>{v.odometer}</span>}
        </div>

        {date && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{date}</div>
        )}
      </div>
    </div>
  );
}
