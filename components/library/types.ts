export type LibraryVideo = {
  key: string;
  projectId: string;
  title: string;
  src: string;
  poster?: string;
  duration: number;
  index: number;
  parts: number;
  createdAt: string;
};

export type LibraryGenerating = {
  projectId: string;
  title: string;
  duration: number;
};

export type LibraryFilter = "all" | "60" | "120" | "processing";
export type LibrarySort = "newest" | "oldest" | "longest";
export type LibraryView = "grid" | "list";

export type LibraryProfile = {
  email: string;
  displayName: string;
  avatarUrl?: string;
};
