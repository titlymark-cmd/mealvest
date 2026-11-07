import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useRoleBack, fallbackPathForRole } from "./useRoleBack";

let mockRole: string | undefined = "hotel_staff";
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: mockRole ? { role: mockRole } : null }) }));

function Back() {
  const back = useRoleBack();
  const loc = useLocation();
  return (
    <div>
      <span data-testid="at">{loc.pathname}</span>
      <button onClick={back}>back</button>
    </div>
  );
}
const Page = ({ id }: { id: string }) => <div><span>{id}</span><Link to="/scanner">go</Link></div>;

const tree = (initial: string[]) => (
  <MemoryRouter initialEntries={initial}>
    <Routes>
      <Route path="/scanner" element={<Back />} />
      <Route path="/from" element={<Page id="FROM" />} />
      <Route path="/hotel-staff/home" element={<span>STAFF HOME</span>} />
      <Route path="/hotel-owner/home" element={<span>OWNER HOME</span>} />
      <Route path="/student/home" element={<span>STUDENT HOME</span>} />
      <Route path="/admin/home" element={<span>ADMIN HOME</span>} />
    </Routes>
  </MemoryRouter>
);

describe("useRoleBack", () => {
  beforeEach(() => { mockRole = "hotel_staff"; });

  test("opened directly (notification / refresh / bookmark): goes to the role's own home, never out of the app", async () => {
    render(tree(["/scanner"]));
    await userEvent.click(screen.getByText("back"));
    expect(screen.getByText("STAFF HOME")).toBeInTheDocument();
  });

  test.each([["hotel_owner", "OWNER HOME"], ["student", "STUDENT HOME"], ["mealvest_admin", "ADMIN HOME"]])("%s lands on %s", async (role, text) => {
    mockRole = role;
    render(tree(["/scanner"]));
    await userEvent.click(screen.getByText("back"));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test("with in-app history it goes back one step like a normal back button", async () => {
    render(tree(["/from"]));
    await userEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("at")).toHaveTextContent("/scanner");
    await userEvent.click(screen.getByText("back"));
    expect(screen.getByText("FROM")).toBeInTheDocument();
  });

  test("fallback paths", () => {
    expect(fallbackPathForRole("hotel_owner")).toBe("/hotel-owner/home");
    expect(fallbackPathForRole("hotel_staff")).toBe("/hotel-staff/home");
    expect(fallbackPathForRole("mealvest_admin")).toBe("/admin/home");
    expect(fallbackPathForRole("student")).toBe("/student/home");
    expect(fallbackPathForRole(undefined)).toBe("/student/home");
  });
});
