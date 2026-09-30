# Corpus sources

94 documents in `docs/`, ingest order in `manifest.json` (6 waves). Regenerate with
`python3 corpus/build.py`, check with `python3 corpus/validate.py`.

- **Real public sources (23 docs, `access_group: "public"`, url kept).** Rewritten as short, faithful
  English summaries with the Dutch/French key sentence kept where useful. Figures are copied as found.
- **Fictional internal content (71 docs).** All companies, people, tickets, Slack threads, policies, CAOs
  and emails are invented: Brouwerij Van Dessel, Softwarehuis Delta, Mertens Interieur, Bouwgroep Maes,
  AZ Vlaskouter, Restogroep De Gouden Lepel, Verhaeghe Logistics (with NL and LU entities); staff Jan
  Peeters, Koen Janssens, Sofie Claes, Lotte Wouters, Karim El Amrani, Inge Vermeulen, Emma de Vries,
  Marc Schmit, Tom Vandenberghe, Lien Desmet, Bram Wuyts. Where fictional docs quote real-world figures,
  they reuse the figures from the real docs below.

## How each real source was checked (on 30 Sep 2026)

"Fetched" = page opened and read. "Snippet" = figures taken from web-search result summaries of that
page, not from a full read. Snippet-level docs say so at the end of their text. Dates marked `~` are
approximate (the exact publication day was not verified).

| doc_id | Source | Date | Check | URL |
|---|---|---|---|---|
| be_agoria_pc200_index_2026 | Agoria | 2025-12-22 | fetched | https://www.agoria.be/nl/diensten/expertise/hr-legal-social-dialogue/sectoraal-overleg-en-paritaire-comites/pc-200/pc-200-salarisindexering-van-221-op-1-januari-2026 |
| be_propay_forecast_pc200 | Pro-Pay | 2025-10-14 | fetched | https://www.propay.be/nl/news/indexprognose-januari-2026-pc-200/ |
| be_acerta_pc200_index_2026 | Acerta | ~2025-12-22 | snippet (incl. index formula) | https://www.acerta.be/nl/in-de-pers/loon-van-meer-dan-half-miljoen-bedienden-in-aanvullend-paritair-comite-bedienden-pc-200-stijgt-op-1-januari-met-2-21 |
| be_securex_pc200_index_2026 | Securex | ~2025-12-23 | snippet (title) | https://www.securex.be/nl/lex4you/werkgever/nieuws/index-2026-in-paritair-comite-200-gekend |
| be_sdworx_press_pc200_221 | SD Worx | 2025-12-23 (from URL) | snippet (title) | https://www.sdworx.be/nl-be/over-sd-worx/pers/2025-12-23-op-1-januari-stijgen-de-lonen-van-onder-meer-de-bedienden-met-221 |
| be_orbiss_pc200_221 | Orbiss | ~2025-12-23 | snippet (title) | https://orbiss.be/nieuws/op-1-januari-2026-worden-de-bediendenwedden-apcb-200-met-2-21-geindexeerd |
| be_bbtk_indexeringen_jan2026 | BBTK | ~2026-01-05 | snippet | https://www.bbtk.org/nl/fed/indexeringen-januari-2026 |
| be_pc200_ecocheques | Fedustria / BBTK / ACCG | ~2025-05-20 | snippet (part-time scale only partly reproduced) | https://www.fedustria.be/knowledge-center/pc-200-toekenning-van-ecocheques/ |
| be_pc200_eindejaarspremie | ACLVB and others | ~2025-11-10 | snippet | https://www.aclvb.be/nl/pc-200-loon-en-arbeidsvoorwaarden |
| be_pc124_index_q1_2026 | Accuria | ~2025-12-30 | snippet | https://accuria.be/indexering-pc-124-vanaf-1-januari-2026/ |
| be_pc302_index_2026 | ACV | ~2026-01-02 | snippet | https://www.hetacv.be/docs/default-source/acv-csc-docsitemap/6000-centrales/6330-acv-voeding-en-diensten---sporta-csc-alimentation-et-services---sporta/6430-sectoren-(overzicht-met-links)-secteurs-(aper%C3%A7u-avec-liens)/horeca---pc-302/lonen-horeca.pdf |
| be_sdworx_press_food_horeca_transport | SD Worx | ~2025-11-27 | snippet (PC 140.03 = 2.18%) | https://www.sdworx.be/nl-be/over-sd-worx/pers/lonen-voedingsindustrie-horeca-en-transport-stijgen-januari-met-ruim-2 |
| be_pc111_index_jul2026 | Agoria | ~2026-06-26 | snippet | https://www.agoria.be/nl/diensten/expertise/hr-legal-social-dialogue/sectoraal-overleg-en-paritaire-comites/pc-209/loonindexering-van-281-in-pc-111-en-209 |
| be_flexijobs_2026 | Certifisc and others | ~2026-06-15 | snippet | https://www.certifisc.be/nl/posts/flexi-jobs-de-definitieve-regeling-vanaf-1-juli-2026 |
| be_mealvouchers_2026 | Liantis, Acerta | ~2025-12-18 | snippet | https://www.liantis.be/nl/nieuws/vanaf-1-januari-2026-stijgt-het-maximale-bedrag-van-de-maaltijdcheque-naar-10-euro |
| be_telework_2025 | Securex | ~2025-02-20 | snippet (amount from title) | https://www.securex.be/nl/lex4you/werkgever/nieuws/telewerkvergoeding-stijgt-tot-157,83-euro-vanaf-1-maart-2025 |
| be_telework_2026 | Securex + Salary Solution | ~2026-09-02 | snippet | https://www.securex.be/nl/lex4you/werkgever/nieuws/telewerkvergoeding-stijgt-tot-160,99-euro-vanaf-1-maart-2026 and https://salarysolution.be/nl/actualites/consult/952/thuiswerkvergoeding-het-plafond-stijgt-vanaf-september-2026-naar-164-21-euro |
| be_timecredit_2026 | Acerta, RVA | ~2026-01-08 | snippet | https://www.acerta.be/nl/inspiratie/tijdskrediet-wat-verandert-vanaf-2026 |
| nl_minimumloon_jan2026 | KHN and others | ~2025-11-20 | snippet | https://khn.nl/nieuws/wettelijk-minimumloon-stijgt-per-1-januari-2026 |
| nl_minimumloon_jul2026 | MKB Servicedesk and others | ~2026-06-01 | snippet (14.99 from July 2026) | https://www.mkbservicedesk.nl/nieuws/ondernemersnieuws/dit-wordt-het-minimumloon-vanaf-1-januari-2026-per-uur-en-per-maand |
| nl_30pct_ruling_2026 | Salaris Vanmorgen, Meijburg | 2026-04-01 (from URL) | snippet | https://www.salarisvanmorgen.nl/2026/04/01/expatregeling-in-2026-en-2027-wat-wijzigt-er/ |
| lu_ssm_2026 | pixie.lu and others | ~2026-06-01 | snippet | https://www.pixie.lu/corpus/rh/38-0005/salaire-social-minimum-luxembourg-2026-quels-montants-et-quand-sera-la-prochaine-indexation/ |
| lu_index_june2026 | SD Worx Luxembourg and others | ~2026-05-12 | snippet | https://www.sdworx.lu/fr-lu/blog/conformite-reglementation/indexation-des-salaires-declenchement-imminent-au-1er-juin-2026 |

Before quoting any of these figures outside the demo, re-open the page: snippet-level facts were not
read in full.

## General-knowledge facts in fictional docs

`faq_holiday_pay` (double holiday pay for employees = 92% of monthly salary), `faq_dimona` (Dimona before
the start of work) and `int_nl_faq_vakantiegeld` (NL holiday allowance at least 8%) are written as internal
FAQ pages from general knowledge, not from a fetched source.

## Planted conflicts

`planted_conflicts.json` is the answer key: 17 planted conflicts (4 forecast_vs_final, 6
temporal_supersession, 3 scope_difference incl. the Van Dessel client override, 4 true_contradiction),
each with the doc_ids involved and the expected winner. Decoys that agree with each other: PC 200 2.21%
appears in 5 independent real sources plus internal Slack/newsletter; PC 302 2.189%, telework 164.21 and
the LU June index each appear in both a real and an internal doc.

## Wave 2 additions
- `be_fr_pc200_index_2026`: French-language summary of the PC 200 2.21% figure (same figure as the Dutch releases above). URL points to the SD Worx French press landing page; the exact French release URL was not verified.
- All other wave 7/8 docs (handover note, PRC-EOY-2019, Van Dessel Nederland BV, Teams chat, Dutch team note, injected Slack message, PII ticket) are fictional. The national register number and IBAN in `tkt_2026_0321_vandessel` are fictional test data (the IBAN is the standard documentation example).
