import { useEffect, useRef, useState } from "react";

import { clusterPath } from "../utils/clusterUtils";
import { getManagedUpdates } from "../services/api";

function Navbar({ route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef(null);

  const clustersActive = route.name.startsWith("cluster");
  const broadcastsActive = route.name.startsWith("broadcast");
  const updatesActive = route.name === "managed-updates";

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    let active = true;
    const refreshCount = async () => {
      try {
        const result = await getManagedUpdates();
        if (active) setPendingCount(Number(result?.pendingCount || 0));
      } catch {
        // The inbox itself displays meaningful authentication/network errors.
      }
    };

    refreshCount();
    const refreshTimer = window.setInterval(refreshCount, 30000);
    window.addEventListener("managed-updates-changed", refreshCount);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("managed-updates-changed", refreshCount);
    };
  }, [route.name]);

  // Close the dropdown on Escape or when clicking outside of it.
  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <a
          href="#/"
          className={`navbar-link ${
            route.name === "tasks" ? "active" : ""
          }`}
          aria-current={route.name === "tasks" ? "page" : undefined}
        >
          Tasks
        </a>

        <div className="navbar-menu" ref={menuRef}>
          <button
            type="button"
            className={`navbar-link ${clustersActive ? "active" : ""}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="clusters-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Clusters
            {pendingCount > 0 && (
              <span className="navbar-count-badge" aria-label={`${pendingCount} pending updates`}>
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
            <span aria-hidden="true">▾</span>
          </button>

          {menuOpen && (
            <ul id="clusters-menu" className="navbar-dropdown">
              <li>
                <a
                  href={clusterPath.list}
                  onClick={closeMenu}
                  aria-current={
                    route.name === "clusters" ? "page" : undefined
                  }
                >
                  Show Clusters
                </a>
              </li>

              <li>
                <a
                  href={clusterPath.broadcasts}
                  onClick={closeMenu}
                  aria-current={broadcastsActive ? "page" : undefined}
                >
                  Discover & Import
                </a>
              </li>

              <li>
                <a
                  href={clusterPath.managedUpdates}
                  onClick={closeMenu}
                  aria-current={updatesActive ? "page" : undefined}
                >
                  Pending Updates
                  {pendingCount > 0 && (
                    <span className="navbar-count-badge" aria-label={`${pendingCount} pending updates`}>
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </a>
              </li>

              <li>
                <a
                  href={clusterPath.create}
                  onClick={closeMenu}
                  aria-current={
                    route.name === "cluster-new" ? "page" : undefined
                  }
                >
                  Create Cluster
                </a>
              </li>
            </ul>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
