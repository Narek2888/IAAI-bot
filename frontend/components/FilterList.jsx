import React, { useEffect, useState } from "react";

export default function FilterList({ user, refresh, onEdit, onDelete }) {
  const [filters, setFilters] = useState([]);
  useEffect(() => {
    if (!user?.username) return setFilters([]);
    fetch(`/api/filters/get?username=${encodeURIComponent(user.username)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res && res.filter) {
          // Compose a readable payload from all filter fields
          const filter = res.filter;
          const payload = Object.entries(filter)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n");
          setFilters([["1", filter.filter_name || "", payload]]);
        } else setFilters([]);
      });
  }, [user, refresh]);
  if (!user?.username) return null;
  return (
    <div>
      <h3>Saved Filters</h3>
      <ul>
        {filters.length === 0 && <li>(none)</li>}
        {filters.map(([id, name, payload]) => (
          <li key={id} className="filter-item">
            <strong>{name}</strong>
            <button
              className="small secondary"
              onClick={() => onEdit && onEdit(id, name, payload)}
              style={{ marginLeft: 8 }}
            >
              Edit
            </button>
            <button
              className="small"
              style={{ background: "#ef4444", marginLeft: 4 }}
              onClick={() => onDelete && onDelete(id)}
            >
              Delete
            </button>
            <pre>{payload}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
