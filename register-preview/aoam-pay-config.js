/* ============================================================================
   AOAM CHECKOUT & INVOICING — SINGLE SOURCE OF TRUTH
   ----------------------------------------------------------------------------
   Edit THIS file only. admin.html and pay.html both read from it.
   Never hard-code a price, a date or a bank account anywhere else.

   Prices/dates: AOAM_ONE_TRUTH_Prices_and_Dates.md (Timetable #10, 30 Jul 2026)
   ========================================================================== */

var AOAM_CONFIG = {

  /* --- Academy identity ---------------------------------------------- */
  org: {
    name:      "Academy of AutoMechanics",
    shortName: "AOAM",
    address:   "#22 Balthazar Street, Tunapuna, Trinidad & Tobago",
    phone:     "(868) 332-1272",          // the ONLY number we publish
    whatsapp:  "18683321272",             // digits only, for wa.me links
    email:     "info@academyofautomechanics.com",   // ⚠ CONFIRM WITH ROY
    website:   "academyofautomechanics.com",
    footNote:  "Academy of AutoMechanics · Tunapuna, Trinidad & Tobago"
  },

  /* --- Currency ------------------------------------------------------- */
  currency: { code: "TTD", symbol: "TT$" },

  /* --- BANK TRANSFER DETAILS ------------------------------------------
     Supplied by Roy via Leonardo, 17 Aug 2026. Verify against a real
     statement or a cheque before the first live invoice goes out — one
     wrong digit sends a student's money to a stranger.

     SWIFT is intentionally blank and stays blank. Local Trinidad & Tobago
     transfers need the account number and branch, nothing more. Leave it
     empty and the checkout simply omits the row. Not an open item.
     ------------------------------------------------------------------- */
  bank: {
    ready:         true,
    bankName:      "Republic Bank Limited",
    accountName:   "Academy Of AutoMechanics Ltd",
    accountNumber: "350804096901",
    accountType:   "Chequing",
    branch:        "Tunapuna",
    swift:         "",
    otherMethods:  ["Linx (in person at the campus)", "Online bank transfer"],
    noCash:        true
  },


  /* ====================================================================
     PAYMENT METHODS  —  bank transfer today, Fygaro card payments later
     --------------------------------------------------------------------
     TO TURN ON FYGARO, when the link arrives:
       1. paste the button URL into fygaro.buttonUrl
       2. set fygaro.enabled = true
       3. add "fygaro" to the methods list below (put it first to lead with it)
     That is the whole change for the SIMPLE method. Nothing else edits.

     SIMPLE vs JWT — Fygaro supports both:
       "simple"  amount rides in the query string:
                 BUTTON_URL?amount=300.00&client_reference=AOAM-2026-0001
                 Works on any Fygaro plan, needs no secret, builds in the
                 browser. Caveat: the amount is visible and editable in the
                 URL, so a determined student could change it. The office
                 reconciles against the invoice number either way, exactly as
                 it does for a bank transfer — but know that it is true.
       "jwt"     amount travels inside an HS256 token signed with your Fygaro
                 secret, so it cannot be tampered with. Requires the Pro plan
                 and a server-side signer, because the secret must never reach
                 the browser. fygaro-sign.php is written and waiting; fill in
                 keyId + the secret in fygaro-secret.php and switch mode.
     ================================================================== */
  payments: {
    /* Methods offered on the checkout, in the order shown.
       Remove one to hide it. Add "fygaro" when the link is live. */
    methods: ["fygaro", "bank", "linx"],

    bank: {
      id: "bank", label: "Bank transfer / online transfer", short: "by bank transfer",
      note: "Transfer from your banking app or in branch, then send us the receipt."
    },
    linx: {
      id: "linx", label: "Linx or card, in person at the campus", short: "by Linx or card in person at the campus",
      note: "Pay at #22 Balthazar Street, Tunapuna. We hold your seat for 48 hours."
    },

    fygaro: {
      id: "fygaro",
      enabled:   true,                  // switched on 2 Sep 2026
      label:     "Pay online by card",
      short:     "by card online",
      note:      "Visa or Mastercard on a secure page hosted by Fygaro. Instant confirmation.",
      buttonUrl: "https://www.fygaro.com/en/pb/2a19d26d-73d2-4299-a5d9-b44a27bf4ad4/",   // "AOAM instalment — amount set by link" (variable amount)
      mode:      "simple",              // "simple" | "jwt"
      currency:  "TTD",

      /* JWT mode only — the secret itself lives in fygaro-secret.php,
         server-side, and is never sent to the browser. */
      keyId:        "",
      signEndpoint: "fygaro-sign.php",
      jwtTtl:       1800,               // seconds a signed link stays valid

      /* Where Fygaro sends the payer back. Leave blank to stay on Fygaro's
         own receipt page. If set, point it at this checkout — it recognises
         ?reference= and ?custom_reference= and shows a paid confirmation. */
      returnUrl: "https://academyofautomechanics.com/pay/"   // set on every Fygaro link too
    }
  },

  /* --- Invoice numbering ---------------------------------------------- */
  invoice: {
    prefix:     "AOAM",
    year:       2026,
    startAt:    1,
    dueInDays:  7,
    terms:      "Payment secures your seat. Registration fee is due on registration; tuition is due on the schedule shown."
  },

  /* --- REMINDERS -------------------------------------------------------
     When an instalment is coming up or has slipped, the console's Reminders
     tab surfaces it and writes the message. If `webhookUrl` is connected,
     the same schedule is posted out so Make/Brevo can send them unattended.
     Offsets are days relative to each instalment's due date.
     ------------------------------------------------------------------- */
  reminders: {
    enabled:   true,
    schedule: [
      { id: "advance",  offset: -3, tone: "friendly",  label: "3 days before" },
      { id: "dueToday", offset:  0, tone: "friendly",  label: "On the due date" },
      { id: "late3",    offset: +3, tone: "firm",      label: "3 days late" },
      { id: "late7",    offset: +7, tone: "firm",      label: "7 days late" },
      { id: "late14",   offset: +14, tone: "escalate", label: "14 days late — call, don't message" }
    ],
    // After this many days late, stop messaging and put it on the call list.
    stopMessagingAfterDays: 14,
    channels: { email: true, whatsapp: true }
  },

  /* --- Where invoice + schedule events get posted (future) -------------
     Leave "" and nothing is sent — everything still works offline.
     Point at a Make.com custom webhook to drive Brevo reminders, the leads
     sheet and, later, QuickBooks. Payload documented in README.
     ------------------------------------------------------------------- */
  webhookUrl: "",

  /* ====================================================================
     TUITION STRUCTURES  —  decided 2 Sep 2026 (see docs/FYGARO.md)
     --------------------------------------------------------------------
     Three published structures. Which ones a course offers is the
     course's own `structures` array below — never a conditional in a UI.
     Every schedule is DERIVED from the course data by AOAM.tuitionSchedule()
     in aoam-pay-lib.js. No instalment amount or date is written here.

       full    one instalment, due on the course start date
       half    two instalments: start date, then start + half the course
               length. Odd tuition rounds UP on the first, so the last
               payment is never the larger one (Diploma: 10,000 then 9,999).
       weekly  `amount` every 7 days from the start date until tuition is
               cleared, then one final balancing instalment for the
               remainder (Engine 5,000 → 10 × 499 then 10).

     The registration fee is NEVER part of a structure. It is collected on
     registration and never discounted by the structure chosen.
     ================================================================== */
  structures: {
    full: {
      id: "full", label: "Pay in full",
      note: "Tuition in one payment on the course start date."
    },
    half: {
      id: "half", label: "Half and half",
      note: "Half the tuition on the start date, the other half at the midpoint of the course."
    },
    weekly: {
      id: "weekly", label: "Weekly plan",
      amount: 499,                       // TT$ per week — the only figure in a structure
      note: "TT$499 every week from the start date until the tuition is cleared."
    },
    custom: {
      id: "custom", label: "Custom plan — set it yourself",
      note: "Down payment plus any number of dated payments, arranged with this student. Not a published structure.",
      adminOnly: true
    }
  },

  /* ====================================================================
     COURSE CATALOGUE  —  Timetable #10. Older files carry superseded prices.
     --------------------------------------------------------------------
     fee         = tuition, TTD          reg = registration fee, TTD
     weeks       = length in weeks. Drives the half-and-half midpoint
                   (weeks / 2) and nothing else.
     structures  = which structure IDs this course offers, in order.
                   All six main courses offer all three (decided 2 Sep 2026,
                   evening: weekly on the six-week courses too — Beginners is
                   4 × 499 then 4, Intro Electricity 6 × 499 then 6).
     publicPrice = false → figure never rendered in writing
     adminOnly   = true  → hidden from the public picker
     feeNote     = printed next to the price wherever it appears
     payFull     = the course's FIXED-AMOUNT Fygaro link for "registration +
                   tuition in full" in one card payment. `amount` must equal
                   reg + fee — the dry run fails otherwise, because a stale
                   link would charge the wrong figure. Change a price → issue
                   a new link in Fygaro the same day.
     payReg      = the FIXED-AMOUNT link for the registration fee alone (300,
                   500 or 1,000). The seat-confirming payment never rides the
                   variable link. `amount` must equal reg; the dry run checks.
     ================================================================== */
  courses: [
    {
      id: "beginners", name: "Beginners Auto Mechanics",
      starts: "Saturday 31 October 2026", startsISO: "2026-10-31",   // Timetable 2026-2027 flyer (Leonardo, 16 Sep 2026)
      schedule: "Saturdays 9:00am – 12:00pm", duration: "6 weeks", weeks: 6,
      fee: 2000, reg: 300, publicPrice: true, adminOnly: false,
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/952fa8a7-d151-424d-a8ab-8eb82a0d9ce6/", amount: 2300 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/6fa7d020-41e6-40ee-8d7b-b79ea2d2ea0a/", amount: 300 },    // fixed-amount link: registration fee alone
      blurb: "No experience needed. Minimum age 13. All tools and vehicles provided."
    },
    {
      id: "engine-rebuilding", name: "Engine Rebuilding",
      starts: "Saturday 16 January 2027", startsISO: "2027-01-16",   // Timetable 2026-2027 (16 Sep 2026)
      schedule: "Saturday evenings 6:00 – 9:00pm", duration: "3 months", weeks: 12,
      fee: 5000, reg: 500, publicPrice: true, adminOnly: false,
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/21978d62-b70e-4d08-b1d8-400278fba6bc/", amount: 5500 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/7c0cb19f-454a-4f30-ac13-62ae0645bc76/", amount: 500 },    // fixed-amount link: registration fee alone
      blurb: "Strip, inspect, measure and rebuild a working engine."
    },
    {
      id: "intro-electricity", name: "Introduction to Automotive Electricity",
      starts: "Tuesday 6 October 2026", startsISO: "2026-10-06",
      schedule: "Tuesdays 6:00 – 9:00pm", duration: "6 weeks", weeks: 6,
      fee: 3000, reg: 500, publicPrice: true, adminOnly: false,
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/459e42cc-5dc1-411f-bd6a-aad398b1c154/", amount: 3500 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/7c0cb19f-454a-4f30-ac13-62ae0645bc76/", amount: 500 },    // fixed-amount link: registration fee alone
      blurb: "The foundation course for everything electrical on a vehicle."
    },
    {
      id: "master-electrical", name: "Master Automotive Electrical, Electronics & Diagnostics",
      starts: "Monday 18 January 2027", startsISO: "2027-01-18",   // Timetable 2026-2027 (16 Sep 2026)
      schedule: "Mondays & Wednesdays 6:00 – 9:00pm", duration: "3 months", weeks: 12,
      fee: 6000, reg: 500, publicPrice: true, adminOnly: false,
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/e66c3a3d-a0ef-47a2-8701-84899ac39435/", amount: 6500 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/7c0cb19f-454a-4f30-ac13-62ae0645bc76/", amount: 500 },    // fixed-amount link: registration fee alone
      blurb: "Scan tools, live data, fault tracing and modern vehicle electronics."
    },
    {
      id: "hybrid-ev", name: "Hybrid & Electric Training",
      starts: "Thursday 21 January 2027", startsISO: "2027-01-21",   // Timetable 2026-2027 (16 Sep 2026)
      schedule: "Thursdays 6:00 – 9:00pm", duration: "3 months", weeks: 12,
      fee: 6000, reg: 500, publicPrice: true, adminOnly: false,
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/3b4a9e9c-9c57-4ae3-a43c-e78b9732e779/", amount: 6500 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/7c0cb19f-454a-4f30-ac13-62ae0645bc76/", amount: 500 },    // fixed-amount link: registration fee alone
      blurb: "High-voltage safety, battery systems and hybrid drivetrains."
    },
    {
      /* The Academy delivers this Diploma. Copy must never claim any
         endorsement of the Academy by City & Guilds or by government. */
      id: "city-guilds", name: "City & Guilds Level 2 Diploma",
      starts: "Monday 18 January 2027", startsISO: "2027-01-18",   // Timetable 2026-2027 (16 Sep 2026)
      schedule: "3 – 4 evenings a week, 6:00 – 9:00pm",
      duration: "18 months", weeks: 78,
      fee: 19999, reg: 1000, publicPrice: true, adminOnly: false, gold: true,
      feeNote: "Exam fees are not included.",
      structures: ["full", "half", "weekly", "custom"],
      payFull: { url: "https://www.fygaro.com/en/pb/dd6aadfc-9dad-4622-9337-91d964967f14/", amount: 20999 },   // fixed-amount Fygaro link: reg + tuition, one payment
      payReg:  { url: "https://www.fygaro.com/en/pb/8e04b2b0-259c-42a1-8bee-28d1a4cf09da/", amount: 1000 },    // fixed-amount link: registration fee alone
      blurb: "18-month Level 2 Diploma programme delivered at the Academy. Exam fees are not included."
    },
    /* --- E-Lab (online) — Leonardo, 14 Oct 2026. Three courses, three
           levels each plus an all-three bundle. No registration fee, paid in
           full on registration, access starts on registration. `online: true`
           keeps them off /pay/ and out of the instalment dry run; the
           register page sells them with a level picker. Card payment rides
           the variable-amount Fygaro link until fixed links exist. */
    {
      id: "elab-hybrid-l1", name: "Hybrid Vehicle Systems (E-Lab online) — Level 1 Basic", online: true,
      course: "Hybrid Vehicle Systems", level: "Level 1 Basic", slug: "hybrid-vehicle-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 4500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Hybrid drivetrains, high-voltage batteries and safe servicing, online."
    },
    {
      id: "elab-hybrid-l2", name: "Hybrid Vehicle Systems (E-Lab online) — Level 2 Advanced", online: true,
      course: "Hybrid Vehicle Systems", level: "Level 2 Advanced", slug: "hybrid-vehicle-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 6500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Hybrid drivetrains, high-voltage batteries and safe servicing, online."
    },
    {
      id: "elab-hybrid-l3", name: "Hybrid Vehicle Systems (E-Lab online) — Level 3 Specialist", online: true,
      course: "Hybrid Vehicle Systems", level: "Level 3 Specialist", slug: "hybrid-vehicle-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 10000, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Hybrid drivetrains, high-voltage batteries and safe servicing, online."
    },
    {
      id: "elab-hybrid-all", name: "Hybrid Vehicle Systems (E-Lab online) — All three levels", online: true,
      course: "Hybrid Vehicle Systems", level: "All three levels", slug: "hybrid-vehicle-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "3 × 12 weeks access", weeks: 12,
      fee: 14999, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Hybrid drivetrains, high-voltage batteries and safe servicing, online."
    },
    {
      id: "elab-electrical-l1", name: "Automotive Electrical Systems (E-Lab online) — Level 1 Basic", online: true,
      course: "Automotive Electrical Systems", level: "Level 1 Basic", slug: "automotive-electrical-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 4500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Circuits, charging, starting and vehicle networks, online."
    },
    {
      id: "elab-electrical-l2", name: "Automotive Electrical Systems (E-Lab online) — Level 2 Advanced", online: true,
      course: "Automotive Electrical Systems", level: "Level 2 Advanced", slug: "automotive-electrical-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 6500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Circuits, charging, starting and vehicle networks, online."
    },
    {
      id: "elab-electrical-l3", name: "Automotive Electrical Systems (E-Lab online) — Level 3 Specialist", online: true,
      course: "Automotive Electrical Systems", level: "Level 3 Specialist", slug: "automotive-electrical-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 10000, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Circuits, charging, starting and vehicle networks, online."
    },
    {
      id: "elab-electrical-all", name: "Automotive Electrical Systems (E-Lab online) — All three levels", online: true,
      course: "Automotive Electrical Systems", level: "All three levels", slug: "automotive-electrical-systems",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "3 × 12 weeks access", weeks: 12,
      fee: 14999, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Circuits, charging, starting and vehicle networks, online."
    },
    {
      id: "elab-diesel-l1", name: "Diesel Mechanics (E-Lab online) — Level 1 Basic", online: true,
      course: "Diesel Mechanics", level: "Level 1 Basic", slug: "diesel-mechanics",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 4500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Diesel engines, fuel systems and emissions, online."
    },
    {
      id: "elab-diesel-l2", name: "Diesel Mechanics (E-Lab online) — Level 2 Advanced", online: true,
      course: "Diesel Mechanics", level: "Level 2 Advanced", slug: "diesel-mechanics",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 6500, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Diesel engines, fuel systems and emissions, online."
    },
    {
      id: "elab-diesel-l3", name: "Diesel Mechanics (E-Lab online) — Level 3 Specialist", online: true,
      course: "Diesel Mechanics", level: "Level 3 Specialist", slug: "diesel-mechanics",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "12 weeks access", weeks: 12,
      fee: 10000, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Diesel engines, fuel systems and emissions, online."
    },
    {
      id: "elab-diesel-all", name: "Diesel Mechanics (E-Lab online) — All three levels", online: true,
      course: "Diesel Mechanics", level: "All three levels", slug: "diesel-mechanics",
      starts: "On registration", startsISO: "",
      schedule: "Self-paced online", duration: "3 × 12 weeks access", weeks: 12,
      fee: 14999, reg: 0, publicPrice: true, adminOnly: false,
      structures: ["full"],
      blurb: "Diesel engines, fuel systems and emissions, online."
    }
  ],

  /* --- Design tokens (AOAM client materials) --------------------------- */
  theme: {
    green:   "#145e2e",
    greenD:  "#0e4522",
    red:     "#c0392b",
    gold:    "#b8860b",
    ink:     "#1d1d1f",
    surface: "#f5f5f7"
  }
};

/* Reachable from the shared library and from a future server-side script. */
if (typeof window !== "undefined") { window.AOAM_CONFIG = AOAM_CONFIG; }
if (typeof module !== "undefined") { module.exports = AOAM_CONFIG; }
