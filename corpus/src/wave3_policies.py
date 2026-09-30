"""Wave 3: internal policies (v1 2024 vs v2 2025/2026), onboarding/ownership notes, FAQ. Fictional."""
from common import D

I = "internal"

DOCS = [
    D("pol_index_v1", "Policy PAY-IDX-01 v1: processing sector indexations",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2024-03-01", "BE", None, None,
      "indexation", I, """
      Policy PAY-IDX-01, version 1 (valid from 1 March 2024).

      Scope: all Belgian clients, all joint committees with an annual indexation on 1 January.

      1. The payroll cut-off for January payroll is 20 December.
      2. If the final sector indexation percentage is not published by 20 December, the consultant applies
         the most recent published forecast (e.g. Pro-Pay, or our own Payroll Pulse outlook) so that the
         January payslip already contains an indexation.
      3. When the final figure is published, the difference is corrected in the February payroll
         (retroactive correction for January).
      4. The consultant logs the forecast used in the client file.

      Rationale: employees expect to see the index on the January payslip.

      Owner: Knowledge desk, Inge Vermeulen.
      """),

    D("pol_index_v2", "Policy PAY-IDX-01 v2: processing sector indexations (forecasts no longer allowed)",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2025-11-03", "BE", None, None,
      "indexation", I, """
      Policy PAY-IDX-01, version 2 (valid from 3 November 2025). Replaces version 1 of 1 March 2024.

      What changed: forecasts may no longer be applied.

      1. The payroll cut-off for January payroll moves from 20 December to 27 December, because final
         indexation figures (e.g. PC 200) are usually only published around 22 December.
      2. Only final, published sector figures may be loaded. Applying a forecast (Pro-Pay, Payroll Pulse
         outlook or any other) is not allowed, even temporarily.
      3. If the final figure is still not available on 27 December, run January payroll without the
         indexation and apply it retroactively in the February payroll.
      4. Client company CAOs that deviate from the sector rule (other date, other base) always take
         precedence over the sector default for that client; check the client config.

      Rationale: in January 2025 several clients received two corrections because the forecast differed
      from the final figure. Correcting downwards (recovering overpaid wages) is costly and damages trust.

      Owner: Knowledge desk, Inge Vermeulen.
      """),

    D("pol_mealvoucher_v1", "Policy PAY-MV-02 v1: meal vouchers",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2024-01-15", "BE", None, None,
      "meal vouchers", I, """
      Policy PAY-MV-02, version 1 (valid from 15 January 2024).

      - Maximum face value of a meal voucher: 8 euro.
      - Maximum employer share: 6.91 euro. Minimum employee share: 1.09 euro.
      - One voucher per day actually worked.
      - The voucher value per client is stored in the client config; changes require the client's CAO or
        individual agreement.
      """),

    D("pol_mealvoucher_v2", "Policy PAY-MV-02 v2: meal vouchers from 1 January 2026",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2025-12-10", "BE", None, None,
      "meal vouchers", I, """
      Policy PAY-MV-02, version 2 (valid from 1 January 2026). Replaces version 1.

      - Maximum face value of a meal voucher: 10 euro.
      - Maximum employer share: 8.91 euro (was 6.91 euro). Minimum employee share: 1.09 euro.
      - The increase is NOT automatic. A client may only raise the employer share when a sector CAO,
        company CAO or (without union delegation) individual written agreements provide for it. The
        consultant must have the signed document in the client file before changing the client config.
      - Clients that do nothing keep their existing voucher value.
      - Employer tax deduction of 4 euro per voucher only when the employer share is the full 8.91 euro.
      """),

    D("pol_telework_v1", "Policy PAY-TW-03 v1: telework allowance",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2025-03-01", "BE", None, None,
      "telework allowance", I, """
      Policy PAY-TW-03, version 1 (valid from 1 March 2025).

      Maximum flat-rate office allowance for structural telework: 157.83 euro per month, exempt from
      social security contributions. Condition: structural and regular telework, i.e. the equivalent of one
      working day per week on a monthly basis. Clients may pay less than the maximum. Amounts above the
      maximum are treated as salary.
      """),

    D("pol_telework_v2", "Policy PAY-TW-03 v2: telework allowance",
      "SD Worx policy wiki", "policy", None, "Inge Vermeulen", "2026-03-01", "BE", None, None,
      "telework allowance", I, """
      Policy PAY-TW-03, version 2 (valid from 1 March 2026). Replaces version 1.

      Maximum flat-rate office allowance for structural telework: 160.99 euro per month (was 157.83 euro).
      Same conditions: equivalent of one working day per week, assessed per month. Clients paying the
      maximum should be updated automatically by the central parameter; clients paying a fixed lower
      amount are not changed.

      Next review: September 2026.
      """),

    D("pol_ecocheque_v1", "Policy PAY-ECO-04 v1: eco-cheques PC 200",
      "SD Worx policy wiki", "policy", None, "Koen Janssens", "2024-04-10", "BE", "PC 200", None,
      "eco-cheques", I, """
      Policy PAY-ECO-04, version 1 (valid from April 2024). Owner at the time: Koen Janssens (PC 200).

      Eco-cheques for PC 200 employees: 250 euro for a full-time employee over the full reference period,
      paid with the June payroll. Reference period: 1 June of the previous year to 31 May of the current
      year. Part-timers: pro rata according to the sector scale. Payment on electronic card via the issuer
      chosen by the client.
      """),

    D("pol_ecocheque_v2", "Policy PAY-ECO-04 v2: eco-cheques PC 200 and conversions",
      "SD Worx policy wiki", "policy", None, "Jan Peeters", "2025-10-01", "BE", "PC 200", None,
      "eco-cheques", I, """
      Policy PAY-ECO-04, version 2 (valid from 1 October 2025). Owner: Jan Peeters (PC 200).

      Unchanged: 250 euro for full-time over the full reference period 1 June - 31 May, paid in June.

      New: clients may convert eco-cheques into an equivalent benefit through a company CAO. If a client
      config contains a conversion, the eco-cheque run must skip that client. Brouwerij Van Dessel and
      Mertens Interieur have such a conversion on file (see client configs).
      """),

    D("pol_eoy_v1", "Policy PAY-EOY-05 v1: year-end bonus PC 200",
      "SD Worx policy wiki", "policy", None, "Koen Janssens", "2024-09-01", "BE", "PC 200", None,
      "year-end bonus", I, """
      Policy PAY-EOY-05, version 1 (valid from September 2024).

      Year-end bonus PC 200 = December gross monthly salary, paid with the December payroll. Condition: six
      months of seniority. Pro rata for incomplete years. Temporary unemployment days are NOT treated as
      worked days for the calculation.
      """),

    D("pol_eoy_v2", "Policy PAY-EOY-05 v2: year-end bonus PC 200 from 2026",
      "SD Worx policy wiki", "policy", None, "Jan Peeters", "2026-02-01", "BE", "PC 200", None,
      "year-end bonus", I, """
      Policy PAY-EOY-05, version 2 (valid for year-end bonuses from 2026 on). Replaces version 1.

      Year-end bonus PC 200 = December gross monthly salary. Condition: six months of seniority. Pro rata
      for incomplete years.

      Change: from 2026, 5 days of temporary unemployment are treated as worked days (gelijkgesteld) for
      the calculation, in line with the PC 200 sector agreement 2025-2026. The December 2026 run must use
      the new parameter. Owner: Jan Peeters.
      """),

    D("pol_flexi_v1", "Policy PAY-FLX-06: flexi-jobs processing",
      "SD Worx policy wiki", "policy", None, "Karim El Amrani", "2026-06-20", "BE", None, None,
      "flexi-jobs", I, """
      Policy PAY-FLX-06 (valid from 1 July 2026).

      - Special employer contribution for flexi-jobs: 28%.
      - Flexi-wage at most 150% of the minimum base salary (mandatory allowances excluded from the test).
      - PC 302 (horeca): from 1 July 2026 a maximum flexi-wage of 21 euro per hour, subject to indexation.
        Payroll must block flexi-wages above 21 euro/hour for PC 302 from the July 2026 payroll on.
      - Tax-free ceiling for non-pensioners in income year 2026: 18,440 euro. Warn the client when a
        flexi-jobber approaches the ceiling.

      Owner: Karim El Amrani (horeca & flexi-jobs).
      """),

    D("pol_access_client_data", "Policy SEC-01: client data segregation in answers and exports",
      "SD Worx policy wiki", "policy", None, "Security office", "2025-05-15", "BE", None, None,
      "access control", I, """
      Policy SEC-01 (valid from 15 May 2025).

      Client users of the self-service portal and of any assistant may only see public information and the
      information of their own company. Consultants see all clients they serve.

      Never reveal another client's name in relation to its payroll settings, company CAO, tickets or
      salary figures to a client user. Aggregated statements that could identify another client (for
      example "the other brewery in your region indexes on 1 January") are also forbidden.

      If a client user asks about another client, answer only with the public sector rule and state that
      information about other clients cannot be shared.
      """),

    D("onb_ownership_2024", "Onboarding: who owns what in the Kortrijk payroll team (2024)",
      "SD Worx onboarding wiki", "policy", None, "Team lead Kortrijk", "2024-02-05", "BE", None, None,
      "ownership", I, """
      Welcome to the Kortrijk payroll team. Who to ask:

      - PC 200 (employees) expert: Koen Janssens. Indexation, eco-cheques, year-end bonus, sector CAOs.
      - PC 124 (construction) expert: Sofie Claes. Quarterly indexations, fidelity stamps, weather days.
      - PC 330 (health care) expert: Lotte Wouters. IFIC scales, pivot index.
      - PC 302 (horeca) and flexi-jobs: Karim El Amrani.
      - Policies and payroll parameters: Knowledge desk, Inge Vermeulen.
      - Netherlands and Luxembourg entities of Belgian clients: cross-border desk (NL: Emma de Vries,
        LU: Marc Schmit).
      """),

    D("onb_ownership_2025_update", "Team update: PC 200 ownership moves to Jan Peeters",
      "SD Worx onboarding wiki", "policy", None, "Team lead Kortrijk", "2025-08-25", "BE", "PC 200", None,
      "ownership", I, """
      Team update, effective 1 September 2025.

      Koen Janssens moves to the Ghent implementation team. From 1 September 2025 Jan Peeters is the PC 200
      expert and owner of all PC 200 topics (indexation, eco-cheques, year-end bonus, company CAOs of PC 200
      clients). Please route PC 200 questions to Jan Peeters, not to Koen.

      All other owners are unchanged: Sofie Claes (PC 124), Lotte Wouters (PC 330), Karim El Amrani
      (PC 302 and flexi-jobs), Inge Vermeulen (Knowledge desk), Emma de Vries (NL), Marc Schmit (LU).
      """),

    D("faq_holiday_pay", "FAQ: holiday pay for employees (bedienden)",
      "SD Worx internal FAQ", "faq", None, "Knowledge desk", "2025-04-02", "BE", None, None,
      "holiday pay", I, """
      Q: How is holiday pay calculated for employees (bedienden)?

      A: Employees keep their normal monthly salary during their holidays (simple holiday pay) and receive
      double holiday pay, normally paid in May or June. Double holiday pay for employees equals 92% of the
      gross monthly salary of the month in which the holidays are taken, pro rata for the prestations of the
      previous year (the holiday service year).

      When an employee leaves, the employer pays leaving holiday pay (vertrekvakantiegeld) on the last
      payslip; the next employer then deducts it.

      Workers (arbeiders) are different: their holiday pay is paid by the holiday fund, not by the employer.

      Ask the Knowledge desk for special cases (long illness, time credit during the service year).
      """),

    D("faq_dimona", "FAQ: Dimona declarations",
      "SD Worx internal FAQ", "faq", None, "Knowledge desk", "2025-06-12", "BE", None, None,
      "dimona", I, """
      Q: When must a Dimona be filed?

      A: The Dimona (immediate declaration of employment) must be filed with the national social security
      office before the employee starts working. It is required for every employee, including students and
      flexi-jobbers, and for any change in the employment (end date, change of joint committee).

      For flexi-jobbers and students the Dimona carries a specific employee type. For horeca clients with
      occasional workers, file per day or per period as agreed in the client config.

      Consultant checklist: never process a first payslip for an employee without a Dimona in-date.
      A missing Dimona is the most common cause of fines in horeca audits.

      Owner: Knowledge desk.
      """),

    D("faq_timecredit", "FAQ: time credit requests from clients (2026)",
      "SD Worx internal FAQ", "faq", None, "Knowledge desk", "2026-01-20", "BE", None, None,
      "time credit", I, """
      Q: A client employee aged 60 wants a 1/5 landing job in 2026. What do we check?

      A: From 1 January 2026 the employee must prove a career of 31 years (men) or 26 years (women) for a
      1/2 or 1/5 end-of-career time credit at 60. The conditions are phased in, so check the RVA schedule
      for the exact year.

      Q: Can an employee in a four-day week take 1/5 time credit?
      A: From 2026 yes, if a sector CAO, company CAO or written contract allows it.

      Q: Does carers' leave count in the 5% threshold?
      A: Not from 2026.
      """),
]
