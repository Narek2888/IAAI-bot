import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Auth from "./Auth";

describe("Auth Component", () => {
  const mockOnAuth = jest.fn();

  beforeEach(() => {
    mockOnAuth.mockClear();
    jest.resetAllMocks();
  });

  test("handles successful login", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            user: { id: 1, username: "testuser" },
            token: "test-token",
          }),
      })
    );

    render(<Auth onAuth={mockOnAuth} />);

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(mockOnAuth).toHaveBeenCalledWith({
        id: 1,
        username: "testuser",
      });
    });

    // Username is always sent lowercased
    expect(global.fetch).toHaveBeenCalled();
    const body = global.fetch.mock.calls[0]?.[1]?.body;
    expect(body).toContain('"username":"testuser"');

    expect(screen.queryByText("Sign in failed")).not.toBeInTheDocument();
  });

  test("handles failed login", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            msg: "Invalid credentials",
          }),
      })
    );

    render(<Auth onAuth={mockOnAuth} />);

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "wronguser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrongpassword" },
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(mockOnAuth).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  test("blocks registration when passwords do not match", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            user: { id: 1, username: "testuser" },
            token: "test-token",
          }),
      })
    );

    render(<Auth onAuth={mockOnAuth} />);

    fireEvent.click(screen.getByText("Register"));

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat Password"), {
      target: { value: "different" },
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(
        screen.getAllByText("Passwords do not match").length
      ).toBeGreaterThan(0);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockOnAuth).not.toHaveBeenCalled();
  });

  test("handles successful registration", async () => {
    global.fetch = jest.fn((url, options) => {
      if (String(url).includes("/api/auth/signup/request-otp")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, nonce: "nonce-1" }),
        });
      }

      if (String(url).includes("/api/auth/signup")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: 2, username: "testuser" },
              token: "test-token",
            }),
        });
      }

      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<Auth onAuth={mockOnAuth} />);

    fireEvent.click(screen.getByText("Register"));

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByText("Submit"));

    // First step should request OTP and open the modal (no onAuth yet)
    await waitFor(() => {
      expect(screen.getByText("Email verification")).toBeInTheDocument();
    });

    expect(mockOnAuth).not.toHaveBeenCalled();

    // Verify first request payload (no password)
    expect(global.fetch).toHaveBeenCalled();
    const [otpUrl, otpOptions] = global.fetch.mock.calls[0];
    expect(otpUrl).toContain("/api/auth/signup/request-otp");
    expect(otpOptions?.body).toContain('"username":"testuser"');
    expect(otpOptions?.body).toContain('"email":"test@example.com"');
    expect(otpOptions?.body).not.toContain('"password"');

    // OK disabled until OTP is entered
    const okBtn = screen.getByText("OK");
    expect(okBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("OTP"), {
      target: { value: "123456" },
    });

    await waitFor(() => {
      expect(screen.getByText("OK")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => {
      expect(mockOnAuth).toHaveBeenCalledWith({
        id: 2,
        username: "testuser",
      });
    });

    // Second request is signup with otp+nonce
    const [signupUrl, signupOptions] = global.fetch.mock.calls[1];
    expect(signupUrl).toContain("/api/auth/signup");
    expect(signupOptions?.body).toContain('"username":"testuser"');
    expect(signupOptions?.body).toContain('"email":"test@example.com"');
    expect(signupOptions?.body).toContain('"password":"password123"');
    expect(signupOptions?.body).toContain('"otp":"123456"');
    expect(signupOptions?.body).toContain('"nonce":"nonce-1"');
    expect(signupOptions?.body).not.toContain("confirmPassword");
  });

  test("handles forgot-password reset flow", async () => {
    global.fetch = jest.fn((url, options) => {
      if (String(url).includes("/api/auth/forgot-password/request-otp")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, nonce: "fp-nonce-1" }),
        });
      }

      if (String(url).includes("/api/auth/forgot-password/reset")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      }

      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    render(<Auth onAuth={mockOnAuth} />);

    fireEvent.click(screen.getByText("Forgot password?"));

    await waitFor(() => {
      expect(screen.getByText("Reset password")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Username or Email"), {
      target: { value: "testuser" },
    });

    fireEvent.click(screen.getByText("Send code"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("OTP")).toBeInTheDocument();
    });

    // Verify request payload
    const [reqUrl, reqOptions] = global.fetch.mock.calls[0];
    expect(reqUrl).toContain("/api/auth/forgot-password/request-otp");
    expect(reqOptions?.body).toContain('"usernameOrEmail":"testuser"');

    // OK stays disabled until OTP + matching passwords
    const okBtn = screen.getByText("OK");
    expect(okBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("OTP"), {
      target: { value: "123456" },
    });

    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "newpass123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat new password"), {
      target: { value: "newpass123" },
    });

    await waitFor(() => {
      expect(screen.getByText("OK")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => {
      expect(
        screen.getByText("Password reset successful. Please sign in.")
      ).toBeInTheDocument();
    });

    // Verify reset payload
    const [resetUrl, resetOptions] = global.fetch.mock.calls[1];
    expect(resetUrl).toContain("/api/auth/forgot-password/reset");
    expect(resetOptions?.body).toContain('"nonce":"fp-nonce-1"');
    expect(resetOptions?.body).toContain('"otp":"123456"');
    expect(resetOptions?.body).toContain('"newPassword":"newpass123"');
  });
});
