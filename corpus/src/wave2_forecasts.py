"""Wave 2: forecasts, sector news and internal outlooks.
be_propay_forecast is real; the rest is fictional internal SD Worx-style content."""
from common import D

DOCS = [
    D("be_propay_forecast_pc200", "Indexprognose januari 2026 PC 200",
      "Pro-Pay", "forecast", "https://www.propay.be/nl/news/indexprognose-januari-2026-pc-200/",
      "Pro-Pay", "2025-10-14", "BE", "PC 200", None, "indexation", "public", """
      Pro-Pay publishes its forecast for the January 2026 indexation in PC 200 (supplementary joint
      committee for employees): an expected indexation of 2.13%.

      The PC 200 indexation is linked to "de evolutie van het afgevlakte gezondheidsindexcijfer" (the
      evolution of the smoothed health index), i.e. to the inflation of the previous calendar year. Monthly
      salaries of all employees in PC 200 are increased by that percentage on 1 January.

      Caveat from Pro-Pay: this is a forecast. "Ten laatste begin januari 2026 delen we u het definitieve
      indexpercentage mee." The final percentage depends on the health index figures of November and
      December 2025, which were not yet known on 14 October 2025.
      """),

    D("int_outlook_2025_11", "Payroll Pulse #41: index outlook for January 2026",
      "SD Worx Payroll Pulse (internal newsletter)", "forecast", None,
      "Research & Content team", "2025-11-12", "BE", None, None, "indexation", "internal", """
      Payroll Pulse #41, internal newsletter for payroll consultants. Index outlook for January 2026.

      PC 200: external forecasts range between 2.1% and 2.2%. Pro-Pay published 2.13% on 14 October. Our own
      model points to about 2.2%. The final figure will only be known after Statbel publishes the December
      health index, expected in the week before Christmas. Do NOT load any of these figures as final.

      PC 302 (horeca): outlook around 2.1%. Final expected end of December.

      PC 140.03 (road transport): outlook just above 2%.

      PC 124 (construction): quarterly indexation, the January step will be small (well below 1%).

      PC 330 (health care): follows the public-sector pivot index; indexation of 2% expected in January if
      the pivot index is exceeded in December.

      Action: consultants with PC 200 clients should warn clients that January payslips will use the final
      figure. See the indexation processing policy for what to do if the final figure arrives after cut-off.
      """),

    D("int_outlook_2025_12_final", "Payroll Pulse #43: January 2026 index figures are final",
      "SD Worx Payroll Pulse (internal newsletter)", "news", None,
      "Research & Content team", "2025-12-23", "BE", None, None, "indexation", "internal", """
      Payroll Pulse #43. The January 2026 index figures are now final.

      - PC 200: 2.21% on 1 January 2026 (actual salaries, minimum scales, guaranteed minimum monthly
        income). This replaces the 2.13% forecast that circulated in October. Several clients asked us about
        the Pro-Pay figure; it is outdated.
      - PC 302: 2.189% on 1 January 2026.
      - PC 140.03: 2.18% on 1 January 2026.
      - PC 124: 0.21859% on 1 January 2026 (quarterly step).
      - PC 330: 2% in January 2026.

      Parameters in the payroll engine are updated centrally by the Knowledge desk on 24 December. Client-
      specific company CAOs that deviate from the sector rule (other date, other base) are NOT updated
      centrally: the client's consultant must check the client config.
      """),

    D("int_horeca_outlook_2025_11", "Horeca desk note: expected PC 302 index January 2026",
      "SD Worx horeca desk", "forecast", None,
      "Karim El Amrani", "2025-11-20", "BE", "PC 302", None, "indexation", "internal", """
      Short note from the horeca desk to consultants with PC 302 clients.

      We expect the PC 302 indexation on 1 January 2026 to be about 2.1% on minimum and actual hourly wages.
      Night supplement and work clothing compensation will move along. This is an estimate based on the
      October price data; the final figure is published at the end of December.

      Please do not promise a number to clients yet. Restaurant groups tend to budget with our estimate and
      then complain when the final is different.

      Owner of PC 302 topics: Karim El Amrani (horeca & flexi-jobs).
      """),

    D("int_index_calendar_2026", "Index calendar 2026 per joint committee (internal cheat sheet)",
      "SD Worx Knowledge desk", "faq", None,
      "Inge Vermeulen", "2026-01-10", "BE", None, None, "indexation", "internal", """
      Cheat sheet: when does which joint committee index in 2026? Always check the client config for
      company CAOs that deviate.

      - PC 200 (employees, supplementary): once a year, 1 January. 2026: 2.21%.
      - PC 124 (construction workers): quarterly, 1 January / 1 April / 1 July / 1 October. January 2026:
        0.21859%.
      - PC 111 (metal workers) and PC 209: once a year, 1 July. July 2026: 2.81%.
      - PC 302 (horeca): once a year, 1 January. 2026: 2.189%.
      - PC 140.03 (road transport): 1 January. 2026: 2.18%.
      - PC 330 (health care): the month after the public-sector pivot index is exceeded. January 2026: 2%.

      Common mistake: copying the PC 200 figure to clients in other joint committees. The helpdesk saw
      several of these in the first week of January 2026.

      Owner: Knowledge desk (Inge Vermeulen). PC-specific questions go to the PC owner (see onboarding
      ownership note).
      """),

    D("int_lu_outlook_2026_03", "Cross-border desk: Luxembourg index outlook 2026",
      "SD Worx cross-border desk", "forecast", None,
      "Marc Schmit", "2026-03-18", "LU", None, None, "indexation", "internal", """
      Outlook note for consultants with Luxembourg entities.

      Luxembourg applies an automatic index tranche of 2.5% to all salaries once cumulative inflation
      reaches the trigger. Based on the STATEC projections we have seen, we expect the next index tranche in
      Q3 2026, most likely in August or September 2026.

      Please plan the LU payroll parameter change for Q3. This is a forecast; the trigger date is only
      certain when STATEC confirms that the threshold is crossed.

      Owner of LU topics: Marc Schmit (cross-border desk, Luxembourg).
      """),

    D("int_mealvoucher_news_2025_12", "Payroll Pulse #42: meal vouchers to 10 euro, what it means for clients",
      "SD Worx Payroll Pulse (internal newsletter)", "news", None,
      "Research & Content team", "2025-12-05", "BE", None, None, "meal vouchers", "internal", """
      Payroll Pulse #42. From 1 January 2026 the maximum meal voucher value becomes 10 euro, with a maximum
      employer share of 8.91 euro (was 6.91 euro) and a minimum employee share of 1.09 euro.

      Important for consultants: this is a maximum, not an automatic increase. A client can only raise the
      employer share if this is laid down in a CAO (sector or company) or, where there is no union
      delegation, in an individual written agreement with each employee. Do not change the voucher value of
      a client without the signed agreement in the client file.

      The tax deduction for the employer rises from 2 to 4 euro per voucher only if the employer pays the
      full 8.91 euro.
      """),

    D("int_centenindex_note_2026", "Knowledge desk note: centenindex in the metal sector",
      "SD Worx Knowledge desk", "news", None,
      "Inge Vermeulen", "2026-06-02", "BE", "PC 111", None, "indexation", "internal", """
      Short note. The 'centenindex' applies from 1 June 2026 and is first used for the 1 July 2026
      indexation in PC 111 and PC 209 (metal), which is 2.81%.

      We have no metal clients in the demo portfolio of the Kortrijk team, but please check before applying
      the July step in any client that has PC 111 workers. Detailed calculation rules are in the Agoria
      article; ask the Knowledge desk before configuring anything that deviates from a flat percentage.

      The centenindex does not affect the January 2026 indexation of PC 200 (2.21%), which followed the
      normal rules.
      """),
]
