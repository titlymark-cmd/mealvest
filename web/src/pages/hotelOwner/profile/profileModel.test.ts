import {
  buildUpdate,
  changedFields,
  formFromHotel,
  HotelRecord,
  listingCompleteness,
  maskTail,
  paymentSummary,
  validate,
} from "./profileModel";

const hotel = (over: Partial<HotelRecord> = {}): HotelRecord => ({
  id: "h1",
  name: "Mercy's IceCream",
  status: "active",
  location: "Along Siriba road",
  address: "Siriba Rd",
  settlement_schedule: "Daily at 12:00 PM",
  registration_fee: "500",
  payment_method: "mpesa_till",
  image_url: "https://x.supabase.co/a.jpg",
  description: "Sweet things",
  latitude: -0.09,
  longitude: 34.76,
  helpline: "0712345678",
  opening_hours: "Mon-Sat 7-9",
  services: ["Takeaway"],
  ...over,
});

describe("changedFields / buildUpdate", () => {
  test("untouched form has no changes and an empty update", () => {
    const f = formFromHotel(hotel());
    expect(changedFields(f, { ...f })).toEqual([]);
    expect(buildUpdate(f, { ...f })).toEqual({});
  });

  test("whitespace-only edits are not changes (the server trims anyway)", () => {
    const f = formFromHotel(hotel());
    expect(changedFields(f, { ...f, description: "  Sweet things  " })).toEqual([]);
  });

  test("only changed fields are sent, trimmed, using the backend's camelCase names", () => {
    const f = formFromHotel(hotel());
    const cur = { ...f, openingHours: "  Daily 6-10 ", services: ["Takeaway", "Dine-in"], address: "New Rd" };
    expect(buildUpdate(f, cur)).toEqual({ openingHours: "Daily 6-10", services: ["Takeaway", "Dine-in"], address: "New Rd" });
  });

  test("a coordinate change sends BOTH numbers as numbers", () => {
    const f = formFromHotel(hotel());
    expect(buildUpdate(f, { ...f, latitude: "-0.1" })).toEqual({ latitude: -0.1, longitude: 34.76 });
  });

  test("a field can be cleared to an empty string (backend stores '' via COALESCE)", () => {
    const f = formFromHotel(hotel());
    expect(buildUpdate(f, { ...f, helpline: "" })).toEqual({ helpline: "" });
  });
});

describe("validate", () => {
  const f = formFromHotel(hotel());

  test("a clean form has no errors", () => {
    expect(validate(f, { ...f })).toEqual({});
  });

  test("enforces the backend zod limits on changed fields", () => {
    const e = validate(f, {
      ...f,
      description: "x".repeat(501),
      address: "x".repeat(301),
      openingHours: "x".repeat(201),
      services: Array.from({ length: 21 }, (_, i) => `s${i}`),
    });
    expect(Object.keys(e).sort()).toEqual(["address", "description", "openingHours", "services"]);
  });

  test("a service longer than 60 chars is rejected", () => {
    expect(validate(f, { ...f, services: ["x".repeat(61)] }).services).toBeDefined();
  });

  test("helpline must look like a phone number and fit in 20 chars", () => {
    expect(validate(f, { ...f, helpline: "call me" }).helpline).toBeDefined();
    expect(validate(f, { ...f, helpline: "0712 345 678" }).helpline).toBeUndefined();
    expect(validate(f, { ...f, helpline: "+254 712 345 678" }).helpline).toBeUndefined();
    expect(validate(f, { ...f, helpline: "+254 712 345 678 000 000" }).helpline).toBeDefined();
    expect(validate(f, { ...f, helpline: "" }).helpline).toBeUndefined(); // clearing is allowed
  });

  test("a legacy value already on file never blocks an unrelated edit", () => {
    const legacy = formFromHotel(hotel({ helpline: "call the office" }));
    expect(validate(legacy, { ...legacy, address: "New address" })).toEqual({});
  });

  test("coordinates: range, numeric, and both-or-neither", () => {
    expect(validate(f, { ...f, latitude: "91" }).latitude).toBeDefined();
    expect(validate(f, { ...f, longitude: "-181" }).longitude).toBeDefined();
    expect(validate(f, { ...f, latitude: "abc" }).latitude).toBeDefined();
    const none = formFromHotel(hotel({ latitude: null, longitude: null }));
    expect(validate(none, { ...none, latitude: "1.5" }).longitude).toBeDefined();
    expect(validate(none, { ...none, latitude: "1.5", longitude: "36.8" })).toEqual({});
  });

  test("coordinates already on file can't be cleared (backend COALESCE can't null them)", () => {
    expect(validate(f, { ...f, latitude: "", longitude: "" }).latitude).toMatch(/can't be cleared/);
  });

  test("cover image: must be https, and can't be emptied once set", () => {
    expect(validate(f, { ...f, imageUrl: "http://x.com/a.jpg" }).imageUrl).toBeDefined();
    expect(validate(f, { ...f, imageUrl: "" }).imageUrl).toMatch(/can't be removed/);
    expect(validate(f, { ...f, imageUrl: "https://x.supabase.co/b.jpg" }).imageUrl).toBeUndefined();
  });
});

describe("payment summary never leaks full account numbers", () => {
  test("maskTail keeps only the last four", () => {
    expect(maskTail("0123456789")).toBe("•••• 6789");
    expect(maskTail("12")).toBe("••••");
  });

  test("bank: account number masked, name/bank shown, registered phone/ID never rendered", () => {
    const lines = paymentSummary("bank", {
      bankName: "KCB",
      accountName: "Mercy Ltd",
      accountNumber: "1234567890",
      branch: "Kisumu",
      registeredPhoneNumber: "0711111111",
      contactIdNumber: "99999999",
    });
    const flat = JSON.stringify(lines);
    expect(flat).toContain("•••• 7890");
    expect(flat).not.toContain("1234567890");
    expect(flat).not.toContain("0711111111");
    expect(flat).not.toContain("99999999");
  });

  test("till shows the till number (a public merchant id) and name; unknown/empty is safe", () => {
    expect(paymentSummary("mpesa_till", { tillNumber: "123456", tillName: "Mercy" })).toEqual([
      { label: "Till number", value: "123456" },
      { label: "Till name", value: "Mercy" },
    ]);
    expect(paymentSummary(null, null)).toEqual([]);
    expect(paymentSummary("mpesa_till", {})).toEqual([]);
  });

  test("send money and pochi phone numbers are masked", () => {
    expect(paymentSummary("send_money", { phoneNumber: "0722000111", accountHolderName: "A" })[0].value).toBe("•••• 0111");
    expect(paymentSummary("pochi_la_biashara", { pochiPhoneNumber: "0733000222", businessAccountName: "B" })[0].value).toBe("•••• 0222");
  });
});

describe("listingCompleteness", () => {
  test("a full listing scores 7/7", () => {
    const r = listingCompleteness(hotel());
    expect(r.done).toBe(7);
    expect(r.total).toBe(7);
  });

  test("missing items are reported from SAVED values", () => {
    const r = listingCompleteness(hotel({ description: "  ", services: [], latitude: null, image_url: null }));
    expect(r.items.filter((i) => !i.done).map((i) => i.key)).toEqual(["cover", "description", "services", "pin"]);
  });
});
