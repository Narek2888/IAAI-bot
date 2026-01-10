import React, { useState, useEffect } from "react";

export default function EditFilterModal({ modal, setModal, userId, onSaved }) {
  const normalizeAuctionType = (v) => (v === "Buy Now" ? v : "Buy Now");
  const normalizeInventoryTypes = (v) => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    const out = [];
    for (const raw of arr) {
      if (raw === "Automobiles" || raw === "Motorcycles") {
        if (!out.includes(raw)) out.push(raw);
      }
    }
    return out;
  };
  const normalizeFuelTypes = (v) => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    const out = [];
    for (const raw of arr) {
      if (raw === "Electric" || raw === "Other") {
        if (!out.includes(raw)) out.push(raw);
      }
    }
    return out;
  };

  // Parse payload if present
  const initial = (() => {
    let parsed = {};
    try {
      parsed =
        typeof modal.payload === "string"
          ? JSON.parse(modal.payload)
          : modal.payload || {};
    } catch {
      parsed = {};
    }
    return {
      name: modal.name || "",
      year_from: String(parsed.year_from ?? "1900"),
      year_to: String(parsed.year_to ?? "2027"),
      auction_type: normalizeAuctionType(parsed.auction_type || "Buy Now"),
      inventory_types: normalizeInventoryTypes(
        parsed.inventory_types ?? parsed.inventory_type ?? "Automobiles"
      ),
      fuel_types: normalizeFuelTypes(parsed.fuel_types ?? parsed.fuel_type),
      min_bid: String(parsed.min_bid ?? "0"),
      max_bid: String(parsed.max_bid ?? "150000"),
      odo_from: String(parsed.odo_from ?? "0"),
      odo_to: String(parsed.odo_to ?? "150000"),
    };
  })();
  const [name, setName] = useState(initial.name);
  const [yearFrom, setYearFrom] = useState(initial.year_from);
  const [yearTo, setYearTo] = useState(initial.year_to);
  const [auctionType, setAuctionType] = useState(initial.auction_type);
  const [inventoryTypes, setInventoryTypes] = useState(initial.inventory_types);
  const [fuelTypes, setFuelTypes] = useState(initial.fuel_types);
  const [minBid, setMinBid] = useState(initial.min_bid);
  const [maxBid, setMaxBid] = useState(initial.max_bid);
  const [odoFrom, setOdoFrom] = useState(initial.odo_from);
  const [odoTo, setOdoTo] = useState(initial.odo_to);

  useEffect(() => {
    setName(initial.name);
    setYearFrom(initial.year_from);
    setYearTo(initial.year_to);
    setAuctionType(initial.auction_type);
    setInventoryTypes(initial.inventory_types);
    setFuelTypes(initial.fuel_types);
    setMinBid(initial.min_bid);
    setMaxBid(initial.max_bid);
    setOdoFrom(initial.odo_from);
    setOdoTo(initial.odo_to);
    // eslint-disable-next-line
  }, [modal]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const yearFromStr = String(yearFrom || "").trim() || "1900";
    const yearToStr = String(yearTo || "").trim() || "2027";
    const minBidStr = String(minBid || "").trim() || "0";
    const maxBidStr = String(maxBid || "").trim() || "150000";
    const odoFromStr = String(odoFrom || "").trim() || "0";
    const odoToStr = String(odoTo || "").trim() || "150000";

    const filter = {
      name,
      year_from: Number(yearFromStr),
      year_to: Number(yearToStr),
      auction_type: auctionType,
      inventory_type: inventoryTypes[0] ?? null,
      inventory_types: inventoryTypes.length ? inventoryTypes : null,
      fuel_types: fuelTypes.length ? fuelTypes : null,
      min_bid: Number(minBidStr),
      max_bid: Number(maxBidStr),
      odo_from: Number(odoFromStr),
      odo_to: Number(odoToStr),
    };
    await fetch("/api/filters/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: userId, filter }),
    });
    setModal({ show: false, id: null, name: "", payload: "" });
    if (onSaved) onSaved();
  };

  const toggleFuelType = (value, checked) => {
    setFuelTypes((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : []);
      if (checked) next.add(value);
      else next.delete(value);
      return Array.from(next);
    });
  };

  const toggleInventoryType = (value, checked) => {
    setInventoryTypes((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : []);
      if (checked) next.add(value);
      else next.delete(value);
      return Array.from(next);
    });
  };

  const inventoryTypeError = inventoryTypes.length ? "" : "Select type";
  const fuelTypeError = fuelTypes.length ? "" : "Select type";
  const hasTypeErrors = Boolean(inventoryTypeError || fuelTypeError);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.18)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 8,
          minWidth: 320,
        }}
      >
        <h3>Edit Filter</h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Filter Name"
          required
        />
        <div className="filters-grid">
          <div>
            <label>Year From</label>
            <input
              type="number"
              min="1900"
              max="2100"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              onBlur={() => {
                if (String(yearFrom || "").trim() === "") setYearFrom("1900");
              }}
            />
          </div>
          <div>
            <label>Year To</label>
            <input
              type="number"
              min="1900"
              max="2100"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              onBlur={() => {
                if (String(yearTo || "").trim() === "") setYearTo("2027");
              }}
            />
          </div>
          {/* <div>
            <label>Auction Type</label>
            <select
              value={auctionType}
              onChange={(e) =>
                setAuctionType(normalizeAuctionType(e.target.value))
              }
            >
              <option value="Buy Now">Buy Now</option>
            </select>
          </div> */}
          <div>
            <label>Inventory Type</label>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {inventoryTypes.length
                  ? `${inventoryTypes.length} selected`
                  : "(any)"}
              </summary>
              <div className="dropdown-panel">
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={inventoryTypes.includes("Automobiles")}
                    onChange={(e) =>
                      toggleInventoryType("Automobiles", e.target.checked)
                    }
                  />
                  <span>Automobiles</span>
                </label>
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={inventoryTypes.includes("Motorcycles")}
                    onChange={(e) =>
                      toggleInventoryType("Motorcycles", e.target.checked)
                    }
                  />
                  <span>Motorcycles</span>
                </label>
              </div>
            </details>
            <div
              className="field-error"
              style={{ visibility: inventoryTypeError ? "visible" : "hidden" }}
            >
              Select type
            </div>
          </div>
          <div>
            <label>Fuel type</label>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {fuelTypes.length ? `${fuelTypes.length} selected` : "(any)"}
              </summary>
              <div className="dropdown-panel">
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={fuelTypes.includes("Electric")}
                    onChange={(e) =>
                      toggleFuelType("Electric", e.target.checked)
                    }
                  />
                  <span>Electric</span>
                </label>
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={fuelTypes.includes("Other")}
                    onChange={(e) => toggleFuelType("Other", e.target.checked)}
                  />
                  <span>Other</span>
                </label>
              </div>
            </details>
            <div
              className="field-error"
              style={{ visibility: fuelTypeError ? "visible" : "hidden" }}
            >
              Select type
            </div>
          </div>
          <div>
            <label>Min Bid ($)</label>
            <input
              type="number"
              min="0"
              value={minBid}
              onChange={(e) => setMinBid(e.target.value)}
              onBlur={() => {
                if (String(minBid || "").trim() === "") setMinBid("0");
              }}
            />
          </div>
          <div>
            <label>Max Bid ($)</label>
            <input
              type="number"
              min="0"
              value={maxBid}
              onChange={(e) => setMaxBid(e.target.value)}
              onBlur={() => {
                if (String(maxBid || "").trim() === "") setMaxBid("150000");
              }}
            />
          </div>
          <div>
            <label>ODO From</label>
            <input
              type="number"
              min="0"
              value={odoFrom}
              onChange={(e) => setOdoFrom(e.target.value)}
              onBlur={() => {
                if (String(odoFrom || "").trim() === "") setOdoFrom("0");
              }}
            />
          </div>
          <div>
            <label>ODO To</label>
            <input
              type="number"
              min="0"
              value={odoTo}
              onChange={(e) => setOdoTo(e.target.value)}
              onBlur={() => {
                if (String(odoTo || "").trim() === "") setOdoTo("150000");
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="submit" disabled={hasTypeErrors}>
            Save
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setModal({ show: false, id: null, name: "", payload: "" })
            }
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
