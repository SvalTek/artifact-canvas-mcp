import ArtifactCanvas from "../islands/ArtifactCanvas.tsx";
import { listArtifacts } from "../lib/artifacts.ts";

export default function Home() {
  return <ArtifactCanvas initial={listArtifacts()} />;
}
