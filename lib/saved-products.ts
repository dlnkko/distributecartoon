import { createId } from "./ids";
import type { Project, ReferenceAsset } from "./types";

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
  updated_at: string | null;
};

export function savedProductFromRow(row: SavedProductRow): SavedProduct {
  return {
    id: row.id,
    name: (row.name || "Product").trim() || "Product",
    pageUrl: row.page_url || "",
    pageContext: row.page_context || "",
    useNotes: row.use_notes || "",
    imagePath: row.image_path || "",
    imageNote: row.image_note || "",
    useVideoPath: row.use_video_path || "",
    useVideoNote: row.use_video_note || "",
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
