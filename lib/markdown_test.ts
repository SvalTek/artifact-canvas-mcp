import { assertStringIncludes } from "$std/assert/assert_string_includes.ts";
import { highlightCode, renderMarkdown } from "./markdown.ts";

Deno.test("renders Markdown headings, tables, and task lists", () => {
  const html = renderMarkdown(
    "# Report\n\n| Check | Result |\n| --- | --- |\n| Create | Passed |\n\n- [x] Created\n- [ ] Reopened",
  );

  assertStringIncludes(html, "<h1>Report</h1>");
  assertStringIncludes(html, "<table>");
  assertStringIncludes(html, 'type="checkbox"');
  assertStringIncludes(html, "checked");
  assertStringIncludes(html, "disabled");
});

Deno.test("escapes embedded HTML and rejects unsafe link protocols", () => {
  const html = renderMarkdown(
    '<script>alert("canvas")</script>\n\n[unsafe](javascript:alert(1))',
  );

  assertStringIncludes(html, "&lt;script&gt;");
  assertStringIncludes(html, "&lt;/script&gt;");
  if (html.includes('href="javascript:')) {
    throw new Error("Markdown renderer emitted a JavaScript URL");
  }
});

Deno.test("highlights fenced Markdown and code while escaping unknown languages", () => {
  const markdown = renderMarkdown("```ts\nconst answer: number = 42;\n```");
  const code = highlightCode("const answer = 42;", "javascript");
  const unknown = highlightCode("<script>", "not-a-real-language");

  assertStringIncludes(markdown, "hljs-keyword");
  assertStringIncludes(code, "hljs-keyword");
  assertStringIncludes(unknown, "&lt;script&gt;");
});
