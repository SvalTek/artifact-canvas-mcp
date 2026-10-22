export const ARTIFACT_CANVAS_SKILL_URI = "artifact-canvas://skill";

export const ARTIFACT_CANVAS_SKILL = Deno.readTextFileSync(
  new URL("../.agents/skills/artifact-canvas/SKILL.md", import.meta.url),
);

export const ARTIFACT_CANVAS_INSTRUCTIONS =
  `For artifact creation, editing, or management, first read the ${ARTIFACT_CANVAS_SKILL_URI} resource and follow its guidance. Use the artifact tools directly and return their clickable links when the user needs to open an artifact.`;

export const ARTIFACT_CANVAS_RESOURCE_DESCRIPTION =
  "Load this skill before using the artifact tools. It explains the workflow, artifact types, editing rules, and HTML sandbox constraints.";
