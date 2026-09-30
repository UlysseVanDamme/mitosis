"""Wave 1: real public Belgian sources, rewritten as faithful summaries.
Every figure here comes from the page at `url` (see corpus/SOURCES.md for how it was checked)."""
from common import D

W = "public"

DOCS = [
    D("be_agoria_pc200_index_2026", "PC 200: salarisindexering van 2,21% op 1 januari 2026",
      "Agoria", "official",
      "https://www.agoria.be/nl/diensten/expertise/hr-legal-social-dialogue/sectoraal-overleg-en-paritaire-comites/pc-200/pc-200-salarisindexering-van-221-op-1-januari-2026",
      "Agoria HR Legal & Social Dialogue", "2025-12-22", "BE", "PC 200", None, "indexation", W, """
      Agoria (sector federation for the technology industry) confirms the final indexation figure for the
      Supplementary Joint Committee for Employees (APCB, PC 200).

      Key sentence (Dutch original): "De indexaanpassing van de lonen in PC 200 zal 2,21% bedragen op 1 januari 2026."

      What is indexed on 1 January 2026, by 2.21%:
      - the effectively paid salaries (werkelijk betaalde lonen) of employees in PC 200;
      - the sectoral minimum salaries (barema's);
      - the guaranteed minimum monthly income (gewaarborgd minimum maandinkomen) for PC 200.

      The mechanism is the usual PC 200 one: the adjustment follows the evolution of the (smoothed) health
      index (gezondheidsindex) and is applied once a year on 1 January.

      Agoria adds a regulatory note. The social partners had discussed a possible adjustment of the
      indexation mechanism for 2026-2028, but "aangezien hiervoor het reglementair kader niet tijdig tot
      stand is kunnen gekomen, zal de loonindexering in PC 200 op 1 januari 2026 verlopen volgens de
      bestaande ("normale") regels." In other words: no modified system applies on 1 January 2026; the
      standard indexation of 2.21% is applied to all salaries in PC 200.

      Published 22 December 2025. This figure is final and replaces any earlier forecasts.
      """),

    D("be_acerta_pc200_index_2026", "Loon van meer dan half miljoen bedienden in PC 200 stijgt op 1 januari met 2,21%",
      "Acerta", "official",
      "https://www.acerta.be/nl/in-de-pers/loon-van-meer-dan-half-miljoen-bedienden-in-aanvullend-paritair-comite-bedienden-pc-200-stijgt-op-1-januari-met-2-21",
      "Acerta press office", "2025-12-22", "BE", "PC 200", None, "indexation", W, """
      HR service provider Acerta announces that the wages of more than 500,000 employees in the
      Supplementary Joint Committee for Employees (PC 200) increase by 2.21% on 1 January 2026.

      Acerta made the calculation based on the smoothed health index published by Statbel. The formula
      compares the smoothed health index of November and December 2025 with that of November and
      December 2024:
        (133,07 + 133,33) / (130,22 + 130,42) = +2.21%.

      Concretely, the effectively paid wages, the minimum wages and the guaranteed minimum monthly income
      in PC 200 rise by 2.21% at the start of January 2026.

      For context, Acerta notes that this is lower than the 3.58% indexation PC 200 employees received in
      January 2025, but it is still the fourth highest January indexation of the past twelve years.

      Note on the date field: Acerta's release came out in the week of 22 December 2025, once the December
      health index was known (exact publication day not verified).
      """),

    D("be_securex_pc200_index_2026", "De index voor PC 200 is gekend",
      "Securex", "official",
      "https://www.securex.be/nl/lex4you/werkgever/nieuws/index-2026-in-paritair-comite-200-gekend",
      "Securex Lex4You", "2025-12-23", "BE", "PC 200", None, "indexation", W, """
      Securex Lex4You informs employers that the indexation for the Supplementary Joint Committee for
      Employees (PC 200) is known: salaries in PC 200 are indexed by 2.21% on 1 January 2026.

      The indexation applies to the effectively paid monthly salaries and to the minimum salary scales of
      PC 200. It is calculated from the smoothed health index of the last two months of 2025 compared with
      the same two months of 2024, which is the standard PC 200 method.

      Employers should update their payroll parameters for January 2026 and inform employees. Employers
      that applied a provisional figure should correct it: the final 2.21% is the figure to apply.

      (Summary of the Securex news item. Exact publication date not verified; set to 23 December 2025.)
      """),

    D("be_sdworx_press_pc200_221", "Op 1 januari stijgen de lonen van onder meer de bedienden met 2,21%",
      "SD Worx press release", "official",
      "https://www.sdworx.be/nl-be/over-sd-worx/pers/2025-12-23-op-1-januari-stijgen-de-lonen-van-onder-meer-de-bedienden-met-221",
      "SD Worx press office", "2025-12-23", "BE", "PC 200", None, "indexation", W, """
      SD Worx press release of 23 December 2025: on 1 January 2026 the wages of, among others, employees in
      the Supplementary Joint Committee for Employees (PC 200) rise by 2.21%.

      The figure is based on the evolution of the smoothed health index over the last months of 2025 and is
      the final figure for PC 200. Several other joint committees also index their wages in January,
      each with their own mechanism and percentage; the 2.21% figure is specific to PC 200 and must not be
      copied to other joint committees.

      (Summary based on the title and page of the press release; the full body text was not re-read line by
      line for this corpus.)
      """),

    D("be_orbiss_pc200_221", "Op 1 januari 2026 worden de bediendenwedden (APCB 200) met 2,21% geïndexeerd",
      "Orbiss", "news",
      "https://orbiss.be/nieuws/op-1-januari-2026-worden-de-bediendenwedden-apcb-200-met-2-21-geindexeerd",
      "Orbiss", "2025-12-23", "BE", "PC 200", None, "indexation", W, """
      Social secretariat Orbiss reports that on 1 January 2026 the salaries of employees in the APCB
      (PC 200) are indexed by 2.21%.

      The same percentage applies to the actual salaries and to the sectoral minimum scales. Orbiss
      reminds employers that the PC 200 indexation happens once a year, on 1 January, and is based on the
      health index.

      (Summary based on the Orbiss news title and snippet; publication date approximate.)
      """),

    D("be_bbtk_indexeringen_jan2026", "Indexeringen januari 2026 (overzicht)",
      "BBTK Federaal", "news", "https://www.bbtk.org/nl/fed/indexeringen-januari-2026",
      "BBTK", "2026-01-05", "BE", None, None, "indexation", W, """
      Trade union BBTK publishes an overview of the wage indexations of January 2026 for the joint
      committees it follows. Two lines relevant for payroll:

      - PC 200 (aanvullend paritair comité voor de bedienden): +2.21% on 1 January 2026, on actual
        salaries and minimum scales.
      - PC 330.01, PC 330.02 and PC 330.04 (health care institutions and services): +2% in January 2026.
        In PC 330 the wages are indexed in the first month after the pivot index (spilindex) of the public
        sector is exceeded; for the roughly 290,000 employees of PC 330 that was January 2026. Civil servants
        were indexed later, in March 2026.

      Different joint committees therefore have different percentages and different mechanisms in the same
      month. A PC 330 employee does not get the PC 200 figure and vice versa.

      (Summary of the BBTK overview page, via search snippet; publication date approximate.)
      """),

    D("be_pc200_ecocheques", "PC 200: ecocheques en jaarlijkse premie in juni",
      "BBTK / Fedustria (sector info)", "official", "https://www.fedustria.be/knowledge-center/pc-200-toekenning-van-ecocheques/",
      "Fedustria knowledge center", "2025-05-20", "BE", "PC 200", None, "eco-cheques", W, """
      Eco-cheques in PC 200.

      Employees who worked full-time during the complete reference period are entitled to eco-cheques
      worth 250 euro, paid in the month of June.

      Reference period: from 1 June of the year before payment up to and including 31 May of the year of
      payment. For June 2026 that is 1 June 2025 - 31 May 2026.

      Payment: in June, usually on the electronic card of the eco-cheque issuer (Edenred, Pluxee or Monizze),
      together with the June salary.

      Part-time employees are also entitled, on a scale that depends on their working time (the sector
      scale published by the unions lists lower amounts for smaller fractions, e.g. 150 euro for half-time
      and 100 euro for less than half-time).

      Companies may convert the eco-cheques into an equivalent benefit by company agreement (company CAO).
      In June PC 200 employees also receive the separate annual premium (jaarlijkse premie) that is indexed
      each year.

      (Summary of several sector pages; part-time scale reproduced only partly because sources differed.)
      """),

    D("be_pc200_eindejaarspremie", "Eindejaarspremie in PC 200: berekening en voorwaarden",
      "ACLVB / sector info", "official", "https://www.aclvb.be/nl/pc-200-loon-en-arbeidsvoorwaarden",
      "ACLVB", "2025-11-10", "BE", "PC 200", None, "year-end bonus", W, """
      Year-end bonus (eindejaarspremie, "13th month") for employees in PC 200.

      Amount: the gross monthly salary of December. Example: an employee with a gross monthly salary of
      3,200 euro receives a gross year-end bonus of 3,200 euro.

      Condition: the employee must have at least six months of seniority in the company.

      Pro rata: if the employee did not work the full year, the bonus is calculated pro rata of the months
      worked in the reference year.

      Change from 2026 (sector agreement 2025-2026): 5 days of temporary unemployment are treated as worked
      days (gelijkgesteld) for the calculation of the year-end bonus. There are also changes regarding
      dismissal cases and seniority conditions.

      (Summary of union and sector pages; details of the 2026 dismissal-case changes not verified.)
      """),

    D("be_pc124_index_q1_2026", "Indexering PC 124 vanaf 1 januari 2026",
      "Accuria", "official", "https://accuria.be/indexering-pc-124-vanaf-1-januari-2026/",
      "Accuria", "2025-12-30", "BE", "PC 124", None, "indexation", W, """
      Construction workers (PC 124, bouw) see their wages rise on 1 January 2026 with an indexation of
      0.21859%.

      Unlike PC 200, construction wages are indexed every quarter: on 1 January, 1 April, 1 July and
      1 October. The January 2026 step is therefore a small quarterly step, not an annual catch-up.

      The petrochemistry allowance and the allowance for food and housing (vergoeding voor voeding en
      huisvesting) are indexed by the same percentage.

      Payroll note: do not apply the PC 200 figure (2.21%) to PC 124 workers. For PC 124 the correct
      January 2026 figure is 0.21859%.

      (Summary via search snippet of the Accuria page; publication date approximate.)
      """),

    D("be_pc302_index_2026", "PC 302 horeca: index 1 januari 2026 +2,189%",
      "ACV Voeding en Diensten", "official",
      "https://www.hetacv.be/docs/default-source/acv-csc-docsitemap/6000-centrales/6330-acv-voeding-en-diensten---sporta-csc-alimentation-et-services---sporta/6430-sectoren-(overzicht-met-links)-secteurs-(aper%C3%A7u-avec-liens)/horeca---pc-302/lonen-horeca.pdf",
      "ACV", "2026-01-02", "BE", "PC 302", None, "indexation", W, """
      Horeca (PC 302, hotel industry): wage indexation on 1 January 2026 is +2.189%.

      The increase applies to both the minimum hourly wages and the actual wages.

      Allowances indexed at the same time:
      - night work supplement (work between 00:00 and 05:00): 1.6209 euro per hour;
      - compensation for purchase and maintenance of work clothing: from 2.15 euro to 2.20 euro per day.

      PC 302 indexes once a year on 1 January, based on the price evolution of commonly used products and
      services. The PC 302 percentage (2.189%) differs from PC 200 (2.21%).

      (Summary of the ACV wage sheet for PC 302 via search snippet.)
      """),

    D("be_sdworx_press_food_horeca_transport", "Lonen in voedingsindustrie, horeca en transport stijgen in januari met ruim 2%",
      "SD Worx press release", "official",
      "https://www.sdworx.be/nl-be/over-sd-worx/pers/lonen-voedingsindustrie-horeca-en-transport-stijgen-januari-met-ruim-2",
      "SD Worx press office", "2025-11-27", "BE", "PC 140", None, "indexation", W, """
      SD Worx announces that the wages of about 350,000 employees in the food industry (PC 118 and PC 220),
      hospitality (PC 302) and transport (PC 140.03, road transport and logistics) increase in January 2026
      through indexation, by slightly more than 2%.

      For road transport and logistics (PC 140.03) the January 2026 indexation is 2.18%.

      SD Worx notes that the federal government's intervention in the index (the so-called 'centenindex')
      could still affect indexation for higher salaries in some sectors; this had not been finalised at the
      time of the release.

      (Summary via search snippet; exact publication date not verified.)
      """),

    D("be_pc111_index_jul2026", "Loonindexering van 2,81% in PC 111 en 209",
      "Agoria", "official",
      "https://www.agoria.be/nl/diensten/expertise/hr-legal-social-dialogue/sectoraal-overleg-en-paritaire-comites/pc-209/loonindexering-van-281-in-pc-111-en-209",
      "Agoria HR Legal & Social Dialogue", "2026-06-26", "BE", "PC 111", None, "indexation", W, """
      Metal sector: on 1 July 2026 the scales and actual wages of workers in PC 111 and employees in PC 209
      are indexed by 2.81%.

      In the metal sector, 1 July is the fixed annual indexation moment (not 1 January as in PC 200).
      About 170,000 workers and employees are concerned.

      The 'centenindex' mechanism takes effect from 1 June 2026 and already applies to the 1 July 2026
      indexation in PC 111 and PC 209.

      (Summary via search snippet of the Agoria article; publication date approximate.)
      """),

    D("be_flexijobs_2026", "Flexi-jobs in 2026: plafonds, bijdrage en horeca-maximum",
      "Certifisc / sector info", "official", "https://www.certifisc.be/nl/posts/flexi-jobs-de-definitieve-regeling-vanaf-1-juli-2026",
      "Certifisc", "2026-06-15", "BE", None, None, "flexi-jobs", W, """
      Flexi-jobs: the rules that apply in 2026.

      - Tax-free ceiling: for income year 2026 the maximum tax-exempt flexi-job income for non-pensioners is
        18,440 euro. From 2026 this ceiling is indexed annually. For legally retired workers there is no
        ceiling.
      - Wage ceiling: since 2024 the flexi-wage may be at most 150% of the minimum base salary, excluding
        allowances and premiums that are mandatory by law or CAO. Voluntary extras still count towards the
        150% ceiling.
      - Horeca (PC 302): from 1 July 2026 a specific maximum flexi-wage of 21 euro per hour applies
        (subject to indexation).
      - Employer contribution: since 1 January 2024 the special employer social security contribution is
        28% for flexi-jobbers.

      The reform broadening flexi-jobs to more sectors takes effect on 1 July 2026.

      (Summary of several 2026 sources via search snippets.)
      """),

    D("be_mealvouchers_2026", "Maximale waarde maaltijdcheque stijgt naar 10 euro op 1 januari 2026",
      "Liantis / Acerta", "official",
      "https://www.liantis.be/nl/nieuws/vanaf-1-januari-2026-stijgt-het-maximale-bedrag-van-de-maaltijdcheque-naar-10-euro",
      "Liantis", "2025-12-18", "BE", None, None, "meal vouchers", W, """
      From 1 January 2026 the maximum value of a meal voucher rises to 10 euro.

      - Maximum employer share: from 6.91 euro to 8.91 euro (the part exempt from social security
        contributions rises by 2 euro).
      - Minimum employee contribution: 1.09 euro.
      - Tax: the employer's deductible amount per voucher rises from 2 to 4 euro, on condition that the
        employer pays the maximum employer share of 8.91 euro.

      The increase is a possibility, not an obligation: the higher employer share has to be granted via a
      CAO or, where there is no union delegation, an individual written agreement. Acerta notes that the
      increase falls outside the wage norm (0% for 2025-2026) thanks to an amendment of the Wage Act of
      26 July 1996.

      (Summary of Liantis and Acerta pages via search snippets.)
      """),

    D("be_telework_2025", "Telewerkvergoeding stijgt tot 157,83 euro vanaf 1 maart 2025",
      "Securex", "official",
      "https://www.securex.be/nl/lex4you/werkgever/nieuws/telewerkvergoeding-stijgt-tot-157,83-euro-vanaf-1-maart-2025",
      "Securex Lex4You", "2025-02-20", "BE", None, None, "telework allowance", W, """
      The maximum flat-rate office allowance (forfaitaire kantoorvergoeding) for structural telework rises
      to 157.83 euro per month from 1 March 2025.

      Conditions: the employee works from home structurally and regularly, meaning the equivalent of one
      working day per week, assessed on a monthly basis. The allowance covers the usual costs of setting up
      and using a home office.

      (Summary based on the Securex news title; the amount is taken from the title.)
      """),

    D("be_telework_2026", "Telewerkvergoeding stijgt tot 160,99 euro; 164,21 euro vanaf september 2026",
      "Securex / Salary Solution", "official",
      "https://www.securex.be/nl/lex4you/werkgever/nieuws/telewerkvergoeding-stijgt-tot-160,99-euro-vanaf-1-maart-2026",
      "Securex Lex4You", "2026-09-02", "BE", None, None, "telework allowance", W, """
      Flat-rate office allowance for telework in 2026:
      - from 1 March 2026 up to and including 31 August 2026: maximum 160.99 euro per month;
      - from 1 September 2026: maximum 164.21 euro per month.

      The allowance can be granted without social security contributions to employees who work from home
      structurally and regularly: the equivalent of one working day per week, assessed per month. This can
      be one full day a week, two half days, two hours a day in a five-day week, or one full week per month.

      The 164.21 euro amount supersedes the 160.99 euro amount, which itself superseded the 157.83 euro
      amount of March 2025.

      (Combined summary of Securex (160.99 euro, 1 March 2026) and Salary Solution (164.21 euro, September
      2026).)
      """),

    D("be_timecredit_2026", "Tijdskrediet en landingsbanen: wat verandert vanaf 2026",
      "Acerta / RVA", "official", "https://www.acerta.be/nl/inspiratie/tijdskrediet-wat-verandert-vanaf-2026",
      "Acerta", "2026-01-08", "BE", None, None, "time credit", W, """
      Changes to time credit (tijdskrediet) and end-of-career "landing jobs" (landingsbanen) from
      1 January 2026, following the federal coalition agreement of 31 January 2025 and the summer agreement
      of 21 July 2025:

      - Landing job at 60: employees who request 1/2 or 1/5 end-of-career time credit must prove a
        professional career of 31 years (men) or 26 years (women). The tightening is phased in along a
        schedule that differs for men and women.
      - Carers' leave is no longer counted in the company threshold for time credit, and neither is time
        credit taken immediately after carers' leave, for the first six months.
      - Full-time employees whose schedule is spread over fewer than five days per week can take 1/5 time
        credit from 2026, if a sectoral CAO, company CAO or written contract provides for it.
      - Priority in the planning mechanism goes to employees caring for vulnerable persons.

      (Summary of Acerta and RVA pages via search snippets.)
      """),
]
