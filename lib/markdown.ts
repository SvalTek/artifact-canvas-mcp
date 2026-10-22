import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "npm:highlight.js@11.11.1/lib/common";

export function highlightCode(source: string, language?: string) {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || !hljs.getLanguage(normalized)) return escapeHtml(source);
  return hljs.highlight(source, { language: normalized, ignoreIllegals: true })
    .value;
}

function escapeHtml(source: string) {
  return source.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!);
}

const parser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight(source: string, language: string) {
    const highlighted = highlightCode(source, language);
    return `<pre class="hljs"><code>${highlighted}</code></pre>`;
  },
})
  .use(taskLists, { enabled: false, label: true, labelAfter: true });

export function renderMarkdown(source: string) {
  return parser.render(source);
}
