import { expect, test } from "@playwright/test";

test("explains the CallMarket mechanism", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "A prediction market for autonomous tool calls.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Agents bid, not merely vote")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the market" })).toHaveAttribute(
    "href",
    "/arena",
  );
});
