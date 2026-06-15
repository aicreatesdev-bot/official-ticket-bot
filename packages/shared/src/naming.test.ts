import { describe, expect, it } from "vitest";
import { renderTicketName } from "./naming.js";

describe("renderTicketName", () => {
  it("renders placeholders and pads count", () => {
    expect(
      renderTicketName("{category}-{username}-{count}", {
        ticketCategory: "General Support",
        username: "Satyam",
        count: 7
      })
    ).toBe("general-support-satyam-0007");
  });
});
