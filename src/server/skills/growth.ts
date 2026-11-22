import { z } from "zod";
import type { Skill } from "./types";
import { businessFromGoal } from "./social";
import { detectArchetype } from "./site/archetype";

/**
 * Growth missions for a local business that wants more sales: a shop in a
 * small town that sells appliances, a trader, a tutor. The promo plan is a
 * four-week programme built from what the owner told us, with the messages
 * written out so they can be copied into WhatsApp today. Nothing is sent and
 * no figures are invented; every number in the plan is one the owner fills in.
 */

const anyRecord = z.record(z.string(), z.unknown());

export type PromoLever = { title: string; why: string; actions: string[] };

type Family = {
  offers: string[];
  festivalHook: string;
  broadcastIdeas: string[];
  reviewAsk: string;
  partner: string;
};

const FAMILIES: Record<string, Family> = {
  electronics: {
    offers: ["Exchange offer on old appliances", "Installation and demo included", "Extended warranty on this week's purchase", "Bundle: buy a fridge or TV, get a kitchen appliance at a set price"],
    festivalHook: "Festivals and wedding season are when families upgrade appliances; plan the biggest offer around the next one.",
    broadcastIdeas: ["New stock arrived", "Exchange offer this week", "Price drop on a named model", "Service camp day: free check-up for old appliances"],
    reviewAsk: "After every installation, ask for a Google review while the team is still in the house.",
    partner: "Electricians, interior decorators and builders who are in homes before an appliance is bought.",
  },
  grains: {
    offers: ["Weekly rate list on WhatsApp", "Free delivery above a minimum order", "First-order sample bag", "Monthly contract rate for canteens and caterers"],
    festivalHook: "Festival and wedding seasons move staples in bulk; confirm supply with caterers and institutions a month ahead.",
    broadcastIdeas: ["This week's rates", "Fresh lot arrived", "Festival bulk offer for caterers", "Reminder on your usual restock day"],
    reviewAsk: "Ask regular shop customers to recommend you to one neighbouring shop; offer a small discount on their next order.",
    partner: "Caterers, tiffin services, hostels and kirana associations.",
  },
  education: {
    offers: ["Free first lesson or assessment", "Sibling or referral discount", "Exam-season crash course", "Monthly progress report for parents"],
    festivalHook: "Admissions, exam dates and results days decide when parents look; schedule the push two weeks before each.",
    broadcastIdeas: ["New batch starting on a date", "Results of past students (with permission)", "A free doubt-clearing session", "Exam tips, one a day for a week"],
    reviewAsk: "After results, ask parents for a short review or a one-line testimonial with permission to use their first name.",
    partner: "Schools, stationery shops and parents' groups in the area.",
  },
  food: {
    offers: ["A combo or family pack", "Weekday lunch deal", "Free delivery above a minimum order", "Loyalty card: every tenth order free"],
    festivalHook: "Festivals, cricket matches and weekends drive orders; announce specials two days ahead.",
    broadcastIdeas: ["Today's special", "New item on the menu", "Weekend family pack", "Catering for festivals and functions"],
    reviewAsk: "Ask for a Google review with the bill, and reply to every review within a day.",
    partner: "Offices, hostels and event planners nearby.",
  },
  beauty: {
    offers: ["Introductory price on a signature service", "Bridal package with a free trial", "Refer a friend, both get a discount", "Monthly membership"],
    festivalHook: "Wedding and festival seasons book out early; open bookings and packages a month ahead.",
    broadcastIdeas: ["Slots open this weekend", "New service launched", "Festival package", "Before and after (with permission)"],
    reviewAsk: "Ask for a review before the client leaves the chair, when the result is fresh.",
    partner: "Boutiques, photographers and wedding planners.",
  },
  health: {
    offers: ["Health check-up camp", "Family package", "Follow-up reminders by WhatsApp", "Senior citizen or student discount on consultations"],
    festivalHook: "Seasonal illnesses and school vaccination drives are predictable; plan camps around them.",
    broadcastIdeas: ["Camp announcement", "Seasonal health advice", "New service or specialist visiting", "Reminder for follow-ups"],
    reviewAsk: "Ask satisfied patients for a Google review at the follow-up visit.",
    partner: "Schools, housing societies and local employers.",
  },
  fitness: {
    offers: ["Free trial week", "Bring a friend month", "Quarterly membership at a lower monthly rate", "Transformation challenge with a start and end date"],
    festivalHook: "New year, post-festival and summer are when people start; open offers two weeks before each.",
    broadcastIdeas: ["Trial week open", "Member result of the month (with permission)", "New class on the timetable", "Challenge starting on a date"],
    reviewAsk: "Ask members to post a check-in and tag the gym; thank each one.",
    partner: "Offices, sports clubs and nutrition stores.",
  },
  general: {
    offers: ["An introductory offer for first-time customers", "Refer a friend, both get something", "A bundle of your two most-bought items or services", "A loyalty reward for repeat customers"],
    festivalHook: "Pick the next festival or season that matters to your customers and build the biggest offer around it.",
    broadcastIdeas: ["New arrival or new service", "This week's offer", "A customer story (with permission)", "A reminder to regulars who have not visited in a while"],
    reviewAsk: "Ask every happy customer for a Google review while they are still with you.",
    partner: "Businesses that serve the same customers just before they need you.",
  },
};

function familyFor(archetypeId: string): Family {
  return FAMILIES[archetypeId] ?? FAMILIES.general!;
}

export function composePromoPlan(goal: string, input: Record<string, unknown>): { markdown: string; business: string; place: string | null; products: string | null; archetype: string; broadcasts: number } {
  const { business, place, products } = businessFromGoal(goal, input);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const contact = str(input.contact) ?? str(input.whatsapp) ?? null;
  const arch = detectArchetype({ goal, brandName: business, products: products ?? undefined });
  const fam = familyFor(arch.id);
  const what = products ?? "what you sell";
  const where = place ? ` in ${place}` : "";
  const reach = contact ? ` Reply here or call ${contact}.` : " Reply here to book or ask.";

  const broadcasts = [
    { name: "Week 1: wake up past customers", text: `Namaste from ${business}${where}. We have new ${what} in stock and an offer for our regular customers this week. ${fam.offers[0]}.${reach}` },
    { name: "Week 2: the main offer", text: `${business}: ${fam.offers[1]} on ${what}, this week only${where}. Visit the shop or send us a message and we will hold it for you.${reach}` },
    { name: "Week 3: referral", text: `Know someone looking for ${what}? Send them to ${business}${where}. ${fam.offers[2]} for you and for them.${reach}` },
    { name: "Week 4: thank you and a reason to return", text: `Thank you for shopping with ${business} this month. ${fam.offers[3]}. Save this number for service, questions and next time.${reach}` },
  ];

  const levers: PromoLever[] = [
    {
      title: "More people walking in or calling",
      why: "New customers mostly come from search, from passing by and from someone they trust. All three can be worked this month.",
      actions: [
        "Claim and complete the Google Business Profile: hours, phone, photos of the shop and of " + what + ", and a post every week.",
        "Shoot the week of reels in this mission and post one every day; put the WhatsApp number in the caption.",
        `Partner with ${fam.partner.charAt(0).toLowerCase()}${fam.partner.slice(1)}`,
      ],
    },
    {
      title: "A bigger sale when they do come",
      why: "The cheapest revenue is the extra item or the better model sold to someone already in front of you.",
      actions: [`Offer: ${fam.offers[3]}.`, "Train everyone on the floor to show two options, not one.", "Keep a printed card of this month's offers at the counter and on the WhatsApp status."],
    },
    {
      title: "Customers who come back",
      why: "Repeat customers cost nothing to acquire. A WhatsApp broadcast list is the simplest retention tool a small shop has.",
      actions: ["Add every customer's number to a WhatsApp broadcast list with their permission, one list per product interest.", "Send one broadcast a week from the drafts below, never more.", fam.reviewAsk],
    },
  ];

  const markdown = [
    `# Four-week sales plan: ${business}${place ? ` (${place})` : ""}`,
    "",
    `Built for ${arch.label} from what you told us. Fill in the numbers; nothing here is sent or posted by Decupo.`,
    "",
    "## Where the extra revenue comes from",
    "",
    ...levers.flatMap((l) => [`### ${l.title}`, "", l.why, "", ...l.actions.map((a) => `- ${a}`), ""]),
    "## The month, week by week",
    "",
    "| Week | Focus | Do this | Measure |",
    "|---|---|---|---|",
    "| 1 | Be findable | Google Business Profile complete, broadcast list started, first reels posted | Profile views, calls from Google, list size |",
    `| 2 | The main offer | ${fam.offers[1]}; announce on WhatsApp status, reels and the shop board | Enquiries and sales on the offer |`,
    "| 3 | Referrals | Referral offer to the broadcast list; ask every buyer to tell one person | Referred customers |",
    "| 4 | Repeat and review | Thank-you broadcast, review requests, plan next month from the numbers | Reviews, repeat visits, average bill |",
    "",
    `> ${fam.festivalHook}`,
    "",
    "## WhatsApp broadcasts, one per week",
    "",
    "Written in English. Translate or adjust before sending; the numbers and offers are placeholders until you confirm them.",
    "",
    ...broadcasts.flatMap((b) => [`### ${b.name}`, "", "```", b.text, "```", ""]),
    "## Google Business Profile post",
    "",
    "```",
    `${business}${where}: ${what} with ${(fam.offers[1] ?? "an offer").toLowerCase()} this week. Visit us or message on WhatsApp${contact ? ` at ${contact}` : ""}.`,
    "```",
    "",
    "## Numbers to write down every Saturday",
    "",
    "| Number | Week 1 | Week 2 | Week 3 | Week 4 |",
    "|---|---|---|---|---|",
    "| Walk-ins and calls | | | | |",
    "| Enquiries from WhatsApp or Google | | | | |",
    "| Sales (count) | | | | |",
    "| Average bill | | | | |",
    "| Broadcast list size | | | | |",
    "| Google reviews | | | | |",
    "",
    "Compare week 4 with week 1. Whatever moved the most is next month's plan.",
    "",
  ].join("\n");

  return { markdown, business, place, products, archetype: arch.id, broadcasts: broadcasts.length };
}

export const promoPlan: Skill = {
  manifest: {
    id: "promo-plan",
    version: "0.1.0",
    name: "Four-week sales plan",
    description:
      "A month-long plan to bring more customers into a local business: offers, a week-by-week calendar, WhatsApp broadcast drafts, a Google Business post and the numbers to track. Built from your answers; nothing is sent.",
    agent: "Echo",
    actionClass: "draft",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 50, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const plan = composePromoPlan(ctx.goal, ctx.input);
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Four-week sales plan", content: plan.markdown });
    return {
      status: "succeeded",
      output: { artifactId: a.id, business: plan.business, place: plan.place, products: plan.products, archetype: plan.archetype, broadcasts: plan.broadcasts, sent: 0 },
      summary: `Four-week sales plan for ${plan.business}: 3 levers, ${plan.broadcasts} WhatsApp broadcasts drafted. Nothing sent.`,
    };
  },
};

export const GROWTH_SKILLS: Skill[] = [promoPlan];
