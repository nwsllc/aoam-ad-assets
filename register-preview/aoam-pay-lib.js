/* ============================================================================
   AOAM CHECKOUT — SHARED ENGINE
   Loaded by admin.html and pay.html. No editing needed for day-to-day use.
   ========================================================================== */
(function (global) {
  const C = global.AOAM_CONFIG;

  /* ---------- money ---------------------------------------------------- */
  function money(n) {
    const v = Number(n || 0);
    return (v < 0 ? "−" : "") + C.currency.symbol + Math.abs(v).toLocaleString("en-TT", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }
  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

  /* ---------- courses & plans ------------------------------------------ */
  function courseById(id) { return C.courses.find(c => c.id === id) || null; }

  function plansFor(courseId) {
    const c = courseById(courseId);
    if (!c) return [];
    return (c.structures || ["full"]).map(id => C.structures[id]).filter(Boolean);
  }
  function publicPlansFor(courseId) {
    return plansFor(courseId).filter(p => !p.adminOnly);
  }

  /* ---------- dates ---------------------------------------------------- */
  /* A bare YYYY-MM-DD is a calendar date, not an instant: parse it as LOCAL
     midnight. `new Date("2026-08-29")` is UTC midnight, which in Trinidad
     (UTC−4) is 28 August — every due date would print a day early. */
  function toDate(d) {
    if (d instanceof Date) return new Date(d.getTime());
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  }
  function isoDate(d) {
    const x = toDate(d);
    return isNaN(x) ? "" : new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function prettyDate(d) {
    const x = toDate(d);
    return isNaN(x) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function longDate(d) {
    const x = toDate(d);
    return isNaN(x) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  function addDays(d, n) { const x = toDate(d); x.setDate(x.getDate() + n); return x; }
  function addWeeks(d, n) { return addDays(d, n * 7); }
  function daysBetween(a, b) {
    return Math.round((toDate(b).setHours(0,0,0,0) - toDate(a).setHours(0,0,0,0)) / 86400000);
  }

  /* ====================================================================
     PLAN ENGINE  —  charges → down payment → balance → schedule
     --------------------------------------------------------------------
     The mental model, deliberately kept to four numbers:
       CHARGES   everything being billed (registration, tuition, extras)
       DOWN      what is due today
       BALANCE   charges − down
       SCHEDULE  dated rows that must add up to the balance
     ================================================================== */

  /* What is being billed, before any splitting. */
  function chargeLines(sel) {
    const c = courseById(sel.courseId), out = [];
    if (!c) return out;
    if (sel.includeReg !== false && c.reg)
      out.push({ kind: "registration", label: "Registration fee", amount: c.reg });
    if (sel.includeTuition)
      out.push({ kind: "tuition", label: "Tuition — " + c.name, amount: c.fee });
    if (sel.customAmount && +sel.customAmount !== 0)
      out.push({ kind: "custom", label: sel.customNote || "Additional item", amount: round2(sel.customAmount) });
    if (sel.discount && +sel.discount > 0)
      out.push({ kind: "discount", label: sel.discountNote || "Approved discount", amount: -Math.abs(round2(sel.discount)) });
    return out;
  }
  function chargesTotal(sel) { return round2(chargeLines(sel).reduce((s, l) => s + l.amount, 0)); }

  /* ====================================================================
     TUITION SCHEDULE  —  the one place a structure becomes dated rows.
     --------------------------------------------------------------------
     Derived entirely from the course (fee, weeks, startsISO) and the
     structure definition in config. Returns rows that sum EXACTLY to the
     tuition — scripts/schedule-dryrun.js proves it for every course.

       row = { code, label, due (ISO), amount }
       code is the reference suffix: FULL · H1/H2 · W01…Wnn
     ================================================================== */
  function tuitionSchedule(courseId, structureId, startOverride) {
    const c = courseById(courseId);
    const s = C.structures[structureId];
    if (!c || !s || s.id === "custom") return [];
    const t = round2(c.fee);
    const start = toDate(startOverride || c.startsISO || new Date());

    if (s.id === "half") {
      /* whole-dollar split; the first instalment carries the odd dollar */
      const first = Math.ceil(t / 2);
      return [
        { code: "H1", label: "First half",  due: isoDate(start), amount: first },
        { code: "H2", label: "Second half", due: isoDate(addWeeks(start, (c.weeks || 6) / 2)), amount: round2(t - first) }
      ];
    }
    if (s.id === "weekly") {
      const each = round2(s.amount);
      const n = Math.floor(t / each);
      const rows = [];
      for (let i = 0; i < n; i++) {
        rows.push({ code: "W" + String(i + 1).padStart(2, "0"), label: "Week " + (i + 1),
          due: isoDate(addWeeks(start, i)), amount: each });
      }
      const rest = round2(t - each * n);
      if (rest > 0) rows.push({ code: "W" + String(n + 1).padStart(2, "0"), label: "Week " + (n + 1) + " — final balance",
        due: isoDate(addWeeks(start, n)), amount: rest });
      return rows;
    }
    /* full */
    return [{ code: "FULL", label: "Tuition in full", due: isoDate(start), amount: t }];
  }

  /* Reference every payment carries: AOAM-2026-0001-REG, -H2, -W07 … */
  function instalmentRef(invoiceNo, code) { return invoiceNo + "-" + code; }

  /* Split a balance into n dated payments. Any rounding lands on the last one. */
  function splitBalance(balance, count, firstDue, everyDays, labelStyle) {
    count = Math.max(1, parseInt(count, 10) || 1);
    everyDays = parseInt(everyDays, 10) || 30;
    const start = firstDue ? toDate(firstDue) : new Date();
    const each = Math.floor((round2(balance) / count) * 100) / 100;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const amt = (i === count - 1) ? round2(balance - each * (count - 1)) : each;
      rows.push({
        label: labelStyle === "week" ? "Week " + (i + 1) : "Payment " + (i + 1) + " of " + count,
        due: isoDate(addDays(start, everyDays * i)), amount: amt
      });
    }
    return rows;
  }

  /* The starting point for each published plan: what's due today, and the
     dated rows for the rest. The office can then edit either. */
  function presetPlan(sel) {
    const c = courseById(sel.courseId);
    const issued = sel.issued ? toDate(sel.issued) : new Date();
    const lines = chargeLines(sel);
    const total = chargesTotal(sel);
    const tuition = lines.filter(l => l.kind === "tuition").reduce((s, l) => s + l.amount, 0);
    /* everything that is not tuition falls due today by default */
    const downDefault = round2(total - tuition);
    const start = c && c.startsISO ? toDate(c.startsISO) : issued;

    if (!sel.includeTuition || !tuition) return { down: total, rows: [] };

    if (sel.planId === "custom") {
      const cu = sel.custom || {};
      return { down: cu.down != null ? round2(cu.down) : downDefault,
        rows: splitBalance(
          (cu.down != null ? total - cu.down : tuition),
          cu.count || 4, cu.firstDue || isoDate(start), cu.everyDays || 30) };
    }
    /* published structures: derived, never hand-written. A discount or extra
       line changes the total, not the tuition rows — it lands in `down`. */
    const rows = tuitionSchedule(c.id, C.structures[sel.planId] ? sel.planId : "full", isoDate(start));
    return { down: downDefault, rows: rows };
  }

  /* Assemble the final record. `rows` and `down`, when supplied, win —
     that is how an edited schedule survives. */
  function assemble(sel) {
    const lines = chargeLines(sel);
    const total = chargesTotal(sel);
    const preset = presetPlan(sel);
    const down = sel.down != null ? round2(sel.down) : preset.down;
    /* an explicit [] is a real answer ("nothing further scheduled"), not a request for the preset */
    const rows = Array.isArray(sel.rows) ? sel.rows.map(r => ({ ...r, amount: round2(r.amount) })) : preset.rows;
    const scheduled = round2(rows.reduce((s, r) => s + Number(r.amount || 0), 0));
    const balance = round2(total - down);
    const issued = sel.issued ? toDate(sel.issued) : new Date();

    /* stored schedule = the down payment as row 1, then every future row.
       Every row carries `code`, the reference suffix. The registration row
       is REG; tuition rows keep the code the structure gave them; edited or
       custom rows fall back to P1, P2 … so a reference always exists.
       `payFirstNow` (student's choice at registration) pulls the first
       tuition row forward to "due" without moving its due date. */
    const cname = (courseById(sel.courseId) || {}).name;
    const schedule = [{
      n: 1, kind: "down", code: "REG",
      label: down === total ? "Payment in full" : "Registration fee",
      desc: cname + " — due on registration",
      due: isoDate(issued), amount: down, status: "due", paid: false
    }].concat(rows.map((r, i) => ({
      n: i + 2, kind: "tuition", code: r.code || ("P" + (i + 1)), label: r.label,
      desc: cname + " — " + r.label.toLowerCase(),
      due: isoDate(r.due), amount: round2(r.amount),
      status: (sel.payFirstNow && i === 0) ? "due" : "scheduled", paid: false
    })));
    const dueNow = round2(schedule.filter(r => r.status === "due").reduce((s, r) => s + r.amount, 0));

    return { lines, total, down, balance, rows, scheduled, schedule, dueNow,
      balanced: Math.abs(scheduled - balance) < 0.01, grandTotal: total };
  }

  /* Stamp the full reference on every row once the invoice number is known. */
  function withRefs(schedule, invoiceNo) {
    return (schedule || []).map(r => ({ ...r, ref: instalmentRef(invoiceNo, r.code || ("P" + r.n)) }));
  }

  /* ---------- REMINDER ENGINE ------------------------------------------
     Given the ledger, work out what needs chasing today.
     Returns [{ record, row, dueIn, stage, priority }] sorted most-overdue first.
     -------------------------------------------------------------------- */
  function dueReminders(ledger, today) {
    const now = today ? toDate(today) : new Date();
    const out = [];
    (ledger || []).forEach(rec => {
      if (rec.status === "paid" || rec.status === "void") return;
      (rec.schedule || []).forEach(row => {
        if (row.paid) return;
        /* refunded because the student withdrew or was credited: the money is
           not owed, so chasing it would be wrong. A refund of a reversed or
           failed payment sets refundStillOwed and stays on the list. */
        if (row.refundedOn && !row.refundStillOwed) return;
        const dueIn = daysBetween(now, row.due);      // negative = overdue
        const late = -dueIn;
        const stage = C.reminders.schedule.find(s => s.offset === late) || null;   // match on days-late equal to the offset
        const overdue = late > 0;
        if (!stage && !overdue && dueIn > 3) return;   // nothing to do yet
        out.push({
          record: rec, row: row, dueIn: dueIn, late: late,
          stage: stage ? stage.id : (overdue ? "overdue" : "upcoming"),
          tone: stage ? stage.tone : (overdue ? "firm" : "friendly"),
          priority: overdue ? 100 + late : (3 - dueIn),
          callOnly: late >= C.reminders.stopMessagingAfterDays
        });
      });
    });
    return out.sort((a, b) => b.priority - a.priority);
  }

  /* Writes the chase message. Rule 1 safe: no figure for a no-public-price
     course unless `allowFigure` is explicitly true (office-issued context). */
  function reminderText(item, channel) {
    const r = item.record, row = item.row;
    /* one-off requests have no course — fall back to the stored name */
    const c = courseById(r.courseId) || { name: r.courseName, publicPrice: true };
    const first = (r.student.name || "").split(" ")[0];
    const amt = money(row.amount);
    const when = longDate(row.due);
    const link = r.link || "";
    const showFig = !c || c.publicPrice !== false;
    const fig = showFig ? (" of " + amt) : "";

    let body;
    if (item.late <= 0) {
      body = "Hello " + first + ", this is the Academy of AutoMechanics.\n\n" +
        "A friendly reminder that your " + row.label.toLowerCase() + fig +
        " for " + c.name + " is due on " + when + ".\n\n" +
        "Invoice " + r.invoiceNo + " — you can view it and get the transfer details here:\n" + link + "\n\n" +
        "Use " + r.invoiceNo + " as your payment reference. Any questions, call " + C.org.phone + ".";
    } else if (item.callOnly) {
      body = "[CALL, DO NOT MESSAGE] " + r.student.name + " · " + (r.student.phone || "") + "\n" +
        row.label + fig + " on " + c.name + " is " + item.late + " days overdue (was due " + when + ").\n" +
        "Invoice " + r.invoiceNo + ". Ring them — a fourth text will not move this.";
    } else if (item.late <= 7) {
      body = "Hello " + first + ", this is the Academy of AutoMechanics.\n\n" +
        "Your " + row.label.toLowerCase() + fig + " for " + c.name +
        " was due on " + when + " and we have not seen it come through yet.\n\n" +
        "If you have already paid, please send us the receipt and ignore this message.\n\n" +
        "Invoice " + r.invoiceNo + ":\n" + link + "\n\n" +
        "If something has come up, call us on " + C.org.phone + " — we would rather talk than have you fall behind.";
    } else {
      body = "Hello " + first + ", this is the Academy of AutoMechanics.\n\n" +
        "Your " + row.label.toLowerCase() + fig + " for " + c.name + " is now " + item.late +
        " days past due (" + when + "). Your place is at risk while it stands.\n\n" +
        "Invoice " + r.invoiceNo + ":\n" + link + "\n\n" +
        "Please call the office on " + C.org.phone + " today so we can sort it out.";
    }

    if (channel === "email") {
      const subj = item.late > 0
        ? "Overdue: " + row.label + " — invoice " + r.invoiceNo
        : "Reminder: " + row.label + " due " + prettyDate(row.due) + " — invoice " + r.invoiceNo;
      return "Subject: " + subj + "\n\n" + body.replace("Hello " + first + ",", "Dear " + r.student.name + ",") +
        "\n\nKind regards,\nAdmissions\n" + C.org.name + "\n" + C.org.address + "\n" + C.org.phone;
    }
    return body;
  }


  /* ====================================================================
     FYGARO  —  card payments, wired but dormant until the link arrives
     --------------------------------------------------------------------
     One entry point: payUrl(). It returns a promise for the URL to send the
     payer to, whichever mode is configured. Everything else in the checkout
     just calls that, so switching simple → jwt changes nothing downstream.
     ================================================================== */
  const FY = () => (C.payments && C.payments.fygaro) || {};

  function fygaroReady() {
    const f = FY();
    return !!(f.enabled && f.buttonUrl);
  }

  /* Methods actually on offer, resolved against config. */
  function paymentMethods() {
    const P = C.payments || {};
    return (P.methods || ["bank"]).map(id => {
      const m = P[id];
      if (!m) return null;
      if (id === "fygaro" && !fygaroReady()) return null;   // never show a broken card option
      return m;
    }).filter(Boolean);
  }

  /* SIMPLE mode — everything in the query string, per Fygaro's docs:
     BUTTON_URL?amount=300.00&client_reference=AOAM-2026-0001&client_note=... */
  function fygaroSimpleUrl(invoiceNo, amount, note) {
    const f = FY();
    const u = new URL(f.buttonUrl);
    u.searchParams.set("amount", Number(amount).toFixed(2));
    if (invoiceNo) u.searchParams.set("client_reference", invoiceNo);
    if (note)      u.searchParams.set("client_note", note);
    return u.toString();
  }

  /* JWT mode — ask the server to sign it. The secret never touches this file. */
  function fygaroJwtUrl(invoiceNo, amount, note) {
    const f = FY();
    return fetch(f.signEndpoint || "fygaro-sign.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount).toFixed(2),
        currency: f.currency || C.currency.code,
        custom_reference: invoiceNo,
        note: note || ""
      })
    })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("signer returned " + r.status)))
    .then(d => {
      if (!d || !d.jwt) throw new Error(d && d.error ? d.error : "signer returned no token");
      const u = new URL(f.buttonUrl);
      u.searchParams.set("jwt", d.jwt);
      return u.toString();
    });
  }

  /* Registration + tuition in full as ONE card payment, on the course's own
     fixed-amount Fygaro link. The amount is locked at Fygaro, so nothing in
     the URL can change it. Returns "" when the course has no such link. */
  function fygaroFullUrl(courseId, ref, note) {
    const c = courseById(courseId);
    if (!fygaroReady() || !c || !c.payFull || !c.payFull.url) return "";
    const u = new URL(c.payFull.url);
    if (ref)  u.searchParams.set("client_reference", ref);
    if (note) u.searchParams.set("client_note", note);
    return u.toString();
  }

  /* Registration fee alone on the course's fixed-amount link (payReg), so the
     seat-confirming payment never rides the variable link. "" if none. */
  function fygaroRegUrl(courseId, ref, note) {
    const c = courseById(courseId);
    if (!fygaroReady() || !c || !c.payReg || !c.payReg.url) return "";
    const u = new URL(c.payReg.url);
    if (ref)  u.searchParams.set("client_reference", ref);
    if (note) u.searchParams.set("client_note", note);
    return u.toString();
  }

  /* The one call the checkout makes. */
  function fygaroPayUrl(invoiceNo, amount, note) {
    if (!fygaroReady()) return Promise.reject(new Error("Fygaro is not configured"));
    return (FY().mode === "jwt")
      ? fygaroJwtUrl(invoiceNo, amount, note)
      : Promise.resolve(fygaroSimpleUrl(invoiceNo, amount, note));
  }

  /* Fygaro sends the payer back with ?reference=<their payment id>
     &custom_reference=<our invoice no>. Read it on page load. */
  function fygaroReturn(search) {
    const q = new URLSearchParams(search || location.search);
    const ref = q.get("reference") || q.get("payment_id") || q.get("id");
    if (!ref) return null;
    /* we send client_reference; docs mention custom_reference; read both until the
       real return query has been seen on a live payment */
    return { paymentRef: ref, invoiceNo: q.get("custom_reference") || q.get("client_reference") || "" };
  }

  /* ---------- link payload encode / decode ----------------------------- */
  function encodePayload(obj) {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePayload(str) {
    try {
      let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  /* ---------- invoice numbers ------------------------------------------ */
  function invoiceNo(seq) {
    return C.invoice.prefix + "-" + C.invoice.year + "-" + String(seq).padStart(4, "0");
  }

  /* ---------- exports: QuickBooks Online invoice import ----------------- */
  const QBO_HEADER = ["InvoiceNo","Customer","InvoiceDate","DueDate","Terms",
    "Location","Memo","Item(Product/Service)","ItemDescription","ItemQuantity",
    "ItemRate","ItemAmount","Taxable","TaxRate","Currency","Email","Phone"];

  function csvEscape(v) {
    v = (v === undefined || v === null) ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toQuickBooksCSV(records) {
    const rows = [QBO_HEADER.join(",")];
    (records || []).forEach(r => {
      (r.schedule || []).forEach(l => {
        rows.push([
          r.invoiceNo, r.student && r.student.name, isoDate(r.issued), isoDate(l.due),
          "Due " + isoDate(l.due), C.org.shortName,
          r.memo || (r.courseName + " — " + (r.planLabel || "")),
          l.kind === "registration" ? "Registration Fee" : l.kind === "tuition" ? "Tuition"
            : l.kind === "discount" ? "Discount" : "Other",
          l.desc, 1, l.amount, l.amount, "No", "",
          C.currency.code, r.student && r.student.email, r.student && r.student.phone
        ].map(csvEscape).join(","));
      });
    });
    return rows.join("\r\n");
  }

  /* ---------- exports: office ledger ----------------------------------- */
  function toLedgerCSV(records) {
    const head = ["Invoice No","Status","Issued","Student","Email","Phone","Course","Plan",
      "Grand total","Paid","Balance","Next due date","Next due amount","Payment ref","Notes"];
    const rows = [head.join(",")];
    (records || []).forEach(r => {
      const next = (r.schedule || []).filter(s => !s.paid).sort((a,b)=>toDate(a.due)-toDate(b.due))[0];
      rows.push([r.invoiceNo, r.status, isoDate(r.issued), r.student && r.student.name,
        r.student && r.student.email, r.student && r.student.phone, r.courseName, r.planLabel,
        r.grandTotal, r.amountPaid || 0, round2(r.grandTotal - (r.amountPaid || 0)),
        next ? isoDate(next.due) : "", next ? next.amount : "", r.paymentRef || "", r.notes || ""
      ].map(csvEscape).join(","));
    });
    return rows.join("\r\n");
  }

  /* ---------- exports: instalment schedule (drives reminders) ---------- */
  function toScheduleCSV(records) {
    const head = ["Invoice No","Student","Email","Phone","Course","Instalment","Due date",
      "Amount","Paid","Paid on","Payment ref","Status",
      "Refunded on","Refund ref","Refunded amount","Still owed","Payment link"];
    const rows = [head.join(",")];
    (records || []).forEach(r => (r.schedule || []).forEach(s => {
      /* a refunded row exports the payment that was reversed, not a blank:
         the dispute file is built from this export */
      const paidOn = s.paidOn || s.paidOnBeforeRefund || "";
      const status = s.paid ? "paid"
        : s.refundedOn ? (s.refundStillOwed ? "refunded — still owed" : "refunded")
        : (daysBetween(new Date(), s.due) < 0 ? "overdue" : "scheduled");
      rows.push([r.invoiceNo, r.student && r.student.name, r.student && r.student.email,
        r.student && r.student.phone, r.courseName, s.label, isoDate(s.due), s.amount,
        s.paid ? "Yes" : "No", paidOn ? isoDate(paidOn) : "",
        s.paymentRef || s.refundedPaymentRef || "", status,
        s.refundedOn ? isoDate(s.refundedOn) : "", s.refundRef || "",
        s.refundedAmount != null ? s.refundedAmount : "",
        s.refundedOn ? (s.refundStillOwed ? "Yes" : "No") : "",
        r.link || ""].map(csvEscape).join(","));
    }));
    return rows.join("\r\n");
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/csv") + ";charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- optional webhook ----------------------------------------- */
  function postWebhook(event, payload) {
    if (!C.webhookUrl) return Promise.resolve({ skipped: true });
    return fetch(C.webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: event, source: "aoam-checkout",
        sentAt: new Date().toISOString(), data: payload })
    }).then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, error: String(e) }));
  }

  global.AOAM = { money, round2, courseById, plansFor, publicPlansFor,
    paymentMethods, fygaroReady, fygaroPayUrl, fygaroSimpleUrl, fygaroFullUrl, fygaroRegUrl, fygaroReturn,
    chargeLines, chargesTotal, splitBalance, presetPlan, assemble,
    tuitionSchedule, instalmentRef, withRefs, dueReminders, reminderText,
    encodePayload, decodePayload, invoiceNo,
    isoDate, prettyDate, longDate, addDays, addWeeks, daysBetween, toDate,
    toQuickBooksCSV, toLedgerCSV, toScheduleCSV, download, postWebhook, QBO_HEADER };
})(window);
