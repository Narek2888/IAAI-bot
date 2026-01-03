import React, { useState } from "react";

export default function FilterEditor({ user, onSaved }) {
  const [filterName, setFilterName] = useState("");
  const [yearFrom, setYearFrom] = useState(2020);
  const [yearTo, setYearTo] = useState(2026);
  const [auctionType, setAuctionType] = useState("Buy Now");
  const [inventoryType, setInventoryType] = useState("Automobiles");
  const [minBid, setMinBid] = useState(0);
  const [maxBid, setMaxBid] = useState(1500);
  const [odoFrom, setOdoFrom] = useState(0);
  const [odoTo, setOdoTo] = useState(50000);
  if (!user?.username) return null;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const filter = {
          name: filterName,
          year_from: yearFrom,
          year_to: yearTo,
          auction_type: auctionType,
          inventory_type: inventoryType,
          min_bid: minBid,
          max_bid: maxBid,
          odo_from: odoFrom,
          odo_to: odoTo,
        };
        await fetch("/api/filters/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user.username, filter }),
        });
        setFilterName("");
        setYearFrom(2020);
        setYearTo(2026);
        setAuctionType("Buy Now");
        setInventoryType("Automobiles");
        setMinBid(0);
        setMaxBid(1500);
        setOdoFrom(0);
        setOdoTo(50000);
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
      <button type="submit">Save Filter</button>
    </form>
  );
}
