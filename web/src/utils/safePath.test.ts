import { isSafeInAppPath } from "./safePath";

describe("isSafeInAppPath", () => {
  test.each(["/", "/student/home", "/hotel-staff/orders?x=1#top", "/verify-email"])("accepts %s", (p) => expect(isSafeInAppPath(p)).toBe(true));
  test.each(["", "student/home", "//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "/a b", "/a\nb", undefined, null, 5])(
    "rejects %p",
    (p) => expect(isSafeInAppPath(p as unknown)).toBe(false)
  );
});
