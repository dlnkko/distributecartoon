export type Mode = "personal" | "brands";

export type Film = {
  mp4: string;
  webm: string;
  poster: string;
  label: string;
  title: string;
  text: string;
  ratio: "9:16" | "16:9";
};

export function modeFromQuery(value: string | string[] | undefined): Mode {
  return value === "brands" ? "brands" : "personal";
}

function film(name: string, label: string, title = "", text = "", ratio: Film["ratio"] = "9:16"): Film {
  return {
    mp4: `/media/${name}.mp4`,
    webm: "",
    poster: `/media/${name}.jpg`,
    label,
    title,
    text,
    ratio,
  };
}

export const FILMS: Film[] = [
  film(
    "outback-signal",
    "Outback Signal",
    "Outback Signal",
    "A brand story with one look from the first shot to the last.",
    "16:9",
  ),
  film(
    "tigre-and-the-last-chance",
    "Tigre and the last chance",
    "Tigre and the last chance",
    "A mother, a child, and a kitten. The same faces the whole way through.",
  ),
  film(
    "don-julio-and-canela",
    "Don Julio and Canela",
    "Don Julio and Canela",
    "Same man, same dog, from the first frame to the last.",
  ),
  film(
    "beto-and-osofuerte",
    "Beto and OsoFuerte",
    "Beto and OsoFuerte",
    "Two minutes, one look, no reshoots.",
  ),
  film(
    "lumabrew-brew-your-mood",
    "LumaBrew",
    "LumaBrew",
    "A product, a morning, and a mood. Told in clay.",
  ),
  film(
    "calm-in-your-ears",
    "Calm in your ears",
    "Calm in your ears",
    "The problem, then the product, in one short film.",
  ),
];

export const PERSONAL_HERO = FILMS[1];
export const BRAND_HERO = FILMS[0];

export const ZOOM_URL = "https://zoom.us/j/81531268770";

export const COPY = {
  personal: {
    label: "Personal",
    title: "Any idea. Animated like a billion dollar studio made it.",
    sub: "Every film on this page was one-shotted. You write the idea. We direct it. Your own KIE key pays the model.",
    cta: "I want to bring my idea to life",
    films: "Watch the films",
    trust: "You own every video you make.",
    metaTitle: "Any idea, animated like a billion dollar studio made it",
    metaDescription:
      "Turn any idea into a studio quality animation. No prompting, consistent characters, ready in about 10 minutes.",
  },
  brands: {
    label: "Brands",
    title: "The ads breaking the market right now. One\u2011shotted.",
    sub: "A script, your product, one generation. You pay the model on your KIE key. You pay us for the direction that makes the first take the ad.",
    cta: "I want my winning ad",
    films: "Watch the ads",
    trust: "Built for organic and paid.",
    metaTitle: "The ads breaking the market right now, one-shotted",
    metaDescription:
      "A script and your product, one generation. You pay the model on your KIE key. You pay Clickframes for the direction.",
  },
} as const;

export const PERSONAL_EDGE = [
  { title: "One-shotted", text: "The films on this page were generated once. The first take is the film, or about 90% of it." },
  { title: "The same face the whole way", text: "Voices, looks, and places stay put from the first shot to the last." },
  { title: "The bad takes never get made", text: "You are not spending the budget on generations you throw away." },
];

export const BRAND_PAIN = [
  { title: "Editors on their schedule", text: "Waiting days for a cut you needed yesterday." },
  { title: "Editor fees on every ad", text: "A new invoice for every concept you want to test." },
  { title: "Paying again for retries", text: "Every revision on every ad adds to the bill." },
];

export const BRAND_AGENCY = {
  title: "Rather skip the ideation too?",
  text: "Hire us on an agency plan and we come up with the concepts for you.",
  cta: "Book a call",
};

export const STEPS = [
  {
    title: "Write it in plain language",
    text: "A script, a storyboard, a photo, or a song. The way you would explain it to a friend.",
  },
  {
    title: "We direct the first take",
    text: "Clickframes locks the look, the shots, and the continuity, so the first generation is the film, or about 90% of it.",
  },
  {
    title: "Render on your KIE key",
    text: "You add your own KIE API key. The model bills your KIE account. The membership is only the workflow.",
  },
];

export const RENDER_COMPARE = [
  { name: "KIE", price: 37, note: "Your key. You pay the model.", yours: true },
  { name: "Higgsfield", price: 55, note: "Same five minutes.", yours: false },
  { name: "Fal", price: 66, note: "Same model, their API price.", yours: false },
] as const;

export function faqFor(mode: Mode) {
  return [
    {
      q: "Do I need to know how to prompt?",
      a: "No. Write the idea the way you would explain it to a friend. Clickframes handles the rest.",
    },
    {
      q: "Will the characters stay the same?",
      a:
        mode === "brands"
          ? "Yes. Your product, mascot, logo, and characters stay identical from shot to shot."
          : "Yes. Faces, voices, places, and scenes stay consistent for the whole video.",
    },
    { q: "How long does it take?", a: "About 10 minutes for most animations." },
    {
      q: "What do I pay for?",
      a: "Two bills. The membership is the Clickframes workflow. The video is billed on your own KIE API key, so you pay the model directly.",
    },
    {
      q: "Why do I need a KIE key?",
      a: "KIE is the API that runs the video model. You create a key on your KIE account, paste it into Clickframes, and every film is charged there. We never resell the seconds.",
    },
    { q: "How long can a video be?", a: "Up to 3 minutes today. Up to 5 minutes is coming soon." },
    { q: "Who owns the video?", a: "You do. You own all the rights to every video you create on Clickframes." },
  ];
}
