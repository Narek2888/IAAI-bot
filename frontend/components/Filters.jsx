import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../src/api";

const empty = {
  filter_name: "",
  year_from: "",
  year_to: "",
  auction_type: "",
  inventory_type: "",
  min_bid: "",
  max_bid: "",
  odo_from: "",
  odo_to: "",
};

function toInputValue(v) {
  return v === null || v === undefined ? "" : String(v);
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fromApiFilter(f) {
  const x = f || {};
  return {
    filter_name: toInputValue(x.filter_name),
    year_from: toInputValue(x.year_from),
    year_to: toInputValue(x.year_to),
    auction_type: toInputValue(x.auction_type),
    inventory_type: toInputValue(x.inventory_type),
    min_bid: toInputValue(x.min_bid),
    max_bid: toInputValue(x.max_bid),
    odo_from: toInputValue(x.odo_from),
    odo_to: toInputValue(x.odo_to),
  };
}

export default function Filters() {
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      setStatus("");
      const r = await apiGet("/api/filters");
      if (!mounted) return;

      if (r?.ok) {
        setForm(fromApiFilter(r.filter));
      } else {
        setStatus(r?.msg || "Failed to load filters");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("");

    const payload = {
      filter_name: form.filter_name || null,
      year_from: toNumberOrNull(form.year_from),
      year_to: toNumberOrNull(form.year_to),
      auction_type: form.auction_type || null,
      inventory_type: form.inventory_type || null,
      min_bid: toNumberOrNull(form.min_bid),
      max_bid: toNumberOrNull(form.max_bid),
      odo_from: toNumberOrNull(form.odo_from),
      odo_to: toNumberOrNull(form.odo_to),
    };

    const r = await apiPost("/api/filters", payload);
    if (!r?.ok) {
      setStatus(r?.msg || "Failed to save filters");
      return;
    }

    setForm(fromApiFilter(r.filter));
    setStatus("Saved");
  };

  const onReset = async () => {
    setStatus("");

    const payload = {
      filter_name: null,
      year_from: null,
      year_to: null,
      auction_type: null,
      inventory_type: null,
      min_bid: null,
      max_bid: null,
      odo_from: null,
      odo_to: null,
    };

    const r = await apiPost("/api/filters", payload);
    if (!r?.ok) {
      setStatus(r?.msg || "Failed to reset filters");
      return;
    }

    setForm(fromApiFilter(r.filter));
    setStatus("Reset");
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Filters</h3>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          name="filter_name"
          placeholder="Filter name (optional)"
          value={form.filter_name}
          onChange={onChange}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Year from</span>
            <input
              name="year_from"
              type="number"
              min="1900"
              max="2100"
              value={form.year_from}
              onChange={onChange}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Year to</span>
            <input
              name="year_to"
              type="number"
              min="1900"
              max="2100"
              value={form.year_to}
              onChange={onChange}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Auction type</span>
            <select
              name="auction_type"
              value={form.auction_type}
              onChange={onChange}
            >
              <option value="">(any)</option>
              <option value="Buy Now">Buy Now</option>
              <option value="Bid">Bid</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Inventory type</span>
            <select
              name="inventory_type"
              value={form.inventory_type}
              onChange={onChange}
            >
              <option value="">(any)</option>
              <option value="Automobiles">Automobiles</option>
              <option value="Motorcycles">Motorcycles</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Min bid</span>
            <input
              name="min_bid"
              type="number"
              min="0"
              value={form.min_bid}
              onChange={onChange}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Max bid</span>
            <input
              name="max_bid"
              type="number"
              min="0"
              value={form.max_bid}
              onChange={onChange}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>ODO from</span>
            <input
              name="odo_from"
              type="number"
              min="0"
              value={form.odo_from}
              onChange={onChange}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>ODO to</span>
            <input
              name="odo_to"
              type="number"
              min="0"
              value={form.odo_to}
              onChange={onChange}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit">Save</button>
          <button type="button" onClick={onReset} style={{ fontSize: 12 }}>
            Reset filters
          </button>
          {status && <span>{status}</span>}
        </div>
      </form>
    </div>
  );
}
