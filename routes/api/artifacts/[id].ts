import {
  deleteArtifact,
  getArtifact,
  isArtifactType,
  saveArtifact,
} from "../../../lib/artifacts.ts";
import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  PUT(request, context) {
    return request.json().then(
      ({ title, content, type, language }: {
        title: string;
        content: string;
        type?: unknown;
        language?: string;
      }) => {
        if (!getArtifact(context.params.id)) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        if (!title?.trim() || typeof content !== "string") {
          return Response.json({ error: "title and content are required" }, {
            status: 400,
          });
        }
        if (type !== undefined && !isArtifactType(type)) {
          return Response.json({ error: "unsupported artifact type" }, {
            status: 400,
          });
        }
        return Response.json(
          saveArtifact({
            id: context.params.id,
            title: title.trim(),
            content,
            type,
            language,
          }),
        );
      },
    ).catch((error) =>
      Response.json({
        error: error instanceof Error ? error.message : "Invalid artifact.",
      }, { status: 400 })
    );
  },
  DELETE(_request, context) {
    return deleteArtifact(context.params.id)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "not found" }, { status: 404 });
  },
};
