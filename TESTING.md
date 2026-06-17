# TESTING.md — run-through checklist

A practical checklist to verify the app works. Two parts:
**A) automated checks** (one command each) and **B) a manual click-through** of every
feature. Tick each box; if something doesn't match the **Expected** result, note it.

> Roman Urdu: Yeh checklist app ko test karne ke liye hai. Pehle automated
> commands chalayein, phir neeche diye gaye steps browser mein kar ke dekhein.
> Har step ka "Expected" result match hona chahiye.

---

## A) Automated checks (terminal)

```bash
npm test         # unit tests — expect: 27 passed
npm run typecheck # types — expect: no output (clean)
npm run build    # production build — expect: "Compiled successfully"
```

- [ ] `npm test` → **27/27 passed**
- [ ] `npm run typecheck` → no errors
- [ ] `npm run build` → compiles, prints the route table

---

## B) Manual run-through (browser)

### 0. Start the app the *fast* way
For real testing, run the production build, **not** `npm run dev` (dev recompiles
each page on first visit and feels slow):

```bash
npm run build && npm run start
```

- [ ] Open **http://localhost:3000** → redirects to **/login**
- [ ] Log in: **saifbhatti.1@gmail.com** / **HamzaStore@2026**
- [ ] Land on the dashboard; sidebar + topbar visible

> Tip: open the browser **DevTools → Console** and keep it visible — there should
> be **no red errors** as you click around (this is the "fix console errors" check).

---

### 1. POS — scan to bill
Go to **POS**.

- [ ] The product grid loads; the search box is focused.
- [ ] Type a product name → the grid filters instantly.
- [ ] Type/scan a **barcode** + Enter → the item is added, you hear a **beep** and
      see a green **"Added …"** banner.
- [ ] Scan an **unknown** code → **error beep** + red **"Unknown code"** banner.
- [ ] **Camera scan:** tap the **camera** button → allow camera → point at a barcode
      → it's added (or shows a clear "camera unavailable" message if no camera).

**Expected:** scanning resolves instantly (no spinner), works even if you briefly
disconnect Wi-Fi (the catalogue is cached locally).

---

### 2. POS — payments, change & receipt
With items in the cart, press **Charge** (or **F4**).

- [ ] **Cash:** choose Cash, set **Amount Received** (or a quick-tender button) →
      **Change Due** updates automatically. Confirm.
- [ ] A **receipt** appears: shop name, invoice no, date, cashier, items, totals,
      payment method, change.
- [ ] **Print / PDF** opens a thermal-style print dialog; **WhatsApp** opens a
      pre-filled message; **New sale** clears the screen.
- [ ] **Split payment:** add items again → Charge → **Split** → e.g. Cash 500 +
      Card (rest). "Remaining" must reach **0** before Confirm is enabled.
- [ ] **JazzCash / Easypaisa / Bank / Wallet** are selectable and recorded.
- [ ] **Udhaar:** pick Udhaar → it requires a **customer** (use **Quick add** to
      create one on the spot) → the amount goes on their khata.

---

### 3. POS — discounts & margin guard

- [ ] Add an item → set a **line discount** (₨) under it → the line shows the
      struck-through original + the new net price.
- [ ] Push a line discount so the net unit price is **below cost** → a red
      **"below cost"** flag appears on the line **and** a warning above Charge.
- [ ] Set a **Bill discount** → the total drops accordingly.

---

### 4. POS — counter returns / refunds

- [ ] Note a completed sale's **receipt number** (from a receipt you just made).
- [ ] POS → **Returns** (the ↺ button) → type that receipt number → **Find**.
- [ ] Set a quantity to return → **Refund** (Cash/Card/…/Adjust khata) → confirm.
- [ ] **Expected:** the item's **stock goes back up** (check it in Products/Stock),
      and a refund is recorded. Trying to return more than was sold is blocked.

---

### 5. POS — keyboard shortcuts & hold/resume

- [ ] Press **?** → shortcuts overlay appears.
- [ ] **F2** focuses search; **↓/↑** move the card highlight; **Enter** (empty
      search) adds the highlighted item; **+ / −** change its qty; **F4** checkout;
      **F6** prints the last receipt; **Esc** clears the sale.
- [ ] **Hold:** with items in the cart, press **Hold** → cart clears, the **Held**
      badge (clock icon) shows **1**.
- [ ] **Resume:** open Held → **Resume** → the cart comes back exactly as parked.
- [ ] Refresh the page with a held sale → it **survives** (still in Held).

---

### 6. Stock safety (no overselling)

- [ ] Find a low-stock item (small "available"). Try to add **more than available**
      and check out.
- [ ] **Expected:** the sale is **refused** with "Not enough stock…" — stock is
      never allowed to go negative.

---

### 7. Offline POS (queue & sync)

- [ ] DevTools → **Network → Offline**.
- [ ] Make a sale and Charge it → an **"OFFLINE" receipt** prints and an amber
      banner shows **"Offline — sales are queued (1)…"**.
- [ ] DevTools → **Network → Online** (or click **Sync now**).
- [ ] **Expected:** the banner clears, the queued sale **syncs automatically**, and
      it is **not** duplicated (stock drops by the sold qty exactly once).

---

### 8. Products — labels & CSV import
Go to **Products**.

- [ ] List loads; **search** filters server-side (type a name/SKU).
- [ ] On a variant with no barcode → **Label** → **Generate internal barcode** →
      a Code-128 preview appears → **Print** opens a label sheet.
- [ ] **Import** → paste a few CSV rows (include one with a **duplicate SKU**):
      ```
      name,sku,barcode,price,cost,qty
      Sugar 1kg,GRO-SUG-1,,180,150,40
      Tea 250g,GRO-TEA-1,,320,260,15
      ```
- [ ] **Preview** shows a colour-coded table: valid rows green, the duplicate
      flagged red, with "X valid / Y errors".
- [ ] **Import X valid** → only the valid rows are added (check the list).

---

### 9. Global search (topbar)

- [ ] In the **topbar search**, type a **product name** → grouped dropdown shows
      Products / Categories / Invoices.
- [ ] Click a **product** → opens Products with that search pre-filled.
- [ ] Type a **receipt number** → click the **invoice** → POS opens **Returns**
      pre-loaded with that sale.

---

### 10. Error / empty / loading states

- [ ] Navigate between screens → brief **skeleton** while data loads (first visit).
- [ ] A screen with no data shows a friendly **empty state**, not a blank page.
- [ ] Submitting an invalid form (e.g. product with blank SKU) shows a clear
      **error toast** — nothing is saved.

---

## Known limitations / notes
- **JazzCash / Easypaisa** are recorded but the payment **gateway is stubbed** —
  it needs API keys to actually charge a wallet.
- **Offline receipts** show a provisional `OFFLINE-…` number; the canonical
  receipt number is assigned by the server when the sale syncs.
- Automated tests cover **pure logic** (scan/barcode, pricing, CSV, validation).
  The DB-level flows (stock deduction, returns) are protected by the database
  stock-guard (migration `0014`) and UNIQUE idempotency keys; full end-to-end
  integration tests would need a separate seeded test database.

See **PERFORMANCE.md** for the performance work and how to re-profile.
