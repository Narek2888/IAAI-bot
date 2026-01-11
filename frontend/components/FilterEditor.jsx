import React, { useState } from "react";

export default function FilterEditor({ user, onSaved }) {
  const [filterName, setFilterName] = useState("");
  const [yearFrom, setYearFrom] = useState("1900");
  const [yearTo, setYearTo] = useState("2027");
  const [auctionType, setAuctionType] = useState("Buy Now");
  const [inventoryTypes, setInventoryTypes] = useState(["Automobiles"]);
  const [fuelTypes, setFuelTypes] = useState([]);
  const [minBid, setMinBid] = useState("0");
  const [maxBid, setMaxBid] = useState("150000");
  const [odoFrom, setOdoFrom] = useState("0");
  const [odoTo, setOdoTo] = useState("150000");
  if (!user?.username) return null;

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

  // Inventory type and fuel type are optional.
  const hasTypeErrors = false;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();

        const yearFromStr = String(yearFrom || "").trim() || "1900";
        const yearToStr = String(yearTo || "").trim() || "2027";
        const minBidStr = String(minBid || "").trim() || "0";
        const maxBidStr = String(maxBid || "").trim() || "150000";
        const odoFromStr = String(odoFrom || "").trim() || "0";
        const odoToStr = String(odoTo || "").trim() || "150000";

        const filter = {
          name: filterName,
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
        await fetch("/api/filters/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user.username, filter }),
        });
        setFilterName("");
        setYearFrom("1900");
        setYearTo("2027");
        setAuctionType("Buy Now");
        setInventoryTypes(["Automobiles"]);
        setFuelTypes([]);
        setMinBid("0");
        setMaxBid("150000");
        setOdoFrom("0");
        setOdoTo("150000");
        if (onSaved) onSaved();
      }}
      style={{ marginBottom: 16 }}
    >
      <h3>Save Filter</h3>
      <input
        value={filterName}
        onChange={(e) => setFilterName(e.target.value)}
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
            onChange={(e) => {
              const v = e.target.value;
              setAuctionType(v === "Buy Now" ? v : "Buy Now");
            }}
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
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={inventoryTypes.includes("Automobiles")}
                  onChange={(e) =>
                    toggleInventoryType("Automobiles", e.target.checked)
                  }
                />
                <span>Automobiles</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
        </div>
        <div>
          <label>Fuel type</label>
          <details className="dropdown">
            <summary className="dropdown-trigger">
              {fuelTypes.length ? `${fuelTypes.length} selected` : "(any)"}
            </summary>
            <div className="dropdown-panel">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={fuelTypes.includes("Electric")}
                  onChange={(e) => toggleFuelType("Electric", e.target.checked)}
                />
                <span>Electric</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={fuelTypes.includes("Other")}
                  onChange={(e) => toggleFuelType("Other", e.target.checked)}
                />
                <span>Other</span>
              </label>
            </div>
          </details>
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
      <button type="submit" disabled={hasTypeErrors}>
        Save Filter
      </button>
    </form>
  );
}
