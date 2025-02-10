import { MemberRole } from "@/features/members/types";
import {
  DATABASE_ID,
  IMAGES_BUCKET_ID,
  MEMBERS_ID,
  WORKSPACES_ID,
} from "@/lib/config";
import { sessionMiddleware } from "@/lib/session-middleware";
import { generateInviteCode } from "@/lib/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ID, Query } from "node-appwrite";
import { createWorkspaceSchema } from "../schemas";

const app = new Hono()
  .get("/", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");

    const members = await databases.listDocuments(DATABASE_ID, MEMBERS_ID, [
      Query.equal("userId", user.$id),
    ]);

    if (members.total === 0) {
      return c.json({ data: { documents: [], total: 0 } });
    }

    const workspaceIds = members.documents.map((member) => member.workspaceId);

    const workspaces = await databases.listDocuments(
      DATABASE_ID,
      WORKSPACES_ID,
      [Query.contains("$id", workspaceIds), Query.orderDesc("$createdAt")]
    );

    return c.json({ data: workspaces });
  })
  .post(
    "/",
    zValidator("form", createWorkspaceSchema),
    sessionMiddleware,
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { name, image } = c.req.valid("form");

      let uploadedImageUrl: string = "";

      if (image instanceof File) {
        const file = await storage.createFile(
          IMAGES_BUCKET_ID,
          ID.unique(),
          image
        );

        const arrayBuffer = await storage.getFilePreview(
          IMAGES_BUCKET_ID,
          file.$id
        );
        uploadedImageUrl = `data:${file.mimeType};base64,${Buffer.from(
          arrayBuffer
        ).toString("base64")}`;
      }

      const workspace = await databases.createDocument(
        DATABASE_ID,
        WORKSPACES_ID,
        ID.unique(),
        {
          name,
          userId: user.$id,
          imageUrl: uploadedImageUrl,
          inviteCode: generateInviteCode(6),
        }
      );

      await databases.createDocument(DATABASE_ID, MEMBERS_ID, ID.unique(), {
        userId: user.$id,
        workspaceId: workspace.$id,
        role: MemberRole.ADMIN,
      });

      return c.json({ data: workspace });
    }
  );

export default app;
