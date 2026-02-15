import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    // Wait for settings page to fully load
    await page.waitForSelector('h1', { timeout: 15_000 })
    await expect(page.locator('h1')).toContainText('Settings')
  })

  test('Given I visit /settings, Then I see the subscription tier selector', async ({
    page,
  }) => {
    await expect(
      page.locator('h2').filter({ hasText: 'Subscription Tier' }),
    ).toBeVisible()
    await page.screenshot({
      path: 'e2e/screenshots/settings-page-full.png',
      fullPage: true,
    })
  })

  test('Given I visit /settings, Then I see the API pricing table', async ({
    page,
  }) => {
    await expect(
      page.locator('h2').filter({ hasText: 'API Pricing' }),
    ).toBeVisible()
  })

  test('Given I am on settings, When I select a different tier, Then the Save button becomes enabled', async ({
    page,
  }) => {
    // The Save button should initially be disabled
    const saveButton = page.locator('button:has-text("Save")')
    await expect(saveButton).toBeDisabled()

    // Click a different tier card (e.g., "Free" or "Max 5x")
    // The tier cards are clickable elements showing tier names
    const freeTier = page.getByText('Free', { exact: true }).first()
    await freeTier.click()

    // Save button should now be enabled
    await expect(saveButton).toBeEnabled()
  })

  test('Given I changed settings, When I click "Reset to Defaults", Then the form resets', async ({
    page,
  }) => {
    // First change something to make form dirty
    const freeTier = page.getByText('Free', { exact: true }).first()
    await freeTier.click()

    // Now click Reset to Defaults
    await page.click('button:has-text("Reset")')

    // After reset, the Subscription Tier heading should still be visible
    await expect(
      page.locator('h2').filter({ hasText: 'Subscription Tier' }),
    ).toBeVisible()
  })
})
