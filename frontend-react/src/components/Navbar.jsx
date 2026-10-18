import { useEffect, useRef, useState } from "react";

import { clusterPath } from "../utils/clusterUtils";

function Navbar({ route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const clustersActive = route.name.startsWith("cluster");
  const broadcastsActive = route.name.startsWith("broadcast");

  const closeMenu = () => setMenuOpen(false);

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
            Clusters <span aria-hidden="true">▾</span>
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
