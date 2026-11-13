import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultMenuForHotel, ensureHotelMenuInitialized, DEFAULT_CATEGORY_SLUGS } from "../src/services/defaultMenuService";

describe("default menu catalogue bootstrap", () => {
  test("it clones the default catalogue into an empty hotel menu exactly once", async () => {
    let menuRowCount = 0;
    const inserted: Array<[string, string, string | null, string, string, boolean, string | null]> = [];
    const queries: string[] = [];
    const client = {
      async query(text: string, params?: unknown[]) {
        queries.push(text);

        if (text.startsWith("SELECT COUNT") && params?.[0] === "hotel-123") {
          return { rows: [{ count: menuRowCount }] };
        }

        if (text.includes("FROM default_menu_items") && text.includes("WHERE is_active = TRUE")) {
          return {
            rows: [
              { category: "breakfast", name: "Tea", description: "Hot Kenyan chai", price: "30.00", image_url: null },
              { category: "lunch", name: "Beans + Ugali", description: "Home-style beans, ugali", price: "120.00", image_url: null },
            ],
          };
        }

        if (text.includes("INSERT INTO menu_items")) {
          const [hotelId, name, description, price, category, available, imageUrl] = params as [string, string, string | null, string, string, boolean, string | null];
          inserted.push([hotelId, name, description, price, category, available, imageUrl]);
          menuRowCount += 1;
          return { rows: [] };
        }

        return { rows: [] };
      },
    } as any;

    const first = await cloneDefaultMenuForHotel("hotel-123", client);
    const second = await cloneDefaultMenuForHotel("hotel-123", client);

    assert.equal(first.cloned, 2);
    assert.equal(second.cloned, 0);
    assert.deepEqual(inserted.map(([_, name]) => name), ["Tea", "Beans + Ugali"]);
    assert.ok(queries.some((q) => q.includes("SELECT COUNT") && q.includes("hotel_id")));
  });

  test("it keeps a non-empty hotel menu untouched and supports lazy initialization", async () => {
    let countCalls = 0;
    const client = {
      async query(text: string, params?: unknown[]) {
        if (text.includes("SELECT COUNT") && params?.[0] === "hotel-456") {
          countCalls += 1;
          return { rows: [{ count: 1 }] };
        }
        if (text.includes("FROM default_menu_items") && text.includes("WHERE is_active = TRUE")) {
          return { rows: [{ category: "breakfast", name: "Tea", price: "30.00" }] };
        }
        return { rows: [] };
      },
    } as any;

    const result = await ensureHotelMenuInitialized("hotel-456", client);
    assert.equal(result.cloned, 0);
    assert.equal(countCalls, 1);
  });

  test("the central catalogue exposes the expected default category slugs", () => {
    assert.deepEqual(DEFAULT_CATEGORY_SLUGS, ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"]);
  });
});
