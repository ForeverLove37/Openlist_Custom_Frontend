// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClickRipple } from "./ClickRipple";

describe("ClickRipple", () => {
  it("creates a ripple at the pointer location and removes it after the animation", () => {
    render(<ClickRipple />);
    fireEvent.pointerDown(document.body, { button: 0, clientX: 120, clientY: 80 });

    const ripple = document.querySelector<HTMLElement>(".click-ripple");
    expect(ripple).toHaveStyle({ left: "120px", top: "80px" });
    fireEvent.animationEnd(ripple!);
    expect(document.querySelector(".click-ripple")).not.toBeInTheDocument();
  });
});
