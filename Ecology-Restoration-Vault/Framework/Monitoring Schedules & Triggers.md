---
title: Monitoring Schedules & Triggers
aliases: [Monitoring Schedule, Decision Triggers, Thresholds, Trigger Points]
tags: [framework, monitoring, adaptive-management, triggers]
created: 2026-06-10
status: draft
---

# ⏱️ Monitoring Schedules & Triggers

> [!abstract] In one line
> Decide **what to measure, how often, and what reading prompts action** — *before* you start. Use **tiered trigger points** (escalating concern) rather than a single red-light threshold, so you can respond proportionately before an irreversible limit.

Operationalises the [[Adaptive Management Framework]]; uses methods from the [[Vegetation & Habitat Condition Monitoring|Monitoring]] notes.

---

## Decision triggers / thresholds

**Trigger-based (threshold-based) adaptive management** uses **pre-defined values of monitored variables** that, when reached, **prompt a management intervention** — designed to prevent crossing irreversible ecological (or regulatory) thresholds and to act as early-warning signs of decline.
*Source: [Climate Action Tool — threshold-based adaptive management](https://climateactiontool.org/content/use-threshold-based-adaptive-management-incorporate-ecological-thresholds-guide-coastal).*

Best practice favours **tiered / progressive "management triggers"** — a continuum of trigger points reflecting escalating concern — rather than a single threshold, so managers respond **proportionately** before an irreversible limit is reached.
*Source: [Cook et al., "Decision-Making Triggers in Adaptive Management," Conservation Biology](https://www.researchgate.net/publication/230670397_Decision-Making_Triggers_in_Adaptive_Management).*

> [!tip] A simple traffic-light trigger system
> | Tier | Reading | Response |
> |---|---|---|
> | 🟢 Green | At/above target trajectory | Continue; routine monitoring |
> | 🟡 Amber | Drifting below trajectory / early warning | Investigate; increase monitoring frequency; pre-position resources |
> | 🔴 Red | At the critical threshold | Intervene now (escalate control, change method) |
>
> Set the **amber** trigger deliberately *early* — the whole point is to act before red.

> [!note] On "control charts"
> Statistical process control (control charts) is a general technique sometimes used to detect when a monitored variable departs from expected variation. It is **not** mandated by any specific Australian restoration standard — treat it as an optional analytical aid, not a requirement.

---

## Suggested monitoring cadence

> [!warning] These are starting-point defaults
> Tune frequency to **expected rate of change** and to your **trigger needs**. Event-based monitoring (e.g. around an environmental watering or a control program) is layered *on top of* the routine cadence.

| Indicator | Method | Baseline | Routine cadence | Trigger-linked? |
|---|---|---|---|---|
| Vegetation condition (plots) | [[Vegetation & Habitat Condition Monitoring\|BAM / BioCondition / Habitat Hectares]] | Year 0 | Every 2–3 yrs (annually early on) | Yes — recovery trajectory |
| Photo-points | [[Vegetation & Habitat Condition Monitoring\|Fixed photo-points]] | Year 0 | 12 months – 3 yrs | Visual early warning |
| Riparian condition | [[Riparian & Wetland Condition Tools\|RARC]] / ISC streamside zone | Year 0 | ISC reach scale ~5 yrs; RARC 1–3 yrs | Yes — bank/veg decline |
| Landscape greenness/extent | [[Remote Sensing & Data Standards\|Satellite NDVI]] (Landsat/Sentinel) | Year 0 | Seasonal / annual, continuous archive | Yes — change detection |
| Drone structural/cover survey | [[Remote Sensing & Data Standards\|UAV]] | Year 0 | Annual (or post-event) | Yes |
| Birds | [[Fauna Monitoring Techniques\|2 ha / 20-min survey]] | Year 0 | 2–4× per yr (seasonal), repeated annually | Trend |
| Frogs | [[Fauna Monitoring Techniques\|FrogID / acoustic]] | Year 0 | Seasonal (breeding), annual | Trend |
| Fish / aquatic community | [[Fauna Monitoring Techniques\|eDNA]] | Year 0 | Annual / event (post-watering) | Yes |
| Mammals (native + pest) | [[Fauna Monitoring Techniques\|Camera-trap occupancy]] | Year 0 | Annual standardised array | Yes — pest activity |
| Pest activity index | [[Vertebrate Pest Control\|Spotlight counts / FeralScan / cameras]] | Pre-control | **Bracket every control program** (before & after) + annual | **Yes — knockdown & re-invasion** |
| Weed extent | [[Invasive Weed Management\|Mapping (ground/drone)]] | Year 0 | Annual + post-control follow-up | **Yes — regrowth** |

---

## Worked trigger examples

> [!example] Vertebrate pest (fox)
> **Indicator:** spotlight count index along a fixed transect.
> 🟡 *Amber:* index returns to >50% of pre-control level → schedule the next coordinated bait round.
> 🔴 *Red:* index returns to pre-control level **or** lamb-loss/native-fauna predation observed → immediate integrated control (bait + shoot + den work). → [[Vertebrate Pest Control]]

> [!example] Weed (willow / woody weed)
> **Indicator:** weed cover from annual mapping in a treated reach.
> 🟡 *Amber:* any seedling regrowth detected → targeted follow-up that season (don't wait).
> 🔴 *Red:* cover exceeds 10% of treated area → re-treat reach; review method/timing. → [[Invasive Weed Management]]

> [!example] Vegetation recovery
> **Indicator:** native understorey richness per plot vs SMART target trajectory.
> 🟡 *Amber:* >20% below the expected trajectory at a checkpoint → investigate cause (grazing? weeds? watering?), adjust inputs.
> 🔴 *Red:* no net gain after 2 cycles → reassess reference model & method. → [[Adaptive Management Framework]]

---

## Bracket every control program

For **both** pests and weeds, monitoring should **bracket the intervention** — measure **before and after** so you can quantify knockdown and detect re-invasion early. This is core best practice and the basis for trigger-driven follow-up.
*Source: [PestSmart — Pest animal monitoring techniques](https://pestsmart.org.au/pest-animals/monitor-techniques/).*

---

## See also
- [[Adaptive Management Framework]]
- [[Restoration Planning & Standards (SERA)]]
- [[Field SOP - Annual Restoration Cycle]]
- [[Sources & References]]
