import { useCallback, useEffect, useState } from "react";

import {
  decideManagedUpdate,
  disconnectManagedImport,
  getManagedUpdates,
  isUnauthorized,
} from "../services/api";

const formatChangeValue = (change, valueKey, fallbackKey) => {
  if (change[fallbackKey] !== undefined) return change[fallbackKey];
  const value = change[valueKey];
  if (change.field === "reminderEnabled") return value ? "Enabled" : "Disabled";
  if (value === null || value === undefined || value === "") return "(empty)";
  if (change.field === "deadline" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
};

function ManagedUpdates({ onNotify, onSessionExpired }) {
  const [updates, setUpdates] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [choices, setChoices] = useState({});
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState({});
  const [disconnectedImports, setDisconnectedImports] = useState(new Set());

  const loadUpdates = useCallback(async ({ signal, silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setLoadError("");
    }
    try {
      const result = await getManagedUpdates({ signal });
      setUpdates(Array.isArray(result?.updates) ? result.updates : []);
      setConnections(Array.isArray(result?.connections) ? result.connections : []);
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }
      if (error?.name !== "AbortError" && !silent) {
        setLoadError(error.message || "Unable to load updates.");
      }
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    loadUpdates({ signal: controller.signal });
    return () => controller.abort();
  }, [loadUpdates]);

  // Source owners may make changes in a separate session while this inbox is
  // open. Refresh silently on focus/visibility and periodically while visible,
  // so proposals arrive without requiring a manual page reload. Existing user
  // decisions are preserved during background refreshes.
  useEffect(() => {
    let controller = null;
    const refreshWhenVisible = () => {
      if (document.hidden) return;
      if (controller) controller.abort();
      controller = new AbortController();
      loadUpdates({ signal: controller.signal, silent: true });
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const intervalId = window.setInterval(refreshWhenVisible, 20000);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(intervalId);
      if (controller) controller.abort();
    };
  }, [loadUpdates]);

  const setChoice = (updateId, field, action) => {
    setChoices((current) => ({
      ...current,
      [updateId]: { ...(current[updateId] || {}), [field]: action },
    }));
  };

  const handleDecision = async (update) => {
    const decisions = (update.changes || [])
      .map((change) => ({
        field: change.field,
        action: choices[update._id]?.[change.field] || "later",
      }))
      .filter((decision) => ["accept", "reject"].includes(decision.action));

    if (!decisions.length) {
      setActionError((current) => ({
        ...current,
        [update._id]: "Choose Accept or Reject for at least one field. Fields left on Decide later will remain pending.",
      }));
      return;
    }

    setBusyId(update._id);
    setActionError((current) => ({ ...current, [update._id]: "" }));
    try {
      const result = await decideManagedUpdate(update._id, decisions);
      onNotify(result.message || "Your update choices were saved.");
      window.dispatchEvent(new Event("managed-updates-changed"));
      await loadUpdates();
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }
      setActionError((current) => ({ ...current, [update._id]: error.message || "Unable to save your choices." }));
      // A deleted target or stale baseline needs a refreshed inbox so the
      // user sees the current value and can make a fresh decision.
      if (error.status === 410 || error.status === 409) await loadUpdates();
    } finally {
      setBusyId("");
    }
  };

  const handleDisconnect = async (connection) => {
    const importId = connection?._id || (
      typeof connection?.broadcastImportId === "string"
        ? connection.broadcastImportId
        : connection?.broadcastImportId?._id
    );
    if (!importId || busyId) return;
    const sourceName = connection?.broadcast?.name || connection?.broadcastId?.name || "this shared source";
    const confirmed = window.confirm(
      `Stop receiving future changes from "${sourceName}"? Existing pending proposals will remain available for your decision.`
    );
    if (!confirmed) return;

    setBusyId(importId);
    setActionError((current) => ({ ...current, [importId]: "" }));
    try {
      await disconnectManagedImport(importId);
      setDisconnectedImports((current) => new Set([...current, importId]));
      onNotify("Future updates from this source are disconnected. Existing proposals remain available.");
      window.dispatchEvent(new Event("managed-updates-changed"));
      await loadUpdates();
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }
      setActionError((current) => ({ ...current, [importId]: error.message || "Unable to disconnect this source." }));
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="managed-updates-page">
      <div className="page-header">
        <div>
          <p className="eyebrow eyebrow-dark">SOURCE CHANGES</p>
          <h2>Pending Updates</h2>
          <p className="managed-updates-intro">
            Owners can propose changes to shared deadlines and cluster membership. Nothing is applied to your copy until you accept it.
            Your completion status stays yours; email reminder changes are always presented for your approval.
          </p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => loadUpdates()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && updates.length === 0 && (
        <div className="empty-state" role="status"><p>Loading pending updates...</p></div>
      )}

      {!loading && loadError && (
        <div className="empty-state" role="alert">
          <h3>Unable to load updates</h3>
          <p>{loadError}</p>
          <button type="button" className="secondary-btn" onClick={() => loadUpdates()}>Try again</button>
        </div>
      )}

      {!loading && !loadError && updates.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✓</div>
          <h3>You're up to date</h3>
          <p>When an owner changes a shared deadline, adds or removes deadlines from a shared cluster, or renames the cluster, the proposed changes will appear here. You decide what to import.</p>
        </div>
      )}

      {connections.length > 0 && (
        <section className="managed-connections" aria-labelledby="managed-connections-title">
          <div>
            <h3 id="managed-connections-title">Connected sources</h3>
            <p className="managed-updates-guidance">Disconnect a source whenever you want. This prevents future proposals from that import; pending proposals already received remain available.</p>
          </div>
          <div className="managed-connection-list">
            {connections.map((connection) => {
              const isDisconnected = connection.syncEnabled === false || disconnectedImports.has(connection._id);
              const busy = busyId === connection._id;
              return (
                <article className="managed-connection-card" key={connection._id}>
                  <div>
                    <strong>{connection.broadcast?.name || "Shared source"}</strong>
                    <p>{connection.mode === "cluster" ? "Imported cluster" : "Imported deadlines"}{connection.broadcast?.code ? ` · ${connection.broadcast.code}` : ""}</p>
                    <span className={isDisconnected ? "managed-connection-state disconnected" : "managed-connection-state"}>
                      {isDisconnected ? "Disconnected" : "Receiving proposed updates"}
                    </span>
                    {actionError[connection._id] && <p className="form-error" role="alert">{actionError[connection._id]}</p>}
                  </div>
                  {!isDisconnected && (
                    <button type="button" className="secondary-btn" onClick={() => handleDisconnect(connection)} disabled={Boolean(busyId)}>
                      {busy ? "Disconnecting..." : "Stop future updates"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {updates.length > 0 && (
        <div className="managed-update-list">
          {updates.map((update) => {
            return (
              <article className="managed-update-card" key={update._id}>
                <div className="managed-update-heading">
                  <div>
                    <p className="eyebrow eyebrow-dark">{update.targetType === "cluster" ? "CLUSTER UPDATE" : update.targetType === "membership" ? "CLUSTER CONTENT UPDATE" : "DEADLINE UPDATE"}</p>
                    <h3>{update.itemTitle || "Shared item"}</h3>
                    <p className="managed-update-source">
                      Proposed by <strong>{update.ownerId?.name || "the source owner"}</strong> · Source: <strong>{update.broadcastId?.name || "Shared cluster"}</strong>
                      {update.broadcastId?.code ? ` · ${update.broadcastId.code}` : ""}
                    </p>
                  </div>
                  <span className="managed-update-status">Action needed</span>
                </div>

                <p className="managed-update-guidance">For each field, choose whether to import the owner's value, keep your current value, or decide later.</p>

                <div className="managed-change-list">
                  {(update.changes || []).map((change) => {
                    const choice = choices[update._id]?.[change.field] || "later";
                    const previous = formatChangeValue(change, "previousValue", "previousDisplay");
                    const proposed = formatChangeValue(change, "proposedValue", "proposedDisplay");
                    return (
                      <fieldset className="managed-change-row" key={change.field}>
                        <legend>{change.label || change.field}</legend>
                        <div className="managed-change-values">
                          <div><small>Your current value</small><strong>{previous}</strong></div>
                          <span aria-hidden="true">→</span>
                          <div><small>Owner proposes</small><strong>{proposed}</strong></div>
                        </div>
                        <div className="managed-change-choices" role="radiogroup" aria-label={`Decision for ${change.label || change.field}`}>
                          <label><input type="radio" name={`${update._id}-${change.field}`} value="accept" checked={choice === "accept"} onChange={() => setChoice(update._id, change.field, "accept")} disabled={busyId === update._id} /> Accept change</label>
                          <label><input type="radio" name={`${update._id}-${change.field}`} value="reject" checked={choice === "reject"} onChange={() => setChoice(update._id, change.field, "reject")} disabled={busyId === update._id} /> Keep my value</label>
                          <label><input type="radio" name={`${update._id}-${change.field}`} value="later" checked={choice === "later"} onChange={() => setChoice(update._id, change.field, "later")} disabled={busyId === update._id} /> Decide later</label>
                        </div>
                      </fieldset>
                    );
                  })}
                </div>

                {actionError[update._id] && <p className="form-error" role="alert">{actionError[update._id]}</p>}

                <div className="managed-update-actions">
                  <button type="button" className="primary-btn" onClick={() => handleDecision(update)} disabled={busyId === update._id}>
                    {busyId === update._id ? "Saving choices..." : "Save selected decisions"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ManagedUpdates;
