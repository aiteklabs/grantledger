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
  // What the illustration shows, for readers who cannot see it. The file is public/blog/<slug>.jpg, 1600 by 900.
  alt: string;
}

export const POSTS: Post[] = [
  {
    slug: "how-to-find-grants-in-europe",
    alt: "A map of Europe made of folders and documents, with a magnifying glass and dotted routes crossing borders.",
    title: "How to find grants in Europe, across borders",
    description: "A free method to find public funding in any European country and at EU level: where official calls are published and how to search them in one place.",
    kicker: "Method",
    published: "2026-11-14",
    checked: "2026-11-14",
  },
  {
    slug: "de-minimis-aid-explained",
    alt: "Hands from several sides drop coins into a glass jar; the coins stop at one orange line.",
    title: "De minimis aid explained: the 300,000 euro rule",
    description: "De minimis aid is small public support exempt from EU state aid control: up to 300,000 euros per company over three years since 2024. What counts toward it.",
    kicker: "EU rules",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "EU",
  },
  {
    slug: "eic-pathfinder-open-vs-challenges",
    alt: "A research path splits toward an open landscape on one side and marked targets on the other; three researchers walk past a lab bench.",
    title: "EIC Pathfinder: Open vs Challenges, 2027 deadlines",
    description: "EIC Pathfinder funds early deep-tech research with grants of up to 4 million euros. Open vs Challenges, who can apply, and the 2027 deadlines and budgets.",
    kicker: "Horizon Europe",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "EU",
  },
  {
    slug: "bmkb-borgstellingskrediet-explained",
    alt: "A shop and a bank joined by a bridge of coins, held up from below by a hand with a shield, in front of Dutch canal houses.",
    title: "BMKB (borgstellingskrediet) explained in English",
    description: "The Dutch state guarantees part of a business loan when an SME lacks collateral. Who qualifies, how much, the one-off fee, and why you ask your bank.",
    kicker: "Netherlands",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NL",
  },
  {
    slug: "mia-vamil-explained",
    alt: "A business with solar panels, an electric van, a heat pump and a wind turbine, next to an open ledger with a leaf and coins.",
    title: "MIA and Vamil explained in English",
    description: "Dutch tax schemes for environmental investments: an extra deduction of 27, 36 or 45 percent and 75 percent free depreciation. Apply within three months.",
    kicker: "Netherlands",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NL",
  },
  {
    slug: "skattefunn-explained",
    alt: "Two engineers build a prototype by a Norwegian fjord while a paper plane brings coins back to them.",
    title: "SkatteFUNN explained: Norway's R&D tax deduction",
    description: "SkatteFUNN gives companies taxable in Norway a 19 percent tax deduction on approved R&D costs, paid out on a loss. Who can apply and the 1 September date.",
    kicker: "Norway",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "NO",
  },
  {
    slug: "grant-loan-guarantee-tax-credit",
    alt: "A person chooses between four objects on a table: a gift box, a coin on a looping arrow, an umbrella over a house and a cut receipt.",
    title: "Grant, loan, guarantee or tax credit: which fits",
    description: "Public funding comes as grants, loans, guarantees, tax credits and vouchers. What each one is, when the money arrives, and how to pick the one that fits.",
    kicker: "Method",
    published: "2026-11-14",
    checked: "2026-11-14",
  },
  {
    slug: "msca-staff-exchanges-explained",
    alt: "A university and a company on two sides of a river, joined by a footbridge where staff cross in both directions.",
    title: "MSCA Staff Exchanges explained: who can apply",
    description: "MSCA Staff Exchanges funds short secondments of research and innovation staff between organisations in different countries and sectors. The consortium rules.",
    kicker: "Horizon Europe",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "EU",
  },
  {
    slug: "aws-preseed-explained",
    alt: "A seed in a pot on a workbench sprouts into a prototype drone while two founders work next to it, with alpine peaks behind.",
    title: "aws Preseed explained: Austria's pre-founding grant",
    description: "aws Preseed funds a first proof of concept before or just after founding in Austria: up to 89,000 euros, or 267,000 for deep tech, at 80 percent of costs.",
    kicker: "Austria",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "AT",
  },
  {
    slug: "ffg-oeko-scheck-explained",
    alt: "A workshop owner holds a voucher with a leaf next to a raffle drum and gears with small plants growing from them.",
    title: "FFG Öko-Scheck explained in English",
    description: "The Austrian Öko-Scheck gives SMEs and non-profits up to 12,000 euros, 80 percent of costs, for a climate-friendly innovation project. Who qualifies and how.",
    kicker: "Austria",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "AT",
  },
  {
    slug: "research-ireland-empower-explained",
    alt: "A watering can pours from a university on green hills over young trees that shelter students and researchers at desks.",
    title: "Research Ireland Empower programme explained",
    description: "Empower is Research Ireland's block funding for PhD studentships and postdoctoral fellowships. It is by invitation: 18 institutions apply, not individuals.",
    kicker: "Ireland",
    published: "2026-11-14",
    checked: "2026-11-14",
    country: "IE",
  },
];

export const postPath = (p: Post) => `/blog/${p.slug}`;
export const postImage = (p: Post) => `/blog/${p.slug}.jpg`;

export function getPost(slug: string): Post {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown guide: ${slug}`);
  return post;
}
