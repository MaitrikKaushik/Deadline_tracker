import { useCallback, useEffect, useRef, useState } from "react";

// Loads data whenever `key` changes. Stale responses are ignored, and
// `loading` is derived (not set inside the effect) so there is never a
// flash of the previous result under a new key.
export default function useAsyncData(
  load,
  key,
  { onUnauthorized } = {}
) {
  const [result, setResult] = useState({
    requestKey: null,
    data: null,
    error: null,
  });
  const [reloadCount, setReloadCount] = useState(0);

  const requestKey = `${key}:${reloadCount}`;

  const loadRef = useRef(load);
  const unauthorizedRef = useRef(onUnauthorized);

  useEffect(() => {
    loadRef.current = load;
    unauthorizedRef.current = onUnauthorized;
  });

  useEffect(() => {
    const controller = new AbortController();

    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, data, error: null });
        }
      },
      (error) => {
        if (
          controller.signal.aborted ||
          (error && error.name === "AbortError")
        ) {
          return;
        }

        if (error && error.status === 401 && unauthorizedRef.current) {
          unauthorizedRef.current();
        }

        setResult({ requestKey, data: null, error });
      }
    );

    return () => controller.abort();
  }, [requestKey]);

  const loading = result.requestKey !== requestKey;

  const reload = useCallback(
    () => setReloadCount((count) => count + 1),
    []
  );

  const mutate = useCallback(
    (updater) =>
      setResult((previous) => ({
        ...previous,
        data: updater(previous.data),
      })),
    []
  );

  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    loading,
    reload,
    mutate,
  };
}
