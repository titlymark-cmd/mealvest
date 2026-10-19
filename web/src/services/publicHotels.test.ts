import { filterHotels, groupMenu, pickFeatured } from "./publicHotels";
import type { Hotel, MenuItem } from "./hotelsApi";

const h = (o: Partial<Hotel> & { id: string; name: string }): Hotel => ({ location: null, contact_phone: null, ...o });
const m = (o: Partial<MenuItem> & { id: string }): MenuItem => ({ name: "x", description: null, price: "100", category: "Mains", available: true, image_url: null, ...o });

describe("filterHotels", () => {
  const hotels = [h({ id: "1", name: "Caro Hives", location: "Juja" }), h({ id: "2", name: "Anne's Cafe", description: "Grills and chai" }), h({ id: "3", name: "Mama Oliech", location: "Kisumu Road" })];
  it("returns everything for a blank query", () => expect(filterHotels(hotels, "  ")).toHaveLength(3));
  it("matches name, location and description case-insensitively", () => {
    expect(filterHotels(hotels, "caro").map((x) => x.id)).toEqual(["1"]);
    expect(filterHotels(hotels, "KISUMU").map((x) => x.id)).toEqual(["3"]);
    expect(filterHotels(hotels, "chai").map((x) => x.id)).toEqual(["2"]);
  });
  it("returns an empty list when nothing matches", () => expect(filterHotels(hotels, "zzz")).toEqual([]));
});

describe("groupMenu", () => {
  it("groups by category in API order and buckets blanks under Other", () => {
    const g = groupMenu([m({ id: "a", category: "Mains" }), m({ id: "b", category: "Drinks" }), m({ id: "c", category: "Mains" }), m({ id: "d", category: " " })]);
    expect(g.map((x) => x.category)).toEqual(["Mains", "Drinks", "Other"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("pickFeatured", () => {
  it("prefers hotels with a photo, then more reviews, then name — and never mutates the input", () => {
    const list = [h({ id: "1", name: "B" }), h({ id: "2", name: "A", image_url: "u", review_count: 1 }), h({ id: "3", name: "C", image_url: "u", review_count: 5 }), h({ id: "4", name: "D", image_url: "u", review_count: 5 })];
    expect(pickFeatured(list, 3).map((x) => x.id)).toEqual(["3", "4", "2"]);
    expect(list.map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
  });
});
