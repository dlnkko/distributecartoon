import { samePlace } from "./places";
import { isUnseenVoice } from "./refs";
import type { Character, Project, Scene } from "./types";

export type ContinuityShot = {
  sceneIndex: number;
  locks: string[];
  flags: string[];
  revealFirst: boolean;
};

type PropState = { prop: string; holder?: string; spot?: string };

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
  /\b(hold(?:s|ing)?|carr(?:y|ies|ying)|grab(?:s|bing)?|picks? up|picking up|takes?|taking|lifts?|lifting|clutch(?:es|ing)?|grips?|gripping|raises?|sips?|sipping|drinks? from|types? on|typing on|scrolls?|scrolling|reads?|reading|writes? in|writing in|waves?|waving|swings?|swinging|with (?:a|an|the|his|her|their) [\w -]{0,20} in (?:his|her|their) hands?)\b/i;
const RELEASE =
  /\b(puts? (?:it |them )?down|putting (?:it |them )?down|sets? (?:it |them )?down|setting (?:it |them )?down|places?|placing|drops?|dropping|leaves? (?:it|them|the)|throws?|throwing|toss(?:es|ing)?|puts? (?:it |them )?away|pockets?|slams? (?:it |the \w+ )?(?:down|on)|hands? (?:it|them|the)|handing|gives? (?:it|them|the)|giving|passes? (?:it|them|the))\b/i;
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
  /\b(shoes?|sneakers?|trainers?|boots?|sandals?|heels?|loafers?|slippers?|flip-?flops?|barefoot|socks?|jacket|shirt|t-shirt|tee|hoodie|sweater|cardigan|dress|skirt|pants|trousers|jeans|shorts|overalls|coat|blazer|vest|suit|uniform|scarf|hat|cap|beanie|glasses|apron|tie|bow tie|gloves?|belt|backpack|collar|bandana)\b/i;

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
  return `${scene.title || ""}. ${scene.summary || ""}`;
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

function exitedNames(scene: Scene, cast: string[]) {
  const out = new Set<string>();
  let last: string | undefined;
  for (const line of sentences(sceneText(scene))) {
    const who = subjectOf(line, cast, last);
    if (who) last = who;
    if (who && EXIT.test(line)) out.add(who);
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

export function identityLocks(project: Project, sceneIndexes: number[]) {
  const scenes = sceneIndexes
    .map((index) => project.scenes.find((scene) => scene.index === index))
    .filter((scene): scene is Scene => Boolean(scene));
  const leads = [...new Set(scenes.flatMap((scene) => onScreenLeads(scene, project)))];
  if (!leads.length) return "";
  const looks = leads
    .map((name) => {
      const outfit = wardrobeNote(findCharacter(project, name));
      return outfit ? `${name} keeps ${outfit}` : "";
    })
    .filter(Boolean);
  const named = looks.length ? ` ${looks.join("; ")}.` : "";
  return `Identity lock for every cut and focal length:${named} ${listNames(leads)} keep the same face, hair, outfit, colors, and footwear as the reference in close-ups, wides, and full shots. No outfit, shoe, or hairstyle change unless the scene says so. Lighting and color temperature stay constant within the same place and time.`;
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
    const prevExited = previous ? exitedNames(previous, allCast) : new Set<string>();
    if (!continuous) held.forEach((state, prop) => !castKeys.has((state.holder || "").toLowerCase()) && held.delete(prop));

    if (!continuous) placed.clear();

    // Props: carry what each character holds across cuts; flag props that pop in or vanish.
    const touched = new Set<string>();
    let last: string | undefined;
    for (const line of lines) {
      const who = subjectOf(line, allCast, last);
      if (who) last = who;
      for (const prop of propsIn(line)) {
        touched.add(prop);
        const handoff = line.match(HANDOFF)?.[1];
        const spot = line.match(SPOT)?.[1];
        if (RELEASE.test(line)) {
          held.delete(prop);
          if (handoff && allCast.some((name) => name.toLowerCase() === handoff.toLowerCase())) {
            held.set(prop, { prop, holder: handoff });
          } else if (spot) {
            placed.set(prop, { prop, spot });
          }
          continue;
        }
        if (TAKE.test(line) && who) {
          const before = held.get(prop);
          const onSurface = placed.get(prop);
          const pickedUp = /\b(grab|picks? up|picking up|takes?|taking|lifts?)\b/i.test(line);
          if (!before && !onSurface && !pickedUp && previous) {
            flags.push(`Scene ${scene.index}: ${who}'s ${prop} appears without being picked up.`);
            locks.push(`${who} already has the ${prop} in hand from the first frame; it does not pop in.`);
          }
          if (before && before.holder && before.holder.toLowerCase() !== who.toLowerCase() && !pickedUp) {
            flags.push(`Scene ${scene.index}: ${prop} jumps from ${before.holder} to ${who} without a handoff.`);
          }
          placed.delete(prop);
          held.set(prop, { prop, holder: who });
          continue;
        }
        if (spot && !held.has(prop)) placed.set(prop, { prop, spot });
      }
    }

    for (const state of held.values()) {
      if (touched.has(state.prop) || !state.holder) continue;
      if (!castKeys.has(state.holder.toLowerCase())) continue;
      locks.push(`${state.holder} still holds the ${state.prop} in the same hand as the previous shot.`);
    }
    if (continuous) {
      for (const state of placed.values()) {
        if (touched.has(state.prop) || !state.spot) continue;
        locks.push(`The ${state.prop} stays on the ${state.spot} where it was left.`);
      }
    }

    // Background extras persist between angles of the same place.
    if (continuous && previous) {
      const now = extrasOf(scene).map((name) => name.toLowerCase());
      const kept = extrasOf(previous).filter((name) => !now.includes(name.toLowerCase()) && !EXIT.test(sceneText(previous!)));
      if (kept.length) {
        locks.push(`The ${listNames(kept)} from the previous shot ${kept.length > 1 ? "stay" : "stays"} in the background at the same ${kept.length > 1 ? "spots" : "spot"}.`);
        flags.push(`Scene ${scene.index}: kept background ${listNames(kept)} from scene ${previous.index}.`);
      }
      const fresh = extrasOf(scene).filter(
        (name) => !extrasOf(previous!).some((other) => other.toLowerCase() === name.toLowerCase()),
      );
      if (fresh.length && !ENTER.test(text)) {
        locks.push(`The ${listNames(fresh)} ${fresh.length > 1 ? "were" : "was"} already in this place; no one pops in.`);
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
        locks.push(`${listNames(stayed)} ${stayed.length > 1 ? "start" : "starts"} exactly where the previous shot left ${stayed.length > 1 ? "them" : "off"}, same pose direction. No teleporting.`);
      }
      const returned = cast.filter((name) => gone.has(name.toLowerCase()) && !ENTER.test(text));
      for (const name of returned) {
        flags.push(`Scene ${scene.index}: ${name} left earlier but is back without entering.`);
        locks.push(`${name} walks back in on camera before acting.`);
      }
      const arrived = cast.filter((name) => !present.has(name.toLowerCase()) && !gone.has(name.toLowerCase()));
      if (arrived.length && !ENTER.test(text) && present.size) {
        locks.push(`${listNames(arrived)} ${arrived.length > 1 ? "were" : "was"} already in this place off-camera or ${arrived.length > 1 ? "enter" : "enters"} on camera. No pop-in.`);
      }
    }
    for (const name of cast) {
      present.add(name.toLowerCase());
      gone.delete(name.toLowerCase());
    }
    for (const name of exitedNames(scene, allCast)) {
      present.delete(name.toLowerCase());
      gone.add(name.toLowerCase());
    }

    // Screen direction: first two-shot in a place sets left/right; later angles keep it.
    const key = place.toLowerCase();
    let side = [...sides.entries()].find(([name]) => name && place && samePlace(name, place))?.[1];
    if (!side && cast.length >= 2 && place) {
      side = { left: cast[0], right: cast[1] };
      sides.set(key, side);
    }
    if (side) {
      const hasLeft = castKeys.has(side.left.toLowerCase());
      const hasRight = castKeys.has(side.right.toLowerCase());
      if (hasLeft && hasRight) {
        locks.push(`180-degree rule: ${side.left} stays frame-left and ${side.right} frame-right from every angle. They never swap sides.`);
      } else if (hasLeft || hasRight) {
        const here = hasLeft ? side.left : side.right;
        const there = hasLeft ? side.right : side.left;
        const dir = hasLeft ? "frame-right" : "frame-left";
        const talking = (scene.dialogue || []).some((line) => nameAt(line.speaker || "", there) >= 0);
        if (!EXIT.test(text) && (REACTION.test(text) || talking)) {
          locks.push(`${here} looks ${dir}, toward off-screen ${there}'s real position in the room.`);
        }
      }
    }
    if (REACTION.test(text) && cast.length) {
      let actor: string | undefined;
      for (const line of lines) {
        const who = subjectOf(line, cast, actor || (cast.length === 1 ? cast[0] : undefined));
        if (who) actor = who;
        if (!who || !REACTION.test(line)) continue;
        const target = allCast.find((name) => name.toLowerCase() !== who.toLowerCase() && nameAt(line, name) > nameAt(line, who));
        if (target) locks.push(`${who}'s eyes and head point at ${target}, matching where ${target} stands.`);
      }
    }

    // Audio: a line never starts before its speaker is visible.
    const speakers = [...new Set((scene.dialogue || []).map((line) => line.speaker?.trim()).filter((name): name is string => Boolean(name)))];
    const onScreenSpeakers = speakers.filter((name) => castKeys.has(name.toLowerCase()));
    const revealFirst = REVEAL.test(text) && onScreenSpeakers.length > 0;
    if (revealFirst) {
      locks.push(`${listNames(onScreenSpeakers)} ${onScreenSpeakers.length > 1 ? "speak" : "speaks"} only after the reveal, once visible on screen. No line before that.`);
    }
    const hiddenSpeakers = speakers.filter((name) => !castKeys.has(name.toLowerCase()));
    if (hiddenSpeakers.length && onScreenSpeakers.length) {
      locks.push("Voice-over lines play over the matching visual beat, not over another character's mouth.");
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
