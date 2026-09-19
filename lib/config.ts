import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Secrets = {
  openaiApiKey: string;
  openaiModel: string;
  kieApiKey: string;
  falKey: string;
  openrouterApiKey: string;
};

const secretsPath = () => path.join(process.cwd(), "data", "secrets.json");

function readFileSecrets(): Partial<Secrets> {
  try {
    if (!existsSync(secretsPath())) return {};
    return JSON.parse(readFileSync(secretsPath(), "utf8")) as Partial<Secrets>;
  } catch {
    return {};
  }
}

export function getSecrets(): Secrets {
  const file = readFileSecrets();
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || file.openaiApiKey || "",
    openaiModel: process.env.OPENAI_MODEL || file.openaiModel || "gpt-5.6-luna",
    kieApiKey: process.env.KIE_API_KEY || file.kieApiKey || "",
    falKey: process.env.FAL_KEY || file.falKey || "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY || file.openrouterApiKey || "",
  };
}

export function saveSecrets(partial: Partial<Secrets>) {
  const current = getSecrets();
  const next = { ...current, ...partial };
  mkdirSync(path.dirname(secretsPath()), { recursive: true });
  writeFileSync(secretsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length < 12) return "••••";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function providerStatus() {
  const secrets = getSecrets();
  return {
    openai: Boolean(secrets.openaiApiKey),
    kie: Boolean(secrets.kieApiKey),
    fal: Boolean(secrets.falKey),
    openrouter: Boolean(secrets.openrouterApiKey),
    model: secrets.openaiModel,
    openaiMasked: maskSecret(secrets.openaiApiKey),
    kieMasked: maskSecret(secrets.kieApiKey),
    falMasked: maskSecret(secrets.falKey),
    openrouterMasked: maskSecret(secrets.openrouterApiKey),
  };
}
