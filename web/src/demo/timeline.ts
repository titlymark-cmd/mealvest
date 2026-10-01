import type { ComponentType } from "react";
import { LogoBloomScene, HeadlineScene, WalletScene } from "./scenes/scenesIntro";
import { OrderScene, RulesScene, PaymentScene } from "./scenes/scenesFlow";
import { RolesScene, BloomTransitionScene, RedeemScene, RecordScene } from "./scenes/scenesBackOffice";
import { StaffScene, SavingsScene, ParticleScene, EndScene } from "./scenes/scenesFinale";

/**
 * THE TIMELINE — edit durations (seconds) and copy here.
 *
 * `card` is the copy used by the reduced-motion static cards; the
 * animated scenes keep their own on-screen copy next to their layout
 * in ./scenes/*.tsx (search for the quoted strings to tweak them).
 * Total length = sum of `duration` (84s).
 */
export interface SceneDef {
  id: string;
  /** seconds */
  duration: number;
  component: ComponentType;
  card: { title: string; accent?: string; caption?: string };
}

export const SCENES: SceneDef[] = [
  { id: "logo", duration: 3, component: LogoBloomScene, card: { title: "MealVest" } },
  { id: "headline", duration: 5, component: HeadlineScene, card: { title: "Campus meals, sorted", accent: "sorted" } },
  { id: "wallet", duration: 6, component: WalletScene, card: { title: "Every shilling, in view", accent: "in view", caption: "Balance · Daily allowance · Meals left" } },
  { id: "order", duration: 10, component: OrderScene, card: { title: "Order in seconds", accent: "seconds", caption: "Pay with M-Pesa" } },
  { id: "rules", duration: 7, component: RulesScene, card: { title: "Set the budget once", accent: "budget", caption: "Auto rollover" } },
  { id: "payment", duration: 11, component: PaymentScene, card: { title: "Paid", caption: "Meal pass" } },
  { id: "roles", duration: 5, component: RolesScene, card: { title: "4 roles", caption: "Student · Hotel Staff · Hotel Owner · Admin" } },
  { id: "bloom", duration: 3, component: BloomTransitionScene, card: { title: "MealVest" } },
  { id: "redeem", duration: 8, component: RedeemScene, card: { title: "Redeem in seconds", accent: "seconds", caption: "Ready → Redeemed" } },
  { id: "record", duration: 7, component: RecordScene, card: { title: "Every meal on record", accent: "record", caption: "Ordered · Paid · Redeemed" } },
  { id: "staff", duration: 6, component: StaffScene, card: { title: "Right people, right role", accent: "role", caption: "Add staff" } },
  { id: "savings", duration: 6, component: SavingsScene, card: { title: "Unspent? Keep it", accent: "Keep", caption: "100% yours" } },
  { id: "fed", duration: 3, component: ParticleScene, card: { title: "fed" } },
  { id: "end", duration: 4, component: EndScene, card: { title: "MealVest", caption: "Coming soon" } },
];

export const TOTAL_MS = SCENES.reduce((s, sc) => s + sc.duration * 1000, 0);
