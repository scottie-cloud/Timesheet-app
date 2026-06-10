---
title: Fauna Monitoring Techniques
aliases: [Fauna Monitoring, Camera Traps, eDNA, Bioacoustics, Bird Surveys, FrogID]
tags: [monitoring, fauna, camera-traps, edna, bioacoustics]
created: 2026-06-10
status: draft
---

# 🦘 Fauna Monitoring Techniques

> [!abstract] In one line
> Combine **camera traps** (mammals — occupancy), **eDNA** (fish/frogs/turtles/platypus from water), **bioacoustics** (birds/frogs), and **standard field surveys** (BirdLife 2 ha, FrogID, electrofishing) — feeding everything into open data standards. → [[Remote Sensing & Data Standards]]

Cadence and trigger links in [[Monitoring Schedules & Triggers]]; pest detection overlaps with [[Vertebrate Pest Control]].

---

## Camera trapping 📸
The workhorse for medium–large mammals (native and pest).

- **WildCount** (NSW) is one of Australia's first large-scale, long-term camera programs — **204 sites across 146 NSW reserves**, >1.9 million animal images — analysed as **occupancy** (proportion of sites a species is recorded at) tracked over time.
- Cameras reliably detect large/medium mammals, but **small mammals are hard to ID**, and **abundance/density is rarely feasible** unless individuals are uniquely marked — which is why **occupancy** (not density) is the standard output.
*Source: [NSW WildCount](https://www.environment.nsw.gov.au/topics/animals-and-plants/surveys-monitoring-and-records/native-animal-monitoring).*

> [!tip] Best-practice array design
> Use a **rigorous standardised method** — fixed camera number, spacing, deployment length, orientation, bait/lure — so results are comparable across sites and time. Gather **baseline data on how often target species hit cameras** before committing to a long-term array; "one size doesn't fit all."
> *Sources: [NESP remote camera guide](https://nesplandscapes.edu.au/wp-content/uploads/2015/10/5.2.4_a_guide_to_use_of_remote_cameras_for_wildlife_surveys_final_web.pdf) (note: northern-Australia focus — adapt spacing/bait for temperate/riverine); [threatened marsupial camera study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6912223/).*

---

## Environmental DNA (eDNA) 🧬
A cost-effective, non-invasive **whole-of-community** survey from water — and a standout tool for MDB waterways.

- The **Great Australian Wildlife Search** (MDBA + Odonata Foundation, delivered with EnviroDNA) collected **648 water samples from 324 sites** across inland NSW (spring 2023) and detected **144 species, including 17 threatened** — Murray Cod, silver perch, trout cod, Macquarie perch, flathead galaxias — plus feral fish (carp, redfin, trout).
- eDNA from water can **simultaneously detect fish, frogs, freshwater turtles, waterbirds and platypus**.
- eDNA metabarcoding can be **more sensitive than backpack electrofishing** for fish community composition in small waterways *(context-dependent; eDNA gives no abundance or size structure)*.
- Effective for endangered amphibians — e.g. surveys for the endangered **Booroolong frog** in the northern MDB.
*Sources: [MDBA eDNA media release](https://www.mdba.gov.au/news-and-events/newsroom/joint-media-release-edna-results-reveal-rich-biodiversity-murray-darling); [EnviroDNA](https://www.envirodna.com/resources/news/the-great-australian-wildlife-search-announces-public-release-of-edna-data); [NSW Water — eDNA in MDB](https://water.dpie.nsw.gov.au/news/edna-shows-diverse-wildlife-in-the-murray-darling-basin); [eDNA vs electrofishing](https://www.envirodna.com/news/new-paper-edna-metabarcoding-proves-more-sensitive-than-electrofishing); [Wood et al. 2025, Environmental DNA](https://onlinelibrary.wiley.com/doi/10.1002/edn3.70208).*

> [!note] Standard workflow
> Filter ~1–2 L water (e.g. Sterivex), extract DNA, then **qPCR with species-specific primers** or **metabarcode a short 12S fragment** (MiFish primers). **Pre-filtration choices significantly affect detection.**
> *Source: [PLOS ONE — water pre-filtration for eDNA](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0250162).*

---

## Bioacoustic / passive acoustic monitoring 🔊
- **AudioMoth** (low-cost open-source logger) + the **BirdNET** classifier can monitor cryptic birds cheaply (>90% precision for some species in a European study — species-specific).
- **Reality check:** in SE Australia, BirdNET and the purpose-built **VicFrogNET** had **inconsistent performance** across 60 waterbodies — outputs need **manual verification and per-species thresholds**.
*Sources: [AudioMoth + BirdNET (Sensors/MDPI)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10459908/); [Promise and pitfalls — BirdNET/VicFrogNET, Ecological Informatics 2026](https://www.sciencedirect.com/science/article/pii/S1574954126000506).*

### FrogID 🐸
**FrogID** (Australian Museum citizen-science app, launched Nov 2017) records calling frogs that are **expert-validated**; the first-year dataset held **54,864 records of 172 species** (71% of Australia's frog species), and the project has since passed **one million validated records** — a ready-made, low-cost frog-monitoring method.
*Sources: [FrogID dataset paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7040047/); [FrogID Dataset 6.0](https://australian.museum/blog/amri-news/frogid-dataset-6/).*

---

## Standard field surveys
- **Birds — BirdLife "gold standard" 2 ha / 20-minute search:** record all birds seen/heard within a defined 2 ha area (recommended 100 m × 200 m) over exactly 20 minutes; best in open habitats; underpins repeatable trend data. Feeds **Birdata** (now syncs with eBird).
*Source: [BirdLife/Birdata survey techniques](https://birdata.birdlife.org.au/survey-techniques); [2 ha fact sheet](https://mucklefordforest.wordpress.com/wp-content/uploads/2017/06/two-hectare-search-fact-sheet-june-2017.pdf).*
- **Small mammals/reptiles — Elliott & pitfall trapping:** Elliott traps in lines ~5 m apart (insulate in cold, shade in heat); pitfall traps with drift fences (shade cloth + wet sponges to prevent desiccation). **Both require ethics approval and permits.**
*Sources: [Vic Small Mammal Elliott Trapping](https://www.vic.gov.au/sites/default/files/2023-10/Small-Mammal-Elliott-Trapping.pdf); [Fed Uni wildlife capture guidelines](https://federation.edu.au/__data/assets/pdf_file/0004/276061/Fed-Uni-General-Guidelines-for-Wildlife-Capture-and-Handling-V-2015.pdf); [DCCEEW reptile survey guidelines](https://www.dcceew.gov.au/sites/default/files/documents/survey-guidelines-reptiles.doc).*

---

## Choosing a fauna stack for a riverine property

> [!tip] Suggested combination
> | Group | Primary method | Add-on |
> |---|---|---|
> | Mammals (native + pest) | Standardised **camera-trap** array (occupancy) | Spotlighting; thermal drone → [[Remote Sensing & Data Standards]] |
> | Fish / aquatic community | **eDNA** (annual + post-watering) | Electrofishing for size structure |
> | Frogs | **FrogID** + acoustic loggers | Breeding-season call surveys |
> | Birds | **2 ha / 20-min** repeated surveys | Acoustic loggers (verify with BirdNET) |
> | Reptiles/small mammals | Elliott + pitfall (permitted) | Cameras |
>
> Log everything to open standards → [[Remote Sensing & Data Standards]].

> [!warning] AI ID needs verification
> Machine-learning classifiers (BirdNET, VicFrogNET) are powerful but **inconsistent** in Australian settings — always keep a **manual-verification** step and species-specific confidence thresholds.

---

## See also
- [[Remote Sensing & Data Standards]]
- [[Vertebrate Pest Control]]
- [[Monitoring Schedules & Triggers]]
- [[Sources & References]]
