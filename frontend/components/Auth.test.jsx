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
      target: { value: "testuser" },
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
});
