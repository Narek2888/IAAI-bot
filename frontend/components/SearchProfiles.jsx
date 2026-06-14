import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../src/api";
import VehiclesPanel from "./VehiclesPanel";

const SOURCE_COPART = "COPART";

const DEFAULT_YEAR_FROM = "1900";
const DEFAULT_YEAR_TO = "2027";
const DEFAULT_MIN_BID = "0";
const DEFAULT_MAX_BID = "150000";
const DEFAULT_ODO_FROM = "0";
const DEFAULT_ODO_TO = "150000";

const emptyForm = {
  profile_name: "",
  full_search: "",
  year_from: DEFAULT_YEAR_FROM,
  year_to: DEFAULT_YEAR_TO,
  auction_type: "",
  inventory_types: [],
  fuel_types: [],
  min_bid: DEFAULT_MIN_BID,
  max_bid: DEFAULT_MAX_BID,
  odo_from: DEFAULT_ODO_FROM,
  odo_to: DEFAULT_ODO_TO,
};

function toInputValue(v) {
  return v === null || v === undefined ? "" : String(v);
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function profileToForm(p) {
  const x = p || {};
  const yearFromRaw = x.year_from;
  const yearToRaw = x.year_to;
  const useDefaultYear =
    (yearFromRaw === null || yearFromRaw === undefined || yearFromRaw === "") &&
    (yearToRaw === null || yearToRaw === undefined || yearToRaw === "");

  return {
    profile_name: toInputValue(x.profile_name),
    full_search: toInputValue(x.full_search),
    year_from: useDefaultYear ? DEFAULT_YEAR_FROM : toInputValue(x.year_from),
    year_to: useDefaultYear ? DEFAULT_YEAR_TO : toInputValue(x.year_to),
    auction_type: x.auction_type === "Buy Now" ? "Buy Now" : "",
    inventory_types: Array.isArray(x.inventory_types)
      ? x.inventory_types.filter((v) => v === "Automobiles" || v === "Motorcycles")
      : [],
    fuel_types: Array.isArray(x.fuel_types)
      ? x.fuel_types.filter((v) => v === "Electric" || v === "Other")
      : [],
    min_bid: toInputValue(x.min_bid),
    max_bid: toInputValue(x.max_bid),
    odo_from: toInputValue(x.odo_from),
    odo_to: toInputValue(x.odo_to),
  };
}

function formToPayload(form, isCopart = false) {
  const yearFrom = String(form.year_from || "").trim() || DEFAULT_YEAR_FROM;
  const yearTo = String(form.year_to || "").trim() || DEFAULT_YEAR_TO;
  const minBid = String(form.min_bid || "").trim() || DEFAULT_MIN_BID;
  const maxBid = String(form.max_bid || "").trim() || DEFAULT_MAX_BID;
  const odoFrom = String(form.odo_from || "").trim() || DEFAULT_ODO_FROM;
  const odoTo = String(form.odo_to || "").trim() || DEFAULT_ODO_TO;

  return {
    profile_name: String(form.profile_name || "").trim() || "Profile",
    full_search: String(form.full_search || "").trim() || null,
    year_from: toNumberOrNull(yearFrom),
    year_to: toNumberOrNull(yearTo),
    auction_type: isCopart ? "Buy Now" : (form.auction_type || null),
    inventory_type: form.inventory_types?.[0] || null,
    inventory_types: form.inventory_types?.length ? form.inventory_types : null,
    fuel_types: form.fuel_types?.length ? form.fuel_types : null,
    min_bid: toNumberOrNull(minBid),
    max_bid: toNumberOrNull(maxBid),
    odo_from: toNumberOrNull(odoFrom),
    odo_to: toNumberOrNull(odoTo),
  };
}

function formatRange(from, to, suffix = "") {
  const f = from !== null && from !== undefined && from !== "" ? from : null;
  const t = to !== null && to !== undefined && to !== "" ? to : null;
  if (f === null && t === null) return null;
  return `${f ?? "?"}–${t ?? "?"}${suffix}`;
}

// ---------- Filter Form (used inside modal) ----------
function FilterForm({ form, onChange, onInventoryTypeToggle, onFuelTypeToggle, isCopart }) {
  const onYearBlur = (e) => {
    const { name, value } = e.target;
    if (String(value || "").trim() !== "") return;
    onChange({ target: { name, value: name === "year_from" ? DEFAULT_YEAR_FROM : DEFAULT_YEAR_TO } });
  };

  const onBidBlur = (e) => {
    const { name, value } = e.target;
    if (String(value || "").trim() !== "") return;
    onChange({ target: { name, value: name === "min_bid" ? DEFAULT_MIN_BID : DEFAULT_MAX_BID } });
  };

  const onOdoBlur = (e) => {
    const { name, value } = e.target;
    if (String(value || "").trim() !== "") return;
    onChange({ target: { name, value: name === "odo_from" ? DEFAULT_ODO_FROM : DEFAULT_ODO_TO } });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        name="profile_name"
        placeholder="Profile name"
        value={form.profile_name}
        onChange={onChange}
      />
      <input
        name="full_search"
        placeholder="Search keyword"
        value={form.full_search}
        onChange={onChange}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
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

      {!isCopart && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Inventory type</span>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {form.inventory_types.length ? `${form.inventory_types.length} selected` : "(any)"}
              </summary>
              <div className="dropdown-panel">
                {["Automobiles", "Motorcycles"].map((v) => (
                  <label key={v} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={form.inventory_types.includes(v)}
                      onChange={(e) => onInventoryTypeToggle(v, e.target.checked)}
                    />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            </details>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Fuel type</span>
            <details className="dropdown">
              <summary className="dropdown-trigger">
                {form.fuel_types.length ? `${form.fuel_types.length} selected` : "(any)"}
              </summary>
              <div className="dropdown-panel">
                {["Electric", "Other"].map((v) => (
                  <label key={v} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={form.fuel_types.includes(v)}
                      onChange={(e) => onFuelTypeToggle(v, e.target.checked)}
                    />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            </details>
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{isCopart ? "Min BIN price" : "Min bid"}</span>
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
          <span>{isCopart ? "Max BIN price" : "Max bid"}</span>
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
    </div>
  );
}

// ---------- Profile Edit Modal ----------
function ProfileModal({ source, profile, onClose, onSaved }) {
  const isCopart = source === SOURCE_COPART;
  const isNew = !profile;
  const [form, setForm] = useState(profile ? profileToForm(profile) : { ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onInventoryTypeToggle = (value, checked) => {
    setForm((p) => {
      const next = new Set(Array.isArray(p.inventory_types) ? p.inventory_types : []);
      if (checked) next.add(value);
      else next.delete(value);
      return { ...p, inventory_types: Array.from(next) };
    });
  };

  const onFuelTypeToggle = (value, checked) => {
    setForm((p) => {
      const next = new Set(Array.isArray(p.fuel_types) ? p.fuel_types : []);
      if (checked) next.add(value);
      else next.delete(value);
      return { ...p, fuel_types: Array.from(next) };
    });
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = formToPayload(form, isCopart);
      let r;
      if (isNew) {
        r = await apiPost(`/api/search-profiles?source=${encodeURIComponent(source)}`, payload);
      } else {
        r = await apiPut(`/api/search-profiles/${profile.id}`, payload);
      }
      if (!r?.ok) {
        setError(r?.msg || "Failed to save");
        return;
      }
      onSaved(r.profile);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          background: "#fff",
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>
          {isNew ? "Add Filter" : "Edit Filter"}
        </h3>

        <FilterForm
          form={form}
          onChange={onChange}
          onInventoryTypeToggle={onInventoryTypeToggle}
          onFuelTypeToggle={onFuelTypeToggle}
          isCopart={isCopart}
        />

        {error && <div style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Per-profile Bot Controls ----------
function ProfileBotControls({ source, profile }) {
  const profileId = profile.id;
  const [bot, setBot] = useState({ running: false, continuousEnabled: null, lastOutput: null });
  const [runOnceBusy, setRunOnceBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultChanges, setResultChanges] = useState(null);
  const [resultEmailed, setResultEmailed] = useState(null);
  const [resultOutput, setResultOutput] = useState(null);
  const [resultHasEmail, setResultHasEmail] = useState(null);

  const inFlightRef = useRef(false);
  const loopIdRef = useRef(0);
  const timeoutRef = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [settings, status] = await Promise.all([
        apiGet(`/api/bot/settings?source=${encodeURIComponent(source)}&profileId=${profileId}`),
        apiGet(`/api/bot/status?source=${encodeURIComponent(source)}&profileId=${profileId}`),
      ]);
      setBot((prev) => ({
        ...prev,
        ...(settings?.ok ? settings.bot : null),
        ...(status?.ok ? status.bot : null),
      }));
    } finally {
      inFlightRef.current = false;
    }
  }, [source, profileId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll only while running
  useEffect(() => {
    loopIdRef.current += 1;
    const myId = loopIdRef.current;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (!bot.running) return;

    const pollMs = 15 * 60 * 1000;
    const tick = async () => {
      if (loopIdRef.current !== myId) return;
      if (document.visibilityState === "visible") await refresh();
      if (loopIdRef.current !== myId) return;
      timeoutRef.current = setTimeout(tick, pollMs);
    };

    timeoutRef.current = setTimeout(tick, pollMs);
    return () => {
      loopIdRef.current += 1;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [bot.running, refresh]);

  const runOnce = async () => {
    if (runOnceBusy) return;
    setResultOpen(true);
    setResultLoading(true);
    setResultChanges(null);
    setResultEmailed(null);
    setResultOutput(null);
    setResultHasEmail(null);
    setRunOnceBusy(true);

    const startedAt = Date.now();
    try {
      // Snapshot current lastRunAt so we know when a new run finishes
      let prevRunAt = null;
      try {
        const before = await apiGet(`/api/bot/status?source=${encodeURIComponent(source)}&profileId=${profileId}`);
        prevRunAt = before?.bot?.lastRunAt ?? null;
      } catch { /* ignore */ }

      // Kick off the run — server responds immediately, scrape runs in background
      const r = await apiPost(
        `/api/bot/run?mode=once&source=${encodeURIComponent(source)}&profileId=${profileId}`,
      );
      if (!r?.ok) {
        setResultOpen(false);
        setResultLoading(false);
        return alert(r?.msg || "Failed");
      }

      // Poll status until lastRunAt changes (meaning the background run finished)
      const maxWaitMs = 120_000;
      const pollIntervalMs = 2000;
      while (Date.now() - startedAt < maxWaitMs) {
        await new Promise((res) => setTimeout(res, pollIntervalMs));
        try {
          const status = await apiGet(`/api/bot/status?source=${encodeURIComponent(source)}&profileId=${profileId}`);
          const curRunAt = status?.bot?.lastRunAt ?? null;
          if (curRunAt !== null && curRunAt !== prevRunAt) {
            const c = Number(status?.bot?.lastChangesCount);
            setResultChanges(Number.isFinite(c) ? c : 0);
            if (typeof status?.bot?.lastEmailed === "boolean") setResultEmailed(status.bot.lastEmailed);
            if (status?.bot?.lastOutput) setResultOutput(String(status.bot.lastOutput));
            break;
          }
        } catch { /* keep polling */ }
      }

      try {
        const s = await apiGet(`/api/bot/settings?source=${encodeURIComponent(source)}&profileId=${profileId}`);
        setResultHasEmail(!!(s?.ok && s?.bot?.hasEmail));
      } catch {
        setResultHasEmail(false);
      }
      await refresh();
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 650 - elapsed);
      if (remaining) await new Promise((r) => setTimeout(r, remaining));
      setResultLoading(false);
      setRunOnceBusy(false);
    }
  };

  const start = async () => {
    const r = await apiPost(
      `/api/bot/run?mode=start&source=${encodeURIComponent(source)}&profileId=${profileId}`,
    );
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
  };

  const stop = async () => {
    const r = await apiPost(
      `/api/bot/run?mode=stop&source=${encodeURIComponent(source)}&profileId=${profileId}`,
    );
    if (!r?.ok) return alert(r?.msg || "Failed");
    await refresh();
  };

  const closeResult = () => {
    setResultOpen(false);
    setResultLoading(false);
    setResultChanges(null);
    setResultEmailed(null);
    setResultOutput(null);
    setResultHasEmail(null);
  };

  return (
    <>
      <style>{`
        @keyframes spProfileBot { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
      `}</style>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button onClick={runOnce} disabled={runOnceBusy} style={{ fontSize: 13 }}>
          Run once
        </button>
        <button onClick={start} disabled={bot.running} style={{ fontSize: 13 }}>
          Start continuous
        </button>
        <button onClick={stop} disabled={!bot.running} style={{ fontSize: 13 }}>
          Stop
        </button>
        {bot.running && (
          <span style={{ fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#16a34a",
            }} />
            Running
          </span>
        )}
      </div>

      {bot.lastOutput && (
        <div style={{
          marginTop: 6,
          fontSize: 11,
          color: "#6b7280",
          fontFamily: "monospace",
          wordBreak: "break-all",
          background: "#f9fafb",
          padding: "4px 8px",
          borderRadius: 4,
        }}>
          {bot.lastOutput}
        </div>
      )}

      <VehiclesPanel source={source} profileId={profileId} refreshKey={bot.lastRunAt} />

      {resultOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={closeResult}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            background: "rgba(0,0,0,0.35)",
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
              boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Run Once — {profile.profile_name || "Profile"}</div>
            {resultLoading ? (
              <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", color: "#6b7280" }}>
                <div aria-hidden="true" style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: "3px solid #e5e7eb", borderTopColor: "#3b82f6",
                  animation: "spProfileBot 0.9s linear infinite",
                }} />
                <div>The request is accepted. Working on it.</div>
              </div>
            ) : (resultChanges ?? 0) <= 0 ? (
              <div style={{ marginBottom: 12 }}>No updates matched your current filters.</div>
            ) : resultHasEmail ? (
              <div style={{ marginBottom: 12 }}>
                {resultEmailed === true
                  ? "Updates were found and an email was sent."
                  : resultEmailed === false
                    ? "Updates were found, but email was not sent."
                    : "Updates were found."}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                Updates were found, but your email is not configured. Please set your email in Manage account.
              </div>
            )}
            {!resultLoading && resultOutput && (
              <div style={{
                marginBottom: 12, padding: "8px 10px", background: "#f3f4f6",
                borderRadius: 6, fontSize: 11, color: "#374151",
                fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5,
              }}>
                {resultOutput}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={closeResult}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Profile Card ----------
function DeleteConfirmModal({ profileName, onConfirm, onCancel, deleting }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(400px, 100%)",
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Delete filter</div>
        <div style={{ color: "#374151", marginBottom: 20 }}>
          Are you sure you want to delete{" "}
          <strong>"{profileName || "this filter"}"</strong>? This action cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ source, profile, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isCopart = source === SOURCE_COPART;

  const chips = [];
  if (profile.full_search) chips.push(`"${profile.full_search}"`);
  const yearRange = formatRange(profile.year_from, profile.year_to);
  if (yearRange) chips.push(`Year: ${yearRange}`);
  const bidLabel = isCopart ? "BIN" : "Bid";
  const bidRange = formatRange(
    profile.min_bid !== null ? `$${profile.min_bid}` : null,
    profile.max_bid !== null ? `$${profile.max_bid}` : null,
  );
  if (bidRange) chips.push(`${bidLabel}: ${bidRange}`);
  const odoRange = formatRange(profile.odo_from, profile.odo_to, " mi");
  if (odoRange) chips.push(`ODO: ${odoRange}`);
  if (isCopart && profile.auction_type === "Buy Now") chips.push("Buy Now only");
  if (!isCopart && Array.isArray(profile.inventory_types) && profile.inventory_types.length) {
    chips.push(profile.inventory_types.join(", "));
  }
  if (!isCopart && Array.isArray(profile.fuel_types) && profile.fuel_types.length) {
    chips.push(profile.fuel_types.join(", "));
  }

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    try {
      const r = await apiDelete(`/api/search-profiles/${profile.id}`);
      if (!r?.ok) {
        setConfirmOpen(false);
        alert(r?.msg || "Failed to delete");
        return;
      }
      onDelete(profile.id);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      {confirmOpen && (
        <DeleteConfirmModal
          profileName={profile.profile_name}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmOpen(false)}
          deleting={deleting}
        />
      )}
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {profile.profile_name || "Untitled"}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: 12, padding: "3px 10px", fontWeight: 700 }}
              onClick={() => onEdit(profile)}
            >
              Edit
            </button>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: 12, padding: "3px 10px", color: "#dc2626", fontWeight: 700 }}
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
            >
              Delete
            </button>
          </div>
        </div>

        {chips.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {chips.map((chip) => (
              <span key={chip} style={{
                background: "#f3f4f6",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 12,
                color: "#374151",
              }}>
                {chip}
              </span>
            ))}
          </div>
        )}

        <ProfileBotControls source={source} profile={profile} />
      </div>
    </>
  );
}

// ---------- Main Component ----------
export default function SearchProfiles({ source = "IAAI" }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalProfile, setModalProfile] = useState(undefined); // undefined=closed, null=new, obj=edit

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet(`/api/search-profiles?source=${encodeURIComponent(source)}`);
      if (r?.ok) setProfiles(r.profiles || []);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const openNew = () => setModalProfile(null);
  const openEdit = (profile) => setModalProfile(profile);
  const closeModal = () => setModalProfile(undefined);

  const onSaved = (savedProfile) => {
    setProfiles((prev) => {
      const idx = prev.findIndex((p) => p.id === savedProfile.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedProfile;
        return next;
      }
      return [...prev, savedProfile];
    });
    closeModal();
  };

  const onDelete = (profileId) => {
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{source} Searches</h3>
        <button type="button" onClick={openNew}>
          + Add Filter
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280", fontSize: 14 }}>Loading…</div>
      ) : profiles.length === 0 ? (
        <div style={{
          border: "1px dashed #d1d5db",
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          color: "#6b7280",
          fontSize: 14,
        }}>
          No search filters yet. Click <strong>+ Add Filter</strong> to create one.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              source={source}
              profile={profile}
              onEdit={openEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {modalProfile !== undefined && (
        <ProfileModal
          source={source}
          profile={modalProfile}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
