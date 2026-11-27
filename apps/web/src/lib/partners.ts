import { cachedJson, type GrantView } from "./db";

// Help for calls that need a consortium: where consortia in preparation look for partners, and how an organisation
// publishes its own offer. Pro only: the /partners page and the assistant's get_grant.
// The ledger posts nothing and lists no organisation itself: it points to the two official places and hands over
// the fields of the offer, which the assistant fills from the profile.
// Every step and link below was read on the EU Funding & Tenders Portal and on ideal-ist.eu on 2026-11-14.

const PORTAL = "https://ec.europa.eu/info/funding-tenders/opportunities";
const IDEALIST = "https://www.ideal-ist.eu";
const TOPIC_TTL_S = 7 * 86400;

export interface PartnerSearch {
  rule: string;
  find: { name: string; url: string; note: string }[];
  publish: { where: string; url: string; steps: string[] }[];
  offer: { note: string; fields: string[] };
  for_assistants: string;
}

// EU portal topics that are still current and are not single-applicant. EuropeAid records ("…/ACT/…") are not topics.
export function hasPartnerSearch(g: GrantView): boolean {
  if (g.source !== "eu_ft" || g.consortium === "single" || g.source_id.includes("/")) return false;
  return g.status !== "closed" && (!g.closes_at || g.closes_at >= new Date().toISOString());
}

interface TopicFacts { ccm2Id: number | null; allowPartnerSearch: boolean }

// The portal's numeric id of a topic (its partner list is addressed by it) and whether the topic takes partner
// announcements. Read from the portal's public topic file, kept a week. Null when the portal does not answer.
async function topicFacts(identifier: string): Promise<TopicFacts | null> {
  const slug = encodeURIComponent(identifier.toLowerCase());
  try {
    return await cachedJson(`https://grantledger.cache/eu-topic/${slug}`, TOPIC_TTL_S, async () => {
      const res = await fetch(`${PORTAL}/data/topicDetails/${slug}.json`);
      if (res.status === 404) return { ccm2Id: null, allowPartnerSearch: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const topic = ((await res.json()) as { TopicDetails?: { ccm2Id?: number | string; allowPartnerSearch?: boolean } }).TopicDetails;
      return { ccm2Id: Number(topic?.ccm2Id) || null, allowPartnerSearch: topic?.allowPartnerSearch !== false };
    });
  } catch {
    return null;
  }
}

// Fields of the Ideal-ist cooperation profile template.
const OFFER_FIELDS = [
  "We are: offering ourselves as partners, or looking for a partner to join our consortium",
  "Horizon Europe call topic: title or topic id",
  "Description of your expertise, or of the expertise you are looking for: up to 1000 characters",
  "Keywords for that expertise: up to 10",
  "Name of your organisation",
  "Type of organisation: Industry (Large), Industry (SME), University or College, Research Institute, Public Body, or Other",
  "Previous participation in an EU project: no, or yes and which",
  "Website",
  "Description of your organisation, or of the consortium that needs a partner",
  "Contact person, telephone, e-mail, country",
];

export async function partnerSearch(g: GrantView): Promise<PartnerSearch | null> {
  if (!hasPartnerSearch(g)) return null;
  const topic = await topicFacts(g.source_id);
  const onPortal = topic?.allowPartnerSearch !== false;
  // Ideal-ist is the network of the Cluster 4 (digital, industry, space) National Contact Points.
  const cluster4 = /^HORIZON-CL4-/i.test(g.source_id);
  const find: PartnerSearch["find"] = [];
  const publish: PartnerSearch["publish"] = [];

  if (onPortal) {
    find.push({
      name: "Partner search announcements of this call, EU Funding & Tenders Portal",
      url: topic?.ccm2Id ? `${PORTAL}/portal/screen/how-to-participate/topic-announcements/${topic.ccm2Id}` : g.source_url,
      note: topic?.ccm2Id
        ? "Organisations and people who published a partner request or offer for this exact call. Each entry has a Contact button."
        : "Open the call page, section \"Partner search announcements\", and press \"View / Edit\" to see who published a partner request or offer for this call.",
    });
    publish.push({
      where: "EU Funding & Tenders Portal",
      url: g.source_url,
      steps: [
        "Sign in to the portal with an EU Login account.",
        "Who can publish: the LEAR or an account administrator of your organisation, the person who registered it on the portal (self-registrant), or any user with an active public Person profile.",
        "Open the call page, go to \"Partner search announcements\" and press \"View / Edit\".",
        "Publish your request or offer there. The portal accepts them for open and forthcoming calls.",
      ],
    });
  }
  if (cluster4) {
    find.push({
      name: "Ideal-ist cooperation profiles",
      url: `${IDEALIST}/cooperation-profiles`,
      note: "Partner searches and partner offers for Horizon Europe Cluster 4 calls, grouped by call. Look for the heading that starts with this call's id. \"Partner search\" is a consortium looking for a partner; \"Partner offer\" is an organisation offering itself.",
    });
    publish.push({
      where: "Ideal-ist",
      url: `${IDEALIST}/system/files/2026-11/Ideal-ist_CooperationProfileTemplate.docx`,
      steps: [
        "Download the cooperation profile template (the link above; if it moved, it is on ideal-ist.eu) and fill it in.",
        "Tick the declaration boxes: without the first one nothing can be published; the others allow sending it to National Contact Points abroad and publishing it on the Ideal-ist website.",
        `E-mail the filled-in template to the Cluster 4 National Contact Point of your country: ${IDEALIST}/representatives`,
        "Ideal-ist also republishes partner searches from the EU portal that meet its quality criteria.",
      ],
    });
  }
  find.push({
    name: "National Contact Points",
    url: cluster4 ? `${IDEALIST}/representatives` : `${PORTAL}/portal/screen/support/ncp`,
    note: "The official Horizon Europe advisers of each country, free of charge. Ask yours about consortia in preparation and brokerage events for this call.",
  });

  return {
    rule:
      g.consortium === "required"
        ? "This call requires a consortium: one organisation cannot apply alone. The call text states how many partners are needed and from which countries."
        : "The ledger does not know whether this call requires a consortium. EU collaborative calls usually do: check the call text.",
    find,
    publish,
    offer: {
      note: cluster4
        ? "Fields of the Ideal-ist cooperation profile template. The same text serves for the announcement on the EU portal."
        : "The announcement on the EU portal is free text. These fields, taken from the Ideal-ist template used for Cluster 4 calls, are a sound structure for it.",
      fields: OFFER_FIELDS,
    },
    for_assistants:
      "Offer to draft the partner offer from the user's saved profile (my_profiles, then get_fit): the expertise within 1000 characters and at most 10 keywords, written for this call. " +
      "Ask for what the profile does not hold (contact person, earlier EU projects); never invent it. The user publishes the offer themselves: grantledger cannot post on these platforms. " +
      "Do not name an organisation as looking for partners unless the user pasted the listing: the lists change every day.",
  };
}
