import { samePlace } from "./places";
import { isUnseenVoice } from "./refs";
import type { Character, Project, Scene } from "./types";

export type ContinuityShot = {
  sceneIndex: number;
  locks: string[];
  flags: string[];
  revealFirst: boolean;
};

type PropState = { prop: string; holder?: string; spot?: string; seen?: number };

const PROPS: Array<[RegExp, string]> = [
  [/\bcoffee cups?\b/i, "coffee cup"],
  [/\bcoffee mugs?\b/i, "coffee mug"],
  [/\b(?:mugs?)\b/i, "mug"],
  [/\b(?:cups?)\b/i, "cup"],
  [/\b(?:glass(?:es)? of \w+|wine glass(?:es)?|drinking glass(?:es)?)\b/i, "glass"],
  [/\b(?:water bottles?|bottles?)\b/i, "bottle"],
  [/\b(?:soda cans?|cans? of \w+|beer cans?)\b/i, "can"],
  [/\b(?:drinks?|beverages?|smoothies?|lattes?|juice boxe?s?)\b/i, "drink"],
  [/\b(?:notebooks?|notepads?|journals?|diar(?:y|ies))\b/i, "notebook"],
  [/\b(?:books?|novels?|textbooks?)\b/i, "book"],
  [/\b(?:laptops?|computers?)\b/i, "laptop"],
  [/\b(?:smartphones?|phones?|cell ?phones?|mobiles?)\b/i, "phone"],
  [/\b(?:tablets?|ipads?)\b/i, "tablet"],
  [/\b(?:backpacks?)\b/i, "backpack"],
  [/\b(?:briefcases?)\b/i, "briefcase"],
  [/\b(?:handbags?|purses?|tote bags?)\b/i, "bag"],
  [/\b(?:umbrellas?)\b/i, "umbrella"],
  [/\b(?:keys|keychains?)\b/i, "keys"],
  [/\b(?:pens?|pencils?|markers?)\b/i, "pen"],
  [/\b(?:folders?|clipboards?)\b/i, "folder"],
  [/\b(?:boxes|box|packages?|parcels?|gifts?)\b/i, "box"],
  [/\b(?:plates?|trays?|bowls?)\b/i, "plate"],
  [/\b(?:bouquets?|flowers?)\b/i, "flowers"],
  [/\b(?:balls?)\b/i, "ball"],
  [/\b(?:microphones?|mics?)\b/i, "microphone"],
  [/\b(?:remotes?|remote controls?)\b/i, "remote"],
  [/\b(?:newspapers?|magazines?)\b/i, "newspaper"],
  [/\b(?:letters?|envelopes?|sticky notes?)\b/i, "letter"],
  [/\b(?:maps?)\b/i, "map"],
  [/\b(?:tickets?|cards?)\b/i, "card"],
  [/\b(?:wallets?)\b/i, "wallet"],
  [/\b(?:guitars?)\b/i, "guitar"],
  [/\b(?:cameras?)\b/i, "camera"],
  [/\b(?:toys?|teddy bears?|stuffed animals?)\b/i, "toy"],
  [/\b(?:swords?)\b/i, "sword"],
  [/\b(?:wands?)\b/i, "wand"],
];

const TAKE =
  /\b(pulls? out|pulling out|hold(?:s|ing)?|carr(?:y|ies|ying)|grab(?:s|bing)?|picks? up|picking up|takes?|taking|lifts?|lifting|clutch(?:es|ing)?|grips?|gripping|raises?|sips?|sipping|drinks? from|types? on|typing on|scrolls?|scrolling|reads?|reading|writes? in|writing in|waves?|waving|swings?|swinging|with (?:a|an|the|his|her|their) [\w -]{0,20} in (?:his|her|their) hands?)\b/i;
const RELEASE =
  /\b(lowers? (?:the|her|his|their)|puts? (?:it |them )?down|putting (?:it |them )?down|sets? (?:it |them )?down|setting (?:it |them )?down|places?|placing|drops?|dropping|leaves? (?:it|them|the)|throws?|throwing|toss(?:es|ing)?|puts? (?:it |them )?away|pockets?|slams? (?:it |the \w+ )?(?:down|on)|hands? (?:it|them|the)|handing|gives? (?:it|them|the)|giving|passes? (?:it|them|the))\b/i;
const HANDOFF = /\b(?:hands?|handing|gives?|giving|passes?|passing|tosses?)\b[^.]*?\bto ([A-Z][\p{L}'-]+)/u;
const SPOT = /\b(?:on|onto|at) (?:the|a) (table|desk|counter|floor|bench|shelf|bed|sofa|couch|bar|chair|nightstand|windowsill)\b/i;
const EXIT =
  /\b(leaves?|leaving|exits?|exiting|walks? (?:out|away|off)|runs? (?:out|away|off)|storms? out|goes? out|heads? out|disappears?|steps? out)\b/i;
const ENTER =
  /\b(enters?|entering|walks? (?:in|back)|comes? (?:in|back)|runs? in|bursts? in|arrives?|arriving|appears?|steps? in|steps? into|emerges?|pops? up|returns?|door opens|is revealed)\b/i;
const REVEAL =
  /\b(reveal(?:s|ed|ing)?|turns? around|door (?:opens|swings open)|opens the door|pans? (?:over |across )?to|camera (?:finds|reveals|pulls back|pans)|pull(?:s)? back to reveal|from behind|steps? out of|emerges?|enters?|walks? in|comes? in|arrives?)\b/i;
const REACTION =
  /\b(reacts?|reaction|listens?|stares?|staring|watches|watching|glances?|glancing|looks? (?:at|over at|up at|toward|towards)|turns? to|eyes widen|jaw drops|gasps?)\b/i;
const OUTFIT =
  /\b(shoes?|sneakers?|trainers?|boots?|sandals?|heels?|loafers?|slippers?|flip-?flops?|barefoot|socks?|jacket|shirt|t-shirt|tee|tank top|crop top|top|blouse|polo|hoodie|sweater|sweatshirt|cardigan|dress|skirt|pants|trousers|jeans|shorts|leggings|sweatpants|joggers|tracksuit|overalls|coat|blazer|vest|suit|uniform|scrubs|scarf|hat|cap|beanie|headband|glasses|sunglasses|apron|tie|bow tie|gloves?|belt|backpack|collar|bandana|necklace|earrings)\b/i;

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameAt(text: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || "";
  if (first.length < 2) return -1;
  const match = text.match(new RegExp(`\\b${escapeRegExp(first)}\\b`, "i"));
  return typeof match?.index === "number" ? match.index : -1;
}

function onScreenLeads(scene: Scene, project: Project) {
  const hidden = new Set(
    project.characters
      .filter((character) => character.isExtra || isUnseenVoice(character))
      .map((character) => character.name.trim().toLowerCase()),
  );
  return [...new Set((scene.characterNames || []).map((name) => name.trim()).filter(Boolean))].filter(
    (name) => !hidden.has(name.toLowerCase()),
  );
}

function extrasOf(scene: Scene) {
  return [...new Set((scene.extraNames || []).map((name) => name.trim().replace(/^(the|a|an)\s+/i, "")).filter(Boolean))];
}

function listNames(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function sceneText(scene: Scene) {
  return `${scene.title || ""}. ${scene.summary || ""}`.replace(/"[^"]*"|“[^”]*”/g, "");
}

type Gender = "f" | "m" | "";

const FEMALE = /\b(woman|women|girl|female|lady|mother|mom|mum|daughter|sister|wife|grandma|grandmother|queen|princess|she|her)\b/i;
const MALE = /\b(man|men|boy|guy|male|gentleman|father|dad|son|brother|husband|grandpa|grandfather|king|prince|he|his|him)\b/i;

function genderOf(project: Project, name: string): Gender {
  const blob = `${name} ${findCharacter(project, name)?.description || ""}`;
  const female = FEMALE.test(blob);
  const male = MALE.test(blob);
  return female === male ? "" : female ? "f" : "m";
}

function pronounGender(sentence: string): Gender {
  const first = sentence.replace(/"[^"]*"/g, "").match(/\b(she|her|hers|herself|he|him|his|himself)\b/i)?.[1]?.toLowerCase();
  if (!first) return "";
  return first.startsWith("h") && first !== "her" && first !== "hers" && first !== "herself" ? "m" : "f";
}

function makeResolver(project: Project) {
  const recent: string[] = [];
  return (sentence: string, cast: string[], fallback?: string) => {
    const hits = cast
      .map((name) => ({ name, at: nameAt(sentence, name) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at);
    for (const hit of [...hits].reverse()) {
      const at = recent.findIndex((name) => name.toLowerCase() === hit.name.toLowerCase());
      if (at >= 0) recent.splice(at, 1);
      recent.unshift(hit.name);
    }
    const wanted = pronounGender(sentence);
    const firstPronoun = sentence.search(/\b(he|she|his|her|him)\b/i);
    const pronounLeads = wanted && firstPronoun >= 0 && (!hits.length || firstPronoun < hits[0].at);
    if (pronounLeads) {
      const match = recent.find((name) => genderOf(project, name) === wanted);
      if (match) return match;
    }
    if (hits.length) return hits[0].name;
    if (wanted) return recent.find((name) => genderOf(project, name) === wanted) || fallback;
    if (/\b(they|their)\b/i.test(sentence)) return fallback;
    return undefined;
  };
}

function subjectOf(sentence: string, cast: string[], fallback?: string) {
  const hits = cast
    .map((name) => ({ name, at: nameAt(sentence, name) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (hits.length) return hits[0].name;
  if (/\b(he|she|they|his|her|their)\b/i.test(sentence)) return fallback;
  return undefined;
}

function propsIn(sentence: string) {
  const found: string[] = [];
  for (const [pattern, label] of PROPS) {
    if (pattern.test(sentence) && !found.includes(label)) found.push(label);
  }
  return found.filter(
    (label) => !(label === "cup" && found.includes("coffee cup")) && !(label === "mug" && found.includes("coffee mug")),
  );
}

function lastNameAt(text: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || "";
  if (first.length < 2) return -1;
  const hits = [...text.matchAll(new RegExp(`\\b${escapeRegExp(first)}\\b`, "gi"))];
  return hits.length ? hits[hits.length - 1].index ?? -1 : -1;
}

function exitedNames(project: Project, scene: Scene, cast: string[]) {
  const out = new Set<string>();
  const resolve = makeResolver(project);
  let last: string | undefined;
  for (const line of sentences(sceneText(scene))) {
    const who = resolve(line, cast, last);
    if (who) last = who;
    const exit = line.match(EXIT);
    if (!exit || typeof exit.index !== "number") continue;
    const before = line.slice(0, exit.index);
    const named = cast
      .map((name) => ({ name, at: lastNameAt(before, name) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => b.at - a.at)[0];
    const pronoun = [...before.matchAll(/\b(she|her|he|him|his)\b/gi)].pop();
    if (pronoun && typeof pronoun.index === "number" && (!named || pronoun.index > named.at)) {
      const gender = /^(she|her)$/i.test(pronoun[1]) ? "f" : "m";
      const pool = [...cast.filter((name) => nameAt(line, name) >= 0), ...(last ? [last] : [])];
      const match = pool.find((name) => genderOf(project, name) === gender);
      if (match) out.add(match);
      continue;
    }
    if (named) out.add(named.name);
    else if (who) out.add(who);
  }
  return out;
}

function wardrobeNote(character?: Character) {
  const text = (character?.description || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const clauses = text
    .split(/[,;.]|\band\b|\bwith\b/i)
    .map((item) =>
      item
        .trim()
        .replace(/^(?:who is |is |always )?(?:wearing|wears|dressed in|in|carrying|carries|has|sporting)\s+/i, "")
        .replace(/^(?:a|an)\s+/i, "")
        .trim(),
    )
    .filter((item) => item && OUTFIT.test(item));
  const joined = [...new Set(clauses)].slice(0, 4).join(", ");
  return joined.length > 160 ? `${joined.slice(0, 157).trim()}...` : joined;
}

function findCharacter(project: Project, name: string) {
  const needle = name.trim().toLowerCase();
  return project.characters.find((item) => item.name.trim().toLowerCase() === needle);
}

export function characterRole(project: Project, name: string) {
  const character = findCharacter(project, name);
  const first = (character?.description || "")
    .replace(/\b(claymation|pixar|stop-motion)\s+(style\s+)?/gi, "")
    .split(/[.;]/)[0]
    .split(/,|\bwith\b|\bwearing\b/i)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  const outfit = wardrobeNote(character);
  return [first, outfit].filter(Boolean).join(", ");
}

export function continuityPass(project: Project) {
  const ordered = [...project.scenes].sort((a, b) => a.index - b.index);
  const shots = new Map<number, ContinuityShot>();
  const allCast = project.characters.map((character) => character.name);
  const held = new Map<string, PropState>();
  const placed = new Map<string, PropState>();
  const sides = new Map<string, { left: string; right: string }>();
  const present = new Set<string>();
  const gone = new Set<string>();
  const resolve = makeResolver(project);
  let previous: Scene | undefined;

  for (const scene of ordered) {
    const locks: string[] = [];
    const flags: string[] = [];
    const place = (scene.location || "").trim();
    const continuous = Boolean(previous && place && previous.location && samePlace(place, previous.location));
    const cast = onScreenLeads(scene, project);
    const castKeys = new Set(cast.map((name) => name.toLowerCase()));
    const text = sceneText(scene);
    const lines = sentences(text);
    const prevCast = previous ? onScreenLeads(previous, project) : [];
    const prevExited = previous ? exitedNames(project, previous, allCast) : new Set<string>();
    if (!continuous) held.forEach((state, prop) => !castKeys.has((state.holder || "").toLowerCase()) && held.delete(prop));

    if (!continuous) placed.clear();

    // Props: carry what each character holds across cuts; flag props that pop in or vanish.
    const touched = new Set<string>();
    let last: string | undefined;
    for (const line of lines) {
      const who = resolve(line, allCast, last);
      if (who) last = who;
      for (const prop of propsIn(line)) {
        touched.add(prop);
        const handoff = line.match(HANDOFF)?.[1];
        const spot = line.match(SPOT)?.[1];
        if (RELEASE.test(line)) {
          held.delete(prop);
          if (handoff && allCast.some((name) => name.toLowerCase() === handoff.toLowerCase())) {
            held.set(prop, { prop, holder: handoff, seen: scene.index });
          } else if (spot) {
            placed.set(prop, { prop, spot });
          }
          continue;
        }
        if (TAKE.test(line) && who) {
          const before = held.get(prop);
          const onSurface = placed.get(prop);
          const pickedUp = /\b(grabs?|grabbing|picks? up|picking up|takes?|taking|lifts?|lifting|pulls? out|pulling out)\b/i.test(line);
          if (!before && !onSurface && !pickedUp && previous) {
            flags.push(`Scene ${scene.index}: ${who}'s ${prop} appears without being picked up.`);
            locks.push(`${who} has the ${prop} in hand from the first frame.`);
          }
          if (before && before.holder && before.holder.toLowerCase() !== who.toLowerCase() && !pickedUp) {
            flags.push(`Scene ${scene.index}: ${prop} jumps from ${before.holder} to ${who} without a handoff.`);
          }
          placed.delete(prop);
          held.set(prop, { prop, holder: who, seen: scene.index });
          continue;
        }
        const holding = held.get(prop);
        if (holding) holding.seen = scene.index;
        if (spot && !held.has(prop)) placed.set(prop, { prop, spot });
      }
    }

    for (const state of held.values()) {
      if (touched.has(state.prop) || !state.holder || state.seen !== previous?.index) continue;
      if (!castKeys.has(state.holder.toLowerCase())) continue;
      locks.push(`${state.holder} holds the ${state.prop} in the same hand.`);
    }
    if (continuous) {
      for (const state of placed.values()) {
        if (touched.has(state.prop) || !state.spot) continue;
        locks.push(`The ${state.prop} sits on the ${state.spot}.`);
      }
    }

    // Background extras persist between angles of the same place.
    if (continuous && previous) {
      const now = extrasOf(scene).map((name) => name.toLowerCase());
      const kept = extrasOf(previous).filter((name) => !now.includes(name.toLowerCase()) && !EXIT.test(sceneText(previous!)));
      if (kept.length) {
        locks.push(`The ${listNames(kept)} ${kept.length > 1 ? "remain" : "remains"} in the background.`);
        flags.push(`Scene ${scene.index}: kept background ${listNames(kept)} from scene ${previous.index}.`);
      }
      const fresh = extrasOf(scene).filter(
        (name) => !extrasOf(previous!).some((other) => other.toLowerCase() === name.toLowerCase()),
      );
      if (fresh.length && !ENTER.test(text)) {
        locks.push(`The ${listNames(fresh)} ${fresh.length > 1 ? "are" : "is"} already in place from the first frame.`);
      }
    }

    // Blocking: no teleporting, entries and exits happen on camera.
    if (!continuous) {
      present.clear();
      gone.clear();
    }
    if (continuous && previous) {
      const stayed = cast.filter(
        (name) => prevCast.some((other) => other.toLowerCase() === name.toLowerCase()) && !prevExited.has(name),
      );
      if (stayed.length) {
        locks.push(`${listNames(stayed)} ${stayed.length > 1 ? "continue from their last positions" : "continues from the last position"}.`);
      }
      const returned = cast.filter((name) => gone.has(name.toLowerCase()) && !ENTER.test(text));
      for (const name of returned) {
        flags.push(`Scene ${scene.index}: ${name} left earlier but is back without entering.`);
        locks.push(`${name} walks back in on camera first.`);
      }
      const arrived = cast.filter((name) => !present.has(name.toLowerCase()) && !gone.has(name.toLowerCase()));
      if (arrived.length && !ENTER.test(text) && present.size) {
        locks.push(`${listNames(arrived)} ${arrived.length > 1 ? "are" : "is"} already in the room from the first frame.`);
      }
    }
    for (const name of cast) {
      present.add(name.toLowerCase());
      gone.delete(name.toLowerCase());
    }
    for (const name of exitedNames(project, scene, allCast)) {
      present.delete(name.toLowerCase());
      gone.add(name.toLowerCase());
    }

    // Screen direction: first two-shot in a place sets left/right; later angles keep it.
    const key = place.toLowerCase();
    const looked = new Set<string>();
    let side = [...sides.entries()].find(([name]) => name && place && samePlace(name, place))?.[1];
    if (!side && cast.length >= 2 && place) {
      side = { left: cast[0], right: cast[1] };
      sides.set(key, side);
    }
    if (side) {
      const hasLeft = castKeys.has(side.left.toLowerCase());
      const hasRight = castKeys.has(side.right.toLowerCase());
      if (hasLeft && hasRight) {
        locks.push(`${side.left} on frame-left, ${side.right} on frame-right.`);
      } else if (hasLeft || hasRight) {
        const here = hasLeft ? side.left : side.right;
        const there = hasLeft ? side.right : side.left;
        const dir = hasLeft ? "frame-right" : "frame-left";
        const talking = (scene.dialogue || []).some((line) => nameAt(line.speaker || "", there) >= 0);
        if (!EXIT.test(text) && (REACTION.test(text) || talking)) {
          locks.push(`${here} looks ${dir} toward ${there}.`);
          looked.add(here.toLowerCase());
        }
      }
    }
    if (REACTION.test(text) && cast.length) {
      let actor: string | undefined;
      for (const line of lines) {
        const who = subjectOf(line, cast, actor || (cast.length === 1 ? cast[0] : undefined));
        if (who) actor = who;
        if (!who || !REACTION.test(line) || looked.has(who.toLowerCase())) continue;
        const target = allCast.find((name) => name.toLowerCase() !== who.toLowerCase() && nameAt(line, name) > nameAt(line, who));
        if (target) {
          locks.push(`${who} looks straight at ${target}.`);
          looked.add(who.toLowerCase());
        }
      }
    }

    // Audio: a line never starts before its speaker is visible.
    const speakers = [...new Set((scene.dialogue || []).map((line) => line.speaker?.trim()).filter((name): name is string => Boolean(name)))];
    const onScreenSpeakers = speakers.filter((name) => castKeys.has(name.toLowerCase()));
    const revealFirst = lines.some(
      (line) => REVEAL.test(line) && onScreenSpeakers.some((name) => nameAt(line, name) >= 0),
    );
    if (revealFirst) {
      locks.push(`${listNames(onScreenSpeakers)} ${onScreenSpeakers.length > 1 ? "speak" : "speaks"} after appearing on screen.`);
    }

    shots.set(scene.index, { sceneIndex: scene.index, locks: [...new Set(locks)], flags, revealFirst });
    previous = scene;
  }
  return shots;
}

export function continuityFlags(project: Project, sceneIndexes: number[]) {
  const shots = continuityPass(project);
  return sceneIndexes.flatMap((index) => shots.get(index)?.flags || []);
}

export function projectSeed(project: Project) {
  let hash = 2166136261;
  for (const char of project.id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647;
}
