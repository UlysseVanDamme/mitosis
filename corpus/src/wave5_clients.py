"""Wave 5: client company CAOs, payroll configs and emails. All companies and people are fictional."""
from common import D

VD = "Brouwerij Van Dessel"
DE = "Softwarehuis Delta"
ME = "Mertens Interieur"
MA = "Bouwgroep Maes"
AZ = "AZ Vlaskouter"
GL = "Restogroep De Gouden Lepel"
VH = "Verhaeghe Logistics"


def C(doc_id, title, source_type, author, date, pc, client, topic, text, source="SD Worx client file"):
    return D(doc_id, title, source, source_type, None, author, date, "BE", pc, client, topic,
             f"client:{client}", text)


DOCS = [
    C("cao_vandessel_2019", "Brouwerij Van Dessel: company CAO on indexation (2019)", "cao",
      "Brouwerij Van Dessel NV and union delegation", "2019-06-27", "PC 200", VD, "indexation", """
      Company collective agreement (ondernemings-CAO) of Brouwerij Van Dessel NV, Oudenaarde, signed on
      27 June 2019 with the union delegation, registered with the FPS Employment. Indefinite duration.

      Article 1. Scope: all employees of Brouwerij Van Dessel NV who fall under PC 200.

      Article 2. Timing of indexation. The annual indexation percentage fixed for PC 200 is applied on
      1 February of each year instead of 1 January. The month of January is paid without the new indexation.

      Article 3. Base of indexation. The indexation is applied to the gross monthly base salary only. The
      brouwerijpremie (brewery allowance, 145 euro gross per month for a full-time employee) is excluded from
      the sector indexation.

      Article 4. The brouwerijpremie is increased by a fixed 2% on 1 July of each year.

      Article 5. This agreement does not reduce any right of the employee under the sector minimum scales:
      when the base salary after 1 February would be below the indexed sector minimum, the sector minimum
      applies from 1 January.
      """),

    C("cfg_vandessel", "Client config: Brouwerij Van Dessel NV", "cao", "Jan Peeters", "2025-11-28",
      "PC 200", VD, "indexation", """
      Payroll client config sheet. Client: Brouwerij Van Dessel NV (client number BE-40217). Joint committee:
      PC 200 (132 employees). Consultant: Jan Peeters (PC 200 owner). Migrated to the new payroll engine on
      28 November 2025.

      Deviations from sector defaults:
      - Indexation: company CAO 2019. Index date 1 February (not 1 January); base = gross base salary
        excluding brouwerijpremie. Flag IDX_COMPANY_CAO = required. NOTE after migration: flag to be
        re-entered, not carried over automatically.
      - Brouwerijpremie: 145 euro/month, +2% every 1 July.
      - Eco-cheques: converted into a yearly bicycle allowance of equivalent value (company CAO 2023). Skip
        eco-cheque run.
      - Meal vouchers: 8 euro, employer share 6.91 euro. Increase to 10 euro only after signed CAO.
      - Telework allowance: fixed 90 euro/month (not the maximum).

      Contacts at client: Els Van Dessel (HR manager), Wim Van Dessel (CFO).
      """),

    C("cao_vandessel_2023_bike", "Brouwerij Van Dessel: company CAO converting eco-cheques (2023)", "cao",
      "Brouwerij Van Dessel NV and union delegation", "2023-03-14", "PC 200", VD, "eco-cheques", """
      Company CAO of 14 March 2023, Brouwerij Van Dessel NV.

      The eco-cheques provided by the PC 200 sector agreement (250 euro for a full-time employee over the
      reference period) are replaced by a yearly bicycle allowance of the same value, paid with the June
      salary to every employee, whether or not they cycle to work. Part-time employees receive the amount
      that corresponds to their eco-cheque entitlement under the sector scale.

      The annual PC 200 premium paid in June is not affected by this agreement.
      """),

    C("cfg_delta", "Client config: Softwarehuis Delta BV", "cao", "Tom Vandenberghe", "2025-10-15",
      "PC 200", DE, "indexation", """
      Payroll client config sheet. Client: Softwarehuis Delta BV, Gent (client number BE-51190). Joint
      committee: PC 200 (84 employees, mostly developers). Consultant: Tom Vandenberghe; PC 200 owner Jan
      Peeters.

      Deviations from sector defaults: none for indexation (sector rule, 1 January, effective salaries).
      Manual override added 15 October 2025 by T. Vandenberghe: IDX_PC200_2026 = 2.13 (forecast, "to be
      replaced by final figure").

      Other settings:
      - Meal vouchers: 8 euro (employer share 6.91 euro).
      - Telework allowance: maximum allowed amount (flag 'maximum', since April 2026).
      - Eco-cheques: paid in June via Pluxee card.
      - Contacts: Pieter Goossens (finance director), Sarah Lambrecht (HR).
      """),

    C("cfg_mertens", "Client config: Mertens Interieur BV", "cao", "Lien Desmet", "2025-09-10",
      "PC 200", ME, "indexation", """
      Payroll client config sheet. Client: Mertens Interieur BV, Kortrijk (client number BE-38802). Joint
      committee: PC 200 (41 employees: designers, joiners and sales staff in the employee statute).
      Consultant: Lien Desmet; PC 200 owner Jan Peeters.

      Deviations: indexation follows the sector rule (1 January, effective salaries, no override).
      Eco-cheques: converted into a cafeteria-plan budget of equivalent value by company CAO of 2024; skip
      eco-cheque run. Year-end bonus: sector rule. Meal vouchers: 7 euro (employer share 5.91 euro).
      Contacts: An Mertens (owner).
      """),

    C("cfg_maes", "Client config: Bouwgroep Maes NV", "cao", "Sofie Claes", "2025-10-01",
      "PC 124", MA, "indexation", """
      Payroll client config sheet. Client: Bouwgroep Maes NV, Roeselare (client number BE-29944).

      Two populations:
      - 58 construction workers in PC 124: quarterly indexation (1 January, 1 April, 1 July, 1 October)
        on hourly wages, plus the food and housing allowance. Fidelity and weather stamps via the sector fund.
      - 9 office employees in PC 200: annual indexation on 1 January (sector rule).

      Never apply one population's indexation to the other. Consultant for PC 124: Sofie Claes. PC 200 part:
      Lien Desmet. Contacts: Ruben Maes (managing director).
      """),

    C("cfg_az", "Client config: AZ Vlaskouter", "cao", "Lotte Wouters", "2025-06-01",
      "PC 330", AZ, "indexation", """
      Payroll client config sheet. Client: AZ Vlaskouter, general hospital (client number BE-11873).
      Joint committee: PC 330 (about 1,150 employees). Salary scales: IFIC.

      Indexation: follows the public-sector pivot index; salaries and IFIC scales are indexed in the month
      after the pivot index is exceeded. Night, weekend and irregular-hours premiums per hospital CAO.
      Consultant and PC 330 owner: Lotte Wouters. Contacts: Dr. Hilde Verstraete (HR director).
      """),

    C("cfg_goudenlepel", "Client config: Restogroep De Gouden Lepel", "cao", "Karim El Amrani", "2025-11-20",
      "PC 302", GL, "flexi-jobs", """
      Payroll client config sheet. Client: Restogroep De Gouden Lepel BV (6 restaurants in Brugge and Gent,
      client number BE-60415). Joint committee: PC 302.

      - 74 regular employees on hourly wages. Indexation 1 January (sector rule). Loaded value for
        January 2026 on 20 Nov 2025: 2.1 (horeca desk estimate, to be replaced).
      - About 35 flexi-jobbers per month. Dimona per day. Flexi-wage cap as per sector rules.
      - Night supplement and work clothing compensation per PC 302.
      Consultant: Karim El Amrani. Contacts: Olivier Dujardin (operations).
      """),

    C("cfg_verhaeghe", "Client config: Verhaeghe Logistics group", "cao", "Tom Vandenberghe", "2025-12-01",
      "PC 140", VH, "indexation", """
      Payroll client config sheet. Client: Verhaeghe Logistics NV, Zeebrugge (client number BE-47730).

      Belgian entity: 210 drivers and warehouse workers in PC 140.03 (indexation 1 January), 35 office
      employees in PC 200.

      Foreign entities (handled by the cross-border desk):
      - Verhaeghe Logistics Nederland B.V., Rotterdam: 40 employees, Dutch payroll, Dutch statutory minimum
        wage and the 30% ruling for 3 expats. Owner: Emma de Vries.
      - Verhaeghe Logistics Luxembourg S.à r.l., Bettembourg: 18 employees, Luxembourg automatic index.
        Owner: Marc Schmit.
      Consultant BE: Tom Vandenberghe. Contacts: Nathalie Verhaeghe (group HR).
      """),
    # ---------------- emails ----------------
    C("eml_vandessel_budget", "Email: Van Dessel CFO asks for the February index figure", "email",
      "Wim Van Dessel", "2025-12-29", "PC 200", VD, "indexation", """
      From: Wim Van Dessel (CFO, Brouwerij Van Dessel)
      To: Jan Peeters (SD Worx)
      Date: 29 December 2025
      Subject: index for our February payroll

      Jan, the papers say 2.21% for PC 200. Can you confirm that under our company CAO we apply 2.21% on
      1 February 2026 on the base salaries only, so the brouwerijpremie stays at 145 euro until July? I need
      it for the Q1 budget.

      Reply from Jan Peeters, 30 December 2025: Confirmed. 2.21% on 1 February 2026 on the gross base salary,
      brouwerijpremie excluded (145 euro until 1 July 2026, then +2%). January 2026 without indexation, except
      where the base salary would fall below the indexed sector minimum; for those employees the sector
      minimum applies from 1 January.
      """, source="SD Worx email archive"),

    C("eml_delta_complaint", "Email: Delta finance director escalates index difference", "email",
      "Pieter Goossens", "2026-01-12", "PC 200", DE, "indexation", """
      From: Pieter Goossens (Softwarehuis Delta)
      To: SD Worx helpdesk; cc Jan Peeters
      Date: 12 January 2026
      Subject: RE: T-2026-0012 index 2.13 vs 2.21

      Our staff noticed they received 2.13% instead of the 2.21% everyone else in PC 200 got. This is a small
      difference per person but a big trust issue for us. Please confirm (1) the correct percentage, (2) that
      the January difference will be paid in February, and (3) that this will not happen again.

      Draft reply (Jan Peeters, not yet sent): (1) 2.21% on 1 January 2026. (2) Yes, retroactive in the
      February payroll after your approval. (3) Our policy no longer allows loading forecasts.
      """, source="SD Worx email archive"),

    C("eml_goudenlepel_flexi", "Email: account manager on the new horeca flexi-cap", "email",
      "Stefaan Dewitte", "2025-12-15", "PC 302", GL, "flexi-jobs", """
      From: Stefaan Dewitte (account manager, SD Worx)
      To: Olivier Dujardin (Restogroep De Gouden Lepel)
      Date: 15 December 2025
      Subject: flexi-jobs in 2026

      Hi Olivier, heads-up for your planning: from 1 January 2026 flexi-jobbers in horeca may be paid at most
      21 euro per hour. Your weekend sommelier at 22.50 euro will have to be adjusted in the January payroll.
      The 28% employer contribution stays the same.

      Kind regards, Stefaan
      """, source="SD Worx email archive"),

    C("eml_maes_recovery", "Email: recovering overpaid construction wages", "email",
      "Sofie Claes", "2026-01-20", "PC 124", MA, "indexation", """
      From: Sofie Claes (PC 124 owner, SD Worx)
      To: Ruben Maes (Bouwgroep Maes)
      Date: 20 January 2026
      Subject: T-2026-0021 correction January wages

      Dear Mr Maes, as discussed: your construction workers (PC 124) should have received the quarterly
      indexation of 0.21859% on 1 January 2026, not 2.21%, which is the PC 200 figure. The 9 office employees
      in PC 200 correctly received 2.21%.

      We propose to correct the hourly wages in the February payroll and to spread the recovery of the
      January overpayment over three months. Please confirm. Next indexation step for PC 124: 1 April 2026.
      """, source="SD Worx email archive"),

    C("eml_az_ific", "Email: AZ Vlaskouter asks about IFIC and index", "email",
      "Hilde Verstraete", "2026-01-15", "PC 330", AZ, "indexation", """
      From: Dr. Hilde Verstraete (HR director, AZ Vlaskouter)
      To: Lotte Wouters (SD Worx)
      Date: 15 January 2026
      Subject: IFIC scales after January index

      Lotte, thank you for confirming the 2% indexation for January 2026. Can you send the updated IFIC scale
      table for our nursing staff so we can publish it on the intranet?

      Reply (Lotte Wouters): attached. All IFIC categories +2% from January 2026. The next indexation follows
      the next time the pivot index is exceeded.
      """, source="SD Worx email archive"),
]
