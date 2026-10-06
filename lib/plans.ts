export type PlanKind = "monthly" | "topup" | "intro" | "dfy" | "legacy";

export type Plan = {
  id: string;
  name: string;
  price: number;
  seconds: number;
  perCredit: string;
  blurb: string;
  kind: PlanKind;
  badge?: string;
  featured?: boolean;
  whopPlanId: string;
  purchaseUrl: string;
};

export const MONTHLY_PLANS: Plan[] = [
  {
    id: "m40",
    name: "40 credits",
    price: 19.99,
    seconds: 40,
    perCredit: "$0.50",
    blurb: "40 credits every month.",
    kind: "monthly",
    whopPlanId: "plan_EKFdat5GjBHr1",
    purchaseUrl: "https://whop.com/checkout/plan_EKFdat5GjBHr1",
  },
  {
    id: "m100",
    name: "100 credits",
    price: 39.99,
    seconds: 100,
    perCredit: "$0.40",
    blurb: "100 credits every month.",
    kind: "monthly",
    whopPlanId: "plan_CSvwHemGs4R3i",
    purchaseUrl: "https://whop.com/checkout/plan_CSvwHemGs4R3i",
  },
  {
    id: "m250",
    name: "250 credits",
    price: 89.99,
    seconds: 250,
    perCredit: "$0.36",
    blurb: "250 credits every month.",
    kind: "monthly",
    whopPlanId: "plan_wvPXrdnRfEpEX",
    purchaseUrl: "https://whop.com/checkout/plan_wvPXrdnRfEpEX",
  },
  {
    id: "m500",
    name: "Max",
    price: 159.99,
    seconds: 500,
    perCredit: "$0.32",
    blurb: "500 credits every month.",
    kind: "monthly",
    badge: "Max",
    whopPlanId: "plan_qDxt9ghYH8sT3",
    purchaseUrl: "https://whop.com/checkout/plan_qDxt9ghYH8sT3",
  },
  {
    id: "m2000",
    name: "Ultra",
    price: 549.99,
    seconds: 2000,
    perCredit: "$0.275",
    blurb: "2,000 credits every month.",
    kind: "monthly",
    badge: "Ultra",
    featured: true,
    whopPlanId: "plan_OLNBZwF60jQC8",
    purchaseUrl: "https://whop.com/checkout/plan_OLNBZwF60jQC8",
  },
];

export const LEAD_PLANS = MONTHLY_PLANS.slice(0, 2);
export const SLIDER_PLANS = MONTHLY_PLANS.slice(2);

export const TOPUP_PLANS: Plan[] = [
  { id: "top25", name: "25 credits", price: 17.99, seconds: 25, perCredit: "$0.72", blurb: "25 credits, once.", kind: "topup", whopPlanId: "plan_1KiWmXRec8BJL", purchaseUrl: "https://whop.com/checkout/plan_1KiWmXRec8BJL" },
  { id: "top50", name: "50 credits", price: 32.99, seconds: 50, perCredit: "$0.66", blurb: "50 credits, once.", kind: "topup", whopPlanId: "plan_12X6dO3SCOw7v", purchaseUrl: "https://whop.com/checkout/plan_12X6dO3SCOw7v" },
  { id: "top100", name: "100 credits", price: 59.99, seconds: 100, perCredit: "$0.60", blurb: "100 credits, once.", kind: "topup", whopPlanId: "plan_mz45tC7Fl4Hpp", purchaseUrl: "https://whop.com/checkout/plan_mz45tC7Fl4Hpp" },
  { id: "top250", name: "250 credits", price: 129.99, seconds: 250, perCredit: "$0.52", blurb: "250 credits, once.", kind: "topup", whopPlanId: "plan_cRSstwMv64NPZ", purchaseUrl: "https://whop.com/checkout/plan_cRSstwMv64NPZ" },
  { id: "top500", name: "500 credits", price: 229.99, seconds: 500, perCredit: "$0.46", blurb: "500 credits, once.", kind: "topup", whopPlanId: "plan_MbcSiMCMUymb0", purchaseUrl: "https://whop.com/checkout/plan_MbcSiMCMUymb0" },
  { id: "top1000", name: "1,000 credits", price: 349, seconds: 1000, perCredit: "$0.35", blurb: "1,000 credits, once.", kind: "topup", whopPlanId: "plan_ey1PdG8UGUijd", purchaseUrl: "https://whop.com/checkout/plan_ey1PdG8UGUijd" },
  { id: "top2500", name: "2,500 credits", price: 839, seconds: 2500, perCredit: "$0.34", blurb: "2,500 credits, once.", kind: "topup", whopPlanId: "plan_uMKKY7KIfnawq", purchaseUrl: "https://whop.com/checkout/plan_uMKKY7KIfnawq" },
  { id: "top5000", name: "5,000 credits", price: 1499, seconds: 5000, perCredit: "$0.30", blurb: "5,000 credits, once.", kind: "topup", whopPlanId: "plan_GUGbMNitGOoyc", purchaseUrl: "https://whop.com/checkout/plan_GUGbMNitGOoyc" },
  { id: "top10000", name: "10,000 credits", price: 2899, seconds: 10000, perCredit: "$0.29", blurb: "10,000 credits, once.", kind: "topup", whopPlanId: "plan_XpT9HeO9O3d1J", purchaseUrl: "https://whop.com/checkout/plan_XpT9HeO9O3d1J" },
];

export const TOPUP_STOPS = ["25", "50", "100", "250", "500", "1k", "2.5k", "5k", "10k"];

export const PLANS = MONTHLY_PLANS;

export const INTRO_OFFER: Plan = {
  id: "intro",
  name: "Try it once",
  price: 9.99,
  seconds: 40,
  perCredit: "",
  blurb: "40 credits, about one 40 second animation.",
  kind: "intro",
  whopPlanId: "plan_PqAfAwz5I2Z2m",
  purchaseUrl: "https://whop.com/checkout/plan_PqAfAwz5I2Z2m",
};

export const DFY_PLANS: Plan[] = [
  {
    id: "dfy-studio",
    name: "Studio",
    price: 1999,
    seconds: 0,
    perCredit: "",
    blurb: "30 videos a month. You send the scripts. We adapt them and deliver the animations.",
    kind: "dfy",
    whopPlanId: "plan_eHG1CJDfkoyym",
    purchaseUrl: "https://whop.com/checkout/plan_eHG1CJDfkoyym",
  },
  {
    id: "dfy-partner",
    name: "Partner",
    price: 2999,
    seconds: 0,
    perCredit: "",
    blurb: "50 videos a month. We write from what has worked, build the angles, and run the creative.",
    kind: "dfy",
    featured: true,
    whopPlanId: "plan_4rNKl2t1g0czP",
    purchaseUrl: "https://whop.com/checkout/plan_4rNKl2t1g0czP",
  },
];

const LEGACY_PLANS: Plan[] = [
  { id: "starter", name: "Starter", price: 9.99, seconds: 30, perCredit: "", blurb: "", kind: "legacy", whopPlanId: "plan_KKXCx3ri7pjPZ", purchaseUrl: "https://whop.com/checkout/plan_KKXCx3ri7pjPZ" },
  { id: "creator", name: "Creator", price: 24.99, seconds: 75, perCredit: "", blurb: "", kind: "legacy", whopPlanId: "plan_Mx4rVKLIM1U9x", purchaseUrl: "https://whop.com/checkout/plan_Mx4rVKLIM1U9x" },
  { id: "pro", name: "Pro", price: 49.99, seconds: 150, perCredit: "", blurb: "", kind: "legacy", whopPlanId: "plan_ARTf717M6AxJI", purchaseUrl: "https://whop.com/checkout/plan_ARTf717M6AxJI" },
  { id: "scale", name: "Scale", price: 99.99, seconds: 330, perCredit: "", blurb: "", kind: "legacy", whopPlanId: "plan_sKWYcUbElb2Y9", purchaseUrl: "https://whop.com/checkout/plan_sKWYcUbElb2Y9" },
  { id: "agency", name: "Agency", price: 199.99, seconds: 720, perCredit: "", blurb: "", kind: "legacy", whopPlanId: "plan_K4ONYZwAMa4r2", purchaseUrl: "https://whop.com/checkout/plan_K4ONYZwAMa4r2" },
];

function catalog() {
  return [...MONTHLY_PLANS, ...TOPUP_PLANS, INTRO_OFFER, ...DFY_PLANS, ...LEGACY_PLANS];
}

export function planById(id: string) {
  return catalog().find((plan) => plan.id === id);
}

export function planWhopId(plan: Plan) {
  return process.env[`WHOP_PLAN_${plan.id.toUpperCase().replace(/-/g, "_")}`] || plan.whopPlanId;
}

export function planByWhop(planId: string) {
  return catalog().find((plan) => plan.whopPlanId === planId || planWhopId(plan) === planId);
}

export function formatPlanPrice(price: number) {
  if (Number.isInteger(price)) return `$${price.toLocaleString("en-US")}`;
  return `$${price.toFixed(2)}`;
}

export function memberCanTopUp(status: string | null | undefined) {
  return status === "active" || status === "trialing" || status === "past_due" || status === "canceling";
}
