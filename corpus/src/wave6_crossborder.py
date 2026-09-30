"""Wave 6: Netherlands and Luxembourg. nl_*/lu_* official docs are real; the rest is fictional."""
from common import D

VH = "Verhaeghe Logistics"

DOCS = [
    D("nl_minimumloon_jan2026", "Wettelijk minimumloon stijgt per 1 januari 2026",
      "KHN", "official", "https://khn.nl/nieuws/wettelijk-minimumloon-stijgt-per-1-januari-2026",
      "Koninklijke Horeca Nederland", "2025-11-20", "NL", None, None, "minimum wage", "public", """
      Netherlands: the statutory minimum wage (wettelijk minimumloon) rises by 2.16% on 1 January 2026, from
      14.40 euro to 14.71 euro gross per hour for employees aged 21 and over.

      Youth minimum wages are a percentage of the adult rate, for example 80% at age 20 (11.77 euro per hour),
      60% at age 19 (8.83 euro) and 50% at age 18 (7.36 euro).

      The Dutch minimum wage is set per hour; it is indexed twice a year, on 1 January and 1 July.

      (Summary based on KHN and other Dutch sources via search snippets; publication date approximate.)
      """),

    D("nl_minimumloon_jul2026", "Minimumloon per 1 juli 2026: 14,99 euro per uur",
      "MKB Servicedesk", "official", "https://www.mkbservicedesk.nl/nieuws/ondernemersnieuws/dit-wordt-het-minimumloon-vanaf-1-januari-2026-per-uur-en-per-maand",
      "MKB Servicedesk", "2026-06-01", "NL", None, None, "minimum wage", "public", """
      Netherlands: from 1 July 2026 the statutory minimum wage for employees aged 21 and over rises to 14.99
      euro gross per hour (from 14.71 euro per hour since 1 January 2026).

      Employers must update hourly wages that are at or near the minimum in the July payroll. Youth minimum
      wages move along proportionally.

      (Summary via search snippets; the 14.99 euro figure for July 2026 appeared in several Dutch sources.
      Publication date approximate.)
      """),

    D("nl_30pct_ruling_2026", "30%-regeling: 30% in 2026, 27% vanaf 2027",
      "Meijburg & Co / Salaris Vanmorgen", "official", "https://www.salarisvanmorgen.nl/2026/04/01/expatregeling-in-2026-en-2027-wat-wijzigt-er/",
      "Salaris Vanmorgen", "2026-04-01", "NL", None, None, "30% ruling", "public", """
      The Dutch expat ruling (30%-regeling) in 2026 and 2027:

      - 2026: the maximum tax-free allowance remains 30%.
      - From 1 January 2027 the maximum drops from 30% to 27%, for the whole remaining duration.
      - Salary norm 2026: 48,013 euro gross per year (2025: 46,660 euro); reduced norm for employees under 30
        with a qualifying master's degree: 36,497 euro (2025: 35,468 euro). The norm is indexed yearly.
      - Transitional rule: employees who already received the allowance in December 2023 keep 30% for the
        rest of their ruling period.

      (Summary of Salaris Vanmorgen and Meijburg pages via search snippets.)
      """),

    D("lu_ssm_2026", "Salaire social minimum Luxembourg au 1er juin 2026",
      "pixie.lu / letzbusiness", "official", "https://www.pixie.lu/corpus/rh/38-0005/salaire-social-minimum-luxembourg-2026-quels-montants-et-quand-sera-la-prochaine-indexation/",
      "pixie.lu", "2026-06-01", "LU", None, None, "minimum wage", "public", """
      Luxembourg social minimum wage (salaire social minimum, SSM) from 1 June 2026, index 992.24:

      - Unqualified worker, 18 and over: 16.0192 euro gross per hour, 2,771.33 euro gross per month.
      - Qualified worker: 19.2231 euro per hour, 3,325.59 euro per month.
      - Young workers 17-18: 12.8154 euro per hour (2,217.06 euro per month); 15-17: 12.0144 euro per hour
        (2,078.49 euro per month).

      The amounts apply to residents and cross-border workers (frontaliers) alike.

      (Summary via search snippets of several Luxembourg sources.)
      """),

    D("lu_index_june2026", "Indexation des salaires au 1er juin 2026: +2,5%",
      "SD Worx Luxembourg blog", "official", "https://www.sdworx.lu/fr-lu/blog/conformite-reglementation/indexation-des-salaires-declenchement-imminent-au-1er-juin-2026",
      "SD Worx Luxembourg", "2026-05-12", "LU", None, None, "indexation", "public", """
      Luxembourg: an index tranche is triggered and all salaries, pensions and social benefits increase by
      2.5% on 1 June 2026.

      The applicable index moves from 968.04 to 992.24 points. The tranche is triggered when cumulative
      inflation reaches 2.5%; annual inflation was 3.1% in April 2026 (2.4% in March), and the six-month
      moving average crossed the threshold in May 2026, confirming the June indexation.

      The increase applies to all employees under Luxembourg labour law, in the private and public sector,
      including cross-border workers.

      (Summary of SD Worx Luxembourg and other Luxembourg sources via search snippets.)
      """),

    D("int_crossborder_policy", "Policy PAY-XB-07: NL and LU entities of Belgian clients",
      "SD Worx policy wiki", "policy", None, "Emma de Vries", "2025-09-15", "NL", None, None,
      "ownership", "internal", """
      Policy PAY-XB-07 (valid from 15 September 2025).

      Belgian clients with Dutch or Luxembourg entities are served by the cross-border desk. Belgian sector
      rules (joint committees, PC indexations, eco-cheques) never apply to these entities.

      - Netherlands: statutory minimum wage (indexed 1 January and 1 July), sector CAOs where applicable, the
        30% ruling for eligible expats, holiday allowance of at least 8%. Owner: Emma de Vries (Utrecht).
      - Luxembourg: automatic index tranches of 2.5% applied from the month the tranche is triggered, social
        minimum wage (SSM). Owner: Marc Schmit.

      Cross-border questions from Belgian consultants go to the desk, not to the PC owners.
      """),

    D("int_nl_faq_vakantiegeld", "FAQ NL: holiday allowance and minimum wage checks",
      "SD Worx internal FAQ", "faq", None, "Emma de Vries", "2026-02-10", "NL", None, None,
      "minimum wage", "internal", """
      Q: What is the Dutch holiday allowance (vakantiegeld)?
      A: At least 8% of the gross annual wage, usually paid in May or June. A CAO can grant more.

      Q: How do we check the minimum wage in NL payroll?
      A: The statutory minimum is an hourly amount and changes on 1 January and 1 July. Always compare the
      hourly wage with the rate valid on the pay date. Warehouse and logistics staff are often close to the
      minimum; flag them before each 1 January and 1 July update.

      Owner: Emma de Vries.
      """),

    D("slk_xb_2026_06_nl", "#payroll-crossborder: NL minimum wage July", "#payroll-crossborder Slack", "slack",
      None, "#payroll-crossborder", "2026-06-24", "NL", None, None, "minimum wage", "internal", """
      #payroll-crossborder, 24 Jun 2026

      Emma de Vries: reminder, NL statutory minimum goes from 14.71 to 14.99 euro/hour on 1 July 2026.
      Verhaeghe Nederland has 6 warehouse staff at 14.75, they must go up in the July run.

      Marc Schmit: LU update: the index tranche came earlier than our Q3 outlook, it was applied on 1 June
      2026 (+2.5%, index 992.24). Verhaeghe Luxembourg June payroll already done with it.
      """),

    D("eml_verhaeghe_nl_30pct", "Email: Verhaeghe Nederland HR on the 30% ruling",
      "SD Worx email archive", "email", None, "Joost Bakker", "2026-02-18", "NL", None, VH, "30% ruling",
      f"client:{VH}", """
      From: Joost Bakker (HR, Verhaeghe Logistics Nederland B.V.)
      To: Emma de Vries (SD Worx cross-border desk)
      Date: 18 February 2026
      Subject: 30% ruling for our three expats

      Hi Emma, our tax advisor's newsletter says the 30% ruling has gone down to 27%. Please apply 27% to our
      three expat planners from the February 2026 payroll so we don't have a correction later.

      Reply (Emma de Vries, draft, not yet sent): the reduction to 27% only applies from 1 January 2027. In
      2026 the maximum remains 30%, provided the salary norm of 48,013 euro (or 36,497 euro for under-30s with
      a master's) is met. Two of your three planners started before December 2023 and keep 30% under the
      transitional rule even after 2027.
      """),

    D("tkt_2026_0260_verhaeghe_nl", "Ticket T-2026-0260: NL warehouse wages below minimum?", "SD Worx helpdesk",
      "ticket", None, "Helpdesk", "2026-07-08", "NL", None, VH, "minimum wage", f"client:{VH}", """
      Ticket T-2026-0260. Client: Verhaeghe Logistics Nederland B.V. Status: OPEN.

      Issue: "Six warehouse employees are paid 14.75 euro per hour. A union rep says this is below the minimum
      since July."

      Analysis (Emma de Vries): correct. From 1 July 2026 the Dutch statutory minimum wage for employees aged
      21+ is 14.99 euro per hour (14.71 euro from 1 January to 30 June 2026). The July run used 14.75 because
      the hourly wages are fixed in the employee records. Raise the six employees to at least 14.99 euro from
      1 July and pay the difference in the August run.
      """),

    D("tkt_2026_0244_verhaeghe_lu", "Ticket T-2026-0244: Luxembourg index in June?", "SD Worx helpdesk",
      "ticket", None, "Helpdesk", "2026-06-03", "LU", None, VH, "indexation", f"client:{VH}", """
      Ticket T-2026-0244. Client: Verhaeghe Logistics Luxembourg S.à r.l. Status: CLOSED.

      Question: "Our Belgian cross-border drivers ask whether the Luxembourg index applies to them and when.
      We were told Q3."

      Answer (Marc Schmit): the index tranche of 2.5% was applied on 1 June 2026 (index 992.24), earlier than
      the Q3 outlook we shared in March. It applies to all employees under Luxembourg labour law, including
      Belgian and French cross-border workers. The social minimum wage for unqualified workers is 2,771.33
      euro per month from 1 June 2026. Your June payroll includes the index.
      """),

    D("eml_verhaeghe_lu_frontaliers", "Email: group HR on Belgian index vs Luxembourg index", "SD Worx email archive",
      "email", None, "Nathalie Verhaeghe", "2026-06-10", "LU", None, VH, "indexation", f"client:{VH}", """
      From: Nathalie Verhaeghe (group HR, Verhaeghe Logistics)
      To: Marc Schmit, Tom Vandenberghe (SD Worx)
      Date: 10 June 2026

      Our drivers in Zeebrugge got 2.18% in January (PC 140.03) and our drivers in Bettembourg got 2.5% in
      June. Some Belgian drivers now ask to be transferred. Can you give me one overview of which index applies
      to which entity in 2026?

      Reply (Tom Vandenberghe): Belgium, PC 140.03 drivers: 2.18% on 1 January 2026. Belgium, PC 200 office:
      2.21% on 1 January 2026. Luxembourg entity: 2.5% on 1 June 2026. Netherlands entity: no automatic
      indexation; statutory minimum wage 14.71 euro/hour from 1 January and 14.99 euro/hour from 1 July 2026.
      """),
]
