import { useEffect, useState } from "preact/hooks";
import type { Artifact } from "../lib/artifacts.ts";
import ArtifactContent from "../components/ArtifactContent.tsx";

export default function ArtifactCanvas(props: { initial: Artifact[] }) {
  const [items, setItems] = useState(props.initial);
  const [selectedId, setSelectedId] = useState(props.initial[0]?.id ?? "");
  const [darkMode, setDarkMode] = useState(false);
  const selected = items.find((item) => item.id === selectedId);

  useEffect(() => {
    const savedTheme = localStorage.getItem("canvas-theme");
    setDarkMode(savedTheme === "dark");
    const requested = new URLSearchParams(location.search).get("artifact");
    if (requested) setSelectedId(requested);
    const events = new EventSource("/events");
    events.onmessage = (event) => {
      const updated = JSON.parse(event.data) as Artifact;
      setItems((current) => {
        if (!updated.title) {
          return current.filter((item) => item.id !== updated.id);
        }
        return [updated, ...current.filter((item) => item.id !== updated.id)];
      });
      if (updated.title) setSelectedId(updated.id);
    };
    return () => events.close();
  }, []);

  return (
    <main class="canvas-shell" data-theme={darkMode ? "dark" : "light"}>
      <header class="topbar">
        <div class="brand">
          Canvas
        </div>
        <button
          type="button"
          class="theme-toggle"
          aria-pressed={darkMode}
          onClick={() => {
            const nextTheme = darkMode ? "light" : "dark";
            setDarkMode(!darkMode);
            localStorage.setItem("canvas-theme", nextTheme);
          }}
        >
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
      </header>
      <div class="workspace">
        <aside class="sidebar">
          <div class="sidebar-heading">
            <span>YOUR CANVAS</span>
            <span class="count">
              {items.length.toString().padStart(2, "0")}
            </span>
          </div>
          {items.length === 0
            ? (
              <div class="empty-list">
                Nothing here yet.<br />Ask your agent to create an artifact.
              </div>
            )
            : (
              <nav class="artifact-list">
                {items.map((item) => (
                  <button
                    type="button"
                    class={`artifact-row ${
                      item.id === selectedId ? "active" : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                    key={item.id}
                  >
                    <span class="row-title">{item.title}</span>
                  </button>
                ))}
              </nav>
            )}
        </aside>
        <section class="stage">
          {selected
            ? (
              <article class="artifact-card">
                <div class="card-meta">
                  <span class="eyebrow">
                    ARTIFACT / {selected.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span class="updated">
                    UPDATED {new Date(selected.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <h1>{selected.title}</h1>
                <ArtifactContent artifact={selected} />
              </article>
            )
            : (
              <div class="welcome-card">
                <p class="eyebrow">A SPACE FOR WHAT YOU MAKE</p>
                <h1>
                  Your canvas<br />
                  <em>is ready.</em>
                </h1>
                <p class="welcome-copy">
                  Ask your agent to create a document, idea, or interactive
                  artifact. It will appear here, ready to explore.
                </p>
                <div class="hint">
                  Try: “Create a one page project brief for…”
                </div>
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
