export type Mode = "personal" | "brands";

export function modeFromQuery(value: string | string[] | undefined): Mode {
  return value === "brands" ? "brands" : "personal";
}

const clip = (name: string) => ({
  mp4: `/media/${name}.mp4`,
  webm: `/media/${name}.webm`,
  poster: "/media/poster.svg",
  label: name,
});

export const HERO_CLIPS = {
  personal: [clip("hero-personal-1"), clip("hero-personal-2"), clip("hero-personal-3")],
  brands: [clip("hero-brands-1"), clip("hero-brands-2"), clip("hero-brands-3")],
};

export const ZOOM_URL = "https://zoom.us/j/81531268770";

export const COPY = {
  personal: {
    label: "Personal",
    title: "Turn the people you love into animated characters.",
    sub: "Upload a photo, pick Pixar or claymation, and get a 30 second animated short starring them. Finished, nothing to edit.",
    cta: "Make their animation for $4.99",
    secondary: "See examples",
    trust: "Credits, not a subscription. Pay once, keep every animation.",
    metaTitle: "Turn the people you love into animated characters",
    metaDescription:
      "Upload a photo, pick Pixar or claymation, and get a 30 second animated short starring them. Finished, nothing to edit.",
  },
  brands: {
    label: "Brands",
    title: "Let us run the ads, or make them yourself.",
    sub: "Book a call for 30 animations a month from your scripts, or 50 with the scripts, angles, and creative written for you. Or paste a script and make the first ad yourself.",
    cta: "Book a call",
    secondary: "See brand examples",
    trust: "The agency starts with a call. Credits are pay once.",
    metaTitle: "Let us run the ads, or make them yourself",
    metaDescription:
      "Book a call for 30 animations a month from your scripts, or 50 with the scripts, angles, and creative written for you.",
  },
} as const;

export const PERSONAL_STORY = [
  {
    title: "A gift nobody else will give.",
    text: "Birthdays, anniversaries, a new baby, a goodbye. Give something they will replay and send to everyone they know.",
    media: clip("example-personal-gift"),
  },
  {
    title: "It looks like them.",
    text: "Their photo becomes the character, and the face stays the same from the first shot to the last.",
    media: clip("example-personal-face"),
  },
  {
    title: "Short on time? Good.",
    text: "Skip the designers and the waiting. Upload, choose a style, download.",
    media: clip("example-personal-fast"),
  },
];

export const STYLES = ["Pixar", "Claymation", "Describe your own"];

export const BRAND_PAIN = [
  "Agency quotes that eat the whole campaign budget.",
  "Weeks of revisions for a 30 second spot.",
  "AI clips where your logo melts and your product changes shape.",
];

export const STEPS = [
  {
    title: "Drop in your idea",
    text: "Paste a script, upload a photo, or add a Suno song. We read the story before generating anything.",
    media: clip("step-idea"),
  },
  {
    title: "We lock the look",
    text: "Characters, products, places and logos stay consistent in every shot.",
    media: clip("step-look"),
  },
  {
    title: "Get your animation",
    text: "Pixar or claymation, cut to length, voices already in the picture.",
    media: clip("step-animation"),
  },
];

export const EXAMPLES = {
  personal: [clip("example-personal-1"), clip("example-personal-2"), clip("example-personal-3")],
  brands: [clip("example-brands-1"), clip("example-brands-2"), clip("example-brands-3")],
};

export const PACK_LINES: Record<string, string> = {
  starter: "One short",
  creator: "A longer cut",
  pro: "Your first real campaign",
  scale: "Several animations",
  agency: "A full batch",
};

export function faqFor(mode: Mode) {
  const same =
    mode === "brands"
      ? "Your product, mascot and logo stay identical from shot to shot."
      : "Their photo becomes the character, and the face stays the same from the first shot to the last.";
  return [
    {
      q: "Will it look like cheap AI?",
      a:
        mode === "brands"
          ? "The ad is built so the product, mascot and logo hold from shot to shot, the way a planned commercial does."
          : "The short is built as a finished Pixar or claymation piece, with the same face from the first shot to the last.",
    },
    { q: "Will the face or logo stay the same?", a: same },
    { q: "How long does it take?", a: "TODO: fill the real timing." },
    { q: "Can I use it commercially?", a: "TODO: confirm the license." },
    { q: "Do credits expire?", a: "TODO: confirm whether credits expire." },
  ];
}
