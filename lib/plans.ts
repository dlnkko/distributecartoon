export type PlanId = "starter" | "creator" | "pro" | "scale" | "agency";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  seconds: number;
  blurb: string;
  featured?: boolean;
  whopPlanId: string;
  purchaseUrl: string;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 9.99,
    seconds: 30,
    blurb: "One short.",
    whopPlanId: "plan_KKXCx3ri7pjPZ",
    purchaseUrl: "https://whop.com/checkout/plan_KKXCx3ri7pjPZ",
  },
  {
    id: "creator",
    name: "Creator",
    price: 24.99,
    seconds: 75,
    blurb: "A longer cut.",
    whopPlanId: "plan_Mx4rVKLIM1U9x",
    purchaseUrl: "https://whop.com/checkout/plan_Mx4rVKLIM1U9x",
  },
  {
    id: "pro",
    name: "Pro",
    price: 49.99,
    seconds: 150,
    blurb: "The pack most people start with.",
    featured: true,
    whopPlanId: "plan_ARTf717M6AxJI",
    purchaseUrl: "https://whop.com/checkout/plan_ARTf717M6AxJI",
  },
  {
    id: "scale",
    name: "Scale",
    price: 99.99,
    seconds: 330,
    blurb: "Several films in one buy.",
    whopPlanId: "plan_sKWYcUbElb2Y9",
    purchaseUrl: "https://whop.com/checkout/plan_sKWYcUbElb2Y9",
  },
  {
    id: "agency",
    name: "Agency",
    price: 199.99,
    seconds: 720,
    blurb: "A full batch of runtime.",
    whopPlanId: "plan_K4ONYZwAMa4r2",
    purchaseUrl: "https://whop.com/checkout/plan_K4ONYZwAMa4r2",
  },
];

export function planById(id: string) {
  return PLANS.find((plan) => plan.id === id);
}

export function planWhopId(plan: Plan) {
  return process.env[`WHOP_PLAN_${plan.id.toUpperCase()}`] || plan.whopPlanId;
}
