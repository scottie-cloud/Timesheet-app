---
title: Remote Sensing & Data Standards
aliases: [Remote Sensing, Drone, UAV, NDVI, Satellite, TERN, Atlas of Living Australia, BioNet, Data Standards]
tags: [monitoring, remote-sensing, drone, satellite, data-standards]
created: 2026-06-10
status: draft
---

# 🛰️ Remote Sensing & Data Standards

> [!abstract] In one line
> Scale your monitoring with **drones** (structural/cover + thermal fauna), **satellite NDVI** (continuous change detection), standardised **TERN AusPlots**, and store everything to **open data standards** (Darwin Core → Atlas of Living Australia, BioNet) so it's interoperable and durable.

The "broad-scale" multiplier on the ground methods in [[Vegetation & Habitat Condition Monitoring]] and [[Fauna Monitoring Techniques]].

---

## Drone / UAV 🚁

### Vegetation structure & cover
Australian-led **UAV rangeland monitoring** workflows combine improved flight configs, **photogrammetric structural mapping** and **machine learning** to estimate vegetation cover and **above-ground biomass**, and integrate UAV products with **satellite NDVI (Landsat/Sentinel)** for scalable condition and change detection — well suited to broad-scale property restoration tracking.
*Source: [UAV-based remote sensing for rangeland monitoring (an Australian lead), 2026](https://www.sciencedirect.com/science/article/pii/S1574954126000695).*

### Thermal drones for fauna
**Thermal-equipped drones** can detect nocturnal/arboreal fauna (koalas, gliders) with detection rates comparable to ground surveys while covering larger areas; real-time thermal drone imagery has **outperformed spotlighting** for an arboreal forest mammal. Also a key tool for pest detection/control → [[Vertebrate Pest Control]].
*Sources: [Wagner et al. 2025, Ecological Applications](https://esajournals.onlinelibrary.wiley.com/doi/10.1002/eap.70091); [real-time drone thermal vs spotlighting](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7668579/).*

---

## Satellite 🌍
- **NDVI (Landsat / Sentinel)** provides a free, continuous, multi-decade archive for tracking **greenness, vegetation extent and change** over a whole property — ideal as a low-effort trigger layer in [[Monitoring Schedules & Triggers]].
- In the MDB, **The Living Murray** uses **RapidEye** imagery (since ~2008) for woody-vegetation condition at icon sites, plus a Basin-scale **tree water-use** product. → [[Riparian & Wetland Condition Tools]]
*Source: [MDBA Native vegetation](https://www.mdba.gov.au/managing-water/water-for-environment/native-vegetation).*

> [!tip] Free/low-cost starting points
> Sentinel-2 (10 m, ~5-day revisit) and Landsat (30 m, since the 1980s) NDVI are freely accessible (e.g. via Digital Earth Australia). Pair the **long archive** (baseline & trend) with **drone surveys** (fine detail, on-demand).

---

## Standardised plots — TERN AusPlots
**TERN Ecosystem Surveillance (AusPlots)** is Australia's standardised national plot method — **1 ha plots with 1,010 point intercepts** along 10×100 m transects, with soil + vegetation sampling, applied at **700+ sites** and revisited at least once a decade. TERN is adding **modular vertebrate-fauna, woodland and condition-monitoring protocols** (trapping, bird surveys, acoustic/ultrasonic recording) — a directly transferable national standard for broad-scale monitoring.
*Sources: [TERN AusPlots methods paper](https://www.tern.org.au/ausplots-methods-paper/); [TERN ecosystem surveillance](https://www.tern.org.au/tern-observatory/ecosystem-surveillance-and-environmental-monitoring/); [Vertebrate Fauna Module (Zenodo)](https://zenodo.org/records/15172366).*

---

## Open data standards 🗂️
Use shared standards so your data outlives any one project, person or app.

- **Atlas of Living Australia (ALA)** — national open biodiversity infrastructure, **~115 million occurrence records** (~50% citizen-science), built on the **Darwin Core** data standard; hosts **BioCollect** and **iNaturalist Australia**, and **auto-syncs with NSW BioNet** via open API.
- **NSW BioNet** — the NSW repository for species names, sightings, systematic survey and threatened-species data.
*Sources: [Atlas of Living Australia](https://www.ala.org.au/); [ALA history & state](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8081701/); [NSW BioNet Atlas](https://www.environment.nsw.gov.au/topics/animals-and-plants/biodiversity/nsw-bionet/about-bionet-atlas).*

> [!important] Record to Darwin Core from day one
> Capturing observations in **Darwin Core** fields (what, where, when, who, how) and pushing them to **ALA / BioCollect / BioNet** makes your monitoring interoperable, citable, and useful for [[Regulation, Incentives & Markets|biodiversity-market]] reporting. Citizen-science tools (iNaturalist, FrogID, FeralScan) feed the same pipelines.

---

## How remote sensing fits the cadence

> [!tip] Layered monitoring
> - **Continuous / cheap:** satellite NDVI change detection (whole property).
> - **Annual / targeted:** drone structural + thermal surveys; standardised plots.
> - **Ground-truth:** condition plots ([[Vegetation & Habitat Condition Monitoring]]) and fauna methods ([[Fauna Monitoring Techniques]]) calibrate and verify the remote signals.
>
> Remote sensing **flags where to look**; ground methods **confirm what's happening**.

---

## See also
- [[Vegetation & Habitat Condition Monitoring]]
- [[Fauna Monitoring Techniques]]
- [[Riparian & Wetland Condition Tools]]
- [[Monitoring Schedules & Triggers]]
- [[Sources & References]]
