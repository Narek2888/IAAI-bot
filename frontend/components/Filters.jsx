import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../src/api";

const DEFAULT_YEAR_FROM = "1900";
const DEFAULT_YEAR_TO = "2027";
const DEFAULT_MIN_BID = "0";
const DEFAULT_MAX_BID = "150000";
const DEFAULT_ODO_FROM = "0";
const DEFAULT_ODO_TO = "150000";

const empty = {
  filter_name: "",
  year_from: DEFAULT_YEAR_FROM,
  year_to: DEFAULT_YEAR_TO,
  auction_type: "",
  inventory_types: [],
  fuel_types: [],
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
  const yearFromRaw = x.year_from;
  const yearToRaw = x.year_to;
  const useDefaultYearRange =
    (yearFromRaw === null || yearFromRaw === undefined || yearFromRaw === "") &&
    (yearToRaw === null || yearToRaw === undefined || yearToRaw === "");
  const normalizeAuctionType = (v) => {
    // "Bid" is no longer supported in the UI; treat it as unset.
    return v === "Buy Now" ? v : "";
  };
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
  return {
    filter_name: toInputValue(x.filter_name),
    year_from: useDefaultYearRange
      ? DEFAULT_YEAR_FROM
      : toInputValue(x.year_from),
    year_to: useDefaultYearRange ? DEFAULT_YEAR_TO : toInputValue(x.year_to),
    auction_type: normalizeAuctionType(toInputValue(x.auction_type)),
    // Prefer new inventory_types array; fall back to legacy inventory_type.
    inventory_types: normalizeInventoryTypes(
      Array.isArray(x.inventory_types) ? x.inventory_types : x.inventory_type
    ),
    // Prefer new fuel_types array; fall back to legacy fuel_type.
    fuel_types: normalizeFuelTypes(
      Array.isArray(x.fuel_types) ? x.fuel_types : x.fuel_type
    ),
    min_bid: toInputValue(x.min_bid),
    max_bid: toInputValue(x.max_bid),
    odo_from: toInputValue(x.odo_from),
    odo_to: toInputValue(x.odo_to),
  };
}

export default function Filters({ onTypeErrorsChange }) {
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState("");
  const [filtersSavedOpen, setFiltersSavedOpen] = useState(false);

  const inventoryTypeError =
    Array.isArray(form.inventory_types) && form.inventory_types.length
      ? ""
      : "Select type";
  const fuelTypeError =
    Array.isArray(form.fuel_types) && form.fuel_types.length
      ? ""
      : "Select type";
  const hasTypeErrors = Boolean(inventoryTypeError || fuelTypeError);

  useEffect(() => {
    if (typeof onTypeErrorsChange === "function") {
      onTypeErrorsChange(hasTypeErrors);
    }
  }, [hasTypeErrors, onTypeErrorsChange]);

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

  const onYearBlur = (e) => {
    const { name, value } = e.target;
    if (name !== "year_from" && name !== "year_to") return;
    if (String(value || "").trim() !== "") return;

    setForm((p) => ({
      ...p,
      [name]: name === "year_from" ? DEFAULT_YEAR_FROM : DEFAULT_YEAR_TO,
    }));
  };

  const onBidBlur = (e) => {
    const { name, value } = e.target;
    if (name !== "min_bid" && name !== "max_bid") return;
    if (String(value || "").trim() !== "") return;

    setForm((p) => ({
      ...p,
      [name]: name === "min_bid" ? DEFAULT_MIN_BID : DEFAULT_MAX_BID,
    }));
  };

  const onOdoBlur = (e) => {
    const { name, value } = e.target;
    if (name !== "odo_from" && name !== "odo_to") return;
    if (String(value || "").trim() !== "") return;

    setForm((p) => ({
      ...p,
      [name]: name === "odo_from" ? DEFAULT_ODO_FROM : DEFAULT_ODO_TO,
    }));
  };

  const onFuelTypeToggle = (value, checked) => {
    setForm((p) => {
      const next = new Set(Array.isArray(p.fuel_types) ? p.fuel_types : []);
      if (checked) next.add(value);
      else next.delete(value);
      return { ...p, fuel_types: Array.from(next) };
    });
  };

  const onInventoryTypeToggle = (value, checked) => {
    setForm((p) => {
      const next = new Set(
        Array.isArray(p.inventory_types) ? p.inventory_types : []
      );
      if (checked) next.add(value);
      else next.delete(value);
      return { ...p, inventory_types: Array.from(next) };
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("");

    if (hasTypeErrors) {
      setStatus("Select type");
      return;
    }

    const yearFromStr = String(form.year_from || "").trim();
    const yearToStr = String(form.year_to || "").trim();
    const yearFromVal = yearFromStr === "" ? DEFAULT_YEAR_FROM : yearFromStr;
    const yearToVal = yearToStr === "" ? DEFAULT_YEAR_TO : yearToStr;

    const minBidStr = String(form.min_bid || "").trim();
    const maxBidStr = String(form.max_bid || "").trim();
    const minBidVal = minBidStr === "" ? DEFAULT_MIN_BID : minBidStr;
    const maxBidVal = maxBidStr === "" ? DEFAULT_MAX_BID : maxBidStr;

    const odoFromStr = String(form.odo_from || "").trim();
    const odoToStr = String(form.odo_to || "").trim();
    const odoFromVal = odoFromStr === "" ? DEFAULT_ODO_FROM : odoFromStr;
    const odoToVal = odoToStr === "" ? DEFAULT_ODO_TO : odoToStr;

    const payload = {
      filter_name: form.filter_name || null,
      year_from: toNumberOrNull(yearFromVal),
      year_to: toNumberOrNull(yearToVal),
      auction_type: form.auction_type || null,
      inventory_type: form.inventory_types?.[0] || null,
      inventory_types: form.inventory_types?.length
        ? form.inventory_types
        : null,
      fuel_types: form.fuel_types?.length ? form.fuel_types : null,
      min_bid: toNumberOrNull(minBidVal),
      max_bid: toNumberOrNull(maxBidVal),
      odo_from: toNumberOrNull(odoFromVal),
      odo_to: toNumberOrNull(odoToVal),
    };

    const r = await apiPost("/api/filters", payload);
    if (!r?.ok) {
      setStatus(r?.msg || "Failed to save filters");
      return;
    }

    setForm(fromApiFilter(r.filter));
    setStatus("Saved");
    setFiltersSavedOpen(true);
  };

  const onReset = async () => {
    setStatus("");

    // Reset UI immediately (so errors show right away)
    setForm({
      filter_name: "",
      year_from: DEFAULT_YEAR_FROM,
      year_to: DEFAULT_YEAR_TO,
      auction_type: "",
      inventory_types: [], // (any) -> triggers validation error
      fuel_types: [], // (any) -> triggers validation error
      min_bid: DEFAULT_MIN_BID,
      max_bid: DEFAULT_MAX_BID,
      odo_from: DEFAULT_ODO_FROM,
      odo_to: DEFAULT_ODO_TO,
    });

    const payload = {
      filter_name: null,
      year_from: toNumberOrNull(DEFAULT_YEAR_FROM),
      year_to: toNumberOrNull(DEFAULT_YEAR_TO),
      auction_type: null,
      inventory_type: null,
      inventory_types: null,
      fuel_types: null,
      min_bid: toNumberOrNull(DEFAULT_MIN_BID),
      max_bid: toNumberOrNull(DEFAULT_MAX_BID),
      odo_from: toNumberOrNull(DEFAULT_ODO_FROM),
      odo_to: toNumberOrNull(DEFAULT_ODO_TO),
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

      {filtersSavedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="filters-saved-title"
          onMouseDown={() => setFiltersSavedOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
            }}
          >
            <h3 id="filters-saved-title" style={{ marginTop: 0 }}>
              Filters are saved
            </h3>
            <div style={{ marginBottom: 12 }}>Filters are saved</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setFiltersSavedOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

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
              onBlur={onYearBlur}
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
              onBlur={onYearBlur}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* <label style={{ display: "grid", gap: 4 }}>
            <span>Auction type</span>
            <select
              name="auction_type"
              value={form.auction_type}
              onChange={onChange}
            >
              <option value="">(any)</option>
              <option value="Buy Now">Buy Now</option>
            </select>
          </label> */}

          <label style={{ display: "grid", gap: 4 }}>
            <span>Inventory type</span>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {form.inventory_types.length
                  ? `${form.inventory_types.length} selected`
                  : "(any)"}
              </summary>
              <div className="dropdown-panel">
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={form.inventory_types.includes("Automobiles")}
                    onChange={(e) =>
                      onInventoryTypeToggle("Automobiles", e.target.checked)
                    }
                  />
                  <span>Automobiles</span>
                </label>
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={form.inventory_types.includes("Motorcycles")}
                    onChange={(e) =>
                      onInventoryTypeToggle("Motorcycles", e.target.checked)
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
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Fuel type</span>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {form.fuel_types.length
                  ? `${form.fuel_types.length} selected`
                  : "(any)"}
              </summary>
              <div className="dropdown-panel">
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={form.fuel_types.includes("Electric")}
                    onChange={(e) =>
                      onFuelTypeToggle("Electric", e.target.checked)
                    }
                  />
                  <span>Electric</span>
                </label>
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={form.fuel_types.includes("Other")}
                    onChange={(e) =>
                      onFuelTypeToggle("Other", e.target.checked)
                    }
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
              onBlur={onBidBlur}
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
              onBlur={onBidBlur}
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
              onBlur={onOdoBlur}
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
              onBlur={onOdoBlur}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" disabled={hasTypeErrors}>
            Save
          </button>
          <button type="button" onClick={onReset} style={{ fontSize: 12 }}>
            Reset filters
          </button>
          {status && <span>{status}</span>}
        </div>
      </form>
    </div>
  );
}
