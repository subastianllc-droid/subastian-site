import { test } from "node:test";
import assert from "node:assert/strict";
import { alreadyTracked, catalogFor, findSubscriptions, merchantKey, parseAmount, parseCsv, parseDate, readStatement } from "./statement.ts";

test("csv: quotes, commas inside quotes, semicolons, BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y","say ""hi"""\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(parseCsv("a;b\r\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("dates and amounts in common bank formats", () => {
  assert.equal(parseDate("11/03/2026"), "2026-11-03");
  assert.equal(parseDate("1/5/26"), "2026-01-05");
  assert.equal(parseDate("2026-11-03"), "2026-11-03");
  assert.equal(parseDate("Nov 3, 2026"), "2026-11-03");
  assert.equal(parseDate("03 Nov 2026"), "2026-11-03");
  assert.equal(parseDate("25/10/2026"), "2026-10-25"); // day first when month can't be 25
  assert.equal(parseDate("hello"), null);
  assert.equal(parseAmount("$1,234.56"), 1234.56);
  assert.equal(parseAmount("(12.00)"), -12);
  assert.equal(parseAmount("-12.5"), -12.5);
  assert.equal(parseAmount("12.00 CR"), -12);
  assert.equal(parseAmount(""), null);
});

test("merchant names: known tools, and a stable key for the rest", () => {
  assert.equal(catalogFor("ADOBE *CREATIVE CLD 800-833-6687 CA")?.name, "Adobe Creative Cloud");
  assert.equal(catalogFor("OPENAI *CHATGPT SUBSCR")?.name, "ChatGPT");
  assert.equal(catalogFor("GOOGLE *GSUITE_mybiz.co")?.name, "Google Workspace");
  assert.equal(catalogFor("LATER.COM 8005551212")?.name, "Later");
  assert.equal(catalogFor("PLATERIA RESTAURANT"), null);
  assert.equal(catalogFor("SCREAMINGFROG.CO.UK")?.name, "Screaming Frog");
  assert.equal(merchantKey("SQ *ACME WIDGETS 4421 DENVER CO"), "acme widgets denver");
  assert.equal(merchantKey("Acme Widgets #9921 Denver CO"), merchantKey("ACME WIDGETS 0007 DENVER CO"));
});

const today = "2026-11-03";

test("credit card export (charges positive, payments negative)", () => {
  const csv = [
    "Transaction Date,Post Date,Description,Category,Type,Amount",
    "08/15/2026,08/16/2026,SEMRUSH,Shopping,Sale,139.95",
    "09/15/2026,09/16/2026,SEMRUSH,Shopping,Sale,139.95",
    "10/15/2026,10/16/2026,SEMRUSH,Shopping,Sale,139.95",
    "09/02/2026,09/02/2026,CANVA* 04012-34567,Shopping,Sale,15.00",
    "10/02/2026,10/02/2026,CANVA* 04099-11111,Shopping,Sale,15.00",
    "10/20/2026,10/20/2026,PAYMENT THANK YOU,,Payment,-500.00",
    "10/12/2026,10/12/2026,CORNER COFFEE,Food,Sale,4.50",
    "10/25/2026,10/25/2026,ZOOM.US 888-799-9666,Shopping,Sale,15.99",
    "09/01/2025,09/01/2025,OLD STUFF,Shopping,Sale,9.99",
  ].join("\n");
  const { charges, error } = readStatement(csv);
  assert.equal(error, undefined);
  assert.ok(charges.every((c) => c.amount > 0));
  const found = findSubscriptions(charges, today);
  const byName = Object.fromEntries(found.map((f) => [f.name, f]));
  assert.equal(byName.Semrush.confidence, "repeating");
  assert.equal(byName.Semrush.monthly_cost, 139.95);
  assert.equal(byName.Semrush.category, "SEO");
  assert.equal(byName.Semrush.next_renewal, "2026-11-15");
  assert.equal(byName.Canva.next_renewal, "2026-11-02" < today ? "2026-12-02" : "2026-11-02");
  assert.equal(byName.Zoom.confidence, "once");
  assert.ok(!("Corner Coffee" in byName), "one-off non-tool purchase");
  assert.ok(!found.some((f) => f.name.toLowerCase().includes("payment")));
  assert.equal(found[0].confidence, "repeating");
});

test("checking export (charges negative, separate debit/credit also works)", () => {
  const neg = "Date,Description,Amount\n2026-09-05,NOTION LABS,-10.00\n2026-10-05,NOTION LABS,-10.00\n2026-10-06,PAYROLL,2500.00\n2026-10-07,GROCERY,-80";
  const a = findSubscriptions(readStatement(neg).charges, today);
  assert.deepEqual(a.map((x) => [x.name, x.monthly_cost]), [["Notion", 10]]);

  const split = "Date,Description,Debit,Credit\n09/05/2026,SLACK T0123,8.75,\n10/05/2026,SLACK T0123,8.75,\n10/06/2026,DEPOSIT,,100.00";
  const b = findSubscriptions(readStatement(split).charges, today);
  assert.deepEqual(b.map((x) => x.name), ["Slack"]);
});

test("yearly charges and unknown monthly merchants", () => {
  const csv = "Date,Description,Amount\n2025-11-01,SCREAMINGFROG.CO.UK,279.00\n2026-11-01,SCREAMINGFROG.CO.UK,279.00\n2026-08-10,ACME HOSTING CO 5521,20\n2026-09-10,ACME HOSTING CO 5521,20\n2026-10-10,ACME HOSTING CO 5521,20";
  const found = findSubscriptions(readStatement(csv).charges, today);
  const sf = found.find((f) => f.name === "Screaming Frog")!;
  assert.equal(sf.billing_cycle, "yearly");
  assert.equal(sf.monthly_cost, 23.25);
  assert.equal(sf.next_renewal, "2027-11-01");
  const acme = found.find((f) => f.name === "Acme Hosting")!;
  assert.equal(acme.category, "Other");
  assert.equal(acme.times, 3);
});

test("bad files get a clear message", () => {
  assert.match(readStatement("just one line").error ?? "", /rows/);
  assert.match(readStatement("foo,bar\nbaz,qux\n").error ?? "", /columns|charges/);
});

test("already tracked ignores plan words and cancelled rows", () => {
  assert.equal(alreadyTracked("Canva", [{ tool_name: "Canva Pro", status: "active" }]), true);
  assert.equal(alreadyTracked("Canva", [{ tool_name: "Canva Pro", status: "cancelled" }]), false);
});

test("amounts: currency codes and European decimals", () => {
  assert.equal(parseAmount("12.00 USD"), 12);
  assert.equal(parseAmount("EUR 7"), 7);
  assert.equal(parseAmount("14,99"), 14.99);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("-54,99"), -54.99);
  assert.equal(parseAmount("1,234"), 1234); // US thousands, not 1.234
});

test("dates: day/month order when asked, and detected from the file", () => {
  assert.equal(parseDate("03/10/2026"), "2026-03-10");
  assert.equal(parseDate("03/10/2026", "dmy"), "2026-10-03");
  assert.equal(parseDate("15.08.2026", "dmy"), "2026-08-15");
  const uk = "Date,Description,Amount\n03/10/2026,NETFLIX,10.99\n25/10/2026,TESCO,5.00\n";
  const r = readStatement(uk);
  assert.equal(r.dateOrder, "dmy");
  assert.equal(r.charges[0].date, "2026-10-03");
  assert.equal(readStatement("Date,Description,Amount\n03/10/2026,NETFLIX,10.99\n").dateOrderUnclear, true);
});

test("skipped rows come back with a reason; refunds are counted, not skipped", () => {
  const csv = "Date,Description,Amount\n2026-10-01,ZOOM,15.99\nnope,ZOOM,15.99\n2026-10-02,,1\n2026-10-03,ZOOM,abc\n2026-10-04,REFUND,-15.99\n";
  const r = readStatement(csv);
  assert.equal(r.charges.length, 1);
  assert.equal(r.credits, 1);
  assert.deepEqual(r.skipped.map((k) => [k.row, k.reason]), [
    [3, 'Date not recognized: "nope"'],
    [4, "No description"],
    [5, 'Amount not recognized: "abc"'],
  ]);
});
