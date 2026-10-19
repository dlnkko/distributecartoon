import { createId } from "./ids";
import type { Project, ReferenceAsset } from "./types";

export const MAX_PRODUCT_PHOTOS = 5;
export const MAX_PRODUCT_VIDEOS = 2;

export type SavedMedia = {
  path: string;
  note: string;
};

export type SavedProduct = {
  id: string;
  name: string;
  pageUrl: string;
  pageContext: string;
  useNotes: string;
  imagePath: string;
  imageNote: string;
  useVideoPath: string;
  useVideoNote: string;
  photos: SavedMedia[];
  videos: SavedMedia[];
  updatedAt: string;
};

type SavedProductRow = {
  id: string;
  name: string | null;
  page_url: string | null;
  page_context: string | null;
  use_notes: string | null;
  image_path: string | null;
  image_note: string | null;
  use_video_path: string | null;
  use_video_note: string | null;
  photos?: unknown;
  videos?: unknown;
  updated_at: string | null;
};

function mediaList(value: unknown, fallbackPath: string, fallbackNote: string): SavedMedia[] {
  const parsed = Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const path = String((item as { path?: unknown }).path || "").trim();
        if (!path) return [];
        return [{ path, note: String((item as { note?: unknown }).note || "").trim() }];
      })
    : [];
  if (parsed.length) return parsed;
  return fallbackPath ? [{ path: fallbackPath, note: fallbackNote }] : [];
}

export function mediaColumns(photos: SavedMedia[], videos: SavedMedia[]) {
  const photoList = photos.slice(0, MAX_PRODUCT_PHOTOS);
  const videoList = videos.slice(0, MAX_PRODUCT_VIDEOS);
  return {
    photos: photoList,
    videos: videoList,
    image_path: photoList[0]?.path || "",
    image_note: photoList.map((item) => item.note).filter(Boolean).join("\n"),
    use_video_path: videoList[0]?.path || "",
    use_video_note: videoList.map((item) => item.note).filter(Boolean).join("\n"),
  };
}

export function savedProductFromRow(row: SavedProductRow): SavedProduct {
  const photos = mediaList(row.photos, row.image_path || "", row.image_note || "");
  const videos = mediaList(row.videos, row.use_video_path || "", row.use_video_note || "");
  const columns = mediaColumns(photos, videos);
  return {
    id: row.id,
    name: (row.name || "Product").trim() || "Product",
    pageUrl: row.page_url || "",
    pageContext: row.page_context || "",
    useNotes: row.use_notes || "",
    imagePath: columns.image_path,
    imageNote: columns.image_note,
    useVideoPath: columns.use_video_path,
    useVideoNote: columns.use_video_note,
    photos: columns.photos,
    videos: columns.videos,
    updatedAt: row.updated_at || "",
  };
}

export function newSavedProductId() {
  return createId("prod");
}

function hosted(path: string) {
  return /^https?:\/\//i.test(path);
}

export function clearProductSlot(asset: ReferenceAsset) {
  asset.label = /^product\s*\d+$/i.test(asset.label.trim()) ? asset.label : "Product";
  asset.notes = "Optional. Only used if the script involves this product. Keep the exact pack from the photo: pouch stays a pouch, bottle stays a bottle.";
  asset.status = "empty";
  asset.includeInVideo = false;
  delete asset.savedProductId;
  delete asset.extraImagePaths;
  delete asset.pageUrl;
  delete asset.pageContext;
  delete asset.useNotes;
  delete asset.productRead;
  delete asset.productReadKey;
  delete asset.imageNote;
  delete asset.useVideoFileName;
  delete asset.useVideoPublicPath;
  delete asset.useVideoRemoteUrl;
  delete asset.useVideoNote;
  delete asset.originalFileName;
  delete asset.originalPublicPath;
  delete asset.originalRemoteUrl;
  delete asset.stylizedFileName;
  delete asset.stylizedPublicPath;
  delete asset.stylizedRemoteUrl;
  delete asset.error;
}

export function applySavedProduct(project: Project, asset: ReferenceAsset, product: SavedProduct) {
  asset.kind = "product";
  asset.label = product.name.trim() || "Product";
  asset.savedProductId = product.id;
  asset.useNotes = product.useNotes.trim();
  asset.status = product.imagePath ? "ready" : "empty";
  asset.includeInVideo = Boolean(product.imagePath);
  if (product.pageUrl) asset.pageUrl = product.pageUrl;
  else delete asset.pageUrl;
  if (product.pageContext) asset.pageContext = product.pageContext;
  else delete asset.pageContext;
  if (product.imageNote) asset.imageNote = product.imageNote;
  else delete asset.imageNote;
  const extras = product.photos.slice(1).map((item) => item.path).filter(Boolean);
  if (extras.length) asset.extraImagePaths = extras;
  else delete asset.extraImagePaths;
  if (product.imagePath) {
    asset.originalPublicPath = product.imagePath;
    asset.originalFileName = product.imagePath.split("/").pop() || "product.jpg";
    if (hosted(product.imagePath)) asset.originalRemoteUrl = product.imagePath;
    else delete asset.originalRemoteUrl;
  } else {
    delete asset.originalPublicPath;
    delete asset.originalRemoteUrl;
    delete asset.originalFileName;
  }
  if (product.useVideoPath) {
    asset.useVideoPublicPath = product.useVideoPath;
    asset.useVideoFileName = product.useVideoPath.split("/").pop() || "use.mp4";
    if (hosted(product.useVideoPath)) asset.useVideoRemoteUrl = product.useVideoPath;
    else delete asset.useVideoRemoteUrl;
  } else {
    delete asset.useVideoPublicPath;
    delete asset.useVideoRemoteUrl;
    delete asset.useVideoFileName;
  }
  if (product.useVideoNote) asset.useVideoNote = product.useVideoNote;
  else delete asset.useVideoNote;
  delete asset.productRead;
  delete asset.productReadKey;
  project.skippedRefs = false;
}
