import {
  isArtifactType,
  listArtifacts,
  saveArtifact,
} from "../../../lib/artifacts.ts";

export const handler = {
  GET() {
    return Response.json(listArtifacts());
  },
  POST(request: Request) {
    return request.json().then(
      ({ title, content, type, language }: {
        title: string;
        content: string;
        type?: unknown;
        language?: string;
      }) => {
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
          saveArtifact({ title: title.trim(), content, type, language }),
          {
            status: 201,
          },
        );
      },
    );
  },
};
