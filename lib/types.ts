export type VisualStyle = "pixar" | "claymation";
export type AspectRatio = "16:9" | "9:16";
export type WorkflowStep = "script" | "setup" | "review" | "cast" | "produce";
export type AgentMode = "plan" | "produce";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: Array<{
    kind: "video" | "image";
    src: string;
    poster?: string;
    label?: string;
  }>;
};

export type DialogueLine = {
  speaker: string;
  line: string;
};

export type Scene = {
  id: string;
  index: number;
  title: string;
  summary: string;
  location: string;
  characterNames: string[];
  extraNames: string[];
  dialogue: DialogueLine[];
  estimatedSeconds: number;
  camera: string;
};

export type CharacterClip = {
  id: string;
  fileName: string;
  publicPath: string;
  remoteUrl: string;
  batchIndex: number;
  characterNames: string[];
};

export type Character = {
  id: string;
  name: string;
  slug: string;
  description: string;
  voiceNotes: string;
  isExtra: boolean;
  lookConfirmed: boolean;
  lookRevisionUsed?: boolean;
  sourceRefId?: string;
  portraitFileName?: string;
  portraitPublicPath?: string;
  portraitRemoteUrl?: string;
  anchorVideoPublicPath?: string;
  anchorVideoRemoteUrl?: string;
  anchorVideoTaskId?: string;
  anchorSourceUrl?: string;
  latestVideoFileName?: string;
  latestVideoPublicPath?: string;
  latestVideoRemoteUrl?: string;
  clips: CharacterClip[];
};

export type ReferenceKind = "character" | "product" | "logo" | "location" | "other";

export type ScriptRefCue = {
  kind: ReferenceKind;
  cue: string;
  sceneIndexes: number[];
};

export type ReferenceAsset = {
  id: string;
  kind: ReferenceKind;
  label: string;
  notes: string;
  includeInVideo: boolean;
  originalFileName?: string;
  originalPublicPath?: string;
  originalRemoteUrl?: string;
  stylizedFileName?: string;
  stylizedPublicPath?: string;
  stylizedRemoteUrl?: string;
  status: "empty" | "uploaded" | "stylizing" | "ready" | "error";
  error?: string;
};

export type BatchStatus =
  | "planned"
  | "needs_frame"
  | "generating_frame"
  | "generating_video"
  | "done"
  | "error";

export type Batch = {
  id: string;
  index: number;
  duration: number;
  sceneIndexes: number[];
  characterNames: string[];
  extraNames: string[];
  introducesNewLead: boolean;
  newLeadNames: string[];
  cameraPlan: string;
  videoPrompt: string;
  framePrompt: string;
  pacingNotes: string;
  status: BatchStatus;
  error?: string;
  frameFileName?: string;
  framePublicPath?: string;
  frameRemoteUrl?: string;
  videoFileName?: string;
  videoPublicPath?: string;
  videoRemoteUrl?: string;
  kieVideoTaskId?: string;
};

export type ArchivedVideo = {
  id: string;
  title: string;
  publicPath: string;
  posterPath?: string;
  duration: number;
  index: number;
  createdAt: string;
};

export type LocationPlate = {
  name: string;
  publicPath: string;
  remoteUrl: string;
};

export type Project = {
  id: string;
  title: string;
  style: VisualStyle;
  aspectRatio: AspectRatio;
  scriptName: string;
  scriptText: string;
  characters: Character[];
  scenes: Scene[];
  batches: Batch[];
  archivedVideos?: ArchivedVideo[];
  references: ReferenceAsset[];
  locationPlates?: LocationPlate[];
  scriptRefCues: ScriptRefCue[];
  skippedRefs: boolean;
  ownerId?: string;
  targetDurationSeconds?: number;
  durationPending?: boolean;
  durationAuto?: boolean;
  workflowStep?: WorkflowStep;
  lastVideoFileName?: string;
  lastVideoRemoteUrl?: string;
  lastVideoPublicPath?: string;
  joinedVideoPublicPath?: string;
  joinedVideoRemoteUrl?: string;
  joinedVideoFileName?: string;
  joinedSource?: string;
  pendingQuestions: string[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type StudioEvent =
  | { type: "status"; text: string }
  | { type: "message"; message: ChatMessage }
  | { type: "project"; project: Project }
  | { type: "error"; text: string }
  | { type: "done" };
