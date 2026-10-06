export type Mode = "personal" | "brands";

export type Film = {
  mp4: string;
  webm: string;
  poster: string;
  label: string;
  title: string;
  text: string;
};

export function modeFromQuery(value: string | string[] | undefined): Mode {
  return value === "brands" ? "brands" : "personal";
}

function film(name: string, label: string, title = "", text = ""): Film {
  return {
    mp4: `/media/${name}.mp4`,
    webm: "",
    poster: `/media/${name}.jpg`,
    label,
    title,
    text,
  };
}

export const PERSONAL_HERO = film("tigre-and-the-last-chance", "Tigre and the last chance");

export const PERSONAL_FILMS = [
  film(
    "don-julio-and-canela",
    "Don Julio and Canela",
    "A story about someone you love",
    "Same faces, same dog, from the first frame to the last.",
  ),
  film(
    "beto-and-osofuerte",
    "Beto and OsoFuerte",
    "A film with a real ending",
    "Two minutes, one look, no reshoots.",
  ),
];

export const BRAND_HERO = film("outback-signal", "Outback Signal");

export const BRAND_FILMS = [
  film(
    "lumabrew-brew-your-mood",
    "LumaBrew",
    "Your product inside the story",
    "A mood, a morning, and the thing you sell.",
  ),
  film(
    "calm-in-your-ears",
    "Calm in your ears",
    "A hook people finish",
    "The problem, then your product, told in clay.",
  ),
];

export const ZOOM_URL = "https://zoom.us/j/81531268770";

export const COPY = {
  personal: {
    label: "Personal",
    title: "Any idea. Animated like a billion dollar studio made it.",
    sub: "No prompting. Just know what you want. Your characters stay the same in every shot, and your animation is ready in about 10 minutes.",
    cta: "I want to bring my idea to life",
    films: "Watch the films",
    trust: "You own every video you make.",
    metaTitle: "Any idea, animated like a billion dollar studio made it",
    metaDescription:
      "Turn any idea into a studio quality animation. No prompting, consistent characters, ready in about 10 minutes.",
  },
  brands: {
    label: "Brands",
    title: "The ads breaking the market right now. Made in one click.",
    sub: "Drop in a script or storyboard, upload your product, and get a professional ad in minutes. No editors, no paid retries, no picking AI models.",
    cta: "I want my winning ad",
    films: "Watch the ads",
    trust: "Built for organic and paid.",
    metaTitle: "The ads breaking the market right now, made in one click",
    metaDescription:
      "Script or storyboard in, professional animated ad out. Drama animation ads and Suno ads in minutes, with no editors.",
  },
} as const;

export const PERSONAL_EDGE = [
  { title: "Cinematic on the first try", text: "A well made film from the first generation. No rounds of trial and error." },
  { title: "Continuity up to 2 minutes", text: "Same voices, looks, places, and scenes from start to finish. Up to 5 minutes is coming soon." },
  { title: "Stories that needed a studio budget", text: "The films you used to dream about now fit in your hands." },
];

export const BRAND_PAIN = [
  { title: "Editors on their schedule", text: "Waiting days for a cut you needed yesterday." },
  { title: "Editor fees on every ad", text: "A new invoice for every concept you want to test." },
  { title: "Paying again for retries", text: "Every revision on every ad adds to the bill." },
];

export const BRAND_AGENCY = {
  title: "Rather skip the ideation too?",
  text: "Hire us on an agency plan and we come up with the concepts for you.",
  cta: "See agency plans",
};

export const STEPS = [
  {
    title: "Drop in your idea",
    text: "A script, a storyboard, a photo, or a Suno song. We read the story before generating anything.",
  },
  {
    title: "We lock the look",
    text: "Characters, products, places, and logos stay consistent in every shot.",
  },
  {
    title: "Get your animation",
    text: "Pixar, claymation, or live action, cut to length, voices already in the picture.",
  },
];

export const TRIAL_OFFERS = {
  personal: {
    title: "We want your idea on screen.",
    text: "Your first 40 credits are a one time $9.99. Try it and judge the quality yourself.",
    was: "$19.99/mo",
    now: "$9.99",
    yes: "Yes, I want this!",
    no: "No, I don't want my idea to come to life",
  },
  brands: {
    title: "We want your winning ad on screen.",
    text: "Your first 40 credits are a one time $9.99. Try it and judge the quality yourself.",
    was: "$19.99/mo",
    now: "$9.99",
    yes: "Yes, I want this!",
    no: "No, I don't want ads that win",
  },
} as const;

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
    { q: "What is a credit?", a: "1 credit = 1 second of video." },
    { q: "How long can a video be?", a: "Up to 2 minutes today. Up to 5 minutes is coming soon." },
    { q: "Who owns the video?", a: "You do. You own all the rights to every video you create on Clickframes." },
  ];
}
