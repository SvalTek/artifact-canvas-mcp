import type { Artifact } from "../lib/artifacts.ts";
import { highlightCode, renderMarkdown } from "../lib/markdown.ts";

const htmlPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export default function ArtifactContent(props: { artifact: Artifact }) {
  const { artifact } = props;

  if (artifact.type === "markdown") {
    return (
      <div
        class="content markdown-body"
        // deno-lint-ignore react-no-danger -- Markdown raw HTML is disabled and links are protocol-validated.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(artifact.content) }}
      />
    );
  }

  if (artifact.type === "html") {
    const document =
      `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${htmlPolicy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${artifact.content}</body></html>`;
    return (
      <iframe
        class="content html-preview"
        title={`${artifact.title} preview`}
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        srcDoc={document}
      />
    );
  }

  if (artifact.type === "code") {
    return (
      <div class="content code-preview">
        {artifact.language && (
          <div class="code-language">{artifact.language}</div>
        )}
        <pre
          class="hljs"
          // deno-lint-ignore react-no-danger -- highlight.js escapes source text before adding token spans.
          dangerouslySetInnerHTML={{
            __html: `<code>${
              highlightCode(artifact.content, artifact.language)
            }</code>`,
          }}
        />
      </div>
    );
  }

  return <pre class="content text-preview">{artifact.content}</pre>;
}
