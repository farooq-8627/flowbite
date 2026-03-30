# 09 — File Storage

> Files are stored in Convex's built-in storage. Metadata is tracked in our `files` table. Cloudinary handles image transformations.

---

## Strategy: Two Systems, Clear Roles

| System | Role | When |
|---|---|---|
| **Convex Storage** | Source of truth for all uploaded files | Avatars, documents, project attachments |
| **Cloudinary** | Image transformation and CDN delivery | Profile images, thumbnails, responsive images |

---

## Upload Flow

```
Browser                    Convex                     Storage
  │                          │                           │
  ├── generateUploadUrl() ──>│                           │
  │<── signed upload URL ────┤                           │
  │                          │                           │
  ├── PUT file to URL ───────┼──────────────────────────>│
  │<── storageId ────────────┼───────────────────────────┤
  │                          │                           │
  ├── saveFile(storageId) ──>│                           │
  │                          ├── insert into files table │
  │<── file metadata ────────┤                           │
```

### Backend: Generate Upload URL

```ts
// convex/files/mutations.ts
import { orgMutation } from "../_functions/authenticated";
import { v } from "convex/values";

export const generateUploadUrl = orgMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveFile = orgMutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    size: v.number(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fileId = await ctx.db.insert("files", {
      orgId: ctx.org._id,
      storageId: args.storageId,
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
      uploadedBy: ctx.user._id,
      entityType: args.entityType,
      entityId: args.entityId,
      createdAt: now,
      updatedAt: now,
    });
    return fileId;
  },
});
```

### Backend: Get File URL

```ts
// convex/files/queries.ts
export const getUrl = orgQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

### Frontend: Upload Hook

```ts
// lib/hooks/useFileUpload.ts
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "./useCurrentUser";

export function useFileUpload() {
  const { orgId } = useCurrentUser();
  const generateUrl = useMutation(api.files.mutations.generateUploadUrl);
  const saveFile = useMutation(api.files.mutations.saveFile);

  async function upload(
    file: File,
    options?: { entityType?: string; entityId?: string },
  ) {
    if (!orgId) throw new Error("No org context");

    // 1. Get signed URL
    const uploadUrl = await generateUrl({ orgId });

    // 2. Upload file directly to Convex storage
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await result.json();

    // 3. Save metadata
    const fileId = await saveFile({
      orgId,
      storageId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      entityType: options?.entityType,
      entityId: options?.entityId,
    });

    return { fileId, storageId };
  }

  return { upload };
}
```

---

## Cloudinary for Image Transforms

Use `next-cloudinary` for responsive image rendering (already installed):

```tsx
import { CldImage } from "next-cloudinary";

// For images uploaded to Cloudinary
<CldImage
  width="200"
  height="200"
  src="profile-images/user123"
  alt="Profile"
  crop="fill"
  gravity="face"
/>
```

For Convex-stored images, serve the Convex URL directly via `<img>` or `next/image`.

---

## File Association Pattern

Files are polymorphically associated via `entityType` + `entityId`:

```ts
// Get all files for a connection
const files = await ctx.db
  .query("files")
  .withIndex("by_entityType_and_entityId", q =>
    q.eq("entityType", "connection").eq("entityId", connectionId)
  )
  .take(50);
```

This lets any feature attach files without changing the files table.
