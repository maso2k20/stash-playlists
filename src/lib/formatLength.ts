export function formatLength(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins > 0 ? `${mins}min ` : ""}${secs}sec`;
}