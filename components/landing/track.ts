export function track(name: string, props?: Record<string, string>) {
  if (typeof window === "undefined") return;
  const layer = (window as Window & { dataLayer?: Record<string, string>[] }).dataLayer;
  layer?.push({ event: name, ...props });
}
