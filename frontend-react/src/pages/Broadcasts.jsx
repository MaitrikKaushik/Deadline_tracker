import { useEffect, useState } from "react";
import useAsyncData from "../hooks/useAsyncData";
import { getBroadcast, getBroadcasts, getMyBroadcasts, importBroadcast, isUnauthorized, revokeBroadcast } from "../services/api";
import { clusterPath, countLabel, formatDate, navigate } from "../utils/clusterUtils";

function Broadcasts({ code, canImport = true, onRequestLogin, onNotify, onSessionExpired }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("discover");
  const [selectedIds, setSelectedIds] = useState(null);
  const [mode, setMode] = useState("cluster");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  const { data, error, loading, reload } = useAsyncData(
    (signal) => code
      ? getBroadcast(code, { signal })
      : view === "mine"
        ? getMyBroadcasts({ signal })
        : getBroadcasts(query, { signal }),
    code ? `preview:${code}` : view === "mine" ? "mine" : `search:${query}`,
    { onUnauthorized: onSessionExpired }
  );

  // Broadcast snapshots are refreshed by the backend when the source owner
  // changes cluster membership or shared task fields. Refresh this view while
  // it is visible and whenever the browser/tab regains focus so existing pages
  // do not keep displaying an old snapshot indefinitely.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) reload();
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const intervalId = window.setInterval(refreshWhenVisible, 30000);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(intervalId);
    };
  }, [reload]);

  const handleRevoke = async (broadcast) => {
    if (!broadcast || broadcast.revokedAt || revokingId) return;
    if (!window.confirm(`Revoke sharing for "${broadcast.name}"? Existing copies will not be deleted.`)) return;
    setRevokingId(broadcast._id);
    setActionError("");
    try {
      await revokeBroadcast(broadcast._id);
      onNotify("Sharing revoked. Existing imported copies are unchanged.");
      reload();
    } catch (failure) {
      if (isUnauthorized(failure)) {
        onSessionExpired();
        return;
      }
      setActionError(failure.message);
    } finally {
      setRevokingId(null);
    }
  };

  const selectedTaskIds = selectedIds ?? (code && data && Array.isArray(data.tasks)
    ? data.tasks.map((task) => String(task.sourceTaskId))
    : []);

  const toggleTask = (id) => {
    setSelectedIds((current) => {
      const currentIds = current ?? (data?.tasks || []).map((task) => String(task.sourceTaskId));
      return currentIds.includes(id)
        ? currentIds.filter((item) => item !== id)
        : [...currentIds, id];
    });
  };

  const handleImport = async (event) => {
    event.preventDefault();
    if (!canImport || !data || importing || selectedTaskIds.length === 0) return;

    setImporting(true);
    setImportError("");
    try {
      const result = await importBroadcast(code, {
        taskIds: selectedTaskIds,
        mode,
        reminderEnabled,
      });
      if (result.cluster && result.cluster._id) {
        onNotify(result.alreadyImported ? "This shared cluster was already imported." : "Shared cluster imported successfully.");
        navigate(clusterPath.detail(result.cluster._id));
      } else {
        onNotify(result.alreadyImported ? "These deadlines were already imported." : `${countLabel((result.tasks || []).length)} added to your task list.`);
        navigate("#/");
      }
    } catch (failure) {
      if (isUnauthorized(failure)) {
        onSessionExpired();
        return;
      }
      setImportError(failure.message);
    } finally {
      setImporting(false);
    }
  };

  if (code) {
    const broadcast = data;
    return (
      <section className="cluster-page">
        <a className="back-link" href={clusterPath.broadcasts}>← Discover shared clusters</a>
        {loading && <div className="empty-state" role="status"><p>Loading shared cluster...</p></div>}
        {!loading && (error || !broadcast) && (
          <div className="empty-state" role="alert">
            <div className="empty-icon">!</div>
            <h3>Shared cluster unavailable</h3>
            <p>{error ? error.message : "This share link may be invalid or sharing may have been revoked."}</p>
            <button type="button" className="secondary-btn retry-btn" onClick={reload}>Try again</button>
          </div>
        )}
        {!loading && !error && broadcast && (
          <>
            <div className="form-card cluster-detail-card">
              <p className="eyebrow eyebrow-dark">SHARED CLUSTER</p>
              <h2>{broadcast.name}</h2>
              <p className="cluster-meta">
                <span>{countLabel((broadcast.tasks || []).length)}</span>
                {broadcast.createdAt && <span>Shared {formatDate(broadcast.createdAt)}</span>}
                <span>Code: <strong>{broadcast.code}</strong></span>
              </p>
              {broadcast.description && <p>{broadcast.description}</p>}
            </div>

            <form className="form-card broadcast-import-form" onSubmit={handleImport}>
              <div className="page-header">
                <div>
                  <p className="eyebrow eyebrow-dark">IMPORT OPTIONS</p>
                  <h2>Choose deadlines</h2>
                </div>
                <span>{countLabel(selectedTaskIds.length)} selected</span>
              </div>
              <div className="broadcast-task-options">
                {(broadcast.tasks || []).map((task) => {
                  const id = String(task.sourceTaskId);
                  return (
                    <label className="broadcast-task-option" key={id}>
                      <input type="checkbox" disabled={!canImport} checked={selectedTaskIds.includes(id)} onChange={() => toggleTask(id)} />
                      <span>
                        <strong>{task.title}</strong>
                        <small>{formatDate(task.deadline)} · {task.priority || "medium"} priority</small>
                        {task.description && <small>{task.description}</small>}
                      </span>
                    </label>
                  );
                })}
              </div>

              <fieldset className="broadcast-fieldset">
                <legend>Where should the deadlines go?</legend>
                <label><input type="radio" name="import-mode" value="cluster" disabled={!canImport} checked={mode === "cluster"} onChange={() => setMode("cluster")} /> Create a separate imported cluster</label>
                <label><input type="radio" name="import-mode" value="tasks" disabled={!canImport} checked={mode === "tasks"} onChange={() => setMode("tasks")} /> Add them directly to my task list</label>
              </fieldset>

              <label className="broadcast-reminder-choice">
                <input type="checkbox" disabled={!canImport} checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
                Enable email reminders for the imported deadlines
              </label>
              <p className="input-hint">Reminders are off by default. Imported deadlines are copied into your account; changes to the original do not affect your copies.</p>
              {importError && <p className="form-error" role="alert">{importError}</p>}
              <div className="form-actions">
                {canImport ? (
                  <button type="submit" className="primary-btn" disabled={importing || selectedTaskIds.length === 0}>
                    {importing ? "Importing..." : "Import selected deadlines"}
                  </button>
                ) : (
                  <button type="button" className="primary-btn" onClick={onRequestLogin}>Sign in to import selected deadlines</button>
                )}
                <a className="secondary-btn link-btn" href={clusterPath.broadcasts}>Cancel</a>
              </div>
            </form>
          </>
        )}
      </section>
    );
  }

  const broadcasts = Array.isArray(data) ? data : [];
  return (
    <section className="cluster-page">
      <div className="page-header">
        <div>
          <p className="eyebrow eyebrow-dark">COMMUNITY</p>
          <h2>{view === "mine" ? "My shared links" : "Discover shared clusters"}</h2>
          <p className="input-hint">{view === "mine" ? "Manage links you have shared. Revoking a link blocks new imports but leaves existing copies untouched." : "Search by cluster name or enter a share code."}</p>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Shared cluster view">
        <button type="button" className={`filter-btn ${view === "discover" ? "active" : ""}`} aria-pressed={view === "discover"} onClick={() => setView("discover")}>Discover</button>
        <button type="button" className={`filter-btn ${view === "mine" ? "active" : ""}`} aria-pressed={view === "mine"} onClick={() => setView("mine")}>My shared links</button>
      </div>
      {view === "discover" && (
        <>
          <label className="broadcast-search-label" htmlFor="broadcast-search">Search shared clusters</label>
          <input id="broadcast-search" className="broadcast-search" type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Exam Prep or A1B2C3D4E5" />
        </>
      )}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}

      {loading && <div className="empty-state" role="status"><p>Searching shared clusters...</p></div>}
      {!loading && error && (
        <div className="empty-state" role="alert"><h3>Unable to load shared clusters</h3><p>{error.message}</p><button type="button" className="secondary-btn retry-btn" onClick={reload}>Try again</button></div>
      )}
      {!loading && !error && broadcasts.length === 0 && (
        <div className="empty-state"><div className="empty-icon">⌕</div><h3>{view === "mine" ? "You haven't shared any clusters" : "No shared clusters found"}</h3><p>{view === "mine" ? "Open one of your created clusters and choose Share Cluster to create a link." : "Try another name or share code, or ask the person sharing the deadlines for their code."}</p></div>
      )}
      {!loading && !error && broadcasts.length > 0 && (
        <ul className="cluster-list">
          {broadcasts.map((broadcast) => (
            <li className="cluster-card" key={broadcast._id}>
              <div className="cluster-card-top"><h3>{broadcast.name}</h3><span className="badge badge-imported">Shared</span></div>
              <p className="cluster-meta"><span>{countLabel((broadcast.tasks || []).length)}</span>{broadcast.createdAt && <span>Shared {formatDate(broadcast.createdAt)}</span>}<span>Code: <strong>{broadcast.code}</strong></span></p>
              {broadcast.description && <p>{broadcast.description}</p>}
              <div className="cluster-card-actions">
                {view === "mine" ? (
                  <>
                    {broadcast.revokedAt ? <span className="badge badge-revoked">Revoked</span> : <a className="primary-btn link-btn" href={clusterPath.broadcast(broadcast.code)}>Open share preview</a>}
                    {!broadcast.revokedAt && <button type="button" className="delete-btn" disabled={Boolean(revokingId)} onClick={() => handleRevoke(broadcast)}>{revokingId === broadcast._id ? "Revoking..." : "Revoke sharing"}</button>}
                  </>
                ) : <a className="primary-btn link-btn" href={clusterPath.broadcast(broadcast.code)}>Preview & Import</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Broadcasts;
