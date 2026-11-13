// Environment access that works in Supabase Edge Functions (Deno) and in Node (tests).
export function env(name: string): string | undefined {
  const g = globalThis as any;
  try {
    const v = g.Deno?.env?.get?.(name);
    if (v !== undefined) return v;
  } catch {
    // Deno without env permission: fall through.
  }
  return g.process?.env?.[name];
}
