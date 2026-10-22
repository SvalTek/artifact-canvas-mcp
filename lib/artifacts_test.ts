import {
  deleteArtifact,
  editArtifactContent,
  getArtifact,
  saveArtifact,
} from "./artifacts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, expectedMessage: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error instance.");
    assert(
      error.message.includes(expectedMessage),
      `Expected error including ${expectedMessage}, got ${error.message}`,
    );
    return;
  }
  throw new Error(`Expected an error including ${expectedMessage}.`);
}

Deno.test("edits one exact match and preserves artifact metadata", () => {
  const id = crypto.randomUUID();
  saveArtifact({
    id,
    title: "Edit test",
    content: "Intro\nreplace this\nOutro",
    type: "code",
    language: "typescript",
  });

  try {
    const edited = editArtifactContent(id, "replace this", "updated text");
    assert(edited.content === "Intro\nupdated text\nOutro", "Content differs.");
    assert(edited.title === "Edit test", "Title was not preserved.");
    assert(edited.type === "code", "Type was not preserved.");
    assert(edited.language === "typescript", "Language was not preserved.");
  } finally {
    deleteArtifact(id);
  }
});

Deno.test("rejects missing and ambiguous exact matches without changing content", () => {
  const id = crypto.randomUUID();
  saveArtifact({ id, title: "Edit test", content: "same text and same text" });

  try {
    assertThrows(
      () => editArtifactContent(id, "absent", "replacement"),
      "not found",
    );
    assertThrows(
      () => editArtifactContent(id, "same text", "replacement"),
      "more than once",
    );
    assert(
      getArtifact(id)?.content === "same text and same text",
      "Content changed after a rejected edit.",
    );
  } finally {
    deleteArtifact(id);
  }
});
