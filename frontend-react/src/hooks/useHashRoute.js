import { useEffect, useState } from "react";

import { parseRoute } from "../utils/clusterUtils";

export default function useHashRoute() {
  const [route, setRoute] = useState(() =>
    parseRoute(window.location.hash)
  );

  useEffect(() => {
    const handleChange = () =>
      setRoute(parseRoute(window.location.hash));

    window.addEventListener("hashchange", handleChange);

    return () =>
      window.removeEventListener("hashchange", handleChange);
  }, []);

  return route;
}
