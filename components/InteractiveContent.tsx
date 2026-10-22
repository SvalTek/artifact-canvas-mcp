import { useEffect, useRef, useState } from "preact/hooks";
import type { Artifact } from "../lib/artifacts.ts";
import type { mountInteractive } from "../lib/a2ui_browser.ts";

export default function InteractiveContent(
  { artifact }: { artifact: Artifact },
) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(artifact);
  latest.current = artifact;
  const runtime = useRef<ReturnType<typeof mountInteractive>>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    import("../lib/a2ui_browser.ts").then(({ mountInteractive }) => {
      if (!cancelled && host.current) {
        runtime.current = mountInteractive(
          host.current,
          latest.current,
          setError,
        );
      }
    }).catch((error) => {
      if (!cancelled) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load this interface.",
        );
      }
    });
    return () => {
      cancelled = true;
      runtime.current?.dispose();
      runtime.current = undefined;
    };
  }, [artifact.id]);
  useEffect(() => {
    try {
      runtime.current?.update(artifact);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update this interface.",
      );
    }
  }, [artifact]);
  return (
    <>
      {error && <p role="alert" class="interactive-error">{error}</p>}
      <div ref={host} class="interactive-content" />
    </>
  );
}
