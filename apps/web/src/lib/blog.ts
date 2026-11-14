// The guides under /blog. One entry per page in src/pages/blog/; the index, the sitemap, llms.txt and the country
// pages read this list. Guides are written in English only, so they have one URL and no language alternates.
export interface Post {
  slug: string;
  title: string;
  description: string;
  // What the guide is about, shown above the title.
  kicker: string;
  published: string;
  // The day the facts were last compared with the official sources.
  checked: string;
  // ISO country code when the guide explains one country's scheme (EU for an EU-wide one).
  country?: string;
}

export const POSTS: Post[] = [
  {
    slug: "how-to-find-grants-in-europe",
    title: "How to find grants in Europe, across borders",
    description: "A free method to find public funding in any European country and at EU level: where official calls are published and how to search them in one place.",
    kicker: "Method",
    published: "2026-11-14",
    checked: "2026-11-14",
  },
  {
    slug: "de-minimis-aid-explained",
    title: "De minimis aid explained: the 300,000 euro rule",
    description: "De minimis aid is small public support exempt from EU state aid control: up to 300,000 euros per company over three years since 2024. What counts toward it.",
    kicker: "EU rules",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "EU",
  },
  {
    slug: "eic-pathfinder-open-vs-challenges",
    title: "EIC Pathfinder: Open vs Challenges, 2027 deadlines",
    description: "EIC Pathfinder funds early deep-tech research with grants of up to 4 million euros. Open vs Challenges, who can apply, and the 2027 deadlines and budgets.",
    kicker: "Horizon Europe",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "EU",
  },
  {
    slug: "bmkb-borgstellingskrediet-explained",
    title: "BMKB (borgstellingskrediet) explained in English",
    description: "The Dutch state guarantees part of a business loan when an SME lacks collateral. Who qualifies, how much, the one-off fee, and why you ask your bank.",
    kicker: "Netherlands",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NL",
  },
  {
    slug: "mia-vamil-explained",
    title: "MIA and Vamil explained in English",
    description: "Dutch tax schemes for environmental investments: an extra deduction of 27, 36 or 45 percent and 75 percent free depreciation. Apply within three months.",
    kicker: "Netherlands",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NL",
  },
  {
    slug: "skattefunn-explained",
    title: "SkatteFUNN explained: Norway's R&D tax deduction",
    description: "SkatteFUNN gives companies taxable in Norway a 19 percent tax deduction on approved R&D costs, paid out on a loss. Who can apply and the 1 September date.",
    kicker: "Norway",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NO",
  },
];

export const postPath = (p: Post) => `/blog/${p.slug}`;

export function getPost(slug: string): Post {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown guide: ${slug}`);
  return post;
}
