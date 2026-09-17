import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, saveProject } from "@/lib/store";
import type { Project } from "@/lib/types";

export type AuthUser = {
  id: string;
  email: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    const claims = data.claims as { sub?: string; email?: string };
    if (!claims.sub) return null;
    return { id: claims.sub, email: claims.email || "" };
  } catch {
    return null;
  }
}

export async function loadOwnedProject(id: string): Promise<
  { user: AuthUser; project: Project } | { response: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const project = await getProject(id);
  if (!project || (project.ownerId && project.ownerId !== user.id)) {
    return { response: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  }
  if (!project.ownerId) {
    project.ownerId = user.id;
    await saveProject(project);
  }
  return { user, project };
}
