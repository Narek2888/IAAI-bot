import React, { useState, useEffect } from "react";

export default function EditFilterModal({ modal, setModal, userId, onSaved }) {
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
      year_from: parsed.year_from || 2020,
      year_to: parsed.year_to || 2026,
      auction_type: parsed.auction_type || "Buy Now",
      inventory_type: parsed.inventory_type || "Automobiles",
      min_bid: parsed.min_bid || 0,
      max_bid: parsed.max_bid || 1500,
      odo_from: parsed.odo_from || 0,
      odo_to: parsed.odo_to || 50000,
    };
  })();
  const [name, setName] = useState(initial.name);
  const [yearFrom, setYearFrom] = useState(initial.year_from);
  const [yearTo, setYearTo] = useState(initial.year_to);
  const [auctionType, setAuctionType] = useState(initial.auction_type);
  const [inventoryType, setInventoryType] = useState(initial.inventory_type);
  const [minBid, setMinBid] = useState(initial.min_bid);
  const [maxBid, setMaxBid] = useState(initial.max_bid);
  const [odoFrom, setOdoFrom] = useState(initial.odo_from);
  const [odoTo, setOdoTo] = useState(initial.odo_to);

  useEffect(() => {
    setName(initial.name);
    setYearFrom(initial.year_from);
    setYearTo(initial.year_to);
    setAuctionType(initial.auction_type);
    setInventoryType(initial.inventory_type);
    setMinBid(initial.min_bid);
    setMaxBid(initial.max_bid);
    setOdoFrom(initial.odo_from);
    setOdoTo(initial.odo_to);
    // eslint-disable-next-line
  }, [modal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const filter = {
      name,
      year_from: yearFrom,
      year_to: yearTo,
      auction_type: auctionType,
      inventory_type: inventoryType,
      min_bid: minBid,
      max_bid: maxBid,
      odo_from: odoFrom,
      odo_to: odoTo,
    };
    await fetch("/api/filters/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: userId, filter }),
    });
    setModal({ show: false, id: null, name: "", payload: "" });
    if (onSaved) onSaved();
  };

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
              onChange={(e) => setYearFrom(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>Year To</label>
            <input
              type="number"
              min="1900"
              max="2100"
              value={yearTo}
              onChange={(e) => setYearTo(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>Auction Type</label>
            <select
              value={auctionType}
              onChange={(e) => setAuctionType(e.target.value)}
            >
              <option value="Buy Now">Buy Now</option>
              <option value="Bid">Bid</option>
            </select>
          </div>
          <div>
            <label>Inventory Type</label>
            <select
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value)}
            >
              <option value="Automobiles">Automobiles</option>
              <option value="Motorcycles">Motorcycles</option>
            </select>
          </div>
          <div>
            <label>Min Bid ($)</label>
            <input
              type="number"
              min="0"
              value={minBid}
              onChange={(e) => setMinBid(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>Max Bid ($)</label>
            <input
              type="number"
              min="0"
              value={maxBid}
              onChange={(e) => setMaxBid(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>ODO From</label>
            <input
              type="number"
              min="0"
              value={odoFrom}
              onChange={(e) => setOdoFrom(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>ODO To</label>
            <input
              type="number"
              min="0"
              value={odoTo}
              onChange={(e) => setOdoTo(Number(e.target.value))}
              required
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="submit">Save</button>
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
