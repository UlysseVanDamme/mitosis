"""Wave 4: helpdesk tickets (client-scoped) and #payroll-be Slack threads (internal). Fictional."""
from common import D

HD = "SD Worx helpdesk"
SL = "#payroll-be Slack"
VD = "Brouwerij Van Dessel"
DE = "Softwarehuis Delta"
ME = "Mertens Interieur"
MA = "Bouwgroep Maes"
AZ = "AZ Vlaskouter"
GL = "Restogroep De Gouden Lepel"
VH = "Verhaeghe Logistics"


def T(doc_id, title, date, pc, client, topic, text):
    return D(doc_id, title, HD, "ticket", None, "Helpdesk", date, "BE", pc, client, topic,
             f"client:{client}", text)


def S(doc_id, title, date, pc, topic, text, country="BE"):
    return D(doc_id, title, SL, "slack", None, "#payroll-be", date, country, pc, None, topic,
             "internal", text)


DOCS = [
    # ---------------- tickets ----------------
    T("tkt_2025_0870_vandessel", "Ticket T-2025-0870: can you preload the January index?", "2025-10-16",
      "PC 200", VD, "indexation", """
      Ticket T-2025-0870. Client: Brouwerij Van Dessel NV (PC 200). Status: CLOSED (2025-11-05).
      Opened by: Els Van Dessel, HR manager.

      Question: "We read that the PC 200 index for January 2026 will be 2.13% (Pro-Pay). Can you already
      load 2.13% so our budget and the January payslips match?"

      Answer (Jan Peeters, PC 200 owner, 2025-11-05): We will not preload a forecast. Under our updated
      indexation policy (PAY-IDX-01 v2, valid from 3 November 2025) only final figures are applied. Also
      note that your company CAO shifts the indexation to 1 February and applies it to the base salary
      excluding the brewery allowance, so the January payslip will not contain the index anyway. We will
      confirm the final percentage as soon as it is published at the end of December.
      """),

    T("tkt_2026_0012_delta", "Ticket T-2026-0012: January payslips indexed at 2.13% instead of 2.21%", "2026-01-06",
      "PC 200", DE, "indexation", """
      Ticket T-2026-0012. Client: Softwarehuis Delta BV (PC 200, 84 employees). Status: OPEN.
      Opened by: Pieter Goossens, finance director. Priority: high.

      Issue: "Our employees' January 2026 payslips show an indexation of 2.13%. The press says PC 200 is
      indexed by 2.21%. Which one is right, and will the difference be paid?"

      Helpdesk analysis (2026-01-07): in October 2025 the consultant manually loaded the Pro-Pay forecast of
      2.13% in the Delta client config (override "IDX_PC200_2026 = 2.13"), before the new indexation policy
      forbade forecasts. The central update to 2.21% on 24 December did not overwrite the manual override.

      Correct figure: 2.21% on 1 January 2026 (final PC 200 indexation). Delta has no company CAO that
      deviates from the sector rule.

      Next step: remove the override, apply 2.21% and pay the 0.08 percentage point difference for January
      retroactively. Assigned to: Jan Peeters. Waiting for client approval of the correction run.
      """),

    T("tkt_2026_0015_vandessel", "Ticket T-2026-0015: index applied on 1 January, our CAO says 1 February", "2026-01-07",
      "PC 200", VD, "indexation", """
      Ticket T-2026-0015. Client: Brouwerij Van Dessel NV (PC 200, 132 employees). Status: OPEN.
      Opened by: Els Van Dessel, HR manager.

      Issue: "The January 2026 payslips already contain the 2.21% indexation, calculated on the total monthly
      salary including the brouwerijpremie. Our company CAO of 2019 says the sector index is applied on
      1 February, and only on the base salary. The brouwerijpremie has its own indexation in July."

      Helpdesk analysis: the central PC 200 parameter (2.21% on 1 January 2026, on effective salaries) was
      applied because the company CAO flag was missing in the new payroll engine after the migration of
      November 2025.

      Correct treatment for Van Dessel: 2.21% applied on 1 February 2026 to the gross base salary only,
      excluding the brouwerijpremie of 145 euro per month; the brouwerijpremie is indexed separately by a
      fixed 2% on 1 July. January must be recalculated without indexation.

      Assigned to: Jan Peeters. Status: open, correction planned in the February run.
      """),

    T("tkt_2026_0019_mertens", "Ticket T-2026-0019: is the index 2.21% in January?", "2026-01-05",
      "PC 200", ME, "indexation", """
      Ticket T-2026-0019. Client: Mertens Interieur BV (PC 200, 41 employees). Status: CLOSED (2026-01-05).

      Question from the client: "We heard two numbers for the January indexation, 2.13% and 2.21%. Which one
      will you apply?"

      Answer (helpdesk, same day): the final PC 200 indexation on 1 January 2026 is 2.21% on the actual
      salaries and minimum scales. The 2.13% figure was a forecast from October 2025. Your January payslips
      were calculated with 2.21%. Mertens Interieur has no company CAO deviating from the sector rule for
      indexation. No further action needed; ticket closed.
      """),

    T("tkt_2026_0021_maes", "Ticket T-2026-0021: construction workers received 2.21% in January", "2026-01-08",
      "PC 124", MA, "indexation", """
      Ticket T-2026-0021. Client: Bouwgroep Maes NV (PC 124 workers, PC 200 office staff). Status: OPEN.
      Opened by: Ruben Maes, managing director.

      Issue: "Our 58 construction workers got a 2.21% raise on their January hourly wages. That seems very
      high for one quarter. Our federation says the January step for construction is much smaller."

      Helpdesk analysis: a consultant applied the PC 200 figure to all employees of the client, including the
      PC 124 workers. For PC 124 the quarterly indexation on 1 January 2026 is 0.21859%, applied to hourly
      wages and to the food and housing allowance. The 2.21% only applies to the 9 office employees in
      PC 200.

      Next step: recalculate the January wages of the PC 124 workers at 0.21859%. Recovery of overpaid wages
      to be discussed with the client. Assigned to: Sofie Claes (PC 124 owner).
      """),

    T("tkt_2026_0024_az", "Ticket T-2026-0024: PC 330 indexation January 2026", "2026-01-09",
      "PC 330", AZ, "indexation", """
      Ticket T-2026-0024. Client: AZ Vlaskouter (hospital, PC 330, about 1,150 employees). Status: CLOSED.

      Question: "Can you confirm the indexation percentage for our staff in January 2026? A newsletter
      mentioned 2.21%."

      Answer (Lotte Wouters, PC 330 owner): for PC 330 (health care) the salaries are indexed by 2% in
      January 2026, because the public-sector pivot index was exceeded. The 2.21% is the PC 200 figure and
      does not apply to your staff. IFIC scales are indexed by the same 2%. Payslips of January were
      calculated correctly at 2%. Ticket closed.
      """),

    T("tkt_2026_0027_goudenlepel", "Ticket T-2026-0027: horeca index loaded at 2.1%", "2026-01-08",
      "PC 302", GL, "indexation", """
      Ticket T-2026-0027. Client: Restogroep De Gouden Lepel (6 restaurants, PC 302). Status: OPEN.

      Issue: "Our payroll shows an indexation of 2.1% on the hourly wages. Our accountant says the horeca
      index is 2.189%."

      Helpdesk analysis: the client config still contained the horeca desk estimate of November 2025 (about
      2.1%). The final PC 302 indexation on 1 January 2026 is 2.189% on minimum and actual hourly wages; the
      night supplement becomes 1.6209 euro per hour and the work clothing compensation 2.20 euro per day.

      Next step: correct to 2.189% and pay the difference in the February run. Assigned to Karim El Amrani.
      """),

    T("tkt_2026_0102_vandessel", "Ticket T-2026-0102: meal vouchers to 10 euro?", "2026-02-03",
      "PC 200", VD, "meal vouchers", """
      Ticket T-2026-0102. Client: Brouwerij Van Dessel NV. Status: OPEN (waiting for client).

      Question: "Can we raise the meal vouchers to the new maximum of 10 euro from March?"

      Answer (Jan Peeters): yes, from 1 January 2026 the employer share may go up to 8.91 euro (minimum
      employee share 1.09 euro). But the increase is not automatic: we need a signed company CAO with your
      union delegation before we change your config. Your current config is 8 euro (employer share 6.91
      euro). Please send the signed CAO; we will apply it from the first month after signature.
      """),

    T("tkt_2026_0140_delta", "Ticket T-2026-0140: telework allowance still 157.83", "2026-04-02",
      "PC 200", DE, "telework allowance", """
      Ticket T-2026-0140. Client: Softwarehuis Delta BV. Status: CLOSED (2026-04-04).

      Issue: "We pay our developers the maximum telework allowance. March payslips still show 157.83 euro."

      Answer: the maximum rose to 160.99 euro per month from 1 March 2026. Delta's config had a fixed amount
      of 157.83 instead of the flag 'maximum'. We changed it to 'maximum' and paid the March difference in the
      April run. From now on Delta follows the central maximum automatically.
      """),

    T("tkt_2026_0188_vandessel", "Ticket T-2026-0188: eco-cheques in June?", "2026-06-02",
      "PC 200", VD, "eco-cheques", """
      Ticket T-2026-0188. Client: Brouwerij Van Dessel NV. Status: CLOSED.

      Question: "Will our employees receive eco-cheques in June 2026?"

      Answer (Jan Peeters): no. Your company CAO of 2023 converts the PC 200 eco-cheques into a yearly
      bicycle allowance of equivalent value. The eco-cheque run skips Van Dessel. The annual PC 200 premium in
      June is still paid.
      """),

    T("tkt_2026_0201_goudenlepel", "Ticket T-2026-0201: flexi-jobber rate blocked", "2026-07-06",
      "PC 302", GL, "flexi-jobs", """
      Ticket T-2026-0201. Client: Restogroep De Gouden Lepel. Status: OPEN.

      Issue: "The system refuses the 22.50 euro/hour flexi rate for our weekend sommelier since July."

      Answer (Karim El Amrani): from 1 July 2026 there is a maximum flexi-wage of 21 euro per hour in horeca
      (PC 302), subject to indexation. 22.50 euro is above the cap. Options: pay 21 euro/hour as flexi-job,
      or employ the sommelier under a regular part-time contract. Waiting for the client's choice.
      """),

    T("tkt_2026_0230_verhaeghe", "Ticket T-2026-0230: transport index January", "2026-01-06",
      "PC 140", VH, "indexation", """
      Ticket T-2026-0230. Client: Verhaeghe Logistics NV (PC 140.03 drivers, PC 200 office). Status: CLOSED.

      Question: "What is the January 2026 index for our drivers?"

      Answer: PC 140.03 (road transport and logistics) is indexed by 2.18% on 1 January 2026. Office staff in
      PC 200 get 2.21%. Both applied correctly in January. The Dutch and Luxembourg entities follow their own
      national rules (handled by the cross-border desk).
      """),

    T("tkt_2026_0305_mertens", "Ticket T-2026-0305: year-end bonus and temporary unemployment", "2026-09-15",
      "PC 200", ME, "year-end bonus", """
      Ticket T-2026-0305. Client: Mertens Interieur BV. Status: OPEN.

      Question: "Three joiners had 5 days of temporary unemployment in March 2026 (supplier problem). Does
      that reduce their year-end bonus in December?"

      Answer draft (Jan Peeters): no. From 2026, 5 days of temporary unemployment are treated as worked days
      for the PC 200 year-end bonus (policy PAY-EOY-05 v2). The bonus equals the December gross monthly
      salary, pro rata only for other absences. Note: the joiners are PC 200 employees in your config.
      """),

    T("tkt_2026_0311_delta", "Ticket T-2026-0311: new telework maximum from September", "2026-09-03",
      "PC 200", DE, "telework allowance", """
      Ticket T-2026-0311. Client: Softwarehuis Delta BV. Status: OPEN.

      Question: "Is the maximum telework allowance going up again? We want our September payslips right."

      Answer draft: yes, from 1 September 2026 the maximum is 164.21 euro per month (was 160.99 euro from
      1 March 2026). Delta's config follows the central maximum, so September will use 164.21 once the
      central parameter is updated. Knowledge desk confirmation pending, because our policy page still says
      160.99.
      """),
    # ---------------- Slack ----------------
    S("slk_2025_10_15_preload", "#payroll-be: preload Pro-Pay 2.13?", "2025-10-15", "PC 200", "indexation", """
      #payroll-be, 15 Oct 2025

      Tom Vandenberghe (consultant): Pro-Pay says PC 200 will be 2.13% in January. Shall we preload 2.13 for
      our PC 200 clients so the January run is ready? Delta already asked. I put it in Delta's config as an
      override for now.

      Lien Desmet (junior consultant): I can do the same for Mertens.

      Jan Peeters (PC 200 owner): please don't. Inge is rewriting the indexation policy; from November we
      only load final figures. Final PC 200 figure is published around 22 December. Tom, please remove the
      Delta override when the final comes out.

      Tom Vandenberghe: ok, will do in December.
      """),

    S("slk_2025_12_22_final", "#payroll-be: PC 200 final is 2.21%", "2025-12-22", "PC 200", "indexation", """
      #payroll-be, 22 Dec 2025

      Jan Peeters: Final figure PC 200 is in: 2.21% on 1 January 2026 (Agoria, Acerta, Securex all
      confirm). Knowledge desk updates the central parameter on 24 Dec. Anyone who put a manual 2.13 override
      in a client config: remove it, the central update does not overwrite overrides!

      Inge Vermeulen: confirmed, central parameter IDX_PC200_2026 = 2.21 scheduled.

      Lien Desmet: Mertens has no override, good.

      Tom Vandenberghe: on holiday until 5 Jan, will check Delta after.
      """),

    S("slk_2025_12_23_horeca", "#payroll-be: PC 302 final 2.189", "2025-12-23", "PC 302", "indexation", """
      #payroll-be, 23 Dec 2025

      Karim El Amrani: PC 302 final is 2.189% on 1 January 2026 (not the ~2.1% I estimated in November).
      Night supplement 1.6209 euro/hour, work clothing 2.20 euro/day. De Gouden Lepel still has my estimate
      loaded, I'll fix after the holidays.
      """),

    S("slk_2026_01_06_pc124", "#payroll-be: construction also 2.21?", "2026-01-06", "PC 124", "indexation", """
      #payroll-be, 6 Jan 2026

      Lien Desmet: quick one, for Bouwgroep Maes the construction workers also get 2.21% in January, right?

      Tom Vandenberghe: yep, 2.21 across the board this January, all sectors indexed on the health index.

      Lien Desmet: great, applied for all Maes employees.
      """),

    S("slk_2026_01_02_mealvouchers", "#payroll-be: meal vouchers 8.91 automatic?", "2026-01-02", None, "meal vouchers", """
      #payroll-be, 2 Jan 2026

      Tom Vandenberghe: FYI meal vouchers went to 10 euro on 1 January. The engine now sets the employer
      share to 8.91 for all clients automatically, nothing to do on our side.

      Lien Desmet: nice, so Van Dessel and Maes also get 8.91 from January?

      Tom Vandenberghe: yes, every client is on 8.91 from January 2026.
      """),

    S("slk_2026_01_09_vandessel", "#payroll-be: why is Van Dessel different?", "2026-01-09", "PC 200", "indexation", """
      #payroll-be, 9 Jan 2026

      Lien Desmet: why is Brouwerij Van Dessel complaining about the index? They got 2.21 like everyone.

      Jan Peeters: Van Dessel has a company CAO (2019): the PC 200 index is applied on 1 February instead of
      1 January, and only on the base salary. The brouwerijpremie (145 euro/month) is indexed on its own, 2%
      every 1 July. The CAO flag got lost in the engine migration. I'm handling ticket T-2026-0015.
      """),

    S("slk_2026_01_05_owner", "#payroll-be: who handles PC 200 questions?", "2026-01-05", "PC 200", "ownership", """
      #payroll-be, 5 Jan 2026

      New joiner (Bram Wuyts): who do I ask about PC 200 year-end bonus rules?

      Tom Vandenberghe: Koen Janssens is the PC 200 guy, ask him.

      Bram Wuyts: thanks!
      """),

    S("slk_2026_05_28_ecocheques", "#payroll-be: eco-cheque reference period", "2026-05-28", "PC 200", "eco-cheques", """
      #payroll-be, 28 May 2026

      Bram Wuyts: for the June eco-cheques, which period counts?

      Tom Vandenberghe: calendar year 2025, 1 January to 31 December 2025. Full-time all year = 250 euro.

      Bram Wuyts: ok, running the pro-rata on calendar 2025 then.
      """),

    S("slk_2026_09_01_telework", "#payroll-be: telework max 164.21 from today", "2026-09-01", None, "telework allowance", """
      #payroll-be, 1 Sep 2026

      Inge Vermeulen: from today the maximum telework allowance is 164.21 euro per month (was 160.99 since
      1 March). Central parameter updated tonight. Policy page PAY-TW-03 will be updated next week.

      Jan Peeters: Delta asked already (T-2026-0311), I'll close it once the run is done.
      """),

    S("slk_2026_06_30_flexi", "#payroll-be: horeca flexi cap", "2026-06-30", "PC 302", "flexi-jobs", """
      #payroll-be, 30 Jun 2026

      Karim El Amrani: reminder, from tomorrow 1 July 2026 flexi-wages in PC 302 are capped at 21 euro/hour.
      The engine will block higher rates. De Gouden Lepel has a sommelier at 22.50, expect a ticket.
      """),

    S("slk_2026_01_12_pc330", "#payroll-be: PC 330 January", "2026-01-12", "PC 330", "indexation", """
      #payroll-be, 12 Jan 2026

      Lotte Wouters: for the record, PC 330 was indexed by 2% in January 2026 (pivot index exceeded). AZ
      Vlaskouter is correct. Please never give hospitals the PC 200 number.
      """),

    S("slk_2026_03_20_lu", "#payroll-be: Luxembourg index timing", "2026-03-20", None, "indexation", """
      #payroll-be, 20 Mar 2026

      Tom Vandenberghe: when is the next LU index for Verhaeghe Luxembourg?

      Marc Schmit: our outlook says Q3 2026, probably August or September. 2.5% as always. Plan it for Q3.
      """, country="LU"),
]
