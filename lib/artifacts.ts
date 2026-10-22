export const ARTIFACT_TYPES = ["markdown", "text", "html", "code"] as const;

export type ArtifactType = typeof ARTIFACT_TYPES[number];

export function isArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" &&
    ARTIFACT_TYPES.includes(value as ArtifactType);
}

export interface Artifact {
  id: string;
  title: string;
  content: string;
  type: ArtifactType;
  language?: string;
  updatedAt: string;
}

const artifacts = new Map<string, Artifact>();
const listeners = new Set<(artifact: Artifact) => void>();

export function listArtifacts() {
  return [...artifacts.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function getArtifact(id: string) {
  return artifacts.get(id);
}

export function saveArtifact(
  input: {
    id?: string;
    title: string;
    content: string;
    type?: ArtifactType;
    language?: string;
  },
) {
  const id = input.id ?? crypto.randomUUID();
  const previous = artifacts.get(id);
  const artifact: Artifact = {
    id,
    title: input.title,
    content: input.content,
    type: input.type ?? previous?.type ?? "markdown",
    language: input.language ?? previous?.language,
    updatedAt: new Date().toISOString(),
  };
  artifacts.set(id, artifact);
  for (const listener of listeners) {
    try {
      listener(artifact);
    } catch (error) {
      writeLog("error", "artifact:listener", errorMessage(error));
    }
  }
  return artifact;
}

export function editArtifactContent(
  id: string,
  oldText: string,
  newText: string,
) {
  if (!oldText) throw new Error("oldText must not be empty.");
  const artifact = getArtifact(id);
  if (!artifact) throw new Error(`Unknown artifact: ${id}`);

  const start = artifact.content.indexOf(oldText);
  if (start === -1) {
    throw new Error("Exact oldText was not found in the artifact content.");
  }
  if (artifact.content.indexOf(oldText, start + 1) !== -1) {
    throw new Error(
      "Exact oldText occurs more than once; provide a more specific match.",
    );
  }

  const content = artifact.content.slice(0, start) + newText +
    artifact.content.slice(start + oldText.length);
  return saveArtifact({
    id: artifact.id,
    title: artifact.title,
    content,
    type: artifact.type,
    language: artifact.language,
  });
}

export function deleteArtifact(id: string) {
  const deleted = artifacts.delete(id);
  if (deleted) {
    for (const listener of listeners) {
      try {
        listener({
          id,
          title: "",
          content: "",
          type: "markdown",
          updatedAt: "",
        });
      } catch (error) {
        writeLog("error", "artifact:listener", errorMessage(error));
      }
    }
  }
  return deleted;
}

export function subscribe(listener: (artifact: Artifact) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
import { errorMessage, writeLog } from "./logs.ts";
