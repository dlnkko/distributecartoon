export type Film = {
  mp4: string;
  webm: string;
  poster: string;
  label: string;
  title: string;
  text: string;
  ratio: "9:16" | "16:9";
};

function film(name: string, title: string, text = "", ratio: Film["ratio"] = "9:16"): Film {
  return {
    mp4: `/media/${name}.mp4`,
    webm: "",
    poster: `/media/${name}.jpg`,
    label: title,
    title,
    text,
    ratio,
  };
}

export const PHONE_FILMS: Film[] = [
  film("lumabrew-brew-your-mood", "LumaBrew", "A product, a morning, and a mood."),
  film("beto-and-osofuerte", "Beto and OsoFuerte", "Two minutes, one look, no reshoots."),
  film("calm-in-your-ears", "Calm in your ears", "The problem, then the product."),
];

export const WIDE_FILM = film("outback-signal", "Outback Signal", "One look from the first shot to the last.", "16:9");

export const META = {
  title: "Drama ads that sell, one-shotted | Clickframes",
  description:
    "Paste your product page. Clickframes writes the story, locks the characters and directs the first take of a drama ad, rendered on your own KIE key.",
};

export const MARQUEE = ["Drama ads", "One-shotted", "No editors", "Your own KIE key", "About 10 minutes"];

export const HERO = {
  eyebrow: "The ad format breaking Meta and TikTok right now",
  title: ["Drama Ads That", "Actually Sell."],
  cta: "Make my first drama ad",
  trust: "About 10 minutes · You own every ad",
};

export const BEAT_WORDS = ["THE PROBLEM", "THE TWIST", "THE PRODUCT", "THE AFTER", "NO SKIP", "REPLAYED"];

export const WHY = [
  { title: "Stop the scroll.", text: "It opens inside the conflict, so it never looks like an ad." },
  { title: "Hold every second.", text: "A twist before the product keeps them watching to the end." },
  { title: "Sell the ending.", text: "The product is how the story ends well. Buying is the next step." },
];

export const STACK = ["Seedance 2.0", "KIE", "Meta Ads", "Instagram Reels", "TikTok", "YouTube Shorts", "Shopify"];

export const BEATS = [
  {
    key: "problem",
    title: "Open on the problem.",
    text: ["Start", "inside the pain", " your customer already has. Shown in the body and the room, not said in a voiceover."],
    lines: ["\"Not again.\"", "\"Why is it always me?\""],
    span: [0, 0.32],
  },
  {
    key: "turn",
    title: "Twist the knife.",
    text: ["It gets worse, or the cause is not what they thought. The", "twist", " is the reason nobody skips."],
    lines: ["\"It was never the coffee.\""],
    span: [0.32, 0.5],
  },
  {
    key: "use",
    title: "Hand over the product.",
    text: ["The product arrives the way life would hand it over, and they", "use it like a person would", ". No pitch."],
    lines: ["\"Try mine.\""],
    span: [0.5, 0.72],
  },
  {
    key: "after",
    title: "Show the after.",
    text: ["The same situation, going better. Long enough to", "see the change", ", in their words, not a slogan."],
    lines: ["\"I slept. Actually slept.\""],
    span: [0.72, 1],
  },
] as const;

export const CONSISTENCY = [
  { src: "/media/consistency/don-julio-3.jpg", label: "Shot 03" },
  { src: "/media/consistency/don-julio-22.jpg", label: "Shot 22" },
  { src: "/media/consistency/don-julio-34.jpg", label: "Shot 34" },
  { src: "/media/consistency/don-julio-55.jpg", label: "Shot 55" },
];

export const BRIEF_TABS = [
  {
    name: "brief.json",
    lines: [
      "{",
      '  "product": "LumaBrew",',
      '  "pain": "Mornings start flat. Three coffees in, still no focus.",',
      '  "audience": "Remote workers who start before 8am",',
      '  "person": "A designer on her first call of the day, camera on",',
      '  "language": "english"',
      "}",
    ],
  },
  {
    name: "beats.json",
    lines: [
      "[",
      '  { "beat": "problem", "seconds": 12 },',
      '  { "beat": "turn",    "seconds": 6 },',
      '  { "beat": "use",     "seconds": 10 },',
      '  { "beat": "after",   "seconds": 12 }',
      "]",
    ],
  },
  {
    name: "scene_03.json",
    lines: [
      "{",
      '  "beat": "turn",',
      '  "seconds": 6,',
      '  "camera": "close-up, her face lit by the laptop",',
      '  "action": "she checks her mug: still full, gone cold",',
      '  "line": "It was never the coffee.",',
      '  "product_in_shot": false',
      "}",
    ],
  },
  {
    name: "cast_lock.json",
    lines: [
      "{",
      '  "lead": "same face, same hair, same hoodie, every shot",',
      '  "product": "same can, same label, same color",',
      '  "look": "warm clay, soft window light",',
      '  "places": ["kitchen", "desk", "balcony"]',
      "}",
    ],
  },
];

export const CONTROL = [
  "Reads your product page and finds the sharpest pain",
  "Picks the audience and one real person to follow",
  "Problem, twist, product, after. Timed to the second",
  "The same faces, product and logo in every shot",
  "Dialogue that sounds like people, not copy",
  "Swap the pain, the audience or the person in one click",
  "Dialogue in English or Spanish",
  "Up to 3 minutes per ad, about 10 minutes to render",
];

export const FEEDS = [
  { name: "Meta Ads", text: "Run it paid. Test a new story instead of a new hook." },
  { name: "Reels & TikTok", text: "Same 9:16 file. It plays like a show, not a spot." },
  { name: "Shorts & YouTube", text: "Go 16:9 when the story needs the room." },
];

export const RENDER_COMPARE = [
  { name: "KIE", price: 37, note: "Your key. The model's own price.", yours: true },
  { name: "Higgsfield", price: 55, note: "Same five minutes, their credits.", yours: false },
  { name: "Fal", price: 66, note: "Same model, their API price.", yours: false },
] as const;

export const INCLUDED = [
  "The full drama ad workflow",
  "Story, beats and dialogue written for you",
  "Locked characters, product and look",
  "Rendered on your own KIE key",
  "You own every ad you make",
];

export const FAQ = [
  {
    q: "What is a drama ad?",
    a: "A short story that sells. A real problem, a twist, the product, and life after it. It plays like an episode, so people watch it to the end instead of skipping it.",
  },
  {
    q: "Do I need to know how to prompt?",
    a: "No. Paste your product page and Clickframes writes the pain, the audience, the person and the story. You approve it or swap any part in one click.",
  },
  {
    q: "Will my product and characters stay the same?",
    a: "Yes. Your product, logo, mascot and characters stay identical from the first shot to the last.",
  },
  {
    q: "Why do I need my own KIE key?",
    a: "KIE runs the video model at the model's own price. Your key bills your KIE account directly, so you never pay our markup on the model, and we never resell seconds.",
  },
  {
    q: "What do I pay for?",
    a: "Two bills. The membership is the Clickframes workflow: the story, the shots and the direction. The video itself is billed on your KIE key.",
  },
  { q: "How long does it take?", a: "About 10 minutes for most ads. Up to 3 minutes of video per ad." },
  { q: "Who owns the ads?", a: "You do. You own all the rights to every ad you create, for organic and paid." },
];
