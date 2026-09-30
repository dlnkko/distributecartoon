"use client";

import { CreateCard, ProcessingCard, VideoCard } from "@/components/library/VideoCard";
import type { LibraryGenerating, LibraryVideo, LibraryView } from "@/components/library/types";

export function VideoGrid({
  videos,
  generating,
  view,
  resolveSrc,
  downloadName,
  onPlay,
  onEdit,
  onCreate,
}: {
  videos: LibraryVideo[];
  generating: LibraryGenerating[];
  view: LibraryView;
  resolveSrc: (path?: string) => string;
  downloadName: (item: LibraryVideo) => string;
  onPlay: (item: LibraryVideo) => void;
  onEdit: (projectId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className={view === "list" ? "cf-list" : "cf-grid"}>
      <CreateCard onCreate={onCreate} view={view} />
      {generating.map((item) => (
        <ProcessingCard key={`generating-${item.projectId}`} item={item} view={view} />
      ))}
      {videos.map((item) => (
        <VideoCard
          key={item.key}
          item={item}
          view={view}
          resolveSrc={resolveSrc}
          downloadName={downloadName(item)}
          onPlay={() => onPlay(item)}
          onEdit={() => onEdit(item.projectId)}
        />
      ))}
    </div>
  );
}
