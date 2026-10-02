export function downloadHref(src: string, name: string) {
  const params = new URLSearchParams({ src, name });
  return `/api/download?${params.toString()}`;
}
