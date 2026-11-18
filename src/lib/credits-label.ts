/** "1 credit", "6 credits", "1,250 credits". */
export function creditsLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "credit" : "credits"}`;
}
