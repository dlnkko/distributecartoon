import { WhopClient } from "@whop/sdk";
import { Webhook } from "standardwebhooks";
import { nowIso } from "./ids";
import { getProject, saveProject } from "./store";
import type { Project } from "./types";

export function whopConfig() {
  return {
    apiKey: process.env.WHOP_API_KEY || "",
    webhookSecret: process.env.WHOP_WEBHOOK_SECRET || "",
    companyId: process.env.WHOP_COMPANY_ID || "",
    planId: process.env.WHOP_PLAN_ID || "",
  };
}

export function whopReady() {
  const config = whopConfig();
  const anyPlan = Boolean(config.planId || process.env.WHOP_PLAN_STARTER || process.env.WHOP_PLAN_PRO);
  return Boolean(config.apiKey && config.companyId && anyPlan);
}

export function whopClient() {
  const { apiKey } = whopConfig();
  if (!apiKey) throw new Error("WHOP_API_KEY is missing.");
  return new WhopClient({ token: apiKey });
}

function whopWebhookKey(secret: string) {
  const bytes = new TextEncoder().encode(secret);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function readWhopEvent(payload: string, headers: Headers) {
  const { webhookSecret } = whopConfig();
  if (!webhookSecret) throw new Error("WHOP_WEBHOOK_SECRET is missing.");
  return new Webhook(whopWebhookKey(webhookSecret)).verify(payload, Object.fromEntries(headers.entries())) as {
    type?: string;
    data?: {
      id?: string;
      status?: string;
      metadata?: Record<string, unknown> | null;
    };
  };
}

export async function markProjectPaid(projectId: string, paymentId: string, ownerId?: string) {
  const project = await getProject(projectId);
  if (!project) return null;
  if (ownerId && project.ownerId && project.ownerId !== ownerId) return null;
  if (project.paidAt && project.paymentId === paymentId) return project;
  project.paidAt = project.paidAt || nowIso();
  project.paymentId = paymentId || project.paymentId;
  await saveProject(project);
  return project;
}

export async function confirmWhopPayment(project: Project, paymentId: string) {
  if (project.paidAt) return project;
  const payment = await whopClient().payments.retrieve({ id: paymentId });
  const metadata = (payment.metadata || {}) as Record<string, unknown>;
  const projectId = String(metadata.project_id || "");
  if (projectId !== project.id) throw new Error("This payment is for a different video.");
  if (payment.status !== "paid") throw new Error("Payment is not complete yet.");
  return markProjectPaid(project.id, payment.id || paymentId, project.ownerId);
}
