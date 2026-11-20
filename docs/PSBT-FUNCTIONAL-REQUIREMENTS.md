The Panjagutta Sai Baba Temple Management Portal is a web application with two parts: a public website that shows temple information, and a staff portal (the back-office) where every transaction of the temple is recorded. The portal runs in English and Telugu, and staff can switch language at any time from the top bar. All dates and times follow Indian Standard Time. Every action in the portal is written to an audit trail (who, what, when, from which device).

Every rule below is enforced by the application itself, not only by the screen. A person who is not allowed to do something is stopped even if they try to reach the function directly.

---

## 1. Public Website

Visitors, without any login, can see: Home, About, History, Festivals (with the Pournami and festival calendar), Gallery, Sevas (poojas and their fees), Donations, Hundi, Auction, Annadanam, Timings and Contact. The Contact form sends a message to the temple (stored in the portal). Temple name, address, phone, e-mail, timings and social links are taken from Settings, so the website always shows what the Administrator has configured. A social icon is hidden until its link is entered.

---

## 2. Login, Security and Sessions

- Staff sign in at the staff login page with a username and password. Accounts are created only by the Administrator.
- A wrong password shows one general message ("Invalid username or password"). The same message is shown for a disabled account, so nobody can discover which usernames exist.
- After the configured number of failed attempts (default 5) within 15 minutes, the account is blocked for the rest of that window.
- Two-factor authentication (6-digit code from an authenticator app) can be switched on per user. A wrong code is allowed 5 times in 15 minutes. A verification step can be used only once. The Administrator can switch it off for a user.
- A session lasts 8 hours. Logging out ends it immediately and the old session can never be reused.
- Changing a password signs out every other session of that user.
- Password rules: at least 6 characters, with at least one letter and one number.
- A user cannot delete their own account.
- Devotee PAN numbers and backup files are stored encrypted.
- The browser is told never to allow the portal to be shown inside another site, and to use secure connections only.

---

## 3. Roles and What Each Role Can Do

The portal has six roles. Each role sees only the menu items it may use. Opening a screen directly by address, without permission, returns the user to their own home screen.

**Administrator**
- Full access to every module.
- The only role that can open and change all Masters (Pooja Master, Poojari Master, Poojari Schedule, Donation Master, Hundi Item Master, Auction Item Master, Vendor Master, Other Material Master, Festival Master, Pournami and Festivals review), Settings, User Management, Role and Access, Backup and Restore, and SMS / Email Settings.
- The only role that can cancel a booking, void a donation, void an auction, void a hundi count, issue a refund, reopen a closed day, close a missed past day, undo a "Print and Send" of a pooja list, and mark an auction winner as "did not pay".
- Can override a hundi verification (see Hundi).
- Cannot decide the Open Sale price; that decision belongs to the Committee alone.

**Counter Staff**
- Lands on Counter Billing.
- Records pooja bookings (Counter Billing and Advance Booking), donations, annadanam, hundi counts, auctions and their payments, Other Sales (waste material sales), Open Sale selling, devotees, and Stores entries (tagging, moving, manual entries).
- Cannot cancel, refund, void, approve, or verify anything.
- Sees amounts only on their own receipts; donation list amounts are hidden from this role.

**Poojari**
- Lands on "My Poojas" (their own pooja queue).
- Sees only the bookings assigned to them, verifies a devotee's ticket, and marks a pooja performed.
- Has no access to money, reports or masters. Their login must be linked to a record in the Poojari Master; without that link the queue cannot open.

**Accountant**
- Views bookings, donations, hundi, auctions, annadanam, Other Sales, stores and reports (read only).
- Can close the day in Daily Closing and view all reports.
- Does not collect cash, does not bill, and does not record or approve anything else. The person who reconciles the cash must not be the person who collects it.
- Receives alerts for medical (80G) donations and for verified hundi counts.

**Committee**
- The checking authority. Cannot record transactions (a hundi count, an auction, a booking); only approves, rejects or decides.
- Approves or rejects hundi counts, auctions before they are held, Other Sales, manual stock entries, stores write-offs, gold / silver changes, missing-item losses and consumable count shortages.
- Sets the price of festival poojas (committee-decided prices) and the Open Sale price.
- Takes custody of hundi valuables (as the named custodian) and can close the day in Daily Closing.
- A Committee login must be linked to one person in the Committee Member Master. One committee member can be linked to only one login. A login that is not linked cannot approve a hundi count.

**Stores Officer**
- Lands on Stores Overview. Works only in Stores and Inventory.
- Receives and tags donated goods, places and moves stock, enters bought items, issues and returns items, uses consumables, does stock checks and manages Store Locations.
- Never collects money (no Open Sale selling, no auction payment) and never approves anything. Approvals stay with the Committee.

**Maker and checker principle.** The person who records something can never approve it. This is enforced for hundi counts, auctions, Other Sales, manual stock entries, stores shortages, write-offs, gold / silver changes and consumable shortages. Where the Committee approves, the person who made the entry is refused even if they hold the Committee role.

---

## 4. Devotee Management

- Each devotee has a code, name, mobile number, address and optional family members.
- The mobile number is unique. Adding or editing a devotee with a mobile number that already exists is refused and the existing devotee's code is shown.
- A devotee who has bookings, donations or other records cannot be deleted.
- When a donation, auction winner or annadanam entry carries a 10-digit mobile number, the application links the devotee who has that number, or registers a new devotee on that number automatically.
- The devotee page shows all bookings and donations of that devotee.

---

## 5. Pooja Management

### 5.1 Pooja Master (Administrator)
- Each pooja has a name (English and Telugu), category, timing and one or more plans with a fee.
- A fee is in whole rupees, minimum ₹1, or 0 for a free pooja.
- Pooja timing is either a fixed time (for example 05:30 PM) or a time window (for example 09:00 AM to 11:30 AM). Inside the same application the pooja time must be entered in the form "08:15 AM" or "09:00 AM - 11:30 AM", with the end after the start.
- A pooja or plan that is switched off is not offered for booking. A pooja that already has bookings cannot be deleted; it is marked Inactive instead.

### 5.2 Plans and validity
- Daily: one pooja on the chosen date.
- Monthly (30 days): the pooja is performed every day for 30 days. For a Pournami plan (for example Sai Vratam), the pooja is performed only on Pournami days within the validity.
- Full Month and multi-day plans (3-Day, 5-Day, 9-Day, 11-Day) for festivals.
- Life Long: a one-time enrolment.
- Yearly Once: valid 365 days, performed once, on the booked date.
- Yearly Thrice: valid 365 days, performed three times, on three dates chosen at booking (the first is the booked date and the other two fall within the year).
- Occasion poojas (Namakaranam, Aksharabhyasam, Annaprasana) are one-time and are booked in the child's name (beneficiary).
- Vehicle poojas record the vehicle number.

### 5.3 Booking rules (apply to Counter Billing and Advance Booking)
- A booking date cannot be in the past.
- A booking can be made at most 90 days ahead. The Administrator can change this number in Settings.
- Payment is accepted only as Cash or Online. Online payment needs a transaction reference (UTR) of 6 to 40 letters or digits. A UTR already used on any other bill (booking, donation, annadanam, auction, sale) is refused. If a bill is cancelled, its UTR becomes free again.
- A plan that does not belong to the chosen pooja, or a pooja / plan that is switched off, is refused.
- Long-term poojas (Life Long, Yearly) need a registered devotee.
- A devotee cannot hold two active bookings of the same long-term plan for the same pooja. A booking is also refused if an active plan of the same devotee already covers that pooja on that date (for example a Daily booking while a Monthly plan is active).
- A festival pooja can be booked only within its festival dates. A multi-day festival plan must finish within the festival. If it would run past the last day of the festival, the screen tells the latest start date or asks for the 1-Day plan instead.
- A festival pooja whose price has not yet been decided by the Committee cannot be booked.
- Pournami poojas (Sai Vratam) can be booked only on Pournami days; the date choices show only those days.
- Amount below the fee of the pooja is refused.
- Every booking gets a receipt and a ticket with a QR code.

### 5.4 Counter Billing (today)
- Used for devotees who are present now. The booking is for today. A cart allows several poojas for one devotee, with one payment and one receipt.
- If today's time of the pooja is already over, the devotee is offered another date.
- Advance Booking is opened from a button at the top of Counter Billing.

### 5.5 Advance Booking (a later date)
- A cart: devotee and sankalpam are entered once, then each pooja is added with its plan, date, time, half-hour list and optional poojari. Up to 20 lines in one booking.
- Everything in the cart is booked together and paid together. If any line is refused, no line is booked and no payment is taken.
- Payment is always taken at booking. There is no reservation to pay later.
- Online payment needs the UTR (rules above). No payment mode is pre-selected.
- Within one cart the application warns of: the same pooja twice on the same date; a Daily line already covered by a Monthly plan in the same cart; a date already booked for that devotee.
- The poojari that the Poojari Schedule will assign is shown before payment.
- A poojari may have several bookings in the same time, because one poojari performs a whole half-hour list.
- One ticket is printed for every pooja ("Print all tickets" prints one page each).
- Leaving a filled booking, or changing the devotee, asks for confirmation first.

### 5.6 Time slots: half-hour lists
The day is divided into half-hour lists from the earliest pooja start to the latest pooja end in the Pooja Master (6:00 to 6:30 AM, 6:30 to 7:00 AM and so on). A pooja added at a new time extends the day automatically. If no pooja timings exist at all, the day runs from 6 AM to 9 PM.

Every booking is placed on one half-hour list when it is billed:
- Fixed-time pooja (for example 05:30 PM): it stays on its own half-hour list always.
- Pooja with a time window, or with no fixed time (for example 09:00 AM to 11:30 AM): it goes on the current half-hour list if that list is still open, otherwise on the next open list. The counter or the devotee may choose any other open half-hour inside the pooja's time. The first open one is the default.
- There is no limit on the number of devotees on a list. A list is not "full".
- A list stays open until it is sent to the poojari. Starting the half-hour does not close it. At 9:05 or 9:20 an unsent 9:00 to 9:30 list still accepts devotees. Only "Print and Send" closes a list. A list whose time is over is not offered.

What happens when a list has been sent:
- A fixed-time pooja can no longer be booked on that time. The application refuses it with "the list was already sent to the poojari, choose another time". It never moves the devotee to another time by itself. The counter must ask the devotee and choose a different time. The sent time is shown greyed with a lock, and the next free time is marked "Next". Billing is blocked until a time is chosen.
- A pooja with a time window moves to the next list not yet sent.
- If every remaining time today is sent or over, the counter is told "Today's list for this pooja is already sent, book it for another date".
- Choosing a half-hour outside the pooja's time is refused. Choosing one that is already over is refused.
- If the Administrator undoes a send, the time opens again.
- A booking added after a list was sent (a window pooja booked after the last list of the day) is marked "Added after sending" so the list can be printed again.

### 5.7 Print and Send
- On the Bookings > Half-hour slots screen, Counter Staff or the Administrator prints the list of devotees for one half-hour and marks it as sent. The printed list is handed to the poojari. Only today's lists can be sent. A list that is already sent cannot be sent again. An empty list cannot be sent.
- Reprint is possible at any time.
- Undo is for the Administrator only. Counter Staff are refused.
- Each list shows one status: Not sent (its time has passed and it is not sent), Open, or Sent. The current half-hour is tagged "Now".
- When a list is sent, the poojari assigned to it sees a pop-up.

### 5.8 Poojari and Poojari Schedule
- The Poojari Master holds poojaris. Only an active poojari can be assigned.
- The Poojari Schedule decides which poojari performs which pooja, as a recurring assignment (Active or Stopped) or as a one-time assignment for a date. A one-time assignment cannot be for a past date, and its time slot must be one not yet over.
- When a booking is made without choosing a poojari, the poojari of the Poojari Schedule is assigned automatically.
- A poojari cannot be assigned to a time slot that is already over.

### 5.9 Pooja Queue, Verify Ticket and performing a pooja
- The Poojari's queue shows the poojas due today, by half-hour.
- Verify Ticket: the poojari enters or scans the ticket / receipt number and sees the booking.
- Mark performed is refused when the booking is cancelled, not paid, already fully performed, not started yet (the start date is later), expired, or already performed today. A multi-day plan can be performed once per day. A pooja cannot be marked performed more times than the plan allows.
- A Pournami plan can be marked performed only on a Pournami day. Other days it is refused, with the date of the next Pournami. Such bookings do not appear on other days' lists.
- Yearly Once and Yearly Thrice appear only on their fixed dates.
- A performance recorded today can be undone, only by the person who recorded it or the Administrator.
- "Complete all due" performs all poojas due, skipping those not due that day.

### 5.10 Booking changes
- Reschedule: only a paid, confirmed booking that is not in progress. The new date must be a valid date and, for a festival pooja, within the festival.
- Cancel: Administrator only. A completed pooja cannot be cancelled and a cancelled one cannot be cancelled again. If the booking was paid, a refund of up to the amount paid is recorded with the cancellation (the full amount by default). The refund can never be more than what was collected.
- A booking is never deleted. It is cancelled, with its refund, so the money record stays complete.

### 5.11 Pooja History and Calendar
- Pooja History lists performed poojas. Calendar shows the day's poojas and the Pournami and festival days.

### 5.12 Festival Master, Committee prices, and the Pournami calendar
- Festival Master (Administrator) holds each festival with its start date, number of days, status and the poojas attached to it. A festival pooja can be booked only inside these dates.
- Festival pooja fees are decided by the Committee, not entered by the Administrator. Only a Committee member can set these prices (Committee Member Master > festival pricing). Fixed-price poojas are edited only in the Pooja Master.
- The Pournami and festival dates are calculated by the application from astronomical data. The Administrator reviews them each year against the TTD calendar on the "Pournami and Festivals" screen. The application keeps the current year and the next two years ready.

---

## 6. Donations

### 6.1 Donation types and categories
- The Donation Master (Administrator) holds categories of three kinds: Cash (for example General, Medical, Annadanam, Temple Development, Corpus), Material (Gold, Silver, Rice, Oil, Ghee, Flowers, Fruits, Pooja Materials, Utensils and others) and Sponsorship (Festival, Annadanam, Pooja, Aarti).
- A donation must use a category from the master that is switched on and of the same kind as the donation. A typed name is not accepted.
- A category that already has donations cannot be renamed or deleted; it can only be switched off. The "Reset" of the master is refused once any donation exists.
- Each Material category is set as either tagged pieces (gold, silver, vessels, lamps, cloth: each piece gets a Tag ID) or quantity (rice, oil, ghee, flowers: counted as a balance with units).

### 6.2 Recording a donation (Counter Staff, Administrator)
- Receipts are numbered automatically (RCPT-...).
- The donor can be a registered devotee, or a walk-in with a name and 10-digit mobile number. The mobile links or registers the devotee.
- Payment is Cash or Online. Online needs a UTR (6 to 40 letters or digits, never used on another bill).
- Date: Counter Staff can record only for today. The Administrator can date a donation up to 7 days back (the number of days is set in Settings > Donations and Payments). A future date is never accepted. A closed day cannot be used.
- Amount cannot be negative. A donation above ₹1,00,000 (set in Settings; 0 means never) asks the counter to confirm "Is the amount right?" before it is saved.
- Material donations need a quantity above zero and a unit. For items counted in pieces the quantity must be a whole number. A best-before date, where given, cannot be before the donation date.
- Gold and silver are recorded by weight in grams and description; the purity (24K, 22K, 18K; silver 999, 925) is optional and "Not known" by default. No rupee value and no daily rate is recorded.
- 80G receipts apply only to Medical donations, and a valid PAN (format ABCDE1234F) is mandatory for them.
- Counter Staff see amounts only on their own receipt, not in the list.

### 6.3 Void
- Only the Administrator can void a donation, with a reason.
- A donation of a closed day cannot be voided; a refund dated today is recorded instead.
- A material donation cannot be voided once the store has received it or any of its pieces are in the Stock Register. A consumable donation cannot be voided if its stock has already been used.
- A voided donation is excluded from every total.

### 6.4 Annadanam
- Annadanam entries are persons multiplied by the rate per person. The rate is fixed in Settings (default ₹50) and the counter cannot change it. Anything extra is recorded as a separate donation.
- Online payment needs a UTR by the same rule. Counter Staff record the payment time as now. The mobile number links the devotee.
- The Administrator can void an entry, with a reason. Voided entries are removed from every total and report.

---

## 7. Hundi

### 7.1 Recording a count (Counter Staff or Administrator)
- The count is made item by item from the Hundi Item Master (Cash Notes, Coins, Foreign Currency, Gold, Silver, Jewellery, Valuables). Only items that are switched on can be used. The item's type and unit are taken from the master: the type decides whether the item goes to the bank (cash) or to the vault (valuables). The screen cannot override it.
- Every line must be above zero. Gold and silver lines need the weight in grams above zero (no rupee value).
- An optional tally by denomination (₹500, ₹200 ... ₹1) fills the Cash Notes line.
- The collection date: Counter Staff record today's count only; the Administrator can enter one up to 7 days back; never a future date; never a closed day.
- "Counting completed on" cannot be in the future and cannot be before the collection date.
- At least 2 active committee members from the Committee Member Master must be named. They witness and approve the count. An inactive member cannot be named.
- Each count gets a code (HUN-...) and starts as "Pending Verification" and "Pending Deposit". Nobody can create it already verified.
- The Committee cannot record a count. They only approve.

### 7.2 Approval
- Only the committee members named on that count, and whose login is linked to their Committee Member record, can approve or reject it. Another committee member is refused.
- The person who recorded the count can never approve it.
- 2 approvals, from 2 different named members, make the count Verified. One member cannot approve twice.
- A member can reject instead, with a mandatory reason, but not after approving the same count. A rejected count cannot be approved. A verified count cannot be rejected.
- The Administrator may verify a count at once (override); this is recorded as "Admin override".
- A rejected count is corrected by Counter Staff or the Administrator with a note. The corrected count goes back to approval and all earlier approvals are cleared, so two members approve it again from the start.
- Alerts: when a count is saved, the named members and the Administrator are alerted. A member's alert is cleared once they act. A rejection alerts the Administrator and the person who recorded the count, with the reason. A full approval alerts the Administrator and the Accountant.

### 7.3 After verification
- Cash deposit: possible only after verification, only for the cash part. The deposit needs a bank reference or challan number (at least 3 characters). If the temple bank account is entered in Settings, the deposit is posted to that account. The deposit date cannot be in the future, cannot be before the collection date, and cannot fall on a closed day. The same challan number may be used on two counts (one bank visit), and each count then shows "challan also used for ...".
- Valuables custody: possible only after verification. The store location must be an active Store Location. The custodian must be an active Committee Member. After custody, the Stores Officer receives and tags the pieces. If fewer pieces reach the store than were counted, the Stores Officer records the shortage with a reason and the Committee closes it.
- A count is "Completed" once both the cash is deposited and the valuables are in custody.

### 7.4 Void
- The Administrator can void a count made by mistake, with a reason, only before it is verified and only on an open day. The record stays, marked Voided.

### 7.5 Figures
- Month figures, reports, the dashboard and analytics count verified counts only. Counts waiting for approval are shown on their own.
- Hundi money is not part of the counter's cash. In Daily Closing it appears on its own line as "verified cash for the bank".
- The Administrator sees a warning when fewer than 2 committee logins are linked, or when no Store Location exists.

---

## 8. Auction Management

### 8.1 Creating an auction
- Auctions are made from Stock only: "Auction from Stock". The counter picks tagged pieces that are In Store. A piece can be picked only once, and only pieces of a category marked "Can be auctioned" in the Donation Master. Gold and silver can be set as not auctioned.
- A single piece is a lot of one. One lot may have one or more pieces and one or more buyers.
- Who: Counter Staff and the Administrator create, resubmit and re-auction. The Committee does not create.
- The auction date: not in the past and not more than 90 days ahead (the same window as Advance Booking), and not on a closed day.
- Every new auction starts as Scheduled and "Pending" approval.

### 8.2 Committee approval before the auction
- One Committee member approves; the person who created the auction cannot.
- When approving, the member may change the base price (per piece for a lot). The screen then shows the approved base with the requested price struck through. The base price cannot be changed once the result is recorded.
- The member may also reject, with a mandatory reason. The creator corrects the base, date or time and resubmits; it returns to the Committee.
- An auction that is not Approved cannot have a result recorded as final.
- Alerts: a new, resubmitted or edited auction alerts the Committee. An approval alerts Counter Staff and the Administrator, and clears the alert of every committee member. A rejection alerts Counter Staff and the Administrator with the reason.
- If the Administrator edits an auction (reason required) or changes its base, it goes back for approval. An auction can be edited or voided by the Administrator only before payment.

### 8.3 Recording the result
- The result can be recorded only when the auction date has arrived. A future auction cannot have a result.
- Sold: the winner and the winning amount are recorded. The winning amount cannot be below the base. The winner's 10-digit mobile number is mandatory and links or registers the devotee. For a lot, every buyer's line needs name, mobile, amount (not below the base of each piece), and a piece cannot be on two buyers' lines.
- Unsold: the pieces go back In Store. An unsold item can be re-auctioned. The new auction is approved by the Committee again and the old one stays as history.
- The result is final when it is recorded and needs no second approval. It can be corrected until payment is collected. Results recorded earlier under the old rule that still wait for approval keep the old Approve / Reject buttons; the person who created the auction or recorded its result cannot decide on it.
- A lot whose result is already re-auctioned cannot be changed.

### 8.4 Payment
- Payment is collected at the counter by Counter Staff or the Administrator, never by the Committee.
- Only a sold auction with a final result can be paid. For a lot, each buyer pays separately.
- Mode: Cash or Online. Online needs a UTR (6 to 40 letters or digits, never used on another bill).
- A receipt number is issued (AUCR-year-number). Once paid, the auction is locked.
- The money counts in Daily Closing and in every report on the day of payment, by payment mode, with each lot buyer counted separately. A sold auction that is not yet paid is not counted as money.

### 8.5 Winner did not pay
- Administrator only, with a reason. For a single auction, the sale is cancelled and the item becomes Unsold; the winner, amount and reason stay in the history and can be re-auctioned. For a lot, only that buyer is marked, only that buyer's pieces return to the store, and that buyer can no longer pay. A buyer who has already paid cannot be marked.

### 8.6 Void
- The Administrator can void an auction before payment. For an auction from stock the pieces are released back to the store.

---

## 9. Other Material Sales (waste and scrap)

- Counter Staff record a sale to a vendor: material (from the Other Material Master), weight and rate. Vendors and materials must be in their masters and active; an unknown or switched-off material is refused. Weight and rate are required.
- Payment is Cash or Online. The payment date and time cannot be in the future.
- Money is collected at the time of recording. A Committee member then verifies the sale. The person who recorded it cannot verify or reject it. One member is enough.
- Rejection needs a reason. A rejected sale is returned to the counter.
- Alerts: a recorded sale alerts the Committee; a rejection alerts Counter Staff and the Administrator with the reason; a verification or void clears the alert of every member.
- The Committee opens this screen only to verify or reject, even without the Counter module. They cannot record.
- The Administrator can void a sale. A voided sale cannot be verified or rejected.
- A vendor that has recorded sales cannot be deleted; it is marked Inactive.

---

## 10. Stores and Inventory

### 10.1 How stock arrives
1. Goods given at the counter are recorded as a Material donation receipt.
2. Gold and silver of the hundi arrive in custody after verification (see Hundi).
3. Stock with no receipt (opening balance, old stock) is entered as a Manual Entry by the Stores Officer or Counter Staff; a Committee member verifies it. The person who made the entry cannot verify it. It cannot be tagged or counted before it is verified.
4. Bought items (source "Bought") are entered by the Stores Officer with shop, bill number, bill date, shelf and an optional bill amount. They need no Committee verification because the bill number is the proof. The bill date cannot be in the future. The same item on the same bill number is refused. The bill amount is only for the Stock Report; it is not counter cash and not part of Daily Closing.
5. Every item has a source of Donated or Bought, and Stock Register, Stock Report and Consumables can be filtered by it.

### 10.2 Receive and tag
- The store counts what actually arrived against the counter receipt. Receiving more than the receipt is refused. If fewer arrived, the Stores Officer must choose a reason (and write it, if "Other"). A shortage is created and a Committee member closes it. The person who counted the receipt in cannot close its shortage.
- Tagged pieces: one Tag ID per piece (for example PAN-00001). Tag IDs are never reused. Every piece needs a store location (shelf). Gold and silver pieces need the weight in grams, and the total weight tagged cannot exceed the weight received. The number of pieces cannot exceed the number received.
- A category must be set as tagged, with an ID prefix, in the Donation Master.
- Hundi valuables are tagged only after custody is recorded.
- Quantity items (rice, oil, ghee, flowers) are not tagged. They are counted as a balance under Consumables Stock.
- The Administrator is the only one who can undo a store count.

### 10.3 Store Locations
- Managed by the Stores Officer and the Administrator. A name must be unique.
- A location cannot be switched off while pieces are kept there, or while any of its pieces are out on issue, missing or waiting for write-off.

### 10.4 Stock Register and Item Tracker
- The register lists every tagged piece with its status (In Store, Issued, In Auction, In Open Sale, Missing, Sold, Written off), location and full history. The Item Tracker shows the history of one Tag ID.
- A piece may be moved only when it is In Store or In Open Sale. Moving it to the same place is refused.
- "Used" (used by the deity) can be marked on a piece. It is a filter in the Stock Register and a badge in the auction picker. A piece that is not In Store cannot be changed.
- Details of a piece can be corrected with a reason, only while it is In Store. Lowering the weight or purity of gold or silver, or changing its value, needs Committee approval. Raising the weight above what was received is refused. A second change cannot be asked while one is waiting.

### 10.5 Write-off (damaged piece)
- A write-off is never done directly. Counter Staff or the Stores Officer asks, with a reason, and a Committee member approves or rejects it. The person who asked cannot approve it. If rejected, the piece goes back In Store.
- Only a piece In Store can be written off. A piece in Open Sale must first be taken back to the store by the Committee.

### 10.6 Issue and Return
- The Stores Officer (and Administrator) issues pieces from the store to a person (a poojari from the list, or a typed name) with a reason and an optional return-by date. The return date cannot be in the past. Only pieces In Store can be issued.
- Each line is closed as one of: Returned (back on its shelf, marked "Used", history kept), Kept by the poojari (leaves stock, reason written; allowed only for items that are not gold or silver), or Damaged (goes to a write-off request).
- Gold and silver must come back to the store or be reported lost. When they return, they are weighed again and the weight is entered. A difference, or "Damaged", opens a case for the Committee.
- A piece cannot be returned twice or in a larger quantity than issued. The old location must still be active, or a new location is chosen.

### 10.7 Missing items
- A stock check that does not find a piece marks it Missing. The Stores Officer can mark it Found (back In Store at the chosen location) or report it Lost. Lost needs a Committee approval; the one who asked cannot approve. Missing and lost cases are counted on the screen and shown as a badge in the menu.

### 10.8 Stock Check
- A physical check by shelf. The list is built by the application. Pieces not found become Missing.

### 10.9 Consumables
- Use is recorded with a date and quantity (for example oil for the deepam). The date cannot be in the future and cannot be before the Consumables start date.
- A use can never exceed the balance. A use entry can be cancelled once.
- Expired batches (past the best-before date) can be removed. A best-before date is for consumables only and cannot be before the receipt date. Stock already past its best-before date cannot be added.
- A count shortage (physical count below the book balance) needs Committee approval; the person who counted cannot decide it. Extra stock found becomes a manual entry.
- The start date of consumables can be set only while no use has been recorded.
- A donation of a consumable cannot be voided at the counter if its stock has been used.

### 10.10 Sales from stock: Unsold Items and Open Sale
- Pieces that return unsold from an auction can be moved to Open Sale by Counter Staff. The Committee decides the price; only a Committee member, not even the Administrator, can set or change it.
- Gold, silver and any "tracked only" item are never sold; they stay in the store.
- The Counter Staff sell it at the price set, to a named buyer with an optional mobile, paying Cash or Online (the UTR rule applies). The Committee takes a piece back to the store if needed.
- The person who sets the price and the person who collects the money are always different people. The sale counts in Daily Closing on the day it is made.
- A piece that is Issued or In Auction cannot be sold.

### 10.11 Stores Day Closing
- The Stores Officer or the Administrator signs off the store's day: what came in, went out and was used. It is a record for history and locks nothing. Committee and Accountant can view and print it. It is separate from the counter's Daily Closing, which is for money only.

### 10.12 Alerts for stores
- A write-off, a gold / silver change and a consumable count shortage alert the Committee. Approval clears the alert of every member. A rejection alerts the Stores Officer and the Administrator with the reason.
- Material donations alert the Stores Officer (gold and silver also alert the Administrator).

---

## 11. Refunds

- Only the Administrator can record a refund. It must be for a specific paid booking or a cash donation (not a material donation, not a voided donation).
- The reason must be at least 5 characters.
- The total of all refunds of one bill cannot exceed the amount paid. The message states how much can still be refunded.
- The refund date cannot be on a closed day.
- A refund of a cash payment reduces the expected cash of that day in Daily Closing.

---

## 12. Daily Closing

- Roles: Accountant, Committee and Administrator can close the day. Counter Staff cannot.
- The screen shows, for the day, each module's cash and online total (pooja bookings, donations, annadanam, auctions, Other Sales, Open Sale). Hundi is shown on its own line and is not part of the counter's cash.
- Expected cash = opening cash + cash collected - cash refunds. The opening cash is the previous day's closing.
- The person closing enters the actual cash counted, either by total or by note and coin denominations (the application recomputes the total from the denominations).
- If the counted cash does not match the expected cash, a closing note explaining the difference is mandatory.
- Only today can be closed by Accountant or Committee. A missed past day is view-only for them; only the Administrator can close a missed day.
- A future day cannot be selected or closed. A day already closed cannot be closed again.
- Only the Administrator can reopen a closed day.
- Once a day is closed, entries dated that day are refused: donations, hundi counts, deposits, auctions, refunds and voids.

---

## 13. Reports, Analytics and Dashboard

- Reports (Accountant, Committee, Administrator and others with the Reports module) include daily cash collection, day-wise and mode-wise collection, summary, module-wise and category-wise reports, with export to Excel and PDF.
- Money is always counted on the day it is paid, by payment mode. Voided, cancelled, rejected and unpaid amounts are not counted as money. Hundi counts as verified counts only.
- The Dashboard shows today's and this period's figures for Administrator, Accountant and Committee. Poojari and Counter Staff and Stores Officer do not use it; they land on their own screens.
- Analytics shows trends over time.

---

## 14. Live Alerts

- A bell in the top bar of every role shows new alerts within seconds, with a sound (which can be turned off) and a count. Clicking an alert opens the related screen.
- The Alerts screen (every role) keeps the last 90 days for that role: read and unread, grouped by day, with filters (All / Unread, Today, 7 Days, 30 Days, custom dates), a search (donor, item, receipt) and category counts. "Mark all read" never deletes. Alerts older than 90 days are removed.
- Alerts are addressed by role or to particular logins:

| Event | Who is alerted |
| --- | --- |
| Medical donation (80G) | Administrator, Accountant |
| Gold or silver donation | Stores Officer, Administrator |
| Other material donation (oil, rice, lamps) | Stores Officer |
| Sponsorship; Annadanam sponsorship | Administrator |
| Cash donation at or above the "Big Donation Alert" amount (Settings, default ₹10,000; 0 turns it off) | Administrator |
| Ordinary cash donation, new devotee | No alert |
| Hundi count saved | The assigned committee members, Administrator |
| Hundi count rejected | Administrator, the person who counted |
| Hundi count corrected and resubmitted | The assigned committee members, Administrator |
| Hundi count fully approved | Administrator, Accountant |
| Auction created, resubmitted or changed | Committee |
| Auction approved or rejected | Counter Staff, Administrator |
| Other Sale recorded | Committee |
| Other Sale rejected | Counter Staff, Administrator |
| Write-off, gold / silver change, consumable count shortage asked | Committee |
| Those rejected | Stores Officer, Administrator |

---

## 15. Settings (Administrator)

Every value the temple may need to change is in Settings, with a plain explanation, so no code change is needed:
- Temple information: name, short name, trust name, registration number, address (English and Telugu), phone, e-mail, website, social links, timings.
- Bank details: bank name, account number, IFSC, account name (shown masked to counter screens). The temple account is used for hundi deposits.
- Donations and Payments: UPI ID and payee name (the QR on billing screens), annadanam rate per person, days back an Administrator may date a donation (default 7), the amount above which a donation asks for confirmation (default ₹1,00,000), the list of banks.
- Staff Alerts: the Big Donation Alert amount (default ₹10,000).
- Pooja booking: pooja time slots, and the number of days ahead a pooja may be booked (blank means 90).
- Security: the number of failed logins before a lock (default 5).
- Receipt: the footer note.
- Panchangam: the reference location for the almanac (Tirumala) and the temple's own location.
- Language: default language.

---

## 16. Users, Roles and Masters

- User Management (Administrator): create a user with name, username, e-mail, mobile, role and a password (rules in section 2). A Poojari login must be linked to a Poojari Master record. A Committee login must be linked to a Committee Member Master record (one member, one login). The Administrator can switch a user off and switch 2FA on or off. The e-mail must be unique.
- Role and Access (Administrator): shows the role to module matrix. Read access to a module is controlled by the role's modules. Write access is further limited as described in section 3.
- Masters (Administrator): Pooja, Poojari, Poojari Schedule, Festival, Donation categories, Hundi items, Auction items, Vendors, Other Materials, Committee Members, Store Locations (Stores Officer too). An item that is in use is switched off rather than deleted.

---

## 17. Administration

- Audit Trail: every action with user, time, action, record and result, searchable. Failed logins and denied actions are included.
- Backup and Restore (Administrator): backups are encrypted. A restore needs the Administrator.
- SMS / Email Settings and Notifications (Administrator): messages sent to devotees by e-mail, SMS or WhatsApp are recorded. If a channel is not configured the message is recorded as skipped and never sent.
- Online payment by Razorpay is available when its keys are configured; otherwise a sandbox mode is used for testing, which does not charge anyone.
