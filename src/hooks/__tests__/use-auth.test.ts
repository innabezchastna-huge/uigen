import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignInAction = vi.hoisted(() => vi.fn());
const mockSignUpAction = vi.hoisted(() => vi.fn());
vi.mock("@/actions", () => ({
  signIn: mockSignInAction,
  signUp: mockSignUpAction,
}));

const mockGetAnonWorkData = vi.hoisted(() => vi.fn());
const mockClearAnonWork = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: mockGetAnonWorkData,
  clearAnonWork: mockClearAnonWork,
}));

const mockGetProjects = vi.hoisted(() => vi.fn());
vi.mock("@/actions/get-projects", () => ({
  getProjects: mockGetProjects,
}));

const mockCreateProject = vi.hoisted(() => vi.fn());
vi.mock("@/actions/create-project", () => ({
  createProject: mockCreateProject,
}));

const { useAuth } = await import("@/hooks/use-auth");

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnonWorkData.mockReturnValue(null);
  });

  describe("signIn", () => {
    test("returns the result from the server action", async () => {
      mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });
      const { result } = renderHook(() => useAuth());

      let actionResult: unknown;
      await act(async () => {
        actionResult = await result.current.signIn("a@b.com", "pass");
      });

      expect(actionResult).toEqual({ success: false, error: "Invalid credentials" });
    });

    test("isLoading is false initially", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    test("isLoading is true during the call and false when it settles", async () => {
      let resolveSignIn!: (value: unknown) => void;
      mockSignInAction.mockReturnValue(new Promise((resolve) => { resolveSignIn = resolve; }));

      const { result } = renderHook(() => useAuth());

      act(() => {
        void result.current.signIn("a@b.com", "pass");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false });
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("on success with anon work, creates a project from that work and redirects", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "make a button" }],
        fileSystemData: { "/": {}, "/App.jsx": "export default () => <button />" },
      });
      mockCreateProject.mockResolvedValue({ id: "anon-proj-1" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "make a button" }],
          data: { "/": {}, "/App.jsx": "export default () => <button />" },
        })
      );
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockGetProjects).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-proj-1");
    });

    test("on success with anon work but no messages, falls through to normal flow", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-proj");
    });

    test("on success without anon work, redirects to the most recent project", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([{ id: "proj-recent" }, { id: "proj-older" }]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-recent");
    });

    test("on success with no existing projects, creates a new project and redirects", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "brand-new-proj" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockCreateProject).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/brand-new-proj");
    });

    test("on failure, does not redirect or create any project", async () => {
      mockSignInAction.mockResolvedValue({ success: false, error: "Wrong password" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("a@b.com", "wrong");
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockCreateProject).not.toHaveBeenCalled();
    });
  });

  describe("signUp", () => {
    test("returns the result from the server action", async () => {
      mockSignUpAction.mockResolvedValue({ success: false, error: "Email already taken" });
      const { result } = renderHook(() => useAuth());

      let actionResult: unknown;
      await act(async () => {
        actionResult = await result.current.signUp("a@b.com", "pass");
      });

      expect(actionResult).toEqual({ success: false, error: "Email already taken" });
    });

    test("on success, redirects to the most recent project", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([{ id: "proj-after-signup" }]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signUp("new@b.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-after-signup");
    });

    test("on success with no existing projects, creates a new project and redirects", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "signup-new-proj" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signUp("new@b.com", "pass");
      });

      expect(mockCreateProject).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/signup-new-proj");
    });

    test("on failure, does not redirect", async () => {
      mockSignUpAction.mockResolvedValue({ success: false, error: "Email already taken" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signUp("a@b.com", "pass");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
