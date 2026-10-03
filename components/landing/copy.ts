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
    title: "Any idea. Animated like a billion dollar studio made it.",
    sub: "No prompting. Just know what you want. Your characters stay the same in every shot, and your animation is ready in about 10 minutes.",
    cta: "Try it for $9.99",
    secondary: "See examples",
    trust: "One time $9.99 to try it. You own every video you make.",
    metaTitle: "Any idea, animated like a billion dollar studio made it",
    metaDescription:
      "Turn any idea into a studio quality animation. No prompting, consistent characters, ready in about 10 minutes.",
  },
  brands: {
    label: "Brands",
    title: "The ads breaking the market right now. Made in one click.",
    sub: "Drop in a script or storyboard, upload your product, and get a professional ad in minutes. No editors, no paid retries, no picking AI models.",
    cta: "Start creating",
    secondary: "See agency plans",
    trust: "Plans from $19.99 a month. Built for organic and paid.",
    metaTitle: "The ads breaking the market right now, made in one click",
    metaDescription:
      "Script or storyboard in, professional animated ad out. Drama animation ads and Suno ads in minutes, with no editors.",
  },
} as const;

export const PERSONAL_IDEA = {
  title: "All you need is the idea.",
  text: "Write it the way you would tell a friend. Clickframes plans the shots, keeps every character consistent, and hands you a finished animation in about 10 minutes.",
};

export const PERSONAL_USES = [
  {
    title: "Real people, animated.",
    text: "Turn yourself, your family, or your friends into animated characters and tell any story you want.",
    media: clip("example-personal-face"),
  },
  {
    title: "A surprise they will never forget.",
    text: "Birthdays, anniversaries, graduations. Give the people you love a film starring them.",
    media: clip("example-personal-gift"),
  },
  {
    title: "Your store or your product.",
    text: "Put what you sell inside a story people actually want to watch.",
    media: clip("example-personal-fast"),
  },
];

export const PERSONAL_EDGE = [
  { title: "Cinematic on the first try", text: "A well made film from the first generation. No rounds of trial and error." },
  { title: "Continuity up to 2 minutes", text: "Same voices, looks, places, and scenes from start to finish. Up to 5 minutes is coming soon." },
  { title: "Stories that needed a studio budget", text: "The films you used to dream about now fit in your hands." },
];

export const PERSONAL_OWN = {
  title: "Every frame is yours.",
  text: "You own all the rights to every video you create on Clickframes. It is your creation, and you can be proud of it.",
};

export const BRAND_PAIN = [
  { title: "Editors on their schedule", text: "Waiting days for a cut you needed yesterday." },
  { title: "Editor fees on every ad", text: "A new invoice for every concept you want to test." },
  { title: "Paying again for retries", text: "Every revision on every ad adds to the bill." },
];

export const BRAND_TECH = {
  title: "Always on the best AI.",
  text: "You never pick a video model or an image model. Clickframes always runs on the best technology available for AI creatives, so your only job is the script or the storyboard.",
};

export const BRAND_FORMATS = [
  {
    title: "Drama animation ads",
    text: "A hook, a problem, your product as the answer. Told like a short film.",
    media: clip("example-brands-1"),
  },
  {
    title: "Suno ads",
    text: "Upload your Suno song. Clickframes handles the rest: visuals, storyboard, sequences, consistency. All of it.",
    media: clip("example-brands-2"),
  },
];

export const BRAND_AGENCY = {
  title: "Rather skip the ideation too?",
  text: "Hire us on an agency plan and we come up with the concepts for you.",
  cta: "See agency plans",
};

export const BRAND_CLOSE = {
  title: "Your AI creative partner for scaling.",
  text: "Organic or paid, Clickframes shrinks the gap between an idea and a finished ad.",
};

export const AGENCY_PLANS = [
  { id: "agency-1", name: "Agency", text: "Details coming soon." },
  { id: "agency-2", name: "Agency Plus", text: "Details coming soon." },
];

export const STEPS = [
  {
    title: "Drop in your idea",
    text: "A script, a storyboard, a photo, or a Suno song. We read the story before generating anything.",
    media: clip("step-idea"),
  },
  {
    title: "We lock the look",
    text: "Characters, products, places, and logos stay consistent in every shot.",
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
  brands: [
    { mp4: "/media/createwellness-branded.mp4", webm: "", poster: "/media/createwellness-branded.jpg", label: "Createwellness" },
    { mp4: "/media/loop-branded.mp4", webm: "", poster: "/media/loop-branded.jpg", label: "Loop" },
  ],
};

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
    { q: "How long can a video be?", a: "Up to 2 minutes today. Up to 5 minutes is coming soon." },
    { q: "Who owns the video?", a: "You do. You own all the rights to every video you create on Clickframes." },
  ];
}
