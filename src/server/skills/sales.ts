import { z } from "zod";
import type { Skill, SkillContext } from "./types";
import type { Connector } from "../connections/service";
import type { Lead } from "../connections/adapters";
import { ProviderError } from "../connections/adapters";

/**
 * Buyer-finding missions: a seller says what stock they have, at what price,
 * and how to reach them; the crew prepares everything needed to find and
 * contact buyers, and stops honestly where a connection or approval is needed.
 *
 *   offer-sheet       Echo   structured offer from the goal and answers
 *   buyer-map         Scout  buyer segments and channels for this product
 *   outreach-sequence Echo   per-segment email, WhatsApp and call drafts, in the seller's language
 *   lead-search       Scout  real buyer contacts through the connected data provider; blocked without one
 *   outreach-send     Echo   Tier 3: one approved batch through the connected email / WhatsApp account
 *
 * Nothing here invents a buyer name or quotes a price the seller did not
 * give, and nothing leaves the workspace without a connected account and an
 * approval row (see src/server/connections).
 */

const anyRecord = z.record(z.string(), z.unknown());

export type Language = "en" | "hi" | "gu";

export type Offer = {
  product: string;
  quantity: string | null;
  price: string | null;
  location: string | null;
  market: string | null;
  terms: string | null;
  language: Language;
  contact: { name: string | null; email: string | null; phone: string | null; whatsapp: string | null };
  missing: string[];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const QTY = /(\d[\d,]*(?:\.\d+)?)\s*(kgs?|kilograms?|tonnes?|tons?|quintals?|litres?|liters?|units?|pieces?|pcs|bags?|boxes?|crates?|sacks?|dozen|packets?)\b/i;
const PRICE = /((?:₹|rs\.?|inr|\$|usd|€|eur)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per|a)\s*\w+)?|\d[\d,]*(?:\.\d+)?\s*(?:rupees|rs|inr|dollars?)\s*(?:(?:\/|per|a)\s*\w+)?)/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s-]{8,}\d)/;
const STOP = "(?=\\s+(?:to|in|at|for|across|around|from|near|with|and)\\b|[.,;]|$)";
const PRODUCT_PATTERNS = [
  new RegExp(`\\b\\d[\\d,]*(?:\\.\\d+)?\\s*(?:kgs?|kilograms?|tonnes?|tons?|quintals?|litres?|liters?|units?|pieces?|pcs|bags?|boxes?|crates?|sacks?|dozen|packets?)\\s+of\\s+([a-z][a-z0-9\\s'-]{2,40}?)${STOP}`, "i"),
  new RegExp(`\\b(?:sell(?:ing)?|move|offload|supply(?:ing)?|buyers?\\s+(?:in\\s+[a-z\\s]+?\\s+)?for|customers?\\s+for|orders?\\s+for)\\s+(?:my|our|the|some)?\\s*([a-z][a-z0-9\\s'-]{2,40}?)${STOP}`, "i"),
  new RegExp(`\\b(?:my|our)\\s+([a-z][a-z0-9\\s'-]{2,30}?)\\s+(?:stock|harvest|crop|produce|business|agency)\\b`, "i"),
];

export function detectLanguage(text: string, explicit?: string | null): Language {
  // An explicit answer wins over anything mentioned in the goal.
  for (const t of [explicit ?? "", text].map((x) => x.toLowerCase())) {
    if (!t.trim()) continue;
    if (/\b(gujarati|ગુજરાતી)\b/.test(t) || /[઀-૿]/.test(t)) return "gu";
    if (/\b(hindi|हिंदी|हिन्दी)\b/.test(t) || /[ऀ-ॿ]/.test(t)) return "hi";
    if (/\b(english|angrezi)\b/.test(t)) return "en";
  }
  return "en";
}

/** Deterministic parse of the goal plus answers. Answers win; nothing is guessed. */
export function parseOffer(goal: string, input: Record<string, unknown>): Offer {
  const g = goal.replace(/\s+/g, " ").trim();
  const qty = str(input.quantity) ?? QTY.exec(g)?.[0] ?? null;
  const price = str(input.price) ?? PRICE.exec(g)?.[0] ?? null;
  let product = str(input.product);
  if (!product) {
    for (const re of PRODUCT_PATTERNS) {
      const m = re.exec(g)?.[1]?.trim();
      if (m && !QTY.test(m) && !PRICE.test(m)) {
        product = m;
        break;
      }
    }
  }
  const market = str(input.market) ?? /\b(?:in|across|around|near|within)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)(?=[.,;]|\s+(?:for|at|and|to|or|who|that|which)\b|$)/.exec(g)?.[1]?.trim() ?? null;
  const contactBlob = str(input.contact);
  const email = str(input.email) ?? EMAIL.exec(g)?.[0] ?? (contactBlob ? (EMAIL.exec(contactBlob)?.[0] ?? null) : null);
  const phone = str(input.phone) ?? PHONE.exec(g)?.[0]?.trim() ?? (contactBlob ? (PHONE.exec(contactBlob)?.[0]?.trim() ?? null) : null);
  const whatsapp = str(input.whatsapp) ?? (/whatsapp/i.test(`${contactBlob ?? ""} ${g}`) ? phone : null);

  const offer: Offer = {
    product: product ?? "the product in the goal",
    quantity: qty,
    price,
    location: str(input.location),
    market,
    terms: str(input.terms),
    language: detectLanguage(g, str(input.language)),
    contact: { name: str(input.contactName), email, phone, whatsapp },
    missing: [],
  };
  if (!product) offer.missing.push("product");
  if (!qty) offer.missing.push("quantity");
  if (!price) offer.missing.push("price");
  if (!email && !phone) offer.missing.push("a way for buyers to reach you");
  return offer;
}

const LANGUAGE_LABEL: Record<Language, string> = { en: "English", hi: "Hindi", gu: "Gujarati" };

function offerMarkdown(o: Offer): string {
  const line = (label: string, v: string | null) => `| ${label} | ${v ?? "to be confirmed"} |`;
  const contact = [o.contact.name && `Name: ${o.contact.name}`, o.contact.email && `Email: ${o.contact.email}`, o.contact.phone && `Phone: ${o.contact.phone}`, o.contact.whatsapp && `WhatsApp: ${o.contact.whatsapp}`]
    .filter(Boolean)
    .join("; ");
  return [
    `# Offer sheet: ${o.product}`,
    "",
    "| Field | Value |",
    "|---|---|",
    line("Product", o.product),
    line("Quantity available", o.quantity),
    line("Asking price", o.price),
    line("Stock location", o.location),
    line("Target market", o.market),
    line("Delivery and payment terms", o.terms),
    line("Seller contact", contact || null),
    line("Outreach language", LANGUAGE_LABEL[o.language]),
    "",
    o.missing.length ? `**Still needed before outreach:** ${o.missing.join(", ")}. Cupi will not invent these.` : "**Complete.** Every field came from you.",
    "",
    "_Only figures you gave appear here. Buyers will ask for grade, packing, test certificates or a sample; have those ready._",
    "",
  ].join("\n");
}

export const offerSheet: Skill = {
  manifest: {
    id: "offer-sheet",
    version: "0.1.0",
    name: "Offer sheet",
    description: "Turns what you have, at what price, and how to reach you into a one-page offer sheet. Marks anything missing instead of guessing.",
    agent: "Echo",
    actionClass: "draft",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 30, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const offer = parseOffer(ctx.goal, ctx.input);
    const md = await ctx.writeArtifact({ kind: "markdown", title: "Offer sheet", content: offerMarkdown(offer) });
    const js = await ctx.writeArtifact({ kind: "json", title: "Offer (structured)", content: JSON.stringify(offer, null, 2) });
    return {
      status: "succeeded",
      output: { artifactId: md.id, offerArtifactId: js.id, offer, missing: offer.missing, language: offer.language },
      summary: offer.missing.length ? `Offer sheet drafted; still needed: ${offer.missing.join(", ")}.` : "Offer sheet complete.",
    };
  },
};

// ---------------------------------------------------------------------------
// Buyer map: segments and channels by product family. Directions, not leads.
// ---------------------------------------------------------------------------
export type Segment = { key: string; name: string; why: string; asksFor: string; channel: string; findVia: string };

const HERB_WORDS = /\b(ashwagandha|turmeric|haldi|moringa|tulsi|shatavari|amla|giloy|brahmi|neem|herbs?|botanicals?|medicinal|ayurved\w*|spices?|cardamom|pepper|ginger|saffron|stevia|aloe)\b/i;
const PACKAGED_WORDS = /\b(basmati|daawat|dawat|india gate|kohinoor|aashirvaad|fortune|branded?|packets?|packaged|atta|flour|maida|besan|poha|grocery|groceries|edible oil|ghee|sugar|salt|tea|biscuits?)\b/i;
const PRODUCE_WORDS = /\b(wheat|rice|paddy|maize|corn|pulses?|dal|lentils?|soy\w*|cotton|sugarcane|onions?|potato\w*|tomato\w*|mango\w*|banana\w*|apples?|grapes?|fruit|vegetables?|grain|millets?|crop|harvest|produce|honey|milk|dairy)\b/i;

export function segmentsFor(product: string, market: string | null): { family: string; segments: Segment[] } {
  const where = market ?? "your target market";
  if (HERB_WORDS.test(product)) {
    return {
      family: "medicinal herbs and botanicals",
      segments: [
        { key: "manufacturers", name: "Ayurvedic and nutraceutical manufacturers", why: "They buy raw root, powder or extract in recurring volumes for formulations.", asksFor: "Grade, active-content test report, moisture, pesticide residue, a sample, GST invoice.", channel: "Email to the purchase or sourcing head, then a call; a visit with samples closes faster.", findVia: `Company registries and trade directories for ${where} and the Haridwar, Ahmedabad and Delhi NCR clusters.` },
        { key: "wholesale", name: "Wholesale herb and spice markets", why: "Traders in markets such as Khari Baoli (Old Delhi) move stock quickly, usually at lower margins.", asksFor: "Quantity, grade, price per kg delivered, and whether you can supply again next season.", channel: "Phone and WhatsApp first; visit with a sample bag.", findVia: "Market association lists and mandi trader directories." },
        { key: "exporters", name: "Herbal extract and export houses", why: "Export demand favours standardised quality; they pay more for documented lots.", asksFor: "Lab certificates, traceability of the field, organic certification if any, packing standards.", channel: "Email with the offer sheet and certificates attached.", findVia: "APEDA and Spices Board exporter lists." },
        { key: "aggregators", name: "Agri aggregators and farmer producer organisations", why: "They pool lots from several farms to meet buyer volumes and can take partial stock now.", asksFor: "Quantity and timing; they usually handle grading and logistics.", channel: "Phone or WhatsApp.", findVia: "State FPO lists and e-NAM registered aggregators." },
        { key: "marketplaces", name: "B2B marketplaces", why: "A listing with the offer sheet attracts inbound enquiries while outreach runs.", asksFor: "Clear product title, price range, minimum order and photos.", channel: "Create a listing; respond to enquiries the same day.", findVia: "IndiaMART, TradeIndia and similar platforms (needs an account)." },
        { key: "brands", name: "Wellness and D2C brands", why: "Smaller volumes but better prices for a documented, single-origin story.", asksFor: "Origin story, test report, consistent supply, sometimes private-label packing.", channel: "Email to the founder or sourcing lead, with the offer sheet.", findVia: "Brand directories and marketplace seller lists." },
      ],
    };
  }
  if (PACKAGED_WORDS.test(product)) {
    return {
      family: "packaged foods and grains",
      segments: [
        { key: "horeca", name: "Restaurants, hotels and caterers", why: "Steady weekly volumes of staples like basmati; they value reliable delivery over the lowest price.", asksFor: "Price per bag delivered, brand and grade, delivery days, credit period.", channel: "WhatsApp to the owner or purchase manager, then a visit with a sample bag.", findVia: `Restaurant and hotel listings for ${where}; caterers through wedding venues and tiffin services.` },
        { key: "kirana", name: "Kirana and general stores", why: "Many small orders; they reorder when the first lot sells.", asksFor: "Wholesale rate, margin, scheme, free delivery on a minimum order.", channel: "WhatsApp and a visit; a route plan by street works best.", findVia: `Store listings and local trade associations in ${where}.` },
        { key: "supermarkets", name: "Supermarkets and modern trade", why: "Larger orders and shelf visibility, with listing terms and slower payment.", asksFor: "Rate card, GST invoice, FSSAI details, barcodes, delivery schedule.", channel: "Email with the rate card, then the buying office.", findVia: "Chain supplier portals and local store managers." },
        { key: "distributors", name: "Distributors and grain merchants", why: "They cover areas you cannot reach yourself.", asksFor: "Distributor margin, credit terms, exclusivity by area.", channel: "Phone, then a meeting.", findVia: "Brand distributor lists and mandi trader directories." },
        { key: "institutions", name: "Canteens, hostels and institutions", why: "Monthly contracts for staples at agreed rates.", asksFor: "Tender or quotation, consistent quality, monthly invoicing.", channel: "Email quotation plus a call to the administrator.", findVia: "Schools, hospitals, factories and hostels in the area." },
        { key: "online", name: "Online grocery and quick-commerce dark stores", why: "Local fulfilment partners buy staples for same-day delivery.", asksFor: "Onboarding documents, barcodes, fill rate commitments.", channel: "Seller onboarding portal.", findVia: "Platform seller programmes." },
      ],
    };
  }
  if (PRODUCE_WORDS.test(product)) {
    return {
      family: "agricultural produce",
      segments: [
        { key: "mandi", name: "APMC mandis and commission agents", why: "Fastest route to a sale at the day's rate.", asksFor: "Quantity, grade, arrival date.", channel: "Phone, then arrive with the lot.", findVia: `Mandi lists for ${where} and e-NAM.` },
        { key: "processors", name: "Processors and millers", why: "Steady recurring volumes, often contract terms.", asksFor: "Moisture, grade, sample, delivery schedule.", channel: "Email and a call to the procurement head.", findVia: "Industry association member lists." },
        { key: "retail", name: "Wholesalers, retailers and supermarkets", why: "Better prices for graded, packed produce.", asksFor: "Packing, grading, consistent supply, invoices.", channel: "Email with the offer sheet; visit the buying office.", findVia: "Retail chain supplier portals." },
        { key: "exporters", name: "Exporters", why: "Premium for certified, traceable lots.", asksFor: "Certificates, residue tests, packing standards.", channel: "Email with documents attached.", findVia: "APEDA exporter directory." },
        { key: "aggregators", name: "FPOs and aggregators", why: "Can take partial stock now and pool it.", asksFor: "Quantity and timing.", channel: "Phone or WhatsApp.", findVia: "State FPO lists." },
      ],
    };
  }
  return {
    family: "general goods",
    segments: [
      { key: "distributors", name: "Distributors and wholesalers", why: "Buy in volume for resale.", asksFor: "Price list, minimum order, margins, delivery terms.", channel: "Email, then a call.", findVia: `Trade directories for ${where}.` },
      { key: "retail", name: "Retailers", why: "Smaller orders, closer to end customers.", asksFor: "Samples, pricing, returns policy.", channel: "Visit or WhatsApp.", findVia: "Local business listings." },
      { key: "marketplaces", name: "B2B marketplaces", why: "Inbound enquiries while outreach runs.", asksFor: "Listing details and photos.", channel: "Create a listing.", findVia: "IndiaMART, TradeIndia and similar platforms." },
      { key: "direct", name: "Direct business buyers", why: "Companies that use the product themselves.", asksFor: "Specifications, invoices, delivery schedule.", channel: "Email with the offer sheet.", findVia: "Industry association lists." },
    ],
  };
}

export const buyerMap: Skill = {
  manifest: {
    id: "buyer-map",
    version: "0.1.0",
    name: "Buyer map",
    description:
      "Which kinds of buyers purchase this product in your market, what each asks for, how they prefer to be contacted and where to find them. Directions, not verified leads: no contacts are retrieved without a data connection.",
    agent: "Scout",
    actionClass: "read",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const offer = (ctx.upstream["offer-sheet"]?.offer as Offer | undefined) ?? parseOffer(ctx.goal, ctx.input);
    const { family, segments } = segmentsFor(offer.product, offer.market);
    const md = [
      `# Buyer map: ${offer.product}${offer.market ? ` in ${offer.market}` : ""}`,
      "",
      `Product family: ${family}. ${segments.length} buyer segments, in rough order of volume.`,
      "",
      "> No buyer names or contact details were retrieved. Finding real contacts needs a connected data source; that step is shown separately in this mission.",
      "",
      ...segments.flatMap((s, i) => [`## ${i + 1}. ${s.name}`, "", `- Why they buy: ${s.why}`, `- What they will ask for: ${s.asksFor}`, `- How to contact: ${s.channel}`, `- Where to find them: ${s.findVia}`, ""]),
      "## Lead list template",
      "",
      "Use these columns when the lead search runs or when you add contacts yourself:",
      "",
      "`segment, organisation, contact name, role, city, channel, email, phone, source, notes`",
      "",
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Buyer map", content: md });
    const t = await ctx.writeArtifact({
      kind: "json",
      title: "Lead list template",
      content: JSON.stringify({ columns: ["segment", "organisation", "contact name", "role", "city", "channel", "email", "phone", "source", "notes"], rows: [] }, null, 2),
    });
    return {
      status: "succeeded",
      output: { artifactId: a.id, templateArtifactId: t.id, family, segments: segments.map((s) => s.key), leadsRetrieved: 0 },
      summary: `${segments.length} buyer segments mapped for ${family}. No contacts retrieved (needs a data connection).`,
    };
  },
};

// ---------------------------------------------------------------------------
// Outreach drafts per segment, in the seller's language. Drafts only.
// ---------------------------------------------------------------------------
export type Draft = { segment: string; language: Language; email: { subject: string; body: string }; englishEmail?: { subject: string; body: string }; whatsapp: string; call: string };

function contactLines(o: Offer): string {
  const lines = [o.contact.name, o.contact.phone && `Phone: ${o.contact.phone}`, o.contact.whatsapp && `WhatsApp: ${o.contact.whatsapp}`, o.contact.email && `Email: ${o.contact.email}`].filter(Boolean);
  return lines.length ? lines.join("\n") : "[your contact details]";
}

function englishEmail(o: Offer, s: Segment, qty: string, price: string, from: string): { subject: string; body: string } {
  return {
    subject: `${o.product}: ${qty} available${o.market ? `, ${o.market}` : ""}`,
    body: [
      "Hello,",
      "",
      `I have ${qty} of ${o.product}${from} available now at ${price}.`,
      "",
      `${s.why} I can share ${s.asksFor.split(",")[0]!.toLowerCase()} and a sample on request${o.terms ? `; terms: ${o.terms}` : ""}.`,
      "",
      "Would a short call this week suit you? Reply here or reach me below.",
      "",
      contactLines(o),
    ].join("\n"),
  };
}

export function draftsFor(o: Offer, segments: Segment[]): Draft[] {
  const qty = o.quantity ?? "[quantity]";
  const price = o.price ?? "[asking price]";
  const from = o.location ? ` from ${o.location}` : "";
  const name = o.contact.name ?? "[your name]";
  const reach = o.contact.whatsapp ?? o.contact.phone ?? "";
  return segments.map((s) => {
    const en = englishEmail(o, s, qty, price, from);
    if (o.language === "hi") {
      const from_hi = o.location ? ` (${o.location} से)` : "";
      return {
        segment: s.name,
        language: "hi",
        email: {
          subject: `${o.product}: ${qty} उपलब्ध${o.market ? `, ${o.market}` : ""}`,
          body: ["नमस्ते,", "", `मेरे पास ${o.product}${from_hi} का ${qty} स्टॉक अभी उपलब्ध है, ${price} पर।`, "", `अनुरोध पर सैंपल और ज़रूरी दस्तावेज़ दे सकते हैं${o.terms ? ` (शर्तें: ${o.terms})` : ""}।`, "", "क्या इस हफ्ते एक छोटी कॉल हो सकती है? यहीं जवाब दें या नीचे संपर्क करें।", "", contactLines(o)].join("\n"),
        },
        englishEmail: en,
        whatsapp: `नमस्ते, मेरे पास ${o.product}${from_hi} का ${qty} स्टॉक है, ${price} पर। सैंपल और दस्तावेज़ उपलब्ध हैं। रुचि हो तो बताएं। ${reach}`.trim(),
        call: `नमस्ते, मैं ${name} बोल रहा/रही हूँ। मेरे पास ${o.product} का ${qty} माल तैयार है, ${price} पर। क्या आप इस सीज़न खरीद रहे हैं? सैंपल के लिए किससे बात करूँ?`,
      };
    }
    if (o.language === "gu") {
      const from_gu = o.location ? ` (${o.location} થી)` : "";
      return {
        segment: s.name,
        language: "gu",
        email: {
          subject: `${o.product}: ${qty} ઉપલબ્ધ${o.market ? `, ${o.market}` : ""}`,
          body: ["નમસ્તે,", "", `મારી પાસે ${o.product}${from_gu} નો ${qty} સ્ટોક હમણાં ઉપલબ્ધ છે, ${price} ના ભાવે.`, "", `વિનંતી પર સેમ્પલ અને જરૂરી દસ્તાવેજ આપી શકું છું${o.terms ? ` (શરતો: ${o.terms})` : ""}.`, "", "શું આ અઠવાડિયે ટૂંકો કોલ થઈ શકે? અહીં જવાબ આપો અથવા નીચે સંપર્ક કરો.", "", contactLines(o)].join("\n"),
        },
        englishEmail: en,
        whatsapp: `નમસ્તે, મારી પાસે ${o.product}${from_gu} નો ${qty} સ્ટોક છે, ${price} ના ભાવે. સેમ્પલ અને દસ્તાવેજ ઉપલબ્ધ છે. રસ હોય તો જણાવશો. ${reach}`.trim(),
        call: `નમસ્તે, હું ${name} બોલું છું. મારી પાસે ${o.product} નો ${qty} માલ તૈયાર છે, ${price} ના ભાવે. શું તમે આ સિઝનમાં ખરીદો છો? સેમ્પલ માટે કોની સાથે વાત કરું?`,
      };
    }
    return {
      segment: s.name,
      language: "en",
      email: en,
      whatsapp: `Hello, I have ${qty} of ${o.product}${from} at ${price}. Sample and documents available. Interested? ${reach}`.trim(),
      call: `Hello, this is ${name}. I have ${qty} of ${o.product}${from} ready at ${price}. Are you buying this season, and who should I speak to about samples?`,
    };
  });
}

export const outreachSequence: Skill = {
  manifest: {
    id: "outreach-sequence",
    version: "0.1.0",
    name: "Outreach drafts",
    description:
      "An email, a WhatsApp message and a call opener for each buyer segment, built only from your offer, in English, Hindi or Gujarati. Drafts for your review; nothing is sent.",
    agent: "Echo",
    actionClass: "draft",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const offer = (ctx.upstream["offer-sheet"]?.offer as Offer | undefined) ?? parseOffer(ctx.goal, ctx.input);
    const { segments } = segmentsFor(offer.product, offer.market);
    const drafts = draftsFor(offer, segments);
    const md = [
      `# Outreach drafts: ${offer.product}`,
      "",
      `Language: ${LANGUAGE_LABEL[offer.language]}. ${offer.language === "en" ? "" : "Product names are left as you typed them. An English email is included for buyers who prefer it."}`.trim(),
      "",
      offer.missing.length ? `> Placeholders in [brackets] stand for details you have not given yet: ${offer.missing.join(", ")}.` : "> Every figure below came from your offer sheet.",
      "",
      "> Drafts only. Decupo sends nothing without a connected account and your approval of each batch.",
      "",
      ...drafts.flatMap((d) => [
        `## ${d.segment}`,
        "",
        `**Email subject:** ${d.email.subject}`,
        "",
        "```",
        d.email.body,
        "```",
        "",
        ...(d.englishEmail ? [`**English email subject:** ${d.englishEmail.subject}`, "", "```", d.englishEmail.body, "```", ""] : []),
        `**WhatsApp:** ${d.whatsapp}`,
        "",
        `**Call opener:** ${d.call}`,
        "",
      ]),
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Outreach drafts", content: md });
    const j = await ctx.writeArtifact({ kind: "json", title: "Outreach drafts (structured)", content: JSON.stringify(drafts, null, 2) });
    return {
      status: "succeeded",
      output: { artifactId: a.id, draftsArtifactId: j.id, draftCount: drafts.length, language: offer.language, placeholders: offer.missing, sent: 0 },
      summary: `${drafts.length} outreach drafts prepared in ${LANGUAGE_LABEL[offer.language]} (email, WhatsApp, call). Nothing sent.`,
    };
  },
};

// ---------------------------------------------------------------------------
// Steps that need connections. They block honestly instead of pretending.
// ---------------------------------------------------------------------------
const LEAD_COLUMNS = ["segment", "organisation", "contact name", "role", "city", "channel", "email", "phone", "source", "notes"] as const;

function leadRow(l: Lead): Record<(typeof LEAD_COLUMNS)[number], string | null> {
  return { segment: l.segment, organisation: l.organisation, "contact name": l.contactName, role: l.role, city: l.city, channel: l.channel, email: l.email, phone: l.phone, source: l.source, notes: l.notes };
}

const cell = (v: string | null) => (v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export const leadSearch: Skill = {
  manifest: {
    id: "lead-search",
    version: "0.2.0",
    name: "Find buyer contacts",
    description: "Looks up real organisations and contacts for each buyer segment through your connected lead-data provider. Returns exactly what the provider returns; blocked until one is connected.",
    agent: "Scout",
    actionClass: "read",
    permissionScopes: ["connection:data", "artifact:write"],
    privacy: "third_party",
    cost: { baseCredits: 40, variableAllowanceCredits: 20, creditsPerThousandTokens: 1 },
    timeoutMs: 120_000,
    maxAttempts: 2,
    availability: "needs_connection",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const c = await ctx.connector("data");
    if (c.status !== "ready") {
      return {
        status: "blocked",
        reason:
          c.code === "no_connection"
            ? "No lead-data or web-search connection is configured for this workspace. Connect one under Connected apps, or add contacts to the lead list template yourself, then retry."
            : c.reason,
        output: { leadsRetrieved: 0 },
      };
    }
    const offer = (ctx.upstream["offer-sheet"]?.offer as Offer | undefined) ?? parseOffer(ctx.goal, ctx.input);
    const { segments } = segmentsFor(offer.product, offer.market);
    const limit = Math.min(Math.max(Number(ctx.input.leadLimit) || 25, 1), 100);
    const leads = await ctx.once("lead-search", "data.searchLeads", () =>
      c.searchLeads({ product: offer.product, market: offer.market, segments: segments.map((s) => ({ key: s.key, name: s.name, findVia: s.findVia })), limit }),
    );
    if (leads.length === 0) {
      return {
        status: "blocked",
        reason: `The connected lead-data provider returned no contacts for ${offer.product}${offer.market ? ` in ${offer.market}` : ""}. Add contacts to the lead list template yourself, then retry.`,
        output: { leadsRetrieved: 0, source: c.mode },
      };
    }
    const mock = c.mode === "mock";
    const md = [
      `# Lead list: ${offer.product}${offer.market ? ` in ${offer.market}` : ""}`,
      "",
      `${leads.length} contact${leads.length === 1 ? "" : "s"} from ${c.label ?? "the connected provider"}, as returned. Nothing was added or guessed.`,
      "",
      mock ? "> Test data from the mock adapter. These are not real buyers; nothing should be sent to them outside a test." : "> Check the provider's terms before contacting anyone on this list.",
      "",
      `| ${LEAD_COLUMNS.join(" | ")} |`,
      `|${LEAD_COLUMNS.map(() => "---").join("|")}|`,
      ...leads.map((l) => {
        const r = leadRow(l);
        return `| ${LEAD_COLUMNS.map((k) => cell(r[k])).join(" | ")} |`;
      }),
      "",
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Lead list", content: md });
    const j = await ctx.writeArtifact({ kind: "json", title: "Lead list (data)", content: JSON.stringify({ columns: LEAD_COLUMNS, rows: leads.map(leadRow) }, null, 2) });
    return {
      status: "succeeded",
      output: { artifactId: a.id, leadsArtifactId: j.id, leadsRetrieved: leads.length, leads, source: c.mode, mock },
      summary: `${leads.length} buyer contact${leads.length === 1 ? "" : "s"} found${mock ? " (mock adapter, test data)" : ""}.`,
    };
  },
};

type SendOutcome = { to: string; channel: "email" | "whatsapp"; segment: string; status: "sent" | "failed"; providerMessageId: string | null; error: string | null };
type ReadyConnector = Extract<Connector, { status: "ready" }>;
type MissingConnector = Extract<Connector, { status: "needs_connection" }>;

const MAX_BATCH = 25;

function noSendReason(mail: Connector, wa: Connector): string {
  const missing = [mail, wa].filter((c): c is MissingConnector => c.status !== "ready");
  if (missing.every((c) => c.code === "no_connection")) return "No email or messaging connection is configured for this workspace. Connect one under Connected apps, then retry.";
  return missing.map((c) => c.reason).join(" ");
}

export const outreachSend: Skill = {
  manifest: {
    id: "outreach-send",
    version: "0.2.0",
    name: "Send outreach",
    description:
      "Sends the approved drafts to the found contacts from your own connected email or WhatsApp account, one batch per approval. Always requires approval; blocked until a messaging connection exists.",
    agent: "Echo",
    actionClass: "external_contact",
    permissionScopes: ["connection:mailbox", "connection:whatsapp", "artifact:write", "artifact:read"],
    privacy: "third_party",
    cost: { baseCredits: 10, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 120_000,
    maxAttempts: 2, // each message is journaled through once(); a retry never resends
    availability: "needs_connection",
    inputSchema: anyRecord,
  },
  async run(ctx: SkillContext) {
    const leads = (ctx.upstream["lead-search"]?.leads as Lead[] | undefined) ?? [];
    if (leads.length === 0) return { status: "blocked", reason: "There are no buyer contacts to send to yet.", output: { sent: 0 } };
    const mail = await ctx.connector("mailbox");
    const wa = await ctx.connector("whatsapp");
    if (mail.status !== "ready" && wa.status !== "ready") return { status: "blocked", reason: noSendReason(mail, wa), output: { sent: 0 } };

    const offer = (ctx.upstream["offer-sheet"]?.offer as Offer | undefined) ?? parseOffer(ctx.goal, ctx.input);
    const { segments } = segmentsFor(offer.product, offer.market);
    // The drafts the user saw and approved; recomputed from the same inputs only if the artifact is gone.
    let drafts: Draft[] | null = null;
    const draftsId = ctx.upstream["outreach-sequence"]?.draftsArtifactId;
    if (typeof draftsId === "string") {
      const art = await ctx.readArtifact(draftsId);
      if (art?.contentText) {
        try {
          drafts = JSON.parse(art.contentText) as Draft[];
        } catch {
          drafts = null;
        }
      }
    }
    const approved: Draft[] = drafts ?? draftsFor(offer, segments);
    const draftFor = (segment: string) => approved.find((d) => d.segment === segment) ?? approved[0]!;

    const plan = leads.map((l) => {
      const via: "email" | "whatsapp" | null = l.email && mail.status === "ready" ? "email" : l.phone && wa.status === "ready" ? "whatsapp" : null;
      return { lead: l, via };
    });
    const reachable = plan.filter((p): p is { lead: Lead; via: "email" | "whatsapp" } => p.via !== null);
    const unreachable = plan.length - reachable.length;
    if (reachable.length === 0) {
      const connected = [mail, wa].filter((c): c is ReadyConnector => c.status === "ready").map((c) => c.provider);
      return {
        status: "blocked",
        reason: `None of the ${leads.length} contacts can be reached through the connected accounts (${connected.join(", ") || "none"}).`,
        output: { sent: 0, unreachable },
      };
    }
    const batch = reachable.slice(0, MAX_BATCH);
    const results: SendOutcome[] = [];
    for (const [i, { lead, via }] of batch.entries()) {
      const draft = draftFor(lead.segment);
      const to = via === "email" ? lead.email! : lead.phone!;
      const msg = via === "email" ? { channel: "email" as const, to, subject: draft.email.subject, body: draft.email.body } : { channel: "whatsapp" as const, to, subject: null, body: draft.whatsapp };
      const connector = (via === "email" ? mail : wa) as ReadyConnector;
      // Exactly once per recipient across retries. A provider rejection (4xx) is a
      // recorded outcome; an outage (5xx / network) throws so the step retries and
      // the journal replays the messages that did go out.
      const outcome = await ctx.once(`send:${i}:${via}:${to}`, `${connector.provider}.sendMessage`, async (): Promise<SendOutcome> => {
        try {
          const r = await connector.sendMessage(msg);
          return { to, channel: via, segment: lead.segment, status: "sent", providerMessageId: r.providerMessageId, error: null };
        } catch (err) {
          if (err instanceof ProviderError && err.status !== undefined && err.status < 500) {
            return { to, channel: via, segment: lead.segment, status: "failed", providerMessageId: null, error: err.message };
          }
          throw err;
        }
      });
      results.push(outcome);
    }
    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.length - sent;
    const remaining = reachable.length - batch.length;
    const mock = [mail, wa].some((c) => c.status === "ready" && c.mode === "mock");
    const md = [
      `# Send report: ${offer.product}`,
      "",
      `${sent} of ${results.length} messages sent${failed ? `, ${failed} rejected by the provider` : ""}${unreachable ? `, ${unreachable} contact${unreachable === 1 ? "" : "s"} had no channel you have connected` : ""}${remaining ? `, ${remaining} left for the next approved batch` : ""}.`,
      "",
      mock ? "> Sent through the mock adapter: nothing reached a real person." : "> Sent from your own connected account. Each message is in the access log under Connected apps.",
      "",
      "| to | channel | segment | result |",
      "|---|---|---|---|",
      ...results.map((r) => `| ${cell(r.to)} | ${r.channel} | ${cell(r.segment)} | ${r.status === "sent" ? `sent${r.providerMessageId ? ` (${r.providerMessageId})` : ""}` : `failed: ${cell(r.error)}`} |`),
      "",
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Send report", content: md });
    if (sent === 0) throw new Error(`The provider rejected every message in the batch: ${results[0]?.error ?? "unknown error"}`);
    return {
      status: "succeeded",
      output: { artifactId: a.id, sent, failed, attempted: results.length, unreachable, remaining, batchSize: MAX_BATCH, partial: failed > 0 || remaining > 0, results, mock },
      summary: `${sent} of ${results.length} messages sent${failed ? `, ${failed} failed` : ""}${remaining ? `, ${remaining} waiting for the next batch` : ""}${mock ? " (mock adapter)" : ""}.`,
    };
  },
};

export const SALES_SKILLS: Skill[] = [offerSheet, buyerMap, outreachSequence, leadSearch, outreachSend];
