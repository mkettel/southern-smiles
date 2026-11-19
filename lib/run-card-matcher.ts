export async function runCardMatcher(
  match: () => PromiseLike<{ error: { code: string; message: string } | null }>,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  for (const delay of [0, 500, 1500]) {
    if (delay) await wait(delay);
    const { error } = await match();
    if (!error) return;
    if (error.code !== "PGRST202" || delay === 1500) {
      throw new Error(`Card payment matching failed: ${error.message}`);
    }
  }
}
