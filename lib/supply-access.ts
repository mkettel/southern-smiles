interface SupplyAccessPost {
  title?: string | null;
  division?: { number?: number | null } | null;
}

const SUPPLY_ACCESS_POSTS = [
  { division: 3, title: "supplies officer" },
  { division: 4, title: "dental supplies officer" },
] as const;

function normalizePostTitle(title: string | null | undefined) {
  return title?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function isSupplyAccessPost(post: SupplyAccessPost | null): boolean {
  if (!post?.division?.number) return false;

  const title = normalizePostTitle(post.title);
  return SUPPLY_ACCESS_POSTS.some(
    (allowed) =>
      allowed.division === post.division?.number && allowed.title === title,
  );
}
