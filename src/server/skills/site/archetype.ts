/**
 * Business archetypes for generated sites.
 *
 * A site for a tutoring company should not look or read like a site for an
 * electronics shop or a grain trader. Each archetype fixes the things that
 * make a site feel made for the business rather than generated: the hero
 * layout, the logo mark, the cursor, the page texture, the motion tempo, the
 * default type and shape, and the copy for services, reasons, steps, FAQ and
 * calls to action. Everything is deterministic and derived from the goal and
 * answers; no facts, figures or testimonials are invented.
 */
import type { PaletteId, ShapeId, TypeId } from "./theme";

export type ArchetypeId =
  | "education"
  | "electronics"
  | "grains"
  | "farm"
  | "crafts"
  | "food"
  | "beauty"
  | "health"
  | "fitness"
  | "studio"
  | "professional"
  | "tech"
  | "trades"
  | "general";

export type HeroLayout = "split" | "editorial" | "poster" | "shelf";
export type MarkStyle = "ruled" | "chip" | "sack" | "leaf" | "wheel" | "flame" | "petal" | "cross" | "bolt" | "lens" | "shield" | "grid" | "hex" | "ring";
export type CursorStyle = "chalk" | "ring" | "dot" | "plus" | "arrow";
export type MotionTempo = "calm" | "snappy" | "drift" | "steady";
export type Texture = "ruled" | "grid" | "weave" | "dots" | "paper" | "none";

export type CopyBlock = { title: string; body: string };

export type Archetype = {
  id: ArchetypeId;
  /** "a tutoring business": used in the brief and logs. */
  label: string;
  hero: HeroLayout;
  mark: MarkStyle;
  cursor: CursorStyle;
  motion: MotionTempo;
  texture: Texture;
  defaults: { palette: Exclude<PaletteId, "custom">; type: TypeId; shape: ShapeId };
  /** The one-line promise under the brand name. */
  headline: string;
  /** Second line of the hero; `{audience}` is replaced when an audience is known. */
  tagline: string;
  /** What the business does, in a sentence, for the brief and the meta description. `{brand}` and `{audience}` are replaced. */
  purpose: string;
  /** What the audience is usually trying to get done, for the brief. */
  audienceWants: string[];
  cta: { primary: string; secondary: string };
  services: CopyBlock[];
  reasons: CopyBlock[];
  steps: CopyBlock[];
  faq: CopyBlock[];
  tiers: Array<{ name: string; body: string; points: string[] }>;
  pricingIntro: string;
  contactPoints: string[];
  /** Short words for the strip under the hero. */
  strip: string[];
};

type Rule = { id: ArchetypeId; re: RegExp };

// Most specific first. Matched against goal + brand name + the products/audience answers.
const RULES: Rule[] = [
  { id: "electronics", re: /\b(electronics?|appliances?|fridges?|refrigerators?|washing machines?|televisions?|tvs?|air ?conditioners?|acs?|mobiles?|smartphones?|laptops?|gadgets?|lg|samsung|sony|whirlpool|voltas|showroom)\b/i },
  { id: "grains", re: /\b(rice|basmati|wheat|grains?|flour|atta|dal|pulses|lentils|spices?|staples|sugar|oil mill|provisions?|kirana|grocery|groceries|wholesaler?|traders?)\b/i },
  { id: "farm", re: /\b(farm\w*|harvest|crops?|ashwagandha|turmeric|ginger|herbs?|botanicals?|produce|vegetables?|fruits?|mangoes?|mandi|orchard|dairy|honey|organic growers?|agri\w*)\b/i },
  { id: "education", re: /\b(tutor\w*|tuition|coaching|academy|classes|school|teacher|teaching|learn\w*|courses?|exam\w*|lessons?|students?|training institute|ielts|neet|jee|olympiad)\b/i },
  { id: "food", re: /\b(restaurant|caf[eé]|bakery|bakers?|catering|caterers?|tiffin|dhaba|sweets?|mithai|kitchen|food truck|bistro|pizza|biryani|canteen|cloud kitchen)\b/i },
  { id: "beauty", re: /\b(salon|parlou?r|spa|beauty|makeup|make-up|nails?|barber|hair|bridal|skincare|mehndi)\b/i },
  { id: "health", re: /\b(clinic|dental|dentist|doctor|physio\w*|hospital|pharmacy|ayurved\w*|homeopath\w*|therapy|therapist|diagnostic|lab tests?|wellness centre|nursing)\b/i },
  { id: "fitness", re: /\b(gym|yoga|fitness|trainer|pilates|crossfit|martial arts|karate|boxing|sports academy|swimming|zumba)\b/i },
  { id: "crafts", re: /\b(pottery|ceramics?|handmade|handicrafts?|crafts?|candles?|jewell?ery|boutique|textiles?|sarees?|handloom|furniture|woodwork\w*|carpentry|artisan\w*|art gallery|paintings?)\b/i },
  { id: "studio", re: /\b(photograph\w*|photo studio|videograph\w*|film|wedding films?|design studio|architects?|interiors?|interior design|creative agency|branding agency|marketing agency|advertising)\b/i },
  { id: "tech", re: /\b(software|saas|app|apps|startup|it services|developers?|automation|ai|machine learning|cloud|web agency|digital agency)\b/i },
  { id: "professional", re: /\b(law|legal|advocates?|lawyers?|chartered accountants?|ca firm|accounting|accountants?|tax|audit\w*|consult\w*|finance|financial|insurance|real estate|property|brokers?|notary)\b/i },
  { id: "trades", re: /\b(plumb\w*|electrician|construction|builders?|contractors?|repairs?|cleaning|movers|packers|solar|painting|painters|pest control|roofing|flooring|welding|fabrication|garage|mechanic)\b/i },
];

export type ArchetypeSignals = { goal: string; brandName?: string; products?: string; audience?: string };

export function detectArchetype(s: ArchetypeSignals): Archetype {
  const text = [s.goal, s.brandName, s.products, s.audience].filter(Boolean).join(" \n ");
  const hit = RULES.find((r) => r.re.test(text));
  return ARCHETYPES[hit?.id ?? "general"];
}

export function fill(template: string, vars: { brand?: string; audience?: string | null; place?: string | null }): string {
  return template
    .replace(/\{brand\}/g, vars.brand ?? "we")
    .replace(/\s*\{audience\}/g, vars.audience ? ` ${vars.audience}` : "")
    .replace(/\s*\{place\}/g, vars.place ? ` in ${vars.place}` : "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

const conversation = { name: "Starter", body: "For getting going.", points: ["One clear deliverable", "Agreed timeline", "Email support"] };

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  education: {
    id: "education",
    label: "a tutoring and teaching business",
    hero: "split",
    mark: "ruled",
    cursor: "chalk",
    motion: "calm",
    texture: "ruled",
    defaults: { palette: "forest", type: "serif", shape: "soft" },
    headline: "Lessons that meet each student where they are.",
    tagline: "Patient teaching, a plan for every learner, and progress parents can see. {audience}",
    purpose: "{brand} teaches{audience} with one-to-one and small-group lessons built around each student's goals.",
    audienceWants: ["A tutor who explains clearly and keeps the student motivated", "Visible progress before the next exam or report", "Flexible timings that fit school and family life"],
    cta: { primary: "Book a first lesson", secondary: "How lessons work" },
    services: [
      { title: "One-to-one lessons", body: "Focused sessions on the subjects and topics a student finds hardest, at a pace that suits them." },
      { title: "Small-group classes", body: "Four to six students at a similar level, so there is discussion, practice and still time for questions." },
      { title: "Exam preparation", body: "Past papers, timed practice and a revision plan for the weeks before board exams and entrance tests." },
      { title: "Homework and study support", body: "Regular check-ins that keep schoolwork on track between lessons and build independent study habits." },
    ],
    reasons: [
      { title: "A plan for each student", body: "The first lesson is an assessment. Everything after it follows a written plan that parents can read." },
      { title: "Progress you can see", body: "Short notes after every lesson: what was covered, what improved, what comes next." },
      { title: "Teachers who stay", body: "The same tutor from the first lesson to the exam, so nothing has to be explained twice." },
    ],
    steps: [
      { title: "Tell us the goal", body: "The subject, the exam or grade in view, and the dates that matter." },
      { title: "Meet the tutor", body: "A first lesson to assess where the student is and agree a plan." },
      { title: "Lessons begin", body: "A fixed weekly slot, lesson notes after each session, and a review every month." },
    ],
    faq: [
      { title: "Which subjects and levels do you teach?", body: "List your subjects, boards and age groups here. Parents decide quickly when this is specific." },
      { title: "Online or in person?", body: "Say which you offer and where. Many families choose a mix; state what works for you." },
      { title: "How do we know it is working?", body: "Lesson notes after every session and a monthly review of progress against the plan." },
    ],
    tiers: [
      { name: "Single lessons", body: "Pay per lesson, no commitment.", points: ["One-to-one, 60 minutes", "Lesson notes afterwards", "Book a week ahead"] },
      { name: "Monthly plan", body: "A fixed weekly slot.", points: ["Four to eight lessons a month", "Written plan and monthly review", "Priority rescheduling"] },
      { name: "Exam season", body: "The run-up to exams.", points: ["Extra sessions before papers", "Timed practice and marking", "Parent check-in every fortnight"] },
    ],
    pricingIntro: "Fees are not published yet, so none are shown. Each plan is a starting point to discuss, not a contract.",
    contactPoints: ["Phone or WhatsApp number to be added", "Teaching location or online link to be added", "Lesson hours to be added"],
    strip: ["One-to-one", "Small groups", "Exam prep", "Lesson notes", "Monthly reviews"],
  },

  electronics: {
    id: "electronics",
    label: "an electronics and appliances shop",
    hero: "shelf",
    mark: "chip",
    cursor: "ring",
    motion: "snappy",
    texture: "grid",
    defaults: { palette: "navy", type: "sans", shape: "regular" },
    headline: "The right appliance, installed and working, from people you can call.",
    tagline: "Fridges, washing machines, televisions and air conditioners with honest advice, home delivery and after-sales service. {audience}",
    purpose: "{brand} sells and services home appliances and electronics{place}, with delivery, installation and support after the sale.",
    audienceWants: ["Straight advice on which model fits the home and the budget", "Delivery and installation on a known date", "Someone to call when something goes wrong"],
    cta: { primary: "Ask for today's price", secondary: "See what is in stock" },
    services: [
      { title: "Home appliances", body: "Refrigerators, washing machines, air conditioners and kitchen appliances from the brands we are authorised to sell." },
      { title: "Televisions and audio", body: "Smart TVs and sound systems, set up at home so they work on the first evening." },
      { title: "Delivery and installation", body: "Delivered on the agreed day, installed by trained staff, old unit taken away on request." },
      { title: "Exchange and service", body: "Exchange offers on old appliances, demo at home, and help with warranty claims and repairs." },
    ],
    reasons: [
      { title: "Advice before the sale", body: "We ask about the room, the family and the power supply before we suggest a model." },
      { title: "Installed, not just delivered", body: "Every appliance is installed and switched on by our team, with a demo of how it works." },
      { title: "A shop you can walk into", body: "Service issues are handled in person. Bring the bill, talk to the owner." },
    ],
    steps: [
      { title: "Tell us what you need", body: "A message or a visit with the model, the budget and the room size." },
      { title: "See it and compare", body: "A live demo in the shop or at home, with a price confirmed in writing." },
      { title: "Delivered and installed", body: "On the agreed day, by our own team, with the warranty registered." },
    ],
    faq: [
      { title: "Do you give exchange on old appliances?", body: "State your exchange policy here: which products, how the value is assessed, and when the old unit is collected." },
      { title: "What about EMI and payment?", body: "List the payment options you accept, including card EMI or finance partners, so customers do not have to ask." },
      { title: "How fast is delivery?", body: "Give your usual delivery and installation window for the area you serve." },
    ],
    tiers: [
      { name: "Walk-in price", body: "Today's rate on the floor.", points: ["Price confirmed in writing", "Standard delivery", "Brand warranty"] },
      { name: "Delivered and installed", body: "Most customers choose this.", points: ["Delivery on an agreed day", "Installation and demo", "Old unit taken away"] },
      { name: "Exchange offer", body: "Trade in your old appliance.", points: ["Exchange value agreed first", "Collection at delivery", "Help with warranty registration"] },
    ],
    pricingIntro: "Prices change with the season and brand schemes, so none are shown. Ask for today's rate and we will confirm it in writing.",
    contactPoints: ["Shop phone or WhatsApp to be added", "Shop address and landmark to be added", "Opening hours to be added"],
    strip: ["Refrigerators", "Washing machines", "Televisions", "Air conditioners", "Installation", "Exchange"],
  },

  grains: {
    id: "grains",
    label: "a grains and staples trading business",
    hero: "shelf",
    mark: "sack",
    cursor: "dot",
    motion: "steady",
    texture: "weave",
    defaults: { palette: "earth", type: "serif", shape: "regular" },
    headline: "Steady supply of staples, graded and delivered on time.",
    tagline: "Rice, wheat, pulses and spices for shops, restaurants and institutions, with the same quality in every bag. {audience}",
    purpose: "{brand} supplies grains and staples{place} to retailers, restaurants and institutions, with graded stock and reliable delivery.",
    audienceWants: ["A dependable rate and the same grade every time", "Delivery on the days they restock", "Credit terms and invoices that keep their accounts simple"],
    cta: { primary: "Ask for this week's rate", secondary: "What we supply" },
    services: [
      { title: "Rice and wheat", body: "Branded and loose varieties by the bag, graded and stored properly, available for regular weekly supply." },
      { title: "Pulses and spices", body: "Dals, whole spices and ground spices in trade packs for kiranas, caterers and canteens." },
      { title: "Bulk and institutional supply", body: "Monthly contracts for hostels, canteens, hospitals and caterers at agreed rates." },
      { title: "Delivery and credit", body: "Scheduled deliveries by route, GST invoices, and credit terms for regular customers." },
    ],
    reasons: [
      { title: "Graded, not guessed", body: "Every lot is checked before it goes out. Ask for a sample bag before your first order." },
      { title: "Delivered on your day", body: "Route-wise deliveries so your shelf is full before the weekend rush." },
      { title: "Rates you can plan on", body: "A weekly rate list on WhatsApp, and advance notice when the market moves." },
    ],
    steps: [
      { title: "Send your list", body: "Products, quantities and how often you restock." },
      { title: "Get the rate and a sample", body: "A written rate for your list and a sample bag if you want one." },
      { title: "Regular delivery", body: "A delivery day that suits you, with an invoice every time." },
    ],
    faq: [
      { title: "What is the minimum order?", body: "State your minimum order for delivery and whether smaller orders can be collected." },
      { title: "Do you offer credit?", body: "Say what terms you give regular customers and what you need to open an account." },
      { title: "Which areas do you deliver to?", body: "List the towns, markets or routes you cover and the days for each." },
    ],
    tiers: [
      { name: "Shop supply", body: "For kiranas and general stores.", points: ["Weekly or fortnightly delivery", "Mixed loads welcome", "Rate list every week"] },
      { name: "Restaurant and caterer", body: "For kitchens that cannot run out.", points: ["Fixed delivery days", "Consistent grade and brand", "Monthly invoicing"] },
      { name: "Institutional contract", body: "For canteens, hostels and hospitals.", points: ["Agreed monthly rate", "Quotation and tender support", "Dedicated contact"] },
    ],
    pricingIntro: "Grain rates move weekly, so none are shown here. Ask for this week's rate list and it will be confirmed in writing.",
    contactPoints: ["Phone or WhatsApp for orders to be added", "Godown or shop address to be added", "Delivery days and areas to be added"],
    strip: ["Rice", "Wheat", "Pulses", "Spices", "Bulk supply", "Weekly rates"],
  },

  farm: {
    id: "farm",
    label: "a farm or produce business",
    hero: "editorial",
    mark: "leaf",
    cursor: "dot",
    motion: "drift",
    texture: "paper",
    defaults: { palette: "forest", type: "serif", shape: "soft" },
    headline: "Grown with care, sold with the paperwork buyers ask for.",
    tagline: "Fresh produce and herbs from our own fields, graded and documented for traders, processors and brands. {audience}",
    purpose: "{brand} grows and supplies farm produce{place}, graded and documented for buyers who need consistent lots.",
    audienceWants: ["A documented, consistent lot they can trust", "Clear quantity, grade and timing before they commit", "A grower they can come back to next season"],
    cta: { primary: "Ask about this season's lot", secondary: "How we grow" },
    services: [
      { title: "This season's produce", body: "What is ready now, in what quantity and grade, with samples available on request." },
      { title: "Graded and packed", body: "Cleaned, sorted and packed to the buyer's specification, with lot numbers for traceability." },
      { title: "Documents and tests", body: "Test reports, origin details and invoices prepared for processors, exporters and brands." },
      { title: "Forward supply", body: "Agree volumes for the next harvest so planting matches your demand." },
    ],
    reasons: [
      { title: "Single origin", body: "Everything comes from our own fields, so you know exactly where a lot was grown." },
      { title: "Honest grading", body: "The sample you see is the lot you get. Grade and moisture are stated up front." },
      { title: "Repeat supply", body: "We plan the next season with regular buyers, so volumes are there when you need them." },
    ],
    steps: [
      { title: "Ask what is ready", body: "Product, quantity and the grade you need." },
      { title: "Check a sample", body: "A sample and the test reports, with a price confirmed in writing." },
      { title: "Dispatch", body: "Packed to your spec and dispatched on the agreed date, with the invoice." },
    ],
    faq: [
      { title: "Can you supply all year?", body: "State your harvest windows and what you can store, so buyers know when to plan." },
      { title: "Are you certified organic?", body: "Say plainly which certifications you hold and which you do not." },
      { title: "Do you deliver or is it ex-farm?", body: "Describe the delivery terms you usually work with and the areas you can reach." },
    ],
    tiers: [
      { name: "Spot lot", body: "What is ready now.", points: ["Sample first", "Price per unit confirmed in writing", "Dispatch on agreed date"] },
      { name: "Seasonal supply", body: "Regular lots through the season.", points: ["Agreed grade and packing", "Scheduled dispatches", "Documents with every lot"] },
      { name: "Forward contract", body: "Plan the next harvest together.", points: ["Volumes agreed before planting", "Priority on the harvest", "Shared quality plan"] },
    ],
    pricingIntro: "Produce prices depend on the season and the grade, so none are shown. Ask for a quote on the lot you need.",
    contactPoints: ["Phone or WhatsApp to be added", "Farm location and nearest town to be added", "Harvest season dates to be added"],
    strip: ["Single origin", "Graded lots", "Test reports", "Samples", "Forward supply"],
  },

  crafts: {
    id: "crafts",
    label: "a maker or craft business",
    hero: "editorial",
    mark: "wheel",
    cursor: "dot",
    motion: "drift",
    texture: "paper",
    defaults: { palette: "earth", type: "serif", shape: "soft" },
    headline: "Made by hand, one piece at a time.",
    tagline: "Work with a story behind it, from a small studio that cares how things are made. {audience}",
    purpose: "{brand} makes handmade pieces{place} for people who want objects with a story.",
    audienceWants: ["Something made with care rather than mass-produced", "To know who made it and how", "Gifts and pieces that last"],
    cta: { primary: "See the current collection", secondary: "Our studio" },
    services: [
      { title: "The collection", body: "Pieces available now, each one slightly different because it was made by hand." },
      { title: "Commissions", body: "Made to your brief: size, colour and purpose agreed before work starts." },
      { title: "Workshops", body: "Short sessions in the studio for beginners and small groups." },
      { title: "Wholesale and gifting", body: "Small batches for shops, cafés and corporate gifts, with lead times agreed up front." },
    ],
    reasons: [
      { title: "You know the maker", body: "Every piece is made in our studio and signed. Ask about any of them." },
      { title: "Materials chosen with care", body: "Where things come from and why we use them, stated for every product." },
      { title: "Made to last", body: "Built for daily use, with care instructions and repairs where possible." },
    ],
    steps: [
      { title: "Choose or commission", body: "Pick from the collection or describe what you want." },
      { title: "We make it", body: "Updates while the piece is in progress, and a photo before it ships." },
      { title: "Delivered carefully", body: "Packed by hand and sent with care instructions." },
    ],
    faq: [
      { title: "How long does a commission take?", body: "Give your usual lead time and how it changes with the size of the piece." },
      { title: "Do you ship?", body: "State where you ship, how pieces are packed and what happens if something arrives damaged." },
      { title: "Can I visit the studio?", body: "Say whether and when visitors are welcome." },
    ],
    tiers: [
      { name: "From the collection", body: "Ready to ship.", points: ["Pieces in stock", "Gift wrapping on request", "Care instructions included"] },
      { name: "Commission", body: "Made for you.", points: ["Brief agreed in writing", "Progress photos", "Lead time confirmed up front"] },
      { name: "Wholesale", body: "For shops and gifting.", points: ["Small minimums", "Consistent finish across a batch", "Lead times agreed"] },
    ],
    pricingIntro: "Prices depend on the piece and are not listed yet. Ask about anything in the collection or describe a commission.",
    contactPoints: ["Email or WhatsApp to be added", "Studio location to be added", "Visiting hours to be added"],
    strip: ["Handmade", "Small batches", "Commissions", "Workshops", "Gifting"],
  },

  food: {
    id: "food",
    label: "a food business",
    hero: "poster",
    mark: "flame",
    cursor: "dot",
    motion: "snappy",
    texture: "dots",
    defaults: { palette: "earth", type: "serif", shape: "soft" },
    headline: "Food worth coming back for.",
    tagline: "Cooked fresh every day, served with care, and easy to order for the table or the whole office. {audience}",
    purpose: "{brand} cooks and serves food{place}, for walk-ins, orders and events.",
    audienceWants: ["Food that tastes the same good way every time", "Easy ordering for a family or a team", "Clear timings, prices and delivery areas"],
    cta: { primary: "See the menu", secondary: "Order or book" },
    services: [
      { title: "Dine in", body: "Our regular menu, served fresh. Add your seating, timings and what the place is known for." },
      { title: "Takeaway and delivery", body: "Order by phone or WhatsApp; state your delivery area and usual time." },
      { title: "Catering and events", body: "Menus for parties, offices and functions, with a quote confirmed in writing." },
      { title: "Daily specials and tiffins", body: "A changing daily menu or a subscription tiffin, if you offer one." },
    ],
    reasons: [
      { title: "Fresh every day", body: "Prepared in our own kitchen each morning; nothing reheated from yesterday." },
      { title: "Known for something", body: "Name the dishes people come back for and let them lead the menu." },
      { title: "Easy to order", body: "One number for calls and WhatsApp, with a clear menu and prices." },
    ],
    steps: [
      { title: "Pick from the menu", body: "Browse the menu or ask what is good today." },
      { title: "Order or book", body: "By phone, WhatsApp or at the counter; events get a written quote." },
      { title: "Enjoy", body: "Served at the table, packed for pickup, or delivered hot." },
    ],
    faq: [
      { title: "What are your hours?", body: "List opening days and hours, including when the kitchen closes." },
      { title: "Do you deliver?", body: "State your delivery area, minimum order and typical time." },
      { title: "Can you cater an event?", body: "Say what size of event you handle and how far ahead to book." },
    ],
    tiers: [
      { name: "Table and takeaway", body: "Everyday orders.", points: ["Full menu", "Call or WhatsApp to order", "Pickup or delivery"] },
      { name: "Office and family packs", body: "For groups.", points: ["Set menus by headcount", "Order a day ahead", "Delivered on time"] },
      { name: "Events", body: "Parties and functions.", points: ["Menu planned with you", "Quote confirmed in writing", "Service staff on request"] },
    ],
    pricingIntro: "Menu prices are not published here yet. Ask for the current menu and catering rates.",
    contactPoints: ["Phone or WhatsApp for orders to be added", "Address and landmark to be added", "Opening hours to be added"],
    strip: ["Fresh daily", "Dine in", "Takeaway", "Delivery", "Catering"],
  },

  beauty: {
    id: "beauty",
    label: "a salon or beauty business",
    hero: "editorial",
    mark: "petal",
    cursor: "dot",
    motion: "calm",
    texture: "none",
    defaults: { palette: "blush", type: "serif", shape: "soft" },
    headline: "Look like yourself on a very good day.",
    tagline: "Hair, skin and beauty services by appointment, with products chosen for you and time that is actually yours. {audience}",
    purpose: "{brand} offers salon and beauty services{place} by appointment.",
    audienceWants: ["A stylist who listens before picking up the scissors", "Appointments that start on time", "Honest advice about products and treatments"],
    cta: { primary: "Book an appointment", secondary: "See services" },
    services: [
      { title: "Hair", body: "Cuts, colour, styling and treatments, with a consultation first." },
      { title: "Skin and face", body: "Facials, cleanups and skin care matched to your skin type." },
      { title: "Bridal and occasions", body: "Trials, packages and on-location services for weddings and events." },
      { title: "Nails and grooming", body: "Manicures, pedicures, waxing, threading and grooming for everyone." },
    ],
    reasons: [
      { title: "Consultation first", body: "Every appointment starts with a conversation about what you want and what suits you." },
      { title: "Hygiene you can see", body: "Fresh tools, clean stations and products opened in front of you." },
      { title: "On time", body: "Appointments are spaced so yours starts when it should." },
    ],
    steps: [
      { title: "Choose a service", body: "Pick from the list or describe the look you want." },
      { title: "Book a slot", body: "By phone, WhatsApp or online, with a reminder the day before." },
      { title: "Your appointment", body: "A consultation, the service, and advice for keeping it up at home." },
    ],
    faq: [
      { title: "Do I need an appointment?", body: "Say whether walk-ins are welcome and how far ahead to book for weekends." },
      { title: "Which products do you use?", body: "List the brands you work with and whether you retail them." },
      { title: "Do you do bridal packages?", body: "Describe your bridal offer, trials and whether you travel to venues." },
    ],
    tiers: [
      { name: "Single service", body: "Walk in or book.", points: ["Consultation included", "Pay per service", "Advice for home care"] },
      { name: "Monthly care", body: "Regular appointments.", points: ["Fixed slot each month", "Priority booking", "Package rates"] },
      { name: "Bridal and events", body: "The big day.", points: ["Trial session", "On-location option", "Quote confirmed in writing"] },
    ],
    pricingIntro: "Service prices are not listed here yet. Ask for the current price list when you book.",
    contactPoints: ["Phone or WhatsApp for bookings to be added", "Salon address to be added", "Opening hours to be added"],
    strip: ["Hair", "Skin", "Bridal", "Nails", "By appointment"],
  },

  health: {
    id: "health",
    label: "a clinic or health practice",
    hero: "split",
    mark: "cross",
    cursor: "arrow",
    motion: "steady",
    texture: "none",
    defaults: { palette: "navy", type: "sans", shape: "regular" },
    headline: "Care that explains itself.",
    tagline: "Appointments that run on time, clear explanations, and a plan you leave with. {audience}",
    purpose: "{brand} provides clinical care{place}, with appointments, follow-up and plain-language advice.",
    audienceWants: ["To be seen on time and listened to", "A clear explanation and a written plan", "Easy follow-up by phone or message"],
    cta: { primary: "Book an appointment", secondary: "Services and timings" },
    services: [
      { title: "Consultations", body: "In-person and, where appropriate, online appointments with the practitioner." },
      { title: "Treatments and procedures", body: "List the treatments you offer, with what to expect before and after." },
      { title: "Tests and reports", body: "Which tests are done on site, how long reports take and how you receive them." },
      { title: "Follow-up care", body: "Review appointments, reminders and a number to call with questions." },
    ],
    reasons: [
      { title: "Clear explanations", body: "You leave knowing what was found, what it means and what happens next." },
      { title: "On time", body: "Appointments are spaced properly, and we tell you if we are running late." },
      { title: "Records that follow you", body: "Your history, prescriptions and reports kept together and shared with you." },
    ],
    steps: [
      { title: "Book", body: "By phone, WhatsApp or online; say if it is urgent." },
      { title: "Consultation", body: "History, examination and a plain explanation of the plan." },
      { title: "Follow-up", body: "Reports, prescriptions and a review date, with reminders." },
    ],
    faq: [
      { title: "What are the consultation timings?", body: "List days, hours and how emergencies are handled." },
      { title: "Do you accept insurance?", body: "State which insurers or schemes you work with, or that payment is direct." },
      { title: "How do I get my reports?", body: "Explain how reports are shared and how long they take." },
    ],
    tiers: [
      { name: "Consultation", body: "A single visit.", points: ["In person or online", "Written plan", "Prescription if needed"] },
      { name: "Treatment course", body: "A planned series.", points: ["Schedule agreed up front", "Progress reviews", "Reminders"] },
      { name: "Family and annual care", body: "Ongoing care.", points: ["Regular check-ups", "Records in one place", "Priority appointments"] },
    ],
    pricingIntro: "Consultation and treatment fees are not published here yet. Ask when you book.",
    contactPoints: ["Clinic phone or WhatsApp to be added", "Clinic address to be added", "Consultation timings to be added"],
    strip: ["Consultations", "Treatments", "Reports", "Follow-up", "On time"],
  },

  fitness: {
    id: "fitness",
    label: "a fitness business",
    hero: "poster",
    mark: "bolt",
    cursor: "ring",
    motion: "snappy",
    texture: "grid",
    defaults: { palette: "playful", type: "sans", shape: "sharp" },
    headline: "Show up. We handle the rest.",
    tagline: "Coaching, classes and a plan that fits your week, for beginners and regulars alike. {audience}",
    purpose: "{brand} runs training and classes{place} with coaching for every level.",
    audienceWants: ["A routine they can actually keep", "Coaching that corrects form and keeps them safe", "A place that feels welcoming, not intimidating"],
    cta: { primary: "Book a trial session", secondary: "See the timetable" },
    services: [
      { title: "Group classes", body: "A weekly timetable of classes for all levels; the first one is a trial." },
      { title: "Personal training", body: "One-to-one coaching with a programme written for your goal." },
      { title: "Open gym", body: "Equipment and floor space with a coach on hand for questions." },
      { title: "Programmes", body: "Four to twelve week programmes for strength, weight, mobility or an event." },
    ],
    reasons: [
      { title: "Coached, not just supervised", body: "Form is corrected in every session, whether it is a class or the open floor." },
      { title: "A plan, not a guess", body: "You start with an assessment and leave with a written programme." },
      { title: "All levels, no judgement", body: "Beginners get scaled versions of every workout." },
    ],
    steps: [
      { title: "Book a trial", body: "Pick a class or a personal session to start." },
      { title: "Assessment", body: "Goals, history and a baseline, then a plan." },
      { title: "Train", body: "A timetable that fits your week and check-ins every month." },
    ],
    faq: [
      { title: "I have never trained. Is this for me?", body: "Say how beginners start and how workouts are scaled." },
      { title: "What are the timings?", body: "Publish the timetable and opening hours." },
      { title: "Is there a membership contract?", body: "State your terms plainly: monthly, quarterly, notice period." },
    ],
    tiers: [
      { name: "Drop-in", body: "One session at a time.", points: ["Any class", "No commitment", "Trial for new members"] },
      { name: "Monthly membership", body: "Most members choose this.", points: ["Unlimited classes", "Open gym access", "Monthly check-in"] },
      { name: "Coaching", body: "Personal training.", points: ["Written programme", "One-to-one sessions", "Progress tracking"] },
    ],
    pricingIntro: "Membership and coaching prices are not listed here yet. Ask at the front desk or on WhatsApp.",
    contactPoints: ["Phone or WhatsApp to be added", "Gym address to be added", "Opening hours to be added"],
    strip: ["Classes", "Personal training", "Open gym", "Programmes", "All levels"],
  },

  studio: {
    id: "studio",
    label: "a creative studio",
    hero: "editorial",
    mark: "lens",
    cursor: "ring",
    motion: "drift",
    texture: "none",
    defaults: { palette: "luxury", type: "serif", shape: "sharp" },
    headline: "Work that looks the way it should and lands when it should.",
    tagline: "A small studio for photography, film and design, with clear briefs, fixed dates and no surprises. {audience}",
    purpose: "{brand} is a creative studio{place} for photography, film and design work.",
    audienceWants: ["A portfolio that matches the style they want", "A fixed date and a fixed price", "Files delivered in the formats they need"],
    cta: { primary: "Start a project", secondary: "See the work" },
    services: [
      { title: "Photography", body: "Products, people, places and events, shot to a brief and delivered edited." },
      { title: "Film and video", body: "Short films, reels and brand videos, from script to final cut." },
      { title: "Design", body: "Identity, print and digital design that holds together across everything you publish." },
      { title: "Retainers", body: "A monthly allocation of shoots and design for brands that publish regularly." },
    ],
    reasons: [
      { title: "A written brief", body: "Every project starts with a one-page brief we both sign off." },
      { title: "Dates you can plan around", body: "Shoot, first cut and final delivery dates fixed before work starts." },
      { title: "Files you can use", body: "Delivered in the sizes and formats for every channel you named." },
    ],
    steps: [
      { title: "Brief", body: "What it is for, where it will be seen, and the date it is needed." },
      { title: "Make", body: "Shoot or design, with a first look for your comments." },
      { title: "Deliver", body: "Final files, organised and named, with usage rights stated." },
    ],
    faq: [
      { title: "How far ahead should I book?", body: "State your usual lead time for shoots and design projects." },
      { title: "Who owns the files?", body: "Explain your usage rights plainly." },
      { title: "Can you travel?", body: "Say where you work and how travel is charged." },
    ],
    tiers: [
      { name: "Single shoot or piece", body: "One project.", points: ["Written brief", "Fixed delivery date", "Edited files"] },
      { name: "Campaign", body: "Several pieces, one story.", points: ["Shoot plus design", "Formats for every channel", "Two rounds of changes"] },
      { name: "Retainer", body: "Ongoing work.", points: ["Monthly allocation", "Priority dates", "One point of contact"] },
    ],
    pricingIntro: "Project prices depend on scope and are quoted per brief; none are shown here.",
    contactPoints: ["Email to be added", "Studio location to be added", "Working hours to be added"],
    strip: ["Photography", "Film", "Design", "Fixed dates", "Clear briefs"],
  },

  professional: {
    id: "professional",
    label: "a professional practice",
    hero: "split",
    mark: "shield",
    cursor: "arrow",
    motion: "steady",
    texture: "none",
    defaults: { palette: "navy", type: "serif", shape: "sharp" },
    headline: "Advice you can act on, in plain language.",
    tagline: "A practice that explains the options, states the fee first and keeps you informed at every step. {audience}",
    purpose: "{brand} is a professional practice{place} advising clients with clear scopes and fees agreed in advance.",
    audienceWants: ["A clear answer to what they should do", "A fee agreed before work starts", "Updates without having to chase"],
    cta: { primary: "Book a consultation", secondary: "Areas of practice" },
    services: [
      { title: "Advisory", body: "Consultations that end with a written note of the options and a recommendation." },
      { title: "Compliance and filings", body: "Routine filings and deadlines handled on a calendar you can see." },
      { title: "Representation", body: "Acting for you with authorities, counterparties or in proceedings." },
      { title: "Retained support", body: "A monthly arrangement for businesses that need advice on call." },
    ],
    reasons: [
      { title: "Fee first", body: "Scope and fee are agreed in writing before any work begins." },
      { title: "Plain language", body: "Advice written so you can act on it without a dictionary." },
      { title: "Deadlines kept", body: "A shared calendar of filings and dates, with reminders." },
    ],
    steps: [
      { title: "Consultation", body: "Your situation, the options and what each involves." },
      { title: "Engagement", body: "A written scope, fee and timeline." },
      { title: "Delivery", body: "Work done, filings made, and a summary you can keep." },
    ],
    faq: [
      { title: "What do you charge?", body: "Explain how you charge: fixed fee, hourly or retainer, and when payment is due." },
      { title: "Which matters do you handle?", body: "List your practice areas and what you refer elsewhere." },
      { title: "How do you keep me updated?", body: "State how and how often clients hear from you." },
    ],
    tiers: [
      { name: "Consultation", body: "A first meeting.", points: ["Fixed consultation fee", "Written note of options", "No obligation"] },
      { name: "Fixed-scope matter", body: "One piece of work.", points: ["Scope and fee in writing", "Timeline agreed", "Summary at the end"] },
      { name: "Retainer", body: "Advice on call.", points: ["Monthly arrangement", "Priority response", "Calendar of deadlines"] },
    ],
    pricingIntro: "Fees depend on the matter and are agreed in writing before work starts; none are shown here.",
    contactPoints: ["Office phone and email to be added", "Office address to be added", "Office hours to be added"],
    strip: ["Advisory", "Compliance", "Representation", "Fee first", "Plain language"],
  },

  tech: {
    id: "tech",
    label: "a software business",
    hero: "poster",
    mark: "grid",
    cursor: "plus",
    motion: "snappy",
    texture: "grid",
    defaults: { palette: "navy", type: "mono", shape: "regular" },
    headline: "Software that does the one job you hired it for.",
    tagline: "Built with you, shipped in small releases, and supported after launch. {audience}",
    purpose: "{brand} builds software{place} for teams that need a specific job done well.",
    audienceWants: ["Something working in weeks, not quarters", "Clear scope, clear cost, clear ownership of the code", "Support after launch"],
    cta: { primary: "Talk about a project", secondary: "How we work" },
    services: [
      { title: "Product development", body: "Web and mobile applications from first screen to launch, in short releases you can test." },
      { title: "Integrations and automation", body: "Connecting the systems you already use and removing manual work." },
      { title: "Support and maintenance", body: "Monitoring, fixes and small improvements after launch, on a monthly arrangement." },
      { title: "Advisory", body: "Architecture, build-or-buy and roadmap decisions, written up so your team can act." },
    ],
    reasons: [
      { title: "Small releases", body: "Something usable every couple of weeks, so the direction can change early." },
      { title: "You own the code", body: "Source, infrastructure and accounts in your name from day one." },
      { title: "Supported after launch", body: "Launch is the start of the arrangement, not the end." },
    ],
    steps: [
      { title: "Scope", body: "The job to be done, the users, and what success looks like." },
      { title: "Build", body: "Short releases with demos and a shared backlog." },
      { title: "Launch and support", body: "Hand-over, documentation and a support arrangement." },
    ],
    faq: [
      { title: "What stack do you use?", body: "List the technologies you work in and why." },
      { title: "How do you price projects?", body: "Explain fixed scope versus time and materials, and what each suits." },
      { title: "Who owns the result?", body: "State plainly that the client owns code, data and accounts." },
    ],
    tiers: [
      { name: "Discovery", body: "A short scoping engagement.", points: ["Written scope and estimate", "Risks named", "Fixed fee"] },
      { name: "Build", body: "The project itself.", points: ["Fortnightly releases", "Shared backlog", "You own the code"] },
      { name: "Support", body: "After launch.", points: ["Monitoring and fixes", "Monthly improvements", "Response times agreed"] },
    ],
    pricingIntro: "Project prices depend on scope and are set after discovery; none are shown here.",
    contactPoints: ["Email to be added", "Location or time zone to be added", "Working hours to be added"],
    strip: ["Web", "Mobile", "Integrations", "Small releases", "You own the code"],
  },

  trades: {
    id: "trades",
    label: "a trades and services business",
    hero: "split",
    mark: "hex",
    cursor: "arrow",
    motion: "steady",
    texture: "dots",
    defaults: { palette: "earth", type: "sans", shape: "regular" },
    headline: "Turn up on time, do the job properly, leave it clean.",
    tagline: "Quotes in writing, work done right the first time, and a number that still answers afterwards. {audience}",
    purpose: "{brand} provides trade and repair services{place} for homes and businesses.",
    audienceWants: ["Someone who turns up when they said they would", "A price before the work starts", "Work that lasts, with a warranty"],
    cta: { primary: "Get a quote", secondary: "What we do" },
    services: [
      { title: "Repairs", body: "Fault finding and repairs, with the problem explained before anything is replaced." },
      { title: "Installations", body: "New fittings and systems installed to standard and tested in front of you." },
      { title: "Maintenance", body: "Scheduled checks that catch problems before they become emergencies." },
      { title: "Emergency call-outs", body: "State your hours and response time for urgent jobs." },
    ],
    reasons: [
      { title: "Quote first", body: "A written price before work starts, and a call before anything changes." },
      { title: "Qualified and insured", body: "State your licences, qualifications and insurance here." },
      { title: "Clean finish", body: "Work area tidied, old parts removed, and a walk-through at the end." },
    ],
    steps: [
      { title: "Describe the job", body: "A message with photos, or a site visit for larger work." },
      { title: "Written quote", body: "Price, materials and date, agreed before we start." },
      { title: "Job done", body: "Completed, tested and tidied, with the warranty in writing." },
    ],
    faq: [
      { title: "Which areas do you cover?", body: "List the towns or neighbourhoods you serve." },
      { title: "Do you charge for a visit?", body: "State your call-out policy plainly." },
      { title: "Is the work guaranteed?", body: "Describe the warranty you give on labour and parts." },
    ],
    tiers: [
      { name: "Call-out and repair", body: "Single jobs.", points: ["Written quote", "Fixed appointment", "Warranty on work"] },
      { name: "Installation", body: "New fittings or systems.", points: ["Site visit first", "Materials listed", "Tested and signed off"] },
      { name: "Maintenance plan", body: "Scheduled care.", points: ["Regular visits", "Priority response", "Discounted repairs"] },
    ],
    pricingIntro: "Every job is quoted individually, so no prices are shown here. Send photos or book a visit for a written quote.",
    contactPoints: ["Phone or WhatsApp to be added", "Service area to be added", "Working hours and emergency hours to be added"],
    strip: ["Repairs", "Installations", "Maintenance", "Written quotes", "Guaranteed"],
  },

  general: {
    id: "general",
    label: "a business",
    hero: "split",
    mark: "ring",
    cursor: "arrow",
    motion: "calm",
    texture: "none",
    defaults: { palette: "navy", type: "sans", shape: "regular" },
    headline: "Good work, clearly priced, done when promised.",
    tagline: "Say what you need and we will come back with a plan and a price. {audience}",
    purpose: "{brand} does work that is agreed in writing{place} and delivered as promised.",
    audienceWants: ["A clear answer to what it will cost and how long it will take", "Someone accountable from start to finish", "Work that does not need redoing"],
    cta: { primary: "Get in touch", secondary: "Our story" },
    services: [
      { title: "Core service", body: "Describe the main thing you do and the outcome a customer gets." },
      { title: "Second service", body: "A complementary offer, or the next step customers usually take." },
      { title: "Support", body: "How you look after customers after the work is done." },
      { title: "Something bespoke", body: "If it is not listed, ask. Most good work starts as a conversation." },
    ],
    reasons: [
      { title: "Clear from the start", body: "Scope, timing and price agreed in writing before anything begins." },
      { title: "One point of contact", body: "The same person from the first message to the hand-over." },
      { title: "Done as promised", body: "The work lands as agreed, and we say so early if anything changes." },
    ],
    steps: [
      { title: "Say hello", body: "Send a message with what you need and when you need it." },
      { title: "Agree the plan", body: "We confirm scope, timing and price in writing before anything starts." },
      { title: "Get it done", body: "The work lands as agreed, with a clear hand-over at the end." },
    ],
    faq: [
      { title: "How do we start?", body: "Use the contact page. Every message gets a reply with a suggested next step." },
      { title: "What does it cost?", body: "Prices are not published yet. Every quote is confirmed in writing before work starts." },
      { title: "Where do you work?", body: "Add your locations or service area here." },
    ],
    tiers: [
      conversation,
      { name: "Standard", body: "For most customers.", points: ["Everything in Starter", "Regular check-ins", "Two rounds of changes"] },
      { name: "Premium", body: "For bigger needs.", points: ["Everything in Standard", "Priority scheduling", "Dedicated point of contact"] },
    ],
    pricingIntro: "Figures are not filled in yet, so none are shown. Each tier is a conversation starter, not a contract.",
    contactPoints: ["Email address to be added", "Location or service area to be added", "Opening hours to be added"],
    strip: ["Clear scope", "Written price", "One contact", "On time"],
  },
};
