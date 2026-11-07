import { renderHook, act, waitFor } from "@testing-library/react";
import { usePushControl } from "./usePushControl";

const mockSvc = {
  getPushAvailability: jest.fn(),
  describeAvailability: jest.fn(),
  isEnabledOnThisDevice: jest.fn(),
  enablePush: jest.fn(),
  disablePushOnThisDevice: jest.fn(),
};
const mockApi = { updatePreferences: jest.fn() };
// the real authFetch is memoised (useCallback) — keep the stand-in stable too, or every render looks like a new dependency
const mockStableFetch = jest.fn();
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ authFetch: mockStableFetch }) }));
jest.mock("../services/pushNotifications", () => ({
  getPushAvailability: (...a: unknown[]) => mockSvc.getPushAvailability(...a),
  describeAvailability: (...a: unknown[]) => mockSvc.describeAvailability(...a),
  isEnabledOnThisDevice: (...a: unknown[]) => mockSvc.isEnabledOnThisDevice(...a),
  enablePush: (...a: unknown[]) => mockSvc.enablePush(...a),
  disablePushOnThisDevice: (...a: unknown[]) => mockSvc.disablePushOnThisDevice(...a),
}));
jest.mock("../services/notificationsApi", () => ({ updatePreferences: (...a: unknown[]) => mockApi.updatePreferences(...a) }));

beforeEach(() => {
  Object.values(mockSvc).forEach((f) => f.mockReset());
  mockApi.updatePreferences.mockReset().mockResolvedValue({});
  mockSvc.describeAvailability.mockReturnValue(null);
  mockSvc.getPushAvailability.mockReturnValue({ state: "ready", permission: "default" });
  mockSvc.isEnabledOnThisDevice.mockResolvedValue(false);
});

describe("usePushControl", () => {
  test("starts 'checking', then reflects whether THIS device is really registered", async () => {
    mockSvc.isEnabledOnThisDevice.mockResolvedValue(true);
    const { result } = renderHook(() => usePushControl());
    expect(result.current.status).toBe("checking");
    await waitFor(() => expect(result.current.status).toBe("on"));
  });

  test.each([
    [{ state: "denied" }, "blocked"],
    [{ state: "ios_install_required" }, "unavailable"],
    [{ state: "unsupported" }, "unavailable"],
    [{ state: "not_configured" }, "unavailable"],
  ])("availability %j → %s (and the device registry isn't even queried)", async (availability, expected) => {
    mockSvc.getPushAvailability.mockReturnValue(availability);
    mockSvc.describeAvailability.mockReturnValue("explain");
    const { result } = renderHook(() => usePushControl());
    await waitFor(() => expect(result.current.status).toBe(expected));
    expect(result.current.explanation).toBe("explain");
    expect(mockSvc.isEnabledOnThisDevice).not.toHaveBeenCalled();
  });

  test("turnOn success: registers, opts the account in, and shows 'on'", async () => {
    mockSvc.enablePush.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => usePushControl());
    await waitFor(() => expect(result.current.status).toBe("off"));
    await act(async () => { await result.current.turnOn(); });
    expect(mockApi.updatePreferences).toHaveBeenCalledWith(expect.anything(), { pushEnabled: true });
    expect(result.current.status).toBe("on");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  test("turnOn refused: stays off, shows the reason, does NOT flip the account preference", async () => {
    mockSvc.enablePush.mockResolvedValue({ ok: false, reason: "permission_denied", message: "Notifications are blocked." });
    const { result } = renderHook(() => usePushControl());
    await waitFor(() => expect(result.current.status).toBe("off"));
    mockSvc.getPushAvailability.mockReturnValue({ state: "denied" });
    await act(async () => { await result.current.turnOn(); });
    expect(result.current.error).toBe("Notifications are blocked.");
    expect(mockApi.updatePreferences).not.toHaveBeenCalled();
    expect(result.current.status).toBe("blocked");
  });

  test("turnOff unregisters this device; failure is reported and the state stays truthful", async () => {
    mockSvc.isEnabledOnThisDevice.mockResolvedValue(true);
    mockSvc.disablePushOnThisDevice.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePushControl());
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => { await result.current.turnOff(); });
    expect(result.current.status).toBe("off");

    mockSvc.isEnabledOnThisDevice.mockResolvedValue(true);
    mockSvc.disablePushOnThisDevice.mockRejectedValue(new Error("network down"));
    const again = renderHook(() => usePushControl());
    await waitFor(() => expect(again.result.current.status).toBe("on"));
    await act(async () => { await again.result.current.turnOff(); });
    expect(again.result.current.error).toBe("network down");
    expect(again.result.current.status).toBe("on");
  });
});
