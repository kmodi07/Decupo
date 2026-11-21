import { z } from "zod";
import type { Skill, SkillContext } from "./types";

/**
 * Buyer-finding missions: a seller says what stock they have, at what price,
 * and how to reach them; the crew prepares everything needed to find and
 * contact buyers, and stops honestly where a connection or approval is needed.
 *
 *   offer-sheet       Echo   structured offer from the goal and answers
 *   buyer-map         Scout  buyer segments and channels for this product
 *   outreach-sequence Echo   per-segment email, WhatsApp and call drafts, in the seller's language
 *   lead-search       Scout  real buyer contacts: blocked without a data connection
 *   outreach-send     Echo   Tier 3: blocked without a messaging connection, approval per batch
 *
 * Nothing here contacts anyone, invents a buyer name or quotes a price the
 * seller did not give.
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
export const leadSearch: Skill = {
  manifest: {
    id: "lead-search",
    version: "0.1.0",
    name: "Find buyer contacts",
    description: "Looks up real organisations and contacts for each buyer segment. Needs a connected lead-data or web-search provider; blocked until one exists.",
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
    if (!(await ctx.hasConnection("data"))) {
      return {
        status: "blocked",
        reason: "No lead-data or web-search connection is configured for this workspace. Connect one under Connected apps, or add contacts to the lead list template yourself, then retry.",
        output: { leadsRetrieved: 0 },
      };
    }
    return { status: "blocked", reason: "Lead search is not implemented yet: the data adapter ships with the connector framework (backlog B-30).", output: { leadsRetrieved: 0 } };
  },
};

export const outreachSend: Skill = {
  manifest: {
    id: "outreach-send",
    version: "0.1.0",
    name: "Send outreach",
    description:
      "Sends the approved drafts to the found contacts from your own connected email or WhatsApp account, one batch per approval. Always requires approval; blocked until a messaging connection exists.",
    agent: "Echo",
    actionClass: "external_contact",
    permissionScopes: ["connection:mailbox", "artifact:write"],
    privacy: "third_party",
    cost: { baseCredits: 10, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 120_000,
    maxAttempts: 1,
    availability: "needs_connection",
    inputSchema: anyRecord,
  },
  async run(ctx: SkillContext) {
    const leads = Number(ctx.upstream["lead-search"]?.leadsRetrieved ?? 0);
    if (leads === 0) return { status: "blocked", reason: "There are no buyer contacts to send to yet.", output: { sent: 0 } };
    if (!(await ctx.hasConnection("mailbox"))) {
      return { status: "blocked", reason: "No email or messaging connection is configured for this workspace. Connect one under Connected apps, then retry.", output: { sent: 0 } };
    }
    return { status: "blocked", reason: "Sending is not implemented yet: the messaging adapter ships with the connector framework (backlog B-30).", output: { sent: 0 } };
  },
};

export const SALES_SKILLS: Skill[] = [offerSheet, buyerMap, outreachSequence, leadSearch, outreachSend];
